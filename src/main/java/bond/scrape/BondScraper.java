package bond.scrape;

import bond.calc.BondCalculator;
import bond.model.Bond;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;

import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Scraper service that retrieves sovereign bond data from multiple
 * SimpleToolsForInvestors monitoring pages.
 * <p>
 * Responsibilities:
 * - Connect to several monitoring URLs
 * - Parse HTML yield tables
 * - Transform raw rows into Bond domain objects
 * - Convert prices to EUR using provided FX rates
 * - Apply filtering rules (lot size, currency, coupon, etc.)
 * - Merge duplicate bonds by ISIN across sources
 */
public class BondScraper {

    /**
     * Monitoring pages containing sovereign bond yield tables.
     * Each page may contain overlapping instruments.
     */
    private static final List<String> SOURCES = List.of(
        "https://www.simpletoolsforinvestors.eu/monitor_info.php?monitor=europa&yieldtype=G&timescale=DUR",
        "https://www.simpletoolsforinvestors.eu/monitor_info.php?monitor=43&yieldtype=G&timescale=DUR",
        "https://www.simpletoolsforinvestors.eu/monitor_info.php?monitor=58&yieldtype=G&timescale=DUR"
    );

    private final BondCalculator calculator;

    public BondScraper(BondCalculator calculator) {
        this.calculator = calculator;
    }

    /**
     * Scrapes all configured monitoring sources and aggregates the results.
     * <p>
     * Processing steps:
     * 1. Fetch each monitoring page
     * 2. Parse its yield table into Bond objects
     * 3. Merge all results into a single collection
     * 4. Remove duplicate bonds based on ISIN (first occurrence kept)
     *
     * @param fx Map of FX rates (currency → EUR conversion factor)
     * @return Deduplicated list of bonds from all sources
     * @throws Exception if any HTTP request or parsing operation fails
     */
    public List<Bond> scrape(Map<String, Double> fx) throws Exception {
        Map<String, Bond> all = new HashMap<>();

        for (String source : SOURCES) {
            System.out.println("🌐 Scraping: " + source);
            List<Bond> sourceBonds = scrapeSingleSource(source, fx);

            for (Bond bond : sourceBonds) {
                // putIfAbsent keeps the first version found.
                // Use .put() if you prefer the latest version (overwriting previous ones).
                if (bond.getIsin() != null) {
                    all.putIfAbsent(bond.getIsin(), bond);
                }
            }

        }

        return new ArrayList<>(all.values());
    }

    /**
     * Scrapes a single monitoring page and converts its table rows into Bond objects.
     * <p>
     * Processing includes:
     * - HTTP fetch with browser-like headers
     * - Dynamic column mapping using table headers
     * - Business filtering rules:
     * • minimum lot size <= 5000
     * • non-zero coupon only
     * • exclude NOK and SEK bonds
     * - Price conversion to EUR using provided FX rates
     * - Normalisation of issuer names
     * <p>
     * Invalid or unparsable rows are skipped silently.
     *
     * @param source Monitoring page URL
     * @param fx     FX rates used for EUR price conversion
     * @return List of valid bonds found on this page
     * @throws Exception if the page cannot be fetched or parsed
     */
    public List<Bond> scrapeSingleSource(String source, Map<String, Double> fx) throws Exception {
        List<Bond> list = new ArrayList<>();

        Document doc = Jsoup.connect(source)
            .userAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
            .referrer("https://google.com")
            .timeout(30_000)
            .get();

        Element table = doc.select("#YieldTable").first();
        if (table == null) return list;

        Elements rows = table.select("tr");
        // Extract headers to map column names to indices dynamically
        List<String> headers = rows.get(0).select("th").eachText();

        for (int i = 1; i < rows.size(); i++) {
            Elements td = rows.get(i).select("td");
            if (td.size() != headers.size()) continue;

            // Map cell values to their header names for easier access
            Map<String, String> r = new HashMap<>();
            for (int j = 0; j < headers.size(); j++) {
                r.put(headers.get(j), td.get(j).text());
            }

            try {
                String d = r.get("Descrizione");
                String isin = r.get("Codice ISIN");

                // Avoid buy constraints of high quantities
                int lottoMinimo = Integer.parseInt(r.get("Lotto minimo"));
                if (lottoMinimo > 5000) continue;

                // Clean Issuer: Extract text before the first digit (usually the date/coupon start)
                // Example: "ITALY 4.5% 2026" -> "ITALY"
                String issuer = d.split("\\d", 2)[0].trim();
                issuer = CountryNormalizer.normalize(issuer);

                // Parse Coupon: Find the '%' and look back to find the numeric value
                int pct = d.indexOf('%');
                double coupon = Double.parseDouble(
                    d.substring(d.lastIndexOf(' ', pct) + 1, pct).replace(',', '.')
                );

                // Skip zero-coupon bonds as they follow different yield logic
                if (coupon == 0) continue;

                LocalDate maturity = LocalDate.parse(r.get("Data scadenza"));

                // Filter: Skip specific Nordic currencies if not relevant for current analysis
                String ccy = r.get("Divisa");
                if (ccy.equals("NOK") || ccy.equals("SEK")) continue;

                double price = parse(r.get("Prezzo di riferimento"));

                // Convert Price to EUR using the provided FX rates
                double priceEur = price / fx.getOrDefault(ccy, 1.0);

                // Build and add the bond using the calculator helper
                Bond bond = calculator.buildBond(isin, issuer, price, ccy, priceEur, coupon, maturity);
                if (bond != null) list.add(bond);
            } catch (Exception ignored) {
                // Ignore individual row failures to continue processing the rest of the table
            }
        }
        return list;
    }

    /**
     * Converts a numeric string extracted from the HTML table into a double.
     * <p>
     * Normalisation rules:
     * - comma → decimal point
     * - remove currency symbols
     * - trim whitespace
     *
     * @param s Raw numeric value (example: "102,45 €")
     * @return Parsed numeric value
     */
    private static double parse(String s) {
        return Double.parseDouble(s.replace(",", ".").replace("€", "").trim());
    }
}
