package bond.scoring;

import bond.fx.FxService;
import bond.fx.FxService.FxPhase;
import bond.model.Bond;

import java.util.List;

/**
 * Engine for calculating bond performance scores.
 * Computes final capital and simple annual yield (SAY) considering
 * a degraded foreign exchange (FX) risk scenario.
 */
public class BondScoreEngine {

    /**
     * Theoretical amount invested to normalize final capital calculations.
     */
    private static final double INIT_INVESTMENT_EUR = 1000.0;

    /**
     * Calculates and updates scores (Final Capital and SAY) for each bond.
     *
     * @param bonds          The list of bonds to process.
     * @param reportCurrency The investor's reference currency (e.g., EUR).
     */
    public void calculateBondScores(List<Bond> bonds, String reportCurrency) {
        for (Bond bond : bonds) {
            double yearsToMaturity = bond.getYearsToMaturity();

            // --- 1. Determine FX rates with safety margins ---
            double fxInitial = FxService.fxExpectedMultiplier(bond.getCurrency(), reportCurrency, FxPhase.BUY, (int) yearsToMaturity);
            double fxCoupon = FxService.fxExpectedMultiplier(bond.getCurrency(), reportCurrency, FxPhase.COUPON, (int) yearsToMaturity);
            double fxFuture = FxService.fxExpectedMultiplier(bond.getCurrency(), reportCurrency, FxPhase.MATURITY, (int) yearsToMaturity);

            // --- 2. Calculate projected final capital ---
            // Calculate how many securities are bought with 1000€ (Price * Initial Exchange Rate)
            double bondNbr = INIT_INVESTMENT_EUR / (fxInitial * bond.getPrice());

            // Cumulative coupon income converted to EUR with a moderate FX penalty
            double capitalFromBondNbrEUR = bondNbr * bond.getCouponPct() * (int) bond.getYearsToMaturity() * fxCoupon;

            // Redemption value (assuming 100 par) converted to EUR with a strong FX penalty
            double capitalGainEUR = 100 * bondNbr * fxFuture;

            bond.setFinalCapitalToMat(capitalFromBondNbrEUR + capitalGainEUR);

            // --- 3. Calculate Simple Annual Yield (SAY %) ---
            double simpleAnnualYield = (bond.getFinalCapitalToMat() - 1000) / (10 * yearsToMaturity);
            bond.setSimpleAnnualYield(simpleAnnualYield);
        }
    }
}