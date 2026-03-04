'use strict';
/**
 * BondFXClient — all network calls for bond/FX data.
 *
 * Populates ComputeCache and FxCurveStore as side effects.
 * No DOM.
 */

import { computeCache, populateFromResults, populateFallback } from '../core/ComputeCache.js';
import { prefetchFxCurves } from '../core/FxCurveStore.js';

// ECB rates — only EUR:1.0 is a hard constant; everything else is fetched.
export const cgRates = { EUR: 1.0 };

export async function loadFxRates() {
    try {
        const res = await fetch('/api/fx-rates');
        if (res.ok) Object.assign(cgRates, await res.json());
    } catch(e) { /* non-fatal */ }
}

/**
 * POST /api/bonds/compute — populates computeCache for the whole portfolio.
 * Must be awaited before buildSlots / runScenario.
 */
export async function computePortfolio(portfolio, priceShifts = {}, reportCcy = 'EUR') {
    if (!portfolio.length) return;
    const body = portfolio.map(b => ({
        isin:           b.isin,
        price:          b.price    || 0,
        priceEur:       b.priceEur || 0,
        coupon:         b.coupon   || 0,
        taxRate:        b.taxRate  || 0,
        maturity:       (b.maturity || '').slice(0, 10),
        currency:       b.currency || 'EUR',
        quantity:       b.quantity || 0,
        investedEur:    b.totalEur || (b.priceEur || 0) * (b.quantity || 0),
        priceShiftPct:  priceShifts[b.isin] ?? 0,
        reportCurrency: reportCcy,
    }));
    try {
        const res = await fetch('/api/bonds/compute', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(body),
        });
        if (!res.ok) throw new Error(res.status);
        populateFromResults(await res.json(), portfolio, reportCcy);
    } catch(e) {
        console.error('[BondFX] /api/bonds/compute unavailable — stats will be empty.', e.message);
        populateFallback(portfolio);
    }
}

/**
 * Compute effective weighted SAY for a portfolio with a global price shift.
 * When priceShift=0 reads synchronously from computeCache.
 * When priceShift≠0 calls POST /api/bonds/compute (async).
 */
export async function computeEffectiveSAY(portfolio, priceShift, reportCcy = 'EUR') {
    if (!priceShift) {
        let totalW = 0, totalSAY = 0;
        portfolio.forEach(b => {
            const cached = computeCache.get(b.isin);
            if (!cached) return;
            const w = (b.priceEur || 0) * b.quantity;
            totalSAY += (cached.say ?? 0) * w;
            totalW   += w;
        });
        return totalW > 0 ? totalSAY / totalW : 0;
    }
    try {
        const body = portfolio.map(b => ({
            isin: b.isin, price: b.price || 0, priceEur: b.priceEur || 0,
            coupon: b.coupon || 0, taxRate: b.taxRate || 0,
            maturity: (b.maturity || '').slice(0, 10),
            currency: b.currency || 'EUR', quantity: b.quantity || 0,
            reportCurrency: reportCcy, priceShiftPct: priceShift,
        }));
        const res = await fetch('/api/bonds/compute', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(res.status);
        const results = await res.json();
        let totalW = 0, totalSAY = 0;
        results.forEach(r => {
            const b = portfolio.find(x => x.isin === r.isin);
            if (!b) return;
            const w = (b.priceEur || 0) * b.quantity;
            totalSAY += (r.say ?? 0) * w;
            totalW   += w;
        });
        return totalW > 0 ? totalSAY / totalW : 0;
    } catch { return 0; }
}

/** Convenience: run both compute + prefetchFxCurves in parallel. */
export async function prepareSimulation(portfolio, reportCcy = 'EUR') {
    computeCache.clear();
    await Promise.all([
        computePortfolio(portfolio, {}, reportCcy),
        prefetchFxCurves(portfolio, reportCcy),
    ]);
}
