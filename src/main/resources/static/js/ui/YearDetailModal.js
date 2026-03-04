'use strict';
/**
 * YearDetailModal — click-on-year popup with per-scenario cash-flow breakdown.
 */

import { state }             from './AppState.js';
import { cgSym, cgToBase, cgBaseCcy } from './CurrencyHelper.js';
import { getAllMatReplacementCs }      from '../core/ScenarioModel.js';
import { computeCache }               from '../core/ComputeCache.js';

export function openYearDetailModal(yr, yearIdx, simResult, startCapital, allLabels) {
    document.getElementById('cgYearModal')?.remove();

    const isDark = document.body.classList.contains('dark');
    const sym    = cgSym();
    const fmt    = v => sym + Math.round(cgToBase(v)).toLocaleString(undefined, { maximumFractionDigits: 0 });
    const bg     = isDark ? '#1e2338' : '#fff';
    const border = isDark ? '#2a2d45' : '#dde3ee';
    const text   = isDark ? '#c0c8e8' : '#1a2a4a';
    const thBg   = isDark ? '#252840' : '#f0f4ff';
    const chartLabels = allLabels || simResult.years;
    const portfolio   = state.lastPortfolio;

    // Pre-compute base flows for each year (unscaled)
    const _baseYearFlows = (() => {
        const map = new Map();
        for (const y of chartLabels) {
            let coupons = 0, redemptions = 0;
            portfolio.filter(b => new Date(b.maturity).getFullYear() >= y).forEach(b => {
                const matYr  = new Date(b.maturity).getFullYear();
                const qty    = b.quantity || 0;
                const cached = computeCache.get(b.isin);
                const fxBuy  = cached?.fxBuy ?? ((b.currency && b.currency !== 'EUR' && b.price > 0) ? (b.priceEur / b.price) : 1.0);
                const nomEur = 100 * fxBuy;
                const netCpn = (b.coupon / 100) * nomEur * qty * (1 - (b.taxRate || 0) / 100);
                coupons += netCpn;
                if (matYr === y) redemptions += nomEur * qty;
            });
            map.set(y, { coupons, redemptions });
        }
        return map;
    })();

    const expanded = state.expandedScenarios;

    let rows = simResult.scenarios.map(sc => {
        const ev = sc.yearEvents?.find(e => e.yr === yr) ?? null;
        const dataIdx = chartLabels.indexOf(yr);
        const val     = dataIdx >= 0 ? sc.data[dataIdx] : null;
        const prevIdx = dataIdx > 0 ? dataIdx - 1 : -1;
        const prev    = prevIdx >= 0 ? sc.data[prevIdx] : null;
        const delta   = (val != null && prev != null) ? val - prev : null;
        const sign    = delta >= 0 ? '+' : '';
        const sc2     = v => (v != null && isFinite(v)) ? fmt(v * (sc.scale||1)) : '—';

        const hasCouponReinvest    = sc._hasCouponReinvest === true;
        const isReplPreActivation  = sc._type === 'maturity_replacement' && !hasCouponReinvest
            && yr < (sc._sourceBond?.matYear || 9999) && !ev?.replacementActivated;
        const isReplActivation     = sc._type === 'maturity_replacement' && ev?.replacementActivated;

        const couponCell  = isReplPreActivation || isReplActivation ? '<span style="color:#888">—</span>' : sc2(ev?.coupons || 0);
        const redempCell  = isReplPreActivation || isReplActivation ? '<span style="color:#888">—</span>' : sc2(ev?.redemptions || 0);
        let reinvestedCell;
        if (sc._type === 'maturity_replacement') {
            if (isReplPreActivation)     reinvestedCell = '<span style="color:#888">—</span>';
            else if (isReplActivation)   reinvestedCell = `<span style="color:#90caf9;font-size:10px">→ ${sc2(ev.switched||0)}</span>`;
            else reinvestedCell = sc2((ev?.reinvested||0) + (ev?.replCoupons||0));
        } else {
            reinvestedCell = sc2(ev?.reinvested || 0);
        }

        const cashAccum    = (ev?.cash ?? 0) * (sc.scale||1);
        const bondsOnlyVal = (ev?.bondsVal != null) ? ev.bondsVal * (sc.scale||1) : val;
        const totalPortVal = (ev?.bondsVal != null) ? bondsOnlyVal + cashAccum : val;
        const valDisplay   = totalPortVal != null
            ? `${sym}${Math.round(cgToBase(totalPortVal)).toLocaleString(undefined,{maximumFractionDigits:0})}` : '—';
        const deltaDisplay = delta != null
            ? `<span style="color:${delta>=0?'#43a047':'#e53935'};font-weight:600;">${sign}${sym}${Math.abs(Math.round(cgToBase(delta))).toLocaleString(undefined,{maximumFractionDigits:0})}</span>`
            : '<span style="color:#888">—</span>';

        const isExpanded = expanded.has(sc.id);
        const toggleId   = `cgBondExpand_${sc.id}_${yr}`;

        let perBondRows = '';
        if (isExpanded) {
            const fmtSmall = v => sym + Math.round(cgToBase(v)).toLocaleString(undefined,{maximumFractionDigits:0});
            const slotItems = ev?.perSlot || [];
            if (slotItems.length > 0) {
                const K  = sc.scale || 1;
                const fs = v => fmtSmall(v * K);
                const bondRows = slotItems.map(s => {
                    let matYr;
                    if (s._isReplacement) { matYr = s.matYear || '?'; }
                    else { const pb = portfolio.find(b => b.isin === s.isin); matYr = pb ? new Date(pb.maturity).getFullYear() : '?'; }
                    const dispIsin   = s._isReplacement ? s.isin.replace('_repl','') : s.isin;
                    const couponVal  = s._isReplacement ? (s.replCoupon||0) : s.coupon;
                    const rowStyle   = s._isReplacement
                        ? `opacity:0.78;font-size:10.5px;background:${isDark?'rgba(30,100,30,0.15)':'rgba(0,100,0,0.05)'};`
                        : `opacity:0.78;font-size:10.5px;background:${isDark?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.02)'};`;
                    const isinColor  = s._isReplacement ? (isDark?'#70c172':'#2e7d32') : (isDark?'#8890b8':'#888');
                    const replBadge  = s._isReplacement ? `<span style="font-size:9px;color:#70c172;margin-left:4px;">🔄 repl.</span>` : '';
                    return `<tr style="${rowStyle}">
                        <td style="padding:3px 10px 3px 28px;color:${isinColor};">
                            <span style="font-family:monospace;font-size:10px;">${dispIsin}</span>
                            <span style="margin-left:6px;">${s.issuer}</span>
                            <span style="margin-left:6px;opacity:0.6;">mat.${matYr}</span>${replBadge}
                        </td>
                        <td style="padding:3px 10px;text-align:right;">${fs(couponVal)}</td>
                        <td style="padding:3px 10px;text-align:right;">${s.redemption>0?fs(s.redemption):'<span style="color:#888">—</span>'}</td>
                        <td style="padding:3px 10px;text-align:right;">${s.reinvested>0?fs(s.reinvested):'<span style="color:#888">—</span>'}</td>
                        <td style="padding:3px 10px;text-align:right;">${fs(s.portVal)}</td>
                        <td style="padding:3px 10px;text-align:right;color:#888;">—</td>
                    </tr>`;
                }).join('');
                const cashVal = (ev?.cash||0) * K;
                let cashRow = '';
                if (cashVal > 0.5) {
                    const cashBg    = isDark ? 'rgba(255,193,7,0.07)' : 'rgba(255,193,7,0.08)';
                    const cashColor = isDark ? '#ffd54f' : '#b07d00';
                    cashRow = `<tr style="opacity:0.85;font-size:10.5px;background:${cashBg};">
                        <td style="padding:3px 10px 3px 28px;color:${cashColor};font-weight:600;">
                            <span style="font-family:monospace;font-size:10px;">CASH</span>
                            <span style="margin-left:6px;">${sym} liquidity</span>
                        </td>
                        <td style="padding:3px 10px;text-align:right;color:#888;">—</td>
                        <td style="padding:3px 10px;text-align:right;color:#888;">—</td>
                        <td style="padding:3px 10px;text-align:right;color:#888;">—</td>
                        <td style="padding:3px 10px;text-align:right;font-weight:600;color:${cashColor};">${fmtSmall(cashVal)}</td>
                        <td style="padding:3px 10px;text-align:right;color:#888;">—</td>
                    </tr>`;
                }
                perBondRows = bondRows + cashRow;
            }
        }

        return `<tr>
            <td style="padding:7px 10px;">
                <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;">
                    <input type="checkbox" id="${toggleId}" ${isExpanded?'checked':''}
                        style="cursor:pointer;accent-color:${sc.color};"
                        onchange="(function(chk){
                            if(chk.checked)_cgState.expandedScenarios.add('${sc.id}');
                            else _cgState.expandedScenarios.delete('${sc.id}');
                            openYearDetailModal(${yr},${yearIdx},_cgLastSimResult,_cgLastStartCapital,${JSON.stringify(chartLabels)});
                        })(this)">
                    <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${sc.color};vertical-align:middle;"></span>
                    ${sc.label}
                </label>
            </td>
            <td style="padding:7px 10px;text-align:right;">${couponCell}</td>
            <td style="padding:7px 10px;text-align:right;">${redempCell}</td>
            <td style="padding:7px 10px;text-align:right;">${reinvestedCell}</td>
            <td style="padding:7px 10px;text-align:right;font-weight:700;">${valDisplay}</td>
            <td style="padding:7px 10px;text-align:right;">${deltaDisplay}</td>
        </tr>${perBondRows}`;
    }).join('');

    // NR benchmark row
    let benchRow = '';
    const nr = state.nrBenchmark;
    if (nr.enabled && nr.yearEvents) {
        const bEv  = nr.yearEvents.find(e => e.yr === yr) ?? null;
        const bYrs = nr.years || simResult.years;
        const bIdx = bYrs.indexOf(yr);
        const bVal = nr.data && bIdx >= 0 ? nr.data[bIdx] : null;
        const bPrev = nr.data && bIdx > 0  ? nr.data[bIdx-1] : null;
        const bDelta = (bVal != null && bPrev != null) ? bVal - bPrev : null;
        const bSc    = v => (v != null && isFinite(v)) ? fmt(v) : '—';
        const bSign  = bDelta != null && bDelta >= 0 ? '+' : '';
        const bTotalPortVal = (bEv?.bondsVal??0) + (bEv?.cash??0);
        const bValDisplay   = bTotalPortVal > 0
            ? `${sym}${Math.round(cgToBase(bTotalPortVal)).toLocaleString(undefined,{maximumFractionDigits:0})}` : '—';
        const bDeltaDisplay = bDelta != null
            ? `<span style="color:${bDelta>=0?'#43a047':'#e53935'};font-weight:600;">${bSign}${sym}${Math.abs(Math.round(cgToBase(bDelta))).toLocaleString(undefined,{maximumFractionDigits:0})}</span>`
            : '<span style="color:#888">—</span>';
        benchRow = `<tr style="border-top:2px dashed ${isDark?'#3a3f60':'#c8cfdf'};background:${isDark?'rgba(158,158,158,0.06)':'rgba(0,0,0,0.025)'};">
            <td style="padding:7px 10px;">
                <span style="display:inline-flex;align-items:center;gap:7px;font-size:12px;color:${isDark?'#8890b8':'#888'};">
                    <span style="display:inline-block;width:20px;height:2px;border-top:2px dashed ${nr.color};vertical-align:middle;flex-shrink:0;"></span>
                    ${nr.label}
                </span>
            </td>
            <td style="padding:7px 10px;text-align:right;color:${isDark?'#8890b8':'#888'};">${bSc(bEv?.coupons)}</td>
            <td style="padding:7px 10px;text-align:right;color:${isDark?'#8890b8':'#888'};">${bSc(bEv?.redemptions)}</td>
            <td style="padding:7px 10px;text-align:right;color:${isDark?'#8890b8':'#888'};">—</td>
            <td style="padding:7px 10px;text-align:right;font-weight:600;color:${isDark?'#8890b8':'#888'};">${bValDisplay}</td>
            <td style="padding:7px 10px;text-align:right;">${bDeltaDisplay}</td>
        </tr>`;
    }

    // Maturing bonds section
    const maturingBonds = portfolio.filter(b => new Date(b.maturity).getFullYear() === yr);
    let matHtml = '';
    if (maturingBonds.length) {
        const issuerCount = {};
        maturingBonds.forEach(b => { issuerCount[b.issuer] = (issuerCount[b.issuer]||0)+1; });
        const activeRepls = getAllMatReplacementCs(state.scenarios)
            .filter(cs => cs._type==='maturity_replacement' && cs.sourceBond?.matYear===yr);
        const replHtml = activeRepls.map(cs => {
            const src = portfolio.find(b=>b.isin===cs.sourceBond.isin);
            const srcName = src ? (maturingBonds.length>1||portfolio.filter(x=>x.issuer===src.issuer).length>1
                ? `${src.issuer} ${src.isin}` : src.issuer) : '?';
            const pShiftTxt = cs.priceShift ? ` · price ${cs.priceShift>0?'+':''}${cs.priceShift}%` : '';
            return `<div style="margin-top:6px;padding:6px 10px;border-radius:5px;background:${isDark?'#1a2436':'#e3f2fd'};border:1px solid ${isDark?'#1565c0':'#90caf9'};font-size:11px;">
                🔄 <strong style="color:${isDark?'#90caf9':'#1565c0'}">${cs.name}:</strong>
                ${srcName} → new bond
                <span style="margin-left:8px;opacity:0.8">coupon ${cs.netCouponPct.toFixed(2)}% net${pShiftTxt} · matures ${cs.maturityYear} · coupons: ${cs.reinvestCoupons?'reinvested':'cash'}</span>
            </div>`;
        }).join('');
        matHtml = `<div style="margin-top:12px;padding:10px 12px;border-radius:6px;background:${isDark?'#1a2e1a':'#e8f5e9'};border:1px solid ${isDark?'#2a5a2a':'#a5d6a7'};">
            <strong style="color:${isDark?'#70c172':'#2e7d32'}">🏁 Maturing bonds:</strong>
            ${maturingBonds.map(b=>`<span style="font-size:12px;margin-right:16px;">${b.issuer} <span style="font-family:monospace;font-size:10px;opacity:0.75">${b.isin}</span></span>`).join('')}
            ${replHtml}
        </div>`;
    }

    const canPrev = yearIdx > 0;
    const canNext = yearIdx < chartLabels.length - 1;
    const navBtnSt = (enabled) =>
        `background:${enabled?(isDark?'#2a2d45':'#e8edf8'):'transparent'};border:1px solid ${enabled?(isDark?'#4a50a0':'#c0c8e8'):'transparent'};
         border-radius:6px;padding:4px 12px;font-size:15px;cursor:${enabled?'pointer':'default'};
         color:${enabled?(isDark?'#c0c8e8':'#1a2a4a'):(isDark?'#3a4060':'#ccd')};`;

    const overlay = document.createElement('div');
    overlay.id = 'cgYearModal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px;';
    overlay.innerHTML = `
        <div style="background:${bg};border:1px solid ${border};border-radius:10px;max-width:900px;width:100%;max-height:85vh;overflow:auto;color:${text};box-shadow:0 8px 40px rgba(0,0,0,0.35);">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid ${border};background:${isDark?'#252840':'#f5f7ff'};">
                <div style="display:flex;align-items:center;gap:8px;">
                    <button id="cgModalPrev" ${canPrev?'':'disabled'} style="${navBtnSt(canPrev)}" title="Previous year (←)">&#8592;</button>
                    <strong style="font-size:15px;min-width:200px;text-align:center;">📅 Year ${yr} — Cash Flow Detail</strong>
                    <button id="cgModalNext" ${canNext?'':'disabled'} style="${navBtnSt(canNext)}" title="Next year (→)">&#8594;</button>
                </div>
                <button onclick="document.getElementById('cgYearModal').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:${text};line-height:1;">&times;</button>
            </div>
            <div style="padding:16px 18px;overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:12px;">
                    <thead><tr style="background:${thBg};color:${isDark?'#8890b8':'#666'};">
                        <th style="padding:7px 10px;text-align:left;">Scenario</th>
                        <th style="padding:7px 10px;text-align:right;">Coupons (net)</th>
                        <th style="padding:7px 10px;text-align:right;">Redemptions</th>
                        <th style="padding:7px 10px;text-align:right;">Reinvested</th>
                        <th style="padding:7px 10px;text-align:right;" title="Bonds + accumulated cash">Portfolio Value</th>
                        <th style="padding:7px 10px;text-align:right;">Δ vs prev yr</th>
                    </tr></thead>
                    <tbody>${rows}${benchRow}</tbody>
                </table>
                ${matHtml}
                <p style="font-size:10px;color:${isDark?'#5a6080':'#aaa'};margin-top:10px;">
                    Coupons net of withholding tax. All values in ${cgBaseCcy()} &nbsp;·&nbsp;
                    <span style="opacity:0.7;">← → arrows or buttons to navigate years</span>
                </p>
            </div>
        </div>`;

    overlay.addEventListener('click', e => { if (e.target === overlay) { document.removeEventListener('keydown', onKey); overlay.remove(); } });
    document.body.appendChild(overlay);

    document.getElementById('cgModalPrev')?.addEventListener('click', () => {
        overlay.remove(); document.removeEventListener('keydown', onKey);
        openYearDetailModal(chartLabels[yearIdx-1], yearIdx-1, simResult, startCapital, chartLabels);
    });
    document.getElementById('cgModalNext')?.addEventListener('click', () => {
        overlay.remove(); document.removeEventListener('keydown', onKey);
        openYearDetailModal(chartLabels[yearIdx+1], yearIdx+1, simResult, startCapital, chartLabels);
    });

    const onKey = (e) => {
        if (e.key==='ArrowLeft'  && canPrev) { overlay.remove(); document.removeEventListener('keydown',onKey); openYearDetailModal(chartLabels[yearIdx-1],yearIdx-1,simResult,startCapital,chartLabels); }
        if (e.key==='ArrowRight' && canNext) { overlay.remove(); document.removeEventListener('keydown',onKey); openYearDetailModal(chartLabels[yearIdx+1],yearIdx+1,simResult,startCapital,chartLabels); }
        if (e.key==='Escape')               { overlay.remove(); document.removeEventListener('keydown',onKey); }
    };
    document.addEventListener('keydown', onKey);
}
