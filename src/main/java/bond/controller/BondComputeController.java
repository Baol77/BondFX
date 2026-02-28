package bond.controller;

import bond.fx.FxService;
import bond.fx.FxService.FxPhase;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * Stateless computation endpoint: applies BondScoreEngine + FxService logic
 * to user-supplied bond parameters (which may differ from the scraped data —
 * e.g. custom taxRate, priceShift, quantity).
 *
 * <p>This is the single authoritative place where SAY, finalCapital, bondNbr,
 * capCoupons, capGain and FX multipliers are computed for the frontend.
 * The JS Capital Growth Simulator and Portfolio Analyzer must NOT replicate
 * this logic — they must call this endpoint instead.
 *
 * <pre>
 * POST /api/bonds/compute
 * Content-Type: application/json
 *
 * Request body: array of BondComputeRequest objects
 * [
 *   {
 *     "isin":           "IT0005441883",   // for cache key only
 *     "price":          98.50,            // bond price in native currency (e.g. EUR or USD)
 *     "priceEur":       98.50,            // price converted to EUR (= price if EUR bond)
 *     "coupon":         3.50,             // gross annual coupon % (e.g. 3.50 = 3.50%)
 *     "taxRate":        12.50,            // withholding tax % (e.g. 12.50)
 *     "maturity":       "2035-06-15",     // ISO date
 *     "currency":       "EUR",            // bond native currency
 *     "quantity":       95.20,            // units held (for totalCoupons / totalFace)
 *     "reportCurrency": "EUR",            // investor display currency
 *     "priceShiftPct":  0.0              // optional: % shift on price for reinvest scenarios
 *                                        // (e.g. +5 = buy 5% above current price)
 *   },
 *   ...
 * ]
 *
 * Response: array of BondComputeResult objects (same order as input)
 * [
 *   {
 *     "isin":        "IT0005441883",
 *     "say":         2.14,          // net SAY % (after taxRate, after FX haircut)
 *     "finalCapital": 1089.40,      // final capital per 1000 EUR invested
 *     "bondNbr":     10.15,         // units bought with 1000 EUR
 *     "capCoupons":  89.40,         // total net coupon income per 1000 EUR
 *     "capGain":     1000.00,       // redemption value per 1000 EUR
 *     "totalCoupons": 854.77,       // capCoupons scaled to actual quantity × priceEur
 *     "totalFace":    9521.40,      // face redemption scaled to actual quantity
 *     "fxBuy":       1.0,           // FX multiplier at purchase
 *     "fxCoupon":    1.0,           // FX multiplier for coupon income
 *     "fxFuture":    1.0,           // FX multiplier at maturity
 *     "yearsToMat":  9.30           // years to maturity (fractional)
 *   },
 *   ...
 * ]
 * </pre>
 *
 * <p><b>Cache:</b> results are cached in-process keyed by
 * (isin, price, coupon, taxRate, maturity, currency, reportCurrency, priceShiftPct).
 * Cache is invalidated after bondfx.cache.fx-multiplier-ttl-hours (default 1h) to pick up
 * intraday ECB rate changes. Quantity is NOT part of the cache key — totalCoupons/totalFace
 * are computed from the cached per-1000-EUR values scaled by quantity on the fly.
 */
@RestController
@RequestMapping("/api")
public class BondComputeController {

    // ── Request / Response records ────────────────────────────────────────────

    public record BondComputeRequest(
        String isin,
        double price,
        double priceEur,
        double coupon,          // gross annual coupon %
        double taxRate,         // withholding tax %
        String maturity,        // ISO date "YYYY-MM-DD"
        String currency,
        double quantity,
        String reportCurrency,
        double priceShiftPct    // optional, default 0
    ) {}

    public record BondComputeResult(
        String isin,
        double say,
        double finalCapital,
        double bondNbr,
        double capCoupons,
        double capGain,
        double totalCoupons,
        double totalFace,
        double fxBuy,
        double fxCoupon,
        double fxFuture,
        double yearsToMat,
        double nomEur       // face value per unit in report currency (100 / fxBuy for non-EUR)
    ) {}

    // ── Cache ─────────────────────────────────────────────────────────────────

    private record CacheEntry(BondComputeResult result, long cachedAtMs) {
        static final long TTL_MS = 3_600_000L; // 1 hour
        boolean isExpired() { return System.currentTimeMillis() - cachedAtMs > TTL_MS; }
    }

    private final Map<String, CacheEntry> cache = new java.util.concurrent.ConcurrentHashMap<>();

    private String cacheKey(BondComputeRequest r) {
        return r.isin() + "|" + r.price() + "|" + r.coupon() + "|" + r.taxRate()
            + "|" + r.maturity() + "|" + r.currency() + "|" + r.reportCurrency()
            + "|" + r.priceShiftPct();
    }

    // ── Endpoint ──────────────────────────────────────────────────────────────

    @PostMapping("/bonds/compute")
    public ResponseEntity<List<BondComputeResult>> compute(
            @RequestBody List<BondComputeRequest> requests) {

        List<BondComputeResult> results = new ArrayList<>(requests.size());
        for (BondComputeRequest req : requests) {
            results.add(computeOne(req));
        }
        return ResponseEntity.ok(results);
    }

    // ── Core computation ──────────────────────────────────────────────────────

    private BondComputeResult computeOne(BondComputeRequest req) {

        // Check cache (quantity excluded from key — scaled on the fly)
        String key = cacheKey(req);
        CacheEntry cached = cache.get(key);
        if (cached != null && !cached.isExpired()) {
            return scaleByQuantity(cached.result(), req.quantity(), req.priceEur());
        }

        // ── 1. Time to maturity ───────────────────────────────────────────────
        LocalDate matDate;
        try {
            matDate = LocalDate.parse(req.maturity().substring(0, 10));
        } catch (Exception e) {
            return fallback(req);
        }
        long days = ChronoUnit.DAYS.between(LocalDate.now(), matDate);
        double years = Math.max(0.01, days / 365.25);
        int roundYears = Math.max(1, (int) Math.round(years));

        // ── 2. Price with optional shift ──────────────────────────────────────
        double adjFactor  = 1.0 + req.priceShiftPct() / 100.0;
        adjFactor = Math.max(0.01, adjFactor);
        double adjPrice    = Math.max(0.001, req.price()    * adjFactor);
        double adjPriceEur = Math.max(0.001, req.priceEur() * adjFactor);

        // ── 3. FX multipliers (via FxService — single source of truth) ────────
        // FxPhase is intentionally used here: fxBuy/fxCoupon/fxFuture are scalar
        // inputs to the SAY display in the portfolio analyzer, where T/2 as a
        // coupon-duration proxy is a reasonable approximation for a single-value indicator.
        // For multi-year simulation, the Capital Growth engine uses POST /api/fx-curve
        // with per-horizon discounting instead.
        String ccy    = (req.currency() == null || req.currency().isBlank()) ? "EUR" : req.currency().toUpperCase();
        String report = (req.reportCurrency() == null || req.reportCurrency().isBlank()) ? "EUR" : req.reportCurrency().toUpperCase();

        double fxBuy, fxCoupon, fxFuture;
        try {
            fxBuy    = FxService.fxExpectedMultiplier(ccy, report, FxPhase.BUY,      roundYears);
            fxCoupon = FxService.fxExpectedMultiplier(ccy, report, FxPhase.COUPON,   roundYears);
            fxFuture = FxService.fxExpectedMultiplier(ccy, report, FxPhase.MATURITY, roundYears);
        } catch (Exception e) {
            fxBuy = fxCoupon = fxFuture = 1.0;
        }

        // ── 4. BondScoreEngine formula (net of tax) ───────────────────────────
        // Investment basis: 1000 report-currency units
        // bondNbr: units bought with 1000 / (fxBuy × adjPrice)
        double bondNbr = 1000.0 / (fxBuy * adjPrice);

        // Net annual coupon per unit (gross coupon % → decimal → net of withholding tax)
        double couponNet = (req.coupon() / 100.0) * (1.0 - req.taxRate() / 100.0);

        // Total net coupons converted to report currency at mid-horizon FX
        double capCoupons = bondNbr * couponNet * 100.0 * Math.ceil(years) * fxCoupon;
        //                                        ↑ ×100: couponNet is per 1 unit of face=100

        // Redemption at par (100) converted to report currency
        double capGain = 100.0 * bondNbr * fxFuture;

        double finalCapital = capCoupons + capGain;

        // SAY % = (finalCapital − 1000) / (10 × years)  [BondScoreEngine formula]
        double say = (finalCapital - 1000.0) / (10.0 * years);

        // ── 5. Build per-1000-EUR result (quantity-independent) ───────────────
        // nomEur: face value of 1 unit in report currency = 100 EUR-equivalent / fxBuy
        // For EUR bonds: nomEur = 100. For USD bonds at 0.92 fxBuy: nomEur = 100/0.92 ≈ 108.7
        // Used by JS subrows to keep coupon/redemption consistent with the simulation engine.
        double nomEur = (fxBuy > 0) ? round4(100.0 / fxBuy) : 100.0;

        BondComputeResult base = new BondComputeResult(
            req.isin(),
            round4(say),
            round4(finalCapital),
            round4(bondNbr),
            round4(capCoupons),
            round4(capGain),
            0.0, 0.0,   // totalCoupons / totalFace: filled by scaleByQuantity
            round4(fxBuy),
            round4(fxCoupon),
            round4(fxFuture),
            round4(years),
            nomEur
        );

        cache.put(key, new CacheEntry(base, System.currentTimeMillis()));
        return scaleByQuantity(base, req.quantity(), adjPriceEur);
    }

    /**
     * Scales per-1000-EUR bond metrics to the actual quantity held.
     *
     * totalCoupons: coupon cash per unit × quantity (in report currency).
     * totalFace:    face value at par (100) × quantity (in report currency).
     *
     * We derive fxBuy from the cached result and use priceEur to compute the
     * actual investment basis, then scale proportionally.
     */
    private BondComputeResult scaleByQuantity(BondComputeResult base,
                                               double quantity,
                                               double adjPriceEur) {
        // actual investment in report currency = priceEur × quantity × fxBuy
        // per-unit values from base are already in report currency (per 1000 EUR invested)
        // scale factor = (priceEur × quantity × fxBuy) / 1000
        double investedEur  = adjPriceEur * quantity;          // EUR invested
        double scaleFactor  = investedEur / 1000.0;

        double totalCoupons = round2(base.capCoupons() * scaleFactor);
        double totalFace    = round2(base.capGain()    * scaleFactor);

        return new BondComputeResult(
            base.isin(),
            base.say(),
            base.finalCapital(),
            base.bondNbr(),
            base.capCoupons(),
            base.capGain(),
            totalCoupons,
            totalFace,
            base.fxBuy(),
            base.fxCoupon(),
            base.fxFuture(),
            base.yearsToMat(),
            base.nomEur()
        );
    }

    /** Evict all cached entries (e.g. after an ECB rate refresh). */
    @PostMapping("/bonds/compute/refresh")
    public ResponseEntity<Void> refresh() {
        cache.clear();
        return ResponseEntity.ok().build();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private BondComputeResult fallback(BondComputeRequest req) {
        return new BondComputeResult(
            req.isin(), 0, 0, 0, 0, 0, 0, 0, 1.0, 1.0, 1.0, 0, 100.0
        );
    }

    private double round4(double v) { return Math.round(v * 10_000.0) / 10_000.0; }
    private double round2(double v) { return Math.round(v * 100.0) / 100.0; }
}
