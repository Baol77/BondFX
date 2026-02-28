package bond.controller;

import bond.fx.FxService;
import bond.fx.FxService.FxPhase;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * REST endpoint for FX multipliers used by the Capital Growth Simulator JS.
 *
 * <p>GET /api/fx-multipliers?currency=AUD&years=11&reportCurrency=EUR
 * <pre>
 * Response: {
 *   "fxBuy":     0.6017,   // SPOT, no haircut (immediate transaction)
 *   "fxCoupon":  0.4371,   // SPOT × (1 − OU coupon haircut at T/2)
 *   "fxFuture":  0.4187,   // SPOT × (1 − OU capital haircut at T)
 *   "ttlSeconds": 3600
 * }
 * </pre>
 *
 * <p>Cache key: (currency, reportCurrency, years). ECB rates refresh per bondfx.cache.fx-ttl-hours.
 * This endpoint's own cache TTL is configurable via bondfx.cache.fx-multiplier-ttl-hours
 * (default: 1 hour — short enough to pick up intraday rate moves).
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
     * Returns FX multipliers (BUY / COUPON / MATURITY) for a given currency pair and horizon.
     *
     * @param currency       Bond currency (e.g. "AUD"). Required. Case-insensitive.
     * @param years          Years to maturity. Required. Must be > 0.
     * @param reportCurrency Investor's report currency (default "EUR").
     */
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

            return ResponseEntity.ok(toResponseMap(entry));
        } catch (Exception e) {
            // Fallback: return spot-only (no haircut) on any FX fetch error
            return ResponseEntity.ok(multiplierMap(1.0, 1.0, 1.0));
        }
    }

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
