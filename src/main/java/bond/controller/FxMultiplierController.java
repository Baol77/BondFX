package bond.controller;

import bond.fx.FxService;
import bond.fx.FxService.FxPhase;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * FX multiplier REST endpoints.
 *
 * <h2>Active endpoint</h2>
 * <p><b>POST /api/fx-curve</b> — batch OU-adjusted multipliers, one per cash-flow horizon.
 * This is the mathematically correct model: every cash flow gets its own FX discount
 * at its exact horizon T, with no phase abstraction.
 * Used by the Capital Growth Simulator for year-by-year coupon and redemption discounting.
 *
 * <h2>Deprecated endpoint</h2>
 * <p><b>GET /api/fx-multipliers</b> — scalar BUY/COUPON/MATURITY triplet for a single years-to-maturity.
 * Still consumed by {@code BondComputeController} to populate the {@code fxBuy/fxCoupon/fxFuture}
 * fields in {@code /api/bonds/compute} responses, where they feed the SAY display in the
 * portfolio analyzer (a scalar indicator that legitimately uses T/2 as a coupon-duration proxy).
 * <p><b>Do not use for multi-year simulation.</b> Use {@code /api/fx-curve} instead.
 *
 * <p>Cache TTL: configurable via {@code bondfx.cache.fx-multiplier-ttl-hours} (default 1h).
 */
@RestController
@RequestMapping("/api")
public class FxMultiplierController {

    /** Cache TTL in hours for fx-multiplier responses. 0 = never expire. Default: 1h. */
    @Value("${bondfx.cache.fx-multiplier-ttl-hours:1}")
    private long ttlHours;

    /** Simple in-memory cache: key → {fxBuy, fxCoupon, fxFuture, cachedAtMs} */
    private final Map<String, CachedMultiplier> cache = new ConcurrentHashMap<>();

    private record CachedMultiplier(double fxBuy, double fxCoupon, double fxFuture, long cachedAtMs) {
        boolean isExpired(long ttlHours) {
            if (ttlHours == 0) return false;
            return System.currentTimeMillis() - cachedAtMs > ttlHours * 3_600_000L;
        }
    }

    /**
     * Returns scalar FX multipliers (BUY / COUPON / MATURITY) for a single years-to-maturity.
     *
     * <p><b>Deprecated for simulation use.</b> The COUPON multiplier uses T/2 as a
     * duration-weighted approximation — acceptable for the SAY scalar display in the
     * portfolio analyzer, but incorrect for multi-year simulation where each coupon
     * at year t should be discounted at its exact horizon t. Use {@code POST /api/fx-curve}
     * for simulation.
     *
     * @param currency       Bond currency (e.g. "AUD"). Required. Case-insensitive.
     * @param years          Years to maturity. Required. Must be > 0.
     * @param reportCurrency Investor's report currency (default "EUR").
     * @deprecated For simulation use {@code POST /api/fx-curve} instead.
     */
    @Deprecated
    @GetMapping("/fx-multipliers")
    public ResponseEntity<Map<String, Object>> getFxMultipliers(
            @RequestParam String currency,
            @RequestParam int years,
            @RequestParam(defaultValue = "EUR") String reportCurrency) {

        currency       = currency.toUpperCase();
        reportCurrency = reportCurrency.toUpperCase();

        // Same currency → all multipliers = 1
        if (currency.equals(reportCurrency)) {
            return ResponseEntity.ok(multiplierMap(1.0, 1.0, 1.0));
        }

        if (years <= 0) years = 1;

        final String cacheKey = currency + "_" + reportCurrency + "_" + years;
        CachedMultiplier cached = cache.get(cacheKey);
        if (cached != null && !cached.isExpired(ttlHours)) {
            return ResponseEntity.ok(toResponseMap(cached));
        }

        try {
            double fxBuy    = FxService.fxExpectedMultiplier(currency, reportCurrency, FxPhase.BUY,      years);
            double fxCoupon = FxService.fxExpectedMultiplier(currency, reportCurrency, FxPhase.COUPON,   years);
            double fxFuture = FxService.fxExpectedMultiplier(currency, reportCurrency, FxPhase.MATURITY, years);

            CachedMultiplier entry = new CachedMultiplier(fxBuy, fxCoupon, fxFuture, System.currentTimeMillis());
            cache.put(cacheKey, entry);

            return ResponseEntity.ok()
                .header("Deprecation", "true")
                .header("Link", "</api/fx-curve>; rel=\"successor-version\"")
                .body(toResponseMap(entry));
        } catch (Exception e) {
            // Fallback: return spot-only (no haircut) on any FX fetch error
            return ResponseEntity.ok()
                .header("Deprecation", "true")
                .header("Link", "</api/fx-curve>; rel=\"successor-version\"")
                .body(multiplierMap(1.0, 1.0, 1.0));
        }
    }

    // ── Batch endpoint ─────────────────────────────────────────────────────────

    /**
     * Batch FX-curve endpoint for the Capital Growth Simulator.
     *
     * <p>Returns one OU-adjusted multiplier per requested horizon so that
     * each cash flow (coupon at year t, redemption at maturity) gets its own
     * time-correct FX discount — without any interpolation on the frontend.
     *
     * <p>POST /api/fx-curve
     * <pre>
     * Request:  { "currency": "USD", "reportCurrency": "EUR", "horizons": [0,1,2,3,24] }
     * Response: { "0": 0.9261, "1": 0.9183, "2": 0.9097, "3": 0.9008, "24": 0.6512 }
     * </pre>
     *
     * <p>horizon = 0 → spot rate (no haircut).
     * <p>horizon = t → spot × (1 − OU haircut at T=t).
     *
     * <p>Each result is cached individually per (currency, reportCurrency, horizon)
     * so overlapping or repeated requests are served from cache.
     */
    @PostMapping("/fx-curve")
    public ResponseEntity<Map<String, Double>> getFxCurve(
            @RequestBody FxCurveRequest req) {

        String ccy    = (req.currency()       != null ? req.currency()       : "EUR").toUpperCase();
        String report = (req.reportCurrency() != null ? req.reportCurrency() : "EUR").toUpperCase();
        int[]  horizons = req.horizons() != null ? req.horizons() : new int[]{0};

        Map<String, Double> result = new java.util.LinkedHashMap<>();

        for (int h : horizons) {
            int    horizon = Math.max(0, h);
            String key     = ccy + "_" + report + "_h" + horizon;

            CachedMultiplier cached = cache.get(key);
            if (cached != null && !cached.isExpired(ttlHours)) {
                result.put(String.valueOf(horizon), round4(cached.fxBuy()));
                continue;
            }

            double multiplier;
            try {
                multiplier = FxService.fxExpectedMultiplier(ccy, report, (double) horizon);
            } catch (Exception e) {
                multiplier = 1.0; // fallback: no FX adjustment
            }

            // Reuse CachedMultiplier.fxBuy as single-value slot for curve entries
            cache.put(key, new CachedMultiplier(multiplier, multiplier, multiplier,
                System.currentTimeMillis()));
            result.put(String.valueOf(horizon), round4(multiplier));
        }

        return ResponseEntity.ok(result);
    }

    /** Request body for POST /api/fx-curve. */
    public record FxCurveRequest(String currency, String reportCurrency, int[] horizons) {}

    // ── Cache refresh ──────────────────────────────────────────────────────────

    /** Evicts all cached entries (useful after an ECB rate refresh). */
    @PostMapping("/fx-multipliers/refresh")
    public ResponseEntity<Void> refresh() {
        cache.clear();
        return ResponseEntity.ok().build();
    }

    // ── helpers ────────────────────────────────────────────────────────────────

    private Map<String, Object> toResponseMap(CachedMultiplier c) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("fxBuy",      round4(c.fxBuy()));
        m.put("fxCoupon",   round4(c.fxCoupon()));
        m.put("fxFuture",   round4(c.fxFuture()));
        m.put("ttlSeconds", ttlHours * 3600L);
        return m;
    }

    private Map<String, Object> multiplierMap(double buy, double coupon, double future) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("fxBuy",     buy);
        m.put("fxCoupon",  coupon);
        m.put("fxFuture",  future);
        m.put("ttlSeconds", ttlHours * 3600L);
        return m;
    }

    private double round4(double v) {
        return Math.round(v * 10_000.0) / 10_000.0;
    }
}
