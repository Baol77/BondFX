# 📊 BondFX : Sovereign Bond Analytics Platform — User Manual

**Discover, analyze, and build custom bond portfolios in minutes. Find the best yields across 30+ countries with
intelligent filtering, preset investment strategies, and real-time portfolio analytics.**

---

## Table of Contents

1. [What Is This Platform?](#what-is-this-platform)
2. [Quick Start](#quick-start)
3. [Understanding the Bond Table](#understanding-the-bond-table)
4. [Key Metrics Explained](#key-metrics-explained)
5. [Investment Strategy Presets](#investment-strategy-presets)
6. [Advanced Filtering](#advanced-filtering)
7. [Portfolio Analyzer](#portfolio-analyzer)
8. [Dividend Calendar](#dividend-calendar)
9. [Maturity Calendar](#maturity-calendar)
10. [Analysis Modes](#analysis-modes)
11. [Custom Investment Profiles (YAML)](#custom-investment-profiles-yaml)
12. [Coupon Frequency Configuration](#coupon-frequency-configuration)
13. [Troubleshooting](#troubleshooting)
14. [Frequently Asked Questions](#frequently-asked-questions)

---

## What Is This Platform?

BondFX is a live sovereign bond analytics platform:

**1. The Interactive Report** — A browser-based interface to browse, filter, and analyze sovereign bonds. No technical
knowledge required.

**2. The Spring Boot Backend** — A data engine that scrapes live bond data, calculates returns, applies FX adjustments,
and serves the page. Auto-refreshes every 5 minutes via UptimeRobot.

Together, they form a self-contained investment research tool that requires no subscription or login.

---

## Quick Start

### Step 1 — Open the Report

Navigate to **bondfx.onrender.com**. You will see a table of 1,000+ sovereign bonds with interactive filtering.

### Step 2 — Pick a Strategy Preset

At the top of the page, six preset buttons instantly filter the table to match a specific investment style:

| Preset Button             | Who It Is For                                 | What It Filters                                             |
|---------------------------|-----------------------------------------------|-------------------------------------------------------------|
| 🅿️🛡️ **Cash Parking**   | Short-term, safety-first investors            | Investment-grade bonds, maturity under 2.5 years            |
| ⚡💰 **Ultra Short High**  | Risk-tolerant investors seeking quick returns | Short-term bonds (1–3 years) with yield above 6%            |
| ⚖️🌲 **Balanced Core**    | The majority of long-term investors           | Mid-term (5–15 years), investment-grade, SAY above 3.5%     |
| 💵🔥 **Max Income**       | Retirees and income-focused investors         | Long-duration bonds (15+ years) with current yield above 6% |
| 📉🚀 **Deep Discount**    | Capital-growth investors                      | Bonds trading below 90% of face value, SAY above 5%         |
| 🏰🛡️ **AAA/AA Fortress** | Wealth-preservation, risk-averse investors    | Only top-rated sovereigns (AA− or better)                   |

### Step 3 — Review and Act

Once a preset is active:

- Scroll through the filtered list and review color-coded highlights
- Click any column header to re-sort by that metric
- Click **🎯 Portfolio Analyzer** to open the portfolio builder

---

## Understanding the Bond Table

Each row represents a single sovereign bond:

| Column                 | What It Represents                          | Practical Use                                 |
|------------------------|---------------------------------------------|-----------------------------------------------|
| **ISIN**               | Unique international identifier             | Provide to your broker to place a buy order   |
| **Issuer**             | Country that issued the bond                | Know who you are lending money to             |
| **Price**              | Current price in the bond's native currency | What you pay today per unit                   |
| **Currency**           | Bond denomination currency                  | EUR, USD, GBP, CHF, SEK, etc.                 |
| **Rating**             | Credit quality from rating agencies         | AAA is safest; BB+ and below is speculative   |
| **Price (EUR)**        | Price converted to euros                    | Enables fair comparison across currencies     |
| **Coupon %**           | Fixed annual interest rate                  | A 5% coupon on €1,000 pays €50/year           |
| **Maturity**           | Date the issuer repays principal            | How long your money is committed              |
| **Curr. Yield %**      | Annual income as % of current price         | More accurate than coupon when buying off-par |
| **Total Return (1k€)** | What €1,000 grows to by maturity            | End-state profit in absolute terms            |
| **SAY (%)**            | Simple Annual Yield — total return per year | **The most important column**                 |

---

## Key Metrics Explained

### SAY — Simple Annual Yield

SAY is the single most useful number. It combines coupon income and any capital gain or loss from buying above or below
face value.

**Formula:**

```
SAY = (Annual Coupon % + Capital Gain % per year) / Purchase Price EUR
```

**Example:**

- Buy at €96, face value €100, 5% coupon, 10 years to maturity
- Annual coupon income: €4.80 | Capital gain: €4 over 10 years
- SAY = (€4.80 + €0.40) / €96 = **5.4% per year**

Color coding:

- 🟢 **Dark green** — SAY 4%+ (excellent)
- 🟢 **Light green** — SAY 2.5–4% (good)
- 🟠 **Yellow** — SAY 1–2.5% (acceptable)
- 🔴 **Red** — SAY below 1% (poor)

### Current Yield

Annual cash income as a % of today's price. Does not account for capital gains. Use this if you depend on regular
income.

### Maturity

- **Under 3 years:** Lower risk, lower returns. Good for capital you may need soon.
- **5–10 years:** Balanced risk and return.
- **15+ years:** Higher potential returns, but more interest-rate sensitivity.

---

## Investment Strategy Presets

### 🅿️🛡️ Cash Parking

Safe home for capital needed within 2–3 years. Maturity ≤ 2.5y, rating ≥ BBB+, yield ≥ 2%.

### ⚡💰 Ultra Short High

Maximum yield, short timeframe, accepts higher credit risk. Maturity 1–3y, yield ≥ 6%.

### ⚖️🌲 Balanced Core

All-purpose profile. Maturity 5–15y, rating ≥ BBB+, SAY ≥ 3.5%.

### 💵🔥 Max Income

Maximize annual cash income. Maturity 15+y, yield ≥ 6%, rating ≥ BB+.

### 📉🚀 Deep Discount

Buy cheap, collect capital gain at maturity. Price < €90, maturity 3–20y, SAY ≥ 5%.

### 🏰🛡️ AAA/AA Fortress

Maximum capital safety. Rating ≥ AA−, maturity 5–30y.

---

## Advanced Filtering

- **Click any column header** to sort ascending or descending
- **Type in the filter row** below each header to filter by text or value
- **Combine a preset with manual column sorting** for refined results

**Example:** Click **⚖️ Balanced Core**, then click **Rating** to see the safest bonds within that strategy first.

---

## Portfolio Analyzer

Click **🎯 Portfolio Analyzer** to open the portfolio builder.

### Adding a Bond

1. Search by ISIN or issuer name
2. Select a bond from the results
3. Enter **Total Investment (€)** — quantity is calculated automatically, or enter quantity directly
4. Click **➕ Add to Portfolio**

> Note: modifying the quantity in the portfolio table does **not** change your cost basis (Total Investment). It only
> updates the quantity count.

### Portfolio Dashboard

| Statistic               | What It Means                                           |
|-------------------------|---------------------------------------------------------|
| **Total Investment**    | Original euros committed (cost basis)                   |
| **Weighted SAY**        | Portfolio average annual total return (calculated live) |
| **Weighted Yield**      | Portfolio average annual income yield (calculated live) |
| **Avg Coupon**          | Weighted average interest rate                          |
| **Bond Count**          | Number of distinct bonds                                |
| **Avg Risk (Maturity)** | Weighted average years to maturity                      |
| **Weighted Rating**     | Average credit quality                                  |
| **Total Profit**        | Current market value minus cost basis                   |
| **Coupon Income**       | Estimated annual coupon income in EUR                   |

SAY and Current Yield are always recalculated from live price data — they never use stale cached values.

### Saving and Loading

**Export (📥):** Downloads as CSV. Does not include SAY/Yield (recalculated on import).

**Import (📤):** Reloads a saved CSV with current prices and shows what changed:

```
XS2571924070 (Romania):  €96.50 → €98.75  ↑ +€2.25
US0000000001 (USA):     €105.00 → €103.50  ↓ −€1.50
```

---

## Dividend Calendar

The **Dividend Calendar** shows estimated coupon income per month for the next 12 months across your entire portfolio,
displayed as a bar chart.

Each bar represents the total EUR-equivalent coupon income expected in that month. Non-EUR bonds are converted using the
current FX rate.

Payment months are determined by the bond's maturity month and its coupon frequency (annual, semi-annual, or quarterly).
Frequency is configured automatically by ISIN — see [Coupon Frequency Configuration](#coupon-frequency-configuration).

---

## Maturity Calendar

The **Maturity Calendar** lists every bond in your portfolio sorted by maturity date, showing:

- **Face value returned** at maturity (in original currency for non-EUR bonds, with EUR equivalent)
- **Capital gain/loss** = face value minus your cost basis (green if positive, red if negative)

This lets you plan future cash flows and see at a glance which bonds will repay capital and when.

---

## Analysis Modes

Toggle in the legend section at the bottom of the page.

**Capital Gain Mode (Default)** — focuses on SAY. Best for growth investors.

**Income Mode** — focuses on Current Yield. Best for retirees living off coupons.

---

## Custom Investment Profiles (YAML)

Create your own strategies by uploading a YAML file via **📁 Import YAML**:

```yaml
profiles:
  - id: myConservative
    label: My Conservative Strategy
    emoji: "🛡️"
    description: Investment-grade bonds, 3–7 years, minimum 3% yield
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

| Field         | Type   | Description                                     |
|---------------|--------|-------------------------------------------------|
| `minMatYears` | number | Minimum years to maturity                       |
| `maxMatYears` | number | Maximum years to maturity                       |
| `minRating`   | string | Minimum credit rating (e.g. `BBB-`, `A`, `AA-`) |
| `minYield`    | number | Minimum current yield %                         |
| `minSAY`      | number | Minimum SAY %                                   |
| `maxPrice`    | number | Maximum price in EUR                            |

---

## Coupon Frequency Configuration

The Dividend Calendar needs to know how many times per year each bond pays its coupon. This is configured in
`src/main/resources/coupon-frequency.yaml` on the server.

### Default Rules

| ISIN Prefix | Frequency   | Payments/Year |
|-------------|-------------|---------------|
| IT          | Semi-annual | 2             |
| US          | Semi-annual | 2             |
| All others  | Annual      | 1             |

### File Structure

```yaml
defaultFrequency: ANNUAL   # fallback for all unmatched ISINs

prefixes:
  - prefix: "IT"
    frequency: SEMI_ANNUAL
  - prefix: "XS"
    frequency: SEMI_ANNUAL
  - prefix: "US"
    frequency: SEMI_ANNUAL

exceptions: # exact ISIN overrides — highest priority
  - isin: "IT0005534060"
    frequency: ANNUAL
  - isin: "US912828ZT91"
    frequency: QUARTERLY
```

### Supported Frequencies

- `ANNUAL` — 1 payment per year
- `SEMI_ANNUAL` — 2 payments per year (every 6 months)
- `QUARTERLY` — 4 payments per year

To add an exception for a specific bond, add it under `exceptions` and redeploy. The YAML is read at startup — no code
changes required.

---

## Troubleshooting

**Search does not find a bond** — The ISIN must be exact. Copy-paste from the table.

**Filters do not work** — Click **🧹 Reset** or reload the page to clear all filters.

**Numbers look wrong** — Confirm you are in the correct analysis mode (Capital Gain vs Income). FX values use rates at
the time of the last data refresh.

**Dividend Calendar shows wrong months** — The coupon frequency for that bond's ISIN prefix may be incorrect. Add an
exception in `coupon-frequency.yaml`.

**Data is outdated** — The timestamp at the top shows the last refresh. Data auto-refreshes every 5 minutes.

---

## Frequently Asked Questions

**Which preset should I use?**

1. Need money back within 2 years? → **Cash Parking**
2. Retired, need regular income? → **Max Income**
3. Want maximum safety? → **AAA/AA Fortress**
4. Want long-term growth? → **Balanced Core**
5. Comfortable with higher risk? → **Deep Discount**

**Should I always buy the highest SAY bond?**

Not necessarily. Very high SAY often signals lower credit rating, non-EUR currency risk, or very long maturity. A
diversified portfolio of 5–10 bonds across countries, ratings, and maturities delivers better risk-adjusted returns.

**How often is data updated?**

Every 5 minutes automatically. The timestamp in the top bar shows the exact last refresh.

**Can I use this on mobile?**

Yes — the report is fully responsive for portrait and landscape on all screen sizes.

**What does a price above 100 mean?**

You pay more than face value and will receive exactly 100 at maturity — a built-in capital loss. If the coupon
compensates for this over the holding period, SAY can still be positive. Always check the SAY column.

**Why does my Dividend Calendar show income in unexpected months?**

Payment months are derived from the bond's maturity month. For example, a bond maturing in March with semi-annual
payments will pay in March and September. If this does not match the actual schedule, add a coupon frequency exception
in `coupon-frequency.yaml`.

---

## First Portfolio: Step-by-Step

1. Click **⚖️ Balanced Core**
2. Sort by **SAY** (highest first)
3. Pick 5 bonds from different countries
4. Click **🎯 Portfolio Analyzer**
5. Add each bond with your intended investment amount
6. Check **Weighted SAY** and **Weighted Rating**
7. Review the **Dividend Calendar** for expected monthly income
8. Review the **Maturity Calendar** for capital repayment timeline
9. Confirm **Currency Breakdown** is acceptable
10. Click **📥 Export CSV** to share with your broker

Set a quarterly reminder to reimport the CSV and review price changes.

---

*Last updated: February 2026 — BondFX v2*
