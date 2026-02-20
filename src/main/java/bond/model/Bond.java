package bond.model;

import lombok.*;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

@Data
@NoArgsConstructor
public class Bond {
    String isin;
    String issuer;
    double price;
    String currency;
    double priceEur;
    double couponPct;
    LocalDate maturity;
    double currentYield;
    double finalCapitalToMat;
    double simpleAnnualYield;
    String rating;  // Rating based on issuer

    public Bond(String isin, String issuer, double price, String currency,
                double priceEur, double couponPct,
                LocalDate maturity) {
        this.isin = isin;
        this.issuer = issuer;
        this.price = price;
        this.currency = currency;
        this.priceEur = priceEur;
        this.couponPct = couponPct;
        this.maturity = maturity;
        this.currentYield = couponPct * 100 / price;
    }

    public double getYearsToMaturity() {
        if (maturity == null) return -1;
        long days = ChronoUnit.DAYS.between(LocalDate.now(), maturity);
        return Math.max(0.1, days / 365.25);
    }
}