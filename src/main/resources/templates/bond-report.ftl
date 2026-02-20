<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Bond Yield Ranking</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover">
    <link rel="stylesheet" href="/css/bond-report.css">
    <link rel="stylesheet" href="/css/porfolio-analyzer.css">
    <link rel="stylesheet" href="/css/bond-report-mobile.css">
</head>

<body>

<!-- Loading Overlay -->
<div id="loadingOverlay" class="loading-overlay">
    <div class="loading-spinner">
        <div class="spinner"></div>
        <div class="loading-text">Loading data...</div>
    </div>
</div>

<h2>
    BondFX (EUR)
    <span style="font-size:12px;color:#666;">
        — 📅 ${generatedAt}
    </span>
</h2>

<!-- =======================
     PROFILE PRESETS UI
======================= -->
<div class="profile-presets">
    <label>Investor profiles:</label>
    <#list presets as p>
    <button class="preset-button"
            id="${p.id}"
            onclick="applyPreset('${p.id}')"
            title="${p.description}">
        ${p.emoji} ${p.label}
    </button>
    </#list>
    <button class="preset-button" id="preset-reset"
            onclick="applyPreset('reset')">🧹 Reset
    </button>
    <button class="preset-button" id="import-yaml-btn"
            onclick="document.getElementById('yamlFileInput').click()"
            title="Import custom profiles from YAML file">
        📁 Import YAML
    </button>
    <input type="file" id="yamlFileInput" accept=".yaml,.yml" style="display: none;" onchange="handleYamlImport(event)">
    <span class="preset-description" id="presetDesc"></span>
</div>

<div class="controls">
    <!-- Maturity row -->
    <div class="maturity-row">
        <div>
        <label>
            Maturity
        </label>
        </div>
        <div>
        <label>
            from:
            <input id="filterMinMat" type="date" onchange="filterTable()">
        </label>
        </div>
        <div>
        <label>
            to:
            <input id="filterMaxMat" type="date" onchange="filterTable()">
        </label>
        </div>
    </div>

    <!-- Action buttons group -->
    <div class="control-group-actions">
        <button onclick="clearColumnFilters()" title="Remove all filters except the maturity range">
            🧹 Clear column filters
        </button>
        <button onclick="exportCSV()">📥 Export CSV</button>
        <button onclick="window.portfolioAnalyzer?.openModal()" title="Create and analyze custom bond portfolios">
            🎯 Portfolio Analyzer
        </button>
    </div>
</div>

<table id="bondTable">
    <thead>
    <tr>
        <th onclick="sortTable(COL.ISIN)">ISIN<span class="arrow"></span><br>
            <input id="filterIsin" type="text" placeholder="e.g. US900123AT75"
                   onclick="event.stopPropagation()" oninput="filterTable()">
        </th>
        <th onclick="sortTable(COL.ISSUER)">Issuer<span class="arrow"></span><br>
            <input id="filterIssuer" type="text" placeholder="e.g. Romania"
                   onclick="event.stopPropagation()" oninput="filterTable()">
        </th>
        <th onclick="sortTable(COL.PRICE)">Price<span class="arrow"></span><br>
            <input id="filterPriceMin" type="number" step="10" placeholder="min"
                   onclick="event.stopPropagation()" oninput="filterTable()" style="width:60px;">
            <input id="filterPriceMax" type="number" step="10" placeholder="max"
                   onclick="event.stopPropagation()" oninput="filterTable()" style="width:60px;">
        </th>
        <th onclick="sortTable(COL.CURRENCY)" data-short="Curr."><span class="column-title">Currency</span><span class="arrow"></span><br>
            <select id="filterCurrency" onchange="filterTable()" onclick="event.stopPropagation()">
                <option value="">All</option>
                <#list currencies as c>
                <option value="${c}">${c}</option>
                </#list>
            </select>
        </th>
        <th onclick="sortTable(COL.RATING)">Rating<span class="arrow"></span><br>
            <select id="filterMinRating" onchange="filterTable()" onclick="event.stopPropagation()">
                <option value="">All</option>
                <option value="AAA">≥ AAA</option>
                <option value="AA+">≥ AA+</option>
                <option value="AA">≥ AA</option>
                <option value="AA-">≥ AA-</option>
                <option value="A+">≥ A+</option>
                <option value="A">≥ A</option>
                <option value="A-">≥ A-</option>
                <option value="BBB+">≥ BBB+</option>
                <option value="BBB">≥ BBB</option>
                <option value="BBB-">≥ BBB-</option>
                <option value="BB+">≥ BB+</option>
                <option value="BB">≥ BB</option>
                <option value="B+">≥ B+</option>
                <option value="B">≥ B</option>
            </select>
        </th>
        <th onclick="sortTable(COL.PRICE_R)">Price (${reportCurrency})<span class="arrow"></span></th>
        <th onclick="sortTable(COL.COUPON)">Coupon %<span class="arrow"></span></th>
        <th onclick="sortTable(COL.MATURITY)" data-short="Mat."><span class="column-title">Maturity</span><span class="arrow"></span></th>
        <th title="Supposing an investment of EUR 100, what would the gain be?"
            onclick="sortTable(COL.CURR_YIELD)" data-short="CY%">
            <span class="column-title">Curr. Yield %</span><span class="arrow"></span><br>
            <input id="filterminYield" type="number" step="0.5" placeholder="min %"
                   onclick="event.stopPropagation()" oninput="filterTable()" style="width:70px;">
        </th>
        <th title="Supposing an investment of EUR 1,000, what amount will you have at maturity?"
            onclick="sortTable(COL.CAPITAL_AT_MAT)">
            Total Return (1k€)<span class="arrow"></span><br>
            <input id="filterMinCapitalAtMat" type="number" step="500" placeholder="min"
                   onclick="event.stopPropagation()" oninput="filterTable()" style="width:80px;">
        </th>
        <th title="Simple Annual Yield % (Annual coupon income as a percentage of the bond's current price)"
            onclick="sortTable(COL.SAY)" data-short="SAY">
            <span class="column-title">SAY (%)</span><span class="arrow"></span><br>
            <input id="filterMinSAY" type="number" step="0.5" placeholder="min %"
                   onclick="event.stopPropagation()" oninput="filterTable()" style="width:80px;">
        </th>
    </tr>
    </thead>

    <tbody>
    <#list bonds as b>
    <tr>
        <td>${b.getIsin()}</td>
        <td>${b.getIssuer()}</td>
        <td class="<#if (b.getPrice() <= 100)>good<#else>bad</#if>">
            ${b.getPrice()?string["0.00"]}
        </td>
        <td>${b.getCurrency()}</td>
        <td class="<#if (b.getRating()?starts_with('A'))>good<#elseif (b.getRating()?starts_with('BBB'))>neutral<#else>bad</#if>">
            <strong>${b.getRating()}</strong>
        </td>
        <td>
            ${b.getPriceEur()?string["0.00"]}
        </td>
        <td>${b.getCouponPct()?string["0.00"]}</td>
        <td style="white-space: nowrap;">${b.getMaturity()}</td>
        <td>
            ${b.getCurrentYield()?string["0.00"]}
        </td>
        <td>
            ${b.getFinalCapitalToMat()?string["0"]}
        </td>
        <td>
            ${b.getSimpleAnnualYield()?string["0.00"]}
        </td>
    </tr>
    </#list>
    </tbody>
</table>

<!-- Legend for heatmap -->
<div class="legend">
    <div class="legend-title" id="legendTitle">SAY Heatmap (Capital Gain Mode)</div>
    <table class="legend-table" id="legendTable">
        <tr>
            <td style="background: rgb(255, 215, 215);">< 1%</td>
            <td>Terrible (FX currency bonds)</td>
        </tr>
        <tr>
            <td style="background: rgb(255, 245, 190);">1–2.5%</td>
            <td>Poor (needs improvement)</td>
        </tr>
        <tr>
            <td style="background: rgb(215, 245, 215);">2.5–3.5%</td>
            <td>Good (standard sovereign)</td>
        </tr>
        <tr>
            <td style="background: rgb(100, 200, 100);">3.5–4.5%</td>
            <td>Excellent (best value)</td>
        </tr>
        <tr>
            <td style="background: rgb(50, 180, 50);">> 4.5%</td>
            <td>⭐ Top performers</td>
        </tr>
    </table>
</div>

<#include "portfolio-analyzer.ftl">

<!-- JavaScript (external static files) -->
<script>
    /* Inject PRESETS from server-side profiles so JS can use them */
    const PRESETS = {
    <#list presets as p>
      ${p.id}: {
        name: "${p.label}",
        description: "${p.description}",
        profileType: "${p.profileType!'SAY'}",
        sortedBy: "${p.sortedBy!'SAY'}",
        filters: {
        <#list p.filters?keys as k>
          ${k}: ${p.filters[k]?is_number?then(p.filters[k]?c, '"' + p.filters[k] + '"')}<#if k_has_next>,</#if>
        </#list>
        }
      }<#if p_has_next>,</#if>
    </#list>
    };
</script>
<script src="/js/bond-report.js"></script>
<script src="/js/portfolio-analyzer.js"></script>
<script src="/js/bond-report-mobile-adapter.js"></script>
</body>
</html>
