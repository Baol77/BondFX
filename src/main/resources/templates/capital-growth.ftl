<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>BondFX — Capital Growth Simulator</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes">
    <link rel="stylesheet" href="/css/bond-report.css">
    <link rel="stylesheet" href="/css/capital-growth.css">
    <link rel="stylesheet" href="/css/bond-report-mobile.css">
    <script>
        // Apply theme before body renders (no flash)
        if (localStorage.getItem("bondTheme") === "dark") {
            document.documentElement.classList.add("dark");
        }
    </script>
</head>

<body>
<script>
    if (document.documentElement.classList.contains("dark")) {
        document.body.classList.add("dark");
    }
</script>

<div class="cg-page">

    <!-- ── Header ── -->
    <div class="cg-header">
        <a href="/analyzer" class="cg-header__back">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 18 9 12 15 6"/>
            </svg>
            Portfolio Analyzer
        </a>
        <h1 class="cg-header__title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a3a5c"
                 stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
                <polyline points="16 7 22 7 22 13"/>
            </svg>
            Capital Growth Simulator
        </h1>
        <span class="cg-header__meta">BondFX v5.0</span>
    </div>

    <!-- ── Empty state ── -->
    <div id="cgEmptyMsg" class="cg-empty" style="display:none;">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
        </svg>
        <p>No portfolio data found.<br>
            Add bonds in the <a href="/analyzer">Portfolio Analyzer</a> first.</p>
    </div>

    <!-- ── Main content (shown when portfolio exists) ── -->
    <div id="cgMain" style="display:none;">

        <!-- ── Controls bar ── -->
        <div class="cg-controls">
            <div class="cg-control-group">
                <label class="cg-control-label">Initial Capital (<span class="cg-ccy-sym">€</span>)</label>
                <input id="cgCapital" type="number" min="0" step="1000" class="cg-control-input"
                       placeholder="auto from portfolio" style="width:150px;">
            </div>
            <div class="cg-control-group">
                <label class="cg-control-label">View</label>
                <div class="cg-view-toggle">
                    <button id="btnViewYear" class="cg-view-btn cg-view-btn--active">
                        📅 By Year
                    </button>
                    <button id="btnViewBond" class="cg-view-btn">
                        🏦 By Bond
                    </button>
                </div>
            </div>
        </div>

        <!-- ── Summary stats ── -->
        <div id="summaryStats"></div>

        <!-- ── Growth chart (year view) ── -->
        <div id="growthChartWrap">
            <div class="cg-chart-section">
                <div class="cg-chart-title">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
                    </svg>
                    Capital Growth — Year by Year
                    <span style="font-size:10px;font-weight:400;color:#aaa;margin-left:4px;">
                        (net of withholding tax, before capital gains tax)
                    </span>
                </div>
                <div class="cg-chart-wrap">
                    <canvas id="growthChart"></canvas>
                </div>
            </div>

            <!-- ── Custom scenario panel ── -->
            <div class="cg-scenario-panel">
                <div class="cg-scenario-title">
                    🎛️ Custom Reinvestment Scenario
                    <span style="font-size:11px;font-weight:400;color:#888;margin-left:6px;">
                        Add a personalised line to the chart
                    </span>
                </div>
                <div class="cg-scenario-row">
                    <div class="cg-control-group" style="min-width:110px;">
                        <label class="cg-control-label">Reinvest mode</label>
                        <select id="cgCustomMode" class="cg-control-select">
                            <option value="same_bond">Same bond</option>
                            <option value="market_avg" selected>Market avg SAY</option>
                            <option value="none">No reinvestment</option>
                        </select>
                    </div>
                    <div class="cg-control-group" style="min-width:110px;">
                        <label class="cg-control-label">Target SAY % (blank = portfolio avg)</label>
                        <input id="cgCustomSAY" type="number" min="0" max="30" step="0.1"
                               class="cg-control-input" placeholder="e.g. 3.5" style="width:100px;">
                    </div>
                    <div class="cg-control-group" style="min-width:110px;">
                        <label class="cg-control-label">Price shift %</label>
                        <input id="cgCustomPrice" type="number" min="-30" max="30" step="1"
                               class="cg-control-input" placeholder="e.g. -5 or +10" style="width:100px;">
                    </div>
                    <button class="cg-btn-apply" onclick="updateCustomScenario()">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        Apply
                    </button>
                </div>
                <p class="cg-scenario-note">
                    <strong>Same bond</strong> — reinvests coupons and redemptions proportionally into existing bonds at adjusted price.<br>
                    <strong>Market avg SAY</strong> — reinvests into a generic bond at the specified yield and price shift.<br>
                    <strong>Price shift</strong> — +10% means new bonds cost 10% more (yield lower); -10% means market has fallen (better entry).
                </p>
            </div>

            <!-- ── Benchmark panel ── -->
            <#if benchmarks?has_content>
            <div class="cg-bench-panel">
                <div class="cg-scenario-title">
                    📊 Compare with Benchmarks
                    <span style="font-size:11px;font-weight:400;color:#888;margin-left:6px;">
                        Historical performance indexed from portfolio start date · via Yahoo Finance
                    </span>
                </div>
                <div class="cg-bench-grid">
                    <#list benchmarks as b>
                    <label class="cg-bench-item">
                        <input type="checkbox" id="bench-chk-${b.id}"
                               onchange="toggleBenchmark('${b.id}','${b.symbol}','${b.label}','${b.color}',this.checked)">
                        <span class="cg-bench-dot" style="background:${b.color};"></span>
                        ${b.label}
                        <span style="font-size:10px;color:#aaa;">${b.symbol}</span>
                        <span id="bench-err-${b.id}" class="cg-bench-err"></span>
                    </label>
                    </#list>
                </div>
                <p class="cg-scenario-note">
                    Benchmark lines show total return indexed to your portfolio start date.
                    Data fetched live from Yahoo Finance — requires network access.
                    Past performance does not predict future results.
                </p>
            </div>
            </#if>
        </div>

        <!-- ── Bond contribution chart (bond view) ── -->
        <div id="bondChartWrap" style="display:none;">
            <div class="cg-chart-section">
                <div class="cg-chart-title">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/>
                        <line x1="12" y1="17" x2="12" y2="21"/>
                    </svg>
                    Capital Contribution — Per Bond
                    <span style="font-size:10px;font-weight:400;color:#aaa;margin-left:4px;">
                        (cost basis + net coupons + capital gain/loss)
                    </span>
                </div>
                <div class="cg-chart-wrap" id="bondChartWrap__canvas">
                    <canvas id="bondChart"></canvas>
                </div>
            </div>
        </div>

    </div><!-- /cgMain -->

</div><!-- /cg-page -->

<!-- Chart.js CDN -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>
<script src="/js/capital-growth.js"></script>
<script src="/js/bond-report-mobile-adapter.js"></script>

<footer class="page-footer">
    BondFX v5.0 &nbsp;·&nbsp;
    <a href="/analyzer">← Portfolio Analyzer</a> &nbsp;·&nbsp;
    <a href="/">Bond Table</a>
</footer>

</body>
</html>
