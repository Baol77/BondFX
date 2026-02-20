package bond.config;

import lombok.Getter;
import lombok.Setter;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.constructor.Constructor;

import java.io.InputStream;
import java.util.List;

@Getter
@Setter
public class BondProfilesConfig {

    private List<BondProfile> profiles;

    public BondProfilesConfig() {
    }

    public static BondProfilesConfig load() {
        try (InputStream in = BondProfilesConfig.class
            .getClassLoader()
            .getResourceAsStream("bond-profiles.yaml")) {

            if (in == null) {
                throw new IllegalStateException("bond-profiles.yaml not found on classpath");
            }

            LoaderOptions options = new LoaderOptions();
            return new Yaml(new Constructor(BondProfilesConfig.class, options))
                .load(in);
        } catch (Exception e) {
            throw new RuntimeException("Failed to load bond-profiles.yaml", e);
        }
    }
}
