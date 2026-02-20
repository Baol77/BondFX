package bond.controller;

import bond.config.BondProfile;
import bond.config.BondProfilesConfig;
import bond.model.Bond;
import bond.service.BondService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Main MVC controller — renders the bond table page.
 * Delegates scraping and scoring to BondService (shared with API controller).
 */
@Controller
public class BondController {

    @Autowired
    private BondService bondService;

    @GetMapping("/")
    public String index(Model model) throws Exception {

        // Scrape fresh data and update the shared cache
        List<Bond> bonds = bondService.refreshAndGet();

        // Distinct currencies for the filter dropdown
        List<String> currencies = bonds.stream()
            .map(Bond::getCurrency)
            .distinct()
            .sorted()
            .collect(Collectors.toList());

        // Load profiles from YAML
        BondProfilesConfig profilesConfig = BondProfilesConfig.load();
        List<BondProfile> presets = profilesConfig.getProfiles();

        model.addAttribute("bonds", bonds);
        model.addAttribute("currencies", currencies);
        model.addAttribute("presets", presets);
        model.addAttribute("reportCurrency", "EUR");
        model.addAttribute("generatedAt",
            LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")));

        return "bond-report";
    }
}
