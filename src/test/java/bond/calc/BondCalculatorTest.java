package bond.calc;

import bond.model.Bond;
import bond.scoring.BondScoreEngine;
import org.junit.Before;
import org.junit.Test;

import java.time.LocalDate;
import java.util.List;

import static org.junit.Assert.*;

public class BondCalculatorTest {

    private BondCalculator calc;

    @Before
    public void setup() {
        calc = new BondCalculator();
    }

    // ---------------------------------------------------
    // 1. Cas standard
    // ---------------------------------------------------
    @Test
    public void testBuildBondStandard() {
        Bond b = calc.buildBond(
            "IT0001234567",
            "Spain",
            98.0,
            "EUR",
            95.0,
            4.0,
            LocalDate.now().plusYears(10)
        );

        BondScoreEngine engine = new BondScoreEngine();
        engine.calculateBondScores(List.of(b), b.getCurrency());

        assertNotNull(b);
        assertEquals("IT0001234567", b.getIsin());
        assertEquals("Spain", b.getIssuer());
        assertEquals(4.08, b.getCurrentYield(), 0.01);
        assertTrue(b.getFinalCapitalToMat() > 0);
    }

    // ---------------------------------------------------
    // 2. Prix ↑ → Yield ↓
    // ---------------------------------------------------
    @Test
    public void testHigherPriceLowerYield() {
        Bond cheap = calc.buildBond(
            "X1", "Italy", 90, "EUR", 900, 4,
            LocalDate.now().plusYears(10));

        Bond expensive = calc.buildBond(
            "X2", "Italy", 110, "EUR", 1100, 4,
            LocalDate.now().plusYears(10));

        assertTrue(cheap.getCurrentYield() > expensive.getCurrentYield());
    }

    // ---------------------------------------------------
    // 3. CHF vs EUR
    // ---------------------------------------------------
    @Test
    public void testChfYieldCalculation() {
        Bond b = calc.buildBond(
            "CH0000000001",
            "SVIZZERA",
            100,
            "CHF",
            900,
            3,
            LocalDate.now().plusYears(8)
        );

        assertEquals(3, b.getCurrentYield(), 0.001);
    }

    // ---------------------------------------------------
    // 4. Maturité trop courte → null
    // ---------------------------------------------------
    @Test
    public void testShortMaturityReturnsNull() {
        Bond b = calc.buildBond(
            "X3", "Francia", 100,  "EUR", 1000, 4,
            LocalDate.now().plusMonths(10)
        );

        assertNull(b);
    }

    // ---------------------------------------------------
    // 5. Arrondi
    // ---------------------------------------------------
    @Test
    public void testRounding() {
        Bond b = calc.buildBond(
            "X4", "Romania", 100,  "EUR", 333.3333, 4,
            LocalDate.now().plusYears(10)
        );

        assertEquals(4.0, b.getCurrentYield(), 0.001);
    }

    // ---------------------------------------------------
    // 6. Yield total positif
    // ---------------------------------------------------
    @Test
    public void testCapitalToMaturityPositive() {
        Bond b = calc.buildBond(
            "X5", "Deutschland", 95, "EUR", 930, 4,
            LocalDate.now().plusYears(12));

        BondScoreEngine engine = new BondScoreEngine();
        engine.calculateBondScores(List.of(b), b.getCurrency());

        assertTrue(b.getFinalCapitalToMat() > 1000);
    }

    // ---------------------------------------------------
    // 7. Zéro coupon
    // ---------------------------------------------------
    @Test
    public void testZeroCouponBond() {
        Bond b = calc.buildBond(
            "X6", "Slovenia", 70,  "EUR", 700, 0,
            LocalDate.now().plusYears(10)
        );

        BondScoreEngine engine = new BondScoreEngine();
        engine.calculateBondScores(List.of(b), b.getCurrency());

        assertEquals(0.0, b.getCurrentYield(), 0.0001);
        assertTrue(b.getFinalCapitalToMat() > 1000);
    }
}