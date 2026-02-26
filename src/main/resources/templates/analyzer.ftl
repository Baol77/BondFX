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
    <link rel="stylesheet" href="/css/porfolio-analyzer-mobile.css">
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
    <a href="/" class="analyzer-header__back" data-short="Home">
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
    <a href="/capital-growth" class="analyzer-header__cg-btn" data-short="Growth" title="Capital Growth Simulator">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
            <polyline points="16 7 22 7 22 13"/>
        </svg>
        Capital Growth
    </a>
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
    BondFX v4.1 &nbsp;·&nbsp; &nbsp;
    <a href="/">← Back to bond table</a>
</footer>

</body>
</html>
