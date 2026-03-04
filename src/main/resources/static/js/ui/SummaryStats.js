'use strict';
/**
 * SummaryStats — renders the stat cards and bond list above the charts.
 */

import { state }           from './AppState.js';
import { cgSym, cgToBase } from './CurrencyHelper.js';
import { computeCache }    from '../core/ComputeCache.js';

const BOND_COLORS_DARK  = ['#5b9bd5','#70c172','#ffd740','#ff7043','#ba68c8','#4dd0e1','#fff176','#a5d6a7','#ef9a9a','#90caf9'];
const BOND_COLORS_LIGHT = ['#1565c0','#2e7d32','#e65100','#6a1b9a','#00838f','#f9a825','#558b2f','#ad1457','#4527a0','#37474f'];

export function renderSummaryStats(portfolio, simResult, startCapital) {
    const el = document.getElementById('summaryStats');
    if (!el) return;

    const sym    = cgSym();
    const fmt    = v => sym + cgToBase(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
    const card   = (lbl, val, sub = '') =>
        `<div class="cg-stat-card"><div class="cg-stat-label">${lbl}</div><div class="cg-stat-value">${val}</div>${sub ? `<div class="cg-stat-sub">${sub}</div>` : ''}</div>`;
    const isDark = document.body.classList.contains('dark');
    const border = isDark ? '#2a2d45' : '#e0e5f0';

    // Bond list
    const issuerCount = {};
    portfolio.forEach(b => { issuerCount[b.issuer] = (issuerCount[b.issuer] || 0) + 1; });
    const COLORS      = isDark ? BOND_COLORS_DARK : BOND_COLORS_LIGHT;

    const bondListHtml = portfolio.map((b, i) => {
        const c         = COLORS[i % COLORS.length];
        const matYear   = (b.maturity || '').slice(0, 4);
        const couponStr = typeof b.coupon === 'number' ? b.coupon.toFixed(2) + '%' : '—';
        return `<span style="display:inline-flex;align-items:center;gap:5px;margin:3px 10px 3px 0;font-size:11px;font-weight:600;">
            <span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${c};flex-shrink:0;"></span>
            <span style="font-family:monospace;">${b.isin}</span>
            <span style="color:#888;font-weight:400;">(${b.issuer}, ${couponStr}, ${matYear})</span>
        </span>`;
    }).join('');

    function renderCards() {
        const portfolioCost = portfolio.reduce((s, b) => s + (b.totalEur || (b.priceEur || 0) * b.quantity), 0);
        const activeScId    = state.activeScenarioId || (state.scenarios[0]?.id);
        const activeSimSc   = simResult.scenarios?.find(s => s.id === activeScId);

        let totStart = 0, totFinal = 0, totCoupons = 0, totFace = 0, maxHorizon = 0;
        portfolio.forEach(b => { totStart += b.totalEur || (b.priceEur || 0) * b.quantity; });
        maxHorizon = simResult.years ? simResult.years.length - 1 : 0;

        if (activeSimSc?.yearEvents?.length) {
            const scScale = activeSimSc.scale || 1;
            activeSimSc.yearEvents.forEach(ev => {
                totCoupons += (ev.coupons     ?? 0) * scScale;
                totFace    += (ev.redemptions ?? 0) * scScale;
            });
        } else {
            portfolio.forEach(b => {
                const cached   = computeCache.get(b.isin);
                const bondCost = b.totalEur || (b.priceEur || 0) * b.quantity;
                const share    = portfolioCost > 0 ? bondCost / portfolioCost : 0;
                const scale    = startCapital * share / 1000;
                totCoupons += (cached?.capCoupons ?? 0) * scale;
                totFace    += (cached?.capGain    ?? 0) * scale;
            });
        }

        if (activeSimSc?.data?.length > 0) {
            const last = activeSimSc.data.filter(v => v != null && isFinite(v)).slice(-1)[0];
            if (last) totFinal = last;
        } else {
            totFinal = totStart + totCoupons + totFace;
        }

        const cagr      = (maxHorizon > 0 && totStart > 0 && totFinal > 0)
            ? (Math.pow(totFinal / totStart, 1 / maxHorizon) - 1) * 100 : 0;
        const scenLabel = state.scenarios.find(s => s.id === activeScId)?.label || 'No reinvestment';
        const scColor   = state.scenarios.find(s => s.id === activeScId)?.color || '#888';

        return `<div style="width:100%;font-size:10px;font-weight:600;color:#888;
                    text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px;">
                Stats — <span style="color:${scColor};font-size:11px;">${scenLabel}</span>
            </div>` +
            card('Initial Capital',   fmt(totStart)) +
            card('Final Value',       fmt(totFinal),   'at horizon') +
            card('Total Net Coupons', fmt(totCoupons), 'over full horizon') +
            card('Capital Returned',  fmt(totFace),    'face value × qty') +
            card('Horizon',           `${maxHorizon} yrs`) +
            card('CAGR',              `${cagr.toFixed(2)}%`, 'compound annual');
    }

    el.innerHTML = `
        <div id="cgBondList" style="padding-bottom:8px;border-bottom:1px solid ${border};margin-bottom:10px;flex-wrap:wrap;display:flex;align-items:center;">
            <div style="font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px;width:100%;">Portfolio</div>
            ${bondListHtml}
        </div>
        <div id="cgStatsCards" style="display:flex;flex-wrap:wrap;gap:10px;">${renderCards()}</div>`;

    window._cgStatsRefresh = () => {
        const el2 = document.getElementById('cgStatsCards');
        if (el2) el2.innerHTML = renderCards();
    };
}
