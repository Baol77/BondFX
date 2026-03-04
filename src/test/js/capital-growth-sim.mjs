/**
 * capital-growth-sim.mjs — Headless BondFX simulation runner (v6, refactored).
 *
 * Reads test-input JSON from argv[2] or stdin. Writes JSON to stdout.
 *
 * Imports pure-logic modules directly — no DOM patching, no tmp-file splicing.
 */

import { readFileSync } from 'fs';

// ── 1. Node.js stubs for modules that reference browser globals ───────────────
// ComputeCache references nothing browser-specific.
// FxCurveStore references fetch — we override it below before importing.
// SimulationEngine only references fxCurveGet from FxCurveStore and computeCache.

// Stub fetch so FxCurveStore can be imported (prefetchFxCurves won't be called).
global.fetch = () => Promise.reject(new Error('fetch not available in headless runner'));
global.localStorage = { getItem: () => null };

// ── 2. Import engine modules ──────────────────────────────────────────────────
// Paths are relative to this file's location (next to the src/ tree or adjust as needed).
const { fxCurveCache }                                          = await import('../../main/resources/static/js/core/FxCurveStore.js');
const { computeCache }                                          = await import('../../main/resources/static/js/core/ComputeCache.js');
const { buildSlots, _scenarioToSimArgs, _buildInjectionByYear,
        _runScenarioSim }                                       = await import('../../main/resources/static/js/core/SimulationEngine.js');

// ── 3. OU FX model (mirrors FxService.java) ───────────────────────────────────
const OU_PROFILES = {
    DKK:{vol:0.002,kappa:1.00,cap:0.03}, BGN:{vol:0.001,kappa:1.00,cap:0.02},
    CHF:{vol:0.054,kappa:0.13,cap:0.35}, SEK:{vol:0.055,kappa:0.13,cap:0.40},
    NOK:{vol:0.075,kappa:0.13,cap:0.55}, CAD:{vol:0.078,kappa:0.13,cap:0.40},
    NZD:{vol:0.075,kappa:0.13,cap:0.40}, USD:{vol:0.091,kappa:0.13,cap:0.50},
    GBP:{vol:0.075,kappa:0.13,cap:0.45}, JPY:{vol:0.107,kappa:0.13,cap:0.55},
    AUD:{vol:0.097,kappa:0.13,cap:0.45}, PLN:{vol:0.076,kappa:0.13,cap:0.45},
    HUF:{vol:0.049,kappa:0.10,cap:0.60}, CZK:{vol:0.039,kappa:0.10,cap:0.25},
    TRY:{vol:0.177,kappa:0.05,cap:0.85}, ZAR:{vol:0.156,kappa:0.10,cap:0.80},
    BRL:{vol:0.157,kappa:0.08,cap:0.82}, MXN:{vol:0.097,kappa:0.10,cap:0.65},
};
const OU_DEFAULT = { vol: 0.10, kappa: 0.13, cap: 0.55 };
const Z_95       = 1.645;

function ouMultiplier(currency, reportCcy, horizonYears) {
    if (!currency || currency === reportCcy) return 1.0;
    const p = OU_PROFILES[currency.toUpperCase()] || OU_DEFAULT;
    if (horizonYears <= 0) return 1.0;
    const tEff = (1.0 - Math.exp(-2.0 * p.kappa * horizonYears)) / (2.0 * p.kappa);
    return 1.0 - Math.min(p.vol * Math.sqrt(tEff) * Z_95, p.cap);
}

// ── 4. Read input ─────────────────────────────────────────────────────────────
const rawInput = process.argv[2] ? readFileSync(process.argv[2], 'utf8') : readFileSync('/dev/stdin', 'utf8');
const input    = JSON.parse(rawInput);

const portfolio   = input.portfolioSnapshot;
const scenarios   = input.scenarios;
const verifyYears = new Set(input.verifyYears || []);

if (!portfolio?.length) throw new Error('portfolioSnapshot missing or empty');
if (!scenarios?.length)  throw new Error('scenarios missing or empty');

// ── 5. Populate computeCache with snapshot data ───────────────────────────────
// The headless runner receives pre-computed bond data in the snapshot
// (fxBuy, coupon, etc.), so we seed computeCache directly.
portfolio.forEach(b => {
    computeCache.set(b.isin, {
        isin:        b.isin,
        say:         b.say         ?? 0,
        finalCapital: b.finalCapital ?? 0,
        fxBuy:       b.fxBuy       ?? 1.0,
        fxCoupon:    b.fxCoupon    ?? 1.0,
        fxFuture:    b.fxFuture    ?? 1.0,
        nomEur:      b.nomEur      ?? 100,
        capCoupons:  b.capCoupons  ?? 0,
        capGain:     b.capGain     ?? 0,
        yearsToMat:  b.yearsToMat  ?? 0,
    });
});

// ── 6. Pre-populate FX curve cache (OU model, no REST calls) ─────────────────
const startCapital = portfolio.reduce((s, b) => s + (b.investedEur || 0), 0);
const simStartYear = new Date().getFullYear();
const reportCcy    = 'EUR';
const ccyMaxYear   = new Map();

portfolio.forEach(b => {
    if (!b.currency || b.currency === reportCcy) return;
    const matYear = new Date(b.maturity).getFullYear();
    ccyMaxYear.set(b.currency, Math.max(ccyMaxYear.get(b.currency) || 0, matYear));
});

for (const [ccy, maxYear] of ccyMaxYear.entries()) {
    for (let h = 0; h <= Math.max(1, maxYear - simStartYear); h++) {
        fxCurveCache.set(`${ccy}_${reportCcy}_h${h}`, {
            multiplier: ouMultiplier(ccy, reportCcy, h),
            expiresAt:  Infinity,
        });
    }
}

// ── 7. Normalise scenarios (JSON Maps → real Maps) ────────────────────────────
function normaliseScenario(sc) {
    return {
        ...sc,
        couponReinvest: {
            ...sc.couponReinvest,
            perIsin: new Map(Object.entries(sc.couponReinvest?.perIsin || {})),
        },
        maturityReplacement: new Map(Object.entries(sc.maturityReplacement || {})),
    };
}

// ── 8. Run simulation ─────────────────────────────────────────────────────────
const output = { scenarioResults: [] };

for (const rawSc of scenarios) {
    const sc     = normaliseScenario(rawSc);
    const result = _runScenarioSim(sc, portfolio, startCapital, reportCcy);
    if (!result) continue;

    const { yearEvents, scale } = result;
    const years = [];

    for (const ev of yearEvents) {
        if (verifyYears.size > 0 && !verifyYears.has(ev.yr)) continue;

        const perSlot = (ev.perSlot || []).map(s => ({
            isin:          s.isin,
            issuer:        s.issuer,
            isReplacement: !!s._isReplacement,
            matYear:       s.matYear ?? null,
            coupon:        Math.round((s.coupon     || 0) * scale),
            replCoupon:    Math.round((s.replCoupon || 0) * scale),
            redemption:    Math.round((s.redemption || 0) * scale),
            portVal:       Math.round((s.portVal    || 0) * scale),
            reinvested:    Math.round((s.reinvested || 0) * scale),
        }));

        years.push({
            yr:                   ev.yr,
            coupons:              Math.round((ev.coupons     || 0) * scale),
            redemptions:          Math.round((ev.redemptions || 0) * scale),
            reinvested:           Math.round((ev.reinvested  || 0) * scale),
            replCoupons:          Math.round((ev.replCoupons || 0) * scale),
            bondsVal:             Math.round((ev.bondsVal    || 0) * scale),
            cash:                 Math.round((ev.cash        || 0) * scale),
            replacementActivated: !!ev.replacementActivated,
            perSlot,
        });
    }

    output.scenarioResults.push({ id: rawSc.id, label: rawSc.label, years });
}

// ── 9. Write output ───────────────────────────────────────────────────────────
process.stdout.write(JSON.stringify(output, null, 2) + '\n');
