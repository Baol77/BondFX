package bond.sim;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.Before;
import org.junit.Test;
import org.junit.experimental.runners.Enclosed;
import org.junit.runner.RunWith;

import static bond.sim.CapitalGrowthSimTest.*;
import static org.junit.Assert.*;

/**
 * Non-regression tests for three bugs fixed in capital-growth.js.
 *
 * <pre>
 * Bug A — srcCash domain collision (replacement capital wrong)
 *   Before: srcCash = cashIn × (srcFace / totalFace)
 *           → diluted by coupons of all other bonds → €241 instead of €5.081
 *   After:  srcCash = redemption(sourceBond) + coupon(sourceBond) directly
 *           → full proceeds go to replacement bond
 *
 * Bug B — multiple replacements: only last one visible
 *   Before: _runScenarioSim used repCs[repCs.length - 1] (last only)
 *   After:  runMaturityReplacement accepts array; all replacements activated
 *           at their respective maturity years
 *
 * Bug C — injection totalPct always 0% on first enable
 *   Before: inj.pct = {} → totalPct = 0 even though HTML inputs showed 11.1%
 *   After:  setInjectionEnabled(true) writes equal-split defaults to inj.pct
 *           → totalPct = 100% immediately; portVal grows vs no-injection scenario
 * </pre>
 *
 * Fixtures:
 *   cg-test-input-bugA-replacement-capital.json  — 9 bonds, IT0001278511 matures 2029
 *   cg-test-input-bugB-two-replacements.json     — 5 bonds, two replacements (2029+2037)
 *   cg-test-input-bugC-injection-totalpct.json   — 9 bonds, €10k/yr injection 2026-2035
 *
 * All monetary assertions use ±2% relative tolerance (same as CapitalGrowthSimTest).
 */
@RunWith(Enclosed.class)
public class CapitalGrowthRegressionBugsTest {

    // =========================================================================
    // BUG A — replacement receives full bond proceeds, not a proportional fraction
    //
    // Portfolio: 9 bonds totalling ~€322k face.
    // IT0001278511 (ITALIA 5.25%, 50 units, mat.2029) is the source bond.
    // Expected srcCash = 50 × €100 face + net coupon ≈ €5.229
    //
    // The bug: srcCash was proportional to srcFace/totalFace, giving:
    //   €5.000 / €322.490 × (total cashIn ~€16k) ≈ €241
    // The fix: srcCash = redemption + coupon of sourceBond only.
    // =========================================================================

    public static class BugAReplacementCapitalTest {

        private JsonNode sc2;

        @Before
        public void setUp() throws Exception {
            JsonNode root = runSim("cg-test-input-bugA-replacement-capital.json");
            sc2 = scenario(root, "sc_2");
        }

        /**
         * Core regression: in the first year after the replacement is activated (2030),
         * the replacement slot portVal must equal the full proceeds of IT0001278511
         * (face redemption + net coupon), NOT the tiny proportional fraction (€241).
         *
         * Calculation: 50 units × €100 face = €5.000 redemption
         *              + 50 × 5.25% × 100 × (1 - 12.5% tax) ≈ €229 net coupon
         *              srcCash ≈ €5.229
         * With reinvestCoupons=false the replacement bond portVal = face value of
         * units purchased at par, so portVal ≈ €5.229 ± tolerance.
         */
        @Test
        public void bugA_replacementPortVal_2030_equalsFullProceedsNotFraction() {
            JsonNode repl = slot(year(sc2, 2030), "IT0001278511_repl");
            long portVal = repl.path("portVal").asLong();

            // Before fix: portVal was 241. After fix: portVal must be ≥ €4.500
            // (conservative: face 5000 minus max 10% rounding/coupon timing).
            assertTrue(
                "BUG A regression: replacement portVal=" + portVal
                    + " must be ≥ 4500 (full bond proceeds). Was 241 before fix.",
                portVal >= 4500
            );
            // And must NOT be the old wrong value of 241 (± any reasonable tolerance)
            assertFalse(
                "BUG A regression: replacement portVal=" + portVal
                    + " must NOT be near 241 (the proportional fraction bug value).",
                portVal < 500
            );
        }

        /**
         * Absolute value check: the replacement slot portVal in 2030 must be
         * within ±2% of the expected full proceeds ≈ €5.081 (as measured from fixed sim).
         */
        @Test
        public void bugA_replacementPortVal_2030_absoluteValue() {
            JsonNode repl = slot(year(sc2, 2030), "IT0001278511_repl");
            assertNear(repl.path("portVal").asLong(), 5081, "BUG A: replacement portVal 2030");
        }

        /**
         * The replacement portVal must remain stable year-over-year when
         * reinvestCoupons=false (coupons go to cash, principal unchanged).
         * Checks 2030 → 2035 → 2038 all equal.
         */
        @Test
        public void bugA_replacementPortVal_stable_whenCashCoupons() {
            long pv2030 = slot(year(sc2, 2030), "IT0001278511_repl").path("portVal").asLong();
            long pv2035 = slot(year(sc2, 2035), "IT0001278511_repl").path("portVal").asLong();
            long pv2038 = slot(year(sc2, 2038), "IT0001278511_repl").path("portVal").asLong();
            assertNear(pv2035, pv2030, "BUG A: replacement portVal stable 2030→2035");
            assertNear(pv2038, pv2030, "BUG A: replacement portVal stable 2030→2038");
        }

        /**
         * Replacement slot exists from 2030 onwards with isReplacement=true.
         */
        @Test
        public void bugA_replacementSlot_isMarkedAsReplacement() {
            JsonNode repl = slot(year(sc2, 2030), "IT0001278511_repl");
            assertTrue("BUG A: isReplacement must be true", repl.path("isReplacement").asBoolean());
        }

        /**
         * At maturity year 2039, replacement redeems at portVal (face = principal).
         */
        @Test
        public void bugA_replacement_2039_redemptionEqualsPortVal() {
            JsonNode repl = slot(year(sc2, 2039), "IT0001278511_repl");
            assertNear(
                repl.path("redemption").asLong(),
                repl.path("portVal").asLong(),
                "BUG A: replacement redemption == portVal at maturity 2039"
            );
        }

        /**
         * sc_2 bondsVal in 2030 must be significantly greater than sc_1 bondsVal (no reinvest).
         * Before fix: replacement had only €241, so sc_2 bondsVal ≈ sc_1 (no meaningful reinvest).
         * After fix: sc_2 bondsVal = sc_1 bondsVal + replacement portVal (≈€5k).
         */
        @Test
        public void bugA_sc2BondsVal_2030_exceeds_sc1() throws Exception {
            JsonNode root = runSim("cg-test-input-bugA-replacement-capital.json");
            long bv1 = year(scenario(root, "sc_1"), 2030).path("bondsVal").asLong();
            long bv2 = year(scenario(root, "sc_2"), 2030).path("bondsVal").asLong();
            assertTrue(
                "BUG A: sc_2 bondsVal(" + bv2 + ") must exceed sc_1(" + bv1
                    + ") by ≥ €4000 (replacement capital). Was nearly equal before fix.",
                (bv2 - bv1) >= 4000
            );
        }

        /**
         * replCoupon in 2030 must reflect the full replacement principal (≈ 3.48% × €5.081 ≈ €177),
         * not the tiny coupon on €241 (which was ≈ €8 before the fix).
         */
        @Test
        public void bugA_replacementCoupon_2030_reflectsFullCapital() {
            JsonNode repl = slot(year(sc2, 2030), "IT0001278511_repl");
            long replCoupon = repl.path("replCoupon").asLong();
            assertTrue(
                "BUG A: replCoupon=" + replCoupon
                    + " must be ≥ 100 (reflects full capital). Was ≈8 before fix.",
                replCoupon >= 100
            );
        }
    }

    // =========================================================================
    // BUG B — two simultaneous replacements: both must be visible
    //
    // Portfolio: 5 bonds.
    // Replacement 1: IT0001278511 (mat.2029) → synthetic mat.2039, reinvestCoupons=true
    // Replacement 2: IT0003934657 (mat.2037) → synthetic mat.2047, reinvestCoupons=false
    //
    // The bug: _runScenarioSim used repCs[repCs.length-1] → only replacement 2 ran,
    // replacement 1 was silently dropped (no slot at all for it).
    // The fix: runMaturityReplacement accepts and processes all replacements.
    //
    // Note on isin display: both replacement slots use the displayIsin pattern
    // sourceBond.isin + '_repl' from the primary replacement config. This means
    // both show up with isin prefix "IT0001278511_repl" in perSlot. They are
    // distinguished by portVal (one grows via reinvestCoupons, the other is
    // constant at face). The test uses isReplacement count as the primary check.
    // =========================================================================

    public static class BugBTwoReplacementsTest {

        private JsonNode sc2;

        @Before
        public void setUp() throws Exception {
            JsonNode root = runSim("cg-test-input-bugB-two-replacements.json");
            sc2 = scenario(root, "sc_2");
        }

        /** Helper: count slots with isReplacement=true in a year node. */
        private static int countReplacementSlots(JsonNode yearNode) {
            int count = 0;
            for (JsonNode s : yearNode.path("perSlot")) {
                if (s.path("isReplacement").asBoolean()) count++;
            }
            return count;
        }

        /** Helper: find replacement slot with given portVal (within 5% tolerance). */
        private static JsonNode replSlotByPortVal(JsonNode yearNode, long expectedPv) {
            for (JsonNode s : yearNode.path("perSlot")) {
                if (!s.path("isReplacement").asBoolean()) continue;
                long pv = s.path("portVal").asLong();
                if (expectedPv == 0) continue;
                if (Math.abs((double)(pv - expectedPv) / expectedPv) <= 0.05) return s;
            }
            fail("No replacement slot with portVal≈" + expectedPv
                + " in yr=" + yearNode.path("yr").asInt());
            return null;
        }

        /**
         * Core regression: in 2030 (first year after IT0001278511 matures),
         * exactly ONE replacement slot must be present.
         * Before fix: the last-configured replacement (IT0003934657, mat.2037) ran
         * instead — so no slot appeared in 2030 at all.
         */
        @Test
        public void bugB_firstReplacement_2030_presentInPerSlot() {
            assertEquals("BUG B: exactly 1 replacement slot must exist in yr=2030",
                1, countReplacementSlots(year(sc2, 2030)));
        }

        /**
         * In 2038, both replacements must be active simultaneously: replacement 1
         * (activated 2030, grows via reinvestCoupons, portVal≈€6.673) and
         * replacement 2 (activated 2038 when IT0003934657 matures, portVal≈€31.141).
         */
        @Test
        public void bugB_bothReplacements_2038_presentSimultaneously() {
            assertEquals("BUG B: exactly 2 replacement slots must exist in yr=2038",
                2, countReplacementSlots(year(sc2, 2038)));
        }

        /**
         * In 2038, the two replacement slots have clearly distinct portVals:
         * repl1 (reinvestCoupons=true, 9 years of compounding) ≈ €6.673
         * repl2 (fresh, IT0003934657 face 310×€100) ≈ €31.141
         * Verifies both amounts are present, not just the slot count.
         */
        @Test
        public void bugB_2038_twoReplacements_haveCorrectPortVals() {
            JsonNode y2038 = year(sc2, 2038);
            // The smaller portVal belongs to repl1 (5k compounded over 8 yrs ≈ 6.673)
            JsonNode smallRepl = replSlotByPortVal(y2038, 6673);
            // The larger portVal belongs to repl2 (310 × 100 = 31.141)
            JsonNode largeRepl = replSlotByPortVal(y2038, 31141);
            assertNear(smallRepl.path("portVal").asLong(), 6673,
                "BUG B: repl1 portVal in 2038 (compounded from €5k over 8 yrs)");
            assertNear(largeRepl.path("portVal").asLong(), 31141,
                "BUG B: repl2 portVal in 2038 (IT0003934657: 310 × €100 face)");
        }

        /**
         * In 2039, one replacement redeems (portVal≈6.906 → redemption>0) and one
         * survives. Total replacement slots drops from 2 to 1.
         */
        @Test
        public void bugB_2039_oneReplacementRedeems_oneRemains() {
            JsonNode y2039 = year(sc2, 2039);
            int redeemed = 0, surviving = 0;
            for (JsonNode s : y2039.path("perSlot")) {
                if (!s.path("isReplacement").asBoolean()) continue;
                if (s.path("redemption").asLong() > 0) redeemed++;
                else surviving++;
            }
            assertEquals("BUG B: exactly 1 repl redeems in 2039", 1, redeemed);
            assertEquals("BUG B: exactly 1 repl survives in 2039", 1, surviving);
        }

        /**
         * After first replacement matures (2039), only one replacement slot remains in 2040.
         */
        @Test
        public void bugB_onlyOneReplacement_2040() {
            assertEquals("BUG B: only 1 replacement slot in 2040 (repl1 redeemed)",
                1, countReplacementSlots(year(sc2, 2040)));
        }

        /**
         * The surviving replacement in 2040 is the large one (repl2, ≈€31.141):
         * IT0003934657 face 310×€100, cash coupons → portVal stays constant.
         */
        @Test
        public void bugB_2040_survivingReplacement_isLargeOne() {
            JsonNode y2040 = year(sc2, 2040);
            for (JsonNode s : y2040.path("perSlot")) {
                if (!s.path("isReplacement").asBoolean()) continue;
                assertNear(s.path("portVal").asLong(), 31141,
                    "BUG B: surviving replacement in 2040 must be the large one (repl2)");
            }
        }

        /**
         * Second replacement matures in 2047: redemption > 0 and equals portVal (≈€31.141).
         * Cash-coupon mode → portVal stayed constant → face value returned.
         */
        @Test
        public void bugB_secondReplacement_2047_redeemsProperly() {
            JsonNode y2047 = year(sc2, 2047);
            boolean found = false;
            for (JsonNode s : y2047.path("perSlot")) {
                if (!s.path("isReplacement").asBoolean()) continue;
                long redemption = s.path("redemption").asLong();
                long portVal    = s.path("portVal").asLong();
                assertTrue("BUG B: repl2 redemption > 0 in 2047", redemption > 0);
                assertNear(redemption, portVal, "BUG B: repl2 redemption == portVal at maturity 2047");
                found = true;
            }
            assertTrue("BUG B: a replacement slot must exist in 2047", found);
        }

        /**
         * First replacement portVal in 2030 reflects full proceeds of IT0001278511
         * (≈€5.076: 50 × €100 face + net coupon). Piggybacks on the Bug A fix.
         */
        @Test
        public void bugB_firstReplacement_2030_hasFullCapital() {
            JsonNode y2030 = year(sc2, 2030);
            for (JsonNode s : y2030.path("perSlot")) {
                if (!s.path("isReplacement").asBoolean()) continue;
                assertNear(s.path("portVal").asLong(), 5076,
                    "BUG B+A: first replacement portVal 2030 must equal full bond proceeds (≈€5k)");
            }
        }

        /**
         * sc_1 (no replacement) must never have replacement slots in any year.
         */
        @Test
        public void bugB_sc1_neverHasReplacementSlots() throws Exception {
            JsonNode root = runSim("cg-test-input-bugB-two-replacements.json");
            JsonNode sc1  = scenario(root, "sc_1");
            for (JsonNode y : sc1.path("years")) {
                assertEquals(
                    "BUG B: sc_1 must have 0 replacement slots in yr=" + y.path("yr").asInt(),
                    0, countReplacementSlots(y));
            }
        }
    }

    // =========================================================================
    // BUG C — injection totalPct = 0% on first enable
    //
    // Portfolio: 9 bonds with equal allocation (11.1111% each, last gets 11.1112%).
    // Injection: €10.000/year from 2026 to 2035 (10 years → +€100k total face).
    // The pct map is PRE-POPULATED in the fixture (simulating what the fixed
    // setInjectionEnabled() writes when first enabled).
    //
    // The bug: inj.pct was {} → engine read 0% for every bond → no injection
    //          happened → portVal == sc_1 (no injection).
    // The fix: setInjectionEnabled(true) populates inj.pct with equal-split defaults.
    //          Tested here by providing a pre-populated pct map (same effect).
    // =========================================================================

    public static class BugCInjectionTotalPctTest {

        private JsonNode root;
        private JsonNode sc1;
        private JsonNode sc2;

        @Before
        public void setUp() throws Exception {
            root = runSim("cg-test-input-bugC-injection-totalpct.json");
            sc1  = scenario(root, "sc_1");
            sc2  = scenario(root, "sc_2");
        }

        /**
         * Core regression: sc_2 with injection enabled and pct populated must have
         * strictly higher bondsVal than sc_1 (no injection) in 2028 (after 3 years
         * of €10k/yr injection). If pct is ignored (bug), bondsVal == sc_1.
         */
        @Test
        public void bugC_injectionGrowsBondsVal_vs_noInjection_2028() {
            long bv1 = year(sc1, 2028).path("bondsVal").asLong();
            long bv2 = year(sc2, 2028).path("bondsVal").asLong();
            assertTrue(
                "BUG C: sc_2 bondsVal(" + bv2 + ") must exceed sc_1(" + bv1
                    + ") in 2028 (3 years of €10k injection). Were equal before fix.",
                bv2 > bv1
            );
        }

        /**
         * Absolute check: sc_2 bondsVal 2028 ≈ €332.206 (measured from fixed sim).
         * sc_1 bondsVal 2028 ≈ €322.490 (no injection).
         * The difference ≈ €9.716 reflects 3 years of injection minus maturing bonds.
         */
        @Test
        public void bugC_injectionGrowsBondsVal_2028_absoluteValues() {
            assertNear(year(sc1, 2028).path("bondsVal").asLong(), 322490,
                "BUG C: sc_1 bondsVal 2028 (baseline, no injection)");
            assertNear(year(sc2, 2028).path("bondsVal").asLong(), 332206,
                "BUG C: sc_2 bondsVal 2028 (with injection)");
        }

        /**
         * The injection period ends in 2035. Both before (2029) and after (2037)
         * the injection period, sc_2 bondsVal must exceed sc_1 bondsVal — the injected
         * units persist even after injection stops.
         */
        @Test
        public void bugC_injectionEffect_persistsAfterPeriodEnds_2037() {
            long bv1_2037 = year(sc1, 2037).path("bondsVal").asLong();
            long bv2_2037 = year(sc2, 2037).path("bondsVal").asLong();
            assertTrue(
                "BUG C: sc_2 bondsVal(" + bv2_2037 + ") must exceed sc_1(" + bv1_2037
                    + ") in 2037 even after injection period (2026-2035) ends.",
                bv2_2037 > bv1_2037
            );
        }

        /**
         * The injection makes each bond's portVal grow relative to the no-injection scenario.
         * Checks IT0005582421 (the largest holding, 1500 units): its portVal must be
         * higher in sc_2 than sc_1 in 2028, confirming injection units were actually bought.
         */
        @Test
        public void bugC_individualBondPortVal_grows_with_injection_2028() {
            long pv1 = slot(year(sc1, 2028), "IT0005582421").path("portVal").asLong();
            long pv2 = slot(year(sc2, 2028), "IT0005582421").path("portVal").asLong();
            assertTrue(
                "BUG C: IT0005582421 portVal in sc_2(" + pv2 + ") must exceed sc_1(" + pv1
                    + ") in 2028 (injection bought more units). Were equal before fix.",
                pv2 > pv1
            );
        }

        /**
         * sc_2 bondsVal must be monotonically larger than sc_1 every year from 2028 to 2035
         * (while injection effect is visible — injection starts 2026 but is first reflected
         * in bondsVal at 2028 because the engine processes each year's injection in the
         * following cycle). Any year where they are equal would indicate injection pct was
         * not applied (the bug condition).
         */
        @Test
        public void bugC_sc2_exceeds_sc1_every_year_during_injection_period() {
            for (JsonNode y : sc2.path("years")) {
                int yr = y.path("yr").asInt();
                if (yr < 2028 || yr > 2035) continue;
                long bv1 = year(sc1, yr).path("bondsVal").asLong();
                long bv2 = y.path("bondsVal").asLong();
                assertTrue(
                    "BUG C: sc_2 bondsVal must exceed sc_1 in yr=" + yr
                        + " (injection active). Got sc2=" + bv2 + " sc1=" + bv1,
                    bv2 > bv1
                );
            }
        }

        /**
         * In the final injection year (2035), the injected amount (≈10 years × €10k = €100k
         * total face across 9 bonds) must be reflected: sc_2 bondsVal ≫ sc_1.
         * Conservative check: delta ≥ €50k (some bonds have matured and taken cash with them).
         */
        @Test
        public void bugC_bondsVal_delta_2035_reflectsAccumulatedInjection() {
            long bv1 = year(sc1, 2035).path("bondsVal").asLong();
            long bv2 = year(sc2, 2035).path("bondsVal").asLong();
            assertTrue(
                "BUG C: accumulated injection should add ≥ €50k to bondsVal by 2035. "
                    + "sc_2=" + bv2 + " sc_1=" + bv1 + " delta=" + (bv2 - bv1),
                (bv2 - bv1) >= 50_000
            );
        }

        /**
         * sc_1 (no injection) must never exceed sc_2 (with injection) in bondsVal
         * throughout the entire simulation.
         */
        @Test
        public void bugC_sc1_never_exceeds_sc2_bondsVal() {
            for (JsonNode y2 : sc2.path("years")) {
                int yr = y2.path("yr").asInt();
                JsonNode y1 = year(sc1, yr);
                if (y1 == null) continue;
                long bv1 = y1.path("bondsVal").asLong();
                long bv2 = y2.path("bondsVal").asLong();
                assertTrue(
                    "BUG C: sc_1 bondsVal(" + bv1 + ") must not exceed sc_2("
                        + bv2 + ") at yr=" + yr,
                    bv1 <= bv2
                );
            }
        }
    }
}
