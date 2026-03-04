'use strict';
/**
 * ScenarioPanel — scenario tab bar, 3 sub-tabs, CRUD, import/export, NR-benchmark.
 */

import { state }               from './AppState.js';
import { cgSym, cgToBase, cgFromBase, cgBaseCcy } from './CurrencyHelper.js';
import { defaultScenario, getAllMatReplacementCs, scenariosToJson, scenariosFromJson } from '../core/ScenarioModel.js';
import { SCENARIO_COLORS }     from '../core/ScenarioModel.js';
import { computeEffectiveSAY } from '../infrastructure/BondFXClient.js';
import { triggerSimulation }   from './CapitalGrowthController.js';

// ── Inline rename helpers ─────────────────────────────────────────────────────

function _makeInlineInput(rect, initialValue, isDark, onCommit) {
    const inp = document.createElement('input');
    inp.type  = 'text';
    inp.value = initialValue;
    inp.style.cssText =
        `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${Math.max(rect.width+20,80)}px;height:${rect.height}px;` +
        `font-size:12px;font-weight:700;padding:0 4px;border:1px solid #5b8dee;border-radius:3px;` +
        `background:${isDark?'#252840':'#fff'};color:inherit;z-index:99999;outline:none;box-sizing:border-box;`;
    document.body.appendChild(inp);
    inp.focus(); inp.select();
    const finish = () => {
        const v = inp.value.trim();
        if (inp.parentNode) inp.parentNode.removeChild(inp);
        if (v) onCommit(v);
    };
    inp.addEventListener('blur', finish);
    inp.addEventListener('keydown', e => {
        if (e.key === 'Enter')  { e.preventDefault(); inp.blur(); }
        if (e.key === 'Escape') { inp.value = initialValue; inp.blur(); }
    });
}

export function startTabRename(scId, labelEl) {
    const sc = state.scenarios.find(s => s.id === scId);
    if (!sc) return;
    _makeInlineInput(labelEl.getBoundingClientRect(), sc.label, document.body.classList.contains('dark'),
        newLabel => { if (newLabel !== sc.label) renameScenario(scId, newLabel); });
}

export function startNrBenchRename(labelEl) {
    const nr = state.nrBenchmark;
    _makeInlineInput(labelEl.getBoundingClientRect(), nr.label, document.body.classList.contains('dark'),
        newLabel => {
            if (newLabel !== nr.label) {
                nr.label = newLabel;
                if (state.chart) {
                    const ds = state.chart.data.datasets.find(d => d._nrBenchmark);
                    if (ds) { ds.label = newLabel; state.chart.update(); }
                }
                // re-render benchmark panel
                import('./ChartRenderer.js').then(m => m.renderNrBenchmarkPanel());
            }
        });
}

// ── Panel build ───────────────────────────────────────────────────────────────

function _buildSubTabHtml(isDark, border) {
    const color = isDark ? '#8890b8' : '#888';
    const bg    = isDark ? '#1a1d2e' : '#fafbff';
    const tabs  = { coupon: '📈 Coupon reinvest', replacement: '🔄 Maturity replacement', injection: '💰 Annual injection' };
    const btnHtml = Object.entries(tabs).map(([t, lbl]) =>
        `<button id="cgTab_${t}" class="cg-tab-btn" data-subtab="${t}"
            style="flex:1;padding:8px 6px;font-size:11px;font-weight:600;border:none;cursor:pointer;
                   border-bottom:2px solid transparent;background:transparent;color:${color};">${lbl}</button>`
    ).join('');
    return `<div>
        <div style="display:flex;align-items:stretch;background:${bg};border-bottom:1px solid ${border};">${btnHtml}</div>
        <div style="padding:12px 14px;">
            <div id="cgTabBody_coupon" style="display:none;"></div>
            <div id="cgTabBody_replacement" style="display:none;"></div>
            <div id="cgTabBody_injection" style="display:none;"></div>
        </div>
    </div>`;
}

export function buildPerIsinPanel(portfolio, simResult) {
    const panel = document.getElementById('perIsinPanel');
    if (!panel) return;

    const isDark = document.body.classList.contains('dark');
    const bg     = isDark ? '#1e2338' : '#fff';
    const border = isDark ? '#2a2d45' : '#dde3ee';
    const tabBg  = isDark ? '#252840' : '#f0f4ff';
    const prevSubTab = panel._activeSubTab || 'coupon';

    if (state.scenarios.length > 0 && !state.scenarios.find(s => s.id === state.activeScenarioId)) {
        state.activeScenarioId = state.scenarios[0].id;
    }

    const scenTabHtml = state.scenarios.map(sc => {
        const isActive = sc.id === state.activeScenarioId;
        const actStyle = isActive
            ? `background:${bg};border-bottom:2px solid ${sc.color};font-weight:700;color:${isDark?'#e0e4ff':'#1a2a4a'};`
            : `background:transparent;border-bottom:2px solid transparent;font-weight:600;color:${isDark?'#8890b8':'#888'};`;
        return `<button class="cg-sc-tab" data-scid="${sc.id}" type="button"
            style="display:inline-flex;align-items:center;gap:6px;padding:8px 12px;cursor:pointer;font-size:12px;border:none;border-bottom:2px solid transparent;white-space:nowrap;background:transparent;${actStyle}"
            onclick="selectScenario('${sc.id}')">
            <span class="cg-sc-color-dot" style="width:9px;height:9px;border-radius:50%;background:${sc.color};flex-shrink:0;cursor:pointer;"
                title="Change color" onclick="event.stopPropagation();pickScenarioColor('${sc.id}',this)"></span>
            <span class="cg-sc-label" data-scid="${sc.id}"
                style="position:relative;min-width:40px;max-width:120px;overflow:hidden;white-space:nowrap;display:inline-block;vertical-align:middle;"
                ondblclick="event.stopPropagation();startTabRename('${sc.id}',this)">${sc.label}</span>
            <span onclick="event.stopPropagation();deleteScenario('${sc.id}')"
                title="Delete scenario"
                style="cursor:pointer;color:#999;font-size:13px;line-height:1;padding:0 1px;margin-left:2px;display:inline-block;"
                onmouseover="this.style.color='#e53935'" onmouseout="this.style.color='#999'">×</span>
        </button>`;
    }).join('');

    const newBtnStyle = `display:inline-flex;align-items:center;gap:4px;padding:8px 12px;cursor:pointer;font-size:12px;font-weight:600;background:transparent;border:none;border-bottom:2px solid transparent;color:${isDark?'#4a7cc7':'#1a73e8'};white-space:nowrap;`;

    // Ensure benchmark panel container exists after perIsinPanel
    let benchPanelEl = document.getElementById('cgNrBenchPanel');
    if (!benchPanelEl) {
        benchPanelEl = document.createElement('div');
        benchPanelEl.id = 'cgNrBenchPanel';
        panel.parentNode.insertBefore(benchPanelEl, panel.nextSibling);
    }

    panel.innerHTML = `
        <div class="cg-scenario-panel" style="padding:0;overflow:hidden;">
            <div style="display:flex;align-items:stretch;background:${tabBg};border-bottom:1px solid ${border};overflow-x:auto;gap:0;">
                ${scenTabHtml}
                <button onclick="addScenario()" style="${newBtnStyle}" title="Add new scenario">＋ New scenario</button>
                <div style="margin-left:auto;display:flex;align-items:center;gap:6px;padding:4px 12px;">
                    <button onclick="exportScenarios()" title="Export scenarios to JSON"
                        style="background:none;border:1px solid ${isDark?'#3a3f60':'#bbb'};color:${isDark?'#8890b8':'#666'};border-radius:4px;padding:3px 8px;font-size:10px;cursor:pointer;">↑ Export</button>
                    <button onclick="document.getElementById('cgScImport').click()" title="Import scenarios from JSON"
                        style="background:none;border:1px solid ${isDark?'#3a3f60':'#bbb'};color:${isDark?'#8890b8':'#666'};border-radius:4px;padding:3px 8px;font-size:10px;cursor:pointer;">↓ Import</button>
                    <input type="file" id="cgScImport" accept=".json" style="display:none" onchange="importScenarios(event)">
                </div>
            </div>
            ${state.scenarios.length === 0
                ? `<div style="padding:20px;text-align:center;color:#888;font-size:12px;">No scenarios yet. Click <strong>＋ New scenario</strong> to begin.</div>`
                : _buildSubTabHtml(isDark, border)
            }
        </div>`;

    panel._activeSubTab = prevSubTab;

    if (state.scenarios.length > 0) {
        panel.querySelectorAll('[data-subtab]').forEach(btn => {
            btn.addEventListener('click', () => switchScenarioSubTab(btn.dataset.subtab));
        });
        renderCouponTab(portfolio, simResult?.weightedSAY || 3, isDark, border);
        renderReplacementTab(portfolio, isDark, border);
        renderInjectionTab(portfolio, isDark, border);
        switchScenarioSubTab(prevSubTab);
    }
}

export function switchScenarioSubTab(tab) {
    const isDark     = document.body.classList.contains('dark');
    const activeSc   = state.scenarios.find(s => s.id === state.activeScenarioId);
    const activeColor = activeSc ? activeSc.color : (isDark ? '#5b8dee' : '#1a3a8c');
    ['coupon', 'replacement', 'injection'].forEach(t => {
        const btn  = document.getElementById(`cgTab_${t}`);
        const body = document.getElementById(`cgTabBody_${t}`);
        if (!btn || !body) return;
        const isActive = t === tab;
        btn.style.borderBottomColor = isActive ? activeColor : 'transparent';
        btn.style.color             = isActive ? activeColor : (isDark ? '#8890b8' : '#888');
        btn.style.fontWeight        = isActive ? '700' : '600';
        body.style.display          = isActive ? 'block' : 'none';
    });
    const panel = document.getElementById('perIsinPanel');
    if (panel) panel._activeSubTab = tab;
}

// ── Scenario CRUD ─────────────────────────────────────────────────────────────

export function addScenario() {
    if (state.scenarios.length >= 5) { alert('Maximum 5 scenarios supported.'); return; }
    const sc = defaultScenario(state.scenarios, state.lastPortfolio);
    state.scenarios.push(sc);
    state.activeScenarioId = sc.id;
    state.hiddenScenarioIds.delete(sc.id);
    state.scenariosDirty = true;
    buildPerIsinPanel(state.lastPortfolio, state.lastSimResult || { weightedSAY: 3 });
    triggerSimulation();
}

export function deleteScenario(id) {
    if (state.scenarios.length <= 1) {
        state.scenarios = [];
        state.activeScenarioId = null;
    } else {
        const idx = state.scenarios.findIndex(s => s.id === id);
        state.scenarios = state.scenarios.filter(s => s.id !== id);
        state.hiddenScenarioIds.delete(id);
        if (state.activeScenarioId === id) {
            state.activeScenarioId = state.scenarios[Math.max(0, idx-1)]?.id || state.scenarios[0]?.id || null;
        }
    }
    state.scenariosDirty = true;
    buildPerIsinPanel(state.lastPortfolio, state.lastSimResult || { weightedSAY: 3 });
    triggerSimulation();
}

export function selectScenario(id) {
    if (state.activeScenarioId === id) return;
    state.activeScenarioId = id;
    const panel = document.getElementById('perIsinPanel');
    const prevSubTab = panel?._activeSubTab || 'coupon';
    buildPerIsinPanel(state.lastPortfolio, state.lastSimResult || { weightedSAY: 3 });
    switchScenarioSubTab(prevSubTab);
    if (window._cgStatsRefresh) window._cgStatsRefresh();
}

export function renameScenario(id, newLabel) {
    const sc = state.scenarios.find(s => s.id === id);
    if (!sc || !newLabel || sc.label === newLabel) return;
    sc.label = newLabel;
    state.scenariosDirty = true;
    triggerSimulation();
}

export function pickScenarioColor(id, dotEl) {
    const sc  = state.scenarios.find(s => s.id === id);
    if (!sc) return;
    const idx = SCENARIO_COLORS.indexOf(sc.color);
    sc.color  = SCENARIO_COLORS[(idx + 1) % SCENARIO_COLORS.length];
    dotEl.style.background = sc.color;
    triggerSimulation();
}

// ── Sub-tab renderers ─────────────────────────────────────────────────────────

function _activeSc()        { return state.scenarios.find(s => s.id === state.activeScenarioId); }
function _activeScOrFirst() { return _activeSc() || state.scenarios[0]; }

function _rebuildPanel() {
    buildPerIsinPanel(state.lastPortfolio, state.lastSimResult || { weightedSAY: 3 });
}
function _rebuildCouponTab() {
    const isDark = document.body.classList.contains('dark');
    const border = isDark ? '#2a2d45' : '#dde3ee';
    renderCouponTab(state.lastPortfolio, state.lastSimResult?.weightedSAY || 3, isDark, border);
}
function _rebuildInjectionTab() {
    const isDark = document.body.classList.contains('dark');
    const border = isDark ? '#2a2d45' : '#dde3ee';
    renderInjectionTab(state.lastPortfolio, isDark, border);
}

export function renderCouponTab(portfolio, wSAY, isDark, border) {
    const el = document.getElementById('cgTabBody_coupon');
    if (!el) return;
    const sc = _activeScOrFirst();
    if (!sc) { el.innerHTML = '<p style="color:#888;font-size:12px;">No scenario selected.</p>'; return; }

    const inpSt = `font-size:11px;padding:3px 6px;border-radius:4px;border:1px solid ${border};background:${isDark?'#1e2338':'#fff'};color:inherit;`;
    const cr    = sc.couponReinvest;

    if (!cr.enabled) {
        el.innerHTML = `
            <p style="font-size:12px;color:#888;margin:0 0 10px;">Reinvest coupons into the same bond at a configured price.</p>
            <button class="cg-btn-secondary" style="font-size:12px;padding:6px 16px;"
                onclick="setCouponEnabled(true)">＋ Enable coupon reinvestment</button>`;
        return;
    }

    const overrideRows = portfolio.map(b => {
        const cfg    = cr.perIsin.get(b.isin) || {};
        const hasOvr = cr.perIsin.has(b.isin);
        const label  = portfolio.filter(x => x.issuer === b.issuer).length > 1
            ? `${b.issuer} <span style="font-family:monospace;font-size:9px;opacity:0.6">${b.isin}</span>` : b.issuer;
        return `<tr style="vertical-align:middle;">
            <td style="padding:5px 8px;">${label} <span style="font-size:9px;color:#888">(${(b.maturity||'').slice(0,4)})</span></td>
            <td style="padding:5px 8px;text-align:center;">
                <input type="checkbox" ${hasOvr?'checked':''} onchange="toggleCouponOverride('${b.isin}',this.checked)">
            </td>
            <td style="padding:5px 8px;text-align:center;">
                <input type="number" ${hasOvr?'':'disabled'} value="${cfg.priceShift??cr.globalPriceShift}" min="-500" max="500" step="1"
                    data-coupon-isin-shift="${b.isin}"
                    onchange="updateCouponOverride('${b.isin}','priceShift',parseFloat(this.value)||0)"
                    style="${inpSt}width:65px;text-align:right;">
            </td>
        </tr>`;
    }).join('');

    el.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
            <span style="font-size:11px;color:#888;">Weighted SAY: <strong style="color:#70c172;">${wSAY.toFixed(2)}%</strong></span>
            <button onclick="setCouponEnabled(false)"
                style="margin-left:auto;background:transparent;border:1px solid #c62828;color:#e57373;border-radius:4px;padding:3px 10px;font-size:11px;cursor:pointer;">Remove</button>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
            <thead><tr style="color:#888;">
                <th style="text-align:left;padding:4px 8px;">Bond</th>
                <th style="padding:4px 8px;text-align:center;">Override</th>
                <th style="padding:4px 8px;text-align:center;">Price shift %</th>
            </tr></thead>
            <tbody>
                <tr style="vertical-align:middle;opacity:0.7;">
                    <td style="padding:5px 8px;font-style:italic;">Global default</td>
                    <td style="padding:5px 8px;text-align:center;">—</td>
                    <td style="padding:5px 8px;text-align:center;">
                        <input type="number" value="${cr.globalPriceShift}" min="-500" max="500" step="1"
                            onchange="updateCouponGlobal(parseFloat(this.value)||0)"
                            style="${inpSt}width:65px;text-align:right;">
                    </td>
                </tr>
                ${overrideRows}
            </tbody>
        </table>
        <p style="font-size:10px;color:#888;margin-top:6px;">
            Effective SAY (global shift): <strong id="cgEffSAY" style="color:#70c172;">…%</strong>
        </p>`;

    // Async update effective SAY
    computeEffectiveSAY(portfolio, cr.globalPriceShift).then(say => {
        const el2 = document.getElementById('cgEffSAY');
        if (el2) el2.textContent = say.toFixed(2) + '%';
    });
}

export function renderReplacementTab(portfolio, isDark, border) {
    const el = document.getElementById('cgTabBody_replacement');
    if (!el) return;
    const sc = _activeScOrFirst();
    if (!sc) { el.innerHTML = '<p style="color:#888;font-size:12px;">No scenario selected.</p>'; return; }

    const inpSt = `font-size:11px;padding:3px 6px;border-radius:4px;border:1px solid ${border};background:${isDark?'#1e2338':'#fff'};color:inherit;`;
    const wSAY  = state.lastSimResult?.weightedSAY || 3;

    const rows = portfolio.map(b => {
        const matYear  = new Date(b.maturity).getFullYear();
        const label    = portfolio.filter(x => x.issuer === b.issuer).length > 1
            ? `${b.issuer} <span style="font-family:monospace;font-size:10px;opacity:0.7">${b.isin}</span>` : b.issuer;
        const cfg      = sc.maturityReplacement.get(b.isin);
        const enabled  = cfg?.enabled || false;
        const couponStr = typeof b.coupon === 'number' ? b.coupon.toFixed(2) + '%' : '—';

        if (!enabled) {
            return `<div style="padding:8px 0;border-bottom:1px solid ${border};display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                <span style="font-size:12px;font-weight:600;min-width:120px;">${label} <span style="font-family:monospace;font-size:10px;opacity:0.7">(${couponStr})</span></span>
                <span style="font-size:11px;color:#888;">matures ${matYear}</span>
                <button class="cg-btn-secondary" style="font-size:11px;padding:3px 10px;margin-left:auto;"
                    onclick="enableReplacement('${b.isin}')">＋ Add replacement</button>
            </div>`;
        }

        return `<div style="padding:8px 0;border-bottom:1px solid ${border};overflow-x:auto;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
                <span style="font-size:12px;font-weight:700;">${label} <span style="font-family:monospace;font-size:10px;opacity:0.7;font-weight:400;">(${couponStr})</span></span>
                <span style="font-size:11px;color:#888;">matures ${matYear} →</span>
                <button onclick="disableReplacement('${b.isin}')"
                    style="margin-left:auto;background:transparent;border:1px solid #c62828;color:#e57373;border-radius:4px;padding:3px 8px;font-size:11px;cursor:pointer;">Remove</button>
            </div>
            <div class="cg-repl-fields" style="display:flex;flex-wrap:wrap;gap:10px;padding-left:20px;font-size:11px;">
                <label style="display:flex;flex-direction:column;gap:3px;">
                    <span style="color:#888;font-size:10px;">Net coupon %</span>
                    <input type="number" value="${cfg.netCouponPct}" min="0" max="100" step="0.01"
                        onchange="updateReplacement('${b.isin}','netCouponPct',parseFloat(this.value)||0)"
                        style="${inpSt}width:80px;text-align:right;">
                </label>
                <label style="display:flex;flex-direction:column;gap:3px;">
                    <span style="color:#888;font-size:10px;">Price shift %</span>
                    <input type="number" value="${cfg.priceShift??0}" min="-500" max="500" step="1"
                        onchange="updateReplacement('${b.isin}','priceShift',parseFloat(this.value)||0)"
                        style="${inpSt}width:75px;text-align:right;">
                </label>
                <label style="display:flex;flex-direction:column;gap:3px;">
                    <span style="color:#888;font-size:10px;">New maturity year</span>
                    <input type="number" value="${cfg.maturityYear}" min="${new Date().getFullYear()+1}" max="2200" step="1"
                        onchange="updateReplacement('${b.isin}','maturityYear',parseInt(this.value)||${matYear+10})"
                        style="${inpSt}width:80px;text-align:center;">
                </label>
                <label style="display:flex;flex-direction:column;gap:3px;">
                    <span style="color:#888;font-size:10px;">Coupons</span>
                    ${sc.couponReinvest?.enabled
                        ? `<select onchange="updateReplacement('${b.isin}','reinvestCoupons',this.value==='true')" style="${inpSt}">
                            <option value="true"  ${cfg.reinvestCoupons?'selected':''}>Reinvest</option>
                            <option value="false" ${!cfg.reinvestCoupons?'selected':''}>Cash</option>
                           </select>`
                        : `<span style="font-size:11px;padding:3px 6px;color:#888;font-style:italic;">Cash</span>`
                    }
                </label>
            </div>
        </div>`;
    }).join('');

    el.innerHTML = `
        <p style="font-size:11px;color:#888;margin:0 0 10px;">When a bond matures, proceeds are reinvested into a new synthetic bond.</p>
        ${rows}`;
}

export function renderInjectionTab(portfolio, isDark, border) {
    const el = document.getElementById('cgTabBody_injection');
    if (!el) return;
    const sc = _activeScOrFirst();
    if (!sc) { el.innerHTML = '<p style="color:#888;font-size:12px;">No scenario selected.</p>'; return; }

    const inpSt = `font-size:11px;padding:3px 6px;border-radius:4px;border:1px solid ${border};background:${isDark?'#1e2338':'#fff'};color:inherit;`;
    const inj   = sc.injection;
    const sym   = cgSym();
    const today = new Date().getFullYear();
    const activeBonds = portfolio.filter(b => new Date(b.maturity).getFullYear() > today);
    const totalPct    = activeBonds.reduce((s, b) => s + (inj.pct[b.isin] ?? 0), 0);
    const lastYear    = portfolio.length ? Math.max(...portfolio.map(b => new Date(b.maturity).getFullYear())) : today + 10;

    const bondRows = activeBonds.map(b => {
        const matYear   = new Date(b.maturity).getFullYear();
        const couponStr = typeof b.coupon === 'number' ? b.coupon.toFixed(2) + '%' : '—';
        const label     = portfolio.filter(x => x.issuer === b.issuer).length > 1
            ? `${b.issuer} <span style="font-family:monospace;font-size:10px;opacity:0.7">${b.isin}</span>` : b.issuer;
        const pct     = inj.pct[b.isin] ?? (100 / Math.max(1, activeBonds.length));
        const isFixed = !!(inj.fixed && inj.fixed[b.isin]);
        return `<tr>
            <td style="padding:5px 8px;">${label} <span style="font-size:9px;color:#888">(${matYear})</span> <span style="font-size:9px;color:#90caf9;margin-left:4px;">${couponStr}</span></td>
            <td style="padding:5px 8px;text-align:center;">
                <span style="display:inline-flex;align-items:center;gap:2px;white-space:nowrap;">
                    <input type="number" value="${pct.toFixed(1)}" min="0" max="100" step="0.1"
                        onchange="updateInjectionPct('${b.isin}',parseFloat(this.value)||0)"
                        style="${inpSt}width:60px;text-align:right;" ${inj.enabled?'':'disabled'}>
                    <span style="font-size:10px;color:#888;">%</span>
                </span>
            </td>
            <td style="padding:5px 8px;text-align:center;">
                <input type="checkbox" title="Fix — not affected by Redistribute" ${isFixed?'checked':''} ${inj.enabled?'':'disabled'}
                    onchange="updateInjectionFixed('${b.isin}',this.checked)" style="cursor:pointer;accent-color:#90caf9;">
            </td>
        </tr>`;
    }).join('');

    el.innerHTML = `
        <div style="margin-bottom:14px;">
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;cursor:pointer;margin-bottom:10px;">
                <input type="checkbox" ${inj.enabled?'checked':''} onchange="setInjectionEnabled(this.checked)">
                Enable annual injection
            </label>
            <table style="border-collapse:collapse;font-size:12px;">
                <tr><td style="padding:3px 10px 3px 0;color:#888;white-space:nowrap;">${sym} per year</td>
                    <td><input type="number" value="${cgToBase(inj.amountEur).toFixed(0)}" min="0" step="100"
                        onchange="updateInjectionAmount(cgFromBase(parseFloat(this.value)||0))"
                        style="${inpSt}width:100px;text-align:right;" ${inj.enabled?'':'disabled'}></td></tr>
                <tr><td style="padding:3px 10px 3px 0;color:#888;white-space:nowrap;">From year</td>
                    <td><input type="number" value="${inj.from}" min="${today}" max="2200" step="1"
                        onchange="updateInjectionRange('from',parseInt(this.value)||${today})"
                        style="${inpSt}width:75px;text-align:center;" ${inj.enabled?'':'disabled'}></td></tr>
                <tr><td style="padding:3px 10px 3px 0;color:#888;white-space:nowrap;">To year</td>
                    <td><input type="number" value="${inj.to}" min="${today}" max="2200" step="1"
                        onchange="updateInjectionRange('to',parseInt(this.value)||${lastYear})"
                        style="${inpSt}width:75px;text-align:center;" ${inj.enabled?'':'disabled'}></td></tr>
            </table>
        </div>
        <p style="font-size:11px;color:#888;margin:0 0 8px;">Each year in [from, to], the amount is split across active bonds per the % below.</p>
        ${activeBonds.length ? `
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
            <thead><tr style="color:#888;">
                <th style="text-align:left;padding:4px 8px;">Bond</th>
                <th style="padding:4px 8px;text-align:center;">Allocation %</th>
                <th style="padding:4px 8px;text-align:center;" title="Fixed — not changed by Redistribute">Fixed</th>
            </tr></thead>
            <tbody>${bondRows}
            <tr><td colspan="3" style="padding:6px 8px;text-align:right;">
                <span style="font-size:10px;color:${Math.abs(totalPct-100)<0.5?'#70c172':'#ff7043'};margin-right:10px;">
                    Total: <strong>${totalPct.toFixed(1)}%</strong>${Math.abs(totalPct-100)>0.5?' — should sum to 100%':' ✓'}
                </span>
                <button onclick="redistributeInjectionPct()" ${inj.enabled?'':'disabled'}
                    style="font-size:11px;padding:3px 10px;cursor:pointer;border-radius:4px;background:transparent;
                           border:1px solid ${isDark?'#4a7cc7':'#1a73e8'};color:${isDark?'#90caf9':'#1a73e8'};">↺ Redistribute</button>
            </td></tr>
            </tbody>
        </table>` : '<p style="color:#888;font-size:11px;">No active bonds.</p>'}`;
}

// ── Coupon reinvest handlers ──────────────────────────────────────────────────
export function setCouponEnabled(enabled) { const sc=_activeSc();if(!sc)return;sc.couponReinvest.enabled=enabled;_rebuildPanel();triggerSimulation(); }
export function updateCouponGlobal(val) {
    const sc=_activeSc();if(!sc)return;
    sc.couponReinvest.globalPriceShift=val;
    document.querySelectorAll('input[data-coupon-isin-shift]').forEach(inp=>{
        inp.value=val;
        const isin=inp.dataset.couponIsinShift;
        if(sc.couponReinvest.perIsin.has(isin)) sc.couponReinvest.perIsin.get(isin).priceShift=val;
    });
    triggerSimulation();
}
export function toggleCouponOverride(isin,checked) {
    const sc=_activeSc();if(!sc)return;
    if(checked){ if(!sc.couponReinvest.perIsin.has(isin)) sc.couponReinvest.perIsin.set(isin,{priceShift:sc.couponReinvest.globalPriceShift}); }
    else sc.couponReinvest.perIsin.delete(isin);
    _rebuildCouponTab();triggerSimulation();
}
export function updateCouponOverride(isin,field,value) { const sc=_activeSc();if(!sc)return;const cfg=sc.couponReinvest.perIsin.get(isin);if(cfg){cfg[field]=value;triggerSimulation();} }

// ── Replacement handlers ──────────────────────────────────────────────────────
export function enableReplacement(isin) {
    const sc=_activeSc();if(!sc)return;
    const b=state.lastPortfolio.find(x=>x.isin===isin);if(!b)return;
    const matYear=new Date(b.maturity).getFullYear();
    const wSAY=state.lastSimResult?.weightedSAY||3;
    sc.maturityReplacement.set(isin,{enabled:true,_matYear:matYear,netCouponPct:Math.round(wSAY*100)/100,priceShift:0,maturityYear:matYear+10,reinvestCoupons:false});
    _rebuildPanel();triggerSimulation();
}
export function disableReplacement(isin) { const sc=_activeSc();if(!sc)return;sc.maturityReplacement.delete(isin);_rebuildPanel();triggerSimulation(); }
export function updateReplacement(isin,field,value) { const sc=_activeSc();if(!sc)return;const cfg=sc.maturityReplacement.get(isin);if(cfg){cfg[field]=value;triggerSimulation();} }

// ── Injection handlers ────────────────────────────────────────────────────────
export function setInjectionEnabled(enabled) {
    const sc=_activeSc();if(!sc)return;sc.injection.enabled=enabled;
    if(enabled&&state.lastPortfolio?.length){
        const today=new Date().getFullYear();
        const activeBonds=state.lastPortfolio.filter(b=>new Date(b.maturity).getFullYear()>today);
        const hasPct=activeBonds.some(b=>(sc.injection.pct[b.isin]??0)>0);
        if(!hasPct&&activeBonds.length>0){const defaultPct=+(100/activeBonds.length).toFixed(4);activeBonds.forEach(b=>{sc.injection.pct[b.isin]=defaultPct;});}
    }
    _rebuildInjectionTab();triggerSimulation();
}
export function updateInjectionAmount(amountEur) { const sc=_activeSc();if(!sc)return;sc.injection.amountEur=amountEur;triggerSimulation(); }
export function updateInjectionRange(field,value) { const sc=_activeSc();if(!sc)return;sc.injection[field]=value;triggerSimulation(); }
export function updateInjectionPct(isin,pct) { const sc=_activeSc();if(!sc)return;sc.injection.pct[isin]=pct;_rebuildInjectionTab();triggerSimulation(); }
export function updateInjectionFixed(isin,fixed) {
    const sc=_activeSc();if(!sc)return;if(!sc.injection.fixed)sc.injection.fixed={};
    if(fixed)sc.injection.fixed[isin]=true;else delete sc.injection.fixed[isin];_rebuildInjectionTab();
}
export function redistributeInjectionPct() {
    const sc=_activeSc();if(!sc)return;
    const today=new Date().getFullYear();
    const activeBonds=(state.lastPortfolio||[]).filter(b=>new Date(b.maturity).getFullYear()>today);
    if(!activeBonds.length)return;
    const inj=sc.injection;if(!inj.fixed)inj.fixed={};
    const fixedBonds=activeBonds.filter(b=>inj.fixed[b.isin]);
    const freeBonds =activeBonds.filter(b=>!inj.fixed[b.isin]);
    const usedPct   =fixedBonds.reduce((s,b)=>s+(inj.pct[b.isin]??0),0);
    const remaining =Math.max(0,100-usedPct);
    if(freeBonds.length>0){const each=+(remaining/freeBonds.length).toFixed(4);freeBonds.forEach(b=>{inj.pct[b.isin]=each;});}
    _rebuildInjectionTab();triggerSimulation();
}

// ── Export / Import ───────────────────────────────────────────────────────────
export function exportScenarios() {
    const data        = scenariosToJson(state.scenarios, state.lastPortfolio);
    const blob        = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a           = document.createElement('a');
    a.href            = URL.createObjectURL(blob);
    a.download        = `bondfx-scenarios-${data.exportedAt.replace(/[T:]/g,'-').slice(0,19)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    state.scenariosDirty = false;
}

export function importScenarios(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const data    = JSON.parse(e.target.result);
            const isDark  = document.body.classList.contains('dark');
            const { newScenarios, feedback } = scenariosFromJson(data, state.lastPortfolio, isDark);
            state.scenarios        = newScenarios;
            state.activeScenarioId = state.scenarios[0]?.id || null;
            _showImportFeedback(feedback);
            state.scenariosDirty = false;
            buildPerIsinPanel(state.lastPortfolio, state.lastSimResult || { weightedSAY: 3 });
            triggerSimulation();
        } catch(err) { alert('Import failed: ' + err.message); }
        event.target.value = '';
    };
    reader.readAsText(file);
}

function _showImportFeedback(htmlContent) {
    const old = document.getElementById('cgImportFeedback');
    if (old) old.remove();
    const isDark = document.body.classList.contains('dark');
    const div    = document.createElement('div');
    div.id       = 'cgImportFeedback';
    div.style.cssText = `position:fixed;top:60px;right:20px;z-index:9999;max-width:480px;min-width:280px;
        background:${isDark?'#1e2338':'#fff'};border:1px solid ${isDark?'#4a7cc7':'#1a73e8'};
        border-radius:8px;padding:14px 16px 14px 14px;font-size:12px;
        box-shadow:0 4px 24px rgba(0,0,0,0.25);color:${isDark?'#c0c8e8':'#1a2a4a'};
        max-height:70vh;overflow-y:auto;line-height:1.5;`;
    div.innerHTML =
        `<button onclick="this.parentElement.remove()"
            style="float:right;background:none;border:none;font-size:18px;cursor:pointer;color:#888;line-height:1;margin-left:8px;" title="Close">×</button>
         <strong style="font-size:12px;">📥 Import Report</strong>
         <hr style="border:none;border-top:1px solid ${isDark?'#2a2d45':'#e0e5f0'};margin:8px 0;">
         ${htmlContent}`;
    document.body.appendChild(div);
    const hasIssues = htmlContent.includes('⛔') || htmlContent.includes('⚠️') || htmlContent.includes('➕');
    if (!hasIssues) setTimeout(() => div?.remove(), 5000);
}

// ── ETF Benchmark ─────────────────────────────────────────────────────────────

export async function fetchBenchmark(symbol, horizonYears) {
    if (state.benchmarkCache[symbol]) return state.benchmarkCache[symbol];
    const range = `${Math.min(Math.max(horizonYears+1,5),10)}y`;
    try {
        const res  = await fetch(`/api/benchmark?symbol=${encodeURIComponent(symbol)}&range=${range}`);
        if (!res.ok) { console.warn('Benchmark HTTP', res.status, symbol); return null; }
        const json = await res.json();
        if (json?.chart?.error) return null;
        const chart = json?.chart?.result?.[0];
        if (!chart) return null;
        const ts     = chart.timestamp;
        const rawArr = chart.indicators?.adjclose?.[0]?.adjclose || chart.indicators?.quote?.[0]?.close || [];
        const closes = rawArr.map(v => (v&&typeof v==='object') ? (v.parsedValue??null) : v);
        let baseline = null;
        const normed = [];
        for (let i=0;i<ts.length;i++) {
            const c=closes[i]; if(c==null||!isFinite(c))continue;
            if(baseline===null)baseline=c;
            normed.push({date:new Date(ts[i]*1000),pct:(c/baseline-1)*100});
        }
        if(!normed.length)return null;
        state.benchmarkCache[symbol]=normed; return normed;
    } catch(e) { console.warn('Benchmark fetch failed:',symbol,e.message); return null; }
}

export async function toggleBenchmark(id, symbol, label, color, checked) {
    const errEl = document.getElementById(`bench-err-${id}`);
    if (!checked) {
        if(state.chart){state.chart.data.datasets=state.chart.data.datasets.filter(d=>d._benchmarkId!==id);state.chart.update();}
        if(errEl)errEl.textContent=''; return;
    }
    if(errEl)errEl.textContent='⏳';
    const raw = await fetchBenchmark(symbol, state.lastSimResult?.years?.length||10);
    if(!raw||!raw.length){if(errEl)errEl.textContent='(no data)';return;}
    if(errEl)errEl.textContent='';
    if(!state.chart||!state.lastStartCapital)return;
    const base0      = cgToBase(state.lastStartCapital);
    const simYears   = state.chart.data.labels;
    const totalPct   = raw[raw.length-1].pct;
    const spanYears  = (raw[raw.length-1].date-raw[0].date)/(365.25*24*3600*1000);
    const cagr       = spanYears>0?Math.pow(1+totalPct/100,1/spanYears)-1:0;
    const startYear  = simYears[0];
    const yearlyData = simYears.map(yr=>base0*Math.pow(1+cagr,yr-startYear));
    state.chart.data.datasets=state.chart.data.datasets.filter(d=>d._benchmarkId!==id);
    state.chart.data.datasets.push({
        _benchmarkId:id, label:`${label} (${(cagr*100).toFixed(1)}% CAGR)`,
        data:yearlyData, borderColor:color, backgroundColor:color+'14',
        borderWidth:1.5, borderDash:[4,3], pointRadius:0, tension:0.3, fill:false, spanGaps:true,
    });
    state.chart.update();
}
