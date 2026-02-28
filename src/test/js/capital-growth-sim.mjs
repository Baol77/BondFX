/**
 * capital-growth-sim.mjs
 *
 * Headless BondFX simulation runner.
 * Reads a test-input JSON from stdin (or file path as argv[2]).
 * Writes simulation results as JSON to stdout.
 *
 * Usage:
 *   node capital-growth-sim.mjs < cg-test-input.json
 *   node capital-growth-sim.mjs cg-test-input.json
 *
 * Input schema:
 *   portfolioSnapshot  — array of bond objects (BondFX export format)
 *   scenarios          — array of scenario objects (BondFX export format)
 *   verifyYears        — array of years to include in output (e.g. [2028, 2029, 2038])
 *
 * Output schema:
 *   { scenarioResults: [ { id, label, years: [ YearResult ] } ] }
 *
 * YearResult:
 *   yr, coupons, redemptions, reinvested, replCoupons, bondsVal,
 *   replacementActivated,
 *   perSlot: [ { isin, issuer, isReplacement, matYear,
 *                coupon, replCoupon, redemption, portVal, reinvested } ]
 *
 * All monetary values are in EUR, already scaled to startCapital.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

// ─── 1. Load engine ───────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const enginePath = path.resolve(
  __dirname,
  '../../main/resources/static/js/capital-growth.js'
);

const engineSrc = readFileSync(enginePath, 'utf8');


// Extract individual engine functions by brace-counting (avoids pulling in UI globals)
function extractFn(source, fname) {
    const pat = new RegExp('\\nfunction ' + fname + '\\s*\\(');
    const m = pat.exec(source);
    if (!m) throw new Error('Engine function not found: ' + fname);
    let depth = 0, i = m.index + 1;
    while (i < source.length) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') { depth--; if (depth === 0) return source.slice(m.index + 1, i + 1); }
        i++;
    }
    throw new Error('Unbalanced braces in: ' + fname);
}

const needed = [
    'buildSlots', 'slotValue',
    'runScenario', 'runMaturityReplacement',
    'computeSAYNet', 'buildGlobalPriceShiftConfig',
    'simulate',
    '_buildInjectionByYear', '_scenarioToSimArgs', '_runScenarioSim',
];

// Build a module string with all engine functions + stubs for browser globals
const moduleSrc =
    // Stub browser globals used inside the engine
    `const _cgComputeCache = new Map();
     function _cgFromBase(v) { return v; }
     function _cgToBase(v)   { return v; }
     function _cgBaseCcy()   { return 'EUR'; }
     function _fxGet()       { return 1; }
     ` +
    needed.map(f => extractFn(engineSrc, f)).join('\n') +
    '\nexport { buildSlots, _scenarioToSimArgs, _buildInjectionByYear, _runScenarioSim };\n';

// Write to a temp file and import (Node ESM can't eval modules directly)
import { writeFileSync } from 'fs';
import { tmpdir }        from 'os';
import { join }          from 'path';
import { pathToFileURL } from 'url';
const tmpPath = join(tmpdir(), '_cg_sim_engine_' + process.pid + '.mjs');
writeFileSync(tmpPath, moduleSrc);

const tmpUrl = pathToFileURL(tmpPath).href;

const {
  buildSlots,
  _scenarioToSimArgs,
  _buildInjectionByYear,
  _runScenarioSim
} = await import(tmpUrl);

// ─── 2. Read input ───────────────────────────────────────────────────────────

const rawInput = process.argv[2]
    ? readFileSync(process.argv[2], 'utf8')
    : readFileSync('/dev/stdin', 'utf8');

const input = JSON.parse(rawInput);

const portfolio   = input.portfolioSnapshot;
const scenarios   = input.scenarios;
const verifyYears = new Set(input.verifyYears || []);

if (!portfolio?.length) throw new Error('portfolioSnapshot missing or empty');
if (!scenarios?.length)  throw new Error('scenarios missing or empty');

// startCapital = sum of investedEur from portfolio snapshot
const startCapital = portfolio.reduce((s, b) => s + (b.investedEur || 0), 0);

// ─── 3. Run simulation for each scenario ────────────────────────────────────

/**
 * _runScenarioSim needs sc.couponReinvest.perIsin to be a Map
 * (the export JSON stores it as a plain object).
 */
function normaliseScenario(sc) {
    return {
        ...sc,
        couponReinvest: {
            ...sc.couponReinvest,
            perIsin: new Map(Object.entries(sc.couponReinvest.perIsin || {})),
        },
        maturityReplacement: new Map(Object.entries(sc.maturityReplacement || {})),
    };
}

const output = { scenarioResults: [] };

for (const rawSc of scenarios) {
    const sc     = normaliseScenario(rawSc);
    const result = _runScenarioSim(sc, portfolio, startCapital);
    if (!result) continue;

    const { yearEvents, scale } = result;

    // Filter to requested verify years only
    const years = [];
    for (const ev of yearEvents) {
        if (verifyYears.size > 0 && !verifyYears.has(ev.yr)) continue;

        const perSlot = (ev.perSlot || []).map(s => ({
            isin:            s.isin,
            issuer:          s.issuer,
            isReplacement:   !!s._isReplacement,
            matYear:         s.matYear ?? null,
            // Monetary values scaled to EUR
            coupon:          Math.round((s.coupon      || 0) * scale),
            replCoupon:      Math.round((s.replCoupon  || 0) * scale),
            redemption:      Math.round((s.redemption  || 0) * scale),
            portVal:         Math.round((s.portVal     || 0) * scale),
            reinvested:      Math.round((s.reinvested  || 0) * scale),
        }));

        years.push({
            yr:                    ev.yr,
            coupons:               Math.round((ev.coupons      || 0) * scale),
            redemptions:           Math.round((ev.redemptions  || 0) * scale),
            reinvested:            Math.round((ev.reinvested   || 0) * scale),
            replCoupons:           Math.round((ev.replCoupons  || 0) * scale),
            bondsVal:              Math.round((ev.bondsVal     || 0) * scale),
            cash:                  Math.round((ev.cash         || 0) * scale),
            replacementActivated:  !!ev.replacementActivated,
            perSlot,
        });
    }

    output.scenarioResults.push({
        id:    rawSc.id,
        label: rawSc.label,
        years,
    });
}

// ─── 4. Write output ─────────────────────────────────────────────────────────

process.stdout.write(JSON.stringify(output, null, 2) + '\n');
