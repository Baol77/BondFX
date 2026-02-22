<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>BondFX</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover">
    <link rel="stylesheet" href="/css/bond-report.css">
    <link rel="stylesheet" href="/css/porfolio-analyzer.css">
    <link rel="stylesheet" href="/css/bond-report-mobile.css">
    <script src="https://unpkg.com/twemoji@latest/dist/twemoji.min.js" crossorigin="anonymous"></script>
</head>

<body>

<!-- Loading Overlay -->
<div id="loadingOverlay" class="loading-overlay">
    <div class="loading-spinner">
        <div class="spinner"></div>
        <div class="loading-text">Loading data...</div>
    </div>
</div>

<h2 class="page-title">
    <span class="page-title__text">BondFX <span class="page-title__currency">(EUR)</span></span>
    <span class="page-title__meta" id="pageMeta">— 📅 <span id="generatedAtLocal"></span> <span id="dataAge"></span></span>
    <span id="generatedAtMs" style="display:none">${generatedAtMs?c}</span>
    <div class="page-title__actions">
        <!-- Basket widget -->
        <div class="basket-widget" id="basketWidget">
            <button class="basket-btn" id="basketBtn" onclick="toggleBasketDropdown()" title="Bond basket">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>
                </svg>
                <span class="basket-count" id="basketCount" style="display:none">0</span>
            </button>
            <div class="basket-dropdown" id="basketDropdown" style="display:none">
                <div class="basket-dropdown__header">
                    <span>Bond Basket</span>
                    <button onclick="clearBasket()" title="Clear all" class="basket-clear-btn">Clear all</button>
                </div>
                <div id="basketItems" class="basket-items"></div>
                <div class="basket-dropdown__footer">
                    <button class="basket-open-analyzer-btn" onclick="goToAnalyzer()">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
                        </svg>
                        Open in Portfolio Analyzer
                    </button>
                </div>
            </div>
        </div>
        <button class="info-icon-btn" onclick="openInfoModal()" title="How to use BondFX" aria-label="Help">ℹ</button>
    </div>
</h2>

<!-- README MODAL -->
<div class="info-modal-backdrop" id="infoModalBackdrop" onclick="closeInfoModal()"></div>
<div class="info-modal" id="infoModal" role="dialog" aria-modal="true" aria-label="How to use BondFX">
    <div class="info-modal__header">
        <span class="info-modal__title">ℹ How to use BondFX</span>
        <button class="info-modal__close" onclick="closeInfoModal()" aria-label="Close">✕</button>
    </div>
    <div class="info-modal__body">
        ${readmeHtml}
    </div>
</div>

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
        <button class="btn-analyzer" onclick="goToAnalyzer()" title="Create and analyze custom bond portfolios">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
            </svg>
            Portfolio Analyzer
        </button>
    </div>
</div>

<table id="bondTable">
    <thead>
    <tr>
        <th class="col-add" title="Add to basket"></th>
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
        <th onclick="sortTable(COL.COUPON)"><span class="column-title">Coupon %</span><span class="col-short">C.%</span><span class="arrow"></span></th>
        <th onclick="sortTable(COL.MATURITY)"><span class="column-title">Maturity</span><span class="col-short">Mat.</span><span class="arrow"></span></th>
        <th title="Supposing an investment of EUR 100, what would the gain be?"
            onclick="sortTable(COL.CURR_YIELD)" data-short="CY%">
            <span class="column-title">Curr. Yield %</span><span class="arrow"></span><br>
            <input id="filterminYield" type="number" step="0.5" placeholder="min %"
                   onclick="event.stopPropagation()" oninput="filterTable()" style="width:70px;">
        </th>
        <th title="Supposing an investment of EUR 1,000, what amount will you have at maturity?"
            onclick="sortTable(COL.CAPITAL_AT_MAT)">
            <span class="column-title">Total Return (1k€)</span><span class="col-short">Tot.Ret.</span><span class="arrow"></span><br>
            <input id="filterMinCapitalAtMat" type="number" step="500" placeholder="min"
                   onclick="event.stopPropagation()" oninput="filterTable()" style="width:80px;">
        </th>
        <th title="Simple Annual Yield % (Annual coupon income as a percentage of the bond's current price)"
            onclick="sortTable(COL.SAY)">
            <span class="column-title">SAY (%)</span><span class="col-short">SAY</span><span class="arrow"></span><br>
            <input id="filterMinSAY" type="number" step="0.5" placeholder="min %"
                   onclick="event.stopPropagation()" oninput="filterTable()" style="width:80px;">
        </th>
    </tr>
    </thead>

    <tbody>
    <#assign flagMap = {"ITALIA":"🇮🇹","GERMANIA":"🇩🇪","FRANCIA":"🇫🇷","SPAGNA":"🇪🇸","PORTOGALLO":"🇵🇹","GRECIA":"🇬🇷","AUSTRIA":"🇦🇹","BELGIO":"🇧🇪","OLANDA":"🇳🇱","FINLANDIA":"🇫🇮","IRLANDA":"🇮🇪","SVEZIA":"🇸🇪","DANIMARCA":"🇩🇰","NORVEGIA":"🇳🇴","SVIZZERA":"🇨🇭","REGNO UNITO":"🇬🇧","USA":"🇺🇸","GIAPPONE":"🇯🇵","ROMANIA":"🇷🇴","POLONIA":"🇵🇱","UNGHERIA":"🇭🇺","BULGARIA":"🇧🇬","CROAZIA":"🇭🇷","SLOVENIA":"🇸🇮","SLOVACCHIA":"🇸🇰","REPUBBLICA CECA":"🇨🇿","ESTONIA":"🇪🇪","LETTONIA":"🇱🇻","LITUANIA":"🇱🇹","CIPRO":"🇨🇾","LUSSEMBURGO":"🇱🇺","TURCHIA":"🇹🇷","BRASILE":"🇧🇷","MESSICO":"🇲🇽","CILE":"🇨🇱","SUDAFRICA":"🇿🇦","PERU":"🇵🇪","AUSTRALIA":"🇦🇺"}>
    <#list bonds as b>
    <tr data-isin="${b.getIsin()}" data-issuer="${b.getIssuer()}" data-coupon="${b.getCouponPct()?string["0.00"]}" data-maturity="${b.getMaturity()}">
        <td class="col-add">
            <button class="add-to-basket-btn"
                    data-isin="${b.getIsin()}"
                    data-issuer="${b.getIssuer()}"
                    data-coupon="${b.getCouponPct()?string["0.00"]}"
                    data-maturity="${b.getMaturity()}"
                    onclick="addToBasket(this)"
                    title="Add to basket">＋</button>
        </td>
        <td>${b.getIsin()}</td>
        <td class="td-issuer">
            <span class="issuer-name">${b.getIssuer()}</span>
<span class="issuer-flag">${flagMap[b.getIssuer()]!'🏳️'}</span>
        </td>
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
        <td class="td-maturity" style="white-space: nowrap;"><span class="mat-full">${b.getMaturity()}</span><span class="mat-year">${b.getMaturity()?substring(0,4)}</span></td>
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

<!-- Portfolio Analyzer is now at /analyzer -->

<!-- Footer -->
<footer class="page-footer">
    BondFX v2.5 &nbsp;·&nbsp;<a href="#" onclick="openInfoModal(); return false;">User Manual</a>
</footer>

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
<script src="/js/bond-report-mobile-adapter.js"></script>
</body>
</html>
