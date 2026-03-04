'use strict';
/**
 * CapitalGrowthController — entry point for the browser page.
 *
 * Wires all modules together, exposes global functions for inline HTML
 * event handlers (onclick="…"), and drives the main simulation loop.
 */

import { state }                   from './AppState.js';
import { cgSym, cgToBase, cgFromBase, cgBaseCcy } from './CurrencyHelper.js';
import { loadPortfolio }           from '../infrastructure/PortfolioRepository.js';
import { loadFxRates, prepareSimulation } from '../infrastructure/BondFXClient.js';
import { simulateAll }             from '../core/SimulationEngine.js';
import { renderSummaryStats }      from './SummaryStats.js';
import {
    renderGrowthChart, renderBondYearChart, buildBondSelector,
    buildCouponSelector, renderCouponChart, renderNrBenchmarkPanel, toggleNrBenchmark,
} from './ChartRenderer.js';
import { openYearDetailModal }     from './YearDetailModal.js';
import {
    buildPerIsinPanel, switchScenarioSubTab,
    addScenario, deleteScenario, selectScenario, renameScenario, pickScenarioColor,
    startTabRename, startNrBenchRename,
    setCouponEnabled, updateCouponGlobal, toggleCouponOverride, updateCouponOverride,
    enableReplacement, disableReplacement, updateReplacement,
    setInjectionEnabled, updateInjectionAmount, updateInjectionRange,
    updateInjectionPct, updateInjectionFixed, redistributeInjectionPct,
    exportScenarios, importScenarios, toggleBenchmark,
} from './ScenarioPanel.js';

// ── Debounced simulation trigger ──────────────────────────────────────────────

export function triggerSimulation() {
    clearTimeout(state.simTimer);
    state.simTimer = setTimeout(runSimulation, 220);
}

// ── Main simulation run ───────────────────────────────────────────────────────

export async function runSimulation() {
    const portfolio = loadPortfolio();

    if (!portfolio.length) {
        document.getElementById('cgEmptyMsg').style.display = 'block';
        document.getElementById('cgMain').style.display     = 'none';
        return;
    }
    document.getElementById('cgEmptyMsg').style.display = 'none';
    document.getElementById('cgMain').style.display     = 'block';

    // Destroy old chart instances
    if (state.chart)       { state.chart.destroy();       state.chart       = null; }
    if (state.chartBond)   { state.chartBond.destroy();   state.chartBond   = null; }
    if (state.chartCoupon) { state.chartCoupon.destroy(); state.chartCoupon = null; }
    Object.keys(state.benchmarkCache).forEach(k => delete state.benchmarkCache[k]);

    const reportCcy    = localStorage.getItem('bondReportCurrency') || 'EUR';

    // Fetch compute results + FX curves in parallel
    await prepareSimulation(portfolio, reportCcy);

    const costEur      = portfolio.reduce((s, b) => s + (b.totalEur || (b.priceEur || 0) * b.quantity), 0);
    const startCapital = costEur;
    state.lastStartCapital = startCapital;
    state.lastPortfolio    = portfolio;

    document.querySelectorAll('.cg-ccy-sym').forEach(el => el.textContent = cgSym());

    const simResult    = simulateAll(portfolio, startCapital, state.scenarios, state.nrBenchmark, reportCcy);
    state.lastSimResult = simResult;

    // Expose to inline modal callbacks (inline onchange still needs these globals)
    window._cgState           = state;
    window._cgLastSimResult   = simResult;
    window._cgLastStartCapital = startCapital;

    renderSummaryStats(portfolio, simResult, startCapital);
    renderGrowthChart(simResult, startCapital);
    buildPerIsinPanel(portfolio, simResult);
    renderNrBenchmarkPanel();
    buildCouponSelector(portfolio);
    renderCouponChart(portfolio, simResult);

    if (state.nrBenchmark.enabled) toggleNrBenchmark(true);

    // Re-apply active ETF benchmark overlays
    document.querySelectorAll('input[id^="bench-chk-"]').forEach(chk => {
        if (chk.checked) chk.dispatchEvent(new Event('change'));
    });
}

// ── View toggles ──────────────────────────────────────────────────────────────

function switchView(view) {
    state.currentView = view;
    ['year', 'bond'].forEach(v => {
        document.getElementById(`btnView_${v}`)?.classList.toggle('cg-view-btn--active', v === view);
        const wrap = document.getElementById(`wrap_${v}`);
        if (wrap) wrap.style.display = v === view ? 'block' : 'none';
    });
}

function setBondChartMode(mode) {
    state.bondChartMode = mode;
    document.getElementById('btnBondStacked')?.classList.toggle('cg-view-btn--active', mode === 'stacked');
    document.getElementById('btnBondLine')?.classList.toggle('cg-view-btn--active', mode === 'line');
    if (state.lastSimResult) renderBondYearChart(state.lastPortfolio, state.lastSimResult.years, state.selectedIsins);
}

function setCouponChartMode(mode) {
    state.couponChartMode = mode;
    document.getElementById('btnCouponStacked')?.classList.toggle('cg-view-btn--active', mode === 'stacked');
    document.getElementById('btnCouponLine')?.classList.toggle('cg-view-btn--active', mode === 'line');
    if (state.lastSimResult) renderCouponChart(state.lastPortfolio, state.lastSimResult);
}

function toggleBondSel(isin, checked) {
    if (checked) state.selectedIsins.add(isin); else state.selectedIsins.delete(isin);
    if (state.lastSimResult) renderBondYearChart(state.lastPortfolio, state.lastSimResult.years, state.selectedIsins);
}

function toggleCouponSel(isin, checked) {
    if (checked) state.selectedCouponIsins.add(isin); else state.selectedCouponIsins.delete(isin);
    if (state.lastSimResult) renderCouponChart(state.lastPortfolio, state.lastSimResult);
}

// ── Mobile label swap ─────────────────────────────────────────────────────────

function _cgMobileLabels() {
    document.querySelectorAll('.cg-header__back').forEach(btn => {
        if (!btn.dataset.full) btn.dataset.full = btn.lastChild.textContent.trim();
        btn.lastChild.textContent = ' ' + (window.innerWidth <= 768 ? (btn.dataset.short || btn.dataset.full) : btn.dataset.full);
    });
}

// ── Unsaved scenarios guard ───────────────────────────────────────────────────

function _hasUnsavedConfig() {
    if (!state.scenariosDirty) return false;
    return state.scenarios.some(sc =>
        sc.couponReinvest.enabled || sc.maturityReplacement.size > 0 || sc.injection.enabled
    );
}

// ── Expose all public functions to window (for inline HTML event handlers) ────

Object.assign(window, {
    // simulation
    triggerSimulation,
    // scenario panel
    addScenario, deleteScenario, selectScenario, renameScenario, pickScenarioColor,
    startTabRename, startNrBenchRename,
    exportScenarios, importScenarios,
    toggleBenchmark,
    toggleNrBenchmark,
    // sub-tab
    switchScenarioSubTab,
    // coupon tab
    setCouponEnabled, updateCouponGlobal, toggleCouponOverride, updateCouponOverride,
    // replacement tab
    enableReplacement, disableReplacement, updateReplacement,
    // injection tab
    setInjectionEnabled, updateInjectionAmount, updateInjectionRange,
    updateInjectionPct, updateInjectionFixed, redistributeInjectionPct,
    // view toggles
    switchView, setBondChartMode, setCouponChartMode,
    toggleBondSel, toggleCouponSel,
    // modal
    openYearDetailModal,
    // currency helpers (used by injection tab inline inputs)
    cgToBase, cgFromBase,
});

// ── DOMContentLoaded ──────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    await loadFxRates();

    document.getElementById('btnBondStacked')?.addEventListener('click',   () => setBondChartMode('stacked'));
    document.getElementById('btnBondLine')?.addEventListener('click',      () => setBondChartMode('line'));
    document.getElementById('btnCouponStacked')?.addEventListener('click', () => setCouponChartMode('stacked'));
    document.getElementById('btnCouponLine')?.addEventListener('click',    () => setCouponChartMode('line'));

    _cgMobileLabels();
    window.addEventListener('resize', _cgMobileLabels);

    await runSimulation();
    switchView('year');

    window.addEventListener('beforeunload', e => {
        if (!_hasUnsavedConfig()) return;
        e.preventDefault();
        e.returnValue = 'You have unexported scenarios. Are you sure you want to leave this page?';
    });

    document.querySelectorAll('a[href="/analyzer"], a[href*="analyzer"]').forEach(link => {
        link.addEventListener('click', e => {
            if (!_hasUnsavedConfig()) return;
            const ok = confirm('You have unexported scenarios. Returning to the Analyzer will discard your changes. Do you want to proceed?');
            if (!ok) e.preventDefault();
        });
    });
});
