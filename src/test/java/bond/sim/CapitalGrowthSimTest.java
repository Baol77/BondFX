package bond.sim;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.Before;
import org.junit.Test;
import org.junit.experimental.runners.Enclosed;
import org.junit.runner.RunWith;

import java.io.File;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import static org.junit.Assert.*;

/**
 * BondFX Capital Growth — integration regression tests (JUnit 4).
 *
 * Each test spawns Node.js, feeds a scenario JSON to capital-growth-sim.mjs,
 * parses the JSON output and asserts on the simulated values.
 *
 * Tolerance: ±2% on monetary values (rounding from scale factor and integer rounding).
 *
 * Prerequisites:
 *   - node >= 18 on PATH
 *   - capital-growth-sim.mjs + capital-growth.js in JS_DIR (see constant below)
 *   - Jackson Databind on classpath
 *
 * Maven dependencies:
 *   <dependency>
 *     <groupId>junit</groupId>
 *     <artifactId>junit</artifactId>
 *     <version>4.13.2</version>
 *     <scope>test</scope>
 *   </dependency>
 *   <dependency>
 *     <groupId>com.fasterxml.jackson.core</groupId>
 *     <artifactId>jackson-databind</artifactId>
 *     <version>2.17.0</version>
 *     <scope>test</scope>
 *   </dependency>
 */
@RunWith(Enclosed.class)
public class CapitalGrowthSimTest {

    // ── Configuration ────────────────────────────────────────────────────────

    /** Directory containing capital-growth-sim.mjs, capital-growth.js and the JSON fixtures. */
    static final Path JS_DIR = Paths.get("src/test/js");

    /** Monetary tolerance: 2% relative error (simulation uses floating-point scale). */
    static final double TOL_PCT = 2.0;

    static final ObjectMapper MAPPER = new ObjectMapper();

    /**
     * Cache: input filename → parsed JSON result.
     * Each fixture is simulated only once per test run — all tests sharing
     * the same file reuse the cached result, avoiding repeated Node spawns.
     */
    private static final Map<String, JsonNode> SIM_CACHE = new java.util.concurrent.ConcurrentHashMap<>();

    // ── Shared helpers (static so inner classes can use them) ─────────────────

    /**
     * Spawns: node capital-growth-sim.mjs <inputFile>
     * Returns the parsed JSON output node.
     * Result is cached per filename — Node is spawned at most once per fixture.
     */
    static JsonNode runSim(String inputFile) throws Exception {
        JsonNode cached = SIM_CACHE.get(inputFile);
        if (cached != null) return cached;

        File input = JS_DIR.resolve(inputFile).toFile();
        assertTrue("Test fixture not found: " + input.getAbsolutePath(), input.exists());

        ProcessBuilder pb = new ProcessBuilder(
            "node",
            "capital-growth-sim.mjs",
            input.getAbsolutePath()
        );
        pb.directory(JS_DIR.toFile());
        pb.redirectErrorStream(false);

        // Drain stdout and stderr concurrently to avoid blocking on full pipe buffer
        Process proc = pb.start();
        java.util.concurrent.Future<String> stdoutFuture =
            java.util.concurrent.Executors.newSingleThreadExecutor().submit(
                () -> new String(proc.getInputStream().readAllBytes()));
        java.util.concurrent.Future<String> stderrFuture =
            java.util.concurrent.Executors.newSingleThreadExecutor().submit(
                () -> new String(proc.getErrorStream().readAllBytes()));

        boolean finished = proc.waitFor(120, TimeUnit.SECONDS);

        String stdout = stdoutFuture.get(5, TimeUnit.SECONDS);
        String stderr = stderrFuture.get(5, TimeUnit.SECONDS);

        assertTrue("node process timed out (>120s) for: " + inputFile
            + "\nstderr so far: " + stderr, finished);

        int exitCode = proc.exitValue();
        assertEquals("capital-growth-sim.mjs exited with " + exitCode + "\nstderr: " + stderr,
            0, exitCode);
        assertFalse("Empty output from sim — stderr: " + stderr, stdout.isBlank());

        JsonNode result = MAPPER.readTree(stdout);
        SIM_CACHE.put(inputFile, result);
        return result;
    }

    /** Find a scenario result by id inside the output root node. */
    static JsonNode scenario(JsonNode root, String scenarioId) {
        for (JsonNode sc : root.path("scenarioResults")) {
            if (scenarioId.equals(sc.path("id").asText())) return sc;
        }
        fail("Scenario not found in output: " + scenarioId);
        return null;
    }

    /** Find a year node inside a scenario result. */
    static JsonNode year(JsonNode scenario, int yr) {
        for (JsonNode y : scenario.path("years")) {
            if (y.path("yr").asInt() == yr) return y;
        }
        fail("Year " + yr + " not found in scenario " + scenario.path("id").asText());
        return null;
    }

    /** Find a perSlot row by isin prefix (handles _repl suffix). */
    static JsonNode slot(JsonNode yearNode, String isinPrefix) {
        for (JsonNode s : yearNode.path("perSlot")) {
            if (s.path("isin").asText().startsWith(isinPrefix)) return s;
        }
        fail("Slot not found for isin prefix '" + isinPrefix
            + "' in yr=" + yearNode.path("yr").asInt());
        return null;
    }

    /** Assert two values are within TOL_PCT relative error. */
    static void assertNear(long actual, long expected, String label) {
        if (expected == 0) {
            assertEquals(label + " (expected 0)", 0, actual);
            return;
        }
        double diff = Math.abs((double)(actual - expected) / expected) * 100.0;
        assertTrue(label + ": got " + actual + ", expected " + expected
            + " (diff=" + String.format("%.1f", diff) + "%, tol=" + TOL_PCT + "%)",
            diff <= TOL_PCT);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SCENARIO A — BELGIO replacement (reinvestCoupons=true, maturity 2038)
    //   Input:  cg-test-input-belgio.json
    //   Verify: 2028 (maturity event), 2029 (first year with replacement), 2038 (replacement matures)
    // ═══════════════════════════════════════════════════════════════════════

    public static class ScenarioBelgioTest {

        private JsonNode root;
        private JsonNode sc1, sc2;

        @Before
        public void setUp() throws Exception {
            root = runSim("cg-test-input-belgio.json");
            sc1  = scenario(root, "sc_1");
            sc2  = scenario(root, "sc_2");
        }

        // ── Year 2028: maturity event ────────────────────────────────────

        @Test
        public void sc1_2028_belgioRedeemed_noReinvestment() {
            JsonNode y  = year(sc1, 2028);
            JsonNode be = slot(y, "BE0000291972");
            assertNear(be.path("redemption").asLong(), 1934, "BE redemption 2028 sc1");
            assertEquals("sc1 reinvested=0", 0, be.path("reinvested").asLong());
            assertFalse("sc1 no replacement activated", y.path("replacementActivated").asBoolean());
        }

        @Test
        public void sc2_2028_replacementActivated() {
            JsonNode y = year(sc2, 2028);
            assertTrue("replacementActivated=true", y.path("replacementActivated").asBoolean());
            // header reinvested=0 when replacement is activated (capital goes to switched)
            assertEquals("reinvested=0 in activation year", 0, y.path("reinvested").asLong());
        }

        @Test
        public void sc1_2028_bondsVal_equals_sum_of_three_survivors() {
            JsonNode y = year(sc1, 2028);
            long itPv  = slot(y, "IT0005441883").path("portVal").asLong();
            long usaPv = slot(y, "US912810SP49").path("portVal").asLong();
            long gbPv  = slot(y, "GB00BN65R313").path("portVal").asLong();
            assertNear(y.path("bondsVal").asLong(), itPv + usaPv + gbPv,
                "bondsVal vs sum of surviving bonds");
        }

        // ── Year 2029: first year with replacement bond ──────────────────

        @Test
        public void sc2_2029_replacementBondPresentInPerSlot() {
            JsonNode repl = slot(year(sc2, 2029), "BE0000291972_repl");
            assertTrue("isReplacement=true", repl.path("isReplacement").asBoolean());
            assertEquals("matYear=2038", 2038, repl.path("matYear").asInt());
        }

        @Test
        public void sc2_2029_perSlotHasExactlyFourBonds() {
            assertEquals("perSlot count: IT + USA + GB + REPL",
                4, year(sc2, 2029).path("perSlot").size());
        }

        @Test
        public void sc1_2029_perSlotHasThreeBonds_belgioGone() {
            assertEquals("perSlot count sc_1: only IT + USA + GB",
                3, year(sc1, 2029).path("perSlot").size());
        }

        @Test
        public void sc2_2029_replCouponRatio_is_279pct() {
            JsonNode repl   = slot(year(sc2, 2029), "BE0000291972_repl");
            long coupon     = repl.path("replCoupon").asLong();
            long pv         = repl.path("portVal").asLong();
            double ratioPct = (double) coupon / pv * 100.0;
            assertEquals("replCoupon/portVal should be ≈2.79%", 2.79, ratioPct, 0.15);
        }

        @Test
        public void sc2_2029_headerCoupons_equals_sumOfPerSlot() {
            JsonNode y        = year(sc2, 2029);
            long sumFromSlots = 0;
            for (JsonNode s : y.path("perSlot")) {
                sumFromSlots += s.path("coupon").asLong() + s.path("replCoupon").asLong();
            }
            assertNear(y.path("coupons").asLong(), sumFromSlots,
                "header coupons vs perSlot sum");
        }

        // ── Year 2038: replacement matures ───────────────────────────────

        @Test
        public void sc2_2038_replRedemption_equals_portVal() {
            JsonNode repl = slot(year(sc2, 2038), "BE0000291972_repl");
            assertNear(repl.path("redemption").asLong(), repl.path("portVal").asLong(),
                "redemption vs portVal 2038");
        }

        @Test
        public void sc2_2038_replPortVal_greaterThan_2029_because_reinvestCoupons() {
            long pv2029 = slot(year(sc2, 2029), "BE0000291972_repl").path("portVal").asLong();
            long pv2038 = slot(year(sc2, 2038), "BE0000291972_repl").path("portVal").asLong();
            assertTrue("portVal should grow when reinvestCoupons=true: 2029="
                + pv2029 + " 2038=" + pv2038, pv2038 > pv2029);
        }

        @Test
        public void sc1_2038_hasThreeBonds_noReplacement() {
            JsonNode y = year(sc1, 2038);
            assertEquals("sc_1 perSlot count in 2038", 3, y.path("perSlot").size());
            for (JsonNode s : y.path("perSlot")) {
                assertFalse("No replacement slot in sc_1",
                    s.path("isReplacement").asBoolean());
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SCENARIO B — USA replacement (reinvestCoupons=false, perIsin shifts, mat.2060)
    //   Input:  cg-test-input-usa.json
    //   Verify: 2028 (pre-maturity), 2051 (first year post-USA maturity), 2060 (repl matures)
    // ═══════════════════════════════════════════════════════════════════════

    public static class ScenarioUsaTest {

        private JsonNode root;
        private JsonNode sc2;

        @Before
        public void setUp() throws Exception {
            root = runSim("cg-test-input-usa.json");
            sc2  = scenario(root, "sc_2");
        }

        @Test
        public void sc2_2028_noUsaReplacementYet() {
            JsonNode y   = year(sc2, 2028);
            JsonNode usa = slot(y, "US912810SP49");
            assertFalse("no replacement in 2028", y.path("replacementActivated").asBoolean());
            assertFalse("USA not a replacement slot yet", usa.path("isReplacement").asBoolean());
            assertEquals("USA not redeemed in 2028", 0, usa.path("redemption").asLong());
        }

        @Test
        public void sc2_2051_usaReplacement_cashCoupons_noReinvestment() {
            JsonNode repl = slot(year(sc2, 2051), "US912810SP49_repl");
            assertTrue("isReplacement=true", repl.path("isReplacement").asBoolean());
            assertEquals("matYear=2060", 2060, repl.path("matYear").asInt());
            assertTrue("replCoupon>0", repl.path("replCoupon").asLong() > 0);
            assertEquals("reinvested=0 (coupons→cash)", 0, repl.path("reinvested").asLong());
        }

        @Test
        public void sc2_portVal_constant_between_2051_and_2060_because_cashCoupons() {
            long pv2051 = slot(year(sc2, 2051), "US912810SP49_repl").path("portVal").asLong();
            long pv2060 = slot(year(sc2, 2060), "US912810SP49_repl").path("portVal").asLong();
            assertNear(pv2060, pv2051, "portVal constant 2051→2060");
        }

        @Test
        public void sc2_2060_replRedemption_equals_portVal() {
            JsonNode repl = slot(year(sc2, 2060), "US912810SP49_repl");
            assertNear(repl.path("redemption").asLong(), repl.path("portVal").asLong(),
                "redemption vs portVal 2060");
        }

        @Test
        public void sc2_2051_replCouponRatio_is_279pct() {
            JsonNode repl   = slot(year(sc2, 2051), "US912810SP49_repl");
            long coupon     = repl.path("replCoupon").asLong();
            long pv         = repl.path("portVal").asLong();
            double ratioPct = (double) coupon / pv * 100.0;
            assertEquals("replCoupon/portVal ≈2.79%", 2.79, ratioPct, 0.20);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // INVARIANTS — structural checks that must hold for any simulation
    // ═══════════════════════════════════════════════════════════════════════
    // =========================================================================
    // SCENARIO C - Annual injection (no reinvest, no replacement)
    //   Input:  cg-test-input-injection.json
    //   Verify: 2028 (mass maturity + injection active), 2029 (3 bonds left),
    //           2072 (IT only, final redemption)
    // =========================================================================

    public static class ScenarioInjectionTest {

        private JsonNode root;
        private JsonNode sc2;

        @Before
        public void setUp() throws Exception {
            root = runSim("cg-test-input-injection.json");
            sc2  = scenario(root, "sc_2");
        }

        // ── Year 2028: all 8 bonds present, injection has grown portVal ─────

        @Test
        public void sc2_2028_allEightBondsPresent() {
            assertEquals("all 8 bonds in perSlot 2028",
                8, year(sc2, 2028).path("perSlot").size());
        }

        @Test
        public void sc2_2028_belgioRedemptionPresent() {
            // BELGIO matures 2028: redemption > 0
            JsonNode be = slot(year(sc2, 2028), "BE0000291972");
            assertTrue("BELGIO redemption > 0", be.path("redemption").asLong() > 0);
            assertNear(be.path("redemption").asLong(), 2054, "BELGIO redemption 2028");
        }

        @Test
        public void sc2_2028_injectionGrowsItPortVal() {
            // IT portVal should be > investedEur (2000) because injection added units
            JsonNode it = slot(year(sc2, 2028), "IT0005441883");
            assertTrue("IT portVal > initial 2000 (injection effect)",
                it.path("portVal").asLong() > 2000);
        }

        @Test
        public void sc2_2028_noReinvestment() {
            // injection scenario has no coupon reinvest
            assertEquals("reinvested=0 (no reinvest scenario)",
                0, year(sc2, 2028).path("reinvested").asLong());
        }

        // ── Year 2029: only IT + USA + GB remain ────────────────────────────

        @Test
        public void sc2_2029_onlyThreeBondsRemain() {
            assertEquals("3 bonds in perSlot 2029 (IT + USA + GB)",
                3, year(sc2, 2029).path("perSlot").size());
        }

        @Test
        public void sc2_2029_bondsValGreaterThanIn2028() {
            // Injection accumulates year over year: bondsVal in 2029 > 2028
            long bv2028 = year(sc2, 2028).path("bondsVal").asLong();
            long bv2029 = year(sc2, 2029).path("bondsVal").asLong();
            assertTrue("bondsVal grows 2028→2029 due to injection: "
                + bv2028 + " -> " + bv2029, bv2029 > bv2028);
        }

        @Test
        public void sc2_2029_itPortValGrown() {
            // IT portVal 2029 > IT portVal 2028 (injection keeps buying IT units)
            long pv2028 = slot(year(sc2, 2028), "IT0005441883").path("portVal").asLong();
            long pv2029 = slot(year(sc2, 2029), "IT0005441883").path("portVal").asLong();
            assertTrue("IT portVal grows 2028→2029: " + pv2028 + " -> " + pv2029,
                pv2029 > pv2028);
        }

        // ── Year 2072: IT only, final maturity ──────────────────────────────

        @Test
        public void sc2_2072_onlyItRemains() {
            assertEquals("only IT in perSlot 2072", 1, year(sc2, 2072).path("perSlot").size());
            assertEquals("IT0005441883", slot(year(sc2, 2072), "IT0005441883").path("isin").asText());
        }

        @Test
        public void sc2_2072_bondsValIsZero() {
            // Final year: bond redeemed → bondsVal = 0
            assertEquals("bondsVal=0 at final maturity",
                0, year(sc2, 2072).path("bondsVal").asLong());
        }

        @Test
        public void sc2_2072_redemptionGreaterThanPortVal() {
            // IT quotes ~61 (well below par) — redemption at face (100×qty) > market portVal
            JsonNode it = slot(year(sc2, 2072), "IT0005441883");
            long redemption = it.path("redemption").asLong();
            long portVal    = it.path("portVal").asLong();
            assertTrue("redemption (" + redemption + ") > portVal (" + portVal + ") for below-par bond",
                redemption > portVal);
            // Sanity: redemption is in the right ballpark (injection accumulated ~46yr × €125)
            assertNear(redemption, 52920, "IT redemption 2072 absolute value");
        }

        @Test
        public void sc2_2072_redemptionGreaterThanInitialInvestment() {
            // Injection has accumulated over 46 years: final redemption >> initial 2000
            long redemption = slot(year(sc2, 2072), "IT0005441883").path("redemption").asLong();
            assertTrue("IT redemption (" + redemption + ") >> initial 2000 (injection accumulated)",
                redemption > 20000);
        }
    }


    public static class InvariantsTest {

        @Test
        public void belgio_noNegativeMonetaryValues() throws Exception {
            assertNoNegativeValues(runSim("cg-test-input-belgio.json"));
        }

        @Test
        public void usa_noNegativeMonetaryValues() throws Exception {
            assertNoNegativeValues(runSim("cg-test-input-usa.json"));
        }

        @Test
        public void belgio_sc1_neverHasReplacementSlots() throws Exception {
            assertSc1NoReplacement(runSim("cg-test-input-belgio.json"));
        }

        @Test
        public void usa_sc1_neverHasReplacementSlots() throws Exception {
            assertSc1NoReplacement(runSim("cg-test-input-usa.json"));
        }

        @Test
        public void belgio_sc2BondsVal_greaterThan_sc1_in_2029() throws Exception {
            JsonNode root = runSim("cg-test-input-belgio.json");
            long bv1 = year(scenario(root, "sc_1"), 2029).path("bondsVal").asLong();
            long bv2 = year(scenario(root, "sc_2"), 2029).path("bondsVal").asLong();
            assertTrue("sc_2 bondsVal (" + bv2 + ") > sc_1 (" + bv1 + ") at 2029", bv2 > bv1);
        }

        @Test
        public void usa_sc2BondsVal_greaterThan_sc1_in_2051() throws Exception {
            JsonNode root = runSim("cg-test-input-usa.json");
            long bv1 = year(scenario(root, "sc_1"), 2051).path("bondsVal").asLong();
            long bv2 = year(scenario(root, "sc_2"), 2051).path("bondsVal").asLong();
            assertTrue("sc_2 bondsVal (" + bv2 + ") > sc_1 (" + bv1 + ") at 2051", bv2 > bv1);
        }

        @Test
        public void injection_noNegativeMonetaryValues() throws Exception {
            assertNoNegativeValues(runSim("cg-test-input-injection.json"));
        }

        @Test
        public void injection_noReplacementSlots() throws Exception {
            JsonNode root = runSim("cg-test-input-injection.json");
            JsonNode sc2  = scenario(root, "sc_2");
            for (JsonNode y : sc2.path("years")) {
                for (JsonNode s : y.path("perSlot")) {
                    assertFalse("injection scenario should never have replacement slots yr=" + y.path("yr").asInt(),
                        s.path("isReplacement").asBoolean());
                }
            }
        }

        // ── Private assertion helpers ────────────────────────────────────

        private static void assertNoNegativeValues(JsonNode root) {
            for (JsonNode sc : root.path("scenarioResults")) {
                for (JsonNode y : sc.path("years")) {
                    int yr = y.path("yr").asInt();
                    assertTrue("coupons>=0 yr="     + yr, y.path("coupons").asLong()     >= 0);
                    assertTrue("redemptions>=0 yr=" + yr, y.path("redemptions").asLong() >= 0);
                    assertTrue("bondsVal>=0 yr="    + yr, y.path("bondsVal").asLong()    >= 0);
                    for (JsonNode s : y.path("perSlot")) {
                        assertTrue("portVal>=0 slot=" + s.path("isin").asText() + " yr=" + yr,
                            s.path("portVal").asLong() >= 0);
                    }
                }
            }
        }

        private static void assertSc1NoReplacement(JsonNode root) {
            JsonNode sc1 = scenario(root, "sc_1");
            for (JsonNode y : sc1.path("years")) {
                for (JsonNode s : y.path("perSlot")) {
                    assertFalse("sc_1 should never have replacement slots yr=" + y.path("yr").asInt(),
                        s.path("isReplacement").asBoolean());
                }
            }
        }
    }
}
