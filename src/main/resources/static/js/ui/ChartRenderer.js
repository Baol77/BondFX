'use strict';
/**
 * ChartRenderer — all Chart.js rendering: growth, coupon, bond-year charts.
 */

import { state }                   from './AppState.js';
import { cgSym, cgToBase }         from './CurrencyHelper.js';
import { buildBondTimeline }       from '../core/SimulationEngine.js';
import { getAllMatReplacementCs }   from '../core/ScenarioModel.js';
import { openYearDetailModal }      from './YearDetailModal.js';

const BOND_COLORS_DARK  = ['#5b9bd5','#70c172','#ffd740','#ff7043','#ba68c8','#4dd0e1','#fff176','#a5d6a7','#ef9a9a','#90caf9'];
const BOND_COLORS_LIGHT = ['#1565c0','#2e7d32','#e65100','#6a1b9a','#00838f','#f9a825','#558b2f','#ad1457','#4527a0','#37474f'];

// ── Growth chart ──────────────────────────────────────────────────────────────

export function renderGrowthChart(simResult, startCapital) {
    const canvas = document.getElementById('growthChart');
    if (!canvas) return;
    if (state.chart) { state.chart.destroy(); state.chart = null; }

    const isDark     = document.body.classList.contains('dark');
    const gridColor  = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
    const labelColor = isDark ? '#8890b8' : '#666';
    const sym        = cgSym();
    const base0      = cgToBase(startCapital);

    const allLabels = [...simResult.years];
    simResult.scenarios.forEach(s => {
        if (s._extendedYears) s._extendedYears.forEach(y => { if (!allLabels.includes(y)) allLabels.push(y); });
    });
    allLabels.sort((a, b) => a - b);

    if (!state.cgInitialized) { state.cgInitialized = true; }
    else {
        const validIds = new Set(simResult.scenarios.map(s => s.id));
        state.hiddenScenarioIds.forEach(id => { if (!validIds.has(id)) state.hiddenScenarioIds.delete(id); });
    }

    const datasets = simResult.scenarios.map(s => {
        const yearList = s._extendedYears || simResult.years;
        const aligned  = allLabels.map(yr => {
            const idx = yearList.indexOf(yr);
            if (idx < 0 || idx >= s.data.length) return null;
            const v = s.data[idx];
            return (v !== null && isFinite(v)) ? cgToBase(v) : null;
        });
        return {
            label: s.label, data: aligned,
            borderColor: s.color, backgroundColor: s.color + '18',
            borderWidth: 2.2, pointRadius: allLabels.length > 15 ? 0 : 3,
            tension: 0.3, fill: false, spanGaps: false,
            hidden: state.hiddenScenarioIds.has(s.id), _scenId: s.id,
        };
    });

    state.chart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels: allLabels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            onClick: (evt, elements) => {
                if (!elements.length) return;
                const clickedYear = allLabels[elements[0].index];
                openYearDetailModal(clickedYear, allLabels.indexOf(clickedYear), simResult, startCapital, allLabels);
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: labelColor, font: { size: 11 }, padding: 14, boxWidth: 26, usePointStyle: true },
                    onClick: (evt, legendItem, legend) => {
                        const chart  = legend.chart;
                        const idx    = legendItem.datasetIndex;
                        const meta   = chart.getDatasetMeta(idx);
                        meta.hidden  = meta.hidden === null ? !chart.data.datasets[idx].hidden : !meta.hidden;
                        const scenId = chart.data.datasets[idx]._scenId || legendItem.text;
                        if (meta.hidden) state.hiddenScenarioIds.add(scenId);
                        else             state.hiddenScenarioIds.delete(scenId);
                        chart.update();
                    },
                },
                tooltip: {
                    callbacks: {
                        title: ctx => `📅 ${ctx[0].label}  · click for details`,
                        label: ctx => {
                            const v = ctx.parsed.y;
                            if (v == null || !isFinite(v)) return null;
                            const gain = v - base0;
                            const sign = gain >= 0 ? '+' : '';
                            const f    = n => Math.round(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
                            return ` ${ctx.dataset.label}: ${sym}${f(v)} (${sign}${sym}${f(gain)})`;
                        },
                    },
                },
            },
            scales: {
                x: { ticks: { color: labelColor, font: { size: 11 } }, grid: { color: gridColor } },
                y: {
                    ticks: {
                        color: labelColor, font: { size: 11 },
                        callback: v => isFinite(v) ? sym + Math.round(v).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '',
                    },
                    grid: { color: gridColor },
                },
            },
        },
    });

    // ── Zoom / Pan ────────────────────────────────────────────────────────
    const nLabels = allLabels.length;
    state.chart._cgZoom = { minIdx: 0, maxIdx: nLabels - 1 };

    const _applyZoom = () => {
        const { minIdx, maxIdx } = state.chart._cgZoom;
        state.chart.options.scales.x.min = allLabels[minIdx];
        state.chart.options.scales.x.max = allLabels[maxIdx];
        state.chart.update('none');
    };
    const _resetZoom = () => {
        state.chart._cgZoom = { minIdx: 0, maxIdx: nLabels - 1 };
        state.chart.options.scales.x.min = undefined;
        state.chart.options.scales.x.max = undefined;
        state.chart.update('none');
    };

    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        const z    = state.chart._cgZoom;
        const span = z.maxIdx - z.minIdx;
        const step = Math.max(1, Math.round(span * 0.12));
        if (e.deltaY < 0) {
            z.minIdx = Math.min(z.minIdx + step, z.maxIdx - 1);
            z.maxIdx = Math.max(z.maxIdx - step, z.minIdx + 1);
        } else {
            z.minIdx = Math.max(0, z.minIdx - step);
            z.maxIdx = Math.min(nLabels - 1, z.maxIdx + step);
        }
        _applyZoom();
    }, { passive: false });

    canvas.addEventListener('dblclick', _resetZoom);

    let _dragStart = null;
    canvas.addEventListener('mousedown', e => {
        _dragStart = { x: e.clientX, minIdx: state.chart._cgZoom.minIdx, maxIdx: state.chart._cgZoom.maxIdx };
        canvas.style.cursor = 'grabbing';
    });
    canvas.addEventListener('mousemove', e => {
        if (!_dragStart) return;
        const z    = state.chart._cgZoom;
        const span = _dragStart.maxIdx - _dragStart.minIdx;
        const pxPerLabel = canvas.width / Math.max(1, nLabels - 1);
        const dx   = -Math.round((e.clientX - _dragStart.x) / pxPerLabel);
        const newMin = Math.max(0, Math.min(_dragStart.minIdx + dx, nLabels - 1 - span));
        z.minIdx = newMin;
        z.maxIdx = newMin + span;
        _applyZoom();
    });
    const _stopDrag = () => { _dragStart = null; canvas.style.cursor = 'pointer'; };
    canvas.addEventListener('mouseup',    _stopDrag);
    canvas.addEventListener('mouseleave', _stopDrag);

    // Hint
    const titleEl = canvas.closest('.cg-chart-section')?.querySelector('.cg-chart-title');
    if (titleEl && !titleEl.querySelector('.cg-zoom-hint')) {
        titleEl.insertAdjacentHTML('beforeend',
            `<span class="cg-zoom-hint" style="margin-left:auto;font-size:10px;color:#5a6080;">
                <span>scroll to zoom</span> <span>drag to pan</span> <span>double-click to reset</span>
            </span>`);
    }
}

// ── Bond year chart ───────────────────────────────────────────────────────────

export function buildBondSelector(portfolio) {
    const el = document.getElementById('bondSelector');
    if (!el) return;
    const currentIsins = new Set(portfolio.map(b => b.isin));
    currentIsins.forEach(isin => { if (!state.selectedIsins.has(isin)) state.selectedIsins.add(isin); });
    state.selectedIsins.forEach(isin => {
        if (!isin.startsWith('_repl_') && !currentIsins.has(isin)) state.selectedIsins.delete(isin);
    });
    const isDark      = document.body.classList.contains('dark');
    const COLORS      = isDark ? BOND_COLORS_DARK : BOND_COLORS_LIGHT;
    const issuerCount = {};
    portfolio.forEach(b => { issuerCount[b.issuer] = (issuerCount[b.issuer] || 0) + 1; });

    el.innerHTML = portfolio.map((b, i) => {
        const c   = COLORS[i % COLORS.length];
        const lbl = issuerCount[b.issuer] > 1
            ? `${b.issuer} <span style="font-family:monospace;font-size:10px;opacity:0.7">${b.isin}</span> (${(b.maturity||'').slice(0,4)})`
            : `${b.issuer} (${(b.maturity||'').slice(0,4)})`;
        return `<label style="display:inline-flex;align-items:center;gap:5px;margin:4px 8px 4px 0;cursor:pointer;font-size:12px;font-weight:600;">
            <input type="checkbox" ${state.selectedIsins.has(b.isin)?'checked':''} value="${b.isin}" onchange="toggleBondSel('${b.isin}',this.checked)">
            <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${c};flex-shrink:0;"></span>
            ${lbl}
        </label>`;
    }).join('');
}

export function renderBondYearChart(portfolio, years, selectedIsins) {
    const canvas = document.getElementById('bondYearChart');
    if (!canvas) return;
    if (state.chartBond) { state.chartBond.destroy(); state.chartBond = null; }

    const isDark     = document.body.classList.contains('dark');
    const labelColor = isDark ? '#c0c8e8' : '#444';
    const gridColor  = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
    const COLORS     = isDark ? BOND_COLORS_DARK : BOND_COLORS_LIGHT;
    const sym        = cgSym();
    const isStacked  = state.bondChartMode === 'stacked';

    const getCs       = () => getAllMatReplacementCs(state.scenarios);
    const timelines   = buildBondTimeline(portfolio, years, getCs, cgToBase);
    const active      = timelines.filter(t => !t._isReplacement && selectedIsins.has(t.isin));
    const replSeries  = timelines.filter(t => t._isReplacement && selectedIsins.has('_repl_' + t._scenarioId));

    if (!active.length && !replSeries.length) {
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
        return;
    }

    const allBondYears = [...years];
    getCs().filter(cs => cs._type === 'maturity_replacement').forEach(cs => {
        for (let y = Math.max(...years) + 1; y <= cs.maturityYear; y++) {
            if (!allBondYears.includes(y)) allBondYears.push(y);
        }
    });
    allBondYears.sort((a, b) => a - b);

    const alignSeries = (t, srcYears) => allBondYears.map(yr => {
        const idx = srcYears.indexOf(yr);
        return idx >= 0 && t.data[idx] != null ? t.data[idx] : null;
    });

    const activeAligned = active.map((t, i) => ({
        label: t.label, data: alignSeries(t, years),
        borderColor: COLORS[i % COLORS.length],
        backgroundColor: COLORS[i % COLORS.length] + (isStacked ? 'cc' : '25'),
        borderWidth: isStacked ? 1 : 2, fill: isStacked ? 'origin' : false,
        tension: 0.25, pointRadius: allBondYears.length > 15 ? 0 : 3, spanGaps: true,
        stack: isStacked ? 'bonds' : undefined,
    }));

    const replAligned = replSeries.map((t, i) => {
        const cs       = getCs().find(c => c.id === t._scenarioId);
        const srcYears = cs ? (() => {
            const ys = [...years];
            for (let y = Math.max(...years)+1; y <= cs.maturityYear; y++) ys.push(y);
            return ys;
        })() : years;
        const allReplScenarios = getCs().filter(c => c._type === 'maturity_replacement');
        const scenIdx = cs ? allReplScenarios.findIndex(c => c.id === cs.id) : i;
        const ci = portfolio.length + scenIdx;
        return {
            label: t.label, data: alignSeries(t, srcYears),
            borderColor: COLORS[ci % COLORS.length],
            backgroundColor: COLORS[ci % COLORS.length] + '30',
            borderWidth: 2, borderDash: [6, 3], fill: false,
            tension: 0.25, pointRadius: allBondYears.length > 15 ? 0 : 4,
            pointStyle: 'triangle', spanGaps: false, stack: 'repl', order: 0,
        };
    });

    state.chartBond = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels: allBondYears, datasets: [...activeAligned, ...replAligned] },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'bottom', labels: { color: labelColor, font:{size:11}, boxWidth:20 } },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const v = ctx.parsed.y;
                            if (!isFinite(v) || v <= 0) return null;
                            return ` ${ctx.dataset.label}: ${sym}${Math.round(v).toLocaleString(undefined,{maximumFractionDigits:0})}`;
                        },
                    },
                },
            },
            scales: {
                x: { stacked: isStacked, ticks:{color:labelColor,font:{size:11}}, grid:{color:gridColor} },
                y: {
                    stacked: isStacked,
                    ticks: { color:labelColor, font:{size:11},
                        callback: v => isFinite(v) ? sym + Math.round(v).toLocaleString(undefined,{maximumFractionDigits:0}) : '' },
                    grid: { color: gridColor },
                },
            },
        },
    });
}

// ── Coupon chart ──────────────────────────────────────────────────────────────

export function buildCouponSelector(portfolio) {
    const el = document.getElementById('couponSelector');
    if (!el) return;
    const currentIsins = new Set(portfolio.map(b => b.isin));
    currentIsins.forEach(isin => { if (!state.selectedCouponIsins.has(isin)) state.selectedCouponIsins.add(isin); });
    state.selectedCouponIsins.forEach(isin => {
        if (!isin.startsWith('_repl_') && !currentIsins.has(isin)) state.selectedCouponIsins.delete(isin);
    });

    const isDark      = document.body.classList.contains('dark');
    const COLORS      = isDark ? BOND_COLORS_DARK : BOND_COLORS_LIGHT;
    const issuerCount = {};
    portfolio.forEach(b => { issuerCount[b.issuer] = (issuerCount[b.issuer] || 0) + 1; });

    const bondHtml = portfolio.map((b, i) => {
        const c = COLORS[i % COLORS.length];
        return `<label style="display:inline-flex;align-items:center;gap:5px;margin:4px 8px 4px 0;cursor:pointer;font-size:12px;font-weight:600;">
            <input type="checkbox" ${state.selectedCouponIsins.has(b.isin)?'checked':''} value="${b.isin}" onchange="toggleCouponSel('${b.isin}',this.checked)">
            <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${c};flex-shrink:0;"></span>
            ${b.issuer} (${b.isin})
        </label>`;
    }).join('');

    const replCs = getAllMatReplacementCs(state.scenarios).filter(cs => cs._type === 'maturity_replacement');
    const replHtml = replCs.map((cs, j) => {
        const key  = '_repl_' + cs.id;
        if (!state.selectedCouponIsins.has(key)) state.selectedCouponIsins.add(key);
        const src  = portfolio.find(b => b.isin === cs.sourceBond?.isin);
        const ci   = portfolio.length + j;
        const c    = COLORS[ci % COLORS.length];
        const lbl  = `${cs.name}: ${src ? src.issuer+'('+src.isin+')' : cs.sourceBond?.isin} → repl. (${cs.maturityYear})`;
        return `<label style="display:inline-flex;align-items:center;gap:5px;margin:4px 8px 4px 0;cursor:pointer;font-size:12px;font-weight:600;color:${isDark?'#70c172':'#2e7d32'};">
            <input type="checkbox" ${state.selectedCouponIsins.has(key)?'checked':''} value="${key}" onchange="toggleCouponSel('${key}',this.checked)">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${c};flex-shrink:0;"></span>
            ${lbl}
        </label>`;
    }).join('');

    el.innerHTML = bondHtml + replHtml;
}

export function renderCouponChart(portfolio, simResult) {
    const canvas = document.getElementById('couponChart');
    if (!canvas) return;
    if (state.chartCoupon) { state.chartCoupon.destroy(); state.chartCoupon = null; }

    const isDark     = document.body.classList.contains('dark');
    const labelColor = isDark ? '#c0c8e8' : '#444';
    const gridColor  = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
    const COLORS     = isDark ? BOND_COLORS_DARK : BOND_COLORS_LIGHT;
    const sym        = cgSym();
    const isStacked  = state.couponChartMode === 'stacked';

    const scenarios = simResult.scenarios || [];
    const years     = simResult.years     || [];
    if (!scenarios.length || !years.length) return;

    const allYears  = [...years];
    const getCs     = () => getAllMatReplacementCs(state.scenarios);
    scenarios.forEach(sc => {
        (sc._extendedYears || sc._years || []).forEach(y => { if (!allYears.includes(y)) allYears.push(y); });
    });
    getCs().filter(cs => cs._type === 'maturity_replacement').forEach(cs => {
        for (let y = Math.max(...years)+1; y <= cs.maturityYear; y++) { if (!allYears.includes(y)) allYears.push(y); }
    });
    allYears.sort((a, b) => a - b);

    const replCs  = getCs().filter(cs => cs._type === 'maturity_replacement');
    let datasets  = [];

    if (scenarios.length === 1) {
        const sc = scenarios[0];
        portfolio.forEach((b, i) => {
            if (!state.selectedCouponIsins.has(b.isin)) return;
            const data  = allYears.map(yr => {
                const ev   = sc.yearEvents?.find(e => e.yr === yr);
                const slot = ev?.perSlot?.find(s => s.isin === b.isin && !s._isReplacement);
                return slot ? cgToBase((slot.coupon ?? 0) * (sc.scale || 1)) : null;
            });
            const color = COLORS[i % COLORS.length];
            datasets.push({ label: `${b.issuer} (${b.isin})`, data,
                backgroundColor: color+(isStacked?'cc':'55'), borderColor: color,
                borderWidth: isStacked?1:2, fill: isStacked?'origin':false,
                tension: 0.25, pointRadius: allYears.length>15?0:3, spanGaps:true,
                stack: isStacked?'bonds':undefined });
        });
        replCs.forEach((cs, j) => {
            const key   = '_repl_' + cs.id;
            if (!state.selectedCouponIsins.has(key)) return;
            const ci    = portfolio.length + j;
            const color = COLORS[ci % COLORS.length];
            const srcB  = portfolio.find(b => b.isin === cs.sourceBond?.isin);
            const data  = allYears.map(yr => {
                const ev   = sc.yearEvents?.find(e => e.yr === yr);
                const slot = ev?.perSlot?.find(s => s._isReplacement && s.isin.startsWith(cs.sourceBond?.isin));
                return slot ? cgToBase((slot.replCoupon ?? slot.coupon ?? 0) * (sc.scale||1)) : null;
            });
            datasets.push({
                label: `${cs.name}: ${srcB?srcB.issuer+'('+srcB.isin+')':cs.sourceBond?.isin} → repl. (${cs.maturityYear})`,
                data, backgroundColor: color+(isStacked?'bb':'44'), borderColor: color,
                borderWidth: isStacked?1:2, borderDash:[6,3], fill:isStacked?'origin':false,
                tension:0.25, pointRadius:allYears.length>15?0:4, pointStyle:'triangle',
                spanGaps:false, stack:isStacked?'repl':undefined });
        });
    } else {
        scenarios.forEach(sc => {
            const data = allYears.map(yr => {
                const ev = sc.yearEvents?.find(e => e.yr === yr);
                if (!ev) return null;
                const realTotal = (ev.perSlot||[])
                    .filter(s => !s._isReplacement && state.selectedCouponIsins.has(s.isin))
                    .reduce((sum,s) => sum+(s.coupon??0), 0);
                const replTotal = (ev.perSlot||[])
                    .filter(s => {
                        if (!s._isReplacement) return false;
                        const matchCs = replCs.find(c => s.isin.startsWith(c.sourceBond?.isin));
                        return matchCs && state.selectedCouponIsins.has('_repl_'+matchCs.id);
                    })
                    .reduce((sum,s) => sum+(s.replCoupon??s.coupon??0), 0);
                return cgToBase((realTotal+replTotal)*(sc.scale||1));
            });
            datasets.push({ label:sc.label, data,
                backgroundColor:sc.color+(isStacked?'bb':'33'), borderColor:sc.color,
                borderWidth:isStacked?1:2.5, fill:isStacked?'origin':false,
                tension:0.25, pointRadius:allYears.length>15?0:3, spanGaps:true,
                stack:isStacked?'scenarios':undefined });
        });
    }

    // NR benchmark line
    if (state.nrBenchmark.enabled && state.nrBenchmark.yearEvents) {
        const data = allYears.map(yr => {
            const ev = state.nrBenchmark.yearEvents.find(e => e.yr === yr);
            if (!ev) return null;
            const total = (ev.perSlot||[])
                .filter(s => !s._isReplacement && state.selectedCouponIsins.has(s.isin))
                .reduce((sum,s) => sum+(s.coupon??0), 0);
            return cgToBase(total * (state.nrBenchmark.scale||1));
        });
        datasets.push({ label:state.nrBenchmark.label, data, type:'line',
            backgroundColor:state.nrBenchmark.color+'22', borderColor:state.nrBenchmark.color,
            borderWidth:1.5, borderDash:[5,4], fill:false, tension:0.25,
            pointRadius:allYears.length>15?0:3, spanGaps:true });
    }

    if (!datasets.length) { canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height); return; }

    const barTotalsPlugin = {
        id: 'couponBarTotals',
        afterDatasetsDraw(chart) {
            if (!isStacked || chart.width < 500) return;
            const { ctx, data, scales:{x,y} } = chart;
            const totals = new Array(data.labels.length).fill(0);
            chart.data.datasets.forEach((ds, di) => {
                const meta = chart.getDatasetMeta(di);
                if (meta.type==='line'||meta.hidden) return;
                ds.data.forEach((v,i) => { if (isFinite(v)&&v>0) totals[i]+=v; });
            });
            ctx.save();
            ctx.font = '600 10px sans-serif';
            ctx.textAlign='center'; ctx.textBaseline='bottom';
            ctx.fillStyle = document.body.classList.contains('dark') ? '#c0c8e8' : '#333';
            totals.forEach((total,i) => {
                if (total<=0) return;
                ctx.fillText(sym+Math.round(total).toLocaleString(undefined,{maximumFractionDigits:0}),
                    x.getPixelForValue(i), y.getPixelForValue(total)-3);
            });
            ctx.restore();
        },
    };

    state.chartCoupon = new Chart(canvas.getContext('2d'), {
        type: isStacked ? 'bar' : 'line',
        data: { labels: allYears, datasets },
        plugins: [barTotalsPlugin],
        options: {
            responsive:true, maintainAspectRatio:false,
            interaction:{mode:'index',intersect:false},
            plugins: {
                legend:{position:'bottom',labels:{color:labelColor,font:{size:11},boxWidth:20}},
                tooltip:{callbacks:{label:ctx=>{
                    const v=ctx.parsed.y; if(!isFinite(v)||v<=0) return null;
                    return ` ${ctx.dataset.label}: ${sym}${Math.round(v).toLocaleString(undefined,{maximumFractionDigits:0})}`;
                }}},
            },
            scales:{
                x:{stacked:isStacked,ticks:{color:labelColor,font:{size:11}},grid:{color:gridColor}},
                y:{stacked:isStacked,
                    ticks:{color:labelColor,font:{size:11},
                        callback:v=>isFinite(v)?sym+Math.round(v).toLocaleString(undefined,{maximumFractionDigits:0}):''},
                    grid:{color:gridColor}},
            },
        },
    });
}

// ── NR Benchmark panel & toggle ───────────────────────────────────────────────

export function renderNrBenchmarkPanel() {
    const el = document.getElementById('cgNrBenchPanel');
    if (!el) return;
    const isDark     = document.body.classList.contains('dark');
    const border     = isDark ? '#2a2d45' : '#dde3ee';
    const bg         = isDark ? '#1a1d2e' : '#f5f7ff';
    const textMuted  = isDark ? '#8890b8' : '#888';
    const nr         = state.nrBenchmark;

    el.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 14px;
                    background:${bg};border-top:1px solid ${border};flex-wrap:wrap;">
            <span style="font-size:10px;font-weight:600;color:${textMuted};text-transform:uppercase;letter-spacing:0.5px;flex-shrink:0;">📊 Benchmark</span>
            <label style="display:inline-flex;align-items:center;gap:7px;cursor:pointer;font-size:12px;">
                <input type="checkbox" id="cgNrBenchChk" ${nr.enabled?'checked':''}
                    onchange="toggleNrBenchmark(this.checked)" style="cursor:pointer;accent-color:${nr.color};">
                <span style="display:inline-block;width:24px;height:2px;border-top:2px dashed ${nr.color};vertical-align:middle;flex-shrink:0;"></span>
                <span id="cgNrBenchLabel" style="color:${isDark?'#c0c8e8':'#333'};min-width:60px;"
                    title="Double-click to rename" ondblclick="startNrBenchRename(this)">${nr.label}</span>
            </label>
            <span style="font-size:10px;color:${textMuted};margin-left:4px;">no coupon reinvestment, no replacements — pure cash-flow baseline</span>
        </div>`;
}

export function toggleNrBenchmark(enabled) {
    state.nrBenchmark.enabled = enabled;
    if (!state.chart) return;
    state.chart.data.datasets = state.chart.data.datasets.filter(d => d._nrBenchmark !== true);
    if (enabled && state.nrBenchmark.data) {
        const sym = cgSym();
        state.chart.data.datasets.push({
            _nrBenchmark: true,
            label:            state.nrBenchmark.label,
            data:             state.nrBenchmark.data.map(v => isFinite(v) ? cgToBase(v) : null),
            borderColor:      state.nrBenchmark.color,
            backgroundColor:  state.nrBenchmark.color + '18',
            borderWidth:      1.5, borderDash:[5,4], pointRadius:0, tension:0.3, fill:false, spanGaps:true,
        });
    }
    state.chart.update();
}
