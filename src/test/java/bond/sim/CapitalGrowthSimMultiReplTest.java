package bond.sim;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.Before;
import org.junit.Test;
import org.junit.experimental.runners.Enclosed;
import org.junit.runner.RunWith;

import static bond.sim.CapitalGrowthSimTest.*;
import static org.junit.Assert.*;

/**
 * BondFX Capital Growth — regression tests for multi-replacement same-year maturity.
 *
 * Scenario under test (cg-test-input-multirepl.json):
 *   Portfolio:
 *     ROMANIA   XS1313004928  priceEur=90.88  coupon=3.88%  mat=2035-10-29  taxRate=12.5%  qty=44.0141  invested=4000
 *     BULGARIA  XS3124345631  priceEur=100.08 coupon=3.38%  mat=2035-07-18  taxRate=12.5%  qty=29.976   invested=3000
 *     UNGHERIA  XS2181689659  priceEur=82.83  coupon=1.75%  mat=2035-06-05  taxRate=12.5%  qty=36.2188  invested=3000
 *
 *   Scenario 1 (sc_1) — couponReinvest=true, globalPriceShift=0, no injection:
 *     maturityReplacement:
 *       XS1313004928 → netCouponPct=4.18, maturityYear=2045, reinvestCoupons=true
 *       XS3124345631 → netCouponPct=4.18, maturityYear=2050, reinvestCoupons=true
 *       XS2181689659 → netCouponPct=4.18, maturityYear=2055, reinvestCoupons=false
 *
 * This fixture specifically exercises the bug where, with multiple replacements
 * all activating in the same year (2035), only the first replacement (ROMANIA)
 * appeared in perSlot for the coupon chart — BULGARIA and UNGHERIA were missing.
 *
 * Root cause: displayIsin in runMaturityReplacement always used `sourceBond.isin`
 * (the primary/first replacement) instead of `sl._srcIsin` (each slot's own source).
 *
 * Fix: replSlot now carries `_srcIsin: rep.sourceBond.isin`, and displayIsin uses
 * `(sl._srcIsin ?? sourceBond.isin) + '_repl'`.
 *
 * Input fixture: src/test/js/cg-test-input-multirepl.json
 *
 * Prerequisites: same as CapitalGrowthSimTest (Node ≥ 18, Jackson Databind).
 */
@RunWith(Enclosed.class)
public class CapitalGrowthSimMultiReplTest {

    static final String FIXTURE = "cg-test-input-multirepl.json";

    // ══════════════════════════════════════════════════════════════════════════
    // ACTIVATION YEAR 2035 — all three bonds mature and replacements activate
    // ══════════════════════════════════════════════════════════════════════════

    public static class ActivationYear2035Test {

        private JsonNode sc1;

        @Before
        public void setUp() throws Exception {
            sc1 = scenario(runSim(FIXTURE), "sc_1");
        }

        /**
         * In yr=2035 (activation year) the engine builds perSlot BEFORE pushing the
         * new replSlots into the pool. Therefore yr=2035 shows the 3 original bonds
         * (each with redemption>0) — the replacement slots first appear in yr=2036.
         * This test verifies the 3 original bonds are redeemed in 2035.
         */
        @Test
        public void sc1_2035_allThreeOriginalBondsRedeemedInActivationYear() {
            JsonNode y = year(sc1, 2035);
            long roRed = slot(y, "XS1313004928").path("redemption").asLong();
            long buRed = slot(y, "XS3124345631").path("redemption").asLong();
            long unRed = slot(y, "XS2181689659").path("redemption").asLong();
            assertTrue("ROMANIA redemption > 0 in 2035", roRed > 0);
            assertTrue("BULGARIA redemption > 0 in 2035", buRed > 0);
            assertTrue("UNGHERIA redemption > 0 in 2035", unRed > 0);
        }

        /**
         * In yr=2036 (first post-activation year) all three replacement slots must
         * appear with their correct source ISIN prefixes.
         * Before the _srcIsin fix, all three had displayIsin = primarySourceBond_repl
         * (always the first bond in the array) instead of their own ISIN.
         */
        @Test
        public void sc1_2036_allThreeReplacementSlotsPresent() {
            JsonNode y = year(sc1, 2036);
            JsonNode roRepl = slot(y, "XS1313004928_repl");
            JsonNode buRepl = slot(y, "XS3124345631_repl");
            JsonNode unRepl = slot(y, "XS2181689659_repl");
            assertTrue("ROMANIA repl isReplacement=true", roRepl.path("isReplacement").asBoolean());
            assertTrue("BULGARIA repl isReplacement=true", buRepl.path("isReplacement").asBoolean());
            assertTrue("UNGHERIA repl isReplacement=true", unRepl.path("isReplacement").asBoolean());
        }

        /**
         * ROMANIA replacement: maturityYear must be 2045 (visible from 2036 onward).
         */
        @Test
        public void sc1_2036_romaniaRepl_matYear_is_2045() {
            JsonNode repl = slot(year(sc1, 2036), "XS1313004928_repl");
            assertEquals("ROMANIA repl matYear", 2045, repl.path("matYear").asInt());
        }

        /**
         * BULGARIA replacement: maturityYear must be 2050.
         */
        @Test
        public void sc1_2036_bulgariaRepl_matYear_is_2050() {
            JsonNode repl = slot(year(sc1, 2036), "XS3124345631_repl");
            assertEquals("BULGARIA repl matYear", 2050, repl.path("matYear").asInt());
        }

        /**
         * UNGHERIA replacement: maturityYear must be 2055.
         */
        @Test
        public void sc1_2036_ungheriaRepl_matYear_is_2055() {
            JsonNode repl = slot(year(sc1, 2036), "XS2181689659_repl");
            assertEquals("UNGHERIA repl matYear", 2055, repl.path("matYear").asInt());
        }

        /**
         * replacementActivated must be true in 2035 (the year all three activate).
         */
        @Test
        public void sc1_2035_replacementActivated_isTrue() {
            assertTrue("replacementActivated in 2035",
                year(sc1, 2035).path("replacementActivated").asBoolean());
        }

        /**
         * In activation year, reinvested must be 0 at header level
         * (proceeds go to "switched", not to reinvested).
         */
        @Test
        public void sc1_2035_headerReinvested_isZero() {
            assertEquals("reinvested=0 in activation year 2035",
                0, year(sc1, 2035).path("reinvested").asLong());
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // POST-ACTIVATION YEARS — each replacement slot generates coupons correctly
    // ══════════════════════════════════════════════════════════════════════════

    public static class PostActivationCouponsTest {

        private JsonNode sc1;

        @Before
        public void setUp() throws Exception {
            sc1 = scenario(runSim(FIXTURE), "sc_1");
        }

        /**
         * ROMANIA (reinvestCoupons=true): portVal must grow from 2036 to 2044
         * as coupons compound into more units.
         */
        @Test
        public void sc1_romaniaRepl_portValGrows_2036to2044() {
            long pv2036 = slot(year(sc1, 2036), "XS1313004928_repl").path("portVal").asLong();
            long pv2044 = slot(year(sc1, 2044), "XS1313004928_repl").path("portVal").asLong();
            assertTrue("ROMANIA repl portVal grows 2036→2044 (reinvestCoupons=true): "
                + pv2036 + " -> " + pv2044, pv2044 > pv2036);
        }

        /**
         * UNGHERIA (reinvestCoupons=false): portVal must be approximately
         * constant between 2036 and 2054 (coupons go to cash, not reinvested).
         */
        @Test
        public void sc1_ungheriaRepl_portValConstant_2036to2054() {
            long pv2036 = slot(year(sc1, 2036), "XS2181689659_repl").path("portVal").asLong();
            long pv2054 = slot(year(sc1, 2054), "XS2181689659_repl").path("portVal").asLong();
            assertNear(pv2054, pv2036, "UNGHERIA repl portVal constant 2036→2054 (reinvestCoupons=false)");
        }

        /**
         * ROMANIA replCoupon must be > 0 in a post-activation year (e.g. 2040).
         */
        @Test
        public void sc1_2040_romaniaRepl_replCouponPositive() {
            long replCoupon = slot(year(sc1, 2040), "XS1313004928_repl").path("replCoupon").asLong();
            assertTrue("ROMANIA replCoupon > 0 in 2040", replCoupon > 0);
        }

        /**
         * BULGARIA replCoupon must be > 0 in a post-activation year (e.g. 2040).
         * Before the fix this was always 0 because the slot was never found.
         */
        @Test
        public void sc1_2040_bulgariaRepl_replCouponPositive() {
            long replCoupon = slot(year(sc1, 2040), "XS3124345631_repl").path("replCoupon").asLong();
            assertTrue("BULGARIA replCoupon > 0 in 2040 (regression: was 0 before fix)",
                replCoupon > 0);
        }

        /**
         * UNGHERIA replCoupon must be > 0 in a post-activation year (e.g. 2040).
         * Before the fix this was always 0 because the slot was never found.
         */
        @Test
        public void sc1_2040_ungheriaRepl_replCouponPositive() {
            long replCoupon = slot(year(sc1, 2040), "XS2181689659_repl").path("replCoupon").asLong();
            assertTrue("UNGHERIA replCoupon > 0 in 2040 (regression: was 0 before fix)",
                replCoupon > 0);
        }

        /**
         * The coupon ratio (replCoupon / portVal) for any replacement bond must be
         * approximately equal to the configured netCouponPct = 4.18%.
         * We verify this for BULGARIA in 2040 (well within its lifetime).
         */
        @Test
        public void sc1_2040_bulgariaRepl_couponRatio_approx_418pct() {
            JsonNode repl = slot(year(sc1, 2040), "XS3124345631_repl");
            long coupon   = repl.path("replCoupon").asLong();
            long pv       = repl.path("portVal").asLong();
            // For reinvestCoupons=true the portVal grows each year, so coupon/portVal
            // converges towards netCouponPct but never drifts more than 1 EUR rounding.
            double ratioPct = pv > 0 ? (double) coupon / pv * 100.0 : 0;
            assertEquals("BULGARIA replCoupon/portVal ≈ 4.18%", 4.18, ratioPct, 0.2);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // MATURITY EVENTS — each replacement matures in its own year
    // ══════════════════════════════════════════════════════════════════════════

    public static class MaturityEventsTest {

        private JsonNode sc1;

        @Before
        public void setUp() throws Exception {
            sc1 = scenario(runSim(FIXTURE), "sc_1");
        }

        /**
         * ROMANIA matures 2045: redemption ≈ portVal in that year.
         */
        @Test
        public void sc1_2045_romaniaRepl_redeems() {
            JsonNode repl = slot(year(sc1, 2045), "XS1313004928_repl");
            long redemption = repl.path("redemption").asLong();
            long portVal    = repl.path("portVal").asLong();
            assertTrue("ROMANIA redemption > 0 in 2045", redemption > 0);
            assertNear(redemption, portVal, "ROMANIA redemption ≈ portVal in 2045");
        }

        /**
         * BULGARIA matures 2050: redemption ≈ portVal in that year.
         */
        @Test
        public void sc1_2050_bulgariaRepl_redeems() {
            JsonNode repl = slot(year(sc1, 2050), "XS3124345631_repl");
            long redemption = repl.path("redemption").asLong();
            long portVal    = repl.path("portVal").asLong();
            assertTrue("BULGARIA redemption > 0 in 2050", redemption > 0);
            assertNear(redemption, portVal, "BULGARIA redemption ≈ portVal in 2050");
        }

        /**
         * UNGHERIA matures 2055: redemption ≈ portVal in that year.
         * reinvestCoupons=false so portVal stayed constant → redemption ≈ 2035 activation value.
         */
        @Test
        public void sc1_2055_ungheriaRepl_redeems() {
            JsonNode repl = slot(year(sc1, 2055), "XS2181689659_repl");
            long redemption = repl.path("redemption").asLong();
            long portVal    = repl.path("portVal").asLong();
            assertTrue("UNGHERIA redemption > 0 in 2055", redemption > 0);
            assertNear(redemption, portVal, "UNGHERIA redemption ≈ portVal in 2055");
        }

        /**
         * ROMANIA slot must be absent from perSlot after its maturity (2046+).
         */
        @Test
        public void sc1_2046_romaniaRepl_absent() {
            JsonNode y = year(sc1, 2046);
            for (JsonNode s : y.path("perSlot")) {
                assertFalse("ROMANIA_repl must not appear after 2045",
                    s.path("isin").asText().startsWith("XS1313004928_repl"));
            }
        }

        /**
         * UNGHERIA slot must still be present in 2054 (one year before its maturity).
         */
        @Test
        public void sc1_2054_ungheriaRepl_stillPresent() {
            JsonNode repl = slot(year(sc1, 2054), "XS2181689659_repl");
            assertTrue("UNGHERIA repl still present in 2054", repl.path("portVal").asLong() > 0);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // INVARIANTS — structural checks specific to the multi-repl scenario
    // ══════════════════════════════════════════════════════════════════════════

    public static class MultiReplInvariantsTest {

        private JsonNode sc1;

        @Before
        public void setUp() throws Exception {
            sc1 = scenario(runSim(FIXTURE), "sc_1");
        }

        /**
         * Before 2035 no replacement slots must appear (original bonds still alive).
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
            }
        }

        /**
         * In every year from 2036 to 2044 (all three replacements alive, ROMANIA first to mature):
         * perSlot must contain exactly 3 replacement slots.
         * Note: the engine may also emit synthetic _cont_ slots for coupon reinvestment;
         * we only assert on the replacement count, not on the absence of other slots.
         */
        @Test
        public void sc1_2036to2044_exactlyThreeReplSlots() {
            for (int yr = 2036; yr <= 2044; yr++) {
                JsonNode y = year(sc1, yr);
                long replCount = 0;
                for (JsonNode s : y.path("perSlot")) {
                    if (s.path("isReplacement").asBoolean()) replCount++;
                }
                assertEquals("Exactly 3 replacement slots in yr=" + yr, 3, replCount);
            }
        }

        /**
         * After ROMANIA matures (2045) and before BULGARIA matures (2050):
         * perSlot must contain exactly 2 replacement slots.
         */
        @Test
        public void sc1_2046to2049_exactlyTwoReplSlots() {
            for (int yr = 2046; yr <= 2049; yr++) {
                JsonNode y = year(sc1, yr);
                long replCount = 0;
                for (JsonNode s : y.path("perSlot")) {
                    if (s.path("isReplacement").asBoolean()) replCount++;
                }
                assertEquals("Exactly 2 replacement slots in yr=" + yr, 2, replCount);
            }
        }

        /**
         * After BULGARIA matures (2050) and before UNGHERIA matures (2055):
         * perSlot must contain exactly 1 replacement slot (UNGHERIA only).
         */
        @Test
        public void sc1_2051to2054_exactlyOneReplSlot() {
            for (int yr = 2051; yr <= 2054; yr++) {
                JsonNode y = year(sc1, yr);
                long replCount = 0;
                for (JsonNode s : y.path("perSlot")) {
                    if (s.path("isReplacement").asBoolean()) replCount++;
                }
                assertEquals("Exactly 1 replacement slot (UNGHERIA) in yr=" + yr, 1, replCount);
                // And it must be UNGHERIA
                JsonNode unRepl = slot(y, "XS2181689659_repl");
                assertTrue("UNGHERIA_repl is the surviving slot in yr=" + yr,
                    unRepl.path("isReplacement").asBoolean());
            }
        }

        /**
         * No negative monetary values at any point in the multi-repl scenario.
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
         * The portfolio value in 2055 (final year) must be greater than initial capital (10000)
         * because all three bonds reinvested with positive net coupon rate (4.18%).
         */
        @Test
        public void sc1_finalValue_2055_greaterThan_initialCapital() {
            // Find 2055 data point from the sim (bondsVal + any cash remaining)
            long bondsVal2055 = year(sc1, 2055).path("bondsVal").asLong();
            long redemp2055   = year(sc1, 2055).path("redemptions").asLong();
            long total        = bondsVal2055 + redemp2055;
            // Initial invested: 4000+3000+3000=10000; scale keeps ratio, so check > 10000
            assertTrue("Final value (bondsVal+redemptions) in 2055 > initial 10000: got " + total,
                total > 10_000);
        }
    }
}
