<a id="top"></a>

# 📊 BondFX — Sovereign Bond Analytics Platform · User Manual

**Discover, analyze, and build sovereign bond portfolios in minutes. Browse 1,000+ bonds across 30+ countries, set price/yield alerts, export professional PDF reports, and personalize your experience with dark mode.**

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
13. [Personal Settings](#personal-settings)
14. [Custom Investment Profiles (YAML)](#custom-investment-profiles-yaml)
15. [Coupon Frequency Configuration](#coupon-frequency-configuration)
16. [Tax Rate Configuration](#tax-rate-configuration)
17. [Troubleshooting](#troubleshooting)
18. [Frequently Asked Questions](#frequently-asked-questions)

---

## What Is BondFX?

[↑ Top](#top)

BondFX is a self-contained sovereign bond analytics platform with two components:

**The Interactive Report** — A browser-based interface to browse, filter, track, and analyze sovereign bonds. No login or subscription required.

**The Spring Boot Backend** — A data engine that scrapes live bond data, calculates returns, applies FX adjustments, and serves the page. Data is refreshed on every page load.

---

## Typical User Workflow

[↑ Top](#top)

### Step 1 — Browse and Filter

Open **bondfx.onrender.com**. The table loads with **Cash Parking** active by default. Choose a preset that matches your goals, or clear all filters and browse freely.

### Step 2 — Identify Candidates

Sort by **SAY** descending. For bonds you want to monitor over time, click **★** to add a price or SAY alert to the **Wishlist**.

### Step 3 — Build a Shortlist

Click **＋** on bonds you want to analyze together. They go into the **Bond Basket** (basket icon in the header), which persists across reloads.

### Step 4 — Analyze

Click **Open in Portfolio Analyzer** from the basket dropdown. Add bonds, enter investment amounts, and review the Portfolio Statistics, Dividend Calendar, and Maturity Calendar.

### Step 5 — Export

- **↑ CSV** — save portfolio with quantities and tax rates
- **PDF icon** — professional report with statistics, currency breakdown, and calendars

### Step 6 — Act

Copy the ISIN and give it to your broker.

---

## The Bond Table

[↑ Top](#top)

On **mobile** (≤ 768px): issuer shows a flag only, maturity shows the year only, headers are abbreviated.

| Column | What It Represents | Practical Use |
|---|---|---|
| **★** | Wishlist alert button | Set a price or SAY threshold |
| **＋** | Basket button | Add to analysis shortlist |
| **ISIN** | Unique international identifier | Provide to your broker |
| **Issuer** | Issuing country | Know who you are lending to |
| **Price** | Current price in native currency | What you pay today per unit |
| **Currency** | Bond denomination | EUR, USD, GBP, CHF, SEK… |
| **Rating** | Credit quality | AAA = safest; BB+ and below = speculative |
| **Price (base ccy)** | Price converted to your base currency | Fair comparison across currencies |
| **Coupon %** | Fixed annual interest rate | 5% coupon on €1,000 = €50/year |
| **Maturity** | Principal repayment date | How long your money is committed |
| **Curr. Yield %** | Annual income ÷ current price | More accurate than coupon when off-par |
| **Total Return (1k)** | What 1,000 units of your base currency grow to at maturity | End-state absolute profit |
| **SAY (%)** | Simple Annual Yield | **The most important column** |

---

## Key Metrics Explained

[↑ Top](#top)

### SAY — Simple Annual Yield

SAY is the annualized total return on a standardized 1,000-unit investment (in your base currency), combining coupon income, capital gain/loss, and an FX risk adjustment for non-base-currency bonds.

**Formula:**

```
SAY = (Total Return at Maturity − 1,000) / (10 × Years to Maturity)
```

**Total Return** is computed as:

```
Total Return = (Coupon % × Years to Maturity × Bonds held × FX coupon factor)
             + (100 × Bonds held × FX redemption factor)
```

The FX factor applies a moderate discount on coupon income and a stronger one on the redemption value for non-EUR bonds, reflecting exchange-rate uncertainty. EUR bonds have an FX factor of 1 (unaffected).

> SAY is expressed per 1,000 base-currency units invested per year (not as a % of price). SAY = 2.10 means 2.10 units of annualized total return per 1,000 invested.

**Heatmap color coding:**

| Color | SAY Range | Interpretation |
|---|---|---|
| 🟢 Dark green | ≥ 4.0 | Excellent |
| 🟢 Light green | 2.5 – 4.0 | Good |
| 🟡 Yellow | 1.0 – 2.5 | Acceptable |
| 🔴 Red | < 1.0 | Poor |

### Current Yield

Annual coupon income as a % of today's price. Does not include capital gains. Use for income-focused strategies.

### Total Return (1k€)

Projected total received per 1,000 base-currency units invested at maturity, including all coupons and face-value redemption. Above 1,000 = gain; below 1,000 = loss.

---

## Investment Strategy Presets

[↑ Top](#top)

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

- Click any **column header** to sort ascending / descending
- Type in the **filter row** under each header to filter by value or text
- Combine a preset with manual column filters for refined results

---

## Wishlist — Price & SAY Alerts

[↑ Top](#top)

Track bonds you are not yet ready to buy by setting alert conditions.

### Adding an Alert

Click **★** on any row. A dialog shows the bond's current price and SAY. Enable one or both:

- **Price ≤ X** — alert when the bond gets cheaper than your target
- **SAY ≥ X** — alert when the yield improves past your threshold

Click **✓ Save Alert**. Saved to local storage, persists across reloads.

### How Alerts Fire

On every page load, BondFX checks all wishlist items against live data:

- ⭐ **pulses** in the header if any threshold is met
- Matching item shows a **green background** in the dropdown
- The triggered criterion is highlighted green with ✓

### Managing Items

In the ⭐ dropdown:

- **→ Basket** — move to basket and remove from wishlist (pulsing stops)
- **✕** — remove alert

---

## Bond Basket

[↑ Top](#top)

The **🧺 Basket** is your analysis shortlist.

- **＋** to add (turns green ✓ when in basket)
- Open the basket to see or remove items
- **Open in Portfolio Analyzer** to send all basket bonds to the Analyzer
- In the Analyzer, basket bonds appear as clickable chips — click one to auto-fill the search

Persists across reloads via local storage.

---

## Portfolio Analyzer

[↑ Top](#top)

Full-page tool at `/analyzer` for building and evaluating portfolios.

### Adding a Bond

1. Search by ISIN or issuer
2. Select a result
3. Enter **Total Investment** (in your base currency)
4. Click **➕ Add to Portfolio**

### Toolbar

| Button | Action |
|---|---|
| **↑ CSV** | Export portfolio to CSV |
| **↓ CSV** | Import saved CSV with current prices |
| **PDF icon** | Export full PDF report |
| **🗑** | Clear portfolio |

### Portfolio Table Columns

ISIN · Issuer · Price · Currency · Rating · Qty · Investment · Maturity · **Yield net%** · **SAY net%** · **Tax %** · Profit · **☑ toggle**

The **☑ toggle** (checkbox column) includes/excludes a bond from statistics and calendars without removing it.

Yield and SAY are always shown **net of withholding tax**. The **Tax %** column is editable per bond — changes recalculate everything instantly.

### Portfolio Statistics

| Statistic | What It Means |
|---|---|
| **Total Investment** | Amount committed in your base currency (cost basis, converted from EUR at current rate) |
| **Avg Price** | Weighted average purchase price |
| **Weighted SAY (gross/net)** | Annualized total return before/after withholding tax |
| **Weighted Yield (gross/net)** | Annual income yield before/after withholding tax |
| **Avg Coupon** | Weighted average coupon rate |
| **Bond Count** | Number of distinct bonds |
| **Avg Risk (Maturity)** | Weighted average years to maturity |
| **Weighted Rating** | Average credit quality |
| **Total Profit** | Market value minus cost basis (price movement only) |
| **Coupon Income (net)** | Estimated annual coupon income after withholding tax (displayed in base currency) |

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

### PDF Export

Landscape A4 report containing:

1. Portfolio table with color-coded profit
2. Portfolio statistics (3-column summary)
3. Currency breakdown (investment and % per currency)
4. Dividend Calendar bar chart (net coupon income, next 12 months)
5. Maturity Calendar (capital returned and gain/loss per bond)

Filename: `BondFX-Portfolio-YYYY-MM-DD.pdf`

---

## Dividend Calendar

[↑ Top](#top)

Bar chart of **net coupon income per month** for the next 12 months across your portfolio. Each bar shows total net coupon income after withholding tax for that month, displayed in your base currency. Payment months are derived from each bond's maturity month and coupon frequency.

---

## Maturity Calendar

[↑ Top](#top)

List of portfolio bonds sorted by maturity date, showing:

- **Capital returned** — face value × quantity (with base-currency equivalent shown for bonds in a different currency)
- **Capital gain/loss** — face value minus cost basis (green if positive, red if negative)

---

## Analysis Modes

[↑ Top](#top)

Toggle in the legend at the bottom of the main page.

- **Capital Gain Mode (default)** — heatmap by SAY. Best for growth investors.
- **Income Mode** — heatmap by Current Yield. Best for income-focused investors.

---

## Personal Settings

[↑ Top](#top)

Click the **⚙️ gear icon** in the top-right header to open the Personal Settings panel. All settings are stored in your browser (localStorage) and persist across sessions.

### Base Currency *(v4.0)*

Select your preferred display currency: **EUR** (€), **CHF** (₣), **USD** ($), or **GBP** (£).

FX rates are fetched from the **ECB** on each page load. The following values update automatically when you switch currency:

| What changes | Example (EUR → CHF) |
|---|---|
| Page title | `BondFX (CHF)` |
| Price column header & values | `Price (CHF)` |
| Total Return column symbol | `Total Return (1k₣)` |
| Portfolio: Investment, Profit, Coupon Income | ₣ values |
| Portfolio: Maturity Calendar face values | `₣ 10,450` |
| Portfolio: Dividend Calendar bar tooltips | `₣ 497` |
| Portfolio: Invest.(₣) & Profit (₣) column TH | ₣ symbol |

> **Internal model:** Bond prices and portfolio cost basis are stored internally in EUR (converted at ECB spot rate at time of scrape/import). SAY and Yield are **percentage ratios** — EUR units cancel out, so they are currency-neutral and correct regardless of base currency. The base currency setting is **display-only**: amounts shown in CHF/USD/GBP are converted from EUR using live ECB rates at page load. Switching base currency does not recompute historical cost basis — it only changes how the stored EUR value is displayed.

**CSV Export** — the file includes a metadata header line:
```
# BondFX Portfolio Export | baseCurrency=CHF | fxRate=0.931200
ISIN,Issuer,Quantity,Investment CHF,...
```

**CSV Import** — if the file was exported in a different currency than your current setting, investment amounts are automatically converted using the saved `fxRate`. No data loss occurs.

### Dark Mode

Toggle between **Light** (default) and **Dark** theme. The preference is saved to local storage and applied immediately on every subsequent page load — including the Portfolio Analyzer — with no flash of the wrong theme.

Dark mode adjusts all surfaces: background, table, dropdowns, stat cards, wishlist, basket, dialogs, and the Portfolio Analyzer page.

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
| `maxPrice` | number | Maximum price (in bond's native currency) |

---

## Coupon Frequency Configuration

[↑ Top](#top)

Configure in `src/main/resources/coupon-frequency.yaml`.

| ISIN Prefix | Frequency | Payments/Year |
|---|---|---|
| IT | Semi-annual | 2 |
| US | Semi-annual | 2 |
| XS | Semi-annual (default, override per ISIN) | 2 |
| All others | Annual | 1 |

```yaml
defaultFrequency: ANNUAL

prefixes:
  - prefix: "IT"
    frequency: SEMI_ANNUAL

exceptions:
  - isin: "IT0005534060"
    frequency: ANNUAL
  - isin: "US912828ZT91"
    frequency: QUARTERLY
```

Supported: `ANNUAL`, `SEMI_ANNUAL`, `QUARTERLY`.

---

## Tax Rate Configuration

[↑ Top](#top)

Configure in `src/main/resources/tax-rates.yaml`. Models **withholding tax at source only** — capital gains tax and residence-country tax are not modelled.

**Resolution order:** ISIN exception → Country → Default (0%).

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

```yaml
defaultRate: 0.0

countries:
  - country: "ITALIA"
    rate: 12.5

exceptions:
  - isin: "XS1234567890"
    rate: 12.5
  - isin: "XS0001,XS0002"
    rate: 0.0
```

---

## Troubleshooting

[↑ Top](#top)

**Search does not find a bond** — ISIN must be exact. Copy-paste from the table.

**Filters do not reset** — Click 🧹 Clear column filters or reload the page.

**Wishlist alerts not triggering** — Reload the page; alerts are evaluated at page load. Click ★ again to verify thresholds.

**Wishlist empty after reload** — Local storage was cleared (private browsing). Re-add alerts.

**Dark mode not persisting** — Ensure local storage is not cleared between sessions (check browser privacy settings).

**Dividend Calendar wrong months** — Add a coupon frequency exception in `coupon-frequency.yaml`.

**Dividend Calendar income too low** — Check Tax % column; withholding tax reduces calendar income.

**PDF export shows no data** — Portfolio must not be empty and at least one bond must have Σ enabled.

**Data is outdated** — Reload to fetch current data. The age indicator (🟢/🟡/🔴) shows freshness.

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

Not necessarily. Very high SAY often signals lower credit rating, foreign currency risk, or very long maturity. A diversified portfolio of 5–10 bonds across countries, ratings, and maturities typically delivers better risk-adjusted returns.

**What is the difference between SAY and Current Yield?**

Current Yield measures only annual coupon income relative to purchase price. SAY also includes the capital gain or loss from buying above or below face value, amortized over years to maturity. For bonds trading far from par, SAY is the more meaningful metric.

**How often is data updated?**

On every page load. The timestamp and age indicator at the top show how fresh the data is.

**Can I use this on mobile?**

Yes. The table adapts: flag instead of country name, year-only maturity, abbreviated headers. The Portfolio Analyzer is a full-page view that works well on mobile too.

**What does a price above 100 mean?**

You pay more than face value and receive exactly 100 at maturity — a built-in capital loss. If coupon income compensates over the holding period, SAY can still be positive. Always check SAY.

**Why is my net SAY lower than expected?**

Check the Tax % column. Override per bond directly in the table — changes take effect immediately.

---

## First Portfolio: Step-by-Step

[↑ Top](#top)

1. Click **⚖️ Balanced Core**
2. Sort by **SAY** descending
3. Click **＋** on 5 bonds from different countries
4. Open the basket → **Open in Portfolio Analyzer**
5. Click each basket chip, enter investment amount, click ➕ Add
6. Review **Weighted SAY (net)** and **Weighted Rating**
7. Adjust **Tax %** per bond if needed
8. Review the **Dividend Calendar** for monthly income
9. Review the **Maturity Calendar** for capital repayment
10. Click **↑ CSV** to save

Set a quarterly reminder to re-import the CSV and review price changes.

---

*Last updated: February 2026 — BondFX v4.0*
