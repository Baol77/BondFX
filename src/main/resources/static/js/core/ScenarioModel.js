'use strict';
/**
 * ScenarioModel — scenario state model and CRUD helpers.
 * No DOM, no fetch, no localStorage.
 */

export const SCENARIO_COLORS = [
    '#9e9e9e', '#1e88e5', '#e53935', '#43a047', '#ff6d00',
    '#8e24aa', '#00897b', '#f4511e', '#1565c0', '#558b2f',
];

export const SCENARIO_PALETTE = SCENARIO_COLORS; // alias used by older code

/** Generate a unique scenario ID not already in the list. */
export function nextScenarioId(scenarios) {
    let i = 1;
    while (scenarios.find(s => s.id === 'sc_' + i)) i++;
    return 'sc_' + i;
}

/** Pick the first color not already in use. */
export function nextScenarioColor(scenarios) {
    for (const c of SCENARIO_COLORS) {
        if (!scenarios.find(s => s.color === c)) return c;
    }
    return SCENARIO_COLORS[scenarios.length % SCENARIO_COLORS.length];
}

/** Create a blank scenario object with sensible defaults. */
export function defaultScenario(scenarios, portfolio) {
    const today    = new Date().getFullYear();
    const lastYear = portfolio.length
        ? Math.max(...portfolio.map(b => new Date(b.maturity).getFullYear()))
        : today + 10;
    return {
        id:    nextScenarioId(scenarios),
        label: 'Scenario ' + (scenarios.length + 1),
        color: nextScenarioColor(scenarios),
        couponReinvest: { enabled: false, globalPriceShift: 0, perIsin: new Map() },
        maturityReplacement: new Map(),
        injection: {
            enabled: false, amountEur: 1000,
            from: today, to: lastYear, pct: {}, fixed: {},
        },
        _autoDefault: false,
    };
}

/**
 * Flatten _scenarios into the list of all maturity-replacement configs.
 * Used by bond-timeline, year-detail modal and coupon chart.
 */
export function getAllMatReplacementCs(scenarios) {
    const result = [];
    for (const sc of scenarios) {
        sc.maturityReplacement.forEach((cfg, isin) => {
            if (!cfg.enabled) return;
            result.push({
                id:              sc.id + '_mr_' + isin,
                _type:           'maturity_replacement',
                name:            sc.label,
                sourceBond:      { isin, matYear: cfg._matYear || 0 },
                netCouponPct:    cfg.netCouponPct,
                priceShift:      cfg.priceShift,
                maturityYear:    cfg.maturityYear,
                reinvestCoupons: cfg.reinvestCoupons,
            });
        });
    }
    return result;
}

/**
 * Serialize scenarios for JSON export.
 * Maps → plain objects so JSON.stringify works.
 */
export function scenariosToJson(scenarios, portfolio) {
    const exportedAt        = new Date().toISOString();
    const portfolioSnapshot = portfolio.map(b => ({
        isin: b.isin, issuer: b.issuer, quantity: b.quantity,
        investedEur: b.totalEur || (b.priceEur || 0) * b.quantity,
        priceEur: b.priceEur, coupon: b.coupon, taxRate: b.taxRate, maturity: b.maturity,
    }));
    const scenariosJson = scenarios.map(sc => ({
        id: sc.id, label: sc.label, color: sc.color,
        couponReinvest: {
            enabled:          sc.couponReinvest.enabled,
            globalPriceShift: sc.couponReinvest.globalPriceShift,
            perIsin:          Object.fromEntries(sc.couponReinvest.perIsin),
        },
        maturityReplacement: Object.fromEntries(sc.maturityReplacement),
        injection: { ...sc.injection, fixed: sc.injection.fixed || {} },
    }));
    return { bondFxVersion: '6.0', exportedAt, portfolioSnapshot, scenarios: scenariosJson };
}

/**
 * Deserialize scenarios from imported JSON, reconciling against current portfolio.
 * Returns { newScenarios, feedback } where feedback is an HTML string.
 */
export function scenariosFromJson(data, portfolio, isDark) {
    const currentIsins = new Set(portfolio.map(b => b.isin));
    const snapMap      = new Map((data.portfolioSnapshot || []).map(s => [s.isin, s]));
    const sym          = '€';
    const fmt          = v => sym + (v == null ? '?' : Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 }));

    const removedIsins = [...snapMap.keys()].filter(isin => !currentIsins.has(isin));
    const addedIsins   = [...currentIsins].filter(isin => !snapMap.has(isin));

    const TRACKED_FIELDS = [
        { key: 'quantity',    label: 'Qty',         fmt: v => v == null ? '?' : Number(v).toLocaleString(undefined,{maximumFractionDigits:4}) },
        { key: 'investedEur', label: 'Invested',    fmt },
        { key: 'priceEur',    label: 'Price (EUR)', fmt: v => v == null ? '?' : Number(v).toFixed(4) },
        { key: 'coupon',      label: 'Coupon %',    fmt: v => v == null ? '?' : Number(v).toFixed(4) + '%' },
        { key: 'taxRate',     label: 'Tax %',       fmt: v => v == null ? '?' : Number(v).toFixed(2) + '%' },
        { key: 'maturity',    label: 'Maturity',    fmt: v => v ?? '?' },
    ];

    const changedIsins = [];
    [...currentIsins].filter(isin => snapMap.has(isin)).forEach(isin => {
        const snap    = snapMap.get(isin);
        const current = portfolio.find(b => b.isin === isin);
        if (!current) return;
        const diffs = [];
        TRACKED_FIELDS.forEach(({ key, label, fmt: fmtFn }) => {
            let curVal  = current[key];
            if (key === 'investedEur') curVal = current.totalEur || (current.priceEur || 0) * current.quantity;
            const snapVal = snap[key];
            if (snapVal == null && curVal == null) return;
            const snapN = parseFloat(snapVal), curN = parseFloat(curVal);
            const bothNum = !isNaN(snapN) && !isNaN(curN);
            const changed = bothNum ? Math.abs(snapN - curN) > 0.0001 : String(snapVal) !== String(curVal);
            if (changed) diffs.push({ label, old: fmtFn(snapVal), new: fmtFn(curVal) });
        });
        if (diffs.length) changedIsins.push({ isin, issuer: current.issuer || isin, diffs });
    });

    const droppedReplByScenario = [];
    let imported = 0;

    // We need nextScenarioId which requires the running scenarios array.
    // Since we're rebuilding from scratch, we build incrementally.
    const newScenarios = [];

    (data.scenarios || []).forEach(s => {
        const replMap    = new Map();
        const droppedRep = [];
        Object.entries(s.maturityReplacement || {}).forEach(([isin, cfg]) => {
            if (currentIsins.has(isin)) replMap.set(isin, cfg);
            else droppedRep.push(isin);
        });
        if (droppedRep.length) droppedReplByScenario.push({ scenLabel: s.label, isins: droppedRep });

        const perIsinMap = new Map();
        Object.entries(s.couponReinvest?.perIsin || {}).forEach(([isin, cfg]) => {
            if (currentIsins.has(isin)) perIsinMap.set(isin, cfg);
        });

        imported++;
        newScenarios.push({
            id:    s.id || nextScenarioId(newScenarios),
            label: s.label || 'Imported scenario',
            color: s.color || nextScenarioColor(newScenarios),
            couponReinvest: {
                enabled:          s.couponReinvest?.enabled || false,
                globalPriceShift: s.couponReinvest?.globalPriceShift || 0,
                perIsin:          perIsinMap,
            },
            maturityReplacement: replMap,
            injection: s.injection
                ? { ...s.injection, fixed: s.injection.fixed || {} }
                : { enabled: false, amountEur: 1000,
                    from: new Date().getFullYear(), to: new Date().getFullYear() + 10, pct: {}, fixed: {} },
        });
    });

    // ── Build feedback HTML ──────────────────────────────────────────────────
    const ok   = isDark ? '#70c172' : '#2e7d32';
    const warn = isDark ? '#ffd740' : '#e65100';
    const info = isDark ? '#90caf9' : '#1565c0';
    const muted = isDark ? '#8890b8' : '#888';

    const section = (icon, color, title, body) =>
        `<div style="margin-top:10px;">
            <div style="font-weight:700;color:${color};font-size:12px;">${icon} ${title}</div>
            <div style="margin-top:4px;font-size:11px;color:${isDark?'#c0c8e8':'#333'};padding-left:14px;">${body}</div>
        </div>`;

    let html = `<div style="font-weight:700;font-size:13px;margin-bottom:6px;color:${ok};">
        ✓ ${imported} scenario${imported !== 1 ? 's' : ''} imported
        <span style="font-size:10px;color:${muted};font-weight:400;"> — exported ${data.exportedAt || '?'}</span>
    </div>`;

    if (removedIsins.length) {
        const rows = removedIsins.map(isin => {
            const snap   = snapMap.get(isin);
            const label  = snap?.issuer ? `${snap.issuer} (${isin})` : isin;
            const detail = snap ? ` — was ${fmt(snap.investedEur)} invested, qty ${snap.quantity}, mat. ${(snap.maturity||'').slice(0,7)}` : '';
            return `<div>• ${label}${detail}</div>`;
        }).join('');
        const affected = droppedReplByScenario.map(x => `<em>${x.scenLabel}</em>: ${x.isins.join(', ')}`).join('; ');
        html += section('⛔', warn,
            `${removedIsins.length} bond${removedIsins.length!==1?'s':''} removed from portfolio since export`,
            rows + (affected ? `<div style="margin-top:4px;color:${warn};">Dropped replacements in: ${affected}</div>` : ''));
    }
    if (addedIsins.length) {
        const rows = addedIsins.map(isin => {
            const b = portfolio.find(x => x.isin === isin);
            return `<div>• ${b ? `${b.issuer} (${isin})` : isin} — using defaults</div>`;
        }).join('');
        html += section('➕', info, `${addedIsins.length} new bond${addedIsins.length!==1?'s':''} in portfolio`, rows);
    }
    if (changedIsins.length) {
        const rows = changedIsins.map(({ isin, issuer, diffs }) => {
            const diffStr = diffs.map(d =>
                `${d.label}: <span style="color:${warn}">${d.old}</span> → <span style="color:${ok}">${d.new}</span>`
            ).join('  ·  ');
            return `<div>• ${issuer} (${isin}): ${diffStr}</div>`;
        }).join('');
        html += section('⚠️', warn, `${changedIsins.length} bond${changedIsins.length!==1?'s':''} changed since export`, rows);
    }
    if (!removedIsins.length && !addedIsins.length && !changedIsins.length) {
        html += `<div style="margin-top:8px;font-size:11px;color:${ok};">✓ Portfolio matches snapshot exactly.</div>`;
    }

    return { newScenarios, feedback: html };
}
