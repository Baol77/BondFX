<a id="top"></a>

# BondFX — Sovereign Bond Analytics Platform · User Manual

**Discover, analyze, and build sovereign bond portfolios in minutes. Browse 1,000+ bonds across 30+ countries, set
price/yield alerts, export professional PDF reports, and personalize your experience with dark mode.**

---

## Table of Contents

1. [What Is BondFX?](#what-is-bondfx)
2. [Typical User Workflow](#typical-user-workflow)
3. [The Bond Table](#the-bond-table)
4. [Key Metrics Explained](#key-metrics-explained)
5. [Investor Profiles](#investor-profiles)
6. [Advanced Filtering](#advanced-filtering)
7. [Wishlist — Price & SAY Alerts](#wishlist--price--say-alerts)
8. [Bond Basket](#bond-basket)
9. [Portfolio Analyzer](#portfolio-analyzer)
10. [Dividend Calendar](#dividend-calendar)
11. [Maturity Calendar](#maturity-calendar)
12. [Capital Growth Simulator](#capital-growth-simulator)
13. [Analysis Modes](#analysis-modes)
14. [Personal Settings](#personal-settings)
15. [Custom Investment Profiles (YAML)](#custom-investment-profiles-yaml)
16. [Coupon Frequency Configuration](#coupon-frequency-configuration)
17. [Tax Rate Configuration](#tax-rate-configuration)
18. [Troubleshooting](#troubleshooting)
19. [Frequently Asked Questions](#frequently-asked-questions)

---

## What Is BondFX?

[↑ Top](#top)

BondFX is a self-contained sovereign bond analytics platform with two components:

**The Interactive Report** — A browser-based interface to browse, filter, track, and analyze sovereign bonds. No login
or subscription required.

**The Spring Boot Backend** — A data engine that scrapes live bond data, calculates returns, applies FX adjustments, and
serves the page. Data is refreshed on every page load.

---

## Typical User Workflow

[↑ Top](#top)

### Step 1 — Browse and Filter

Open **bondfx.onrender.com**. The table loads with **Cash Parking** active by default. Choose a profile that matches
your goals, or clear all filters and browse freely.

### Step 2 — Identify Candidates

Sort by **SAY** descending. For bonds you want to monitor over time, click **★** to add a price or SAY alert to the *
*Wishlist**.

### Step 3 — Build a Shortlist

Click **＋** on bonds you want to analyze together. They go into the **Bond Basket** (basket icon in the header), which
persists across reloads.

### Step 4 — Analyze

Click **Open in Portfolio Analyzer** from the basket dropdown. Add bonds, enter investment amounts, and review the
Portfolio Statistics, Dividend Calendar, and Maturity Calendar.

### Step 5 — Export

- **↑ CSV** — save portfolio with quantities and tax rates
- **PDF icon** — professional report with statistics, currency breakdown, and calendars

### Step 6 — Act

Copy the ISIN and give it to your broker.

---

## The Bond Table

[↑ Top](#top)

On **mobile** (≤ 768px): issuer shows a flag only, maturity shows the year only, column headers are abbreviated (e.g. "
Yld %" instead of "Curr. Yield %").

| Column                | What It Represents                                         | Practical Use                             |
|-----------------------|------------------------------------------------------------|-------------------------------------------|
| **★**                 | Wishlist alert button                                      | Set a price or SAY threshold              |
| **＋**                 | Basket button                                              | Add to analysis shortlist                 |
| **ISIN**              | Unique international identifier                            | Provide to your broker                    |
| **Issuer**            | Issuing country                                            | Know who you are lending to               |
| **Price**             | Current price in native currency                           | What you pay today per unit               |
| **Currency**          | Bond denomination                                          | EUR, USD, GBP, CHF, SEK…                  |
| **Rating**            | Credit quality                                             | AAA = safest; BB+ and below = speculative |
| **Price (base ccy)**  | Price converted to your base currency                      | Fair comparison across currencies         |
| **Coupon %**          | Fixed annual interest rate                                 | 5% coupon on €1,000 = €50/year            |
| **Maturity**          | Principal repayment date                                   | How long your money is committed          |
| **Curr. Yield %**     | Annual income ÷ current price                              | More accurate than coupon when off-par    |
| **Total Return (1k)** | What 1,000 units of your base currency grow to at maturity | End-state absolute profit                 |
| **SAY (%)**           | Simple Annual Yield                                        | **The most important column**             |

---

## Key Metrics Explained

[↑ Top](#top)

### SAY — Simple Annual Yield

SAY is the annualized total return on a standardized 1,000-unit investment (in your base currency), combining coupon
income, capital gain/loss, and an FX risk adjustment for non-base-currency bonds.

**Formula:**

```
SAY = (Total Return at Maturity − 1,000) / (10 × Years to Maturity)
```

**Total Return** is computed as:

```
Total Return = (Coupon % × Years to Maturity × Bonds held × FX coupon factor)
             + (100 × Bonds held × FX redemption factor)
```

The FX factor applies a moderate discount on coupon income and a stronger one on the redemption value for non-EUR bonds,
reflecting exchange-rate uncertainty. EUR bonds have an FX factor of 1 (unaffected).

> SAY is expressed per 1,000 base-currency units invested per year (not as a % of price). SAY = 2.10 means 2.10 units of
> annualized total return per 1,000 invested.

**Heatmap color coding:**

| Color          | SAY Range | Interpretation |
|----------------|-----------|----------------|
| 🟢 Dark green  | ≥ 4.0     | Excellent      |
| 🟢 Light green | 2.5 – 4.0 | Good           |
| 🟡 Yellow      | 1.0 – 2.5 | Acceptable     |
| 🔴 Red         | < 1.0     | Poor           |

### Current Yield

Annual coupon income as a % of today's price. Does not include capital gains. Use for income-focused strategies.

### Total Return (1k€)

Projected total received per 1,000 base-currency units invested at maturity, including all coupons and face-value
redemption. Above 1,000 = gain; below 1,000 = loss.

---

## Investor Profiles

[↑ Top](#top)

Investor Profiles are preset filter strategies that set all table filters in one click. The profile bar below the page
title shows only your **selected** profiles, in the **order you choose**.

### Built-in Profiles

| Profile                     | For                            | What It Filters                            |
|-----------------------------|--------------------------------|--------------------------------------------|
| 🅿️🛡️ **Cash Parking**     | Short-term, safety-first       | IG bonds, maturity ≤ 2.5y, yield ≥ 2%      |
| ⚡💰 **Ultra Short High**    | Risk-tolerant, short timeframe | Maturity 1–3y, yield ≥ 6%, accepts sub-IG  |
| ⚖️🌲 **Balanced Core**      | Long-term general investors    | Maturity 5–15y, IG, SAY ≥ 3.5%             |
| 📉🚀 **Deep Discount**      | Capital-growth investors       | Price < €90, maturity 3–20y, SAY ≥ 5%      |
| 💵🔥 **Max Income**         | Retirees, income-focused       | Yield ≥ 6%, price ≤ 110, rating ≥ BBB−     |
| 🏰🛡️ **AAA/AA Fortress**   | Wealth-preservation            | Rating ≥ AA−, maturity 5–30y, SAY ≥ 3%     |
| 🏛️📈 **Long Quality**      | Rate-cut beneficiaries         | Maturity 20–40y, rating ≥ A−, yield ≥ 4%   |
| 🏖️💵 **Retirement Income** | Long-term stable income        | Maturity 20–35y, yield ≥ 4%, rating ≥ BBB+ |

### Managing Profiles

Open **⚙️ Personal Settings** and scroll to the **Investor Profiles** section. Here you see the full list of built-in
and custom profiles as draggable chips.

- **Select / deselect** — click anywhere on a chip to toggle the ✓ green checkmark. Only selected profiles appear in the
  homepage bar.
- **Reorder** — drag the ⠿ handle on the right to change display order. The homepage bar updates immediately.
- **Delete custom profiles** — click the **✕** button on the right of a custom chip. Built-in profiles cannot be
  deleted.

All profile state (selection, order, custom profiles) is saved to local storage and persists across sessions. It is also
included in the **Settings Backup** export.

---

## Advanced Filtering

[↑ Top](#top)

- Click any **column header** to sort ascending / descending
- Type in the **filter row** under each header to filter by value or text
- Combine a profile with manual column filters for refined results

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

### Navigation

The header shows:

- **← Home** (mobile) / **← Back to BondFX** (desktop) — returns to the bond table
- **↗ Growth** (mobile) / **Capital Growth** (desktop) — opens the Capital Growth Simulator

Labels adapt automatically to screen width.

### Adding a Bond

1. Search by ISIN or issuer
2. Select a result
3. Enter **Total Investment** (in your base currency)
4. Click **➕ Add to Portfolio**

### Toolbar

| Button       | Action                               |
|--------------|--------------------------------------|
| **↑ CSV**    | Export portfolio to CSV              |
| **↓ CSV**    | Import saved CSV with current prices |
| **PDF icon** | Export full PDF report               |
| **🗑**       | Clear portfolio                      |

### Portfolio Statistics

| Metric                   | Description                                    |
|--------------------------|------------------------------------------------|
| **Total Invested**       | Sum of all investment amounts in base currency |
| **Weighted SAY (net)**   | Average SAY weighted by investment, after tax  |
| **Weighted Rating**      | Average credit quality weighted by investment  |
| **Annual Coupon Income** | Projected net annual coupon cash flow          |

---

## Dividend Calendar

[↑ Top](#top)

Shows projected net coupon income per month across the portfolio lifetime.

- Bar heights represent total net coupon income for that month
- Hover to see the breakdown per bond
- Tax withholding is already deducted

---

## Maturity Calendar

[↑ Top](#top)

Shows face-value redemptions month by month.

- Each bar represents principal returning to you at maturity
- Hover for per-bond breakdown
- Values shown in your base currency

---

## Capital Growth Simulator

[↑ Top](#top)

Full-page tool at `/capital-growth` that projects how your portfolio grows year by year under different reinvestment
assumptions.

### Navigation

The header back button shows **← Analyzer** (mobile) / **← Portfolio Analyzer** (desktop).

### Scenarios

Each scenario is configured independently via the tab panel below the chart. Multiple scenarios can coexist and are
shown as separate lines on the chart.

| Scenario                    | What It Models                                                                                                          |
|-----------------------------|-------------------------------------------------------------------------------------------------------------------------|
| **No reinvestment (cash)**  | Coupons paid out as cash; no reinvesting. Always shown as baseline.                                                     |
| **📈 Coupon reinvest**      | Coupons reinvested into the same bond at a configured price shift                                                       |
| **🔄 Maturity replacement** | When a bond matures, all proceeds are routed into a new synthetic bond with a configured net coupon % and maturity year |
| **💰 Annual injection**     | A fixed EUR amount added each year, distributed across active bonds by configurable % allocation                        |

The **No reinvestment** line is always visible as a baseline. Additional scenarios are added via **＋ New scenario** and
configured in the 3-tab panel.

### Scenario Configuration Tabs

Each scenario has three independent tabs:

**📈 Coupon reinvest** — enable coupon reinvestment with an optional global price shift (e.g. +5% = buy at 5% above
current price). Per-bond price overrides are also available.

**🔄 Maturity replacement** — configure one synthetic replacement bond per ISIN. When the source bond matures, its full
redemption proceeds plus final coupon are invested into the replacement at the configured net coupon % and maturity
year. The replacement can itself reinvest coupons or pay them as cash.

**💰 Annual injection** — enable a fixed annual cash injection (e.g. €1,000/year) between a configurable `from` and `to`
year. The amount is split across active (non-matured) bonds proportionally to the % allocation table. Allocations must
sum to 100%; the panel shows the running total in real time. When a bond matures mid-horizon, its allocation % is
automatically redistributed to the remaining active bonds.

### Export / Import Scenarios

Use **↑ Export** to save all scenarios (including portfolio snapshot and configuration) as a JSON file. Use **↓ Import**
to restore a previously saved configuration. The export format is self-contained: it includes the full
`portfolioSnapshot`, all scenario parameters, and `verifyYears` for test fixtures.

### Bond Filter (Stats by Bond)

Above the stat cards, checkboxes let you select individual bonds. Selecting a subset **simultaneously** updates both:

- The **stat cards** (Initial Capital, Final Value, CAGR, etc.)
- The **growth chart** — re-simulated with only the selected bonds, at a proportional start capital

Deselecting all bonds hides all chart lines. Selecting all is equivalent to no filter.

### Chart Views

Click any year on the chart to open the **Year Detail modal** showing coupons, redemptions, reinvestment amounts, and
per-bond breakdown for that year. For years with a maturity replacement activation, the modal highlights the source bond
and the newly created synthetic replacement slot.

### Benchmark Overlay

Overlay ETF benchmarks on the simulation chart to compare your bond portfolio against equity indices:

| Benchmark  | Ticker   |
|------------|----------|
| MSCI World | SWDA.SW  |
| S&P 500    | CSSPX.SW |
| Nasdaq 100 | XNAS.DE  |

Data is fetched via a server-side Yahoo Finance proxy to avoid CORS restrictions. Check or uncheck each benchmark in the
panel to toggle the overlay.

---

## Analysis Modes

[↑ Top](#top)

Toggle in the legend at the bottom of the main page.

- **Capital Gain Mode (default)** — heatmap by SAY. Best for growth investors.
- **Income Mode** — heatmap by Current Yield. Best for income-focused investors.

---

## Personal Settings

[↑ Top](#top)

Click the **⚙️ gear icon** in the top-right header to open the Personal Settings panel. All settings are stored in your
browser (localStorage) and persist across sessions.

### Theme

Toggle between **Light** (default) and **Dark** theme. The preference is applied immediately on every page load —
including the Portfolio Analyzer and Capital Growth Simulator — with no flash of the wrong theme.

Dark mode adjusts all surfaces: background, table, dropdowns, stat cards, wishlist, basket, dialogs, and all sub-pages.

### Base Currency

Select your preferred display currency: **EUR** (€), **CHF** (₣), **USD** ($), or **GBP** (£).

FX rates are fetched from the **ECB** on each page load. The following values update automatically when you switch
currency:

| What changes                                 | Example (EUR → CHF)  |
|----------------------------------------------|----------------------|
| Page title                                   | `BondFX (CHF)`       |
| Price column header & values                 | `Price (CHF)`        |
| Total Return column symbol                   | `Total Return (1k₣)` |
| Portfolio: Investment, Profit, Coupon Income | ₣ values             |
| Portfolio: Maturity Calendar face values     | `₣ 10,450`           |
| Portfolio: Dividend Calendar bar tooltips    | `₣ 497`              |
| Portfolio: Invest.(₣) & Profit (₣) column TH | ₣ symbol             |

> **Internal model:** Bond prices and portfolio cost basis are stored internally in EUR. SAY and Yield are percentage
> ratios — EUR units cancel out, so they are currency-neutral. The base currency setting is **display-only**: amounts
> shown in CHF/USD/GBP are converted from EUR using live ECB rates at page load.

### Investor Profiles

See the [Investor Profiles](#investor-profiles) section above. Select, reorder, and manage custom profiles directly from
this panel.

### Settings Backup

Export all your settings to a JSON file and restore them later or on another device.

**Export** includes: theme, base currency, basket, wishlist, custom profiles, profile order, and profile selection.

**Import** restores everything in one step, including any custom profiles that were saved in the export.

---

## Custom Investment Profiles (YAML)

[↑ Top](#top)

Add your own profiles via **📁 Import YAML** in the **Investor Profiles** section of Personal Settings. Imported profiles
appear in the same chip list as built-in ones, can be selected/deselected, reordered, and deleted individually with **✕
**.

Custom profiles are saved to local storage and included in Settings Backup exports.

### Simple Profile

A simple profile applies a single set of filters and shows all bonds that match.

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

### Composite Profile (Multi-Group)

A composite profile runs **multiple independent filter groups** and merges the results. Each group can also cap how many
bonds it contributes via `top`. This is useful for profiles that combine different strategies — for example, taking the
best long-maturity bonds from one bucket and the best medium-maturity bonds from another.

```yaml
profiles:
  - id: retirementIncome
    label: Retirement Income
    emoji: "🏖️💵"
    description: Top income bonds across two maturity ranges
    profileType: income
    sortedBy: CURR_YIELD
    filters:
      groups:
        - top: 5
          filters:
            minMatYears: 20
            maxMatYears: 35
            minRating: BBB+
            minYield: 4.0
        - top: 5
          filters:
            minMatYears: 10
            maxMatYears: 20
            minRating: BBB-
            minYield: 5.0
```

Within each group, bonds are ranked by current yield (descending) before the `top` cap is applied. The final table shows
the union of all groups. Composite profiles do **not** populate the column filter inputs — they act purely on the table
rows.

### Top-level Profile Fields

| Field         | Type   | Required | Description                                             |
|---------------|--------|----------|---------------------------------------------------------|
| `id`          | string | ✓        | Unique identifier (camelCase, no spaces)                |
| `label`       | string | ✓        | Display name shown in the profile bar                   |
| `emoji`       | string |          | One or two emoji shown before the label                 |
| `description` | string |          | Short description shown in the status bar when active   |
| `profileType` | string |          | `SAY` (default) or `income` — controls heatmap coloring |
| `sortedBy`    | string |          | Column to sort by on activation (see sort keys below)   |

### Sort Keys for `sortedBy`

| Key              | Column                        |
|------------------|-------------------------------|
| `SAY`            | Simple Annual Yield (default) |
| `CURR_YIELD`     | Current Yield %               |
| `CAPITAL_AT_MAT` | Total Return (1k)             |
| `PRICE`          | Price                         |
| `MATURITY`       | Maturity date                 |
| `COUPON`         | Coupon %                      |
| `RATING`         | Credit rating                 |
| `CURRENCY`       | Currency                      |

### Available Filter Fields

These fields apply inside `filters:` (simple profile) or inside each `groups[].filters:` (composite profile).

| Field             | Type   | Description                                                                  |
|-------------------|--------|------------------------------------------------------------------------------|
| `minMatYears`     | number | Minimum years to maturity (decimal supported, e.g. `2.5`)                    |
| `maxMatYears`     | number | Maximum years to maturity                                                    |
| `fromDate`        | string | Minimum maturity as absolute date `YYYY-MM-DD` (overrides `minMatYears`)     |
| `toDate`          | string | Maximum maturity as absolute date `YYYY-MM-DD` (overrides `maxMatYears`)     |
| `minRating`       | string | Minimum credit rating inclusive (e.g. `BBB-`, `A`, `AA-`)                    |
| `maxRating`       | string | Maximum credit rating inclusive — useful to exclude AAA/AA over-priced bonds |
| `minYield`        | number | Minimum current yield %                                                      |
| `minSAY`          | number | Minimum SAY                                                                  |
| `minCapitalAtMat` | number | Minimum Total Return per 1,000 base-currency units at maturity               |
| `minPrice`        | number | Minimum price in the bond's native currency                                  |
| `maxPrice`        | number | Maximum price in the bond's native currency                                  |
| `currency`        | string | Exact currency code to match (e.g. `EUR`, `USD`, `GBP`)                      |

---

## Coupon Frequency Configuration

[↑ Top](#top)

Configure in `src/main/resources/coupon-frequency.yaml`.

| ISIN Prefix | Frequency                                | Payments/Year |
|-------------|------------------------------------------|---------------|
| IT          | Semi-annual                              | 2             |
| US          | Semi-annual                              | 2             |
| XS          | Semi-annual (default, override per ISIN) | 2             |
| All others  | Annual                                   | 1             |

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

Configure in `src/main/resources/tax-rates.yaml`. Models **withholding tax at source only** — capital gains tax and
residence-country tax are not modelled.

**Resolution order:** ISIN exception → Country → Default (0%).

| Country                                         | Withholding Tax |
|-------------------------------------------------|-----------------|
| Italy                                           | 12.5%           |
| USA                                             | 15.0%           |
| Spain                                           | 19.0%           |
| Greece                                          | 15.0%           |
| Belgium                                         | 30.0%           |
| Ireland                                         | 20.0%           |
| Romania                                         | 10.0%           |
| Hungary                                         | 15.0%           |
| Turkey                                          | 10.0%           |
| Brazil                                          | 15.0%           |
| Germany, France, Austria, Netherlands, Portugal | 0.0%            |
| All others                                      | 0.0%            |

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

**Filters do not reset** — Click Clear column filters or reload the page.

**Wishlist alerts not triggering** — Reload the page; alerts are evaluated at page load. Click ★ again to verify
thresholds.

**Wishlist empty after reload** — Local storage was cleared (private browsing). Re-add alerts.

**Dark mode not persisting** — Ensure local storage is not cleared between sessions (check browser privacy settings).

**Dividend Calendar wrong months** — Add a coupon frequency exception in `coupon-frequency.yaml`.

**Dividend Calendar income too low** — Check Tax % column; withholding tax reduces calendar income.

**PDF export shows no data** — Portfolio must not be empty and at least one bond must have Σ enabled.

**Data is outdated** — Reload to fetch current data. The age indicator (🟢/🟡/🔴) shows freshness.

**Growth chart scale seems wrong after filtering bonds** — The chart re-simulates using only the selected bonds and a
proportional starting capital. Selecting 1 bond out of 8 reduces both the simulated portfolio and the capital axis
accordingly. This is the correct behavior.

**Annual injection total shows 0% on first enable** — Click the checkbox to enable injection; the allocation table is
initialized automatically with equal distribution across active bonds. The total will immediately show 100%.

**Benchmark not loading in Capital Growth** — The ETF ticker may be temporarily unavailable on Yahoo Finance. Try
reloading. Check that the ticker is valid at finance.yahoo.com.

**Custom profile disappeared after reload** — Profiles are stored in local storage. If storage was cleared, re-import
the YAML file or restore from a Settings Backup JSON.

---

## Frequently Asked Questions

[↑ Top](#top)

**Which profile should I use?**

- Money needed within 2 years → **Cash Parking**
- Maximum safety → **AAA/AA Fortress**
- Long-term balanced growth → **Balanced Core**
- Regular income in retirement → **Retirement Income** or **Max Income**
- Higher risk, higher return → **Deep Discount** or **Ultra Short High**
- Expecting interest rate cuts → **Long Quality**

**Should I always buy the highest SAY bond?**

Not necessarily. Very high SAY often signals lower credit rating, foreign currency risk, or very long maturity. A
diversified portfolio of 5–10 bonds across countries, ratings, and maturities typically delivers better risk-adjusted
returns.

**What is the difference between SAY and Current Yield?**

Current Yield measures only annual coupon income relative to purchase price. SAY also includes the capital gain or loss
from buying above or below face value, amortized over years to maturity. For bonds trading far from par, SAY is the more
meaningful metric.

**How often is data updated?**

On every page load. The timestamp and age indicator at the top show how fresh the data is.

**Can I use this on mobile?**

Yes. The table adapts on screens ≤ 768px: flag instead of country name, year-only maturity, abbreviated column headers.
Navigation buttons in the Portfolio Analyzer and Capital Growth Simulator also shorten automatically ("Home", "
Growth", "Analyzer"). Both sub-pages are fully functional on mobile.

**What does a price above 100 mean?**

You pay more than face value and receive exactly 100 at maturity — a built-in capital loss. If coupon income compensates
over the holding period, SAY can still be positive. Always check SAY.

**Why is my net SAY lower than expected?**

Check the Tax % column. Override per bond directly in the table — changes take effect immediately.

**How do I back up my profiles and settings?**

Open ⚙️ Personal Settings → Settings Backup → **Export settings**. The JSON file includes your custom profiles, profile
order, selection, basket, wishlist, theme, and currency. Import it on any device to restore everything.

**What happens to the annual injection when a bond matures mid-horizon?**

The matured bond's allocation % is automatically redistributed proportionally among the remaining active bonds. The
total injected amount per year stays the same — only the per-bond split changes.

**Can I combine coupon reinvestment with a maturity replacement in the same scenario?**

Yes. In the same scenario, enable **📈 Coupon reinvest** for bonds you want to compound, and configure a **🔄 Maturity
replacement** for the bond that will mature. The two features operate independently: coupons from surviving bonds are
reinvested, while the maturing bond's full proceeds are routed to the synthetic replacement.

---

## First Portfolio: Step-by-Step

[↑ Top](#top)

1. Click **⚖️ Balanced Core** in the profile bar
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

*Last updated: March 2026 — BondFX v6*
