/**
 * capital-growth-sim.mjs — Headless BondFX simulation runner.
 * Reads test-input JSON from argv[2] or stdin. Writes JSON to stdout.
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath }               from 'url';
import { tmpdir }                      from 'os';
import { join }                        from 'path';
import { pathToFileURL }               from 'url';
import path                            from 'path';

// ─── 1. Load only the simulation engine (lines 1..UI_START) ──────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const enginePath = path.resolve(__dirname, '../../main/resources/static/js/capital-growth.js');
const engineFull = readFileSync(enginePath, 'utf8');

// The engine (pure simulation functions) ends just before the UI state block.
// We detect the boundary by finding the first occurrence of the UI state sentinel.
// The engine has two pure-logic segments:
//   Segment A: lines 1..(_scenarios state block) — core sim functions
//   Segment B: _scenarioToSimArgs, _buildInjectionByYear, _runScenarioSim (after UI state)
// We splice them together, skipping the UI state/DOM block in the middle.
const SEG_A_END   = '\nlet _scenarios       = [];';
const SEG_B_START = '\nfunction _scenarioToSimArgs(';
const SEG_B_END   = '\n// Master simulate — runs no_reinvest baseline + all user scenarios';

const idxAEnd   = engineFull.indexOf(SEG_A_END);
const idxBStart = engineFull.indexOf(SEG_B_START);
const idxBEnd   = engineFull.indexOf(SEG_B_END);

if (idxAEnd === -1)   throw new Error('SEG_A_END not found');
if (idxBStart === -1) throw new Error('SEG_B_START not found');
if (idxBEnd === -1)   throw new Error('SEG_B_END not found');

const engineSrc = engineFull.slice(0, idxAEnd) + engineFull.slice(idxBStart, idxBEnd);

// ─── 2. OU FX model (mirrors FxService.java) ─────────────────────────────────

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
const OU_DEFAULT = {vol:0.10,kappa:0.13,cap:0.55};
const Z_95 = 1.645;

function ouMultiplier(currency, reportCcy, horizonYears) {
    if (!currency || currency === reportCcy) return 1.0;
    const p = OU_PROFILES[currency.toUpperCase()] || OU_DEFAULT;
    if (horizonYears <= 0) return 1.0;
    const tEff = (1.0 - Math.exp(-2.0 * p.kappa * horizonYears)) / (2.0 * p.kappa);
    return 1.0 - Math.min(p.vol * Math.sqrt(tEff) * Z_95, p.cap);
}

// ─── 3. Build engine module: stubs + engine source + exports ─────────────────

const nodeStubs = `
// Node.js stubs replacing browser-only globals
const _ls_ = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
function _cgBaseCcy()   { return 'EUR'; }
function _cgToBase(v)   { return v; }
function _cgFromBase(v) { return v; }
`;

// Replace localStorage references in engine source
const patchedEngine = engineSrc
    .replace(/\blocalStorage\b/g, '_ls_')
    // Override _cgBaseCcy/_cgToBase/_cgFromBase which are redeclared as functions in engine
    // They reference localStorage so we patch them out by renaming the engine versions
    .replace(/^function _cgBaseCcy\b/m,   'function _cgBaseCcyBrowser')
    .replace(/^function _cgToBase\b/m,    'function _cgToBaseBrowser')
    .replace(/^function _cgFromBase\b/m,  'function _cgFromBaseBrowser')
    .replace(/^function _cgSym\b/m,       'function _cgSymBrowser')
    .replace(/^function _cgFmt\b/m,       'function _cgFmtBrowser')
    .replace(/^async function _cgLoadFxRates\b/m,    'async function _cgLoadFxRatesBrowser')
    .replace(/^async function _computePortfolio\b/m, 'async function _computePortfolioBrowser')
    .replace(/^async function _prefetchFxCurves\b/m, 'async function _prefetchFxCurvesBrowser')
    .replace(/^async function _fetchFxCurve\b/m,     'async function _fetchFxCurveBrowser')
    .replace(/^function loadPortfolio\b/m,           'function _loadPortfolioBrowser');

const moduleSrc = nodeStubs + '\n' + patchedEngine + '\n' +
    'export { buildSlots, _scenarioToSimArgs, _buildInjectionByYear, _runScenarioSim, _fxCurveCache };\n';

const tmpPath = join(tmpdir(), '_cg_sim_engine_' + process.pid + '.mjs');
writeFileSync(tmpPath, moduleSrc);

const {
    buildSlots, _scenarioToSimArgs, _buildInjectionByYear, _runScenarioSim, _fxCurveCache,
} = await import(pathToFileURL(tmpPath).href);

// ─── 4. Read input ────────────────────────────────────────────────────────────

const rawInput = process.argv[2] ? readFileSync(process.argv[2], 'utf8') : readFileSync('/dev/stdin', 'utf8');
const input    = JSON.parse(rawInput);

const portfolio   = input.portfolioSnapshot;
const scenarios   = input.scenarios;
const verifyYears = new Set(input.verifyYears || []);

if (!portfolio?.length) throw new Error('portfolioSnapshot missing or empty');
if (!scenarios?.length)  throw new Error('scenarios missing or empty');

const startCapital = portfolio.reduce((s, b) => s + (b.investedEur || 0), 0);

// ─── 5. Pre-populate FX curve cache (OU model, no REST calls) ────────────────

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
        _fxCurveCache.set(`${ccy}_${reportCcy}_h${h}`, {
            multiplier: ouMultiplier(ccy, reportCcy, h),
            expiresAt:  Infinity,
        });
    }
}

// ─── 6. Run simulation ────────────────────────────────────────────────────────

function normaliseScenario(sc) {
    return {
        ...sc,
        couponReinvest: { ...sc.couponReinvest, perIsin: new Map(Object.entries(sc.couponReinvest.perIsin || {})) },
        maturityReplacement: new Map(Object.entries(sc.maturityReplacement || {})),
    };
}

const output = { scenarioResults: [] };

for (const rawSc of scenarios) {
    const sc     = normaliseScenario(rawSc);
    const result = _runScenarioSim(sc, portfolio, startCapital);
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

// ─── 7. Write output ─────────────────────────────────────────────────────────

process.stdout.write(JSON.stringify(output, null, 2) + '\n');
