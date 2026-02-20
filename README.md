# 📊 BondFX : Sovereign Bond Analytics Platform — User Manual

**Discover, analyze, and build custom bond portfolios in minutes. Find the best yields across 30+ countries with intelligent filtering, preset investment strategies, and real-time portfolio analytics.**

---

## Table of Contents

1. [What Is This Platform?](#what-is-this-platform)
2. [Quick Start](#quick-start)
3. [Understanding the Bond Table](#understanding-the-bond-table)
4. [Key Metrics Explained](#key-metrics-explained)
5. [Investment Strategy Presets](#investment-strategy-presets)
6. [Advanced Filtering](#advanced-filtering)
7. [Portfolio Analyzer](#portfolio-analyzer)
8. [Analysis Modes](#analysis-modes)
9. [Custom Investment Profiles (YAML)](#custom-investment-profiles-yaml)
10. [For Administrators: Generating Reports](#for-administrators-generating-reports)
11. [Troubleshooting](#troubleshooting)
12. [Frequently Asked Questions](#frequently-asked-questions)

---

## What Is This Platform?

The Sovereign Bond Analytics Platform is a two-part tool:

**1. The Interactive Report** (`docs/eur/index.html`) — A browser-based interface that lets any investor browse, filter, and analyze sovereign bonds without any technical knowledge. Just open the HTML file in a browser.

**2. The Java Backend** (`BondApp.java`) — A data engine that scrapes live bond data, calculates returns, applies FX adjustments, and generates the HTML report. This part is run by an administrator.

Together, they form a self-contained investment research tool that works offline, stores no data on external servers, and requires no subscription or login.

---

## Quick Start

### Step 1 — Open the Report

Open `docs/eur/index.html` in any modern web browser (Chrome, Firefox, Safari, Edge). You will see a table of 1,000+ sovereign bonds with interactive filtering options.

> **Note:** If you are accessing a hosted version via GitHub Pages, just navigate to the published URL. No local installation is required.

### Step 2 — Pick a Strategy Preset

At the top of the page, six preset buttons instantly filter the table to match a specific investment style:

| Preset Button | Who It Is For | What It Filters |
|---|---|---|
| 🅿️🛡️ **Cash Parking** | Short-term, safety-first investors | Investment-grade bonds, maturity under 2.5 years |
| ⚡💰 **Ultra Short High** | Risk-tolerant investors seeking quick returns | Short-term bonds (1–3 years) with yield above 6% |
| ⚖️🌲 **Balanced Core** | The majority of long-term investors | Mid-term (5–15 years), investment-grade, SAY above 3.5% |
| 💵🔥 **Max Income** | Retirees and income-focused investors | Long-duration bonds (15+ years) with current yield above 6% |
| 📉🚀 **Deep Discount** | Capital-growth investors | Bonds trading below 90% of face value, SAY above 5% |
| 🏰🛡️ **AAA/AA Fortress** | Wealth-preservation, risk-averse investors | Only top-rated sovereigns (AA− or better) |

Click any button and the table instantly narrows to bonds matching that strategy, sorted by the best opportunities first.

### Step 3 — Review and Act

Once a preset is active:
- Scroll through the filtered list and review color-coded highlights
- Click any column header to re-sort by that metric
- Click **🎯 Portfolio Analysis** to open the portfolio builder and model a real investment

---

## Understanding the Bond Table

Each row in the table represents a single sovereign bond. The columns are:

| Column | What It Represents | Practical Use |
|---|---|---|
| **ISIN** | Unique international identifier code | Provide this code to your broker to place a buy order |
| **Issuer** | Country that issued the bond | Know who you are lending money to |
| **Price** | Current price in the bond's native currency | What you pay today per unit |
| **Currency** | Currency the bond is denominated in | EUR, USD, GBP, CHF, SEK, etc. |
| **Rating** | Credit quality assigned by rating agencies | AAA is safest; BB+ and below is speculative grade |
| **Price (EUR)** | Price converted to euros | Enables fair comparison across all currencies |
| **Coupon %** | Fixed annual interest rate | A 5% coupon on a €1,000 bond pays €50 per year |
| **Maturity** | Date the issuer repays the principal | Determines how long your money is committed |
| **Curr. Yield %** | Annual income as a percentage of current price | More accurate than coupon when buying above or below par |
| **Total Return (1k€)** | What €1,000 invested grows to by maturity | Shows the end-state profit in absolute terms |
| **SAY (%)** | Simple Annual Yield — total return per year | **The most important column.** See explanation below. |

---

## Key Metrics Explained

### SAY — Simple Annual Yield

SAY is the single most useful number in the table. It measures total annual return, combining both the coupon income you receive each year and any capital gain (or loss) from buying the bond above or below its face value.

**Formula:**
```
SAY = (Annual Coupon + Capital Gain over holding period / Years to maturity) / Purchase Price
```

**Example:**
- You buy a bond for €96 (below its €100 face value)
- It pays a 5% coupon, so €4.80/year on your €96 purchase (5% coupon on €96)
- At maturity (10 years away), you receive €100 back — a €4 capital gain
- SAY = (€4.80 + €4 / 10) / €96 = **5.4% per year**

The bond table uses color coding to communicate SAY quality at a glance:
- 🟢 **Dark green** — SAY 4%+ (excellent)
- 🟢 **Light green** — SAY 2.5–4% (good)
- 🟠 **Yellow/orange** — SAY 1–2.5% (acceptable)
- 🔴 **Red** — SAY below 1% (poor, consider avoiding)

### Current Yield

Current Yield is the annual cash income you receive expressed as a percentage of the price you pay today. It does not account for capital gains.

Use this metric if you depend on regular income, such as during retirement. A high current yield means more cash in your pocket each year.

### Maturity

Maturity is the date the issuing government repays your principal.

- **Short maturity (under 3 years):** Lower risk, lower returns. Good for cash you may need soon.
- **Medium maturity (5–10 years):** Balanced risk and return.
- **Long maturity (15+ years):** Higher potential returns, but more sensitivity to interest rate changes.

---

## Investment Strategy Presets

The six presets are configured from a YAML profile file and represent the most common investor needs. Here is what each one does internally:

### 🅿️🛡️ Cash Parking
**Purpose:** A safe home for capital you may need within 2–3 years.
- Maturity: up to 2.5 years
- Minimum rating: BBB+
- Minimum yield: 2%
- Sorted by: SAY (highest first)

### ⚡💰 Ultra Short High
**Purpose:** Maximum yield in a short time frame. Accepts higher credit risk.
- Maturity: 1–3 years
- Minimum yield: 6%
- Sorted by: SAY

### ⚖️🌲 Balanced Core
**Purpose:** The all-purpose profile for most investors — solid returns with investment-grade safety.
- Maturity: 5–15 years
- Minimum rating: BBB+
- Minimum yield: 3.5%
- Minimum SAY: 3.5%
- Sorted by: SAY

### 💵🔥 Max Income
**Purpose:** Maximize the cash you receive each year, regardless of capital gain.
- Maturity: 15+ years
- Maximum price: €110 (avoids overpaying for income)
- Minimum yield: 6%
- Minimum rating: BB+
- Sorted by: Current Yield (highest first)

### 📉🚀 Deep Discount
**Purpose:** Buy bonds cheaply, hold until maturity, and collect the capital gain as the price rises toward face value.
- Price: below €90 (buying at a discount)
- Maturity: 3–20 years
- Minimum SAY: 5%
- Sorted by: SAY

### 🏰🛡️ AAA/AA Fortress
**Purpose:** Maximum capital safety, accepting lower returns in exchange for near-zero default risk.
- Minimum rating: AA−
- Maturity: 5–30 years
- Minimum SAL (Simple Annual Loss adjusted): 3%
- Sorted by: SAY

---

## Advanced Filtering

In addition to presets, you can apply manual filters directly on the table:

- **Click any column header** to sort ascending or descending
- **Type in the filter row** below the header to filter by text (e.g., type "DE" to see only German bonds)
- **Combine a preset with manual column sorting** for refined results

**Practical example:** Click **⚖️ Balanced Core**, then click the **Rating** column header to view the safest bonds within that strategy first.

---

## Portfolio Analyzer

The Portfolio Analyzer lets you build a hypothetical portfolio, review its aggregate statistics, and export a shopping list for your broker.

### Opening the Analyzer

Click the **🎯 Portfolio Analysis** button at the top of the page. A panel opens at the bottom (or in a modal depending on your screen).

### Adding a Bond

1. Enter the **ISIN code** of the bond (copy it from the table by clicking the ISIN cell)
2. Click **🔍 Search** — bond details load automatically
3. Enter either:
    - **Quantity** (number of units), or
    - **€ Amount** (how much money to invest)
      The other field calculates automatically.
4. Click **➕ Add to Portfolio**

Repeat for each bond you want to include. A diversified portfolio typically contains 5–10 bonds across different countries, ratings, and maturities.

### Reading the Portfolio Dashboard

After adding bonds, the dashboard shows 8 statistics:

| Statistic | What It Means |
|---|---|
| **Total Investment** | The total euros committed across all bonds |
| **Avg Price** | The weighted average price paid per bond unit in euros |
| **Weighted SAY** | Your portfolio's average annual total return |
| **Weighted Yield** | Your portfolio's average annual income yield |
| **Avg Coupon** | Weighted average interest rate across all holdings |
| **Bond Count** | Number of distinct bonds in the portfolio |
| **Avg Risk (Maturity)** | Weighted average years until all bonds mature |
| **Weighted Rating** | Average credit quality across the portfolio |

**Example reading:**
```
Total Investment:  €15,000
Weighted SAY:       4.62%   ← You earn 4.62% per year on average
Weighted Rating:    A−      ← Mostly safe, some moderate-risk bonds
Avg Maturity:       8.2 yrs ← Your money is committed for ~8 years
```

### Currency Breakdown

Below the statistics, the analyzer shows how your investment is distributed by currency:

```
EUR    80%   €12,000
USD    15%    €2,250
GBP     5%      €750
```

If a large portion is in a single non-euro currency, you carry foreign exchange risk — the value of your returns in euros may fall if that currency weakens. Aim for a currency distribution that matches your comfort level.

### Managing Your Portfolio

- **Edit a quantity:** Click directly on the quantity value in the portfolio table, change the number, and statistics update instantly.
- **Remove a bond:** Click the ❌ icon next to a bond row.
- **Clear everything:** Click **🗑️ Clear** to reset and start fresh.

### Saving and Loading Portfolios

**Export (📥):** Downloads the current portfolio as a CSV file. Use this to:
- Back up your research
- Share with a financial advisor
- Open in Excel for further analysis

**Import (📤):** Loads a previously saved CSV file. The system automatically refreshes bond prices to current market values and shows you what changed:

```
✅ Imported 4 bonds

📊 Price Changes Since You Saved:
XS2571924070 (Romania):  €96.50 → €98.75  ↑ +€2.25
US0000000001 (USA):     €105.00 → €103.50  ↓ −€1.50
```

This makes quarterly portfolio reviews easy — save today, reimport in 3 months, and immediately see which bonds gained or lost value.

---

## Analysis Modes

The platform offers two analysis perspectives, toggled using the legend at the bottom of the main page.

### Capital Gain Mode (Default)
Focuses on **SAY — total annual return.** Best for growth investors who reinvest income and want to maximize the final value of their investment.

Color coding:
- 🔴 Red — SAY below 1%
- 🟠 Yellow — SAY 1–2.5%
- 🟢 Light green — SAY 2.5%+
- 🟢 Dark green — SAY 4%+

### Income Mode
Focuses on **Current Yield — annual cash income.** Best for investors who need regular income, such as retirees living off bond coupons.

Color coding:
- 🔴 Red — Current Yield below 3%
- 🟠 Yellow — Current Yield 3–4.5%
- 🟢 Light green — Current Yield 4.5%+
- 🟢 Dark green — Current Yield 6%+

Switch between modes by clicking the toggle in the legend section of the page. The entire table re-colors instantly.

---

## Custom Investment Profiles (YAML)

Beyond the six built-in presets, you can create your own investment strategies by uploading a custom YAML configuration file.

### When to Use Custom Profiles

Custom profiles are useful when you have specific investment constraints such as:
- A minimum rating you will not go below (e.g., only A− and above)
- A currency preference or restriction
- A specific maturity window
- A yield threshold different from the built-in presets

### YAML File Format

Create a file (e.g., `my-profiles.yaml`) using this structure:

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

  - id: myHighYield
    label: High Yield Hunt
    emoji: "🎯"
    description: Sub-investment grade, 5–15 years, SAY above 6%
    profileType: SAY
    sortedBy: SAY
    filters:
      minMatYears: 5
      maxMatYears: 15
      minSAY: 6.0
      minYield: 5.0
```

### Available Filter Fields

| Field | Type | Description |
|---|---|---|
| `minMatYears` | number | Minimum years to maturity |
| `maxMatYears` | number | Maximum years to maturity |
| `minRating` | string | Minimum credit rating (e.g., `BBB-`, `A`, `AA-`) |
| `minYield` | number | Minimum current yield percentage |
| `minSAY` | number | Minimum SAY percentage |
| `maxPrice` | number | Maximum bond price in EUR |
| `minSAL` | number | Minimum SAL (Simple Annual Loss) metric |

### Loading Custom Profiles

In the browser interface, look for the **Upload Profile** or **Custom Strategy** button. Select your YAML file and the new presets appear alongside the built-in ones. Your custom strategies are only active during that browser session — upload the file again each time you open the report.

A reference example is available at `docs/bond-profiles-custom.yaml` in the project folder.

---

## For Administrators: Generating Reports

This section is for the person who maintains the platform and refreshes the bond data.

### Prerequisites

- **Java 17** or later installed
- **Apache Maven** installed
- Internet access (the scraper fetches live bond data)

### Building the Project

```bash
# Clone or unzip the project
cd BondReport

# Compile and run
mvn exec:java
```

This will:
1. Load current FX exchange rates
2. Scrape live sovereign bond data for 30+ countries
3. Calculate SAY, Current Yield, and scoring metrics for each bond
4. Apply EUR conversions using live FX rates
5. Generate `docs/eur/index.html`

On completion you will see:
```
🚀 Starting Sovereign Bond Analytics...
📊 Loaded 1,247 bonds
✅ Reports generated:
 - docs/eur/index.html
```

### Running Tests

```bash
mvn test
```

The test suite validates bond calculation logic (`BondCalculatorTest.java`) and ensures yield and SAY computations are correct.

### Project Structure

```
BondReport/
├── src/main/java/bond/
│   ├── BondApp.java              # Entry point
│   ├── calc/BondCalculator.java  # SAY, yield, return calculations
│   ├── config/BondProfile.java   # YAML profile model
│   ├── fx/FxService.java         # FX rate loader and converter
│   ├── model/Bond.java           # Bond data model
│   ├── rating/RatingService.java # Credit rating normalizer
│   ├── report/HtmlReportWriter.java # HTML generation via FreeMarker
│   ├── scoring/BondScoreEngine.java # Score computation logic
│   └── scrape/BondScraper.java   # Live data scraper
├── src/main/resources/
│   ├── bond-profiles.yaml        # Default strategy presets
│   ├── ftl/bond-report.ftl       # HTML report template
│   ├── css/                      # Stylesheets
│   └── js/                       # Report interactivity
├── docs/
│   ├── eur/index.html            # Generated EUR report (open this)
│   └── bond-profiles-custom.yaml # Custom profile example
└── pom.xml                       # Maven build configuration
```

### Automating Refresh

To keep the report current, schedule `mvn exec:java` as a cron job or CI/CD pipeline step. The GitHub Actions workflow at `.github/workflows/static.yml` is already configured to publish `docs/` to GitHub Pages automatically on each push.

---

## Troubleshooting

### Portfolio does not save between sessions

The Portfolio Analyzer stores data in your browser's **localStorage**. Check the following:

1. localStorage must be enabled (Browser Settings → Privacy → Site Data)
2. Incognito / private browsing mode disables localStorage — use a regular window
3. Some browser extensions that block tracking can also block localStorage
4. Try a different browser if the issue persists

### Search does not find a bond

- The ISIN code must be exact — copy and paste it directly from the table rather than typing it manually
- Ensure you are searching within the currently loaded report (data is not fetched from the internet in real time)

### Filters do not seem to work

- Click on the column header to confirm the filter row is active
- Check that the filter value format is correct (numbers for numeric columns, text for text columns)
- Click **Reset** or reload the page to clear all active filters and start fresh

### Numbers look wrong or unexpected

- Confirm the price column is showing EUR values, not the original currency
- Check whether you are in **Capital Gain Mode** or **Income Mode** — this changes the color coding and highlighted metric
- FX-adjusted values are based on exchange rates at the time the report was generated, not real-time rates

### Report is outdated

Contact your administrator to re-run the data generation script (`mvn exec:java`). The generation timestamp is displayed at the top of the report page.

---

## Frequently Asked Questions

**Which preset should I use?**

Answer these questions in order:
1. Do you need the money back within 2 years? → **Cash Parking**
2. Are you retired and need regular income? → **Max Income**
3. Do you want the absolute maximum safety? → **AAA/AA Fortress**
4. Do you want long-term growth with balanced risk? → **Balanced Core**
5. Are you comfortable with higher risk for higher returns? → **Deep Discount** or **SAY Aggressive**

**Should I always buy the bond with the highest SAY?**

Not necessarily. A very high SAY often signals:
- A lower credit rating (greater default risk)
- A non-EUR currency (FX risk — returns may shrink if that currency weakens)
- A very long maturity (more sensitive to interest rate changes)

A portfolio of 5–10 diversified bonds across different countries, ratings, and maturities will typically deliver better risk-adjusted returns than a single high-SAY pick.

**How often is the data updated?**

Data is updated each time the administrator runs the data generation script. The timestamp in the top bar of the report tells you exactly when the data was last refreshed. Ask your administrator for the update schedule.

**Can I use this on a mobile phone?**

Yes. The report is fully responsive:
- **Portrait mode:** Single-column layout optimized for scrolling
- **Landscape mode:** Compact table view
- **Desktop:** Full table with all columns visible

**Can I share my portfolio with a financial advisor?**

Yes. Use **📥 Export CSV** to download your portfolio as a spreadsheet-compatible file. Email this to your advisor. They can open it in Excel, add notes, and return it for your confirmation. When you receive it back, use **📤 Import CSV** to reload it with updated prices.

**What does it mean when a bond is priced above 100?**

A price above 100 means you are paying more than the face value. You will receive exactly 100 back at maturity, so there is a built-in capital loss. However, if the coupon is high enough to more than compensate for that loss over the holding period, the bond can still have a positive SAY. Always check the SAY column rather than just the price.

**Is my data sent to any server?**

No. The report is a static HTML file that runs entirely in your browser. The Portfolio Analyzer stores data in your browser's localStorage. Nothing is transmitted to external servers.

---

## Summary: Step-by-Step First Portfolio

Here is a complete walkthrough for building your first bond portfolio:

1. Open `docs/eur/index.html` in your browser
2. Click **⚖️ Balanced Core** to see investment-grade, mid-term bonds
3. Click the **SAY** column header to sort by best return first
4. Select 5 bonds from different countries (diversification reduces risk)
5. Click **🎯 Portfolio Analysis**
6. Add each bond using its ISIN and your intended investment amount
7. Review the **Weighted SAY** and **Weighted Rating** in the dashboard
8. Confirm the **Currency Breakdown** is acceptable
9. Click **📥 Export CSV**
10. Share the file with your broker or financial advisor

Set a quarterly reminder to reimport the CSV, compare updated prices, and rebalance if needed.

---

*Last updated: February 2026*
*Version: 6.2 — Sovereign Bond Analytics Platform*
*For Investors, By Investors 📊*