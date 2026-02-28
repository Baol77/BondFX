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
        if (localStorage.getItem("bondTheme") === "dark") document.documentElement.classList.add("dark");
    </script>
</head>
<body>
<script>
    if (document.documentElement.classList.contains("dark")) document.body.classList.add("dark");
</script>

<div class="cg-page">

    <div class="cg-header">
        <a href="/analyzer" class="cg-header__back" data-short="Analyzer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            Portfolio Analyzer
        </a>
        <h1 class="cg-header__title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a3a5c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
            </svg>
            Capital Growth Simulator
        </h1>
        <span class="cg-header__meta">BondFX v5</span>
    </div>

    <div id="cgEmptyMsg" class="cg-empty" style="display:none;">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/></svg>
        <p>No portfolio data found.<br>Add bonds in the <a href="/analyzer">Portfolio Analyzer</a> first.</p>
    </div>

    <div id="cgMain" style="display:none;">

        <!-- Summary stats + bond list -->
        <div id="summaryStats"></div>

        <!-- YEAR VIEW -->
        <div id="wrap_year">

            <div class="cg-chart-section">
                <div class="cg-chart-title">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/></svg>
                    Capital Growth &mdash; Year by Year
                    <span style="font-size:10px;font-weight:400;color:#aaa;margin-left:6px;">net of withholding tax &middot; click any year for details</span>
                </div>
                <div class="cg-chart-wrap"><canvas id="growthChart"></canvas></div>
            </div>

            <!-- Scenario panel (filled by JS) -->
            <div class="cg-scenario-panel" id="perIsinPanel"></div>

        </div><!-- /wrap_year -->

    </div><!-- /cgMain -->
</div><!-- /cg-page -->

<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>
<script src="/js/capital-growth.js"></script>
<script src="/js/bond-report-mobile-adapter.js"></script>

<footer class="page-footer">
    BondFX v5.0 &nbsp;&middot;&nbsp;
    <a href="/analyzer">&larr; Portfolio Analyzer</a> &nbsp;&middot;&nbsp;
    <a href="/">Bond Table</a>
</footer>
</body>
</html>
