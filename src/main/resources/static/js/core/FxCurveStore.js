'use strict';
/**
 * FxCurveStore — OU-adjusted FX curve cache.
 *
 * Owned by one FxCurveStore instance per app session.
 * Exported as a singleton so SimulationEngine can read it synchronously
 * without carrying a reference through every function call.
 *
 * The .mjs headless runner pre-populates the underlying Map directly
 * (via the exported `fxCurveCache` reference) using its own OU model,
 * so no browser fetch is needed in that context.
 */

// ── Internal map (exported for direct population by the .mjs runner) ─────────
export const fxCurveCache = new Map();

// ── Legacy per-bond FX cache (kept for _fxGet callers in BondFXClient) ───────
export const fxCache = new Map();

/**
 * Synchronous lookup — returns fxMultiplier ∈ (0,1].
 * Returns 1.0 on cache miss (conservative: no haircut applied).
 */
export function fxCurveGet(currency, reportCurrency, horizonYear, startYear) {
    if (!currency || currency === reportCurrency) return 1.0;
    const t   = Math.max(0, horizonYear - startYear);
    const key = `${currency}_${reportCurrency}_h${t}`;
    return fxCurveCache.get(key)?.multiplier ?? 1.0;
}

/**
 * Fetches the full OU-adjusted FX curve for one currency via POST /api/fx-curve.
 * Populates fxCurveCache. Must be awaited before runScenario/buildSlots.
 */
export async function fetchFxCurve(currency, reportCurrency, horizons) {
    if (!currency || currency === reportCurrency) return;
    try {
        const r = await fetch('/api/fx-curve', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ currency, reportCurrency, horizons }),
        });
        if (!r.ok) throw new Error(r.status);
        const data       = await r.json(); // { "0": 0.926, "1": 0.918, … }
        const expiresAt  = Date.now() + 3_600_000;
        for (const [h, mult] of Object.entries(data)) {
            fxCurveCache.set(`${currency}_${reportCurrency}_h${h}`, { multiplier: mult, expiresAt });
        }
    } catch {
        // Fallback: fill with multiplier=1.0, retry soon.
        const expiresAt = Date.now() + 60_000;
        for (const h of horizons) {
            fxCurveCache.set(`${currency}_${reportCurrency}_h${h}`, { multiplier: 1.0, expiresAt });
        }
    }
}

/**
 * Pre-fetches FX curves for all non-base-currency bonds in the portfolio.
 * One POST /api/fx-curve per distinct currency.
 * Must complete before buildSlots / runScenario.
 */
export async function prefetchFxCurves(portfolio, reportCurrency = 'EUR') {
    const startYear  = new Date().getFullYear();
    const ccyMaxYear = new Map();
    portfolio.forEach(b => {
        if (!b.currency || b.currency === reportCurrency) return;
        const matYear = new Date(b.maturity).getFullYear();
        ccyMaxYear.set(b.currency, Math.max(ccyMaxYear.get(b.currency) || 0, matYear));
    });
    await Promise.all([...ccyMaxYear.entries()].map(([ccy, maxYear]) => {
        const maxHorizon = Math.max(1, maxYear - startYear);
        const horizons   = Array.from({ length: maxHorizon + 1 }, (_, i) => i);
        const allCached  = horizons.every(h => {
            const e = fxCurveCache.get(`${ccy}_${reportCurrency}_h${h}`);
            return e && e.expiresAt > Date.now();
        });
        if (allCached) return Promise.resolve();
        return fetchFxCurve(ccy, reportCurrency, horizons);
    }));
}
