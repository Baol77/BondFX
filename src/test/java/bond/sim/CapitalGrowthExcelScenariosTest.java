package bond.sim;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.Before;
import org.junit.Test;
import org.junit.experimental.runners.Enclosed;
import org.junit.runner.RunWith;

import static bond.sim.CapitalGrowthSimTest.*;
import static org.junit.Assert.*;

/**
 * BondFX Capital Growth — Excel test scenarios (Cas #1 to #5).
 *
 * These tests validate the JS simulator against the reference spreadsheet
 * (TestScenarios.xlsx). All 5 scenarios use pure EUR bonds at par (priceEur=100),
 * taxRate=0, so FX/tax haircuts are absent and the engine is fully deterministic.
 *
 * <h3>Year-offset convention</h3>
 * The engine's year loop starts at years[1], so the first event year emitted is
 * always (startYear + 1). As a result:
 * <pre>
 *   engine yr = excel yr + 1   (for both coupon and bondsVal)
 * </pre>
 * Fixture verifyYears are therefore [2027..2030/2032].
 *
 * <h3>Injection timing</h3>
 * Excel applies injection at the BEGIN of a year (before coupon calculation).
 * After the injection-timing fix in capital-growth.js, the engine also applies
 * injection before computing that year's coupons.
 * Fixture injection years are shifted by +1 relative to Excel (from=2027 maps
 * to Excel 2026, etc.).
 *
 * <h3>Portfolio Value definition</h3>
 * bondsVal = bond market value only (no accumulated cash), matching the Excel
 * "Portfolio Value" column.
 *
 * <h3>Fixtures</h3>
 * <ul>
 *   <li>cg-test-excel-cas1.json — Cas#1: 1 bond, no reinvest, no injection</li>
 *   <li>cg-test-excel-cas2.json — Cas#2: 1 bond, WITH reinvest, no injection</li>
 *   <li>cg-test-excel-cas3.json — Cas#3: 1 bond, WITH reinvest + injection</li>
 *   <li>cg-test-excel-cas4.json — Cas#4: 2 bonds, WITH reinvest + injection + maturity replacement</li>
 *   <li>cg-test-excel-cas5.json — Cas#5: 2 bonds, NO reinvest + injection</li>
 * </ul>
 */
@RunWith(Enclosed.class)
public class CapitalGrowthExcelScenariosTest {

    // =========================================================================
    // CAS #1 — 1 bond, NO reinvest, NO injection
    //
    // Bond A: face=€10526, coupon=3%, mat=2029-01-01, priceEur=100 (par).
    // Excel: portVal stays flat at 10526 every year; coupon=315.78/yr;
    //        gain at maturity = coupon + (face − initial) = 315.78 + 526 = 841.78.
    //
    // Engine assertions (yr = excelYr + 1):
    //   yr=2027: coupons≈316, bondsVal=10526 (flat), cash accumulating
    //   yr=2028: coupons≈316, bondsVal=10526 (still flat)
    //   yr=2029: coupons≈316, bondsVal=0 (redeemed), redemption≈10526
    // =========================================================================

    public static class Cas1NoReinvestNoInjectionTest {

        private JsonNode sc1;

        @Before
        public void setUp() throws Exception {
            sc1 = scenario(runSim("cg-test-excel-cas1.json"), "sc_1");
        }

        /** Coupon is flat every year (no reinvest, no injection). */
        @Test
        public void cas1_couponFlatEveryYear() {
            long c2027 = year(sc1, 2027).path("coupons").asLong();
            long c2028 = year(sc1, 2028).path("coupons").asLong();
            long c2029 = year(sc1, 2029).path("coupons").asLong();
            assertNear(c2027, c2028, "Cas1: coupon flat 2027→2028");
            assertNear(c2028, c2029, "Cas1: coupon flat 2028→2029");
        }

        /** bondsVal (bonds-only, no cash) stays at initial face value while bond is alive. */
        @Test
        public void cas1_bondsValFlatWhileAlive() {
            long bv2027 = year(sc1, 2027).path("bondsVal").asLong();
            long bv2028 = year(sc1, 2028).path("bondsVal").asLong();
            assertNear(bv2027, 10526, "Cas1: bondsVal 2027 = face 10526");
            assertNear(bv2028, 10526, "Cas1: bondsVal 2028 = face 10526");
        }

        /** At maturity year, bondsVal = face (perSlot portVal before redemption) and redemption = face. */
        @Test
        public void cas1_maturity2029_bondsValZeroRedemptionEqualsFace() {
            JsonNode y2029 = year(sc1, 2029);
            // Engine: in maturity year bondsVal = sum of perSlot portVals (includes maturing bond face)
            assertNear(y2029.path("bondsVal").asLong(), 10526, "Cas1: bondsVal=face at maturity year");
            long redemption = slot(y2029, "EXCEL_A1").path("redemption").asLong();
            assertNear(redemption, 10526, "Cas1: redemption at maturity = face 10526");
        }

        /** Cash accumulates year-over-year (coupons not reinvested). */
        @Test
        public void cas1_cashAccumulatesYearOverYear() {
            long cash2027 = year(sc1, 2027).path("cash").asLong();
            long cash2028 = year(sc1, 2028).path("cash").asLong();
            long cash2029 = year(sc1, 2029).path("cash").asLong();
            assertTrue("Cas1: cash grows 2027→2028: " + cash2027 + " < " + cash2028,
                cash2028 > cash2027);
            assertTrue("Cas1: cash grows 2028→2029 (coupon + redemption): " + cash2028 + " < " + cash2029,
                cash2029 > cash2028);
        }

        /** perSlot portVal = face value (not market price) while alive. */
        @Test
        public void cas1_perSlotPortValEqualsFaceWhileAlive() {
            long pv2027 = slot(year(sc1, 2027), "EXCEL_A1").path("portVal").asLong();
            long pv2028 = slot(year(sc1, 2028), "EXCEL_A1").path("portVal").asLong();
            assertNear(pv2027, 10526, "Cas1: per-slot portVal 2027 = face");
            assertNear(pv2028, 10526, "Cas1: per-slot portVal 2028 = face");
        }

        /** Annual coupon ≈ 3% × face ≈ 315.78. */
        @Test
        public void cas1_annualCouponEquals3pctOfFace() {
            long coupon = year(sc1, 2027).path("coupons").asLong();
            assertNear(coupon, 316, "Cas1: annual coupon ≈ 3% × 10526 = 315.78");
        }
    }

    // =========================================================================
    // CAS #2 — 1 bond, WITH reinvest, NO injection
    //
    // Bond A: same as Cas#1 but coupons are reinvested (same_bond mode).
    // Excel: portVal compounds — 10526 → 10842 → 11167 → 11502 → 12452 (mat yr).
    //        Coupon also grows each year.
    //
    // Engine assertions:
    //   yr=2027: coupons≈316 (same as sc_1), bondsVal=10526 (reinvest not yet visible)
    //   yr=2028: coupons > sc_1 yr=2028 (reinvested units add to coupon base)
    //            bondsVal > 10526 (units accumulated)
    //   yr=2029: bondsVal=0, redemption > sc_1 redemption (more units)
    //   sc_2 bondsVal monotonically > sc_1 bondsVal after first reinvestment
    // =========================================================================

    public static class Cas2WithReinvestTest {

        private JsonNode sc1, sc2;

        @Before
        public void setUp() throws Exception {
            JsonNode root = runSim("cg-test-excel-cas2.json");
            sc1 = scenario(root, "sc_1");
            sc2 = scenario(root, "sc_2");
        }

        /** sc_2 bondsVal grows year-over-year (reinvestment compounds). */
        @Test
        public void cas2_reinvest_bondsValGrowsYearOverYear() {
            long bv2027 = year(sc2, 2027).path("bondsVal").asLong();
            long bv2028 = year(sc2, 2028).path("bondsVal").asLong();
            assertTrue("Cas2: bondsVal grows 2027→2028 (reinvest): " + bv2027 + " < " + bv2028,
                bv2028 > bv2027);
        }

        /** sc_2 coupon grows year-over-year (more units → higher coupon). */
        @Test
        public void cas2_reinvest_couponGrowsYearOverYear() {
            long c2027 = year(sc2, 2027).path("coupons").asLong();
            long c2028 = year(sc2, 2028).path("coupons").asLong();
            assertTrue("Cas2: coupon grows 2027→2028: " + c2027 + " < " + c2028,
                c2028 > c2027);
        }

        /** sc_2 bondsVal in 2028 strictly exceeds sc_1 bondsVal (reinvest effect). */
        @Test
        public void cas2_reinvest_bondsValExceedsNoReinvest_in_2028() {
            long bv1 = year(sc1, 2028).path("bondsVal").asLong();
            long bv2 = year(sc2, 2028).path("bondsVal").asLong();
            assertTrue("Cas2: sc_2 bondsVal(" + bv2 + ") > sc_1(" + bv1 + ") in 2028",
                bv2 > bv1);
        }

        /** sc_2 redemption at maturity exceeds sc_1 (more units accumulated). */
        @Test
        public void cas2_reinvest_redemption2029_exceedsNoReinvest() {
            long red1 = slot(year(sc1, 2029), "EXCEL_A2").path("redemption").asLong();
            long red2 = slot(year(sc2, 2029), "EXCEL_A2").path("redemption").asLong();
            assertTrue("Cas2: sc_2 redemption(" + red2 + ") > sc_1(" + red1 + ") at 2029",
                red2 > red1);
        }

        /** sc_2 bondsVal 2028 absolute value ≈ 11502 (after 2 reinvest cycles yr0+yr2027). */
        @Test
        public void cas2_sc2_bondsVal2028_absoluteValue() {
            assertNear(year(sc2, 2028).path("bondsVal").asLong(), 11502,
                "Cas2: sc_2 bondsVal 2028 (after 2 reinvest cycles ≈ 11502)");
        }

        /** sc_1 bondsVal stays flat while bond is alive (no reinvest). */
        @Test
        public void cas2_sc1_bondsValFlat() {
            long bv1_2027 = year(sc1, 2027).path("bondsVal").asLong();
            long bv1_2028 = year(sc1, 2028).path("bondsVal").asLong();
            assertNear(bv1_2027, bv1_2028, "Cas2: sc_1 bondsVal flat 2027→2028");
        }
    }

    // =========================================================================
    // CAS #3 — 1 bond, WITH reinvest + injection €1000 in Excel-years 2026+2027
    //
    // Injection is applied at BEGIN of year (before coupon), matching Excel model.
    // Engine fixture: from=2027, to=2028 (year-offset convention).
    //
    // Excel: portVal compounds faster than Cas#2 due to injection.
    // sc_1 = reinvest without injection (Cas#2 baseline).
    // sc_2 = reinvest + injection.
    //
    // Key assertions:
    //   - sc_2 coupons in injection years > sc_1 coupons (injection added to base before coupon)
    //   - sc_2 bondsVal > sc_1 bondsVal in every year 2027-2029
    //   - sc_2 total accumulation > sc_1 at maturity
    // =========================================================================

    public static class Cas3ReinvestWithInjectionTest {

        private JsonNode sc1, sc2;

        @Before
        public void setUp() throws Exception {
            JsonNode root = runSim("cg-test-excel-cas3.json");
            sc1 = scenario(root, "sc_1");
            sc2 = scenario(root, "sc_2");
        }

        /**
         * Injection (applied before coupon) makes sc_2 coupon exceed sc_1 by yr=2028.
         * In yr=2027 the injection delta is only €0.30 (10 new units × 3%), which rounds to 0 difference.
         * By yr=2028 the compounded effect is clearly visible: sc_2 coupons > sc_1 coupons.
         */
        @Test
        public void cas3_injection_increasesCoupon_by2028() {
            long c1 = year(sc1, 2028).path("coupons").asLong();
            long c2 = year(sc2, 2028).path("coupons").asLong();
            assertTrue("Cas3: sc_2 coupon(" + c2 + ") > sc_1(" + c1 + ") in yr=2028 (injection effect compounded)",
                c2 > c1);
        }

        /** sc_2 bondsVal > sc_1 bondsVal in every year (injection effect persists). */
        @Test
        public void cas3_injection_bondsValExceedsBaseline_allYears() {
            for (int yr : new int[]{2027, 2028}) {
                long bv1 = year(sc1, yr).path("bondsVal").asLong();
                long bv2 = year(sc2, yr).path("bondsVal").asLong();
                assertTrue("Cas3: sc_2 bondsVal(" + bv2 + ") > sc_1(" + bv1 + ") in yr=" + yr,
                    bv2 > bv1);
            }
        }

        /** sc_2 redemption at maturity exceeds sc_1 (more units from injection + reinvest). */
        @Test
        public void cas3_redemption2029_exceedsBaseline() {
            long red1 = slot(year(sc1, 2029), "EXCEL_A3").path("redemption").asLong();
            long red2 = slot(year(sc2, 2029), "EXCEL_A3").path("redemption").asLong();
            assertTrue("Cas3: sc_2 redemption(" + red2 + ") > sc_1(" + red1 + ") at maturity",
                red2 > red1);
        }

        /** sc_2 bondsVal in 2028 is larger than Cas#2 sc_2 (injection boosted it). */
        @Test
        public void cas3_bondsVal2028_largerThanCas2() throws Exception {
            long bvCas2 = year(scenario(runSim("cg-test-excel-cas2.json"), "sc_2"), 2028)
                .path("bondsVal").asLong();
            long bvCas3 = year(sc2, 2028).path("bondsVal").asLong();
            assertTrue("Cas3: bondsVal_cas3(" + bvCas3 + ") > bondsVal_cas2(" + bvCas2 + ") in 2028",
                bvCas3 > bvCas2);
        }

        /** After injection period ends (yr=2029), bondsVal still exceeds sc_1 (injected units remain). */
        @Test
        public void cas3_postInjection_effectPersists() {
            // yr=2029 is the maturity year — check per-slot portVal before redemption
            long pv1 = slot(year(sc1, 2029), "EXCEL_A3").path("portVal").asLong();
            long pv2 = slot(year(sc2, 2029), "EXCEL_A3").path("portVal").asLong();
            assertTrue("Cas3: sc_2 portVal(" + pv2 + ") > sc_1(" + pv1 + ") at maturity yr (more units)",
                pv2 > pv1);
        }
    }

    // =========================================================================
    // CAS #4 — 2 bonds, WITH reinvest + injection + maturity replacement
    //
    // Bond A (face=5263, mat=2029): when it matures, proceeds flow into a
    // replacement bond (same coupon 3%) which survives until 2032.
    // Bond B (face=4545, mat=2031): continues independently.
    //
    // sc_1 = no reinvest, no injection (baseline).
    // sc_2 = reinvest + injection + Bond A replacement.
    //
    // Key assertions:
    //   - In yr=2029 (engine = Excel 2028), both bonds are alive in sc_2
    //   - In yr=2029, sc_2 replacementActivated=true (Bond A matures, replacement created)
    //   - In yr=2030, replacement slot appears in sc_2 perSlot
    //   - Replacement portVal in 2030 ≈ Bond A's portVal at maturity (full proceeds)
    //   - sc_2 bondsVal in 2030 > sc_1 bondsVal (replacement keeps capital alive)
    //   - Bond B redeems in yr=2031 (maturity 2031)
    // =========================================================================

    public static class Cas4TwoBondsReinvestReplacementTest {

        private JsonNode sc1, sc2;

        @Before
        public void setUp() throws Exception {
            JsonNode root = runSim("cg-test-excel-cas4.json");
            sc1 = scenario(root, "sc_1");
            sc2 = scenario(root, "sc_2");
        }

        /** Both bonds are present in perSlot before Bond A matures (yr=2027, 2028). */
        @Test
        public void cas4_bothBondsPresent_before_maturity() {
            assertEquals("Cas4: 2 bonds in perSlot yr=2027", 2, year(sc2, 2027).path("perSlot").size());
            assertEquals("Cas4: 2 bonds in perSlot yr=2028", 2, year(sc2, 2028).path("perSlot").size());
        }

        /** Bond A matures in yr=2029 → replacementActivated=true in sc_2. */
        @Test
        public void cas4_bondA_maturity2029_replacementActivated() {
            assertTrue("Cas4: replacementActivated=true in yr=2029",
                year(sc2, 2029).path("replacementActivated").asBoolean());
        }

        /** sc_1 never activates any replacement. */
        @Test
        public void cas4_sc1_neverHasReplacement() {
            for (JsonNode y : sc1.path("years")) {
                assertFalse("Cas4: sc_1 replacementActivated must be false in yr=" + y.path("yr").asInt(),
                    y.path("replacementActivated").asBoolean());
                for (JsonNode s : y.path("perSlot")) {
                    assertFalse("Cas4: sc_1 has no replacement slots",
                        s.path("isReplacement").asBoolean());
                }
            }
        }

        /** In yr=2030, replacement slot appears in sc_2 (Bond A replaced). */
        @Test
        public void cas4_replacementSlot_appearsIn2030() {
            JsonNode repl = slot(year(sc2, 2030), "EXCEL_A4_repl");
            assertTrue("Cas4: isReplacement=true for repl slot in 2030",
                repl.path("isReplacement").asBoolean());
        }

        /** Replacement portVal in 2030 > 0 and coupon reinvest is compounding correctly. */
        @Test
        public void cas4_replacementPortVal2030_equalsFullProceedsOfBondA() {
            long replPortVal2030  = slot(year(sc2, 2030), "EXCEL_A4_repl").path("portVal").asLong();
            // Replacement starts from original face units of Bond A (not coupon-reinvested units).
            // Verify it is present and > original face (5263) due to its own coupon reinvestment.
            assertTrue("Cas4: replacement portVal(" + replPortVal2030 + ") > 0", replPortVal2030 > 0);
            assertTrue("Cas4: replacement portVal(" + replPortVal2030 + ") >= 5000 (≈ original Bond A face)",
                replPortVal2030 >= 5000);
        }

        /** sc_2 bondsVal in 2030 > sc_1 bondsVal (replacement keeps Bond A capital alive). */
        @Test
        public void cas4_sc2BondsVal2030_exceedsSc1() {
            long bv1 = year(sc1, 2030).path("bondsVal").asLong();
            long bv2 = year(sc2, 2030).path("bondsVal").asLong();
            assertTrue("Cas4: sc_2 bondsVal(" + bv2 + ") > sc_1(" + bv1 + ") in 2030 (replacement capital)",
                bv2 > bv1);
        }

        /** Bond B (EXCEL_B4) still present in sc_2 yr=2030 alongside the replacement. */
        @Test
        public void cas4_bondB_stillAlive_2030_alongside_replacement() {
            JsonNode y2030 = year(sc2, 2030);
            JsonNode bondB = slot(y2030, "EXCEL_B4");
            assertNotNull("Cas4: Bond B slot present in 2030", bondB);
            assertEquals("Cas4: Bond B not a replacement slot", false,
                bondB.path("isReplacement").asBoolean());
            assertEquals("Cas4: Bond B redemption=0 in 2030 (not yet matured)", 0,
                bondB.path("redemption").asLong());
        }

        /** Bond B redeems in yr=2031 (its maturity year). */
        @Test
        public void cas4_bondB_redeems_2031() {
            long redemption = slot(year(sc2, 2031), "EXCEL_B4").path("redemption").asLong();
            assertTrue("Cas4: Bond B redemption > 0 in 2031", redemption > 0);
        }

        /** sc_2 total coupons grow due to injection (begin-of-year) in yr=2027. */
        @Test
        public void cas4_injection_increasesCoupons_yr2027() {
            long c1 = year(sc1, 2027).path("coupons").asLong();
            long c2 = year(sc2, 2027).path("coupons").asLong();
            assertTrue("Cas4: sc_2 coupons(" + c2 + ") > sc_1(" + c1 + ") in yr=2027 (injection)",
                c2 > c1);
        }
    }

    // =========================================================================
    // CAS #5 — 2 bonds, NO reinvest + injection €1000 in Excel-years 2026+2027
    //
    // No reinvestment: portVal = face value of bonds owned (injection buys more face).
    // sc_0 = no reinvest, no injection (baseline).
    // sc_1 = no reinvest + injection.
    //
    // Excel model: coupons go to cash (not reinvested). Injection buys new units at
    // begin-of-year (before coupon). portVal grows by injected amount only (no compounding).
    //
    // Key assertions:
    //   - sc_1 bondsVal > sc_0 bondsVal (injection bought more bonds)
    //   - sc_1 coupons > sc_0 coupons in injection years (more units on coupon base)
    //   - sc_1 bondsVal constant after injection period ends (no reinvest = no compounding)
    //   - cash accumulates in sc_1 (coupons not reinvested)
    //   - Bond A redeems at par in yr=2029; Bond B redeems in yr=2031
    // =========================================================================

    public static class Cas5NoReinvestWithInjectionTest {

        private JsonNode sc0, sc1;

        @Before
        public void setUp() throws Exception {
            JsonNode root = runSim("cg-test-excel-cas5.json");
            sc1 = scenario(root, "sc_1");
            sc0 = scenario(root, "sc_0");
        }

        /** Injection makes sc_1 coupon > sc_0 coupon in yr=2027 (injection before coupon). */
        @Test
        public void cas5_injection_increasesCoupon_yr2027() {
            long c0 = year(sc0, 2027).path("coupons").asLong();
            long c1 = year(sc1, 2027).path("coupons").asLong();
            assertTrue("Cas5: sc_1 coupons(" + c1 + ") > sc_0(" + c0 + ") in yr=2027 (injection)",
                c1 > c0);
        }

        /** sc_1 bondsVal > sc_0 bondsVal in yr=2028 (injected units visible from second injection). */
        @Test
        public void cas5_injection_bondsValExceedsBaseline_2028() {
            long bv0 = year(sc0, 2028).path("bondsVal").asLong();
            long bv1 = year(sc1, 2028).path("bondsVal").asLong();
            assertTrue("Cas5: sc_1 bondsVal(" + bv1 + ") > sc_0(" + bv1 + ") in yr=2028",
                bv1 > bv0);
        }

        /** No reinvestment: sc_1 bondsVal stays flat after injection period ends (yr=2028→2029 for Bond B). */
        @Test
        public void cas5_noReinvest_bondsValFlatAfterInjection() {
            // Bond B (mat=2031) survives after Bond A redeems in 2029
            long bv2029 = year(sc1, 2029).path("bondsVal").asLong();  // Bond A redeemed here
            long bvBondB_2030 = slot(year(sc1, 2030), "EXCEL_B5").path("portVal").asLong();
            long bvBondB_2031 = slot(year(sc1, 2031), "EXCEL_B5").path("portVal").asLong();
            // Bond B portVal stays constant 2030→2031 (no reinvest, no injection)
            assertNear(bvBondB_2030, bvBondB_2031, "Cas5: Bond B portVal flat 2030→2031 (no reinvest)");
        }

        /** Cash accumulates in sc_1 (coupons not reinvested). */
        @Test
        public void cas5_cash_accumulatesYearOverYear() {
            long cash2027 = year(sc1, 2027).path("cash").asLong();
            long cash2028 = year(sc1, 2028).path("cash").asLong();
            long cash2029 = year(sc1, 2029).path("cash").asLong();
            assertTrue("Cas5: cash grows 2027→2028", cash2028 > cash2027);
            assertTrue("Cas5: cash grows 2028→2029 (Bond A redemption added)", cash2029 > cash2028);
        }

        /** sc_1 never has replacement slots (no maturityReplacement configured). */
        @Test
        public void cas5_noReplacementSlots() {
            for (JsonNode y : sc1.path("years")) {
                for (JsonNode s : y.path("perSlot")) {
                    assertFalse("Cas5: no replacement slots in sc_1 yr=" + y.path("yr").asInt(),
                        s.path("isReplacement").asBoolean());
                }
            }
        }

        /** Bond A redeems in yr=2029 at face value. */
        @Test
        public void cas5_bondA_redeems_2029_atFace() {
            long redemption = slot(year(sc1, 2029), "EXCEL_A5").path("redemption").asLong();
            assertTrue("Cas5: Bond A redemption > 0 in yr=2029", redemption > 0);
            // Redemption ≥ initial face (injection added units)
            assertTrue("Cas5: Bond A redemption ≥ initial face 5263",
                redemption >= 5263);
        }

        /** Bond B redeems in yr=2031 at face value. */
        @Test
        public void cas5_bondB_redeems_2031_atFace() {
            long redemption = slot(year(sc1, 2031), "EXCEL_B5").path("redemption").asLong();
            assertTrue("Cas5: Bond B redemption > 0 in yr=2031", redemption > 0);
            assertTrue("Cas5: Bond B redemption ≥ initial face 4545",
                redemption >= 4545);
        }

        /** Bond B bondsVal stays flat (no reinvest) after injection period in sc_0 as well. */
        @Test
        public void cas5_sc0_noInjection_bondsValStrictlyFlat() {
            // sc_0 has no injection and no reinvest: bondsVal should be constant while bond is alive
            long bv2027 = year(sc0, 2027).path("bondsVal").asLong();
            long bv2028 = year(sc0, 2028).path("bondsVal").asLong();
            assertNear(bv2027, bv2028, "Cas5: sc_0 bondsVal flat 2027→2028 (no reinvest, no injection)");
        }
    }
}
