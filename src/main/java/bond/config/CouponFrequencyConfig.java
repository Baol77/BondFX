package bond.config;

import lombok.Getter;
import lombok.Setter;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.constructor.Constructor;

import java.io.InputStream;
import java.util.List;

/**
 * Loads coupon-frequency.yaml from the classpath.
 *
 * Resolution order (highest priority first):
 *   1. exceptions — exact ISIN match
 *   2. prefixes   — longest matching prefix wins
 *   3. defaultFrequency — fallback
 */
@Getter
@Setter
public class CouponFrequencyConfig {

    private String defaultFrequency = "ANNUAL";
    private List<PrefixRule> prefixes;
    private List<ExceptionRule> exceptions;

    @Getter @Setter
    public static class PrefixRule {
        private String prefix;
        private String frequency;
    }

    @Getter @Setter
    public static class ExceptionRule {
        private String isin;
        private String frequency;
    }

    public static CouponFrequencyConfig load() {
        try (InputStream in = CouponFrequencyConfig.class
                .getClassLoader()
                .getResourceAsStream("coupon-frequency.yaml")) {

            if (in == null) return new CouponFrequencyConfig(); // safe default

            LoaderOptions opts = new LoaderOptions();
            return new Yaml(new Constructor(CouponFrequencyConfig.class, opts)).load(in);
        } catch (Exception e) {
            System.err.println("⚠️  Could not load coupon-frequency.yaml: " + e.getMessage());
            return new CouponFrequencyConfig();
        }
    }

    /**
     * Returns the coupon frequency for the given ISIN.
     * 1. Check exceptions (exact match)
     * 2. Check prefixes (longest match wins)
     * 3. Return defaultFrequency
     */
    public int paymentsPerYear(String isin) {
        if (isin == null) return toInt(defaultFrequency);

        // 1. Exact exception (supports comma-separated ISINs in a single entry)
        if (exceptions != null) {
            for (ExceptionRule ex : exceptions) {
                if (ex.getIsin() != null) {
                    for (String candidate : ex.getIsin().split(",")) {
                        if (isin.equalsIgnoreCase(candidate.trim())) {
                            return toInt(ex.getFrequency());
                        }
                    }
                }
            }
        }

        // 2. Longest prefix match
        String bestFreq = null;
        int bestLen = -1;
        if (prefixes != null) {
            for (PrefixRule rule : prefixes) {
                String pfx = rule.getPrefix();
                if (pfx != null && isin.toUpperCase().startsWith(pfx.toUpperCase())) {
                    if (pfx.length() > bestLen) {
                        bestLen = pfx.length();
                        bestFreq = rule.getFrequency();
                    }
                }
            }
        }
        if (bestFreq != null) return toInt(bestFreq);

        // 3. Default
        return toInt(defaultFrequency);
    }

    private static int toInt(String freq) {
        if (freq == null) return 1;
        return switch (freq.toUpperCase()) {
            case "SEMI_ANNUAL" -> 2;
            case "QUARTERLY"   -> 4;
            default            -> 1; // ANNUAL
        };
    }
}
