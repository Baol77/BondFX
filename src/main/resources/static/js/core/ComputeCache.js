'use strict';
/**
 * ComputeCache — wraps the result of POST /api/bonds/compute.
 *
 * Populated once per simulation run by BondFXClient.computePortfolio().
 * Read synchronously by buildSlots() and computeSAYNet() during the sim loop.
 */

import { fxCache } from './FxCurveStore.js';

// Key: isin → BondComputeResult { say, finalCapital, bondNbr, capCoupons, capGain,
//                                  totalReturn, nomEur, fxBuy, fxCoupon, fxFuture,
//                                  yearsToMat }
export const computeCache = new Map();

/** SAY net for a bond — reads from computeCache. Falls back to 0 on cache miss. */
export function computeSAYNet(bond) {
    return computeCache.get(bond.isin)?.say ?? 0;
}

/**
 * Portfolio weighted-average SAY net (no price shift).
 * Fast path: reads from computeCache (already populated).
 */
export function weightedSAY(portfolio) {
    let totalW = 0, totalSAY = 0;
    portfolio.forEach(b => {
        const cached = computeCache.get(b.isin);
        if (!cached) return;
        const w = (b.priceEur || 0) * b.quantity;
        totalSAY += (cached.say ?? 0) * w;
        totalW   += w;
    });
    return totalW > 0 ? totalSAY / totalW : 3.0;
}

/**
 * Populates computeCache from a raw results array returned by /api/bonds/compute.
 * Also side-populates fxCache for synchronous _fxGet access.
 */
export function populateFromResults(results, portfolio, reportCcy = 'EUR') {
    results.forEach(r => {
        computeCache.set(r.isin, r);
        const b = portfolio.find(x => x.isin === r.isin);
        if (b && b.currency && b.currency !== reportCcy) {
            const yrs = Math.max(1, Math.round(r.yearsToMat || 1));
            fxCache.set(`${b.currency}_${reportCcy}_${yrs}`, {
                fxBuy: r.fxBuy, fxCoupon: r.fxCoupon, fxFuture: r.fxFuture,
                expiresAt: Date.now() + 3_600_000,
            });
        }
    });
}

/** Fallback entries for when /api/bonds/compute is unreachable. */
export function populateFallback(portfolio) {
    portfolio.forEach(b => {
        if (computeCache.has(b.isin)) return;
        const fxRateFb = (b.currency && b.currency !== 'EUR' && b.price > 0)
            ? (b.priceEur / b.price) : 1.0;
        computeCache.set(b.isin, {
            isin: b.isin, say: 0, finalCapital: 0, bondNbr: 0,
            capCoupons: 0, capGain: 0, totalCoupons: 0, totalFace: 0,
            fxBuy: 1, fxCoupon: 1, fxFuture: 1, yearsToMat: 0,
            nomEur: (b.nominal || 100) * fxRateFb,
        });
    });
}
