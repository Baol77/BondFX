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
    <span class="page-title__text">
        <svg width="128" height="28" viewBox="0 0 128 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="BondFX" role="img" style="display:inline-block;vertical-align:middle;margin-right:4px">
            <defs>
                <linearGradient id="cgAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#4a90d9" stop-opacity=".42"/>
                    <stop offset="100%" stop-color="#4a90d9" stop-opacity=".03"/>
                </linearGradient>
            </defs>
            <path d="M2,21 L8,15 L16,17 L24,9 L32,11 L38,5 L38,28 L2,28 Z" fill="url(#cgAreaGrad)"/>
            <polyline points="2,21 8,15 16,17 24,9 32,11 38,5"
                stroke="#4a90d9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            <circle cx="38" cy="5" r="3" fill="#e53935"/>
            <text x="46" y="22" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="18" font-weight="800" fill="#4a90d9" letter-spacing="-0.5">Bond</text>
            <text x="96" y="22" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="18" font-weight="800" fill="#e53935" letter-spacing="-0.5">FX</text>
        </svg>
        <span class="page-title__currency" id="titleCurrency">(EUR)</span>
    </span>
    <span class="page-title__meta" id="pageMeta">— 📅 <span id="generatedAtLocal"></span> <span id="dataAge"></span></span>
    <span id="generatedAtMs" style="display:none">${generatedAtMs?c}</span>
    <div class="page-title__actions">
        <!-- Wishlist widget -->
        <div class="basket-widget" id="wishlistWidget">
            <button class="basket-btn wishlist-btn" id="wishlistBtn" onclick="toggleWishlistDropdown()" title="Price/SAY alerts">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" id="wishlistIcon">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
                <span class="basket-count wishlist-count" id="wishlistCount" style="display:none">0</span>
            </button>
            <div class="basket-dropdown" id="wishlistDropdown" style="display:none">
                <div class="basket-dropdown__header">
                    <span>⭐ Wishlist</span>
                    <button onclick="clearWishlist()" class="basket-clear-btn">Clear all</button>
                </div>
                <div id="wishlistItems" class="basket-items"></div>
            </div>
        </div>
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
        <button class="settings-btn" onclick="openSettingsModal()" title="Personal settings" aria-label="Settings">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
        </button>
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

<div class="profile-presets" id="profilePresetsBar">
    <label>Investor profiles:</label>
    <!-- populated dynamically by renderProfileBar() -->
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

</div>

<!-- Action toolbar — above bond table -->
<div class="control-group-actions">
    <button class="btn-home-filter btn-home-filter-clear" onclick="clearColumnFilters()" title="Remove all column filters (keeps maturity range)">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
        Clear
    </button>
    <button class="btn-home-filter btn-home-csv" onclick="exportCSV()" title="Export visible bonds to CSV">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="16 6 12 2 8 6"/>
            <line x1="12" y1="2" x2="12" y2="15"/>
            <path d="M20 17v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2"/>
        </svg>
        CSV
    </button>
    <button class="btn-analyzer" onclick="goToAnalyzer()" title="Create and analyze custom bond portfolios">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
        </svg>
        Portfolio Analyzer
    </button>
</div>

<table id="bondTable">
    <thead>
    <tr>
        <th class="col-add" title="Add to basket / wishlist"></th>
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
        <th onclick="sortTable(COL.PRICE_R)">Price (<span id="thPriceCurrency">EUR</span>)<span class="arrow"></span></th>
        <th onclick="sortTable(COL.COUPON)"><span class="column-title">Coupon %</span><span class="col-short">C.%</span><span class="arrow"></span></th>
        <th onclick="sortTable(COL.MATURITY)"><span class="column-title">Maturity</span><span class="col-short">Mat.</span><span class="arrow"></span></th>
        <th title="Supposing an investment of EUR 100, what would the gain be?"
            onclick="sortTable(COL.CURR_YIELD)" data-short="CY%">
            <span class="column-title">Curr. Yield %</span><span class="col-short">Yld %</span><span class="arrow"></span><br>
            <input id="filterminYield" type="number" step="0.5" placeholder="min %"
                   onclick="event.stopPropagation()" oninput="filterTable()" style="width:70px;">
        </th>
        <th title="Supposing an investment of EUR 1,000, what amount will you have at maturity?"
            onclick="sortTable(COL.CAPITAL_AT_MAT)">
            <span class="column-title">Total Return (1k<span class="th-base-ccy">€</span>)</span><span class="col-short">Tot.Ret.</span><span class="arrow"></span><br>
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
    <tr data-isin="${b.getIsin()}" data-issuer="${b.getIssuer()}" data-coupon="${b.getCouponPct()?string["0.00"]}" data-maturity="${b.getMaturity()}" data-price-eur="${b.getPriceEur()?string.computer}" data-capital-eur="${b.getFinalCapitalToMat()?string.computer}">
        <td class="col-add">
            <div class="col-add-inner">
                <button class="add-to-wishlist-btn"
                        data-isin="${b.getIsin()}"
                        data-issuer="${b.getIssuer()}"
                        data-price="${b.getPriceEur()?string.computer}"
                        data-coupon="${b.getCouponPct()?string.computer}"
                        data-maturity="${b.getMaturity()}"
                        data-say="${b.getSimpleAnnualYield()?string.computer}"
                        onclick="openWishlistDialog(this)"
                        title="Add alert">★</button>
                <button class="add-to-basket-btn"
                        data-isin="${b.getIsin()}"
                        data-issuer="${b.getIssuer()}"
                        data-coupon="${b.getCouponPct()?string.computer}"
                        data-maturity="${b.getMaturity()}"
                        onclick="addToBasket(this)"
                        title="Add to basket">＋</button>
            </div>
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
        <td data-capital-eur="${b.getFinalCapitalToMat()?string.computer}">
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

<!-- Settings Modal -->
<div class="settings-backdrop" id="settingsBackdrop" onclick="closeSettingsModal(event)">
    <div class="settings-modal" id="settingsModal">
        <div class="settings-modal__header">
            <span>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:6px;">
                    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
                </svg>
                Personal Settings
            </span>
            <button class="info-modal__close" onclick="closeSettingsModalDirect()">✕</button>
        </div>
        <div class="settings-modal__body">
            <div class="settings-row">
                <span class="settings-label">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:6px;"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                    Theme
                </span>
                <div class="theme-toggle" id="themeToggle" onclick="toggleTheme()">
                    <div class="theme-toggle__track">
                        <span class="theme-toggle__label theme-toggle__light">☀️</span>
                        <span class="theme-toggle__label theme-toggle__dark">🌙</span>
                        <div class="theme-toggle__thumb" id="themeThumb"></div>
                    </div>
                    <span class="theme-toggle__text" id="themeText">Light</span>
                </div>
            </div>
            <div class="settings-row" style="margin-top:16px;">
                <span class="settings-label">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:6px;"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
                    Base Currency
                </span>
                <div class="currency-selector" id="currencySelector">
                    <button class="currency-btn active" data-ccy="EUR" onclick="setBaseCurrency('EUR')">€ EUR</button>
                    <button class="currency-btn" data-ccy="CHF" onclick="setBaseCurrency('CHF')">₣ CHF</button>
                    <button class="currency-btn" data-ccy="USD" onclick="setBaseCurrency('USD')">$ USD</button>
                    <button class="currency-btn" data-ccy="GBP" onclick="setBaseCurrency('GBP')">£ GBP</button>
                </div>
            </div>
            <div class="settings-note" id="fxRateNote" style="margin-top:8px;font-size:11px;color:#888;"></div>

            <!-- Investor Profiles -->
            <div style="border-top:1px solid var(--settings-divider,#e0e4ef);padding-top:16px;">
                <div class="settings-label" style="margin-bottom:10px;">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:6px;"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                    Investor Profiles
                </div>
                <div class="profile-chips" id="profileChips">
                    <!-- populated by renderProfileChips() -->
                </div>
                <div style="margin-top:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    <button class="settings-backup-btn" onclick="document.getElementById('yamlFileInput').click()" title="Import custom profiles from YAML file">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Import YAML
                    </button>
                    <span id="profileImportNote" style="font-size:11px;color:#888;min-height:14px;"></span>
                </div>
                <input type="file" id="yamlFileInput" accept=".yaml,.yml" style="display:none" onchange="handleYamlImport(event)">
            </div>

            <!-- Export / Import Settings -->
            <div style="border-top:1px solid var(--settings-divider, #e0e4ef);margin-top:20px;padding-top:16px;">
                <div class="settings-label" style="margin-bottom:10px;">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:6px;"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2z"/><path d="M7 7h.01"/></svg>
                    Settings Backup
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <button class="settings-backup-btn" onclick="exportSettings()" title="Download all settings as JSON">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        Export settings
                    </button>
                    <button class="settings-backup-btn settings-backup-btn--import" onclick="document.getElementById('settingsFileInput').click()" title="Restore settings from JSON">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Import settings
                    </button>
                    <input type="file" id="settingsFileInput" accept=".json" style="display:none" onchange="importSettings(event)">
                </div>
                <div id="settingsBackupNote" style="font-size:11px;color:#888;margin-top:6px;min-height:14px;"></div>
            </div>
        </div>
    </div>
</div>

<!-- Wishlist Dialog -->
<div id="wishlistDialog" class="wishlist-dialog-backdrop" style="display:none" onclick="closeWishlistDialog(event)">
    <div class="wishlist-dialog">
        <div class="wishlist-dialog__header">
            <span>⭐ Set Alert</span>
            <button onclick="closeWishlistDialogDirect()" class="info-modal__close">✕</button>
        </div>
        <div class="wishlist-dialog__body">
            <p id="wishlistDialogTitle" style="font-weight:600;margin:0 0 12px;font-size:13px;"></p>
            <label class="wishlist-label">
                <input type="checkbox" id="wlPriceCheck"> Alert when Price ≤
                <input type="number" id="wlPriceVal" step="0.01" class="wishlist-input" placeholder="e.g. 95.00">
            </label>
            <label class="wishlist-label">
                <input type="checkbox" id="wlSayCheck"> Alert when SAY ≥
                <input type="number" id="wlSayVal" step="0.01" class="wishlist-input" placeholder="e.g. 4.50">
            </label>
            <p style="font-size:11px;color:#999;margin:8px 0 0;">At least one criterion required.</p>
        </div>
        <div class="wishlist-dialog__footer">
            <button onclick="saveWishlistItem()" class="basket-open-analyzer-btn">✓ Save Alert</button>
        </div>
    </div>
</div>

<!-- Footer -->
<footer class="page-footer">
    BondFX v5 &nbsp;·&nbsp;<a href="#" onclick="openInfoModal(); return false;">User Manual</a>
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
