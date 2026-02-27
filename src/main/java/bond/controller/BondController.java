package bond.controller;

import bond.config.BondProfile;
import bond.config.BondProfilesConfig;
import bond.model.Bond;
import bond.service.BondService;
import org.commonmark.Extension;
import org.commonmark.ext.gfm.tables.TablesExtension;
import org.commonmark.node.Node;
import org.commonmark.parser.Parser;
import org.commonmark.renderer.html.HtmlRenderer;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Main MVC controller — renders the bond table page.
 * Delegates scraping and scoring to BondService (shared with API controller).
 */
@Controller
public class BondController {

    @Autowired
    private BondService bondService;

    private static final List<Extension> MD_EXTENSIONS =
        List.of(TablesExtension.create());
    private static final Parser MD_PARSER =
        Parser.builder().extensions(MD_EXTENSIONS).build();
    private static final HtmlRenderer MD_HTML =
        HtmlRenderer.builder().extensions(MD_EXTENSIONS).build();

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
        model.addAttribute("generatedAtMs",
            java.time.Instant.now().toEpochMilli());

        // README info box — read from project root, convert Markdown → HTML
        model.addAttribute("readmeHtml", loadReadme());

        return "bond-report";
    }

    @GetMapping("/analyzer")
    public String analyzer(Model model) throws Exception {
        List<Bond> bonds = bondService.getAll();
        model.addAttribute("bonds", bonds);
        model.addAttribute("generatedAtMs",
            java.time.Instant.now().toEpochMilli());
        return "analyzer";
    }

    @GetMapping("/capital-growth")
    public String capitalGrowth(Model model) throws Exception {
        List<Bond> bonds = bondService.getAll();
        model.addAttribute("bonds", bonds);
        model.addAttribute("generatedAtMs",
            java.time.Instant.now().toEpochMilli());
        return "capital-growth";
    }

    // ─── Private helpers ───────────────────────────────────────────────────────

    /**
     * Reads README.md from the project root (works both locally and on Render/Docker
     * where the working directory is /app).
     * Falls back to an empty string if the file is missing.
     */
    private String loadReadme() {
        Path path = Paths.get("README.md");
        if (!Files.exists(path)) {
            // Docker workdir is /app — try one level up just in case
            path = Paths.get("/app/README.md");
        }
        if (!Files.exists(path)) {
            return "<p><em>README.md not found.</em></p>";
        }
        try {
            String markdown = Files.readString(path);
            Node document = MD_PARSER.parse(markdown);
            String html = MD_HTML.render(document);
            return injectHeadingIds(html);
        } catch (IOException e) {
            return "<p><em>Could not load README.md: " + e.getMessage() + "</em></p>";
        }
    }

    /**
     * Injects id attributes into h1–h6 tags using the GitHub-style slug algorithm:
     * lowercase, strip non-alphanumeric (except spaces and hyphens), replace spaces with hyphens.
     *
     * Example: {@code <h2>Quick Start</h2>}  →  {@code <h2 id="quick-start">Quick Start</h2>}
     *
     * This makes the Table of Contents anchor links (#quick-start) work correctly
     * inside the modal, where the browser cannot resolve href="#..." against the page.
     */
    private static String injectHeadingIds(String html) {

        Pattern pattern = Pattern.compile("<(h[1-6])>(.+?)</h[1-6]>", Pattern.DOTALL);
        Matcher matcher = pattern.matcher(html);

        return matcher.replaceAll(match -> {

            String tag   = match.group(1);
            String inner = match.group(2);

            // strip nested tags for slug
            String text = inner.replaceAll("<[^>]+>", "");

            String slug = text.toLowerCase()
                .replaceAll("[^\\w\\s-]", "")
                .replaceAll("\\s+", "-")
                .replaceAll("-+", "-");

            return "<" + tag + " id=\"" + slug + "\">" + inner + "</" + tag + ">";
        });
    }
}
