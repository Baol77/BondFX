package bond.service;

import bond.calc.BondCalculator;
import bond.fx.FxService;
import bond.model.Bond;
import bond.scrape.BondScraper;
import bond.scoring.BondScoreEngine;
import bond.rating.RatingService;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Spring singleton service that holds the scraped bond list in memory.
 * <p>
 * Shared between:
 * - BondController  (MVC page render)
 * - BondApiController (REST API for Portfolio Analyzer)
 * <p>
 * Cache strategy: bonds are refreshed on every page load (triggered by BondController).
 * The API endpoints always read the latest cached list — no re-scraping per API call.
 * If the cache is empty (e.g. first API call before page load), it will scrape on demand.
 */
@Service
public class BondService {

    private final BondCalculator calculator = new BondCalculator();
    private final BondScraper scraper = new BondScraper(calculator);
    private final BondScoreEngine scoreEngine = new BondScoreEngine();

    /** In-memory bond list indexed by ISIN for O(1) lookup. */
    private final Map<String, Bond> bondIndex = new LinkedHashMap<>();

    /** FX rates cached alongside the bonds. */
    private Map<String, Double> fxRates = new HashMap<>();

    /** Timestamp of last scrape (for logging). */
    private Instant lastRefresh = null;

    private final ReentrantLock lock = new ReentrantLock();

    // ─── Public API ────────────────────────────────────────────────────────────

    /**
     * Scrape all sources fresh, score bonds, and update the in-memory cache.
     * Called by BondController on every page load.
     *
     * @return fresh list of all bonds sorted by SAY descending
     */
    public List<Bond> refreshAndGet() throws Exception {
        lock.lock();
        try {
            // Check TTL for ratings before scraping (FX TTL is handled inside FxService.loadFxRates)
            RatingService.refreshIfExpired();

            FxService fxService = FxService.getInstance();
            fxRates = fxService.loadFxRates();

            List<Bond> bonds = scraper.scrape(fxRates);
            bonds.removeIf(Objects::isNull);
            scoreEngine.calculateBondScores(bonds, "EUR");
            bonds.sort(Comparator.comparingDouble(Bond::getSimpleAnnualYield).reversed());

            bondIndex.clear();
            for (Bond b : bonds) {
                bondIndex.put(b.getIsin(), b);
            }

            lastRefresh = Instant.now();
            System.out.println("✅ Cache refreshed: " + bonds.size() + " bonds at " + lastRefresh);
            return bonds;
        } finally {
            lock.unlock();
        }
    }

    /**
     * Find a bond by ISIN from the cache.
     * If cache is empty (server just restarted), triggers a fresh scrape first.
     *
     * @param isin the bond ISIN
     * @return Optional containing the bond, or empty if not found
     */
    public Optional<Bond> findByIsin(String isin) throws Exception {
        ensureCacheLoaded();
        return Optional.ofNullable(bondIndex.get(isin.toUpperCase().trim()));
    }

    /**
     * Search bonds by ISIN or issuer (case-insensitive, partial match).
     * If cache is empty, triggers a fresh scrape first.
     *
     * @param query search string
     * @return list of matching bonds (max 20)
     */
    public List<Bond> search(String query) throws Exception {
        ensureCacheLoaded();

        if (query == null || query.isBlank()) {
            return List.of();
        }

        String q = query.toLowerCase().trim();

        // --- split tokens ---
        List<String> tokens = Arrays.stream(q.split("\\s+"))
            .map(String::trim)
            .filter(t -> !t.isEmpty())
            .toList();

        List<Double> percentTokens = new ArrayList<>();
        List<String> textTokens = new ArrayList<>();

        // --- classify tokens ---
        for (String t : tokens) {
            String normalized = t.replace(",", ".");

            if (normalized.matches("^\\d+(\\.\\d*)?%?$")) {
                percentTokens.add(Double.parseDouble(normalized.replace("%", "")));
            } else {
                textTokens.add(normalize(t));
            }
        }

        List<Bond> results = new ArrayList<>();

        for (Bond bond : bondIndex.values()) {

            double coupon = bond.getCouponPct();

            // --- coupon match ---
            boolean couponMatch = true;
            if (!percentTokens.isEmpty()) {
                for (double p : percentTokens) {

                    if (Math.floor(p) == p) {
                        if (Math.floor(coupon) != p) {
                            couponMatch = false;
                            break;
                        }
                    } else {
                        int decimals = getDecimals(p);
                        double factor = Math.pow(10, decimals);

                        if (Math.floor(coupon * factor) != Math.floor(p * factor)) {
                            couponMatch = false;
                            break;
                        }
                    }
                }
            }

            if (!couponMatch) continue;

            // --- text match ---
            boolean textMatch = true;
            if (!textTokens.isEmpty()) {
                String searchable = normalize(
                    bond.getIsin() + " " + bond.getIssuer()
                );

                for (String t : textTokens) {
                    if (!searchable.contains(t)) {
                        textMatch = false;
                        break;
                    }
                }
            }

            if (textMatch) {
                results.add(bond);
                if (results.size() >= 20) break;
            }
        }

        return results;
    }

    private String normalize(String s) {
        return s == null ? "" :
            s.toLowerCase()
                .replace(",", ".")
                .replace("%", "")
                .trim();
    }

    private int getDecimals(double value) {
        String text = Double.toString(value);
        int index = text.indexOf('.');
        return index < 0 ? 0 : text.length() - index - 1;
    }


    /**
     * Returns all bonds from cache (ordered as last refreshed).
     */
    public List<Bond> getAll() throws Exception {
        ensureCacheLoaded();
        return new ArrayList<>(bondIndex.values());
    }

    public Map<String, Double> getFxRates() throws Exception {
        ensureCacheLoaded();
        return Collections.unmodifiableMap(fxRates);
    }

    // ─── Private helpers ───────────────────────────────────────────────────────

    private void ensureCacheLoaded() throws Exception {
        if (bondIndex.isEmpty()) {
            System.out.println("⚠️  Cache empty — scraping on demand (API call before page load)");
            refreshAndGet();
        }
    }
}
