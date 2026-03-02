package bond.sim;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.Before;
import org.junit.Test;
import org.junit.experimental.runners.Enclosed;
import org.junit.runner.RunWith;

import static bond.sim.CapitalGrowthSimTest.*;
import static org.junit.Assert.*;

/**
 * BondFX Capital Growth — regression tests for staggered multi-replacement
 * where a bond matures in a later year (2050) after all other original bonds
 * have already been replaced.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BUG: "totalFace==0 blocks replacement creation"
 *
 * When XS2109813142 matures in 2050, ALL other original bonds have already
 * matured and been replaced by replacement slots (_isReplacement=true).
 * The old code computed:
 *
 *   totalFace = refPool.filter(!_isReplacement).sum(units × face)  →  0
 *
 * Then gated ALL logic (including replacement-slot creation) on:
 *
 *   if (cashIn > 0 && totalFace > 0)  →  false  →  cash += cashIn
 *
 * So the XS2109813142→2060 replacement was never created.
 *
 * FIX: replacement-slot creation (Phase A) is now unconditional on cashIn>0.
 *      otherCash distribution (Phase B) is the only part gated on totalFace>0.
 *
 * Additional fix: `_srcIsin` field on replSlot so displayIsin uses the correct
 * per-slot source ISIN (not always the primary).
 *
 * IMPORTANT — "activation year" vs "first visible year":
 *   The engine builds perSlot for year Y BEFORE pushing new replSlots to the
 *   pool in that same year. Therefore a replSlot activated in year Y is only
 *   visible in perSlot starting from year Y+1.
 *   Example: XS1313004928 matures in 2035 → XS1313004928_repl visible from 2036.
 *            XS2908645265 matures in 2044 → XS2908645265_repl visible from 2045.
 *            XS2109813142 matures in 2050 → XS2109813142_repl visible from 2051.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Portfolio (cg-test-input-staggered-repl.json):
 *   ROMANIA   XS1313004928  mat=2035  → repl mat=2045  reinvest=true
 *   BULGARIA  XS3124345631  mat=2035  → repl mat=2050  reinvest=false
 *   UNGHERIA  XS2181689659  mat=2035  → repl mat=2055  reinvest=true
 *   ROMANIA2  XS2109813142  mat=2050  → repl mat=2060  reinvest=false  ← REGRESSION BOND
 *   ROMANIA3  XS2908645265  mat=2044  → repl mat=2065  reinvest=true
 *
 * Fixture: src/test/js/cg-test-input-staggered-repl.json
 */
@RunWith(Enclosed.class)
public class CapitalGrowthSimStaggeredReplTest {

    static final String FIXTURE = "cg-test-input-staggered-repl.json";

    // ══════════════════════════════════════════════════════════════════════════
    // REGRESSION: XS2109813142 → 2060 must be created when XS2109813142 matures
    // This is the core fix — without it the replacement simply did not appear.
    // The slot is visible from yr=2051 (year after the 2050 activation year).
    // ══════════════════════════════════════════════════════════════════════════

    public static class Romania2050ReplacementRegressionTest {

        private JsonNode sc1;

        @Before
        public void setUp() throws Exception {
            sc1 = scenario(runSim(FIXTURE), "sc_1");
        }

        /**
         * XS2109813142_repl first appears in perSlot in yr=2051.
         * The replSlot is pushed to the pool during yr=2050 processing (Phase A),
         * AFTER perSlot for yr=2050 is already built — same pattern as all other waves.
         * Before the totalFace==0 fix this slot was never created at all.
         */
        @Test
        public void sc1_2051_romania2Repl_present() {
            JsonNode repl = slot(year(sc1, 2051), "XS2109813142_repl");
            assertTrue("XS2109813142_repl must be a replacement slot",
                repl.path("isReplacement").asBoolean());
        }

        /**
         * The replacement slot must carry the correct maturity year (2060).
         */
        @Test
        public void sc1_2051_romania2Repl_matYear_is_2060() {
            assertEquals("XS2109813142_repl matYear",
                2060, slot(year(sc1, 2051), "XS2109813142_repl").path("matYear").asInt());
        }

        /**
         * The replacement slot's portVal must be > 0 in yr=2051.
         */
        @Test
        public void sc1_2051_romania2Repl_portValPositive() {
            long pv = slot(year(sc1, 2051), "XS2109813142_repl").path("portVal").asLong();
            assertTrue("XS2109813142_repl portVal > 0 in 2051: got " + pv, pv > 0);
        }

        /**
         * replacementActivated must be true in 2050 (XS2109813142 matures → replaces).
         */
        @Test
        public void sc1_2050_replacementActivated() {
            assertTrue("replacementActivated=true in 2050",
                year(sc1, 2050).path("replacementActivated").asBoolean());
        }

        /**
         * XS2109813142_repl must still be present in 2059 (one year before its maturity).
         */
        @Test
        public void sc1_2059_romania2Repl_stillPresent() {
            long pv = slot(year(sc1, 2059), "XS2109813142_repl").path("portVal").asLong();
            assertTrue("XS2109813142_repl portVal > 0 in 2059: got " + pv, pv > 0);
        }

        /**
         * XS2109813142_repl matures in 2060: redemption ≈ portVal.
         */
        @Test
        public void sc1_2060_romania2Repl_redeems() {
            JsonNode repl = slot(year(sc1, 2060), "XS2109813142_repl");
            long redemption = repl.path("redemption").asLong();
            long portVal    = repl.path("portVal").asLong();
            assertTrue("XS2109813142_repl redemption > 0 in 2060", redemption > 0);
            assertNear(redemption, portVal, "XS2109813142_repl redemption ≈ portVal in 2060");
        }

        /**
         * Because reinvestCoupons=false for XS2109813142_repl, portVal must be
         * approximately constant between 2051 and 2059.
         */
        @Test
        public void sc1_romania2Repl_portValConstant_2051to2059() {
            long pv2051 = slot(year(sc1, 2051), "XS2109813142_repl").path("portVal").asLong();
            long pv2059 = slot(year(sc1, 2059), "XS2109813142_repl").path("portVal").asLong();
            assertNear(pv2059, pv2051,
                "XS2109813142_repl portVal constant 2051→2059 (reinvestCoupons=false)");
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 2035 WAVE — three bonds mature simultaneously
    // replSlots activated in 2035 → visible in perSlot from 2036
    // ══════════════════════════════════════════════════════════════════════════

    public static class Wave2035Test {

        private JsonNode sc1;

        @Before
        public void setUp() throws Exception {
            sc1 = scenario(runSim(FIXTURE), "sc_1");
        }

        /**
         * In yr=2035 the 3 original bonds appear with redemption>0; their
         * replacement slots are pushed to the pool after perSlot is built,
         * so they only appear in perSlot from yr=2036.
         */
        @Test
        public void sc1_2035_originalBondsRedeemedInActivationYear() {
            JsonNode y = year(sc1, 2035);
            assertTrue("XS1313004928 redemption>0 in 2035",
                slot(y, "XS1313004928").path("redemption").asLong() > 0);
            assertTrue("XS3124345631 redemption>0 in 2035",
                slot(y, "XS3124345631").path("redemption").asLong() > 0);
            assertTrue("XS2181689659 redemption>0 in 2035",
                slot(y, "XS2181689659").path("redemption").asLong() > 0);
        }

        @Test
        public void sc1_2036_allThreeWaveReplacementsPresent() {
            JsonNode y = year(sc1, 2036);
            assertTrue("XS1313004928_repl present in 2036",
                slot(y, "XS1313004928_repl").path("isReplacement").asBoolean());
            assertTrue("XS3124345631_repl present in 2036",
                slot(y, "XS3124345631_repl").path("isReplacement").asBoolean());
            assertTrue("XS2181689659_repl present in 2036",
                slot(y, "XS2181689659_repl").path("isReplacement").asBoolean());
        }

        @Test
        public void sc1_2036_waveReplacement_correctMatYears() {
            JsonNode y = year(sc1, 2036);
            assertEquals("XS1313004928_repl matYear=2045",
                2045, slot(y, "XS1313004928_repl").path("matYear").asInt());
            assertEquals("XS3124345631_repl matYear=2050",
                2050, slot(y, "XS3124345631_repl").path("matYear").asInt());
            assertEquals("XS2181689659_repl matYear=2055",
                2055, slot(y, "XS2181689659_repl").path("matYear").asInt());
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 2044 WAVE — XS2908645265 matures alone while three replacements are live
    // replSlot activated in 2044 → visible in perSlot from 2045
    // ══════════════════════════════════════════════════════════════════════════

    public static class Wave2044Test {

        private JsonNode sc1;

        @Before
        public void setUp() throws Exception {
            sc1 = scenario(runSim(FIXTURE), "sc_1");
        }

        @Test
        public void sc1_2044_romania3_redeemedInActivationYear() {
            assertTrue("XS2908645265 redemption>0 in 2044",
                slot(year(sc1, 2044), "XS2908645265").path("redemption").asLong() > 0);
        }

        @Test
        public void sc1_2044_replacementActivated() {
            assertTrue("replacementActivated=true in 2044",
                year(sc1, 2044).path("replacementActivated").asBoolean());
        }

        @Test
        public void sc1_2045_romania3Repl_present_and_correct() {
            // XS2908645265 matures in 2044; its repl slot appears in perSlot from 2045
            JsonNode repl = slot(year(sc1, 2045), "XS2908645265_repl");
            assertTrue("XS2908645265_repl isReplacement=true",
                repl.path("isReplacement").asBoolean());
            assertEquals("XS2908645265_repl matYear=2065",
                2065, repl.path("matYear").asInt());
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // LIFECYCLE INVARIANTS — slot counts across the full timeline
    // ══════════════════════════════════════════════════════════════════════════

    public static class LifecycleInvariantsTest {

        private JsonNode sc1;

        @Before
        public void setUp() throws Exception {
            sc1 = scenario(runSim(FIXTURE), "sc_1");
        }

        /**
         * 2026–2034: only 5 original bonds, no replacement slots.
         */
        @Test
        public void sc1_before2035_noReplacementSlots() {
            for (JsonNode y : sc1.path("years")) {
                int yr = y.path("yr").asInt();
                if (yr >= 2035) continue;
                for (JsonNode s : y.path("perSlot")) {
                    assertFalse("No replacement slot before 2035, yr=" + yr,
                        s.path("isReplacement").asBoolean());
                }
                assertEquals("5 original bonds before 2035, yr=" + yr,
                    5, y.path("perSlot").size());
            }
        }

        /**
         * 2036–2043: exactly 3 replacement slots (2035 wave).
         * XS2908645265 (mat=2044) and XS2109813142 (mat=2050) still alive as originals.
         */
        @Test
        public void sc1_2036to2043_threeReplAndTwoOriginals() {
            for (int yr = 2036; yr <= 2043; yr++) {
                JsonNode y = year(sc1, yr);
                long replCount = 0;
                for (JsonNode s : y.path("perSlot")) {
                    if (s.path("isReplacement").asBoolean()) replCount++;
                }
                assertEquals("3 replacement slots in yr=" + yr, 3, replCount);
                assertTrue("XS2908645265 present in yr=" + yr,
                    slot(y, "XS2908645265").path("portVal").asLong() > 0);
                assertTrue("XS2109813142 present in yr=" + yr,
                    slot(y, "XS2109813142").path("portVal").asLong() > 0);
            }
        }

        /**
         * 2045: XS1313004928_repl redeems (still in perSlot with redemption>0),
         * XS2908645265_repl appears for the first time (activated in 2044).
         * Total replacement slots = 4:
         *   XS1313004928_repl (redeeming), XS3124345631_repl, XS2181689659_repl,
         *   XS2908645265_repl (new).
         * Plus XS2109813142 original still alive.
         */
        @Test
        public void sc1_2045_fourReplsAndOneOriginal() {
            JsonNode y = year(sc1, 2045);
            long replCount = 0;
            for (JsonNode s : y.path("perSlot")) {
                if (s.path("isReplacement").asBoolean()) replCount++;
            }
            assertEquals("4 replacement slots in yr=2045", 4, replCount);
            assertTrue("XS2109813142 original bond present in 2045",
                slot(y, "XS2109813142").path("portVal").asLong() > 0);
        }

        /**
         * 2051–2054: after 2050 wave. XS3124345631_repl (mat=2050) and
         * XS2109813142 (mat=2050) both expire; XS2109813142_repl (mat=2060) appears.
         * Surviving: XS2181689659_repl (2055), XS2908645265_repl (2065), XS2109813142_repl (2060).
         */
        @Test
        public void sc1_2051to2054_exactlyThreeReplsNoOriginals() {
            for (int yr = 2051; yr <= 2054; yr++) {
                JsonNode y = year(sc1, yr);
                long replCount = 0;
                for (JsonNode s : y.path("perSlot")) {
                    if (s.path("isReplacement").asBoolean()) replCount++;
                }
                assertEquals("3 replacement slots in yr=" + yr, 3, replCount);
            }
        }

        /**
         * No negative monetary values anywhere in the simulation.
         */
        @Test
        public void sc1_noNegativeMonetaryValues() {
            for (JsonNode y : sc1.path("years")) {
                int yr = y.path("yr").asInt();
                assertTrue("coupons>=0 yr="     + yr, y.path("coupons").asLong()     >= 0);
                assertTrue("redemptions>=0 yr=" + yr, y.path("redemptions").asLong() >= 0);
                assertTrue("bondsVal>=0 yr="    + yr, y.path("bondsVal").asLong()    >= 0);
                for (JsonNode s : y.path("perSlot")) {
                    assertTrue("portVal>=0 slot=" + s.path("isin").asText() + " yr=" + yr,
                        s.path("portVal").asLong() >= 0);
                    assertTrue("replCoupon>=0 slot=" + s.path("isin").asText() + " yr=" + yr,
                        s.path("replCoupon").asLong() >= 0);
                }
            }
        }

        /**
         * Total redemptions across the full simulation must significantly exceed
         * the initial capital (4000+3000+3000+5000+5000 = 20000).
         * Each replacement runs 10+ years at netCouponPct=5.09%; reinvesting ones
         * compound — so the sum of all redemptions must be well above initial invest.
         */
        @Test
        public void sc1_totalRedemptions_exceedInitialCapital() {
            long totalRedemp = 0;
            for (JsonNode y : sc1.path("years")) {
                totalRedemp += y.path("redemptions").asLong();
            }
            assertTrue("Total redemptions across full sim > 22000 (initial=20000). Got: " + totalRedemp,
                totalRedemp > 22_000);
        }
    }
}
