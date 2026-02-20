package bond.config;

import lombok.Getter;
import lombok.Setter;

import java.util.Map;

@Setter
@Getter
public class BondProfile {
    String id;
    String label;
    String emoji;
    String description;
    String sortedBy;  // Default column to sort by (e.g., "SAY", "CURR_YIELD")
    String profileType;  // Profile type: "income" or "SAY" (Simple Annual Yield)
    Map<String, Object> filters;

    public BondProfile() {
    }
}