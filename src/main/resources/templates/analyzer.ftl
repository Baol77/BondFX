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
        body.dark .btn-tool                 { background: #1e2130 !important; }
        body.dark .btn-tool-export          { border-color: #4a7cc7 !important; color: #7ab4f7 !important; }
        body.dark .btn-tool-import          { border-color: #388e3c !important; color: #5ab85e !important; }
        body.dark .btn-tool-pdf             { border-color: #cc4444 !important; color: #e07070 !important; }
        body.dark .btn-tool-clear           { border-color: #4a4f70 !important; color: #6870a0 !important; }
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
        body.dark .analyzer-header__back    { color: #4a7cc7 !important; border-color: #2a3a5c !important; background: #1e2130 !important; }
        body.dark .analyzer-header__title   { color: #e0e4ff !important; }
        body.dark .analyzer-header__title svg { stroke: #7ab4f7 !important; }
        body.dark .analyzer-header         { border-color: #2a2d45 !important; background: #1a1d2e !important; }
    </style>
    <script>if(localStorage.getItem("bondTheme")==="dark")document.body.classList.add("dark");</script>
</head>

<body>

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
    BondFX v3 &nbsp;·&nbsp; &nbsp;
    <a href="/">← Back to bond table</a>
</footer>

</body>
</html>
