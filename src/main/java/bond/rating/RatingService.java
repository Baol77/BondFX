package bond.rating;

import bond.scrape.CountryNormalizer;
import org.jsoup.nodes.Document;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Service to map COUNTRIES to sovereign ratings.
 * <p>
 * Strategy:
 * 1. Normalize the country name using CountryNormalizer.normalize()
 * 2. Look up the normalized name in COUNTRY_TO_RATING
 * 3. If not found, return "BBB" by default
 * <p>
 * Example:
 * issuer = "ITALY" → normalize() → "ITALIA" → "BBB"
 * issuer = "ITALIA" → normalize() → "ITALIA" → "BBB"
 * issuer = "REPUBBLICA ITALIANA" → normalize() → "ITALIA" → "BBB"
 * issuer = "GERMANY" → normalize() → "GERMANIA" → "AAA"
 * issuer = "FRANCE" → normalize() → "FRANCIA" → "AA"
 * <p>
 * Sovereign ratings are sourced from providers such as Trading Economics,
 * Moody's, S&P, and Fitch (data updated as of February 2026).
 */
public class RatingService {

    private static final String RATINGS_URL = "https://tradingeconomics.com/country-list/rating";
    private static final Map<String, String> COUNTRY_TO_RATING = new ConcurrentHashMap<>();
    private static final Map<String, String> FALLBACK_MAP = new HashMap<>();

    static {
        // Mapping of normalized names to sovereign ratings
        // Keys: Use names returned by CountryNormalizer.normalize()

        // AAA
        FALLBACK_MAP.put("GERMANIA", "AAA");      // Germany
        FALLBACK_MAP.put("OLANDA", "AAA");        // Netherlands
        FALLBACK_MAP.put("SVIZZERA", "AAA");      // Switzerland
        FALLBACK_MAP.put("NORVEGIA", "AAA");      // Norway
        FALLBACK_MAP.put("DANIMARCA", "AAA");     // Denmark
        FALLBACK_MAP.put("LUSSEMBURGO", "AAA");   // Luxembourg

        // AA+
        FALLBACK_MAP.put("USA", "AA+");           // United States
        FALLBACK_MAP.put("AUSTRALIA", "AA+");
        FALLBACK_MAP.put("CANADA", "AA+");
        FALLBACK_MAP.put("AUSTRIA", "AA+");
        FALLBACK_MAP.put("SVEZIA", "AA+");        // Sweden
        FALLBACK_MAP.put("FINLANDIA", "AA+");     // Finland

        // AA
        FALLBACK_MAP.put("FRANCIA", "AA");        // France
        FALLBACK_MAP.put("BELGIO", "AA");         // Belgium

        // A+
        FALLBACK_MAP.put("GIAPPONE", "A+");       // Japan
        FALLBACK_MAP.put("IRLANDA", "A+");        // Ireland

        // AA-
        FALLBACK_MAP.put("REPUBBLICA CECA", "AA-"); // Czech Republic
        FALLBACK_MAP.put("REGNO UNITO", "AA-");     // United Kingdom

        // A
        FALLBACK_MAP.put("SPAGNA", "A");          // Spain
        FALLBACK_MAP.put("POLONIA", "A");         // Poland
        FALLBACK_MAP.put("SLOVENIA", "A");        // Slovenia
        FALLBACK_MAP.put("SLOVACCHIA", "A");      // Slovakia
        FALLBACK_MAP.put("CILE", "A");            // Chile
        FALLBACK_MAP.put("LITUANIA", "A");        // Lithuania

        // A-
        FALLBACK_MAP.put("CIPRO", "A-");          // Cyprus
        FALLBACK_MAP.put("PORTOGALLO", "A-");     // Portugal
        FALLBACK_MAP.put("LETTONIA", "A-");       // Latvia

        // AA-
        FALLBACK_MAP.put("ESTONIA", "AA-");       // Estonia

        // BBB (Investment Grade - Minimum for profiles)
        FALLBACK_MAP.put("ITALIA", "BBB");        // Italy ⭐
        FALLBACK_MAP.put("ROMANIA", "BBB");       // Romania
        FALLBACK_MAP.put("BULGARIA", "BBB");      // Bulgaria
        FALLBACK_MAP.put("INDIA", "BBB");         // India

        // BBB-
        FALLBACK_MAP.put("CROAZIA", "BBB-");      // Croatia
        FALLBACK_MAP.put("UNGHERIA", "BBB-");     // Hungary
        FALLBACK_MAP.put("MESSICO", "BBB-");      // Mexico

        // BB+ (Speculative - Likely filtered)
        FALLBACK_MAP.put("GRECIA", "BB+");        // Greece

        // BB
        FALLBACK_MAP.put("SUDAFRICA", "BB");      // South Africa
        FALLBACK_MAP.put("BRASILE", "BB");        // Brazil

        // B+
        FALLBACK_MAP.put("TURCHIA", "B+");        // Turkey

        // B
        FALLBACK_MAP.put("RUSSIA", "B");          // Russia (sanctions)

        // BB-

        // CCC
        FALLBACK_MAP.put("ARGENTINA", "CCC");     // Argentina

        // Initialize with fallback first
        COUNTRY_TO_RATING.putAll(FALLBACK_MAP);

        // --- STEP 2: TRY INITIAL REFRESH FROM WEB ---
        try {
            refreshRatings();
        } catch (Exception e) {
            // Log as ERROR or WARNING, but do NOT throw a RuntimeException
            System.err.println("[CRITICAL FALLBACK] Failed to sync ratings from Trading Economics: " + e.getMessage());
            System.err.println("[CRITICAL FALLBACK] The system will continue using hardcoded 2026-02-03 data.");
        }
    }

    /**
     * Scrapes Trading Economics to update the ratings map.
     * Uses S&P ratings as the standard column from the table.
     */
    public static void refreshRatings() throws Exception {
        try {
            System.out.printf("🌐 Fetching ratings from %s...\n", RATINGS_URL);

            Map<String, String> webRatings = new HashMap<>();

            // 1. Scrape the website
            Document doc = Jsoup.connect(RATINGS_URL)
                .userAgent("Mozilla/5.0")
                .timeout(15000)
                .get();

            Element table = doc.select("table").first();
            if (table == null) throw new IOException("Table not found");

            for (Element row : table.select("tr")) {
                Elements cols = row.select("td");
                if (cols.size() >= 2) {
                    String rawCountry = cols.get(0).text().trim();
                    String rating = cols.get(1).text().trim();

                    if (!rating.isEmpty() && !rating.equalsIgnoreCase("n.a.")) {
                        String normalized = CountryNormalizer.normalize(rawCountry);
                        if (!normalized.isEmpty()) {
                            webRatings.put(normalized, rating);
                        }
                    }
                }
            }

            System.out.printf("✅ Loaded %d sovereign S&P ratings \n", webRatings.size());

            // 2. Identify missing countries from your Fallback Map
            for (String fallbackCountry : FALLBACK_MAP.keySet()) {
                if (!webRatings.containsKey(fallbackCountry)) {
                    System.out.println("ℹ️ [INFO] " + fallbackCountry + " missing from website. Keeping fallback: " + FALLBACK_MAP.get(fallbackCountry));
                }
            }

            // 3. Merge: Web data overwrites fallback, but missing countries stay as fallback
            if (!webRatings.isEmpty()) {
                COUNTRY_TO_RATING.putAll(webRatings);
                System.out.println("✅ Ratings updated. Total coverage: " + COUNTRY_TO_RATING.size() + " countries.");
            }

        } catch (IOException e) {
            System.err.println("⚠️ [FALLBACK] Failed to download ratings from " + RATINGS_URL + ": " + e.getMessage());
            System.err.println("⚠️ [FALLBACK] Using local hardcoded rating map.");
        }
    }

    /**
     * Retrieves the sovereign rating for a given country/issuer.
     * <p>
     * Strategy:
     * 1. Normalize country name with CountryNormalizer
     * 2. Search in COUNTRY_TO_RATING HashMap
     * 3. If not found, return "BBB" as default
     *
     * @param issuer The name of the country/issuer (e.g. "ITALY", "ITALIA", "REPUBLIC OF ITALY")
     * @return The rating (e.g. "AAA", "AA", "BBB") or "BBB" if not found
     */
    public static String getRatingForIssuer(String issuer) {
        if (issuer == null || issuer.isEmpty()) {
            return "BBB";  // Default: investment grade
        }

        // STEP 1: Normalize country name using CountryNormalizer
        String normalizedCountry = CountryNormalizer.normalize(issuer);

        // If normalization fails (returns ""), log warning and return BBB
        if (normalizedCountry.isEmpty()) {
            System.out.println("⚠️ WARNING: Country name not recognized for issuer: " + issuer + " → defaulting to BBB");
            return "BBB";
        }

        // STEP 2: Search HashMap using the normalized name
        String rating = COUNTRY_TO_RATING.get(normalizedCountry);
        if (rating != null) return rating;

        // If normalization succeeded but no rating is mapped, log warning and return BBB
        System.out.println("⚠️ WARNING: Rating not found for country: " + normalizedCountry + " → defaulting to BBB");
        return "BBB";
    }

    /**
     * Verifies if a rating meets the minimum requirement.
     *
     * @param actualRating  The current rating (e.g. "AA")
     * @param minimumRating The minimum required rating (e.g. "BBB")
     * @return true if actualRating >= minimumRating in quality
     */
    public static boolean meetsRatingRequirement(String actualRating, String minimumRating) {
        return compareRatings(actualRating, minimumRating) >= 0;
    }

    /**
     * Compares two ratings.
     *
     * @param rating1 First rating
     * @param rating2 Second rating
     * @return > 0 if rating1 > rating2 in quality
     * = 0 if rating1 == rating2
     * < 0 if rating1 < rating2 in quality
     */
    public static int compareRatings(String rating1, String rating2) {
        int rank1 = getRatingRank(rating1);
        int rank2 = getRatingRank(rating2);
        return rank1 - rank2; // Positive result means rating1 is higher quality
    }

    /**
     * Maps ratings to a numerical rank for comparison.
     * Higher value = Higher quality (AAA is the highest).
     */
    private static int getRatingRank(String rating) {
        if (rating == null || rating.isEmpty()) {
            return 2; // Default to BBB rank
        }

        String r = rating.toUpperCase().trim();

        return switch (r) {
            case "AAA" -> 10;
            case "AA+" -> 9;
            case "AA" -> 8;
            case "AA-" -> 7;
            case "A+" -> 6;
            case "A" -> 5;
            case "A-" -> 4;
            case "BBB+" -> 3;
            case "BBB" -> 2;
            case "BBB-" -> 1;
            case "BB+" -> 0;
            case "BB" -> -1;
            case "BB-" -> -2;
            case "B+" -> -3;
            case "B" -> -4;
            case "B-" -> -5;
            case "CCC" -> -6;
            case "CC" -> -7;
            case "C" -> -8;
            case "D" -> -9;
            default -> 2; // Default to BBB rank
        };
    }
}