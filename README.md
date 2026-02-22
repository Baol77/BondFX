<a id="top"></a>

# 📊 BondFX — Sovereign Bond Analytics Platform · User Manual

**Discover, analyze, and build sovereign bond portfolios in minutes. Browse 1,000+ bonds across 30+ countries, set price/yield alerts, and export professional PDF reports.**

---

## Table of Contents

1. [What Is BondFX?](#what-is-bondfx)
2. [Typical User Workflow](#typical-user-workflow)
3. [The Bond Table](#the-bond-table)
4. [Key Metrics Explained](#key-metrics-explained)
5. [Investment Strategy Presets](#investment-strategy-presets)
6. [Advanced Filtering](#advanced-filtering)
7. [Wishlist — Price & SAY Alerts](#wishlist--price--say-alerts)
8. [Bond Basket](#bond-basket)
9. [Portfolio Analyzer](#portfolio-analyzer)
10. [Dividend Calendar](#dividend-calendar)
11. [Maturity Calendar](#maturity-calendar)
12. [Analysis Modes](#analysis-modes)
13. [Custom Investment Profiles (YAML)](#custom-investment-profiles-yaml)
14. [Coupon Frequency Configuration](#coupon-frequency-configuration)
15. [Tax Rate Configuration](#tax-rate-configuration)
16. [Troubleshooting](#troubleshooting)
17. [Frequently Asked Questions](#frequently-asked-questions)

---

## What Is BondFX?

[↑ Top](#top)

BondFX is a self-contained sovereign bond analytics platform with two components:

**The Interactive Report** — A browser-based interface to browse, filter, track, and analyze sovereign bonds. No login or subscription required.

**The Spring Boot Backend** — A data engine that scrapes live bond data, calculates returns, applies FX adjustments, and serves the page. Data is refreshed on every page load.

---

## Typical User Workflow

[↑ Top](#top)

Here is how a typical user moves from discovery to an investment decision.

### Step 1 — Browse and Filter

Open the report at **bondfx.onrender.com**. The table loads with the **Cash Parking** preset active by default. Choose a preset that matches your investment goals, or clear all filters and browse freely.

### Step 2 — Identify Candidates

Sort by **SAY** descending to surface the best risk-adjusted returns within the current filter. Review color-coded highlights — green rows have healthy yields, red rows require scrutiny.

For bonds you want to monitor without acting immediately, click the **★ star button** on the row to add them to the **Wishlist** with a price or SAY threshold. You will be notified at the next page load if conditions improve.

### Step 3 — Build a Shortlist with the Basket

For bonds you want to analyze together, click **＋** to add them to the **Bond Basket** (🛒 in the header). The basket persists across reloads.

### Step 4 — Analyze in the Portfolio Analyzer

Click **Open in Portfolio Analyzer** from the basket dropdown, or the **Portfolio Analyzer** button. In the Analyzer:

1. Click a basket chip to auto-fill the search field
2. Enter your intended investment amount per bond and click ➕ Add
3. Review the **Portfolio Statistics** cards — Weighted SAY (net), Weighted Rating, Total Profit
4. Check the **Dividend Calendar** for monthly net income over the next 12 months
5. Review the **Maturity Calendar** for capital repayment timeline and projected gains/losses

### Step 5 — Export

- **↑ CSV** to save your portfolio with quantities, tax rates, and cost basis
- **PDF icon** to generate a professional report with statistics, currency breakdown, dividend and maturity calendars
- Re-import with **↓ CSV** later to see price changes since you saved

### Step 6 — Act

Copy the ISIN from the table and provide it to your broker to place a buy order.

---

## The Bond Table

[↑ Top](#top)

Each row represents a single sovereign bond. On **mobile** (≤ 768px) the table adapts: issuer shows only a flag, maturity shows the year only, and column headers are abbreviated.

| Column | What It Represents | Practical Use |
|---|---|---|
| **★** | Wishlist alert button | Set a price or SAY threshold |
| **＋** | Basket button | Add bond to analysis shortlist |
| **ISIN** | Unique international identifier | Provide to your broker |
| **Issuer** | Country that issued the bond | Know who you are lending to |
| **Price** | Current price in the bond's native currency | What you pay today per unit |
| **Currency** | Bond denomination currency | EUR, USD, GBP, CHF, SEK, etc. |
| **Rating** | Credit quality from rating agencies | AAA is safest; BB+ and below is speculative |
| **Price (EUR)** | Price converted to euros | Enables fair comparison across currencies |
| **Coupon %** | Fixed annual interest rate | A 5% coupon on €1,000 pays €50/year |
| **Maturity** | Date the issuer repays principal | How long your money is committed |
| **Curr. Yield %** | Annual income as % of current price | More accurate than coupon when buying off-par |
| **Total Return (1k€)** | What €1,000 grows to by maturity | End-state profit in absolute terms |
| **SAY (%)** | Simple Annual Yield — annualized total return | **The most important column** |

---

## Key Metrics Explained

[↑ Top](#top)

### SAY — Simple Annual Yield

SAY is the single most useful number in the table. It represents the annualized total return on a standardized €1,000 investment, combining coupon income, capital gain/loss from buying above or below face value, and an FX risk adjustment for non-EUR bonds.

**Formula:**

```
SAY = (Total Return at Maturity − €1,000) / (10 × Years to Maturity)
```

Where **Total Return** is built as:

```
Total Return = (Coupon % × Years to Maturity × Bonds held × FX coupon factor)
             + (100 × Bonds held × FX redemption factor)
```

The FX factor applies a moderate discount on coupon income and a stronger discount on the redemption value for non-EUR bonds, reflecting exchange-rate uncertainty over the holding period. EUR bonds are unaffected (factor = 1).

> SAY is a per-unit value (€ per €1,000 invested per year), not a percentage of price. A SAY of 2.10 means €2.10 of annualized total return per €1,000 invested.

**Color coding in the table:**

| Color | SAY Range | Interpretation |
|---|---|---|
| 🟢 Dark green | ≥ 4.0 | Excellent |
| 🟢 Light green | 2.5 – 4.0 | Good |
| 🟡 Yellow | 1.0 – 2.5 | Acceptable |
| 🔴 Red | < 1.0 | Poor |

### Current Yield

Annual coupon income as a % of today's price. Does not account for capital gains or losses. Use this if you depend on regular income and plan to hold to maturity.

### Total Return (1k€)

The projected total amount received per €1,000 invested at maturity, including all coupon payments and face-value redemption converted to EUR. Above 1,000 = net gain; below 1,000 = net loss.

### Maturity

- **Under 3 years:** Low risk, lower returns. Good for capital you may need soon.
- **5–10 years:** Balanced risk and return.
- **15+ years:** Higher potential returns, but more sensitivity to interest rate changes.

---

## Investment Strategy Presets

[↑ Top](#top)

Eight preset buttons instantly configure filters and sort order for a specific investment style.

| Preset | For | What It Filters |
|---|---|---|
| 🅿️🛡️ **Cash Parking** | Short-term, safety-first | IG bonds, maturity ≤ 2.5y, yield ≥ 2% |
| ⚡💰 **Ultra Short High** | Risk-tolerant, short timeframe | Maturity 1–3y, yield ≥ 6%, accepts sub-IG |
| ⚖️🌲 **Balanced Core** | Long-term general investors | Maturity 5–15y, IG, SAY ≥ 3.5% |
| 📉🚀 **Deep Discount** | Capital-growth investors | Price < €90, maturity 3–20y, SAY ≥ 5% |
| 💵🔥 **Max Income** | Retirees, income-focused | Yield ≥ 6%, price ≤ 110, rating ≥ BBB− |
| 🏰🛡️ **AAA/AA Fortress** | Wealth-preservation | Rating ≥ AA−, maturity 5–30y, SAY ≥ 3% |
| 🏛️📈 **Long Quality** | Rate-cut beneficiaries | Maturity 20–40y, rating ≥ A−, yield ≥ 4% |
| 🏖️💵 **Retirement Income** | Long-term stable income | Maturity 20–35y, yield ≥ 4%, rating ≥ BBB+ |

---

## Advanced Filtering

[↑ Top](#top)

- **Click any column header** to sort ascending or descending
- **Type in the filter row** below each header to filter by text or numeric threshold
- **Combine a preset with manual column filters** for refined results

**Example:** Click **⚖️ Balanced Core**, then click the **Rating** header to sort safest bonds within that strategy to the top.

---

## Wishlist — Price & SAY Alerts

[↑ Top](#top)

The Wishlist lets you track bonds you are interested in but not yet ready to buy, by setting conditions that notify you when market conditions improve.

### Adding a Wishlist Alert

Click the **★** button on any row. A dialog opens showing the bond's current Price (EUR) and SAY. Set one or both conditions:

- **Price ≤ X** — alert when the bond becomes cheaper than your target
- **SAY ≥ X** — alert when the yield improves above your threshold

Click **✓ Save Alert**. The alert is saved in your browser's local storage and persists across reloads.

### How Alerts Work

Every time the page loads BondFX checks all wishlist items against live data. If any condition is met:

- The ⭐ icon in the header **pulses** continuously
- The matching item shows a **green background** in the dropdown
- The specific criterion that triggered is highlighted green with ✓

### Managing Wishlist Items

Open the ⭐ dropdown to:

- **→ Basket** — move the bond to the basket and remove it from the wishlist (pulsing stops for that bond)
- **✕** — remove the alert entirely

---

## Bond Basket

[↑ Top](#top)

The **🛒 Basket** is a shortlist of bonds you want to analyze together.

- Click **＋** on any row to add (button turns green ✓)
- Open 🛒 to review or remove items with ✕
- Click **Clear all** to empty the basket
- Click **Open in Portfolio Analyzer** to send all basket bonds to the Analyzer

In the Portfolio Analyzer, basket bonds appear as clickable chips at the top — click one to auto-fill the bond search field.

The basket persists across page reloads via local storage.

---

## Portfolio Analyzer

[↑ Top](#top)

The Portfolio Analyzer (`/analyzer`) is a dedicated full-page tool for building and evaluating custom bond portfolios.

### Adding a Bond

1. Search by ISIN or issuer name
2. Select a bond from the results
3. Enter **Total Investment (€)** — quantity is calculated automatically
4. Click **➕ Add to Portfolio**

> Modifying quantity directly in the table updates the count but does **not** change your cost basis.

### Portfolio Table Columns

ISIN · Issuer · Price (€) · Currency · Rating · Qty · Investment (€) · Maturity · **Yield net%** · **SAY net%** · **Tax %** · Profit · **Σ toggle**

The **Σ toggle** includes or excludes a bond from all statistics and calendars without removing it from the table.

### Toolbar

| Button | Action |
|---|---|
| **↑ CSV** | Export portfolio to CSV |
| **↓ CSV** | Import a saved CSV with current prices |
| **PDF icon** | Export full PDF report |
| **🗑** | Clear portfolio |

### Portfolio Statistics

| Statistic | What It Means |
|---|---|
| **Total Investment** | Original euros committed (cost basis) |
| **Avg Price** | Weighted average purchase price |
| **Weighted SAY (gross/net)** | Annualized total return before/after withholding tax |
| **Weighted Yield (gross/net)** | Annual income yield before/after withholding tax |
| **Avg Coupon** | Weighted average coupon rate |
| **Bond Count** | Number of distinct bonds |
| **Avg Risk (Maturity)** | Weighted average years to maturity |
| **Weighted Rating** | Average credit quality |
| **Total Profit** | Market value minus cost basis (price movement only) |
| **Coupon Income (net)** | Estimated annual EUR coupon income after withholding tax |

### Statistics Card Colour Coding

| Card | 🟢 Green | 🟡 Yellow | 🔴 Red |
|---|---|---|---|
| **Weighted SAY (gross/net)** | ≥ 3.5 | 2.0 – 3.5 | < 2.0 |
| **Weighted Yield (gross/net)** | ≥ 3.0% | 1.5 – 3.0% | < 1.5% |
| **Avg Coupon** | ≥ 3.0% | 1.5 – 3.0% | < 1.5% |
| **Avg Risk (Maturity)** | ≤ 7 years | 7 – 15 years | > 15 years |
| **Avg Price** | ≤ 110 | 110 – 120 | > 120 |
| **Weighted Rating** | AAA – A− | BBB+ – BBB− | BB+ and below |
| **Total Profit** | ≥ 0 | < 0 | — |

> Avg Price above 110 signals a guaranteed capital loss at maturity. Above 120, the impact on SAY is material.

### PDF Export

The PDF (landscape A4) contains:

1. Portfolio table with color-coded profit
2. Portfolio statistics (3-column summary)
3. Currency breakdown — investment and % share per currency
4. Dividend Calendar bar chart — net coupon income per month, next 12 months
5. Maturity Calendar table — capital returned and gain/loss per bond

Filename: `BondFX-Portfolio-YYYY-MM-DD.pdf`

### Saving and Loading

**↑ CSV:** Exports ISIN, issuer, quantity, investment, coupon, rating, currency, maturity, and tax rate.

**↓ CSV:** Reloads a saved portfolio with current live prices and shows the diff:

```
XS2571924070 (Romania):  €96.50 → €98.75  ↑ +€2.25
US0000000001 (USA):     €105.00 → €103.50  ↓ −€1.50
```

> CSV files exported without a TaxRate column are supported — missing rates are assigned from `tax-rates.yaml` defaults.

---

## Dividend Calendar

[↑ Top](#top)

Shows estimated **net coupon income per month** for the next 12 months across your portfolio as a bar chart. Each bar is the total EUR-equivalent income expected that month after withholding tax. Non-EUR bonds are converted at the current FX rate.

Payment months are derived from each bond's maturity month and coupon frequency — see [Coupon Frequency Configuration](#coupon-frequency-configuration).

---

## Maturity Calendar

[↑ Top](#top)

Lists every portfolio bond sorted by maturity date:

- **Capital returned** — face value × quantity (original currency for non-EUR, with EUR equivalent)
- **Capital gain/loss** — face value minus cost basis, green if positive, red if negative

Use this to plan future cash flows and identify which bonds will repay capital and when.

---

## Analysis Modes

[↑ Top](#top)

Toggle in the legend at the bottom of the main page.

- **Capital Gain Mode (default)** — heatmap colors rows by SAY. Best for growth investors.
- **Income Mode** — heatmap colors rows by Current Yield. Best for income-focused investors.

---

## Custom Investment Profiles (YAML)

[↑ Top](#top)

Upload a YAML file via **📁 Import YAML** to add your own preset strategy buttons:

```yaml
profiles:
  - id: myConservative
    label: My Conservative
    emoji: "🛡️"
    description: IG bonds, 3–7 years, SAY ≥ 3%
    profileType: SAY
    sortedBy: SAY
    filters:
      minMatYears: 3
      maxMatYears: 7
      minRating: A-
      minYield: 3.0
      minSAY: 3.0
```

### Available Filter Fields

| Field | Type | Description |
|---|---|---|
| `minMatYears` | number | Minimum years to maturity |
| `maxMatYears` | number | Maximum years to maturity |
| `minRating` | string | Minimum credit rating (e.g. `BBB-`, `A`, `AA-`) |
| `minYield` | number | Minimum current yield % |
| `minSAY` | number | Minimum SAY |
| `maxPrice` | number | Maximum price in EUR |

---

## Coupon Frequency Configuration

[↑ Top](#top)

Configure in `src/main/resources/coupon-frequency.yaml`.

### Default Rules

| Issuer / ISIN Prefix | Frequency | Payments/Year |
|---|---|---|
| IT prefix | Semi-annual | 2 |
| US prefix | Semi-annual | 2 |
| XS prefix | Semi-annual | 2 |
| All others | Annual | 1 |

### File Structure

```yaml
defaultFrequency: ANNUAL

prefixes:
  - prefix: "IT"
    frequency: SEMI_ANNUAL
  - prefix: "XS"
    frequency: SEMI_ANNUAL
  - prefix: "US"
    frequency: SEMI_ANNUAL

exceptions:
  - isin: "IT0005534060"
    frequency: ANNUAL
  - isin: "IT0005534061,IT0005534062"
    frequency: ANNUAL
  - isin: "US912828ZT91"
    frequency: QUARTERLY
```

Supported values: `ANNUAL`, `SEMI_ANNUAL`, `QUARTERLY`.

---

## Tax Rate Configuration

[↑ Top](#top)

Configure in `src/main/resources/tax-rates.yaml`.

> These rates model **withholding tax at source only**. Capital gains tax and any additional tax in your country of residence are not modelled.

### Resolution Order

1. ISIN exception — exact match, highest priority
2. Country — matched against normalized issuer name
3. Default rate — 0% if no rule matches

### Default Country Rates

| Country | Withholding Tax |
|---|---|
| Italy | 12.5% |
| USA | 15.0% |
| Spain | 19.0% |
| Greece | 15.0% |
| Belgium | 30.0% |
| Ireland | 20.0% |
| Romania | 10.0% |
| Hungary | 15.0% |
| Turkey | 10.0% |
| Brazil | 15.0% |
| Germany, France, Austria, Netherlands, Portugal | 0.0% |
| All others | 0.0% |

### File Structure

```yaml
defaultRate: 0.0

countries:
  - country: "ITALIA"
    rate: 12.5
  - country: "USA"
    rate: 15.0

exceptions:
  - isin: "XS1234567890"
    rate: 12.5
  - isin: "XS0001,XS0002,XS0003"
    rate: 0.0
```

---

## Troubleshooting

[↑ Top](#top)

**Search does not find a bond** — ISIN must be exact. Copy-paste from the table.

**Filters do not reset** — Click 🧹 Clear column filters or reload the page.

**Wishlist alerts not triggering** — Reload the page; alerts are evaluated at page load. Click ★ again to verify thresholds.

**Wishlist empty after reload** — Local storage was cleared (private browsing or browser settings). Re-add alerts.

**Dividend Calendar shows wrong months** — Coupon frequency for that country may be incorrect. Add an exception in `coupon-frequency.yaml`.

**Dividend Calendar income too low** — Check the Tax % column; withholding tax reduces income before it appears in the calendar.

**PDF export shows no data** — Portfolio must not be empty and at least one bond must have Σ enabled.

**Data is outdated** — The age indicator (🟢/🟡/🔴) at the top shows freshness. Reload to fetch current data.

---

## Frequently Asked Questions

[↑ Top](#top)

**Which preset should I use?**

- Money needed within 2 years → **Cash Parking**
- Maximum safety → **AAA/AA Fortress**
- Long-term balanced growth → **Balanced Core**
- Regular income in retirement → **Retirement Income** or **Max Income**
- Higher risk, higher return → **Deep Discount** or **Ultra Short High**
- Expecting interest rate cuts → **Long Quality**

**Should I always buy the highest SAY bond?**

Not necessarily. Very high SAY often signals lower credit rating, non-EUR currency risk, or very long maturity. A diversified portfolio of 5–10 bonds across countries, ratings, and maturities typically delivers better risk-adjusted returns.

**What is the difference between SAY and Current Yield?**

Current Yield measures only annual coupon income relative to purchase price. SAY also accounts for the capital gain or loss from buying above or below face value, amortized over the years to maturity. For bonds trading far from par, SAY is the more meaningful metric.

**How often is data updated?**

On every page load. The timestamp and age indicator at the top show exactly how fresh the data is.

**Can I use this on mobile?**

Yes. The table adapts for mobile: flag instead of country name, year-only maturity, abbreviated headers. The Portfolio Analyzer is a full-page view that works well on mobile too.

**What does a price above 100 mean?**

You pay more than face value and receive exactly 100 at maturity — a built-in capital loss. If the coupon income compensates over the holding period, SAY can still be positive. Always verify the SAY column.

**Why is my net SAY lower than expected?**

Check the Tax % column. Default rates come from `tax-rates.yaml` by issuer country. Override per bond directly in the table — changes take effect immediately.

---

## First Portfolio: Step-by-Step

[↑ Top](#top)

1. Click **⚖️ Balanced Core**
2. Sort by **SAY** descending
3. Click **＋** on 5 bonds from different countries
4. Open 🛒 and click **Open in Portfolio Analyzer**
5. Click each basket chip, enter investment amount, click ➕ Add
6. Review **Weighted SAY (net)** and **Weighted Rating**
7. Adjust **Tax %** per bond if needed
8. Review the **Dividend Calendar** for expected monthly income
9. Review the **Maturity Calendar** for capital repayment timeline
10. Click **↑ CSV** to save your portfolio

Set a quarterly reminder to re-import the CSV and review price changes.

---

*Last updated: February 2026 — BondFX v3.0*
