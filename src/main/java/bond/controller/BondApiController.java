package bond.controller;

import bond.config.CouponFrequencyConfig;
import bond.config.TaxRateConfig;
import bond.model.Bond;
import bond.service.BondService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

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
     * Returns current ECB FX rates (EUR-based).
     * Used by frontend to convert EUR amounts to user's base currency.
     * Response: { "EUR":1.0, "CHF":0.93, "USD":1.08, "GBP":0.86, ... }
     */
    @GetMapping("/fx-rates")
    public ResponseEntity<Map<String, Double>> getFxRates() {
        try {
            Map<String, Double> rates = bond.fx.FxService.getInstance().loadFxRates();
            // Return only the currencies supported as base currencies + common ones
            Map<String, Double> subset = new java.util.LinkedHashMap<>();
            for (String ccy : List.of("EUR","CHF","USD","GBP","JPY","CAD","AUD","NOK","SEK","PLN","RON","HUF","CZK","TRY")) {
                if (rates.containsKey(ccy)) subset.put(ccy, rates.get(ccy));
            }
            subset.put("EUR", 1.0);
            return ResponseEntity.ok(subset);
        } catch (Exception e) {
            return ResponseEntity.ok(Map.of("EUR", 1.0));
        }
    }

    /**
     * Proxy for Yahoo Finance historical data — avoids browser CORS restriction.
     *
     * GET /api/benchmark?symbol=^GSPC&range=10y
     *
     * Strategy:
     *  1. Try v8 API (monthly, adjusted close).
     *  2. On 4xx/5xx fall back to v7 (CSV → not used here, so just report error).
     *  Returns raw Yahoo Finance JSON.
     */
    @GetMapping("/benchmark")
    public ResponseEntity<String> getBenchmark(
            @RequestParam String symbol,
            @RequestParam(defaultValue = "10y") String range) {

        final String UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

        String[] endpoints = {
            "https://query1.finance.yahoo.com/v8/finance/chart/"
                + java.net.URLEncoder.encode(symbol, StandardCharsets.UTF_8)
                + "?interval=1mo&range=" + range + "&includeAdjustedClose=true",
            "https://query2.finance.yahoo.com/v8/finance/chart/"
                + java.net.URLEncoder.encode(symbol, StandardCharsets.UTF_8)
                + "?interval=1mo&range=" + range + "&includeAdjustedClose=true",
        };

        for (String urlStr : endpoints) {
            try {
                HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(12000);
                conn.setInstanceFollowRedirects(true);
                conn.setRequestProperty("User-Agent", UA);
                conn.setRequestProperty("Accept", "application/json, */*");
                conn.setRequestProperty("Accept-Language", "en-US,en;q=0.9");
                conn.setRequestProperty("Referer", "https://finance.yahoo.com/");

                int status = conn.getResponseCode();
                InputStream is = (status >= 200 && status < 300)
                    ? conn.getInputStream() : conn.getErrorStream();
                String body = (is != null) ? new String(is.readAllBytes(), StandardCharsets.UTF_8) : "{}";
                conn.disconnect();

                if (status == 200) {
                    return ResponseEntity.ok()
                        .header("Content-Type", "application/json")
                        .body(body);
                }
                // Try next endpoint on failure
                System.err.println("⚠️ Benchmark " + symbol + " status " + status + " on " + urlStr);
            } catch (Exception ignored) {
                System.err.println("⚠️ Benchmark " + symbol + " exception: " + ignored.getMessage());
            }
        }

        return ResponseEntity.status(502)
            .header("Content-Type", "application/json")
            .body("{\"chart\":{\"result\":null,\"error\":{\"code\":\"Not Found\",\"description\":\"Symbol " + symbol + " unavailable via Yahoo Finance proxy\"}}}");
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
