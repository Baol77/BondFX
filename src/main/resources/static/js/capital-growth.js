'use strict';

/* =====================================================================
   BondFX — Capital Growth Simulator  (v5.2)

   Fixes vs v5.1:
   1. market_avg: synthetic bond value now compounds correctly
      (accruedIncome tracked per slot, portfolioVal adds it)
   2. same_bond SAY 100%: scale applied consistently, no flat line
   3. ETF benchmark: Yahoo Finance v8 with crumb + fallback to v7;
      plus User-Agent header de-duplicated
   4. Template sync: all IDs match between JS and .ftl
   5. perIsin UI + multi-scenario fully wired
   6. Bond year view + stacked/line toggle
   7. Year detail modal on click
===================================================================== */

// ── Currency helpers ──────────────────────────────────────────────────────────
const _CG_SYM  = { EUR: '€', CHF: '₣', USD: '$', GBP: '£', JPY: '¥', CAD: 'C$', NOK: 'kr', SEK: 'kr', PLN: 'zł' };
// ECB rates loaded from /api/fx-rates. Only EUR:1.0 is a safe constant (EUR is the pivot).
// All other values are fetched live — no hardcoded stale fallbacks.
let   _cgRates = { EUR: 1.0 };

// ── FX multipliers — server-side via /api/fx-multipliers ─────────────────────
// Cache: Map<"CCY_YEARS", {fxBuy, fxCoupon, fxFuture, expiresAt}>
// Populated lazily at simulation time; EUR bonds skip the call entirely.
const _fxCache = new Map();

// ── FX Curve cache ────────────────────────────────────────────────────────────
// Map<"CCY_report_h{t}", { multiplier, expiresAt }>
// Populated by _prefetchFxCurves() before each simulation run.
// Synchronous lookup via _fxCurveGet(currency, reportCcy, horizonYear, startYear).
const _fxCurveCache = new Map();

/**
 * Fetches the full OU-adjusted FX curve for one currency via POST /api/fx-curve.
 * Each horizon t in horizons gets: multiplier = spot × (1 − OU_haircut(t)).
 * horizon=0 → spot rate (no haircut).
 */
async function _fetchFxCurve(currency, reportCurrency, horizons) {
    if (!currency || currency === reportCurrency) return;
    // exchangeRate: absolute currency value (e.g. 1.18 USD per EUR).
    // Kept here only for potential future use — never used as fxMultiplier.
    // fxMultiplier ∈ (0,1] is a separate concept returned by /api/fx-curve.
    const exchangeRate = _cgRates?.[currency] ?? 1.0; // eslint-disable-line no-unused-vars
    try {
        const r = await fetch('/api/fx-curve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currency, reportCurrency, horizons }),
        });
        if (!r.ok) throw new Error(r.status);
        const data = await r.json(); // { "0": 0.926, "1": 0.918, ... }
        const expiresAt = Date.now() + 3_600_000;
        for (const [h, mult] of Object.entries(data)) {
            _fxCurveCache.set(`${currency}_${reportCurrency}_h${h}`, { multiplier: mult, expiresAt });
        }
    } catch {
        // Fallback: server unreachable — fill with multiplier=1.0 (no FX haircut), retry soon.
        // Do NOT use spot rate here: spot is a currency rate (e.g. 1.18), not a multiplier in [0,1].
        const expiresAt = Date.now() + 60_000;
        for (const h of horizons) {
            _fxCurveCache.set(`${currency}_${reportCurrency}_h${h}`, { multiplier: 1.0, expiresAt });
        }
    }
}

/**
 * Pre-fetches FX curves for all non-base-currency bonds in the portfolio.
 * One POST /api/fx-curve per distinct currency, horizons [0..maxYearsToMaturity].
 * Must be awaited before runSimulation / buildSlots.
 */
async function _prefetchFxCurves(portfolio, reportCurrency = 'EUR') {
    const startYear = new Date().getFullYear();
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
            const e = _fxCurveCache.get(`${ccy}_${reportCurrency}_h${h}`);
            return e && e.expiresAt > Date.now();
        });
        if (allCached) return Promise.resolve();
        return _fetchFxCurve(ccy, reportCurrency, horizons);
    }));
}

/**
 * Returns fxMultiplier ∈ (0, 1] for a cash flow at horizonYear.
 *
 * Domain contract:
 *   fxMultiplier ≠ exchangeRate  — they occupy different numeric spaces.
 *   exchangeRate (e.g. 1.18 USD/EUR) is an absolute rate ∈ (0, ∞).
 *   fxMultiplier (OU haircut)     is a normalized discount ∈ (0, 1].
 *
 *   t = 0  → fxMultiplier = 1.0  (spot, no haircut)
 *   t > 0  → fxMultiplier < 1.0  (growing FX risk discount)
 *
 * Returns 1.0 on cache miss (conservative: no haircut applied).
 */
function _fxCurveGet(currency, reportCurrency, horizonYear, startYear) {
    if (!currency || currency === reportCurrency) return 1.0;
    const t   = Math.max(0, horizonYear - startYear);
    const key = `${currency}_${reportCurrency}_h${t}`;
    // Cache stores { multiplier: fxMultiplier ∈ (0,1], expiresAt }
    return _fxCurveCache.get(key)?.multiplier ?? 1.0;
}

// Legacy per-bond lookup kept for _fxGet callers outside the sim loop.
function _fxGet(currency, years, reportCurrency = 'EUR') {
    if (!currency || currency === reportCurrency) return { fxBuy:1, fxCoupon:1, fxFuture:1 };
    const key = `${currency}_${reportCurrency}_${years}`;
    return _fxCache.get(key) || { fxBuy:1, fxCoupon:1, fxFuture:1 };
}

// Compute SAY net using BondScoreEngine formula + cached FX multipliers.
// ── /api/bonds/compute cache ──────────────────────────────────────────────────
// Populated by _computePortfolio() before every simulation run.
// Key: isin  →  BondComputeResult { say, sayGross, finalCapital, bondNbr,
//                                   capCoupons, capGain, totalReturn,
//                                   nomEur, fxBuy, fxCoupon, fxFuture,
//                                   yearsToMaturity }
const _cgComputeCache = new Map();

/**
 * Calls POST /api/bonds/compute for the whole portfolio (+ optional priceShifts).
 * Populates _cgComputeCache. Must be awaited before any SAY / slot computation.
 *
 * @param {Array}  portfolio    — bond objects from localStorage
 * @param {Object} priceShifts — optional { isin: shiftPct } overrides (capital-growth what-if)
 * @param {string} reportCcy   — e.g. 'EUR'
 */
async function _computePortfolio(portfolio, priceShifts = {}, reportCcy = 'EUR') {
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
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(res.status);
        const results = await res.json();
        results.forEach(r => {
            _cgComputeCache.set(r.isin, r);
            // Also populate _fxCache so buildSlots/_fxGet work synchronously
            // without a separate /api/fx-multipliers round-trip.
            const b = portfolio.find(x => x.isin === r.isin);
            if (b && b.currency && b.currency !== reportCcy) {
                const yrs = Math.max(1, Math.round(r.yearsToMat || 1));
                const key = `${b.currency}_${reportCcy}_${yrs}`;
                _fxCache.set(key, {
                    fxBuy: r.fxBuy, fxCoupon: r.fxCoupon, fxFuture: r.fxFuture,
                    expiresAt: Date.now() + 3_600_000,
                });
            }
        });
    } catch (e) {
        // POST /api/bonds/compute is the single source of truth for SAY, finalCapital,
        // FX multipliers and all derived metrics. No JS formula fallback — if the backend
        // is unreachable the simulation will show zeros rather than silently using
        // a stale local replica of BondScoreEngine / FxService.
        console.error('[BondFX] /api/bonds/compute unavailable — stats and simulation will be empty.', e.message);
        portfolio.forEach(b => {
            if (!_cgComputeCache.has(b.isin)) {
                const fxRateFb = (b.currency && b.currency !== 'EUR' && b.price > 0) ? (b.priceEur / b.price) : 1.0;
                _cgComputeCache.set(b.isin, {
                    isin: b.isin, say: 0, finalCapital: 0, bondNbr: 0,
                    capCoupons: 0, capGain: 0, totalCoupons: 0, totalFace: 0,
                    fxBuy: 1, fxCoupon: 1, fxFuture: 1, yearsToMat: 0,
                    nomEur: (b.nominal || 100) * fxRateFb,
                });
            }
        });
    }
}

/**
 * SAY net for a bond — reads from _cgComputeCache (populated by _computePortfolio).
 * Falls back to 0 if cache miss (should not happen in normal flow).
 */
function _computeSAYWithFx(bond) {
    return _cgComputeCache.get(bond.isin)?.say ?? 0;
}

function _cgBaseCcy()         { return localStorage.getItem('bondBaseCurrency') || 'EUR'; }
function _cgSym()             { return _CG_SYM[_cgBaseCcy()] || '€'; }
function _cgToBase(v)         { return v * (_cgRates[_cgBaseCcy()] || 1); }
function _cgFromBase(v)       { return v / (_cgRates[_cgBaseCcy()] || 1); }
function _cgFmt(eur)          { return _cgSym() + _cgToBase(eur).toLocaleString(undefined, {maximumFractionDigits:0}); }

async function _cgLoadFxRates() {
    try {
        const res = await fetch('/api/fx-rates');
        if (res.ok) Object.assign(_cgRates, await res.json());
    } catch(e) {}
}

// ── Portfolio loader ──────────────────────────────────────────────────────────
function loadPortfolio() {
    try {
        const raw = localStorage.getItem('bondPortfolio');
        return raw ? JSON.parse(raw).filter(b => b.includeInStatistics !== false) : [];
    } catch(e) { return []; }
}

/* ── Simulation engine ───────────────────────────────────────────────────────
   Slot structure:
     isin, issuer, matYear
     unitsHeld       — quantity
     facePerUnit     — nominal EUR/unit (redeemed at maturity)
     couponPerUnit   — annual net coupon EUR/unit
     pricePerUnit    — market EUR/unit (reinvestment cost)
     accruedPerUnit  — accumulated net coupon income EUR/unit (for market_avg slots)

   Portfolio value = Σ(units × (facePerUnit + accruedPerUnit)) + cash
   For real bonds: accruedPerUnit = 0 (face redeems at par)
   For synthetic market_avg bonds: accrued grows each year → correct compounding
──────────────────────────────────────────────────────────────────────────── */

function buildSlots(portfolio) {
    return portfolio.map(b => {
        // nomEur and net coupon come from _cgComputeCache (populated by _computePortfolio).
        // This eliminates the JS replica of Bond.priceEur/price FX normalisation.
        const cached = _cgComputeCache.get(b.isin);
        // spotRate: exchangeRate at purchase time — EUR per 1 unit of bond currency.
        // e.g. USD bond: spotRate ≈ 0.847 (EUR/USD), so nomEur = 100 × 0.847 = €84.70.
        // Source: cached.fxBuy from /api/bonds/compute (preferred), or priceEur/price fallback.
        // NOTE: this is an exchangeRate, not an fxMultiplier — they must never be confused.
        const spotRate = cached?.fxBuy ?? ((b.currency !== 'EUR' && b.price > 0) ? b.priceEur / b.price : 1.0);
        const nomEur   = 100 * spotRate;
        const pxEur     = (b.priceEur > 0) ? b.priceEur : nomEur;
        return {
            isin:           b.isin,
            issuer:         b.issuer,
            currency:       b.currency || 'EUR',     // kept for per-year FX curve lookup
            matYear:        new Date(b.maturity).getFullYear(),
            unitsHeld:      b.quantity,
            facePerUnit:    nomEur,                  // in report-ccy at spot; loop applies OU factor
            couponPerUnit:  (b.coupon / 100) * nomEur * (1 - (b.taxRate || 0) / 100),
            pricePerUnit:   pxEur,
            accruedPerUnit: 0,
            synthetic:      false,
        };
    });
}

function slotValue(sl, yr, startYear, reportCcy) {
    // Synthetic market_avg: face + accrued compounds (reinvested into generic EUR instrument)
    if (sl.synthetic && sl._type !== 'same_bond') {
        return sl.unitsHeld * (sl.facePerUnit + sl.accruedPerUnit);
    }
    // Real bonds and same_bond synthetics: price × units with OU FX adjustment.
    // At t=0 (yr=startYear): fxFactor=1.0 — no haircut, starts at spot value.
    // At t>0: fxFactor<1.0 — gradual decline reflecting accumulated FX risk (VaR 5%).
    // Synthetic replacement bonds are already in EUR — no FX adjustment.
    let fxFactor = 1.0;
    if (sl.currency && sl.currency !== (reportCcy || 'EUR') && !sl._isReplacement && yr != null) {
        fxFactor = _fxCurveGet(sl.currency, reportCcy || 'EUR', yr, startYear);
    }
    return sl.unitsHeld * sl.pricePerUnit * fxFactor;
}

/**
 * Run one scenario year-by-year.
 * Returns { dataPoints[], yearEvents[] }
 *
 * perIsinConfig: Map<isin, {mode, priceShift, reinvestYield}>
 * If isin not in map → globalMode / globalPriceShift / globalReinvestYield apply.
 */
function runScenario(slots, years, globalMode, globalPriceShift, globalReinvestYield, perIsinConfig, injectionByYear, fxOpts = {}) {
    let pool = slots.map(s => ({ ...s }));
    let cash = 0;
    const endYear  = years[years.length - 1];
    const startYear   = fxOpts.startYear   ?? years[0];
    const reportCcy   = fxOpts.reportCcy   ?? 'EUR';

    const dataPoints   = [pool.reduce((s, sl) => s + slotValue(sl, startYear, startYear, reportCcy), 0) + cash];
    const yearEvents   = [];

    for (let i = 1; i < years.length; i++) {
        const yr = years[i];
        const portfolioVal = () => pool.reduce((s, sl) => s + slotValue(sl, yr, startYear, reportCcy), 0) + cash;
        let yearCoupons = 0, yearRedemptions = 0, reinvested = 0;
        const alive = [];
        const perSlot = [];

        for (const sl of pool) {
            if (sl.matYear < yr) continue;

            // OU-adjusted FX multiplier for this year's cash flows
            const fxC = sl.currency ? _fxCurveGet(sl.currency, reportCcy, yr, startYear) : 1.0;
            const fxM = sl.currency ? _fxCurveGet(sl.currency, reportCcy, sl.matYear, startYear) : 1.0;
            const couponCash = sl.unitsHeld * sl.couponPerUnit * fxC;
            yearCoupons += couponCash;
            // Track per-slot for bottom-up subrow display (skip synthetic aggregate slots)
            if (!sl.isin?.startsWith('_')) {
                const slRedemp = (sl.matYear === yr) ? sl.unitsHeld * sl.facePerUnit * fxM : 0;
                perSlot.push({ isin: sl.isin, issuer: sl.issuer || '',
                    coupon: couponCash, redemption: slRedemp, portVal: slotValue(sl, yr, startYear, reportCcy), reinvested: 0 });
            }

            if (sl.synthetic) {
                // Only market_avg slots compound via accruedPerUnit
                // same_bond synthetic slots pay coupons as cash (like real bonds)
                if (sl._type !== 'same_bond') {
                    sl.accruedPerUnit += sl.couponPerUnit;
                }
                // Replacement bond with _takeCouponAsCash: coupon goes to cash, not reinvested
                if (sl._isReplacement && sl._takeCouponAsCash) {
                    cash += couponCash;
                    yearCoupons -= couponCash; // will be tracked as cash, not reinvested
                }
            }
            // Real bonds: pricePerUnit is constant (market price snapshot);
            // coupons are cash flows, not added to slot value

            if (sl.matYear === yr) {
                // Redemption: real bonds redeem at face; synthetic slots redeem at face+accrued
                // Apply FX curve multiplier at maturity horizon
                const fxMat = sl.currency ? _fxCurveGet(sl.currency, reportCcy, yr, startYear) : 1.0;
                yearRedemptions += sl.synthetic
                    ? sl.unitsHeld * (sl.facePerUnit + sl.accruedPerUnit) * fxMat
                    : sl.unitsHeld * sl.facePerUnit * fxMat;
            } else {
                alive.push(sl);
            }
        }
        // bondsVal: total bond value at START of year (before reinvestment changes unitsHeld)
        // This matches perSlot.portVal which is also captured before reinvestment.
        const bondsVal = alive.reduce((s, sl) => s + slotValue(sl, yr, startYear, reportCcy), 0);
        pool = alive;

        // Apply annual injection: buy new units of active bonds
        if (injectionByYear) {
            const injThisYear = injectionByYear.get(yr);
            if (injThisYear) {
                for (const [isin, injEur] of injThisYear.entries()) {
                    const liveSlot = pool.find(s => s.isin === isin);
                    if (liveSlot && liveSlot.pricePerUnit > 0) {
                        liveSlot.unitsHeld += injEur / liveSlot.pricePerUnit;
                    }
                }
            }
        }

        const cashIn = yearCoupons + yearRedemptions;

        // Keep a snapshot of matured slots for reinvestment reference
        // (pool has already been filtered to alive-only at this point)
        const maturedSlots = [];
        for (const sl of slots) {
            if (sl.matYear === yr) maturedSlots.push(sl);
        }

        if (cashIn > 0) {
            // Reference pool: alive bonds for proportional allocation, or matured bonds as fallback
            const refPool = pool.length > 0 ? pool : maturedSlots;
            const totalFace = refPool.reduce((s, sl) => s + sl.unitsHeld * sl.facePerUnit, 0);

            if (totalFace > 0) {
                let marketAvgTotal = 0, marketAvgCostPerUnit = 0, marketAvgYield = 0, marketAvgCount = 0;

                for (const sl of refPool) {
                    // Skip replacement slots from reinvestment loop — they handle their own coupons
                    if (sl._isReplacement) continue;

                    const cfg      = perIsinConfig?.get(sl.isin);
                    const mode     = cfg?.mode          ?? globalMode;
                    const pShift   = cfg?.priceShift    ?? globalPriceShift;
                    const rYield   = (cfg?.reinvestYield ?? globalReinvestYield) / 100;
                    const adjFact  = 1 + pShift / 100;
                    const share    = (sl.unitsHeld * sl.facePerUnit) / totalFace;
                    const myShare  = cashIn * share;

                    if (mode === 'none') {
                        cash += myShare;
                    } else if (mode === 'same_bond') {
                        const cost = sl.pricePerUnit * adjFact;
                        if (cost > 0) {
                            // If the original slot is still alive, add units to it
                            const liveSlot = pool.find(p => p.isin === sl.isin);
                            if (liveSlot) {
                                liveSlot.unitsHeld += myShare / cost;
                            } else {
                                // Bond matured this year: create synthetic slot — same price, same coupon
                                pool.push({
                                    isin:           sl.isin + '_reinv_' + yr,
                                    issuer:         sl.issuer,
                                    matYear:        endYear + 30,
                                    unitsHeld:      myShare / cost,
                                    facePerUnit:    sl.facePerUnit,
                                    couponPerUnit:  sl.couponPerUnit,
                                    pricePerUnit:   cost,
                                    accruedPerUnit: 0,
                                    synthetic:      true,
                                    _type:          'same_bond',
                                });
                            }
                            reinvested += myShare;
                        } else { cash += myShare; }
                    } else { // market_avg — accumulate for aggregation
                        const yearsLeft = endYear - yr;
                        if (yearsLeft > 0) {
                            const costPerUnit = Math.max(0.01, adjFact);
                            marketAvgTotal       += myShare;
                            marketAvgCostPerUnit += costPerUnit;
                            marketAvgYield       += rYield * costPerUnit;
                            marketAvgCount++;
                            reinvested           += myShare;
                        } else { cash += myShare; }
                    }
                }

                // Add ONE aggregated synthetic slot for all market_avg reinvestments this year
                if (marketAvgTotal > 0 && marketAvgCount > 0) {
                    const avgCost  = marketAvgCostPerUnit / marketAvgCount;
                    const avgYield = marketAvgYield / marketAvgCount;
                    pool.push({
                        isin:           '_mkt_' + yr,
                        issuer:         'Reinvested',
                        matYear:        endYear,
                        unitsHeld:      marketAvgTotal / Math.max(0.01, avgCost),
                        facePerUnit:    avgCost,
                        couponPerUnit:  avgYield,
                        pricePerUnit:   avgCost,
                        accruedPerUnit: 0,
                        synthetic:      true,
                    });
                }
            } else {
                cash += cashIn; // all bonds matured
            }
        }

        // Distribute reinvested proportionally across per-slot items
        const cashInTot = yearCoupons + yearRedemptions;
        perSlot.forEach(s => {
            s.reinvested = (reinvested > 0 && cashInTot > 0)
                ? reinvested * (s.coupon + s.redemption) / cashInTot : 0;
        });
        yearEvents.push({ yr, coupons: yearCoupons, redemptions: yearRedemptions, cashIn, reinvested, cash, bondsVal, perSlot });
        dataPoints.push(portfolioVal());
    }
    return { dataPoints, yearEvents };
}

// ── Maturity Replacement scenario engine ──────────────────────────────────────
// A maturity replacement scenario runs on top of the base portfolio:
// when bond `sourceBond` matures, ALL proceeds are reinvested into a synthetic
// bond with the given netCouponPct/year, maturityDate and coupon strategy.
// Other bonds in the portfolio continue with their own coupon-reinvest behavior.
//
// matReplacement = {
//   id, name, color,
//   sourceBond: { isin, matYear },
//   netCouponPct: number,          // net annual coupon % on face
//   maturityYear: number,
//   reinvestCoupons: bool,         // true = reinvest coupons; false = cash
//   baseCouponMode: 'none'|'same_bond'  // for the OTHER bonds
//   basePriceShift: number         // price% for coupon reinvest on other bonds
// }

function runMaturityReplacement(slots, years, matReplacementOrArray, injectionByYear, fxOpts = {}) {
    // Accept single replacement or array of replacements
    const replacements = Array.isArray(matReplacementOrArray)
        ? matReplacementOrArray : [matReplacementOrArray];
    // For backward compat: primary replacement is the first (used for display metadata)
    const primary = replacements[0];
    const { sourceBond, netCouponPct, maturityYear, reinvestCoupons,
            priceShift } = primary;
    const startYear = fxOpts.startYear ?? years[0];
    const reportCcy = fxOpts.reportCcy ?? 'EUR';

    // Build initial pool same as a coupon-reinvest scenario
    let pool = slots.map(s => ({ ...s }));
    let cash = 0;
    const simEndYear = years[years.length - 1];
    // Extend years array to cover the latest maturity across all replacements
    const maxRepMatYear = Math.max(...replacements.map(r => r.maturityYear || 0));
    const allYears = [...years];
    for (let y = simEndYear + 1; y <= maxRepMatYear; y++) allYears.push(y);

    const dataPoints   = [pool.reduce((s, sl) => s + slotValue(sl, startYear, startYear, reportCcy), 0) + cash];
    const yearEvents   = [];

    for (let i = 1; i < allYears.length; i++) {
        const yr = allYears[i];
        const portfolioVal = () => pool.reduce((s, sl) => s + slotValue(sl, yr, startYear, reportCcy), 0) + cash;
        let yearCoupons = 0, yearRedemptions = 0, reinvested = 0, replCoupons = 0;
        let replacementActivated = false;
        const alive = [];
        const perSlot = [];

        for (const sl of pool) {
            if (sl.matYear < yr) continue;

            const fxC2 = sl.currency ? _fxCurveGet(sl.currency, reportCcy, yr, startYear) : 1.0;
            const fxM2 = sl.currency ? _fxCurveGet(sl.currency, reportCcy, sl.matYear, startYear) : 1.0;
            const couponCash = sl.unitsHeld * sl.couponPerUnit * (sl._isReplacement ? 1.0 : fxC2);
            if (!sl.isin?.startsWith('_') || sl._isReplacement) {
                const slRedemp2 = (sl.matYear === yr) ? sl.unitsHeld * sl.facePerUnit * (sl._isReplacement ? 1.0 : fxM2) : 0;
                const displayIsin   = sl._isReplacement ? (sourceBond.isin + '_repl') : sl.isin;
                const displayIssuer = sl._isReplacement ? (sl.issuer + ' \u2192 repl.') : (sl.issuer || '');
                perSlot.push({ isin: displayIsin, issuer: displayIssuer,
                    coupon: sl._isReplacement ? 0 : couponCash,
                    replCoupon: sl._isReplacement ? couponCash : 0,
                    redemption: slRedemp2, portVal: slotValue(sl, yr, startYear, reportCcy), reinvested: 0,
                    _isReplacement: !!sl._isReplacement,
                    matYear: sl._isReplacement ? sl.matYear : undefined });
            }

            if (sl._isReplacement) {
                // Replacement bond coupon handling:
                if (sl._takeCouponAsCash) {
                    cash += couponCash;
                } else {
                    sl.unitsHeld += couponCash / sl.pricePerUnit;
                }
                // Track replacement coupons separately so modal can display them
                replCoupons += couponCash;
            } else {
                yearCoupons += couponCash;
                if (sl.synthetic && sl._type !== 'same_bond') sl.accruedPerUnit += sl.couponPerUnit;
            }

            if (sl.matYear === yr) {
                yearRedemptions += sl.synthetic
                    ? sl.unitsHeld * (sl.facePerUnit + sl.accruedPerUnit)
                    : sl.unitsHeld * sl.facePerUnit;
                // Check if this slot's ISIN matches ANY configured replacement
                if (replacements.some(r => r.sourceBond?.isin === sl.isin)) replacementActivated = true;
            } else {
                alive.push(sl);
            }
        }
        pool = alive;

        // Apply annual injection: buy new units of active bonds
        if (injectionByYear) {
            const injThisYear = injectionByYear.get(yr);
            if (injThisYear) {
                for (const [isin, injEur] of injThisYear.entries()) {
                    const liveSlot = pool.find(s => s.isin === isin);
                    if (liveSlot && liveSlot.pricePerUnit > 0) {
                        liveSlot.unitsHeld += injEur / liveSlot.pricePerUnit;
                    }
                }
            }
        }

        const cashIn = yearCoupons + yearRedemptions;
        const maturedOrigSlots = slots.filter(sl => sl.matYear === yr);
        const refPool = pool.length > 0 ? pool : maturedOrigSlots;
        // totalFace must exclude replacement slots: they don't participate in
        // the otherCash reinvestment loop (they manage their own coupons directly),
        // so including them would silently remove a share of otherCash from circulation.
        const totalFace = refPool.reduce((s, sl) => sl._isReplacement ? s : s + sl.unitsHeld * sl.facePerUnit, 0);

        if (cashIn > 0 && totalFace > 0) {
            // For each replacement that activates this year, compute actual proceeds
            // (redemption + coupon of that bond only) and create a replacement slot.
            // "otherCash" = everything not claimed by any replacement.
            let totalSrcCash = 0;
            let totalSrcFace = 0;

            for (const rep of replacements) {
                const repSrcSlot = maturedOrigSlots.find(s => s.isin === rep.sourceBond?.isin);
                if (!repSrcSlot) continue; // this replacement's bond doesn't mature this year
                const repFxM = repSrcSlot.currency
                    ? _fxCurveGet(repSrcSlot.currency, reportCcy, yr, startYear) : 1.0;
                const repFxC = repSrcSlot.currency
                    ? _fxCurveGet(repSrcSlot.currency, reportCcy, yr, startYear) : 1.0;
                const repRedemption = repSrcSlot.unitsHeld * repSrcSlot.facePerUnit * repFxM;
                const repCoupon     = repSrcSlot.unitsHeld * repSrcSlot.couponPerUnit * repFxC;
                const repSrcCash    = repRedemption + repCoupon;
                const repAdjFact    = Math.max(0.01, 1 + (rep.priceShift || 0) / 100);

                if (rep.maturityYear > yr && repSrcCash > 0) {
                    const replSlot = {
                        isin:              rep.sourceBond.isin + '_repl_' + yr,
                        issuer:            '→ Replacement bond',
                        matYear:           rep.maturityYear,
                        unitsHeld:         repSrcCash / repAdjFact,
                        facePerUnit:       1,
                        couponPerUnit:     (rep.netCouponPct || 0) / 100,
                        pricePerUnit:      repAdjFact,
                        accruedPerUnit:    0,
                        synthetic:         true,
                        _type:             'same_bond',
                        _takeCouponAsCash: !rep.reinvestCoupons,
                        _isReplacement:    true,
                    };
                    pool.push(replSlot);
                    reinvested   += repSrcCash;
                    totalSrcCash += repSrcCash;
                    totalSrcFace += repSrcSlot.unitsHeld * repSrcSlot.facePerUnit;
                } else if (repSrcCash > 0) {
                    cash         += repSrcCash;
                    totalSrcCash += repSrcCash;
                    totalSrcFace += repSrcSlot.unitsHeld * repSrcSlot.facePerUnit;
                }
            }

            // otherCash = cashIn minus proceeds claimed by replacement activation(s).
            // Source bonds are not in refPool at this point (already matured → filtered out).
            // So totalFace already represents only the surviving non-replacement bonds,
            // and we can distribute otherCash directly proportional to their face.
            const otherCash = cashIn - totalSrcCash;

            for (const sl of refPool) {
                // Skip replacement slots — their coupons are compounded directly above
                if (sl._isReplacement) continue;
                // (Source bonds are already gone from pool — no skip needed here)

                const share   = totalFace > 0 ? (sl.unitsHeld * sl.facePerUnit) / totalFace : 0;
                const myShare = otherCash * share;

                if (false) { // (sourceBond handled above — dead branch kept for structure)
                } else {
                    // All other bonds: reinvest coupons same-bond style (same as reinvest_flat builtin)
                    const cost = sl.pricePerUnit;
                    if (cost > 0) {
                        const liveSlot = pool.find(p => p.isin === sl.isin);
                        if (liveSlot) {
                            liveSlot.unitsHeld += myShare / cost;
                        } else {
                            // Bond matured this year (not the source bond): synthetic continuation
                            pool.push({
                                isin: sl.isin + '_cont_' + yr, issuer: sl.issuer,
                                matYear: simEndYear + 30,
                                unitsHeld: myShare / cost,
                                facePerUnit: sl.facePerUnit, couponPerUnit: sl.couponPerUnit,
                                pricePerUnit: cost, accruedPerUnit: 0,
                                synthetic: true, _type: 'same_bond',
                            });
                        }
                        reinvested += myShare;
                    } else { cash += myShare; }
                }
            }

            // No mktTotal aggregation needed: other bonds handled individually above
        } else if (cashIn > 0) {
            cash += cashIn;
        }

        const cashInTotR = yearCoupons + yearRedemptions;
        perSlot.forEach(s => {
            s.reinvested = (reinvested > 0 && cashInTotR > 0)
                ? reinvested * (s.coupon + s.redemption) / cashInTotR : 0;
        });
        // bondsVal must be post-reinvestment so Portfolio Value matches dataPoints (portfolioVal())
        // Using pool (already updated by reinvestment) gives the correct post-reinvest bonds value.
        const bondsValR = pool.reduce((s, sl) => s + slotValue(sl, yr, startYear, reportCcy), 0);
        yearEvents.push({
            yr,
            coupons: yearCoupons + replCoupons,
            redemptions: yearRedemptions,
            cashIn,
            reinvested: replacementActivated ? 0 : reinvested,
            switched: replacementActivated ? reinvested : 0,
            replCoupons,
            cash,
            bondsVal: bondsValR,
            replacementActivated,
            replacementBond: replacementActivated
                ? { netCouponPct, maturityYear, reinvestCoupons }
                : null,
            perSlot,
        });
        dataPoints.push(portfolioVal());
    }
    return { dataPoints, yearEvents, extendedYears: allYears };
}


function computeSAYNet(bond) {
    // Reads from _cgComputeCache — no JS formula replication.
    return _cgComputeCache.get(bond.isin)?.say ?? 0;
}

// ── Master simulate ───────────────────────────────────────────────────────────
const SCENARIO_PALETTE = ['#9e9e9e','#1e88e5','#e53935','#43a047','#ff6d00','#8e24aa','#00897b','#f4511e','#1565c0','#558b2f'];

// Helper: build per-ISIN config applying a global price shift to all bonds
function buildGlobalPriceShiftConfig(portfolio, priceShift, wSAY) {
    if (!priceShift) return null;
    const m = new Map();
    portfolio.forEach(b => {
        m.set(b.isin, { mode: 'same_bond', priceShift, reinvestYield: wSAY });
    });
    return m;
}

/**
 * Weighted SAY for the portfolio with a given price shift applied to all bonds.
 * Uses _cgComputeCache entries with priceShiftPct set (populated by _computePortfolio).
 * If priceShift is 0 the standard cache entries are used directly.
 */
/**
 * Returns the portfolio weighted average SAY net, applying an optional global priceShift.
 * When priceShift = 0 uses _cgComputeCache directly (synchronous, no network call).
 * When priceShift != 0 calls POST /api/bonds/compute with the shifted price — async,
 * resolves to the weighted SAY. Callers that need the value for display should await it.
 */
async function computeEffectiveSAY(portfolio, priceShift) {
    if (!priceShift) {
        // Fast path: read from cache (populated by /api/bonds/compute at simulation start)
        let totalW = 0, totalSAY = 0;
        portfolio.forEach(b => {
            const cached = _cgComputeCache.get(b.isin);
            if (!cached) return;
            totalSAY += (cached.say ?? 0) * (b.priceEur || 0) * b.quantity;
            totalW   += (b.priceEur || 0) * b.quantity;
        });
        return totalW > 0 ? totalSAY / totalW : 0;
    }
    // Shifted path: delegate to backend — no JS formula replication
    const reportCcy = localStorage.getItem('bondReportCurrency') || 'EUR';
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
    } catch {
        return 0; // backend unavailable — don't compute locally
    }
}


function simulate(portfolio, startCapital, customScenarios, perIsinConfigs, injectionConfig) {
    if (!portfolio.length) return { years: [], scenarios: [] };

    const today     = new Date();
    const startYear = today.getFullYear();
    const endYear   = Math.max(startYear + 1, ...portfolio.map(b => new Date(b.maturity).getFullYear()));
    const years     = [];
    for (let y = startYear; y <= endYear; y++) years.push(y);

    const slots   = buildSlots(portfolio);
    const simBase = slots.reduce((s, sl) => s + sl.unitsHeld * sl.pricePerUnit, 0);
    const scale   = (simBase > 0 && startCapital > 0) ? startCapital / simBase : 1;
    const sc      = arr => arr.map(v => isFinite(v) ? v * scale : 0);

    const totalPV = simBase;
    const wSAY    = totalPV > 0
        ? portfolio.reduce((s, b) => s + computeSAYNet(b) * (b.priceEur || 0) * b.quantity, 0) / totalPV
        : 3.0;

    // ── E: Build injectionByYear map ──────────────────────────────────────────
    // Key: year → Map<isin, eurAmount>
    // Percentages are re-normalized each year to exclude matured bonds
    let injectionByYear = null;
    if (injectionConfig?.enabled && injectionConfig.amountEur > 0) {
        injectionByYear = new Map();
        for (let yi = 1; yi < years.length; yi++) {
            const yr = years[yi];
            // Active bonds at this year (not yet matured)
            const active = portfolio.filter(b => new Date(b.maturity).getFullYear() >= yr);
            if (!active.length) continue;

            // User-configured raw percentages for active bonds
            const rawPcts = active.map(b => ({
                isin: b.isin,
                pct: injectionConfig.pct[b.isin] ?? (100 / active.length),
            }));
            const totalRaw = rawPcts.reduce((s, x) => s + x.pct, 0);
            if (totalRaw <= 0) continue;

            const yearMap = new Map();
            rawPcts.forEach(x => {
                const normalizedAmt = injectionConfig.amountEur * (x.pct / totalRaw);
                if (normalizedAmt > 0) yearMap.set(x.isin, normalizedAmt);
            });
            injectionByYear.set(yr, yearMap);
        }
    }

    // ── A: only generate no_reinvest builtin; coupon reinvest only if user enabled it ──
    const { dataPoints: noReinvDP, yearEvents: noReinvEV } =
        runScenario(slots, years, 'none', 0, wSAY, null, injectionByYear);
    const scenarios = [{
        id: 'no_reinvest', label: 'No reinvestment (cash)',
        color: SCENARIO_PALETTE[0],
        data: sc(noReinvDP), yearEvents: noReinvEV, scale,
    }];

    // ── Coupon-reinvest: only if user-defined scenario exists ──────────────────
    const couponScenarios = (customScenarios || []).filter(cs => cs._type === 'coupon_reinvest');
    couponScenarios.forEach((cs, i) => {
        const cfg     = perIsinConfigs?.get(cs.id);
        const perIsin = cfg || buildGlobalPriceShiftConfig(portfolio, cs.globalPriceShift, wSAY);
        const { dataPoints, yearEvents } = runScenario(slots, years, 'same_bond', cs.globalPriceShift, wSAY, perIsin, injectionByYear);
        scenarios.push({
            id: cs.id, label: cs.name,
            color: SCENARIO_PALETTE[1],          // always blue (same slot as old reinvest_flat)
            data: sc(dataPoints), yearEvents, scale, _custom: true, _type: 'coupon_reinvest',
        });
    });

    // ── Maturity replacement scenarios (Aspect 2) ────────────────────────────
    // A: use no_reinvest as prefix so the replacement line is visually connected.
    const noReinvByYear = new Map();
    scenarios[0].data.forEach((v, i) => noReinvByYear.set(years[i], v));

    const matScenarios = (customScenarios || []).filter(cs => cs._type === 'maturity_replacement');
    matScenarios.forEach((cs, i) => {
        const { dataPoints, yearEvents, extendedYears } = runMaturityReplacement(slots, years, cs, injectionByYear);
        const srcMatYear = cs.sourceBond?.matYear || 0;
        // Before matYear: mirror no_reinvest so line starts from the same base.
        // From matYear onwards: use replacement's own simulation values.
        const padded = extendedYears.map((yr, idx) => {
            if (yr < srcMatYear) {
                return noReinvByYear.has(yr) ? noReinvByYear.get(yr) : null;
            }
            if (idx < dataPoints.length && isFinite(dataPoints[idx])) return dataPoints[idx] * scale;
            return null;
        });
        scenarios.push({
            id: cs.id, label: cs.name,
            color: SCENARIO_PALETTE[(4 + couponScenarios.length + i) % SCENARIO_PALETTE.length],
            data: padded, yearEvents, scale,
            _custom: true, _type: 'maturity_replacement',
            _extendedYears: extendedYears,
            _sourceBond: cs.sourceBond,
        });
    });

    return { years, scenarios, weightedSAY: wSAY, scale };
}

// ── Bond timeline (for per-bond year view) ────────────────────────────────────
function buildBondTimeline(portfolio, years) {
    // Show ISIN in label if multiple bonds from same issuer
    const issuerCount = {};
    portfolio.forEach(b => { issuerCount[b.issuer] = (issuerCount[b.issuer] || 0) + 1; });

    const series = portfolio.map(b => {
        const fxRate  = (b.currency !== 'EUR' && b.price > 0) ? b.priceEur / b.price : 1;
        const nomEur  = (b.nominal || 100) * fxRate;
        const costEur = b.totalEur || ((b.priceEur || nomEur) * b.quantity);
        const faceEur = nomEur * b.quantity;
        const annNet  = (b.coupon / 100) * nomEur * b.quantity * (1 - (b.taxRate || 0) / 100);
        const matYear = new Date(b.maturity).getFullYear();
        const curYear = new Date().getFullYear();

        const data = years.map((yr, i) => {
            if (i === 0) return _cgToBase(costEur);
            if (yr > matYear) return 0;
            const yrsElapsed   = yr - curYear;
            const couponsAccum = annNet * Math.max(0, Math.min(yrsElapsed, matYear - curYear));
            const capGainIfMat = (yr === matYear) ? Math.max(0, faceEur - costEur) : 0;
            return _cgToBase(costEur + couponsAccum + capGainIfMat);
        });

        const bondLabel = issuerCount[b.issuer] > 1
            ? `${b.issuer} ${b.isin} (${(b.maturity||'').slice(0,4)})`
            : `${b.issuer} (${(b.maturity||'').slice(0,4)})`;

        return { isin: b.isin, label: bondLabel, data };
    });

    // Add virtual "replacement bond" series for each maturity_replacement scenario
    _getAllMatReplacementCs().filter(cs => cs._type === 'maturity_replacement').forEach(cs => {
        const src = portfolio.find(b => b.isin === cs.sourceBond?.isin);
        if (!src) return;
        const srcMatYear  = new Date(src.maturity).getFullYear();
        const replMatYear = cs.maturityYear;
        if (replMatYear <= srcMatYear) return;

        // Find redemption value of source bond at its maturity (from simResult if available)
        const srcSeries  = series.find(s => s.isin === src.isin);
        const srcMatIdx  = years.indexOf(srcMatYear);
        const startValue = srcSeries && srcMatIdx >= 0 ? srcSeries.data[srcMatIdx] : 0;

        const allYears = [...years];
        for (let y = Math.max(...years) + 1; y <= replMatYear; y++) allYears.push(y);

        const replAdjFact = Math.max(0.01, 1 + (cs.priceShift || 0) / 100);
        // units bought = startValue / replAdjFact; face = 1 per unit
        const replUnits = startValue / replAdjFact;

        const replData = allYears.map((yr, i) => {
            if (yr < srcMatYear) return null;
            if (yr === srcMatYear) return startValue;
            if (yr > replMatYear) return null;
            const yrsHeld  = Math.min(yr - srcMatYear, replMatYear - srcMatYear);
            const couponPerUnit = cs.netCouponPct / 100;
            if (cs.reinvestCoupons) {
                // Compound: each year coupons buy more units at replAdjFact price
                let u = replUnits;
                for (let y = 0; y < yrsHeld; y++) u += (u * couponPerUnit) / replAdjFact;
                return u * replAdjFact; // market value at replAdjFact price
            } else {
                // Linear: coupons to cash, capital gain at maturity
                const couponsCash = replUnits * couponPerUnit * yrsHeld;
                return replUnits * replAdjFact + couponsCash; // mkt value + cash coupons
            }
        });

        series.push({
            isin:  '_repl_' + cs.id,
            label: `${cs.name}: ${src.issuer} → new bond (${replMatYear})`,
            data:  replData,
            _isReplacement: true,
            _scenarioId: cs.id,
        });
    });

    return series;
}


// ═══════════════════════════════════════════════════════════════════════════
//  SCENARIO STATE MODEL  (v6.0)
//
//  Each scenario is a self-contained object:
//  {
//    id          : string   — unique (e.g. 'sc_1', 'sc_2')
//    label       : string   — user-editable display name
//    color       : string   — hex, auto-assigned, user-modifiable
//    couponReinvest : {
//        enabled      : bool,
//        globalPriceShift : number,
//        perIsin      : Map<isin, {priceShift}>
//    },
//    maturityReplacement : Map<isin, {
//        enabled, netCouponPct, priceShift, maturityYear, reinvestCoupons
//    }>,
//    injection : {
//        enabled    : bool,
//        amountEur  : number,
//        from       : number,   // year (absolute)
//        to         : number,   // year (absolute)
//        pct        : {isin → number}
//    }
//  }
// ═══════════════════════════════════════════════════════════════════════════

const SCENARIO_COLORS = [
    '#9e9e9e','#1e88e5','#e53935','#43a047','#ff6d00',
    '#8e24aa','#00897b','#f4511e','#1565c0','#558b2f',
];

let _scenarios       = [];   // array of scenario objects (see above)
let _activeScenarioId  = null; // which scenario the tabs are currently editing
let _scenariosDirty   = false; // true if scenarios modified since last export

// ── Chart state ───────────────────────────────────────────────────────────────
let _chart            = null;
let _chartBond        = null;
let _lastSimResult    = null;
let _lastStartCapital = 0;
let _lastPortfolio    = [];
let _hiddenScenarioIds    = new Set();
let _expandedScenarios    = new Set();

// ── No-reinvest benchmark (default - no reinv line shown below scenario panel) ──
// Computed from the first (or only) scenario's no-reinvest run, same portfolio.
// _nrBenchmark = { label, color, enabled, data, yearEvents, years, scale }
let _nrBenchmark = {
    label:   'default - no reinv',
    color:   '#9e9e9e',
    enabled: false,   // off by default; toggled by user
    data:    null,
    yearEvents: null,
    years:   null,
    scale:   1,
}; // which scenario IDs have per-bond rows shown in modal  // scenario ids hidden via legend click

// Compat: build flat list of maturity_replacement objects from new _scenarios model
// Used by buildBondTimeline, openYearDetailModal, renderBondYearChart
function _getAllMatReplacementCs() {
    const result = [];
    for (const sc of _scenarios) {
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


// ── Bond year chart selection ─────────────────────────────────────────────────
const BOND_COLORS_DARK  = ['#5b9bd5','#70c172','#ffd740','#ff7043','#ba68c8','#4dd0e1','#fff176','#a5d6a7','#ef9a9a','#90caf9'];
const BOND_COLORS_LIGHT = ['#1565c0','#2e7d32','#e65100','#6a1b9a','#00838f','#f9a825','#558b2f','#ad1457','#4527a0','#37474f'];
let _bondChartMode    = 'stacked';
let _selectedIsins    = new Set();

// ── Helpers ───────────────────────────────────────────────────────────────────

// Inline rename for scenario tab label.
// Creates a temporary <input> positioned over the label span.
function _startTabRename(scId, labelEl) {
    const sc = _scenarios.find(s => s.id === scId);
    if (!sc) return;

    // Measure label position for overlay input
    const rect = labelEl.getBoundingClientRect();
    const inp  = document.createElement('input');
    inp.type   = 'text';
    inp.value  = sc.label;
    inp.style.cssText = [
        'position:fixed',
        'left:'  + rect.left + 'px',
        'top:'   + rect.top  + 'px',
        'width:' + Math.max(rect.width + 20, 80) + 'px',
        'height:' + rect.height + 'px',
        'font-size:12px',
        'font-weight:700',
        'padding:0 4px',
        'border:1px solid #5b8dee',
        'border-radius:3px',
        'background:' + (document.body.classList.contains('dark') ? '#252840' : '#fff'),
        'color:inherit',
        'z-index:99999',
        'outline:none',
    ].join(';');

    document.body.appendChild(inp);
    inp.focus();
    inp.select();

    const finish = () => {
        const newLabel = inp.value.trim();
        if (inp.parentNode) inp.parentNode.removeChild(inp);
        if (newLabel && newLabel !== sc.label) {
            renameScenario(scId, newLabel);
        }
    };

    inp.addEventListener('blur',  finish);
    inp.addEventListener('keydown', e => {
        if (e.key === 'Enter')  { e.preventDefault(); inp.blur(); }
        if (e.key === 'Escape') { inp.value = sc.label; inp.blur(); }
    });
}

// Inline rename for scenario tab label — overlays a real <input> on dblclick
function _startTabRename(scId, labelEl) {
    const sc = _scenarios.find(s => s.id === scId);
    if (!sc) return;
    const rect = labelEl.getBoundingClientRect();
    const isDark = document.body.classList.contains('dark');
    const inp  = document.createElement('input');
    inp.type   = 'text';
    inp.value  = sc.label;
    inp.style.cssText =
        'position:fixed;left:' + rect.left + 'px;top:' + rect.top + 'px;' +
        'width:' + Math.max(rect.width + 20, 80) + 'px;height:' + rect.height + 'px;' +
        'font-size:12px;font-weight:700;padding:0 4px;' +
        'border:1px solid #5b8dee;border-radius:3px;' +
        'background:' + (isDark ? '#252840' : '#fff') + ';color:inherit;' +
        'z-index:99999;outline:none;box-sizing:border-box;';
    document.body.appendChild(inp);
    inp.focus();
    inp.select();
    const finish = () => {
        const newLabel = inp.value.trim();
        if (inp.parentNode) inp.parentNode.removeChild(inp);
        if (newLabel && newLabel !== sc.label) renameScenario(scId, newLabel);
    };
    inp.addEventListener('blur', finish);
    inp.addEventListener('keydown', e => {
        if (e.key === 'Enter')  { e.preventDefault(); inp.blur(); }
        if (e.key === 'Escape') { inp.value = sc.label; inp.blur(); }
    });
}

function _nextScenarioId() {
    let i = 1;
    while (_scenarios.find(s => s.id === 'sc_' + i)) i++;
    return 'sc_' + i;
}

function _nextScenarioColor() {
    // Pick first color not currently used
    for (const c of SCENARIO_COLORS) {
        if (!_scenarios.find(s => s.color === c)) return c;
    }
    return SCENARIO_COLORS[_scenarios.length % SCENARIO_COLORS.length];
}

function _defaultScenario(portfolio) {
    const today   = new Date().getFullYear();
    const lastYear = portfolio.length
        ? Math.max(...portfolio.map(b => new Date(b.maturity).getFullYear()))
        : today + 10;
    return {
        id:    _nextScenarioId(),
        label: 'Scenario ' + (_scenarios.length + 1),
        color: _nextScenarioColor(),
        couponReinvest: { enabled: false, globalPriceShift: 0, perIsin: new Map() },
        maturityReplacement: new Map(),  // isin → cfg
        injection: { enabled: false, amountEur: 1000, from: today, to: lastYear, pct: {}, fixed: {} },
        _autoDefault: false, // set to true only for the initial auto-created scenario
    };
}

// Convert a scenario into the customScenarios + injectionConfig format expected by simulate()
function _scenarioToSimArgs(sc, portfolio) {
    const customScenarios = [];
    const perIsinConfigs  = new Map();

    // Coupon reinvest
    if (sc.couponReinvest.enabled) {
        const csId = sc.id + '_cr';
        const csObj = {
            id: csId, _type: 'coupon_reinvest',
            name: sc.label,
            globalPriceShift: sc.couponReinvest.globalPriceShift,
        };
        customScenarios.push(csObj);
        if (sc.couponReinvest.perIsin.size > 0) {
            perIsinConfigs.set(csId, sc.couponReinvest.perIsin);
        }
    }

    // Maturity replacements (one per bond)
    sc.maturityReplacement.forEach((cfg, isin) => {
        if (!cfg.enabled) return;
        const b = portfolio.find(x => x.isin === isin);
        if (!b) return;
        const matYear = new Date(b.maturity).getFullYear();
        const csId    = sc.id + '_mr_' + isin;
        customScenarios.push({
            id:              csId,
            _type:           'maturity_replacement',
            name:            sc.label,
            sourceBond:      { isin, matYear },
            netCouponPct:    cfg.netCouponPct,
            priceShift:      cfg.priceShift,
            maturityYear:    cfg.maturityYear,
            reinvestCoupons: cfg.reinvestCoupons,
        });
    });

    // Injection
    const injCfg = sc.injection;
    const injectionConfig = injCfg.enabled
        ? {
            enabled:    true,
            amountEur:  injCfg.amountEur,
            from:       injCfg.from,
            to:         injCfg.to,
            pct:        injCfg.pct,
          }
        : { enabled: false, amountEur: 0, from: 0, to: 0, pct: {} };

    return { customScenarios, perIsinConfigs, injectionConfig };
}

// ── Injection helper: build injectionByYear respecting from/to ────────────────
// Overrides the generic one in simulate() — we rebuild it here with from/to support.
function _buildInjectionByYear(portfolio, injectionConfig, years) {
    if (!injectionConfig.enabled || injectionConfig.amountEur <= 0) return null;
    const injectionByYear = new Map();
    const { from, to, amountEur, pct } = injectionConfig;
    for (let yi = 1; yi < years.length; yi++) {
        const yr = years[yi];
        if (yr < from || yr > to) continue;
        const active = portfolio.filter(b => new Date(b.maturity).getFullYear() >= yr);
        if (!active.length) continue;
        const rawPcts  = active.map(b => ({ isin: b.isin, pct: pct[b.isin] ?? (100 / active.length) }));
        const totalRaw = rawPcts.reduce((s, x) => s + x.pct, 0);
        if (totalRaw <= 0) continue;
        const yearMap = new Map();
        rawPcts.forEach(x => {
            const amt = amountEur * (x.pct / totalRaw);
            if (amt > 0) yearMap.set(x.isin, amt);
        });
        injectionByYear.set(yr, yearMap);
    }
    return injectionByYear;
}

// ── Run simulation for a single scenario ─────────────────────────────────────
function _runScenarioSim(sc, portfolio, startCapital) {
    if (!portfolio.length) return null;

    const today     = new Date();
    const startYear = today.getFullYear();
    const endYear   = Math.max(startYear + 1, ...portfolio.map(b => new Date(b.maturity).getFullYear()));
    const years     = [];
    for (let y = startYear; y <= endYear; y++) years.push(y);

    const slots   = buildSlots(portfolio);
    const simBase = slots.reduce((s, sl) => s + sl.unitsHeld * sl.pricePerUnit, 0);
    const scale   = (simBase > 0 && startCapital > 0) ? startCapital / simBase : 1;
    const sc2arr  = arr => arr.map(v => isFinite(v) ? v * scale : 0);
    const totalPV = simBase;
    const wSAY    = totalPV > 0
        ? portfolio.reduce((s, b) => s + computeSAYNet(b) * (b.priceEur || 0) * b.quantity, 0) / totalPV
        : 3.0;

    const { customScenarios, perIsinConfigs, injectionConfig } = _scenarioToSimArgs(sc, portfolio);
    const injectionByYear = _buildInjectionByYear(portfolio, injectionConfig, years);

    // FX opts: pass startYear + reportCcy so each run function can call _fxCurveGet per year
    const fxOpts = { startYear: years[0], reportCcy: _cgBaseCcy() };

    // Always include a no_reinvest base for this scenario
    const { dataPoints: noRDP, yearEvents: noREV } =
        runScenario(slots, years, 'none', 0, wSAY, null, injectionByYear, fxOpts);

    // Determine mode: if any coupon reinvest or replacement → run that instead
    const hasCoupon  = customScenarios.some(cs => cs._type === 'coupon_reinvest');
    const hasReplace = customScenarios.some(cs => cs._type === 'maturity_replacement');

    let mainData, mainEvents, extYears;

    if (!hasCoupon && !hasReplace) {
        // Pure no-reinvest (with optional injection)
        mainData   = noRDP;
        mainEvents = noREV;
        extYears   = null;
    } else if (hasCoupon && !hasReplace) {
        // Coupon reinvest only
        const csObj   = customScenarios.find(cs => cs._type === 'coupon_reinvest');
        const perIsin = perIsinConfigs.get(csObj.id) ||
            buildGlobalPriceShiftConfig(portfolio, csObj.globalPriceShift, wSAY);
        const { dataPoints, yearEvents } =
            runScenario(slots, years, 'same_bond', csObj.globalPriceShift, wSAY, perIsin, injectionByYear, fxOpts);
        mainData   = dataPoints;
        mainEvents = yearEvents;
        extYears   = null;
    } else if (hasReplace && !hasCoupon) {
        // Maturity replacement(s) only — combine all into one simulation
        // For multiple replacements we run the first and sequentially chain
        // (current engine supports one replacement per call; run the first enabled one)
        const repCs = customScenarios.filter(cs => cs._type === 'maturity_replacement');
        // Run all replacements stacked on no_reinvest base (use last one if multiple)
        const { dataPoints, yearEvents, extendedYears } =
            runMaturityReplacement(slots, years, repCs, injectionByYear, fxOpts);
        // Prefix with no_reinvest before activation year
        const noReinvByYear = new Map();
        noRDP.forEach((v, i) => noReinvByYear.set(years[i], v));
        // srcMatYear = earliest replacement activation (first bond to mature)
        const srcMatYear = Math.min(...repCs.map(r => r.sourceBond?.matYear || 9999));
        const maxRepMat  = Math.max(...repCs.map(r => r.maturityYear || 0));
        const allYears   = [...years];
        for (let y = endYear + 1; y <= maxRepMat; y++) allYears.push(y);
        mainData = allYears.map((yr, idx) => {
            if (yr < srcMatYear) return noReinvByYear.has(yr) ? noReinvByYear.get(yr) : null;
            return (idx < dataPoints.length && isFinite(dataPoints[idx])) ? dataPoints[idx] : null;
        });
        mainEvents = yearEvents;
        extYears   = allYears;
    } else {
        // Both coupon reinvest + replacement — coupon reinvest wins for non-replaced bonds.
        // Pre-activation years have real values (coupons reinvested normally on all bonds)
        // so we use dataPoints for ALL years (no null suppression before srcMatYear).
        const repCs = customScenarios.filter(cs => cs._type === 'maturity_replacement');
        const { dataPoints, yearEvents, extendedYears } =
            runMaturityReplacement(slots, years, repCs, injectionByYear, fxOpts);
        const maxRepMat = Math.max(...repCs.map(r => r.maturityYear || 0));
        const allYears  = [...years];
        for (let y = endYear + 1; y <= maxRepMat; y++) allYears.push(y);
        mainData = allYears.map((yr, idx) => {
            // Never suppress pre-activation data when coupon reinvest is active
            return (idx < dataPoints.length && isFinite(dataPoints[idx])) ? dataPoints[idx] : null;
        });
        mainEvents = yearEvents;
        extYears   = allYears;
    }

    return {
        id:       sc.id,
        label:    sc.label,
        color:    sc.color,
        data:     sc2arr(mainData),
        yearEvents: mainEvents,
        scale,
        _custom:  true,
        _extendedYears: extYears,
        _type:    hasReplace ? 'maturity_replacement' : hasCoupon ? 'coupon_reinvest' : 'no_reinvest',
        _sourceBond: hasReplace ? customScenarios.find(cs => cs._type==='maturity_replacement')?.sourceBond : null,
        _hasCouponReinvest: hasCoupon,  // true when couponReinvest + replacement coexist
        _wSAY:    wSAY,
        _years:   extYears || years,
    };
}

// Master simulate — runs no_reinvest baseline + all user scenarios
function simulateAll(portfolio, startCapital) {
    if (!portfolio.length) return { years: [], scenarios: [] };

    const today     = new Date();
    const startYear = today.getFullYear();
    const endYear   = Math.max(startYear + 1, ...portfolio.map(b => new Date(b.maturity).getFullYear()));
    const years     = [];
    for (let y = startYear; y <= endYear; y++) years.push(y);

    const slots   = buildSlots(portfolio);
    const simBase = slots.reduce((s, sl) => s + sl.unitsHeld * sl.pricePerUnit, 0);
    const scale   = (simBase > 0 && startCapital > 0) ? startCapital / simBase : 1;
    const sc2arr  = arr => arr.map(v => isFinite(v) ? v * scale : 0);
    const totalPV = simBase;
    const wSAY    = totalPV > 0
        ? portfolio.reduce((s, b) => s + computeSAYNet(b) * (b.priceEur || 0) * b.quantity, 0) / totalPV
        : 3.0;

    const resultScenarios = [];

    // Compute no-reinvest benchmark (always kept updated, shown only when enabled)
    {
        const { dataPoints: nrDP, yearEvents: nrEV } =
            runScenario(slots, years, 'none', 0, wSAY, null, null, { startYear: years[0], reportCcy: _cgBaseCcy() });
        _nrBenchmark.data       = sc2arr(nrDP);
        _nrBenchmark.yearEvents = nrEV;
        _nrBenchmark.years      = years;
        _nrBenchmark.scale      = scale;
    }

    // Each user scenario generates one line
    for (const sc of _scenarios) {
        const r = _runScenarioSim(sc, portfolio, startCapital);
        if (r) resultScenarios.push(r);
    }

    return { years, scenarios: resultScenarios, weightedSAY: wSAY, scale };
}

// ── renderSummaryStats ────────────────────────────────────────────────────────
// Shows stat cards for the ACTIVE scenario (or first scenario if none active).
function renderSummaryStats(portfolio, simResult, startCapital) {
    const el = document.getElementById('summaryStats');
    if (!el) return;

    const sym = _cgSym();
    const fmt = v => sym + _cgToBase(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
    const card = (lbl, val, sub = '') =>
        `<div class="cg-stat-card"><div class="cg-stat-label">${lbl}</div><div class="cg-stat-value">${val}</div>${sub ? `<div class="cg-stat-sub">${sub}</div>` : ''}</div>`;

    const isDark = document.body.classList.contains('dark');
    const border = isDark ? '#2a2d45' : '#e0e5f0';

    // Bond list (informative only, no checkboxes)
    const issuerCount = {};
    portfolio.forEach(b => { issuerCount[b.issuer] = (issuerCount[b.issuer] || 0) + 1; });

    const bondListHtml = portfolio.map((b, i) => {
        const COLORS = isDark ? BOND_COLORS_DARK : BOND_COLORS_LIGHT;
        const c       = COLORS[i % COLORS.length];
        const matStr  = (b.maturity || '').slice(0, 10);
        const matYear = matStr.slice(0, 4);
        const couponStr = typeof b.coupon === 'number' ? b.coupon.toFixed(2) + '%' : '—';
        return `<span style="display:inline-flex;align-items:center;gap:5px;margin:3px 10px 3px 0;font-size:11px;font-weight:600;">
            <span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${c};flex-shrink:0;"></span>
            <span style="font-family:monospace;letter-spacing:0;">${b.isin}</span>
            <span style="color:#888;font-weight:400;">(${b.issuer}, ${couponStr}, ${matYear})</span>
        </span>`;
    }).join('');

    // Stat cards: derive from active scenario's simResult entry
    function renderCards() {
        const portfolioCost = portfolio.reduce((s, b) => s + (b.totalEur || (b.priceEur || 0) * b.quantity), 0);
        const activeScId = _activeScenarioId || (_scenarios[0]?.id);
        const activeSimSc = simResult.scenarios?.find(s => s.id === activeScId);

        // Aggregate stats from _cgComputeCache (populated by POST /api/bonds/compute).
        // No BondScoreEngine formula replication here — values come from Java.
        let totStart = 0, totFinal = 0, totCoupons = 0, totFace = 0, maxHorizon = 0;
        portfolio.forEach(b => {
            const cached    = _cgComputeCache.get(b.isin);
            const bondCost  = b.totalEur || (b.priceEur || 0) * b.quantity;
            const share     = portfolioCost > 0 ? bondCost / portfolioCost : 0;
            const bondStart = startCapital * share;
            const horizon   = simResult.years ? simResult.years.length - 1 : 0;

            // Scale cached 1000€-basis values to actual bondStart
            const scale        = bondStart / 1000;
            const totalCoupons = (cached?.capCoupons ?? 0) * scale;
            const faceVal      = (cached?.capGain    ?? 0) * scale;

            totStart   += bondStart;
            totFinal   += totalCoupons + faceVal;
            totCoupons += totalCoupons;
            totFace    += faceVal;
            maxHorizon  = Math.max(maxHorizon, horizon);
        });

        // If active scenario has computed simulation data, use its final value
        if (activeSimSc?.data?.length > 0) {
            const last = activeSimSc.data.filter(v => v != null && isFinite(v)).slice(-1)[0];
            if (last) totFinal = last;
        }

        const cagr = (maxHorizon > 0 && totStart > 0 && totFinal > 0)
            ? (Math.pow(totFinal / totStart, 1 / maxHorizon) - 1) * 100 : 0;

        const scenLabel = _scenarios.find(s => s.id === activeScId)?.label || 'No reinvestment';

        const activeSc2 = _scenarios.find(s => s.id === activeScId);
        const scColor2  = activeSc2?.color || '#888';
        const statsHeader = `<div style="width:100%;font-size:10px;font-weight:600;color:#888;
            text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px;">
            Stats — <span style="color:${scColor2};font-size:11px;">${scenLabel}</span>
        </div>`;
        return statsHeader +
            card('Initial Capital',   fmt(totStart)) +
            card('Final Value',       fmt(totFinal), 'at horizon') +
            card('Total Net Coupons', fmt(totCoupons), 'over full horizon') +
            card('Capital Returned',  fmt(totFace), 'face value × qty') +
            card('Horizon',           `${maxHorizon} yrs`) +
            card('CAGR',              `${cagr.toFixed(2)}%`, 'compound annual');
    }

    el.innerHTML = `
        <div id="cgBondList" style="padding-bottom:8px;border-bottom:1px solid ${border};margin-bottom:10px;flex-wrap:wrap;display:flex;align-items:center;">
            <div style="font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px;width:100%;">Portfolio</div>
            ${bondListHtml}
        </div>
        <div id="cgStatsCards" style="display:flex;flex-wrap:wrap;gap:10px;">${renderCards()}</div>`;

    // Store refresh function
    window._cgStatsRefresh = function() {
        const el2 = document.getElementById('cgStatsCards');
        if (el2) el2.innerHTML = renderCards();
    };
}

// ── renderGrowthChart ─────────────────────────────────────────────────────────
// (replaced inline to support new scenario model — logic mostly unchanged)
function renderGrowthChart(simResult, startCapital) {
    const canvas = document.getElementById('growthChart');
    if (!canvas) return;
    if (_chart) { _chart.destroy(); _chart = null; }

    const isDark     = document.body.classList.contains('dark');
    const gridColor  = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
    const labelColor = isDark ? '#8890b8' : '#666';
    const sym        = _cgSym();
    const base0      = _cgToBase(startCapital);

    const allLabels = [...simResult.years];
    simResult.scenarios.forEach(s => {
        if (s._extendedYears) s._extendedYears.forEach(y => { if (!allLabels.includes(y)) allLabels.push(y); });
    });
    allLabels.sort((a, b) => a - b);

    if (!window._cgInitialized) {
        window._cgInitialized = true;
    } else {
        const validIds = new Set(simResult.scenarios.map(s => s.id));
        _hiddenScenarioIds.forEach(id => { if (!validIds.has(id)) _hiddenScenarioIds.delete(id); });
    }

    const datasets = simResult.scenarios.map(s => {
        const yearList = s._extendedYears || simResult.years;
        const aligned = allLabels.map(yr => {
            const idx = yearList.indexOf(yr);
            if (idx < 0 || idx >= s.data.length) return null;
            const v = s.data[idx];
            return (v !== null && isFinite(v)) ? _cgToBase(v) : null;
        });
        const isHidden = _hiddenScenarioIds.has(s.id);
        return {
            label:           s.label,
            data:            aligned,
            borderColor:     s.color,
            backgroundColor: s.color + '18',
            borderWidth:     2.2,
            pointRadius:     allLabels.length > 15 ? 0 : 3,
            tension:         0.3,
            fill:            false,
            spanGaps:        false,
            hidden:          isHidden,
            _scenId:         s.id,
        };
    });

    _chart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels: allLabels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            onClick: (evt, elements) => {
                if (!elements.length) return;
                const clickedYear = allLabels[elements[0].index];
                openYearDetailModal(clickedYear, allLabels.indexOf(clickedYear), simResult, startCapital, allLabels);
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: labelColor, font: { size: 11 }, padding: 14, boxWidth: 26, usePointStyle: true },
                    onClick: (evt, legendItem, legend) => {
                        const chart  = legend.chart;
                        const idx    = legendItem.datasetIndex;
                        const meta   = chart.getDatasetMeta(idx);
                        meta.hidden  = meta.hidden === null ? !chart.data.datasets[idx].hidden : !meta.hidden;
                        const scenId = chart.data.datasets[idx]._scenId || legendItem.text;
                        if (meta.hidden) _hiddenScenarioIds.add(scenId);
                        else             _hiddenScenarioIds.delete(scenId);
                        chart.update();
                    },
                },
                tooltip: {
                    callbacks: {
                        title: ctx => `📅 ${ctx[0].label}  · click for details`,
                        label: ctx => {
                            const v = ctx.parsed.y;
                            if (v == null || !isFinite(v)) return null;
                            const gain = v - base0;
                            const sign = gain >= 0 ? '+' : '';
                            const f = n => Math.round(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
                            return ` ${ctx.dataset.label}: ${sym}${f(v)} (${sign}${sym}${f(gain)})`;
                        },
                    },
                },
            },
            scales: {
                x: { ticks: { color: labelColor, font: { size: 11 } }, grid: { color: gridColor } },
                y: {
                    ticks: {
                        color: labelColor, font: { size: 11 },
                        callback: v => isFinite(v) ? sym + Math.round(v).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '',
                    },
                    grid: { color: gridColor },
                },
            },
        },
    });

    // ── Zoom / Pan via mouse wheel + drag ──────────────────────────────────
    // We store zoom state in _chart._cgZoom: { minIdx, maxIdx }
    const nLabels = allLabels.length;
    _chart._cgZoom = { minIdx: 0, maxIdx: nLabels - 1 };

    function _applyZoom() {
        const { minIdx, maxIdx } = _chart._cgZoom;
        _chart.options.scales.x.min = allLabels[minIdx];
        _chart.options.scales.x.max = allLabels[maxIdx];
        _chart.update('none');
    }
    function _resetZoom() {
        _chart._cgZoom = { minIdx: 0, maxIdx: nLabels - 1 };
        _chart.options.scales.x.min = undefined;
        _chart.options.scales.x.max = undefined;
        _chart.update('none');
    }

    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        const z = _chart._cgZoom;
        const span = z.maxIdx - z.minIdx;
        const delta = Math.sign(e.deltaY);
        const step = Math.max(1, Math.round(span * 0.12));
        if (delta > 0) {
            // zoom out
            z.minIdx = Math.max(0, z.minIdx - step);
            z.maxIdx = Math.min(nLabels - 1, z.maxIdx + step);
        } else {
            // zoom in (toward cursor position)
            const rect = canvas.getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / rect.width;
            const shrinkLeft  = Math.round(step * ratio);
            const shrinkRight = step - shrinkLeft;
            const newMin = Math.min(z.minIdx + shrinkLeft, z.maxIdx - 4);
            const newMax = Math.max(z.maxIdx - shrinkRight, z.minIdx + 4);
            z.minIdx = newMin; z.maxIdx = newMax;
        }
        if (z.maxIdx - z.minIdx >= nLabels - 1) { _resetZoom(); return; }
        _applyZoom();
    }, { passive: false });

    // Double-click to reset zoom
    canvas.addEventListener('dblclick', () => _resetZoom());

    // Drag to pan
    let _dragStart = null;
    canvas.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        const z = _chart._cgZoom;
        if (z.maxIdx - z.minIdx >= nLabels - 1) return; // no zoom → no pan
        _dragStart = { x: e.clientX, minIdx: z.minIdx, maxIdx: z.maxIdx };
        canvas.style.cursor = 'grabbing';
    });
    canvas.addEventListener('mousemove', e => {
        if (!_dragStart) return;
        const z = _chart._cgZoom;
        const span = z.maxIdx - z.minIdx;
        const rect = canvas.getBoundingClientRect();
        const pxPerLabel = rect.width / (span + 1);
        const dx = Math.round((_dragStart.x - e.clientX) / pxPerLabel);
        const newMin = Math.max(0, Math.min(_dragStart.minIdx + dx, nLabels - 1 - span));
        z.minIdx = newMin;
        z.maxIdx = newMin + span;
        _applyZoom();
    });
    const _stopDrag = () => { _dragStart = null; canvas.style.cursor = 'pointer'; };
    canvas.addEventListener('mouseup', _stopDrag);
    canvas.addEventListener('mouseleave', _stopDrag);

    // Show hint in chart title area
    const titleEl = canvas.closest('.cg-chart-section')?.querySelector('.cg-chart-title');
    if (titleEl && !titleEl.querySelector('.cg-zoom-hint')) {
        titleEl.insertAdjacentHTML('beforeend',
            `<span class="cg-zoom-hint" style="margin-left:auto;font-size:10px;color:#5a6080;white-space:nowrap;">
                scroll to zoom &nbsp;·&nbsp; drag to pan &nbsp;·&nbsp; double-click to reset
            </span>`);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  PER-ISIN PANEL  — scenario tabs + 3 sub-tabs
// ═══════════════════════════════════════════════════════════════════════════

// Sub-tab HTML helper — extracted to avoid triple template literal nesting
function _buildSubTabHtml(isDark, border) {
    const sc = _scenarios.find(s => s.id === _activeScenarioId);
    // Only hide sub-tabs for the initial auto-created scenario (before user touches anything)
    if (sc?._autoDefault) return '';
    const color = isDark ? '#8890b8' : '#888';
    const bg    = isDark ? '#1a1d2e' : '#fafbff';
    const tabs  = {coupon:'📈 Coupon reinvest', replacement:'🔄 Maturity replacement', injection:'💰 Annual injection'};
    const btnHtml = Object.entries(tabs).map(([t, lbl]) =>
        '<button id="cgTab_' + t + '" class="cg-tab-btn" data-subtab="' + t + '"'
        + ' style="flex:1;padding:8px 6px;font-size:11px;font-weight:600;border:none;cursor:pointer;'
        + 'border-bottom:2px solid transparent;background:transparent;color:' + color + ';">'
        + lbl + '</button>'
    ).join('');
    return '<div>'
        + '<div style="display:flex;align-items:stretch;background:' + bg + ';border-bottom:1px solid ' + border + ';">'
        + btnHtml
        + '</div>'
        + '<div style="padding:12px 14px;">'
        + '<div id="cgTabBody_coupon" style="display:none;"></div>'
        + '<div id="cgTabBody_replacement" style="display:none;"></div>'
        + '<div id="cgTabBody_injection" style="display:none;"></div>'
        + '</div></div>';
}


function buildPerIsinPanel(portfolio, simResult) {
    const panel = document.getElementById('perIsinPanel');
    if (!panel) return;

    const isDark = document.body.classList.contains('dark');
    const bg     = isDark ? '#1e2338' : '#fff';
    const border = isDark ? '#2a2d45' : '#dde3ee';
    const tabBg  = isDark ? '#252840' : '#f0f4ff';

    // Keep active scenario and sub-tab across re-renders
    const prevSubTab = panel._activeSubTab || 'coupon';

    // Ensure activeScenarioId points to a valid scenario
    if (_scenarios.length > 0 && !_scenarios.find(s => s.id === _activeScenarioId)) {
        _activeScenarioId = _scenarios[0].id;
    }

    // ── Scenario tab bar ──────────────────────────────────────────────────
    const scenTabHtml = _scenarios.map(sc => {
        const isActive = sc.id === _activeScenarioId;
        const actStyle = isActive
            ? `background:${bg};border-bottom:2px solid ${sc.color};font-weight:700;color:${isDark?'#e0e4ff':'#1a2a4a'};`
            : `background:transparent;border-bottom:2px solid transparent;font-weight:600;color:${isDark?'#8890b8':'#888'};`;
        // Tab is a <button> so entire area is clickable natively.
        // Double-click on label activates an <input> overlay for inline rename.
        return `<button class="cg-sc-tab" data-scid="${sc.id}" type="button"
            style="display:inline-flex;align-items:center;gap:6px;padding:8px 12px;cursor:pointer;font-size:12px;border:none;border-bottom:2px solid transparent;white-space:nowrap;background:transparent;${actStyle}"
            onclick="selectScenario('${sc.id}')">
            <span class="cg-sc-color-dot" style="width:9px;height:9px;border-radius:50%;background:${sc.color};flex-shrink:0;cursor:pointer;"
                title="Change color" onclick="event.stopPropagation();pickScenarioColor('${sc.id}',this)"></span>
            <span class="cg-sc-label" data-scid="${sc.id}"
                style="position:relative;min-width:40px;max-width:120px;overflow:hidden;white-space:nowrap;display:inline-block;vertical-align:middle;"
                ondblclick="event.stopPropagation();_startTabRename('${sc.id}',this)">${sc.label}</span>
            <span onclick="event.stopPropagation();deleteScenario('${sc.id}')"
                title="Delete scenario"
                style="cursor:pointer;color:#999;font-size:13px;line-height:1;padding:0 1px;margin-left:2px;display:inline-block;"
                onmouseover="this.style.color='#e53935'" onmouseout="this.style.color='#999'">×</span>
        </button>`;
    }).join('');

    const newBtnStyle = `display:inline-flex;align-items:center;gap:4px;padding:8px 12px;cursor:pointer;font-size:12px;font-weight:600;background:transparent;border:none;border-bottom:2px solid transparent;color:${isDark?'#4a7cc7':'#1a73e8'};white-space:nowrap;`;

    // Ensure the benchmark panel container exists adjacent to perIsinPanel
    let benchPanelEl = document.getElementById('cgNrBenchPanel');
    if (!benchPanelEl) {
        benchPanelEl = document.createElement('div');
        benchPanelEl.id = 'cgNrBenchPanel';
        panel.parentNode.insertBefore(benchPanelEl, panel.nextSibling);
    }

    panel.innerHTML = `
        <div class="cg-scenario-panel" style="padding:0;overflow:hidden;">

            <!-- Scenario tab row -->
            <div style="display:flex;align-items:stretch;background:${tabBg};border-bottom:1px solid ${border};overflow-x:auto;gap:0;">
                ${scenTabHtml}
                <button onclick="addScenario()" style="${newBtnStyle}" title="Add new scenario">＋ New scenario</button>
                <div style="margin-left:auto;display:flex;align-items:center;gap:6px;padding:4px 12px;">
                    <button onclick="exportScenarios()" title="Export scenarios to JSON"
                        style="background:none;border:1px solid ${isDark?'#3a3f60':'#bbb'};color:${isDark?'#8890b8':'#666'};border-radius:4px;padding:3px 8px;font-size:10px;cursor:pointer;">
                        ↑ Export
                    </button>
                    <button onclick="document.getElementById('cgScImport').click()" title="Import scenarios from JSON"
                        style="background:none;border:1px solid ${isDark?'#3a3f60':'#bbb'};color:${isDark?'#8890b8':'#666'};border-radius:4px;padding:3px 8px;font-size:10px;cursor:pointer;">
                        ↓ Import
                    </button>
                    <input type="file" id="cgScImport" accept=".json" style="display:none" onchange="importScenarios(event)">
                </div>
            </div>

            ${_scenarios.length === 0 ? `
            <div style="padding:20px;text-align:center;color:#888;font-size:12px;">
                No scenarios yet. Click <strong>＋ New scenario</strong> to begin.
            </div>` : `
            <!-- Sub-tab row (hidden for virgin no-config scenarios) -->
            ${_buildSubTabHtml(isDark, border)}
            `}

        </div>`;

    panel._activeSubTab = prevSubTab;

    if (_scenarios.length > 0) {
        // Wire data-subtab buttons (no inline onclick to avoid escaping issues)
        panel.querySelectorAll('[data-subtab]').forEach(btn => {
            btn.addEventListener('click', () => switchScenarioSubTab(btn.dataset.subtab));
        });
        renderCouponTab(portfolio, simResult?.weightedSAY || 3, isDark, border);
        renderReplacementTab(portfolio, isDark, border);
        renderInjectionTab(portfolio, isDark, border);
        switchScenarioSubTab(prevSubTab);
    }
}

function switchScenarioSubTab(tab) {
    const isDark = document.body.classList.contains('dark');
    const activeSc = _scenarios.find(s => s.id === _activeScenarioId);
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

function addScenario() {
    if (_scenarios.length >= 5) {
        alert('Maximum 5 scenarios supported.');
        return;
    }
    const sc = _defaultScenario(_lastPortfolio);
    _scenarios.push(sc);
    _activeScenarioId = sc.id;
    _hiddenScenarioIds.delete(sc.id);
    _scenariosDirty = true;
    buildPerIsinPanel(_lastPortfolio, _lastSimResult || { weightedSAY: 3 });
    triggerSimulation();
}

function deleteScenario(id) {
    if (_scenarios.length <= 1) {
        // Last scenario — just reset it
        _scenarios = [];
        _activeScenarioId = null;
    } else {
        const idx = _scenarios.findIndex(s => s.id === id);
        _scenarios = _scenarios.filter(s => s.id !== id);
        _hiddenScenarioIds.delete(id);
        if (_activeScenarioId === id) {
            _activeScenarioId = _scenarios[Math.max(0, idx - 1)]?.id || _scenarios[0]?.id || null;
        }
    }
    _scenariosDirty = true;
    buildPerIsinPanel(_lastPortfolio, _lastSimResult || { weightedSAY: 3 });
    triggerSimulation();
}

function selectScenario(id) {
    if (_activeScenarioId === id) return;
    _activeScenarioId = id;
    const panel = document.getElementById('perIsinPanel');
    const prevSubTab = panel?._activeSubTab || 'coupon';
    buildPerIsinPanel(_lastPortfolio, _lastSimResult || { weightedSAY: 3 });
    switchScenarioSubTab(prevSubTab);
    if (window._cgStatsRefresh) window._cgStatsRefresh();
}

function renameScenario(id, newLabel) {
    const sc = _scenarios.find(s => s.id === id);
    if (!sc || !newLabel || sc.label === newLabel) return;
    sc.label = newLabel;
    _scenariosDirty = true;
    triggerSimulation();
}

function pickScenarioColor(id, dotEl) {
    const sc = _scenarios.find(s => s.id === id);
    if (!sc) return;
    // Simple color picker: cycle through palette
    const idx  = SCENARIO_COLORS.indexOf(sc.color);
    sc.color   = SCENARIO_COLORS[(idx + 1) % SCENARIO_COLORS.length];
    dotEl.style.background = sc.color;
    triggerSimulation();
}

// ── Sub-tab renderers ─────────────────────────────────────────────────────────

function _activeSc() { return _scenarios.find(s => s.id === _activeScenarioId); }
function _activeScOrFirst() { return _activeSc() || _scenarios[0]; }

function renderCouponTab(portfolio, wSAY, isDark, border) {
    const el = document.getElementById('cgTabBody_coupon');
    if (!el) return;
    const sc = _activeScOrFirst();
    if (!sc) { el.innerHTML = '<p style="color:#888;font-size:12px;">No scenario selected.</p>'; return; }
    const inpSt = `font-size:11px;padding:3px 6px;border-radius:4px;border:1px solid ${border};background:${isDark?'#1e2338':'#fff'};color:inherit;`;
    const cr    = sc.couponReinvest;

    if (!cr.enabled) {
        el.innerHTML = `
            <p style="font-size:12px;color:#888;margin:0 0 10px;">
                Reinvest coupons into the same bond at a configured price.
            </p>
            <button class="cg-btn-secondary" style="font-size:12px;padding:6px 16px;"
                onclick="setCouponEnabled(true)">＋ Enable coupon reinvestment</button>`;
        return;
    }

    const overrideRows = portfolio.map(b => {
        const cfg     = cr.perIsin.get(b.isin) || {};
        const hasOvr  = cr.perIsin.has(b.isin);
        const label   = portfolio.filter(x => x.issuer === b.issuer).length > 1
            ? `${b.issuer} <span style="font-family:monospace;font-size:9px;opacity:0.6">${b.isin}</span>`
            : b.issuer;
        return `<tr style="vertical-align:middle;">
            <td style="padding:5px 8px;">${label} <span style="font-size:9px;color:#888">(${(b.maturity || '').slice(0, 4)})</span></td>
            <td style="padding:5px 8px;text-align:center;">
                <input type="checkbox" ${hasOvr ? 'checked' : ''} onchange="toggleCouponOverride('${b.isin}',this.checked)">
            </td>
            <td style="padding:5px 8px;text-align:center;">
                <input type="number" ${hasOvr ? '' : 'disabled'} value="${cfg.priceShift ?? cr.globalPriceShift}" min="-500" max="500" step="1"
                    data-coupon-isin-shift="${b.isin}"
                    onchange="updateCouponOverride('${b.isin}','priceShift',parseFloat(this.value)||0)"
                    style="${inpSt}width:65px;text-align:right;">
            </td>
        </tr>`;
    }).join('');

    // Render immediately with placeholder; update SAY async from backend
    el.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
            <span style="font-size:11px;color:#888;">Weighted SAY: <strong style="color:#70c172;">${wSAY.toFixed(2)}%</strong></span>
            <button onclick="setCouponEnabled(false)"
                style="margin-left:auto;background:transparent;border:1px solid #c62828;color:#e57373;border-radius:4px;padding:3px 10px;font-size:11px;cursor:pointer;">
                Remove
            </button>
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
    // Async: fetch shifted SAY from backend, update label once resolved
    computeEffectiveSAY(portfolio, cr.globalPriceShift).then(say => {
        const span = document.getElementById('cgEffSAY');
        if (span) span.textContent = say.toFixed(2) + '%';
    });
}

function renderReplacementTab(portfolio, isDark, border) {
    const el = document.getElementById('cgTabBody_replacement');
    if (!el) return;
    const sc = _activeScOrFirst();
    if (!sc) { el.innerHTML = '<p style="color:#888;font-size:12px;">No scenario selected.</p>'; return; }
    if (!portfolio.length) { el.innerHTML = '<p style="color:#888;font-size:12px;">No bonds loaded.</p>'; return; }
    const inpSt = `font-size:11px;padding:3px 6px;border-radius:4px;border:1px solid ${border};background:${isDark?'#1e2338':'#fff'};color:inherit;`;
    const wSAY  = _lastSimResult?.weightedSAY || 3;

    const rows = portfolio.map(b => {
        const matYear = new Date(b.maturity).getFullYear();
        const label   = portfolio.filter(x => x.issuer === b.issuer).length > 1
            ? `${b.issuer} <span style="font-family:monospace;font-size:10px;opacity:0.7">${b.isin}</span>`
            : b.issuer;
        const cfg     = sc.maturityReplacement.get(b.isin);
        const enabled = cfg?.enabled || false;

        if (!enabled) {
            const couponStr = typeof b.coupon === 'number' ? b.coupon.toFixed(2) + '%' : '—';
            return `<div style="padding:8px 0;border-bottom:1px solid ${border};display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                <span style="font-size:12px;font-weight:600;min-width:120px;">${label} <span style="font-family:monospace;font-size:10px;opacity:0.7">(${couponStr})</span></span>
                <span style="font-size:11px;color:#888;">matures ${matYear}</span>
                <button class="cg-btn-secondary" style="font-size:11px;padding:3px 10px;margin-left:auto;"
                    onclick="enableReplacement('${b.isin}')">＋ Add replacement</button>
            </div>`;
        }

        const couponStr = typeof b.coupon === 'number' ? b.coupon.toFixed(2) + '%' : '—';
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
                    <input type="number" value="${cfg.priceShift ?? 0}" min="-500" max="500" step="1"
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
                            <option value="true"  ${cfg.reinvestCoupons ? 'selected' : ''}>Reinvest</option>
                            <option value="false" ${!cfg.reinvestCoupons ? 'selected' : ''}>Cash</option>
                          </select>`
                        : `<span style="font-size:11px;padding:3px 6px;color:#888;font-style:italic;">Cash</span>`
                    }
                </label>
            </div>
        </div>`;
    }).join('');

    el.innerHTML = `
        <p style="font-size:11px;color:#888;margin:0 0 10px;">
            When a bond matures, proceeds are reinvested into a new synthetic bond. Configure one replacement per bond.
        </p>
        ${rows}`;
}

function renderInjectionTab(portfolio, isDark, border) {
    const el = document.getElementById('cgTabBody_injection');
    if (!el) return;
    const sc = _activeScOrFirst();
    if (!sc) { el.innerHTML = '<p style="color:#888;font-size:12px;">No scenario selected.</p>'; return; }
    const inpSt = `font-size:11px;padding:3px 6px;border-radius:4px;border:1px solid ${border};background:${isDark?'#1e2338':'#fff'};color:inherit;`;
    const inj   = sc.injection;
    const sym   = _cgSym();
    const today = new Date().getFullYear();
    const activeBonds = portfolio.filter(b => new Date(b.maturity).getFullYear() > today);
    const totalPct = activeBonds.reduce((s, b) => s + (inj.pct[b.isin] ?? 0), 0);

    const bondRows = activeBonds.map(b => {
        const matYear  = new Date(b.maturity).getFullYear();
        const couponStr = typeof b.coupon === 'number' ? b.coupon.toFixed(2) + '%' : '—';
        const label    = portfolio.filter(x => x.issuer === b.issuer).length > 1
            ? `${b.issuer} <span style="font-family:monospace;font-size:10px;opacity:0.7">${b.isin}</span>`
            : b.issuer;
        const pct    = inj.pct[b.isin] ?? (100 / Math.max(1, activeBonds.length));
        const isFixed = !!(inj.fixed && inj.fixed[b.isin]);
        return `<tr>
            <td style="padding:5px 8px;">
                ${label}
                <span style="font-size:9px;color:#888">(${matYear})</span>
                <span style="font-size:9px;color:#90caf9;margin-left:4px;">${couponStr}</span>
            </td>
            <td style="padding:5px 8px;text-align:center;">
                <input type="number" value="${pct.toFixed(1)}" min="0" max="100" step="0.1"
                    onchange="updateInjectionPct('${b.isin}',parseFloat(this.value)||0)"
                    style="${inpSt}width:65px;text-align:right;" ${inj.enabled ? '' : 'disabled'}>
                <span style="font-size:10px;color:#888;">%</span>
            </td>
            <td style="padding:5px 8px;text-align:center;">
                <input type="checkbox" title="Fix this allocation — not affected by Redistribute"
                    ${isFixed ? 'checked' : ''}
                    ${inj.enabled ? '' : 'disabled'}
                    onchange="updateInjectionFixed('${b.isin}',this.checked)"
                    style="cursor:pointer;accent-color:#90caf9;">
            </td>
        </tr>`;
    }).join('');

    const lastYear = portfolio.length
        ? Math.max(...portfolio.map(b => new Date(b.maturity).getFullYear())) : today + 10;

    el.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;cursor:pointer;">
                <input type="checkbox" ${inj.enabled ? 'checked' : ''} onchange="setInjectionEnabled(this.checked)">
                Enable annual injection
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;">
                <span style="color:#888;">${sym} per year</span>
                <input type="number" value="${_cgToBase(inj.amountEur).toFixed(0)}" min="0" step="100"
                    onchange="updateInjectionAmount(_cgFromBase(parseFloat(this.value)||0))"
                    style="${inpSt}width:100px;text-align:right;" ${inj.enabled ? '' : 'disabled'}>
            </label>
        </div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;">
                <span style="color:#888;">From year</span>
                <input type="number" value="${inj.from}" min="${today}" max="2200" step="1"
                    onchange="updateInjectionRange('from',parseInt(this.value)||${today})"
                    style="${inpSt}width:75px;text-align:center;" ${inj.enabled ? '' : 'disabled'}>
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;">
                <span style="color:#888;">To year</span>
                <input type="number" value="${inj.to}" min="${today}" max="2200" step="1"
                    onchange="updateInjectionRange('to',parseInt(this.value)||${lastYear})"
                    style="${inpSt}width:75px;text-align:center;" ${inj.enabled ? '' : 'disabled'}>
            </label>
        </div>
        <p style="font-size:11px;color:#888;margin:0 0 8px;">
            Each year in [from, to], the amount is split across <em>active</em> (non-matured) bonds per the % below.
            If a bond matures, its % is redistributed proportionally to remaining bonds.
        </p>
        ${activeBonds.length ? `
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
            <thead><tr style="color:#888;">
                <th style="text-align:left;padding:4px 8px;">Bond</th>
                <th style="padding:4px 8px;text-align:center;">Allocation %</th>
                <th style="padding:4px 8px;text-align:center;" title="Fixed — not changed by Redistribute">Fixed</th>
            </tr></thead>
            <tbody>${bondRows}
            <tr>
                <td colspan="3" style="padding:6px 8px;text-align:right;">
                    <span style="font-size:10px;color:${Math.abs(totalPct - 100) < 0.5 ? '#70c172' : '#ff7043'};margin-right:10px;">
                        Total: <strong>${totalPct.toFixed(1)}%</strong>
                        ${Math.abs(totalPct - 100) > 0.5 ? ' — should sum to 100%' : ' ✓'}
                    </span>
                    <button onclick="redistributeInjectionPct()"
                        ${inj.enabled ? '' : 'disabled'}
                        title="Split remaining % equally among non-fixed bonds"
                        style="font-size:11px;padding:3px 10px;cursor:pointer;border-radius:4px;
                               background:transparent;border:1px solid ${isDark?'#4a7cc7':'#1a73e8'};
                               color:${isDark?'#90caf9':'#1a73e8'};">
                        ↺ Redistribute
                    </button>
                </td>
            </tr>
            </tbody>
        </table>` : '<p style="color:#888;font-size:11px;">No active bonds.</p>'}`;
}

// ── Coupon reinvest handlers ──────────────────────────────────────────────────

function setCouponEnabled(enabled) {
    const sc = _activeSc(); if (!sc) return;
    sc.couponReinvest.enabled = enabled;
    _rebuildPanel();
    triggerSimulation();
}

function updateCouponGlobal(val) {
    const sc = _activeSc(); if (!sc) return;
    sc.couponReinvest.globalPriceShift = val;
    // Propagate to all per-isin override inputs (so they start from global value when toggled)
    document.querySelectorAll('input[data-coupon-isin-shift]').forEach(inp => {
        inp.value = val;
        const isin = inp.dataset.couponIsinShift;
        // If this isin already has an override active, also update the stored value
        if (sc.couponReinvest.perIsin.has(isin)) {
            const cfg = sc.couponReinvest.perIsin.get(isin);
            cfg.priceShift = val;
        }
    });
    triggerSimulation();
}

function toggleCouponOverride(isin, checked) {
    const sc = _activeSc(); if (!sc) return;
    if (checked) {
        if (!sc.couponReinvest.perIsin.has(isin)) {
            // Pre-populate with current global value so the input already reflects it
            sc.couponReinvest.perIsin.set(isin, { priceShift: sc.couponReinvest.globalPriceShift });
        }
    } else {
        sc.couponReinvest.perIsin.delete(isin);
    }
    _rebuildCouponTab();
    triggerSimulation();
}

function updateCouponOverride(isin, field, value) {
    const sc = _activeSc(); if (!sc) return;
    const cfg = sc.couponReinvest.perIsin.get(isin);
    if (cfg) { cfg[field] = value; triggerSimulation(); }
}

// ── Maturity replacement handlers ─────────────────────────────────────────────

function enableReplacement(isin) {
    const sc = _activeSc(); if (!sc) return;
    const b  = _lastPortfolio.find(x => x.isin === isin); if (!b) return;
    const matYear = new Date(b.maturity).getFullYear();
    const wSAY    = _lastSimResult?.weightedSAY || 3;
    sc.maturityReplacement.set(isin, {
        enabled:         true,
        _matYear:        matYear,
        netCouponPct:    Math.round(wSAY * 100) / 100,
        priceShift:      0,
        maturityYear:    matYear + 10,
        reinvestCoupons: false,
    });
    _rebuildPanel();
    triggerSimulation();
}

function disableReplacement(isin) {
    const sc = _activeSc(); if (!sc) return;
    sc.maturityReplacement.delete(isin);
    _rebuildPanel();
    triggerSimulation();
}

function updateReplacement(isin, field, value) {
    const sc  = _activeSc(); if (!sc) return;
    const cfg = sc.maturityReplacement.get(isin);
    if (cfg) { cfg[field] = value; triggerSimulation(); }
}

// ── Injection handlers ────────────────────────────────────────────────────────

function setInjectionEnabled(enabled) {
    const sc = _activeSc(); if (!sc) return;
    sc.injection.enabled = enabled;
    // When enabling: if pct map is empty, populate with equal-split defaults so totalPct = 100%
    if (enabled && _lastPortfolio?.length) {
        const today = new Date().getFullYear();
        const activeBonds = _lastPortfolio.filter(b => new Date(b.maturity).getFullYear() > today);
        const hasPct = activeBonds.some(b => (sc.injection.pct[b.isin] ?? 0) > 0);
        if (!hasPct && activeBonds.length > 0) {
            const defaultPct = +(100 / activeBonds.length).toFixed(4);
            activeBonds.forEach(b => { sc.injection.pct[b.isin] = defaultPct; });
        }
    }
    _rebuildInjectionTab();
    triggerSimulation();
}

function updateInjectionAmount(amountEur) {
    const sc = _activeSc(); if (!sc) return;
    sc.injection.amountEur = amountEur;
    triggerSimulation();
}

function updateInjectionRange(field, value) {
    const sc = _activeSc(); if (!sc) return;
    sc.injection[field] = value;
    triggerSimulation();
}

function updateInjectionPct(isin, pct) {
    const sc = _activeSc(); if (!sc) return;
    sc.injection.pct[isin] = pct;
    _rebuildInjectionTab();
    triggerSimulation();
}

function updateInjectionFixed(isin, fixed) {
    const sc = _activeSc(); if (!sc) return;
    if (!sc.injection.fixed) sc.injection.fixed = {};
    if (fixed) sc.injection.fixed[isin] = true;
    else delete sc.injection.fixed[isin];
    // No simulation needed — fixed only affects Redistribute
    _rebuildInjectionTab();
}

function redistributeInjectionPct() {
    const sc = _activeSc(); if (!sc) return;
    const today = new Date().getFullYear();
    const activeBonds = (_lastPortfolio || []).filter(b => new Date(b.maturity).getFullYear() > today);
    if (!activeBonds.length) return;
    const inj = sc.injection;
    if (!inj.fixed) inj.fixed = {};

    // Fixed bonds: sum their pcts
    const fixedSum = activeBonds
        .filter(b => inj.fixed[b.isin])
        .reduce((s, b) => s + (inj.pct[b.isin] ?? 0), 0);

    const remaining = Math.max(0, 100 - fixedSum);
    const nonFixed  = activeBonds.filter(b => !inj.fixed[b.isin]);

    // Split remaining equally among non-fixed (ignore current values)
    const equalShare = nonFixed.length > 0 ? +(remaining / nonFixed.length).toFixed(4) : 0;
    nonFixed.forEach(b => { inj.pct[b.isin] = equalShare; });

    _rebuildInjectionTab();
    triggerSimulation();
}

// ── Panel partial re-renders (cheaper than full rebuild) ──────────────────────

function _rebuildPanel() {
    buildPerIsinPanel(_lastPortfolio, _lastSimResult || { weightedSAY: 3 });
}

function _rebuildCouponTab() {
    const isDark = document.body.classList.contains('dark');
    const border = isDark ? '#2a2d45' : '#dde3ee';
    renderCouponTab(_lastPortfolio, _lastSimResult?.weightedSAY || 3, isDark, border);
}

function _rebuildInjectionTab() {
    const isDark = document.body.classList.contains('dark');
    const border = isDark ? '#2a2d45' : '#dde3ee';
    renderInjectionTab(_lastPortfolio, isDark, border);
}

// ── Import / Export ───────────────────────────────────────────────────────────

function exportScenarios() {
    const portfolio = _lastPortfolio;
    const now       = new Date();
    const pad       = n => String(n).padStart(2, '0');
    const exportedAt = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    const portfolioSnapshot = portfolio.map(b => ({
        isin:          b.isin,
        issuer:        b.issuer,
        investedEur:   b.totalEur || (b.priceEur || 0) * b.quantity,
        quantity:      b.quantity,
        priceEur:      b.priceEur,
        coupon:        b.coupon,
        maturity:      b.maturity,
        taxRate:       b.taxRate || 0,
        currency:      b.currency,
    }));

    const scenariosJson = _scenarios.map(sc => ({
        id:    sc.id,
        label: sc.label,
        color: sc.color,
        couponReinvest: {
            enabled:          sc.couponReinvest.enabled,
            globalPriceShift: sc.couponReinvest.globalPriceShift,
            perIsin: Object.fromEntries(sc.couponReinvest.perIsin),
        },
        maturityReplacement: Object.fromEntries(sc.maturityReplacement),
        injection: { ...sc.injection, fixed: sc.injection.fixed || {} },
    }));

    const blob = new Blob([JSON.stringify({
        bondFxVersion:     '6.0',
        exportedAt,
        portfolioSnapshot,
        scenarios:         scenariosJson,
    }, null, 2)], { type: 'application/json' });

    const a = document.createElement('a');
    a.href  = URL.createObjectURL(blob);
    a.download = `bondfx-scenarios-${exportedAt.replace(/[T:]/g,'-').slice(0,19)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
}

function importScenarios(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const data      = JSON.parse(e.target.result);
            const portfolio = _lastPortfolio;
            const currentIsins = new Set(portfolio.map(b => b.isin));
            const snapMap      = new Map((data.portfolioSnapshot || []).map(s => [s.isin, s]));
            const sym          = _cgSym();
            const fmt          = v => sym + (v == null ? '?' : Number(v).toLocaleString(undefined, {maximumFractionDigits: 0}));

            // ── 1. ISINs in snapshot but NOT in current portfolio ────────────────
            // These were present when the file was exported but have since been removed.
            // Any scenario config referencing them will be silently dropped.
            const removedIsins = [...snapMap.keys()].filter(isin => !currentIsins.has(isin));

            // ── 2. ISINs in current portfolio but NOT in snapshot ────────────────
            // New bonds added after the export. They get all defaults — nothing to warn about
            // beyond informing the user.
            const addedIsins = [...currentIsins].filter(isin => !snapMap.has(isin));

            // ── 3. ISINs present in both — compare fields ────────────────────────
            const TRACKED_FIELDS = [
                { key: 'quantity',    label: 'Qty',         fmt: v => v == null ? '?' : Number(v).toLocaleString(undefined,{maximumFractionDigits:4}) },
                { key: 'investedEur', label: 'Invested',    fmt: fmt },
                { key: 'priceEur',    label: 'Price (EUR)', fmt: v => v == null ? '?' : Number(v).toFixed(4) },
                { key: 'coupon',      label: 'Coupon %',    fmt: v => v == null ? '?' : Number(v).toFixed(4) + '%' },
                { key: 'taxRate',     label: 'Tax %',       fmt: v => v == null ? '?' : Number(v).toFixed(2) + '%' },
                { key: 'maturity',    label: 'Maturity',    fmt: v => v ?? '?' },
            ];

            const changedIsins = [];  // [{ isin, issuer, diffs: [{label, old, new}] }]
            [...currentIsins].filter(isin => snapMap.has(isin)).forEach(isin => {
                const snap    = snapMap.get(isin);
                const current = portfolio.find(b => b.isin === isin);
                if (!current) return;
                const diffs = [];
                TRACKED_FIELDS.forEach(({ key, label, fmt: fmtFn }) => {
                    // For investedEur: current stores as totalEur or priceEur*qty
                    let curVal = current[key];
                    if (key === 'investedEur') curVal = current.totalEur || (current.priceEur || 0) * current.quantity;
                    const snapVal = snap[key];
                    if (snapVal == null && curVal == null) return;
                    // Compare numerically where possible, rounding to avoid float noise
                    const snapN = parseFloat(snapVal);
                    const curN  = parseFloat(curVal);
                    const bothNum = !isNaN(snapN) && !isNaN(curN);
                    const changed = bothNum
                        ? Math.abs(snapN - curN) > 0.0001
                        : String(snapVal) !== String(curVal);
                    if (changed) {
                        diffs.push({ label, old: fmtFn(snapVal), new: fmtFn(curVal) });
                    }
                });
                if (diffs.length) {
                    changedIsins.push({ isin, issuer: current.issuer || isin, diffs });
                }
            });

            // ── Build new scenarios with reconciliation ──────────────────────────
            let imported = 0;
            const droppedReplByScenario = [];  // [{scenLabel, isins[]}]

            const newScenarios = (data.scenarios || []).map(s => {
                const replMap    = new Map();
                const droppedRep = [];
                Object.entries(s.maturityReplacement || {}).forEach(([isin, cfg]) => {
                    if (currentIsins.has(isin)) {
                        replMap.set(isin, cfg);
                    } else {
                        droppedRep.push(isin);
                    }
                });
                if (droppedRep.length) droppedReplByScenario.push({ scenLabel: s.label, isins: droppedRep });

                const perIsinMap = new Map();
                Object.entries(s.couponReinvest?.perIsin || {}).forEach(([isin, cfg]) => {
                    if (currentIsins.has(isin)) perIsinMap.set(isin, cfg);
                    // silently drop coupon overrides for removed ISINs — no user impact since bond is gone
                });

                imported++;
                return {
                    id:    s.id || _nextScenarioId(),
                    label: s.label || 'Imported scenario',
                    color: s.color || _nextScenarioColor(),
                    couponReinvest: {
                        enabled:          s.couponReinvest?.enabled || false,
                        globalPriceShift: s.couponReinvest?.globalPriceShift || 0,
                        perIsin:          perIsinMap,
                    },
                    maturityReplacement: replMap,
                    injection: s.injection ? { ...s.injection, fixed: s.injection.fixed || {} } : {
                        enabled: false, amountEur: 1000,
                        from: new Date().getFullYear(),
                        to:   new Date().getFullYear() + 10,
                        pct:  {}, fixed: {},
                    },
                };
            });

            _scenarios         = newScenarios;
            _activeScenarioId  = _scenarios[0]?.id || null;

            // ── Build feedback HTML ──────────────────────────────────────────────
            const isDark  = document.body.classList.contains('dark');
            const ok      = isDark ? '#70c172' : '#2e7d32';
            const warn    = isDark ? '#ffd740' : '#e65100';
            const info    = isDark ? '#90caf9' : '#1565c0';
            const muted   = isDark ? '#8890b8' : '#888';
            const section = (icon, color, title, body) =>
                `<div style="margin-top:10px;">
                    <div style="font-weight:700;color:${color};font-size:12px;">${icon} ${title}</div>
                    <div style="margin-top:4px;font-size:11px;color:${isDark?'#c0c8e8':'#333'};padding-left:14px;">${body}</div>
                </div>`;

            let html = `<div style="font-weight:700;font-size:13px;margin-bottom:6px;color:${ok};">
                ✓ ${imported} scenario${imported !== 1 ? 's' : ''} imported
                <span style="font-size:10px;color:${muted};font-weight:400;"> — exported ${data.exportedAt || '?'}</span>
            </div>`;

            // Removed ISINs (were in snapshot, no longer in portfolio)
            if (removedIsins.length) {
                const rows = removedIsins.map(isin => {
                    const snap   = snapMap.get(isin);
                    const label  = snap?.issuer ? `${snap.issuer} (${isin})` : isin;
                    const detail = snap ? ` — was ${fmt(snap.investedEur)} invested, qty ${snap.quantity}, mat. ${(snap.maturity||'').slice(0,7)}` : '';
                    return `<div>• ${label}${detail}</div>`;
                }).join('');
                const affected = droppedReplByScenario
                    .map(x => `<em>${x.scenLabel}</em>: ${x.isins.join(', ')}`)
                    .join('; ');
                html += section('⛔', warn, `${removedIsins.length} bond${removedIsins.length!==1?'s':''} removed from portfolio since export — scenario configs for these ISINs have been dropped`,
                    rows + (affected ? `<div style="margin-top:4px;color:${warn};">Dropped replacements in: ${affected}</div>` : ''));
            }

            // Added ISINs (in portfolio now, not in snapshot)
            if (addedIsins.length) {
                const rows = addedIsins.map(isin => {
                    const b     = portfolio.find(x => x.isin === isin);
                    const label = b ? `${b.issuer} (${isin})` : isin;
                    return `<div>• ${label} — using defaults for all scenario settings</div>`;
                }).join('');
                html += section('➕', info, `${addedIsins.length} new bond${addedIsins.length!==1?'s':''} in portfolio (not in snapshot) — added with defaults`, rows);
            }

            // Changed ISINs (present in both, but fields differ)
            if (changedIsins.length) {
                const rows = changedIsins.map(({ isin, issuer, diffs }) => {
                    const diffStr = diffs.map(d => `${d.label}: <span style="color:${warn}">${d.old}</span> → <span style="color:${ok}">${d.new}</span>`).join('  ·  ');
                    return `<div>• ${issuer} (${isin}): ${diffStr}</div>`;
                }).join('');
                html += section('⚠️', warn, `${changedIsins.length} bond${changedIsins.length!==1?'s':''} changed since export — simulation will use current values`, rows);
            }

            // All clean
            if (!removedIsins.length && !addedIsins.length && !changedIsins.length) {
                html += `<div style="margin-top:8px;font-size:11px;color:${ok};">✓ Portfolio matches snapshot exactly — no reconciliation needed.</div>`;
            }

            _showImportFeedback(html);
            _scenariosDirty = false;
            buildPerIsinPanel(_lastPortfolio, _lastSimResult || { weightedSAY: 3 });
            triggerSimulation();
        } catch(err) {
            alert('Import failed: ' + err.message);
        }
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
            style="float:right;background:none;border:none;font-size:18px;cursor:pointer;
                   color:#888;line-height:1;margin-left:8px;" title="Close">×</button>
         <strong style="font-size:12px;">📥 Import Report</strong>
         <hr style="border:none;border-top:1px solid ${isDark?'#2a2d45':'#e0e5f0'};margin:8px 0;">
         ${htmlContent}`;
    document.body.appendChild(div);
    // Auto-dismiss only if no warnings/changes
    const hasIssues = htmlContent.includes('⛔') || htmlContent.includes('⚠️') || htmlContent.includes('➕');
    if (!hasIssues) setTimeout(() => div?.remove(), 5000);
}

// ── Bond year chart (unchanged logic, wired to new state) ─────────────────────
function buildBondSelector(portfolio) {
    const el = document.getElementById('bondSelector');
    if (!el) return;
    const currentIsins = new Set(portfolio.map(b => b.isin));
    currentIsins.forEach(isin => { if (!_selectedIsins.has(isin)) _selectedIsins.add(isin); });
    _selectedIsins.forEach(isin => {
        if (!isin.startsWith('_repl_') && !currentIsins.has(isin)) _selectedIsins.delete(isin);
    });
    const isDark   = document.body.classList.contains('dark');
    const COLORS   = isDark ? BOND_COLORS_DARK : BOND_COLORS_LIGHT;
    const issuerCount = {};
    portfolio.forEach(b => { issuerCount[b.issuer] = (issuerCount[b.issuer] || 0) + 1; });
    const bondHtml = portfolio.map((b, i) => {
        const c   = COLORS[i % COLORS.length];
        const lbl = issuerCount[b.issuer] > 1
            ? `${b.issuer} <span style="font-family:monospace;font-size:10px;opacity:0.7">${b.isin}</span> (${(b.maturity||'').slice(0,4)})`
            : `${b.issuer} (${(b.maturity||'').slice(0,4)})`;
        return `<label style="display:inline-flex;align-items:center;gap:5px;margin:4px 8px 4px 0;cursor:pointer;font-size:12px;font-weight:600;">
            <input type="checkbox" ${_selectedIsins.has(b.isin)?'checked':''} value="${b.isin}" onchange="toggleBondSel('${b.isin}',this.checked)">
            <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${c};flex-shrink:0;"></span>
            ${lbl}
        </label>`;
    }).join('');
    el.innerHTML = bondHtml;
}

function toggleBondSel(isin, checked) {
    if (checked) _selectedIsins.add(isin); else _selectedIsins.delete(isin);
    if (_lastSimResult) renderBondYearChart(_lastPortfolio, _lastSimResult.years, _selectedIsins);
}

// ── View toggles ──────────────────────────────────────────────────────────────
let _currentView = 'year';

function switchView(view) {
    _currentView = view;
    ['year', 'bond'].forEach(v => {
        document.getElementById(`btnView_${v}`)?.classList.toggle('cg-view-btn--active', v === view);
        const wrap = document.getElementById(`wrap_${v}`);
        if (wrap) wrap.style.display = v === view ? 'block' : 'none';
    });
}

function setBondChartMode(mode) {
    _bondChartMode = mode;
    document.getElementById('btnBondStacked')?.classList.toggle('cg-view-btn--active', mode === 'stacked');
    document.getElementById('btnBondLine')?.classList.toggle('cg-view-btn--active', mode === 'line');
    if (_lastSimResult) renderBondYearChart(_lastPortfolio, _lastSimResult.years, _selectedIsins);
}

// ── Main ──────────────────────────────────────────────────────────────────────
let _simTimer = null;
function triggerSimulation() {
    clearTimeout(_simTimer);
    _simTimer = setTimeout(runSimulation, 220);
}

async function runSimulation() {
    const portfolio = loadPortfolio();
    if (!portfolio.length) {
        document.getElementById('cgEmptyMsg').style.display = 'block';
        document.getElementById('cgMain').style.display     = 'none';
        return;
    }
    document.getElementById('cgEmptyMsg').style.display = 'none';
    document.getElementById('cgMain').style.display     = 'block';

    if (_chart)     { _chart.destroy();     _chart     = null; }
    if (_chartBond) { _chartBond.destroy(); _chartBond = null; }
    Object.keys(_benchmarkCache).forEach(k => delete _benchmarkCache[k]);

    const reportCcy = localStorage.getItem('bondReportCurrency') || 'EUR';

    // Single POST /api/bonds/compute call: populates both _cgComputeCache (SAY, finalCapital,
    // capCoupons, capGain, totalCoupons, totalFace, fxBuy/fxCoupon/fxFuture — all computed
    // by Java BondScoreEngine + FxService) and _fxCache (for synchronous access by buildSlots).
    // This is the ONLY place where bond metrics are fetched — no JS formula replication.
    _cgComputeCache.clear();
    _fxCache.clear();
    // Fetch OU-adjusted FX curves for all non-base-currency bonds (one POST per currency).
    // Must complete before buildSlots/runScenario so _fxCurveGet works synchronously.
    await Promise.all([
        _computePortfolio(portfolio, {}, reportCcy),
        _prefetchFxCurves(portfolio, reportCcy),
    ]);

    // Ensure at least one scenario exists (first load or after clearing all)
    if (_scenarios.length === 0) {
        const sc = _defaultScenario(portfolio);
        sc.label = "default - no reinv";
        sc._autoDefault = true; // hide sub-tabs until user explicitly configures something
        _scenarios.push(sc);
        _activeScenarioId = sc.id;
    }

    // startCapital: auto-computed from portfolio cost (read-only)
    const costEur      = portfolio.reduce((s, b) => s + (b.totalEur || (b.priceEur || 0) * b.quantity), 0);
    const startCapital = costEur;
    _lastStartCapital  = startCapital;
    _lastPortfolio     = portfolio;

    // Show read-only initial capital in stat card (via symbol update)
    document.querySelectorAll('.cg-ccy-sym').forEach(el => el.textContent = _cgSym());

    const simResult = simulateAll(portfolio, startCapital);
    _lastSimResult  = simResult;

    renderSummaryStats(portfolio, simResult, startCapital);
    renderGrowthChart(simResult, startCapital);
    buildPerIsinPanel(portfolio, simResult);
    _renderNrBenchmarkPanel();

    // Re-apply nr benchmark chart line if enabled
    if (_nrBenchmark.enabled) _toggleNrBenchmark(true);

    // Re-apply active ETF benchmark overlays
    document.querySelectorAll('input[id^="bench-chk-"]').forEach(chk => {
        if (chk.checked) chk.dispatchEvent(new Event('change'));
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    await _cgLoadFxRates();
    document.getElementById('btnBondStacked')?.addEventListener('click', () => setBondChartMode('stacked'));
    document.getElementById('btnBondLine')?.addEventListener('click', () => setBondChartMode('line'));

    // Mobile label swap
    function _cgMobileLabels() {
        document.querySelectorAll('.cg-header__back').forEach(btn => {
            if (!btn.dataset.full) btn.dataset.full = btn.lastChild.textContent.trim();
            btn.lastChild.textContent = ' ' + (window.innerWidth <= 768 ? (btn.dataset.short || btn.dataset.full) : btn.dataset.full);
        });
    }
    _cgMobileLabels();
    window.addEventListener('resize', _cgMobileLabels);

    await runSimulation();
    switchView('year');

    // E: warn on navigation away if scenarios were modified but not exported
    function _hasUnsavedConfig() {
        if (!_scenariosDirty) return false;
        return _scenarios.some(sc =>
            sc.couponReinvest.enabled || sc.maturityReplacement.size > 0 || sc.injection.enabled
        );
    }

    // E1: browser tab close / reload
    window.addEventListener('beforeunload', e => {
        if (!_hasUnsavedConfig()) return;
        e.preventDefault();
        e.returnValue = 'Hai scenari non esportati. Vuoi davvero uscire?';
    });

    // E2: back-link to Portfolio Analyzer (and any other internal <a> nav)
    document.querySelectorAll('a[href="/analyzer"], a[href*="analyzer"]').forEach(link => {
        link.addEventListener('click', e => {
            if (!_hasUnsavedConfig()) return;
            const ok = confirm('Hai scenari non esportati. Tornare all\u0027Analyzer far\u00e0 perdere le modifiche. Continuare?');
            if (!ok) e.preventDefault();
        });
    });
});
function openYearDetailModal(yr, yearIdx, simResult, startCapital, allLabels) {
    document.getElementById('cgYearModal')?.remove();
    const isDark = document.body.classList.contains('dark');
    const sym    = _cgSym();
    const fmt    = v => sym + Math.round(_cgToBase(v)).toLocaleString(undefined,{maximumFractionDigits:0});
    const bg     = isDark ? '#1e2338' : '#fff';
    const border = isDark ? '#2a2d45' : '#dde3ee';
    const text   = isDark ? '#c0c8e8' : '#1a2a4a';
    const thBg   = isDark ? '#252840' : '#f0f4ff';
    const chartLabels = allLabels || simResult.years;

    const _baseYearFlows = (() => {
        const map = new Map();
        for (const y of chartLabels) {
            const activeBonds = _lastPortfolio.filter(b => new Date(b.maturity).getFullYear() >= y);
            let coupons = 0, redemptions = 0;
            activeBonds.forEach(b => {
                const matYr  = new Date(b.maturity).getFullYear();
                const qty    = b.quantity || 0;
                const cached = _cgComputeCache.get(b.isin);
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

    // _expandedScenarios: module-level Set, persists across modal re-opens
    const expanded = _expandedScenarios;

    let rows = simResult.scenarios.map(sc => {
        // Find yearEvent by year value — more robust than index arithmetic,
        // which breaks when allYears includes a synthetic start-year with no event.
        const ev = sc.yearEvents?.find(e => e.yr === yr) ?? null;
        // data is aligned to chartLabels
        const dataIdx = chartLabels.indexOf(yr);
        const val     = dataIdx >= 0 ? sc.data[dataIdx] : null;
        const prevIdx = dataIdx > 0 ? dataIdx - 1 : -1;
        const prevRaw = prevIdx >= 0 ? sc.data[prevIdx] : null;
        // If previous year has no data for this scenario (null = line not started yet), don't show delta
        const prev  = prevRaw != null ? prevRaw : null;
        const delta = (val != null && prev != null) ? val - prev : null;
        const sign  = delta >= 0 ? '+' : '';
        const sc2   = v => (v != null && isFinite(v)) ? fmt(v * (sc.scale||1)) : '—';

        // For maturity_replacement-ONLY scenarios (no coupon reinvest on other bonds):
        // before the first replacement activates, the scenario is identical to no_reinvest
        // so we suppress the cells to avoid showing zeros as if nothing is happening.
        // If coupon reinvest is ALSO active (hasCouponReinvest flag on scenario), coupons
        // ARE flowing normally on non-replaced bonds → never suppress pre-activation.
        const hasCouponReinvest = sc._hasCouponReinvest === true;
        const isReplPreActivation = sc._type === 'maturity_replacement'
            && !hasCouponReinvest
            && yr < (sc._sourceBond?.matYear || 9999)
            && !ev?.replacementActivated;
        const isReplActivation = sc._type === 'maturity_replacement' && ev?.replacementActivated;

        // Use simulation yearEvent values for header (guaranteed consistent with subrows)
        const couponCell = isReplPreActivation || isReplActivation
            ? '<span style="color:#888">—</span>'
            : sc2(ev?.coupons || 0);
        const redempCell = isReplPreActivation || isReplActivation
            ? '<span style="color:#888">—</span>'
            : sc2(ev?.redemptions || 0);
        // Reinvested column:
        // - builtins/coupon_reinvest: total cashIn reinvested (coupons + redemptions reinvested)
        // - replacement pre-activation: —
        // - replacement activation year: → {switched capital}
        // - replacement post: replCoupons if reinvesting, 0 if cash
        let reinvestedCell;
        if (sc._type === 'maturity_replacement') {
            if (isReplPreActivation) {
                // Pre-activation with no coupon reinvest: nothing to show
                reinvestedCell = '<span style="color:#888">—</span>';
            } else if (isReplActivation) {
                reinvestedCell = `<span style="color:#90caf9;font-size:10px" title="Capital switched to new bond">→ ${sc2(ev.switched||0)}</span>`;
            } else {
                // Post-activation: other bonds reinvested + replacement coupons if reinvesting
                reinvestedCell = sc2((ev?.reinvested || 0) + (ev?.replCoupons || 0));
            }
        } else if (sc._type === 'coupon_reinvest') {
            reinvestedCell = sc2(ev?.reinvested || 0);
        } else {
            // Standard: show total reinvested (coupons + redemptions that were reinvested)
            reinvestedCell = sc2(ev?.reinvested || 0);
        }
        // Portfolio Value = bondsVal + accumulated cash (same basis as sc.data and delta).
        // Showing only bondsVal would make no-reinvest scenarios appear artificially low
        // (their cash pile is hidden), making the reinvest scenario look always worse by comparison.
        const cashAccum    = (ev?.cash ?? 0) * (sc.scale || 1);
        const bondsOnlyVal = (ev?.bondsVal != null) ? ev.bondsVal * (sc.scale || 1) : val;
        const totalPortVal = (ev?.bondsVal != null) ? bondsOnlyVal + cashAccum : val;
        const valDisplay   = totalPortVal != null ? `${sym}${Math.round(_cgToBase(totalPortVal)).toLocaleString(undefined,{maximumFractionDigits:0})}` : '—';
        const deltaDisplay = delta != null
            ? `<span style="color:${delta>=0?'#43a047':'#e53935'};font-weight:600;">${sign}${sym}${Math.abs(Math.round(_cgToBase(delta))).toLocaleString(undefined,{maximumFractionDigits:0})}</span>`
            : '<span style="color:#888">—</span>';

        const isExpanded = expanded.has(sc.id);
        const toggleId   = `cgBondExpand_${sc.id}_${yr}`;

        // Per-bond subrows: bottom-up from perSlot in yearEvents (same source as header)
        let perBondRows = '';
        if (isExpanded) {
            const fmtSmall  = v => sym + Math.round(_cgToBase(v)).toLocaleString(undefined,{maximumFractionDigits:0});
            const slotItems = ev?.perSlot || [];

            if (slotItems.length > 0) {
                const K = sc.scale || 1; // apply same scale as sc.data
                const fs = v => fmtSmall(v * K);
                const bondRows = slotItems.map(s => {
                    // For replacement bonds: matYear is stored directly in perSlot
                    // For real bonds: look up in portfolio
                    let matYr;
                    if (s._isReplacement) {
                        matYr = s.matYear || '?';
                    } else {
                        const pb = _lastPortfolio.find(b => b.isin === s.isin);
                        matYr = pb ? new Date(pb.maturity).getFullYear() : '?';
                    }
                    // Display isin: strip '_repl' suffix for display
                    const dispIsin = s._isReplacement ? s.isin.replace('_repl', '') : s.isin;
                    // Coupon: real bonds use s.coupon; replacement bonds use s.replCoupon
                    const couponVal = s._isReplacement ? (s.replCoupon || 0) : s.coupon;
                    const rowStyle = s._isReplacement
                        ? `opacity:0.78;font-size:10.5px;background:${isDark?'rgba(30,100,30,0.15)':'rgba(0,100,0,0.05)'};`
                        : `opacity:0.78;font-size:10.5px;background:${isDark?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.02)'};`;
                    const isinColor = s._isReplacement ? (isDark?'#70c172':'#2e7d32') : (isDark?'#8890b8':'#888');
                    const replBadge = s._isReplacement ? `<span style="font-size:9px;color:#70c172;margin-left:4px;">🔄 repl.</span>` : '';
                    return `<tr style="${rowStyle}">
                        <td style="padding:3px 10px 3px 28px;color:${isinColor};">
                            <span style="font-family:monospace;font-size:10px;">${dispIsin}</span>
                            <span style="margin-left:6px;">${s.issuer}</span>
                            <span style="margin-left:6px;opacity:0.6;">mat.${matYr}</span>${replBadge}
                        </td>
                        <td style="padding:3px 10px;text-align:right;">${fs(couponVal)}</td>
                        <td style="padding:3px 10px;text-align:right;">${s.redemption > 0 ? fs(s.redemption) : '<span style="color:#888">—</span>'}</td>
                        <td style="padding:3px 10px;text-align:right;">${s.reinvested > 0 ? fs(s.reinvested) : '<span style="color:#888">—</span>'}</td>
                        <td style="padding:3px 10px;text-align:right;">${fs(s.portVal)}</td>
                        <td style="padding:3px 10px;text-align:right;color:#888;">—</td>
                    </tr>`;
                }).join('');
                // Cash row: shown when cash > 0 (no-reinvest or replacement with coupons=cash)
                let cashRow = '';
                const cashVal = (ev?.cash || 0) * K;
                if (cashVal > 0.5) {
                    const cashBg    = isDark ? 'rgba(255,193,7,0.07)' : 'rgba(255,193,7,0.08)';
                    const cashColor = isDark ? '#ffd54f' : '#b07d00';
                    cashRow = `<tr style="opacity:0.85;font-size:10.5px;background:${cashBg};">
                        <td style="padding:3px 10px 3px 28px;color:${cashColor};font-weight:600;">
                            <span style="font-family:monospace;font-size:10px;">CASH</span>
                            <span style="margin-left:6px;">${sym} liquidity</span>
                            <span style="margin-left:6px;font-size:9px;opacity:0.7;">coupons + redemptions (not reinvested)</span>
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
                            if(chk.checked)_expandedScenarios.add('${sc.id}');
                            else _expandedScenarios.delete('${sc.id}');
                            openYearDetailModal(${yr},${yearIdx},_lastSimResult,_lastStartCapital,${JSON.stringify(allLabels)});
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

    // ── No-reinvest benchmark row in modal ────────────────────────────────────
    let benchRow = '';
    if (_nrBenchmark.enabled && _nrBenchmark.yearEvents) {
        const bEv   = _nrBenchmark.yearEvents.find(e => e.yr === yr) ?? null;
        const bData = _nrBenchmark.data;
        const bYrs  = _nrBenchmark.years || simResult.years;
        const bIdx  = bYrs.indexOf(yr);
        const bVal  = bData && bIdx >= 0 ? bData[bIdx] : null;
        const bPrev = bData && bIdx > 0  ? bData[bIdx - 1] : null;
        const bDelta = (bVal != null && bPrev != null) ? bVal - bPrev : null;
        const bSc    = v => (v != null && isFinite(v)) ? fmt(v) : '—';
        const bSign  = bDelta != null && bDelta >= 0 ? '+' : '';
        const bCashAccum    = (bEv?.cash ?? 0);
        const bBondsVal     = (bEv?.bondsVal ?? 0);
        const bTotalPortVal = bBondsVal + bCashAccum;
        const bValDisplay   = bTotalPortVal > 0
            ? `${sym}${Math.round(_cgToBase(bTotalPortVal)).toLocaleString(undefined,{maximumFractionDigits:0})}`
            : '—';
        const bDeltaDisplay = bDelta != null
            ? `<span style="color:${bDelta>=0?'#43a047':'#e53935'};font-weight:600;">
                ${bSign}${sym}${Math.abs(Math.round(_cgToBase(bDelta))).toLocaleString(undefined,{maximumFractionDigits:0})}
               </span>`
            : '<span style="color:#888">—</span>';
        const bBorderStyle = isDark ? 'border-top:2px dashed #3a3f60;' : 'border-top:2px dashed #c8cfdf;';
        const bBg = isDark ? 'background:rgba(158,158,158,0.06);' : 'background:rgba(0,0,0,0.025);';
        benchRow = `<tr style="${bBorderStyle}${bBg}">
            <td style="padding:7px 10px;">
                <span style="display:inline-flex;align-items:center;gap:7px;font-size:12px;color:${isDark?'#8890b8':'#888'};">
                    <span style="display:inline-block;width:20px;height:2px;
                                 border-top:2px dashed ${_nrBenchmark.color};vertical-align:middle;flex-shrink:0;"></span>
                    ${_nrBenchmark.label}
                </span>
            </td>
            <td style="padding:7px 10px;text-align:right;color:${isDark?'#8890b8':'#888'};">${bSc(bEv?.coupons)}</td>
            <td style="padding:7px 10px;text-align:right;color:${isDark?'#8890b8':'#888'};">${bSc(bEv?.redemptions)}</td>
            <td style="padding:7px 10px;text-align:right;color:${isDark?'#8890b8':'#888'};">—</td>
            <td style="padding:7px 10px;text-align:right;font-weight:600;color:${isDark?'#8890b8':'#888'};">${bValDisplay}</td>
            <td style="padding:7px 10px;text-align:right;">${bDeltaDisplay}</td>
        </tr>`;
    }

    const maturingBonds = _lastPortfolio.filter(b => new Date(b.maturity).getFullYear() === yr);
    let matHtml = '';
    if (maturingBonds.length) {
        // Show ISIN if multiple bonds from same issuer mature in same year
        const issuerCount = {};
        maturingBonds.forEach(b => { issuerCount[b.issuer] = (issuerCount[b.issuer] || 0) + 1; });

        // Check if any maturity_replacement scenario activates this year
        const activeRepls = _getAllMatReplacementCs().filter(cs =>
            cs._type === 'maturity_replacement' && cs.sourceBond?.matYear === yr
        );

        const replHtml = activeRepls.map(cs => {
            const src = _lastPortfolio.find(b=>b.isin===cs.sourceBond.isin);
            const srcName  = src ? (maturingBonds.length > 1 || _lastPortfolio.filter(x=>x.issuer===src.issuer).length>1
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
            ${maturingBonds.map(b => {
                return `<span style="font-size:12px;margin-right:16px;">${b.issuer} <span style="font-family:monospace;font-size:10px;opacity:0.75">${b.isin}</span></span>`;
            }).join('')}
            ${replHtml}
        </div>`;
    }

    // ── F: keyboard/button navigation ─────────────────────────────────────────
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
                        <th style="padding:7px 10px;text-align:right;" title="Bonds + accumulated cash (coupons/redemptions not reinvested)">Portfolio Value</th>
                        <th style="padding:7px 10px;text-align:right;">Δ vs prev yr</th>
                    </tr></thead>
                    <tbody>${rows}${benchRow}</tbody>
                </table>
                ${matHtml}
                <p style="font-size:10px;color:${isDark?'#5a6080':'#aaa'};margin-top:10px;">
                    Coupons net of withholding tax. Redemptions = face value returned. Sudden growth = bond maturation + reinvestment.
                    Subrow <em>Portfolio Value</em> = bond holding value. <em>Cash</em> row = accumulated coupons + redemptions not reinvested (shown when > 0).
                    All values in ${_cgBaseCcy()} &nbsp;·&nbsp;
                    <span style="opacity:0.7;">← → arrows or buttons to navigate years</span>
                </p>
            </div>
        </div>`;
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);

    // Wire nav buttons
    document.getElementById('cgModalPrev')?.addEventListener('click', () => {
        overlay.remove();
        openYearDetailModal(chartLabels[yearIdx-1], yearIdx-1, simResult, startCapital, chartLabels);
    });
    document.getElementById('cgModalNext')?.addEventListener('click', () => {
        overlay.remove();
        openYearDetailModal(chartLabels[yearIdx+1], yearIdx+1, simResult, startCapital, chartLabels);
    });
    // Keyboard ← →
    const onKey = (e) => {
        if (e.key === 'ArrowLeft'  && canPrev) { overlay.remove(); document.removeEventListener('keydown',onKey); openYearDetailModal(chartLabels[yearIdx-1], yearIdx-1, simResult, startCapital, chartLabels); }
        if (e.key === 'ArrowRight' && canNext) { overlay.remove(); document.removeEventListener('keydown',onKey); openYearDetailModal(chartLabels[yearIdx+1], yearIdx+1, simResult, startCapital, chartLabels); }
        if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown',onKey); }
    };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', e => { if (e.target === overlay) { document.removeEventListener('keydown',onKey); } });
}

// ── Bond year chart ───────────────────────────────────────────────────────────

function renderBondYearChart(portfolio, years, selectedIsins) {
    const canvas = document.getElementById('bondYearChart');
    if (!canvas) return;
    if (_chartBond) { _chartBond.destroy(); _chartBond = null; }

    const isDark     = document.body.classList.contains('dark');
    const labelColor = isDark ? '#c0c8e8' : '#444';
    const gridColor  = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
    const COLORS     = isDark ? BOND_COLORS_DARK : BOND_COLORS_LIGHT;
    const sym        = _cgSym();
    const isStacked  = _bondChartMode === 'stacked';

    const timelines = buildBondTimeline(portfolio, years);
    // Regular bonds filtered by selection
    const active    = timelines.filter(t => !t._isReplacement && selectedIsins.has(t.isin));
    // Fix D: replacement series filtered by selection too (checkbox uses '_repl_' + scenarioId key)
    const replSeries = timelines.filter(t => t._isReplacement && selectedIsins.has('_repl_' + t._scenarioId));

    if (!active.length && !replSeries.length) {
        _chartBond = null;
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
        return;
    }

    // Build merged year labels (base years + any extended replacement years)
    const allBondYears = [...years];
    replSeries.forEach(t => {
        if (t.data) t.data.forEach((_, idx) => {
            // Replacement data may be indexed over allYears from buildBondTimeline
            // We trust buildBondTimeline already used extended years internally
        });
    });
    // Collect extended years from replacement scenarios
    _getAllMatReplacementCs().filter(cs=>cs._type==='maturity_replacement').forEach(cs => {
        for (let y = Math.max(...years)+1; y <= cs.maturityYear; y++) {
            if (!allBondYears.includes(y)) allBondYears.push(y);
        }
    });
    allBondYears.sort((a,b)=>a-b);

    // Align all series to allBondYears
    const alignSeries = (t, srcYears) => allBondYears.map(yr => {
        const idx = srcYears.indexOf(yr);
        return idx >= 0 && t.data[idx] != null ? t.data[idx] : null;
    });

    const activeAligned = active.map((t, i) => ({
        label:           t.label,
        data:            alignSeries(t, years),
        borderColor:     COLORS[i % COLORS.length],
        backgroundColor: COLORS[i % COLORS.length] + (isStacked ? 'cc' : '25'),
        borderWidth:     isStacked ? 1 : 2,
        fill:            isStacked ? 'origin' : false,
        tension:         0.25,
        pointRadius:     allBondYears.length > 15 ? 0 : 3,
        spanGaps:        true,
        // Fix C: use 'bonds' as stack key so replacement ('repl') is a separate non-overlapping stack
        stack:           isStacked ? 'bonds' : undefined,
    }));

    // Build replacement series with extended years
    // IMPORTANT: replacement series must NEVER be stacked — they represent a parallel scenario.
    // We use a different stack key ('repl') so Chart.js won't accumulate them on top of bonds.
    const replAligned = replSeries.map((t, i) => {
        const cs = _getAllMatReplacementCs().find(c=>c.id===t._scenarioId);
        const srcYears = cs ? (() => {
            const ys = [...years];
            for (let y=Math.max(...years)+1;y<=cs.maturityYear;y++) ys.push(y);
            return ys;
        })() : years;
        // Fix D: use portfolio.length + index-in-all-replacement-scenarios for stable color
        const allReplScenarios = _getAllMatReplacementCs().filter(c=>c._type==='maturity_replacement');
        const scenIdx = cs ? allReplScenarios.findIndex(c=>c.id===cs.id) : i;
        const ci = portfolio.length + scenIdx;
        return {
            label:           t.label,
            data:            alignSeries(t, srcYears),
            borderColor:     COLORS[ci % COLORS.length],
            backgroundColor: COLORS[ci % COLORS.length] + '30',
            borderWidth:     2,
            borderDash:      [6, 3],
            fill:            false,
            tension:         0.25,
            pointRadius:     allBondYears.length > 15 ? 0 : 4,
            pointStyle:      'triangle',
            spanGaps:        false,
            // Fix C: do NOT use yAxisID:'yRepl' (causes misaligned scales).
            // Instead use stack:'repl' — different from bond datasets' stack key
            // so Chart.js won't stack replacement ON TOP of bonds.
            stack:           'repl',
            order:           0,        // drawn on top
        };
    });

    _chartBond = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels: allBondYears, datasets: [...activeAligned, ...replAligned] },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'bottom', labels: { color: labelColor, font:{size:11}, boxWidth:20 } },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const v = ctx.parsed.y;
                            if (!isFinite(v) || v <= 0) return null;
                            return ` ${ctx.dataset.label}: ${sym}${Math.round(v).toLocaleString(undefined,{maximumFractionDigits:0})}`;
                        },
                    },
                },
            },
            scales: {
                x: { stacked: isStacked, ticks: { color: labelColor, font:{size:11} }, grid: { color: gridColor } },
                y: {
                    stacked: isStacked,
                    ticks: { color: labelColor, font:{size:11},
                        callback: v => isFinite(v) ? sym + Math.round(v).toLocaleString(undefined,{maximumFractionDigits:0}) : '' },
                    grid: { color: gridColor },
                },
            },
        },
    });
}

// ── No-reinvest benchmark panel ───────────────────────────────────────────────

function _renderNrBenchmarkPanel() {
    const el = document.getElementById('cgNrBenchPanel');
    if (!el) return;
    const isDark  = document.body.classList.contains('dark');
    const border  = isDark ? '#2a2d45' : '#dde3ee';
    const bg      = isDark ? '#1a1d2e' : '#f5f7ff';
    const textMuted = isDark ? '#8890b8' : '#888';

    el.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 14px;
                    background:${bg};border-top:1px solid ${border};flex-wrap:wrap;">
            <span style="font-size:10px;font-weight:600;color:${textMuted};
                         text-transform:uppercase;letter-spacing:0.5px;flex-shrink:0;">
                📊 Benchmark
            </span>
            <label style="display:inline-flex;align-items:center;gap:7px;cursor:pointer;font-size:12px;">
                <input type="checkbox" id="cgNrBenchChk" ${_nrBenchmark.enabled ? 'checked' : ''}
                    onchange="_toggleNrBenchmark(this.checked)"
                    style="cursor:pointer;accent-color:${_nrBenchmark.color};">
                <span style="display:inline-block;width:24px;height:2px;
                             border-top:2px dashed ${_nrBenchmark.color};
                             vertical-align:middle;flex-shrink:0;"></span>
                <span id="cgNrBenchLabel"
                    style="color:${isDark?'#c0c8e8':'#333'};min-width:60px;"
                    title="Double-click to rename"
                    ondblclick="_startNrBenchRename(this)">${_nrBenchmark.label}</span>
            </label>
            <span style="font-size:10px;color:${textMuted};margin-left:4px;">
                no coupon reinvestment, no replacements — pure cash-flow baseline
            </span>
        </div>`;
}

function _toggleNrBenchmark(enabled) {
    _nrBenchmark.enabled = enabled;
    // Add/remove chart line
    if (!_chart) return;
    _chart.data.datasets = _chart.data.datasets.filter(d => d._nrBenchmark !== true);
    if (enabled && _nrBenchmark.data) {
        const sym = _cgSym();
        _chart.data.datasets.push({
            _nrBenchmark: true,
            label:            _nrBenchmark.label,
            data:             _nrBenchmark.data.map(v => isFinite(v) ? _cgToBase(v) : null),
            borderColor:      _nrBenchmark.color,
            backgroundColor:  _nrBenchmark.color + '18',
            borderWidth:      1.5,
            borderDash:       [5, 4],
            pointRadius:      0,
            tension:          0.3,
            fill:             false,
            spanGaps:         true,
        });
    }
    _chart.update();
}

function _startNrBenchRename(labelEl) {
    const rect = labelEl.getBoundingClientRect();
    const isDark = document.body.classList.contains('dark');
    const inp  = document.createElement('input');
    inp.type   = 'text';
    inp.value  = _nrBenchmark.label;
    inp.style.cssText =
        'position:fixed;left:' + rect.left + 'px;top:' + rect.top + 'px;' +
        'width:' + Math.max(rect.width + 20, 100) + 'px;height:' + rect.height + 'px;' +
        'font-size:12px;padding:0 4px;' +
        'border:1px solid #5b8dee;border-radius:3px;' +
        'background:' + (isDark ? '#252840' : '#fff') + ';color:inherit;' +
        'z-index:99999;outline:none;box-sizing:border-box;';
    document.body.appendChild(inp);
    inp.focus(); inp.select();
    const finish = () => {
        const newLabel = inp.value.trim();
        if (inp.parentNode) inp.parentNode.removeChild(inp);
        if (newLabel && newLabel !== _nrBenchmark.label) {
            _nrBenchmark.label = newLabel;
            // Update chart dataset label if active
            if (_chart) {
                const ds = _chart.data.datasets.find(d => d._nrBenchmark);
                if (ds) { ds.label = newLabel; _chart.update(); }
            }
            _renderNrBenchmarkPanel();
        }
    };
    inp.addEventListener('blur', finish);
    inp.addEventListener('keydown', e => {
        if (e.key === 'Enter')  { e.preventDefault(); inp.blur(); }
        if (e.key === 'Escape') { inp.value = _nrBenchmark.label; inp.blur(); }
    });
}

// ── Benchmark ─────────────────────────────────────────────────────────────────
const _benchmarkCache = {};

async function fetchBenchmark(symbol, horizonYears) {
    if (_benchmarkCache[symbol]) return _benchmarkCache[symbol];
    const range = `${Math.min(Math.max(horizonYears + 1, 5), 10)}y`;
    try {
        // Use our Spring proxy — avoids CORS and Yahoo crumb requirement
        const res  = await fetch(`/api/benchmark?symbol=${encodeURIComponent(symbol)}&range=${range}`);
        if (!res.ok) { console.warn('Benchmark HTTP', res.status, symbol); return null; }
        const json = await res.json();
        if (json?.chart?.error) { console.warn('Yahoo error for', symbol, json.chart.error); return null; }
        const chart = json?.chart?.result?.[0];
        if (!chart) return null;

        const ts     = chart.timestamp;
        const rawArr = chart.indicators?.adjclose?.[0]?.adjclose
                    || chart.indicators?.quote?.[0]?.close || [];
        const closes = rawArr.map(v => (v && typeof v === 'object') ? (v.parsedValue ?? null) : v);

        let baseline = null;
        const normed = [];
        for (let i = 0; i < ts.length; i++) {
            const c = closes[i];
            if (c == null || !isFinite(c)) continue;
            if (baseline === null) baseline = c;
            normed.push({ date: new Date(ts[i] * 1000), pct: (c / baseline - 1) * 100 });
        }
        if (!normed.length) return null;
        _benchmarkCache[symbol] = normed;
        return normed;
    } catch(e) {
        console.warn('Benchmark fetch failed:', symbol, e.message);
        return null;
    }
}

async function toggleBenchmark(id, symbol, label, color, checked) {
    const errEl = document.getElementById(`bench-err-${id}`);
    if (!checked) {
        if (_chart) { _chart.data.datasets = _chart.data.datasets.filter(d => d._benchmarkId !== id); _chart.update(); }
        if (errEl) errEl.textContent = '';
        return;
    }
    if (errEl) errEl.textContent = '⏳';
    const raw = await fetchBenchmark(symbol, _lastSimResult?.years?.length || 10);
    if (!raw || !raw.length) {
        if (errEl) errEl.textContent = '(no data)';
        return;
    }
    if (errEl) errEl.textContent = '';
    if (!_chart || !_lastStartCapital) return;

    const base0    = _cgToBase(_lastStartCapital);
    const simYears = _chart.data.labels;

    // Compute annualised CAGR from historical data (raw is normalised, last pct = total return)
    const totalPct  = raw[raw.length - 1].pct;          // e.g. +19.6% over range
    const spanYears = (raw[raw.length - 1].date - raw[0].date) / (365.25 * 24 * 3600 * 1000);
    const cagr      = spanYears > 0 ? Math.pow(1 + totalPct / 100, 1 / spanYears) - 1 : 0;

    // Project CAGR forward from simulation start year
    const startYear = simYears[0];
    const yearlyData = simYears.map(yr => {
        const yearsAhead = yr - startYear;
        return base0 * Math.pow(1 + cagr, yearsAhead);
    });

    _chart.data.datasets = _chart.data.datasets.filter(d => d._benchmarkId !== id);
    _chart.data.datasets.push({
        _benchmarkId: id, label: `${label} (${(cagr*100).toFixed(1)}% CAGR)`,
        data: yearlyData,
        borderColor: color, backgroundColor: color + '14',
        borderWidth: 1.5, borderDash: [4, 3], pointRadius: 0, tension: 0.3, fill: false, spanGaps: true,
    });
    _chart.update();
}

// ── View toggles ──────────────────────────────────────────────────────────────

