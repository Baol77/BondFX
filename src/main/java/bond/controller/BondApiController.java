package bond.controller;

import bond.config.CouponFrequencyConfig;
import bond.config.TaxRateConfig;
import bond.model.Bond;
import bond.service.BondService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * REST API controller consumed by the Portfolio Analyzer frontend.
 * <p>
 * Endpoints:
 *   GET /api/bond/{isin}       → live data for a single bond (price, SAY, currentYield, FX-adjusted)
 *   GET /api/bonds/search?q=   → search bonds by ISIN or issuer
 * <p>
 * All calculations (SAY, currentYield, finalCapital) are done in Java using
 * the same BondScoreEngine + FxService as the main page — always fresh.
 */
@RestController
@RequestMapping("/api")
public class BondApiController {

    @Autowired
    private BondService bondService;

    private static final CouponFrequencyConfig FREQ_CONFIG = CouponFrequencyConfig.load();
    private static final TaxRateConfig TAX_CONFIG = TaxRateConfig.load();

    /**
     * Returns live data for a single bond by ISIN.
     * Used by Portfolio Analyzer when:
     * - User imports a CSV (refresh all bond data)
     * - User adds a bond that was not visible in the current filtered table
     *
     * Response: 200 with bond JSON, or 404 if ISIN not found in today's scrape.
     */
    @GetMapping("/bond/{isin}")
    public ResponseEntity<Map<String, Object>> getBond(@PathVariable String isin) {
        try {
            return bondService.findByIsin(isin)
                .map(b -> ResponseEntity.ok(toMap(b)))
                .orElse(ResponseEntity.notFound().build());
        } catch (Exception e) {
            return ResponseEntity.internalServerError()
                .body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Search bonds by ISIN or issuer name (partial, case-insensitive).
     * Used by Portfolio Analyzer search box — replaces DOM-based search.
     *
     * Response: 200 with array of matching bonds (max 20).
     */
    @GetMapping("/bonds/search")
    public ResponseEntity<List<Map<String, Object>>> searchBonds(
            @RequestParam(defaultValue = "") String q) {
        try {
            List<Bond> results = bondService.search(q);
            List<Map<String, Object>> response = results.stream()
                .map(this::toMap)
                .toList();
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Maps a Bond domain object to a JSON-serializable map.
     * Field names match what portfolio-analyzer.js expects.
     */
    private Map<String, Object> toMap(Bond b) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("isin",         b.getIsin());
        m.put("issuer",       b.getIssuer());
        m.put("price",        round2(b.getPrice()));
        m.put("currency",     b.getCurrency());
        m.put("rating",       b.getRating());
        m.put("priceEur",     round2(b.getPriceEur()));
        m.put("coupon",       round2(b.getCouponPct()));
        m.put("maturity",     b.getMaturity().toString());
        m.put("currentYield", round2(b.getCurrentYield()));
        m.put("capitalAtMat", Math.round(b.getFinalCapitalToMat()));
        m.put("say",          round2(b.getSimpleAnnualYield()));
        m.put("couponFrequency", FREQ_CONFIG.paymentsPerYear(b.getIsin()));
        m.put("taxRate",        TAX_CONFIG.rateFor(b.getIsin(), b.getIssuer()));
        return m;
    }

    private double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }
}
