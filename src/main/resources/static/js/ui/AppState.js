'use strict';
/**
 * AppState — the single mutable state object shared across all UI modules.
 *
 * Centralises what was previously a scatter of module-level `let` variables
 * in the monolithic capital-growth.js.  Every UI module imports this object
 * and reads/writes it directly — no getters/setters to keep it lightweight.
 */

export const state = {
    // ── Simulation outputs ────────────────────────────────────────────────
    lastSimResult:    null,   // result of simulateAll()
    lastStartCapital: 0,
    lastPortfolio:    [],

    // ── Scenario model ────────────────────────────────────────────────────
    scenarios:         [],    // array of scenario objects
    activeScenarioId:  null,  // id of scenario currently being edited
    scenariosDirty:    false, // true if modified since last export

    // ── No-reinvest benchmark ─────────────────────────────────────────────
    nrBenchmark: {
        label:      'default - no reinv',
        color:      '#9e9e9e',
        enabled:    false,
        data:       null,
        yearEvents: null,
        years:      null,
        scale:      1,
    },

    // ── Chart instances (Chart.js) ────────────────────────────────────────
    chart:        null,   // growth chart
    chartBond:    null,   // bond year chart
    chartCoupon:  null,   // coupon chart

    // ── Chart display state ───────────────────────────────────────────────
    hiddenScenarioIds:      new Set(),
    expandedScenarios:      new Set(),   // expanded rows in year-detail modal
    bondChartMode:          'stacked',
    couponChartMode:        'stacked',
    currentView:            'year',

    // ── Bond / coupon selection (checkboxes) ──────────────────────────────
    selectedIsins:       new Set(),
    selectedCouponIsins: new Set(),

    // ── Benchmark cache ───────────────────────────────────────────────────
    benchmarkCache: {},

    // ── Simulation debounce timer ─────────────────────────────────────────
    simTimer: null,

    // ── Initialised flag (used by growth chart legend) ────────────────────
    cgInitialized: false,
};
