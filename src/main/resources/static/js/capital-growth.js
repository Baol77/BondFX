'use strict';

/* =====================================================================
   BondFX — Capital Growth Simulator  (v5.0.1)

   Fix log:
   - simBase now uses pricePerUnit (market price) not facePerUnit → scale correct
   - portfolioVal() tracks face value consistently (redeemable amount)
   - same_bond: guard pricePerUnit > 0, mutate slot directly (no ratio drift)
   - NaN CAGR: fixed by correct scale → isFinite finalVal
   - Benchmark: /api/benchmark proxy (CORS solved server-side)
   - Yahoo {source,parsedValue} objects handled in close array
   - Bond chart: high-contrast colors in dark + light
===================================================================== */

// ── Currency helpers ──────────────────────────────────────────────────────────
const _CG_SYM  = { EUR: '€', CHF: '₣', USD: '$', GBP: '£' };
let   _cgRates = { EUR: 1.0, CHF: 0.93, USD: 1.08, GBP: 0.86 };

function _cgBaseCcy()         { return localStorage.getItem('bondBaseCurrency') || 'EUR'; }
function _cgSym()             { return _CG_SYM[_cgBaseCcy()] || '€'; }
function _cgToBase(eurVal)    { return eurVal * (_cgRates[_cgBaseCcy()] || 1); }
function _cgFromBase(baseVal) { return baseVal / (_cgRates[_cgBaseCcy()] || 1); }

async function _cgLoadFxRates() {
    try {
        const res = await fetch('/api/fx-rates');
        if (res.ok) Object.assign(_cgRates, await res.json());
    } catch(e) { /* use fallback defaults */ }
}

// ── Portfolio loader ──────────────────────────────────────────────────────────
function loadPortfolio() {
    try {
        const raw = localStorage.getItem('bondPortfolio');
        return raw ? JSON.parse(raw).filter(b => b.includeInStatistics !== false) : [];
    } catch(e) { return []; }
}

/* ── Simulation engine ───────────────────────────────────────────────────────
   Each slot:
     unitsHeld     — quantity held
     facePerUnit   — nominal EUR (what gets redeemed, base for coupons)
     couponPerUnit — annual net coupon EUR/unit
     pricePerUnit  — market price EUR/unit (used for reinvestment cost)
     matYear       — maturity year

   portfolioVal() = Σ(units × facePerUnit) + cash
     (face value, since that's what matures and what coupons are calculated on)

   Scale = startCapital / Σ(units × pricePerUnit)
     Maps simulated face-value baseline to actual cost basis.
     This ensures dataPoints[0] == startCapital after scaling.
──────────────────────────────────────────────────────────────────────────── */

function buildSlots(portfolio) {
    return portfolio.map(b => {
        const fxRate = (b.currency !== 'EUR' && b.price > 0) ? b.priceEur / b.price : 1;
        const nomEur = (b.nominal || 100) * fxRate;
        const pxEur  = (b.priceEur > 0) ? b.priceEur : nomEur;
        return {
            matYear:       new Date(b.maturity).getFullYear(),
            unitsHeld:     b.quantity,
            facePerUnit:   nomEur,
            couponPerUnit: (b.coupon / 100) * nomEur * (1 - (b.taxRate || 0) / 100),
            pricePerUnit:  pxEur,
        };
    });
}

function runScenario(slots, years, mode, priceShiftPct, reinvestYieldPct) {
    let pool = slots.map(s => ({ ...s }));   // deep-clone slots
    let cash = 0;
    const adjFactor     = 1 + priceShiftPct / 100;
    const reinvestYield = reinvestYieldPct / 100;
    const endYear       = years[years.length - 1];

    const portfolioVal = () =>
        pool.reduce((s, sl) => s + sl.unitsHeld * sl.facePerUnit, 0) + cash;

    const dataPoints = [portfolioVal()];

    for (let i = 1; i < years.length; i++) {
        const yr = years[i];
        let yearCoupons = 0, yearRedemptions = 0;
        const alive = [];

        for (const sl of pool) {
            if (sl.matYear < yr) continue;
            yearCoupons += sl.unitsHeld * sl.couponPerUnit;
            if (sl.matYear === yr) {
                yearRedemptions += sl.unitsHeld * sl.facePerUnit;
            } else {
                alive.push(sl);
            }
        }
        pool = alive;

        const cashIn = yearCoupons + yearRedemptions;
        if (cashIn <= 0) { dataPoints.push(portfolioVal()); continue; }

        if (mode === 'none') {
            cash += cashIn;

        } else if (mode === 'same_bond') {
            const totalFace = pool.reduce((s, sl) => s + sl.unitsHeld * sl.facePerUnit, 0);
            if (totalFace > 0) {
                for (const sl of pool) {
                    const share = (sl.unitsHeld * sl.facePerUnit) / totalFace;
                    const cost  = sl.pricePerUnit * adjFactor;
                    if (cost > 0) sl.unitsHeld += (cashIn * share) / cost;
                }
            } else {
                cash += cashIn;
            }

        } else { // market_avg
            if (endYear - yr > 0) {
                const costPerUnit = Math.max(0.01, adjFactor);
                pool.push({
                    matYear:       endYear,
                    unitsHeld:     cashIn / costPerUnit,
                    facePerUnit:   1.0,
                    couponPerUnit: reinvestYield,
                    pricePerUnit:  costPerUnit,
                });
            } else {
                cash += cashIn;
            }
        }

        dataPoints.push(portfolioVal());
    }
    return dataPoints;
}

function simulate(portfolio, startCapital) {
    if (!portfolio.length) return { years: [], scenarios: [] };

    const today     = new Date();
    const startYear = today.getFullYear();
    const endYear   = Math.max(startYear + 1, ...portfolio.map(b => new Date(b.maturity).getFullYear()));
    const years     = [];
    for (let y = startYear; y <= endYear; y++) years.push(y);

    const slots = buildSlots(portfolio);

    // Scale: user's actual cost basis / simulated price basis
    const simBase = slots.reduce((s, sl) => s + sl.unitsHeld * sl.pricePerUnit, 0);
    const scale   = (simBase > 0 && startCapital > 0) ? startCapital / simBase : 1;
    const sc      = data => data.map(v => isFinite(v) ? v * scale : 0);

    const totalPV = simBase;
    const wSAY = totalPV > 0
        ? portfolio.reduce((s, b) => s + computeSAYNet(b) * (b.priceEur || 0) * b.quantity, 0) / totalPV
        : 3.0;

    const scenarios = [
        { id: 'no_reinvest',     color: '#9e9e9e',
          label: 'No reinvestment (cash)',
          data: sc(runScenario(slots, years, 'none',       0,          wSAY)) },
        { id: 'reinvest_flat',   color: '#1e88e5',
          label: `Reinvest — same bond, current price (${wSAY.toFixed(1)}% SAY)`,
          data: sc(runScenario(slots, years, 'same_bond',  0,          wSAY)) },
        { id: 'reinvest_up10',   color: '#e53935',
          label: `Reinvest — market +10% (SAY ↓${(wSAY * 0.85).toFixed(1)}%)`,
          data: sc(runScenario(slots, years, 'market_avg', +10,        wSAY * 0.85)) },
        { id: 'reinvest_down10', color: '#43a047',
          label: `Reinvest — market -10% (SAY ↑${(wSAY * 1.15).toFixed(1)}%)`,
          data: sc(runScenario(slots, years, 'market_avg', -10,        wSAY * 1.15)) },
    ];

    return { years, scenarios, weightedSAY: wSAY, scale };
}

// ── SAY net ───────────────────────────────────────────────────────────────────
function computeSAYNet(bond) {
    const fxRate    = (bond.currency !== 'EUR' && bond.price > 0) ? bond.priceEur / bond.price : 1;
    const nomEur    = (bond.nominal || 100) * fxRate;
    const couponNet = (bond.coupon / 100) * nomEur * (1 - (bond.taxRate || 0) / 100);
    const today     = new Date(), mat = new Date(bond.maturity);
    const yrs       = Math.max(0.01, (mat - today) / (365.25 * 24 * 3600 * 1000));
    const capGain   = nomEur - (bond.priceEur || nomEur);
    return (bond.priceEur > 0)
        ? ((couponNet + capGain / yrs) / bond.priceEur) * 100 : 0;
}

// ── Per-bond contribution ─────────────────────────────────────────────────────
function buildBondContribution(portfolio) {
    return portfolio.map(b => {
        const fxRate  = (b.currency !== 'EUR' && b.price > 0) ? b.priceEur / b.price : 1;
        const nomEur  = (b.nominal || 100) * fxRate;
        const costEur = b.totalEur || ((b.priceEur || nomEur) * b.quantity);
        const faceEur = nomEur * b.quantity;
        const today   = new Date(), mat = new Date(b.maturity);
        const yrs     = Math.max(0.01, (mat - today) / (365.25 * 24 * 3600 * 1000));
        const annNet  = (b.coupon / 100) * nomEur * b.quantity * (1 - (b.taxRate || 0) / 100);
        return {
            label:        `${b.issuer} (${(b.maturity || '').slice(0, 4)})`,
            costEur,
            faceEur,
            totalCoupons: annNet * yrs,
            capGain:      Math.max(0, faceEur - costEur),
            sayNet:       computeSAYNet(b),
        };
    });
}

// ── Summary stats ─────────────────────────────────────────────────────────────
function renderSummaryStats(portfolio, simResult, startCapital) {
    const el = document.getElementById('summaryStats');
    if (!el) return;
    const sym      = _cgSym();
    const horizon  = simResult.years.length - 1;
    const flatData = simResult.scenarios.find(s => s.id === 'reinvest_flat')?.data || [];
    const finalVal = (flatData.length && isFinite(flatData[flatData.length - 1]))
                   ? flatData[flatData.length - 1] : startCapital;

    const totalCoupons = portfolio.reduce((s, b) => {
        const fxRate = (b.currency !== 'EUR' && b.price > 0) ? b.priceEur / b.price : 1;
        const nomEur = (b.nominal || 100) * fxRate;
        const yrs    = Math.max(0, (new Date(b.maturity) - new Date()) / (365.25 * 24 * 3600 * 1000));
        return s + (b.coupon / 100) * nomEur * b.quantity * (1 - (b.taxRate || 0) / 100) * yrs;
    }, 0);

    const totalFace = portfolio.reduce((s, b) => {
        const fxRate = (b.currency !== 'EUR' && b.price > 0) ? b.priceEur / b.price : 1;
        return s + (b.nominal || 100) * fxRate * b.quantity;
    }, 0);

    const cagr = (horizon > 0 && startCapital > 0 && isFinite(finalVal) && finalVal > 0)
        ? (Math.pow(finalVal / startCapital, 1 / horizon) - 1) * 100 : 0;

    const fmt  = v => sym + _cgToBase(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
    const card = (lbl, val, sub = '') =>
        `<div class="cg-stat-card">
            <div class="cg-stat-label">${lbl}</div>
            <div class="cg-stat-value">${val}</div>
            ${sub ? `<div class="cg-stat-sub">${sub}</div>` : ''}
         </div>`;

    el.innerHTML =
        card('Initial Capital',   fmt(startCapital)) +
        card('Final Value',       fmt(finalVal),         'with reinvestment') +
        card('Total Net Coupons', fmt(totalCoupons),     'over full horizon') +
        card('Capital Returned',  fmt(totalFace),        'face value × qty') +
        card('Horizon',           `${horizon} yrs`) +
        card('CAGR (reinvest)',   `${cagr.toFixed(2)}%`, 'compound annual');
}

// ── Growth chart ──────────────────────────────────────────────────────────────
let _chart = null, _chartBond = null;

function renderGrowthChart(simResult, startCapital) {
    const canvas = document.getElementById('growthChart');
    if (!canvas) return;
    if (_chart) _chart.destroy();

    const isDark     = document.body.classList.contains('dark');
    const gridColor  = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
    const labelColor = isDark ? '#8890b8' : '#666';
    const sym        = _cgSym();
    const base0      = _cgToBase(startCapital);

    const datasets = simResult.scenarios.map(s => ({
        label:           s.label,
        data:            s.data.map(v => _cgToBase(v)),
        borderColor:     s.color,
        backgroundColor: s.color + '18',
        borderWidth:     s.id === 'no_reinvest' ? 1.5 : 2.2,
        borderDash:      s.id === 'no_reinvest' ? [5, 4] : [],
        pointRadius:     simResult.years.length > 15 ? 0 : 3,
        tension:         0.3,
        fill:            false,
    }));

    _chart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels: simResult.years, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: labelColor, font: { size: 11 }, padding: 14, boxWidth: 26, usePointStyle: true },
                },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const v = ctx.parsed.y;
                            if (v == null || !isFinite(v)) return null;
                            const gain = v - base0;
                            const sign = gain >= 0 ? '+' : '';
                            const fmt  = n => Math.round(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
                            return ` ${ctx.dataset.label}: ${sym}${fmt(v)} (${sign}${sym}${fmt(gain)})`;
                        },
                    },
                },
            },
            scales: {
                x: { ticks: { color: labelColor, font: { size: 11 } }, grid: { color: gridColor } },
                y: {
                    ticks: {
                        color: labelColor,
                        font:  { size: 11 },
                        callback: v => isFinite(v)
                            ? sym + Math.round(v).toLocaleString(undefined, { maximumFractionDigits: 0 })
                            : '',
                    },
                    grid: { color: gridColor },
                },
            },
        },
    });
}

// ── Bond chart ────────────────────────────────────────────────────────────────
function renderBondChart(contributions) {
    const canvas = document.getElementById('bondChart');
    if (!canvas) return;
    if (_chartBond) _chartBond.destroy();

    const isDark     = document.body.classList.contains('dark');
    const labelColor = isDark ? '#c0c8e8' : '#444';
    const gridColor  = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
    const sym        = _cgSym();

    // High-contrast, distinguishable in both modes
    const colCost    = isDark ? '#5b9bd5' : '#1565c0';   // strong blue
    const colCoupons = isDark ? '#70c172' : '#2e7d32';   // strong green
    const colGain    = isDark ? '#ffd740' : '#e65100';   // amber / deep orange

    _chartBond = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: contributions.map(c => c.label),
            datasets: [
                { label: 'Cost Basis',          data: contributions.map(c => _cgToBase(c.costEur)),         backgroundColor: colCost,    borderRadius: 3 },
                { label: 'Net Coupons (total)',  data: contributions.map(c => _cgToBase(c.totalCoupons)),    backgroundColor: colCoupons, borderRadius: 3 },
                { label: 'Capital Gain',         data: contributions.map(c => _cgToBase(c.capGain)),         backgroundColor: colGain,    borderRadius: 3 },
            ],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: labelColor, font: { size: 11 }, boxWidth: 20 } },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const v = ctx.parsed.y;
                            if (!isFinite(v)) return null;
                            return ` ${ctx.dataset.label}: ${sym}${Math.round(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
                        },
                    },
                },
            },
            scales: {
                x: { stacked: true, ticks: { color: labelColor, font: { size: 10 } }, grid: { color: gridColor } },
                y: { stacked: true, ticks: { color: labelColor, font: { size: 11 },
                    callback: v => isFinite(v) ? sym + Math.round(v).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '' },
                    grid: { color: gridColor } },
            },
        },
    });
}

// ── Custom scenario ───────────────────────────────────────────────────────────
let _lastSimResult = null, _lastStartCapital = 0;

function updateCustomScenario() {
    if (!_lastSimResult || !_chart) return;
    const portfolio = loadPortfolio();
    if (!portfolio.length) return;

    const sayInput   = parseFloat(document.getElementById('cgCustomSAY')?.value)  || _lastSimResult.weightedSAY;
    const priceInput = parseFloat(document.getElementById('cgCustomPrice')?.value) || 0;
    const modeInput  = document.getElementById('cgCustomMode')?.value || 'market_avg';

    const slots   = buildSlots(portfolio);
    const rawData = runScenario(slots, _lastSimResult.years, modeInput, priceInput, sayInput);
    const scaled  = rawData.map(v => _cgToBase(isFinite(v) ? v * _lastSimResult.scale : 0));
    const pSign   = priceInput > 0 ? '+' : '';
    const label   = `Custom: ${modeInput === 'same_bond' ? 'same bond' : 'market avg'} @ ${sayInput.toFixed(1)}% SAY${priceInput !== 0 ? `, price ${pSign}${priceInput}%` : ''}`;

    const newDS = {
        _custom: true, label, data: scaled,
        borderColor: '#ff6d00', backgroundColor: '#ff6d0020',
        borderWidth: 2.5, borderDash: [8, 3], pointRadius: 0, tension: 0.3, fill: false,
    };
    const idx = _chart.data.datasets.findIndex(d => d._custom);
    if (idx >= 0) _chart.data.datasets[idx] = newDS;
    else _chart.data.datasets.push(newDS);
    _chart.update();
}

// ── Benchmark proxy ───────────────────────────────────────────────────────────
const _benchmarkCache = {};

async function fetchBenchmark(symbol, horizonYears) {
    if (_benchmarkCache[symbol]) return _benchmarkCache[symbol];
    try {
        const range = `${Math.min(Math.max(horizonYears + 1, 5), 10)}y`;
        const res   = await fetch(`/api/benchmark?symbol=${encodeURIComponent(symbol)}&range=${range}`);
        if (!res.ok) return null;
        const json  = await res.json();
        const chart = json?.chart?.result?.[0];
        if (!chart) return null;

        const ts     = chart.timestamp;
        // Yahoo sometimes returns {source,parsedValue} objects instead of numbers
        const rawArr = chart.indicators?.adjclose?.[0]?.adjclose
                    || chart.indicators?.quote?.[0]?.close || [];
        const closes = rawArr.map(v => (v && typeof v === 'object') ? (v.parsedValue ?? null) : v);

        let baseline = null;
        const normed = [];
        for (let i = 0; i < ts.length; i++) {
            const c = closes[i];
            if (c == null || !isFinite(c)) continue;
            if (baseline === null) baseline = c;
            normed.push({ date: new Date(ts[i] * 1000), pct: (c / baseline - 1) * 100 });
        }
        _benchmarkCache[symbol] = normed;
        return normed;
    } catch(e) {
        console.warn('Benchmark fetch failed:', symbol, e.message);
        return null;
    }
}

async function toggleBenchmark(id, symbol, label, color, checked) {
    const errEl = document.getElementById(`bench-err-${id}`);
    if (!checked) {
        if (_chart) { _chart.data.datasets = _chart.data.datasets.filter(d => d._benchmarkId !== id); _chart.update(); }
        if (errEl) errEl.textContent = '';
        return;
    }
    if (errEl) errEl.textContent = '⏳';
    const raw = await fetchBenchmark(symbol, _lastSimResult?.years?.length || 10);
    if (!raw || !raw.length) { if (errEl) errEl.textContent = '(no data)'; return; }
    if (errEl) errEl.textContent = '';
    if (!_chart || !_lastStartCapital) return;

    const base0    = _cgToBase(_lastStartCapital);
    const simYears = _chart.data.labels;
    const yearlyPct = simYears.map(yr => {
        const pts = raw.filter(d => d.date.getFullYear() <= yr);
        return pts.length ? pts[pts.length - 1].pct : null;
    });

    _chart.data.datasets = _chart.data.datasets.filter(d => d._benchmarkId !== id);
    _chart.data.datasets.push({
        _benchmarkId: id, label: `${label} (benchmark)`,
        data: yearlyPct.map(p => p !== null ? base0 * (1 + p / 100) : null),
        borderColor: color, backgroundColor: color + '14',
        borderWidth: 1.5, borderDash: [4, 3], pointRadius: 0, tension: 0.3, fill: false, spanGaps: true,
    });
    _chart.update();
}

// ── View toggle ───────────────────────────────────────────────────────────────
function switchView(view) {
    document.getElementById('btnViewYear').classList.toggle('cg-view-btn--active', view === 'year');
    document.getElementById('btnViewBond').classList.toggle('cg-view-btn--active', view === 'bond');
    document.getElementById('growthChartWrap').style.display = view === 'year' ? 'block' : 'none';
    document.getElementById('bondChartWrap').style.display   = view === 'bond' ? 'block' : 'none';
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function runSimulation() {
    const portfolio = loadPortfolio();
    if (!portfolio.length) {
        document.getElementById('cgEmptyMsg').style.display = 'block';
        document.getElementById('cgMain').style.display     = 'none';
        return;
    }
    document.getElementById('cgEmptyMsg').style.display = 'none';
    document.getElementById('cgMain').style.display     = 'block';

    const costEur = portfolio.reduce((s, b) => s + (b.totalEur || (b.priceEur || 0) * b.quantity), 0);
    const input   = document.getElementById('cgCapital');
    if (input && !input._userEdited) input.value = Math.round(_cgToBase(costEur));

    const baseVal      = parseFloat(input?.value);
    const startCapital = (baseVal > 0) ? _cgFromBase(baseVal) : costEur;

    document.querySelectorAll('.cg-ccy-sym').forEach(el => el.textContent = _cgSym());

    const simResult    = simulate(portfolio, startCapital);
    _lastSimResult     = simResult;
    _lastStartCapital  = startCapital;

    renderSummaryStats(portfolio, simResult, startCapital);
    renderGrowthChart(simResult, startCapital);
    renderBondChart(buildBondContribution(portfolio));
}

document.addEventListener('DOMContentLoaded', async () => {
    await _cgLoadFxRates();
    const input = document.getElementById('cgCapital');
    if (input) input.addEventListener('input', () => { input._userEdited = true; runSimulation(); });
    ['cgCustomSAY', 'cgCustomPrice', 'cgCustomMode'].forEach(id =>
        document.getElementById(id)?.addEventListener('change', updateCustomScenario));
    document.getElementById('btnViewYear')?.addEventListener('click', () => switchView('year'));
    document.getElementById('btnViewBond')?.addEventListener('click', () => switchView('bond'));
    await runSimulation();
    switchView('year');
});
