package bond.config;

import lombok.Getter;
import lombok.Setter;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.constructor.Constructor;

import java.io.InputStream;
import java.util.List;

/**
 * Loads tax-rates.yaml from the classpath.
 *
 * Represents withholding tax at source on coupon income only.
 * Capital gains taxation depends on the investor's country of residence
 * and is NOT modelled here.
 *
 * Resolution order (highest priority first):
 *   1. exceptions — exact ISIN or comma-separated ISINs
 *   2. countries  — matched against normalized issuer name (case-insensitive)
 *   3. defaultRate — fallback (0.0%)
 *
 * Country names must match {@link bond.scrape.CountryNormalizer} output.
 */
@Getter
@Setter
public class TaxRateConfig {

    private double defaultRate = 0.0;
    private List<CountryRule> countries;
    private List<ExceptionRule> exceptions;

    @Getter @Setter
    public static class CountryRule {
        private String country;
        private double rate;
    }

    @Getter @Setter
    public static class ExceptionRule {
        private String isin;
        private double rate;
    }

    public static TaxRateConfig load() {
        try (InputStream in = TaxRateConfig.class
                .getClassLoader()
                .getResourceAsStream("tax-rates.yaml")) {

            if (in == null) return new TaxRateConfig();

            LoaderOptions opts = new LoaderOptions();
            return new Yaml(new Constructor(TaxRateConfig.class, opts)).load(in);
        } catch (Exception e) {
            System.err.println("⚠️  Could not load tax-rates.yaml: " + e.getMessage());
            return new TaxRateConfig();
        }
    }

    /**
     * Returns the withholding tax rate (%) for the given bond.
     *
     * @param isin   the bond ISIN (for exception lookup)
     * @param issuer the normalized issuer/country name (from CountryNormalizer)
     */
    public double rateFor(String isin, String issuer) {

        // 1. ISIN exceptions (highest priority)
        if (exceptions != null && isin != null) {
            for (ExceptionRule ex : exceptions) {
                if (ex.getIsin() != null) {
                    for (String candidate : ex.getIsin().split(",")) {
                        if (isin.equalsIgnoreCase(candidate.trim())) {
                            return ex.getRate();
                        }
                    }
                }
            }
        }

        // 2. Country match (case-insensitive)
        if (countries != null && issuer != null) {
            String normalized = issuer.trim().toUpperCase();
            for (CountryRule rule : countries) {
                if (rule.getCountry() != null &&
                    rule.getCountry().trim().toUpperCase().equals(normalized)) {
                    return rule.getRate();
                }
            }
        }

        // 3. Default
        return defaultRate;
    }
}
