<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>BondFX — Portfolio Analyzer</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover">
    <link rel="stylesheet" href="/css/bond-report.css">
    <link rel="stylesheet" href="/css/porfolio-analyzer.css">
    <link rel="stylesheet" href="/css/bond-report-mobile.css">
    <style>
        /* ── Analyzer page layout ── */
        .analyzer-header {
            display: flex;
            align-items: center;
            gap: 14px;
            margin-bottom: 20px;
            padding-bottom: 12px;
            border-bottom: 2px solid #e8edf2;
        }
        .analyzer-header__back {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            color: #1a73e8;
            text-decoration: none;
            font-size: 13px;
            font-weight: 600;
            padding: 6px 12px;
            border: 1.5px solid #1a73e8;
            border-radius: 6px;
            transition: background 0.15s, color 0.15s;
            flex-shrink: 0;
        }
        .analyzer-header__back:hover {
            background: #1a73e8;
            color: #fff;
        }
        .analyzer-header__title {
            font-size: 20px;
            font-weight: 700;
            color: #1a3a5c;
            margin: 0;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .analyzer-header__title svg {
            flex-shrink: 0;
        }
        .analyzer-header__meta {
            margin-left: auto;
            font-size: 11px;
            color: #999;
        }

        /* ── Override modal styles — make it a plain page ── */
        .portfolio-modal {
            display: block !important;
            position: static !important;
            background: none !important;
            z-index: auto !important;
        }
        .portfolio-modal-content {
            max-width: 100% !important;
            width: 100% !important;
            height: auto !important;
            max-height: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            display: block !important;
        }
        .portfolio-modal-header { display: none !important; }
        .portfolio-modal-body {
            overflow: visible !important;
            height: auto !important;
            padding: 0 !important;
        }

        /* ── Dark mode — same specificity as the !important overrides above ── */
        body.dark .portfolio-modal-content  { background: #13151f !important; color: #d0d8f0 !important; }
        body.dark .portfolio-modal-body     { background: #13151f !important; }
        body.dark body, body.dark           { background: #13151f !important; }
        body.dark .portfolio-table          { border-color: #2a2d45 !important; }
        body.dark .portfolio-table th       { background: #252840 !important; color: #c0c8e8 !important; border-color: #2a2d45 !important; }
        body.dark .portfolio-table td       { border-color: #2a2d45 !important; color: #c8d0e8 !important; }
        body.dark .portfolio-table tr:nth-child(even) td { background: #1a1d2e !important; }
        body.dark .portfolio-table tr:hover td           { background: #1e2440 !important; }
        body.dark .portfolio-table input    { background: #252840 !important; border-color: #3a3f5c !important; color: #c0c8e8 !important; }
        body.dark .stat-card                { background: #252840 !important; border-color: #2a2d45 !important; color: #c0c8e8 !important; }
        body.dark .stat-card.stat-neutral   { background: #1e2a40 !important; border-left-color: #4a7cc7 !important; }
        body.dark .stat-card.stat-neutral .stat-label { color: #7ab4f7 !important; }
        body.dark .stat-card.stat-neutral .stat-value { color: #7ab4f7 !important; }
        body.dark .stat-card.stat-green     { background: #1a2e1a !important; border-left-color: #2e7d32 !important; }
        body.dark .stat-card.stat-yellow    { background: #2a2510 !important; border-left-color: #7a6010 !important; }
        body.dark .stat-card.stat-red       { background: #2e1a1a !important; border-left-color: #8a2a2a !important; }
        body.dark .stat-value               { color: #e0e4ff !important; }
        body.dark .stat-label               { color: #8890b8 !important; }
        body.dark .search-input             { background: #252840 !important; border-color: #3a3f5c !important; color: #c0c8e8 !important; }
        body.dark .search-results           { background: #1e2130 !important; border-color: #2a2d45 !important; }
        body.dark .search-result-item       { color: #c0c8e8 !important; border-color: #2a2d45 !important; }
        body.dark .search-result-item:hover { background: #252840 !important; }
        body.dark .basket-chip              { background: #252840 !important; border-color: #3a3f5c !important; color: #c0c8e8 !important; }
        body.dark .basket-chip:hover        { background: #3a4a7a !important; border-color: #6a7cc7 !important; color: #fff !important; }
        body.dark .btn-tool                 { background: #1e2130 !important; }
        body.dark .btn-tool-export          { border-color: #4a7cc7 !important; color: #7ab4f7 !important; }
        body.dark .btn-tool-export:hover    { background: #4a7cc7 !important; color: #fff !important; }
        body.dark .btn-tool-import          { border-color: #388e3c !important; color: #5ab85e !important; }
        body.dark .btn-tool-import:hover    { background: #388e3c !important; color: #fff !important; }
        body.dark .btn-tool-pdf             { border-color: #cc4444 !important; color: #e07070 !important; }
        body.dark .btn-tool-pdf:hover       { background: #cc0000 !important; color: #fff !important; }
        body.dark .btn-tool-clear           { border-color: #4a4f70 !important; color: #6870a0 !important; }
        body.dark .btn-tool-clear:hover     { background: #f44336 !important; border-color: #f44336 !important; color: #fff !important; }
        body.dark .input-label              { color: #c0c8e8 !important; }
        body.dark .form-input               { background: #252840 !important; border-color: #3a3f5c !important; color: #c0c8e8 !important; }
        body.dark .bond-details-box         { background: #252840 !important; border-color: #3a3f5c !important; color: #c0c8e8 !important; }
        body.dark .add-btn                  { background: #1a3a7c !important; }
        body.dark .cal-label                { color: #8890b8 !important; }
        body.dark .cal-amount               { color: #c0c8e8 !important; }
        body.dark .maturity-row-item        { border-color: #2a2d45 !important; background: #1e2130 !important; }
        body.dark .mat-date                 { color: #8890b8 !important; }
        body.dark .mat-info strong          { color: #c0c8e8 !important; }
        body.dark .portfolio-table-toolbar h3 { color: #e0e4ff !important; }
        body.dark .page-footer              { color: #4a4f70 !important; border-color: #2a2d45 !important; }
        body.dark .page-footer a            { color: #4a7cc7 !important; }
        body.dark .analyzer-header__back         { color: #4a7cc7 !important; border-color: #2a3a5c !important; background: #1e2130 !important; }
        body.dark .analyzer-header__back:hover    { background: #4a7cc7 !important; color: #fff !important; border-color: #4a7cc7 !important; }
        body.dark .analyzer-header__title   { color: #e0e4ff !important; }
        body.dark .analyzer-header__title svg { stroke: #7ab4f7 !important; }
        body.dark .analyzer-header          { border-color: #2a2d45 !important; background: #1a1d2e !important; }

        /* ── Basket labels (white bg) ── */
        body.dark .basket-labels            { background: #151c30 !important; border-color: #2a3a5c !important; }
        body.dark .basket-labels__title     { color: #6a8acc !important; }
        body.dark .basket-chip              { background: #1e2540 !important; border-color: #3a5a9a !important; color: #c0d0f0 !important; }
        body.dark .basket-chip:hover        { background: #3a4a7a !important; border-color: #6a7cc7 !important; color: #fff !important; }

        /* ── Add bond form (light grey bg) ── */
        body.dark .add-bond-form            { background: #151b2e !important; border-left-color: #3a6aaf !important; }
        body.dark .add-bond-form h4         { color: #c0c8e8 !important; }
        body.dark .bond-details-box         { background: #1e2338 !important; border: 1px solid #2a3a5c !important; color: #c0c8e8 !important; }
        body.dark .bond-details-box strong  { color: #e0e8ff !important; }
        body.dark .input-label              { color: #8890b8 !important; }
        body.dark .form-input               { background: #1e2338 !important; border-color: #3a3f60 !important; color: #c8d0f0 !important; }
        body.dark .add-btn, body.dark .btn-add { background: #1a4a9c !important; }
        body.dark .btn-close-form           { color: #c0c8e8 !important; border-color: #5a6080 !important; background: #2a2d45 !important; }
        body.dark .btn-close-form:hover     { background: #7a1a1a !important; border-color: #cc3333 !important; color: #ffaaaa !important; }

        /* ── Portfolio table TD cells ── */
        body.dark .portfolio-table td       { background: #13151f !important; color: #c8d0e8 !important; border-color: #2a2d45 !important; }
        body.dark .portfolio-table tr:nth-child(even) td { background: #181b2c !important; }
        body.dark .portfolio-table tr:hover td           { background: #1e2440 !important; }
        body.dark .portfolio-table td input { background: #1e2338 !important; border-color: #3a3f60 !important; color: #c8d0f0 !important; }
        /* Profit cell green/red keep color but on dark bg */
        body.dark .portfolio-table td[style*="background: #e8f5e9"] { background: #0f2a0f !important; }
        body.dark .portfolio-table td[style*="background: #ffebee"] { background: #2a0f0f !important; }

        /* ── Currency breakdown cards ── */
        body.dark .currency-breakdown       { }
        body.dark .currency-card            { background: #1e2338 !important; border: 1px solid #2a3a5c !important; color: #c0c8e8 !important; }
        body.dark .currency-card .currency-name  { color: #e0e8ff !important; font-weight: 700; }
        body.dark .currency-card .currency-pct   { color: #5ab85e !important; }
        body.dark .currency-card .currency-amt   { color: #8890b8 !important; }

        /* ── Warning/disclaimer text ── */
        body.dark .portfolio-disclaimer     { color: #5a6070 !important; }
        body.dark .warning-note             { color: #5a6070 !important; }

        /* ── Section headers (1️⃣ 2️⃣ 3️⃣) ── */
        body.dark .section-title, body.dark h3 { color: #c0c8e8 !important; }

        /* ── Toolbar ── */
        body.dark .portfolio-table-toolbar  { background: transparent !important; }
        body.dark .portfolio-table-toolbar h3 { color: #e0e4ff !important; }
    </style>
    <script>
        // Apply theme to <html> immediately (body doesn't exist yet in <head>)
        if (localStorage.getItem("bondTheme") === "dark") {
            document.documentElement.classList.add("dark");
        }
    </script>
</head>

<body>
<script>
    // Sync body.dark from html.dark (set in <head> before body existed)
    if (document.documentElement.classList.contains("dark")) {
        document.body.classList.add("dark");
    }
</script>

<!-- Analyzer page header -->
<div class="analyzer-header">
    <a href="/" class="analyzer-header__back">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
        </svg>
        Back to BondFX
    </a>
    <h1 class="analyzer-header__title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a3a5c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="20" x2="18" y2="10"/>
            <line x1="12" y1="20" x2="12" y2="4"/>
            <line x1="6" y1="20" x2="6" y2="14"/>
        </svg>
        Portfolio Analyzer
    </h1>
</div>

<!-- Bond data injected for API simulation (same as homepage) -->
<span id="generatedAtMs" style="display:none">${generatedAtMs?c}</span>

<!-- Basket labels + full analyzer content (reuse the same template) -->
<#include "portfolio-analyzer.ftl">

<!-- JavaScript -->
<script>
    // Inject bond data for the analyzer's search/API calls
    // The analyzer uses /api/bonds endpoint — no inline data needed
</script>
<script src="/js/portfolio-analyzer.js"></script>
<script src="/js/bond-report-mobile-adapter.js"></script>
<script src="https://unpkg.com/twemoji@latest/dist/twemoji.min.js" crossorigin="anonymous"></script>
<!-- basket labels auto-loaded by portfolio-analyzer.js on /analyzer -->

<footer class="page-footer">
    BondFX v4.0 &nbsp;·&nbsp; &nbsp;
    <a href="/">← Back to bond table</a>
</footer>

</body>
</html>
