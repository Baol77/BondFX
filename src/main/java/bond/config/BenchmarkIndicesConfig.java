package bond.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;

import java.io.InputStream;
import java.util.List;

/**
 * Loads benchmark index configuration from benchmark-indices.yaml.
 * Each entry maps to a Yahoo Finance ticker for historical price fetching.
 */
public class BenchmarkIndicesConfig {

    private List<BenchmarkIndex> benchmarks;

    public List<BenchmarkIndex> getBenchmarks() { return benchmarks; }
    public void setBenchmarks(List<BenchmarkIndex> benchmarks) { this.benchmarks = benchmarks; }

    public static BenchmarkIndicesConfig load() {
        try {
            ObjectMapper mapper = new ObjectMapper(new YAMLFactory());
            mapper.findAndRegisterModules();
            InputStream is = BenchmarkIndicesConfig.class
                .getClassLoader()
                .getResourceAsStream("benchmark-indices.yaml");
            if (is == null) return new BenchmarkIndicesConfig();
            return mapper.readValue(is, BenchmarkIndicesConfig.class);
        } catch (Exception e) {
            System.err.println("⚠️ Could not load benchmark-indices.yaml: " + e.getMessage());
            return new BenchmarkIndicesConfig();
        }
    }

    public static class BenchmarkIndex {
        private String id;
        private String label;
        private String symbol;
        private String color;
        private boolean enabled = true;
        private String description;

        public String getId()          { return id; }
        public String getLabel()       { return label; }
        public String getSymbol()      { return symbol; }
        public String getColor()       { return color; }
        public boolean isEnabled()     { return enabled; }
        public String getDescription() { return description; }

        public void setId(String id)                    { this.id = id; }
        public void setLabel(String label)              { this.label = label; }
        public void setSymbol(String symbol)            { this.symbol = symbol; }
        public void setColor(String color)              { this.color = color; }
        public void setEnabled(boolean enabled)         { this.enabled = enabled; }
        public void setDescription(String description)  { this.description = description; }
    }
}
