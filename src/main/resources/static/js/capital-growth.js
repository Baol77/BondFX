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
const _CG_SYM  = { EUR: '€', CHF: '₣', USD: '$', GBP: '£' };
let   _cgRates = { EUR: 1.0, CHF: 0.93, USD: 1.08, GBP: 0.86 };

// ── FX multipliers — server-side via /api/fx-multipliers ─────────────────────
// Cache: Map<"CCY_YEARS", {fxBuy, fxCoupon, fxFuture, expiresAt}>
// Populated lazily at simulation time; EUR bonds skip the call entirely.
const _fxCache = new Map();

// Fetch FX multipliers from Java backend (with local in-memory cache).
// Returns {fxBuy, fxCoupon, fxFuture} — falls back to spot-only on error.
async function _fetchFxMultipliers(currency, years, reportCurrency = 'EUR') {
    if (!currency || currency === reportCurrency) return { fxBuy:1, fxCoupon:1, fxFuture:1 };
    const key = `${currency}_${reportCurrency}_${years}`;
    const cached = _fxCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached;
    try {
        const r = await fetch(`/api/fx-multipliers?currency=${currency}&years=${years}&reportCurrency=${reportCurrency}`);
        if (!r.ok) throw new Error(r.status);
        const data = await r.json();
        _fxCache.set(key, { ...data, expiresAt: Date.now() + (data.ttlSeconds || 3600) * 1000 });
        return data;
    } catch {
        // Fallback: use spot rate from ECB rates already loaded
        const spot = _cgFxRates?.[currency] ?? 1.0;
        return { fxBuy: spot, fxCoupon: spot, fxFuture: spot };
    }
}

// Pre-fetch all FX multipliers needed by the current portfolio (parallel).
// Returns Map<"CCY_YEARS", {fxBuy, fxCoupon, fxFuture}> for fast sync access.
async function _prefetchFxForPortfolio(portfolio, reportCurrency = 'EUR') {
    const needed = new Set();
    portfolio.forEach(b => {
        if (b.currency && b.currency !== reportCurrency && b.maturity) {
            const yrs = Math.max(1, Math.round((new Date(b.maturity) - new Date()) / (365.25*24*3600*1000)));
            needed.add(`${b.currency}:${yrs}`);
        }
    });
    await Promise.all([...needed].map(k => {
        const [ccy, yrs] = k.split(':');
        return _fetchFxMultipliers(ccy, parseInt(yrs), reportCurrency);
    }));
}

// Synchronous lookup — only valid AFTER _prefetchFxForPortfolio has been called.
function _fxGet(currency, years, reportCurrency = 'EUR') {
    if (!currency || currency === reportCurrency) return { fxBuy:1, fxCoupon:1, fxFuture:1 };
    const key = `${currency}_${reportCurrency}_${years}`;
    return _fxCache.get(key) || { fxBuy:1, fxCoupon:1, fxFuture:1 };
}

// Compute SAY net using BondScoreEngine formula + cached FX multipliers.
function _computeSAYWithFx(bond) {
    const yrs = Math.max(0.01, (new Date(bond.maturity) - new Date()) / (365.25*24*3600*1000));
    const price = bond.price || bond.priceEur;
    if (!price || !bond.priceEur) return 0;
    const roundYrs = Math.max(1, Math.round(yrs));
    const fx = _fxGet(bond.currency, roundYrs);
    const couponNet = bond.coupon * (1 - (bond.taxRate || 0) / 100);
    const bondNbr   = 1000 / (fx.fxBuy * price);
    const capCoupons = bondNbr * couponNet * Math.ceil(yrs) * fx.fxCoupon;
    const capGain    = 100 * bondNbr * fx.fxFuture;
    return (capCoupons + capGain - 1000) / (10 * yrs);
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
        const fxRate = (b.currency !== 'EUR' && b.price > 0) ? b.priceEur / b.price : 1;
        const nomEur = (b.nominal || 100) * fxRate;
        const pxEur  = (b.priceEur > 0) ? b.priceEur : nomEur;
        return {
            isin:           b.isin,
            issuer:         b.issuer,
            matYear:        new Date(b.maturity).getFullYear(),
            unitsHeld:      b.quantity,
            facePerUnit:    nomEur,
            couponPerUnit:  (b.coupon / 100) * nomEur * (1 - (b.taxRate || 0) / 100),
            pricePerUnit:   pxEur,
            accruedPerUnit: 0,
            synthetic:      false,
        };
    });
}

function slotValue(sl) {
    // Real bonds: market value = pricePerUnit × units (constant snapshot)
    // Synthetic same_bond: also pricePerUnit × units (bought at market, value stable, coupons go to cash)
    // Synthetic market_avg: face + accrued compounds (reinvested into generic instrument)
    if (!sl.synthetic || sl._type === 'same_bond') {
        return sl.unitsHeld * sl.pricePerUnit;
    }
    return sl.unitsHeld * (sl.facePerUnit + sl.accruedPerUnit);
}

/**
 * Run one scenario year-by-year.
 * Returns { dataPoints[], yearEvents[] }
 *
 * perIsinConfig: Map<isin, {mode, priceShift, reinvestYield}>
 * If isin not in map → globalMode / globalPriceShift / globalReinvestYield apply.
 */
function runScenario(slots, years, globalMode, globalPriceShift, globalReinvestYield, perIsinConfig, injectionByYear) {
    let pool = slots.map(s => ({ ...s }));
    let cash = 0;
    const endYear = years[years.length - 1];

    const portfolioVal = () => pool.reduce((s, sl) => s + slotValue(sl), 0) + cash;
    const dataPoints   = [portfolioVal()];
    const yearEvents   = [];

    for (let i = 1; i < years.length; i++) {
        const yr = years[i];
        let yearCoupons = 0, yearRedemptions = 0, reinvested = 0;
        const alive = [];

        for (const sl of pool) {
            if (sl.matYear < yr) continue;

            const couponCash = sl.unitsHeld * sl.couponPerUnit;
            yearCoupons += couponCash;

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
                yearRedemptions += sl.synthetic
                    ? sl.unitsHeld * (sl.facePerUnit + sl.accruedPerUnit)
                    : sl.unitsHeld * sl.facePerUnit;
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

        yearEvents.push({ yr, coupons: yearCoupons, redemptions: yearRedemptions, cashIn, reinvested, cash });
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

function runMaturityReplacement(slots, years, matReplacement, injectionByYear) {
    const { sourceBond, netCouponPct, maturityYear, reinvestCoupons,
            priceShift } = matReplacement;
    // priceShift: +100 = buy at 2× face, −50 = buy at 0.5× face
    // adjFact: 1.0 = par, 0.5 = 50% of face, 2.0 = 200% of face
    const replAdjFact = Math.max(0.01, 1 + (priceShift || 0) / 100);

    // Build initial pool same as a coupon-reinvest scenario
    let pool = slots.map(s => ({ ...s }));
    let cash = 0;
    const simEndYear = years[years.length - 1];
    // Extend years array if replacement bond matures after portfolio end
    const allYears = [...years];
    for (let y = simEndYear + 1; y <= maturityYear; y++) allYears.push(y);

    const portfolioVal = () => pool.reduce((s, sl) => s + slotValue(sl), 0) + cash;
    const dataPoints   = [portfolioVal()];
    const yearEvents   = [];

    for (let i = 1; i < allYears.length; i++) {
        const yr = allYears[i];
        let yearCoupons = 0, yearRedemptions = 0, reinvested = 0, replCoupons = 0;
        let replacementActivated = false;
        const alive = [];

        for (const sl of pool) {
            if (sl.matYear < yr) continue;

            const couponCash = sl.unitsHeld * sl.couponPerUnit;

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
                if (sl.isin === sourceBond.isin) replacementActivated = true;
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
        const totalFace = refPool.reduce((s, sl) => s + sl.unitsHeld * sl.facePerUnit, 0);

        if (cashIn > 0 && totalFace > 0) {
            for (const sl of refPool) {
                // Skip replacement slots — their coupons are handled directly in the loop above
                if (sl._isReplacement) continue;

                const share   = (sl.unitsHeld * sl.facePerUnit) / totalFace;
                const myShare = cashIn * share;

                if (sl.isin === sourceBond.isin && replacementActivated) {
                    // All proceeds from the source bond → replacement bond
                    const replCouponPerUnit = netCouponPct / 100;  // per unit of face
                    const replMatYear       = maturityYear;
                    if (replMatYear > yr) {
                        // Create replacement slot: face=1, pricePerUnit=1 (bought at par),
                        // couponPerUnit = netCouponPct/100 per unit, compounding if reinvestCoupons
                        // replAdjFact: price relative to face. 
                        // e.g. 0.8 = bought at 80% = discount bond.
                        // units = total cash / (face * adjFact)
                        // slotValue = units * pricePerUnit = units * adjFact (pricePerUnit ≈ adjFact)
                        // At maturity: redeem at face (1.0) → capital gain if adjFact < 1
                        const replSlot = {
                            isin:           sl.isin + '_repl_' + yr,
                            issuer:         '→ Replacement bond',
                            matYear:        replMatYear,
                            unitsHeld:      myShare / replAdjFact,  // units = cash / price
                            facePerUnit:    1,
                            couponPerUnit:  replCouponPerUnit,       // coupon on face
                            pricePerUnit:   replAdjFact,             // market price
                            accruedPerUnit: 0,
                            synthetic:      true,
                            _type:          'same_bond',
                            _takeCouponAsCash: !reinvestCoupons,
                            _isReplacement: true,
                        };
                        pool.push(replSlot);
                        reinvested += myShare;
                    } else {
                        cash += myShare;
                    }
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

        yearEvents.push({
            yr,
            // For replacement scenarios: coupons = non-replacement bond coupons + replacement coupons
            coupons: yearCoupons + replCoupons,
            redemptions: yearRedemptions,
            cashIn,
            // 'reinvested' = capital switched into replacement bond (at activation year)
            // In subsequent years, reinvested=0 (coupon reinvestment is internal to slot)
            reinvested: replacementActivated ? 0 : reinvested,
            switched: replacementActivated ? reinvested : 0,  // capital transfer at maturity
            replCoupons,   // coupons FROM the replacement bond
            cash,
            replacementActivated,
            replacementBond: replacementActivated
                ? { netCouponPct, maturityYear, reinvestCoupons }
                : null,
        });
        dataPoints.push(portfolioVal());
    }
    return { dataPoints, yearEvents, extendedYears: allYears };
}


function computeSAYNet(bond) {
    // Uses BondScoreEngine formula with Ornstein-Uhlenbeck FX haircuts (JS port of FxService).
    return _computeSAYWithFx(bond);
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

// Helper: compute portfolio effective SAY given a price shift on all bonds
function computeEffectiveSAY(portfolio, priceShift) {
    const adjFact = 1 + (priceShift || 0) / 100;
    let totalW = 0, totalSAY = 0;
    portfolio.forEach(b => {
        const adjPriceEur = (b.priceEur || 0) * Math.max(0.01, adjFact);
        const adjPrice    = (b.price    || 0) * Math.max(0.01, adjFact);
        const bondAdj = { ...b, priceEur: adjPriceEur, price: adjPrice };
        const say = _computeSAYWithFx(bondAdj);
        const w = adjPriceEur * b.quantity;
        totalSAY += say * w;
        totalW   += w;
    });
    return totalW > 0 ? totalSAY / totalW : 0;
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
    (_customScenarios || []).filter(cs => cs._type === 'maturity_replacement').forEach(cs => {
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

// ── Summary stats ─────────────────────────────────────────────────────────────
// "Stats by bond": per-bond checkboxes; stat cards aggregate only selected bonds.
// Each bond has a dedicated per-bond final-value/cagr/coupons pre-computed;
// selection changes which bonds are summed.
function renderSummaryStats(portfolio, simResult, startCapital) {
    const el = document.getElementById('summaryStats');
    if (!el) return;

    const sym = _cgSym();
    const fmt = v => sym + _cgToBase(v).toLocaleString(undefined, {maximumFractionDigits:0});
    const card = (lbl, val, sub='') =>
        `<div class="cg-stat-card"><div class="cg-stat-label">${lbl}</div><div class="cg-stat-value">${val}</div>${sub?`<div class="cg-stat-sub">${sub}</div>`:''}</div>`;

    const allScenarios = simResult.scenarios || [];
    const portfolioCost = portfolio.reduce((s, b) => s + (b.totalEur || (b.priceEur||0)*b.quantity), 0);

    // Per-bond pre-computation: scale each bond's contribution to startCapital
    // bondStats[i] = { initialCap, finalVal, totalCoupons, faceVal, horizon, cagr }
    function computeBondStats(b) {
        const bondCost  = b.totalEur || (b.priceEur||0)*b.quantity;
        const share     = (portfolioCost > 0) ? bondCost / portfolioCost : 0;
        const bondStart = startCapital * share;

        // Total net coupons (BondScoreEngine-aligned via server FX, scaled to bondStart)
        const yrs = Math.max(0, (new Date(b.maturity) - new Date()) / (365.25*24*3600*1000));
        const roundYrs = Math.max(1, Math.round(yrs));
        const fx = _fxGet(b.currency, roundYrs);
        const couponNet = b.coupon * (1 - (b.taxRate||0)/100);
        const bondNbr = (bondStart / 1000) * 1000 / (fx.fxBuy * (b.price||b.priceEur));
        const totalCoupons = bondNbr * couponNet * Math.ceil(yrs) * fx.fxCoupon;
        const faceVal      = 100 * bondNbr * fx.fxFuture;

        // Final value: use no_reinvest scenario (cash coupons + face redemption), scaled to share
        const noRSc = allScenarios.find(s => s.id === 'no_reinvest');
        // no_reinvest final = total cash (face + all net coupons) received by portfolio end
        // We use totalCoupons + faceVal as a consistent per-bond measure
        const finalVal = totalCoupons + faceVal;
        const horizon  = simResult.years.length - 1;
        const cagr = (horizon > 0 && bondStart > 0 && finalVal > 0)
            ? (Math.pow(finalVal / bondStart, 1 / horizon) - 1) * 100 : 0;

        return { bondStart, finalVal, totalCoupons, faceVal, horizon, cagr, b };
    }

    const bondStats  = portfolio.map(computeBondStats);

    // Also one entry for each maturity_replacement scenario
    const replStats = (simResult.scenarios||[]).filter(s=>s._type==='maturity_replacement').map(sc => {
        const bStats = bondStats.find(bs => bs.b.isin === sc._sourceBond?.isin);
        const bondStart = bStats?.bondStart || 0;
        const scYears = sc._extendedYears || simResult.years;
        const finalVal = sc.data.length > 0 && isFinite(sc.data[sc.data.length-1])
            ? sc.data[sc.data.length-1] : bondStart;
        const horizon = scYears.length - 1;
        const cagr = (horizon > 0 && bondStart > 0 && finalVal > 0)
            ? (Math.pow(finalVal / bondStart, 1 / horizon) - 1) * 100 : 0;
        return { bondStart, finalVal, totalCoupons: 0, faceVal: 0, horizon, cagr, sc, isRepl: true };
    });

    // Checkbox state: which bonds/replacements are selected (persisted in DOM)
    const chkId = 'cgBondChkSel';
    const existingEl = document.getElementById(chkId);
    const prevSel = existingEl
        ? new Set([...existingEl.querySelectorAll('input:checked')].map(i=>i.value))
        : new Set([...portfolio.map(b=>b.isin), ...replStats.map(r=>r.sc?.id||'')]);

    const isDarkS = document.body.classList.contains('dark');
    const COLORS = isDarkS ? (typeof BOND_COLORS_DARK !== 'undefined' ? BOND_COLORS_DARK : ['#60a5fa','#fb923c','#4ade80','#f472b6','#a78bfa']) : (typeof BOND_COLORS_LIGHT !== 'undefined' ? BOND_COLORS_LIGHT : ['#2563eb','#ea580c','#16a34a','#db2777','#7c3aed']);

    // Build checkbox HTML
    const issuerCount = {};
    portfolio.forEach(b => { issuerCount[b.issuer] = (issuerCount[b.issuer]||0)+1; });

    // B: one combined checkbox per bond; if a replacement exists for this bond, show it inline.
    const bondChkHtml = bondStats.map((bs, i) => {
        const b = bs.b;
        const c = COLORS[i % COLORS.length];
        const bondLabel = issuerCount[b.issuer] > 1
            ? `${b.issuer} <span style="font-family:monospace;font-size:10px;opacity:0.7">${b.isin}</span> (${(b.maturity||'').slice(0,4)})`
            : `${b.issuer} (${(b.maturity||'').slice(0,4)})`;
        // Find linked replacement scenario for this bond
        const repl = replStats.find(rs => rs.sc?._sourceBond?.isin === b.isin);
        const checked = prevSel.has(b.isin) ? 'checked' : '';
        const replTag = repl
            ? `<span style="font-size:10px;color:#888;font-weight:400;margin-left:4px;">
                + <span style="display:inline-block;width:8px;height:8px;border-radius:1px;border:2px dashed ${c};vertical-align:middle;"></span>
                <span style="font-style:italic;">${repl.sc.label.replace(/^.*?→\s*/,'→ ')}</span>
               </span>`
            : '';
        return `<label style="display:inline-flex;align-items:center;gap:5px;margin:3px 10px 3px 0;cursor:pointer;font-size:12px;font-weight:600;">
            <input type="checkbox" value="${b.isin}" ${checked} onchange="_cgStatsRefresh()">
            <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${c};flex-shrink:0;"></span>
            ${bondLabel}${replTag}
        </label>`;
    }).join('');

    const replChkHtml = ''; // B: replacements now shown inline in bond checkbox

    // Aggregate cards for selected bonds
    function renderCards() {
        const chkContainer = document.getElementById(chkId);
        const sel = chkContainer
            ? new Set([...chkContainer.querySelectorAll('input:checked')].map(i=>i.value))
            : new Set([...portfolio.map(b=>b.isin), ...replStats.map(r=>r.sc?.id||'')]);

        let totStart=0, totFinal=0, totCoupons=0, totFace=0, maxHorizon=0;
        bondStats.forEach(bs => {
            if (!sel.has(bs.b.isin)) return;
            totStart   += bs.bondStart;
            totFinal   += bs.finalVal;
            totCoupons += bs.totalCoupons;
            totFace    += bs.faceVal;
            maxHorizon  = Math.max(maxHorizon, bs.horizon);
        });
        // B: replacement is controlled by source bond's checkbox (same isin key).
        // If source bond is selected AND has a replacement, override final value with replacement's.
        replStats.forEach(rs => {
            if (!rs.sc) return;
            const srcIsin = rs.sc._sourceBond?.isin;
            if (!srcIsin || !sel.has(srcIsin)) return;  // only if source bond is selected
            const srcBs = bondStats.find(bs => bs.b.isin === srcIsin);
            if (srcBs) {
                totFinal   -= srcBs.finalVal;
                totFinal   += rs.finalVal;
                maxHorizon  = Math.max(maxHorizon, rs.horizon);
            }
        });

        const cagr = (maxHorizon > 0 && totStart > 0 && totFinal > 0)
            ? (Math.pow(totFinal / totStart, 1 / maxHorizon) - 1) * 100 : 0;

        return card('Initial Capital',   fmt(totStart)) +
               card('Final Value',       fmt(totFinal),    'coupons + face at mat.') +
               card('Total Net Coupons', fmt(totCoupons),  'over full horizon') +
               card('Capital Returned',  fmt(totFace),     'face value × qty') +
               card('Horizon',           `${maxHorizon} yrs`) +
               card('CAGR',              `${cagr.toFixed(2)}%`, 'compound annual');
    }

    el.innerHTML = `
        <div id="${chkId}" style="padding-bottom:8px;border-bottom:1px solid ${isDarkS?'#2a2d45':'#e0e5f0'};margin-bottom:10px;">
            <div style="font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px;">Stats by bond</div>
            <div style="display:flex;flex-wrap:wrap;">${bondChkHtml}${replChkHtml}</div>
        </div>
        <div id="cgStatsCards">${renderCards()}</div>`;

    window._cgStatsRefresh = function() {
        const cardsEl = document.getElementById('cgStatsCards');
        if (cardsEl) cardsEl.innerHTML = renderCards();
        // C: for maturity_replacement scenarios, sync chart visibility with bond checkbox.
        // Aggregate scenarios (no_reinvest, coupon_reinvest) always stay at their legend state.
        if (_chart && _lastSimResult) {
            const activeIsins = _getActiveBondIsins();
            _chart.data.datasets.forEach((ds, dsIdx) => {
                const scenId = ds._scenId;
                const sc = _lastSimResult.scenarios.find(s => s.id === scenId);
                if (!sc) return;
                const meta = _chart.getDatasetMeta(dsIdx);
                const legendHidden = _hiddenScenarioIds.has(scenId);
                if (sc._type === 'maturity_replacement') {
                    // Hide if source bond is deselected
                    const bondDeselected = activeIsins.size > 0 && !activeIsins.has(sc._sourceBond?.isin);
                    meta.hidden = legendHidden || bondDeselected;
                } else {
                    meta.hidden = legendHidden;
                }
            });
            _chart.update('none');
        }
    };
    window._cgUpdateStats = window._cgStatsRefresh; // alias
}

// ── Growth chart ──────────────────────────────────────────────────────────────
let _chart = null, _chartBond = null;
let _lastSimResult = null, _lastStartCapital = 0, _lastPortfolio = [];
let _hiddenScenarioIds = new Set();  // IDs of scenarios hidden by user click on legend

// ── Bond checkbox helpers ─────────────────────────────────────────────────────
// Returns Set of ISINs currently checked in cgBondChkSel.
// Empty set = all bonds (no filter applied yet).
function _getActiveBondIsins() {
    const el = document.getElementById('cgBondChkSel');
    if (!el) return new Set();
    const all     = [...el.querySelectorAll('input[type=checkbox]')];
    const checked = all.filter(i => i.checked).map(i => i.value);
    // If all are checked or none exist, return empty = no filter
    if (checked.length === all.length || all.length === 0) return new Set();
    return new Set(checked);
}

// Returns true if a scenario should be visible given the selected bond ISINs.
// no_reinvest / reinvest_flat: visible if ALL portfolio bonds visible (they aggregate).
// custom coupon_reinvest: same — portfolio-wide.
// maturity_replacement: visible if sourceBond ISIN is in selection.
function _scenarioBondVisible(scenario, activeIsins) {
    if (activeIsins.size === 0) return true; // no filter
    // B: replacement scenario visibility tied to source bond checkbox (keyed by isin)
    if (scenario._type === 'maturity_replacement') {
        return activeIsins.has(scenario._sourceBond?.isin);
    }
    return true;
}

function renderGrowthChart(simResult, startCapital) {
    const canvas = document.getElementById('growthChart');
    if (!canvas) return;
    if (_chart) { _chart.destroy(); _chart = null; }

    const isDark     = document.body.classList.contains('dark');
    const gridColor  = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
    const labelColor = isDark ? '#8890b8' : '#666';
    const sym        = _cgSym();
    const base0      = _cgToBase(startCapital);

    // Merge all year labels across base + any extended maturity-replacement scenarios
    const allLabels = [...simResult.years];
    simResult.scenarios.forEach(s => {
        if (s._extendedYears) {
            s._extendedYears.forEach(y => { if (!allLabels.includes(y)) allLabels.push(y); });
        }
    });
    allLabels.sort((a, b) => a - b);

    // B: on very first render hide everything except no_reinvest.
    // _cgInitialized persists across re-renders (unlike _chart which is destroyed/recreated).
    if (!window._cgInitialized) {
        window._cgInitialized = true;
        simResult.scenarios.forEach(s => {
            if (s.id !== 'no_reinvest') _hiddenScenarioIds.add(s.id);
        });
    } else {
        // On re-render: remove hidden IDs for scenarios that no longer exist
        const validIds = new Set(simResult.scenarios.map(s => s.id));
        _hiddenScenarioIds.forEach(id => { if (!validIds.has(id)) _hiddenScenarioIds.delete(id); });
    }

    // C: also hide scenarios whose source bond is not in cgBondChkSel selection
    const _activeBondIsins = _getActiveBondIsins();

    const datasets = simResult.scenarios.map(s => {
        const yearList = s._extendedYears || simResult.years;
        const replStartYear = s._type === 'maturity_replacement' && s._sourceBond
            ? s._sourceBond.matYear : null;

        const aligned = allLabels.map(yr => {
            const idx = yearList.indexOf(yr);
            if (idx < 0 || idx >= s.data.length) return null;
            const v = s.data[idx];
            return (v !== null && isFinite(v)) ? _cgToBase(v) : null;
        });
        const scenId   = s.id;
        // C: hide scenario if ALL its bonds are deselected
        const bondHidden = _activeBondIsins.size > 0 && !_scenarioBondVisible(s, _activeBondIsins);
        const isHidden   = _hiddenScenarioIds.has(scenId) || bondHidden;
        return {
            label:           s.label,
            data:            aligned,
            borderColor:     s.color,
            backgroundColor: s.color + '18',
            borderWidth:     s.id === 'no_reinvest' ? 1.5 : 2.2,
            borderDash:      s.id === 'no_reinvest' ? [5,4] : (s._custom ? [8,3] : []),
            pointRadius:     allLabels.length > 15 ? 0 : 3,
            tension:         0.3,
            fill:            false,
            spanGaps:        false,
            hidden:          isHidden,
            _scenId:         scenId,
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
                    labels: { color: labelColor, font: {size:11}, padding:14, boxWidth:26, usePointStyle:true },
                    onClick: (evt, legendItem, legend) => {
                        const chart = legend.chart;
                        const idx   = legendItem.datasetIndex;
                        const meta  = chart.getDatasetMeta(idx);
                        // Toggle visibility
                        meta.hidden = meta.hidden === null ? !chart.data.datasets[idx].hidden : !meta.hidden;
                        // Persist: use dataset id or label as key
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
                            if (v==null || !isFinite(v)) return null;
                            const gain = v - base0;
                            const sign = gain >= 0 ? '+' : '';
                            const f = n => Math.round(n).toLocaleString(undefined,{maximumFractionDigits:0});
                            return ` ${ctx.dataset.label}: ${sym}${f(v)} (${sign}${sym}${f(gain)})`;
                        },
                    },
                },
            },
            scales: {
                x: { ticks: { color: labelColor, font:{size:11} }, grid: { color: gridColor } },
                y: { ticks: { color: labelColor, font:{size:11},
                    callback: v => isFinite(v) ? sym + Math.round(v).toLocaleString(undefined,{maximumFractionDigits:0}) : '' },
                    grid: { color: gridColor } },
            },
        },
    });
}

// ── Year detail modal ─────────────────────────────────────────────────────────
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

    let rows = simResult.scenarios.map(sc => {
        // For extended scenarios, find event by year, not by chart index
        const scYears = sc._extendedYears || simResult.years;
        const scIdx   = scYears.indexOf(yr);
        const ev      = scIdx > 0 ? sc.yearEvents?.[scIdx - 1] : null;
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

        // For maturity_replacement: before the sourceBond maturity year, show '—'
        const isReplPreActivation = sc._type === 'maturity_replacement'
            && yr < (sc._sourceBond?.matYear || 9999)
            && !ev?.replacementActivated;
        const isReplActivation = sc._type === 'maturity_replacement' && ev?.replacementActivated;

        // At replacement activation: coupons/redemptions show 0 (new bond just purchased,
        // original bond proceeds are implicit in the → switch shown in Reinvested)
        const couponCell = isReplPreActivation || isReplActivation
            ? '<span style="color:#888">—</span>'
            : sc._type === 'maturity_replacement'
                ? sc2(ev?.replCoupons || 0)
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
                reinvestedCell = '<span style="color:#888">—</span>';
            } else if (isReplActivation) {
                reinvestedCell = `<span style="color:#90caf9;font-size:10px" title="Capital switched to new bond">→ ${sc2(ev.switched||0)}</span>`;
            } else {
                // Post-activation: show reinvested coupons (0 if take-as-cash)
                reinvestedCell = sc2(ev?.replCoupons || 0);
            }
        } else {
            // Standard: show total reinvested (coupons + redemptions that were reinvested)
            reinvestedCell = sc2(ev?.reinvested || 0);
        }
        // Note: redemption capital reinvestment is implicit in Portfolio Value delta
        const valDisplay  = val != null ? `${sym}${Math.round(_cgToBase(val)).toLocaleString(undefined,{maximumFractionDigits:0})}` : '—';
        const deltaDisplay = delta != null
            ? `<span style="color:${delta>=0?'#43a047':'#e53935'};font-weight:600;">${sign}${sym}${Math.abs(Math.round(_cgToBase(delta))).toLocaleString(undefined,{maximumFractionDigits:0})}</span>`
            : '<span style="color:#888">—</span>';

        return `<tr>
            <td style="padding:7px 10px;">
                <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${sc.color};margin-right:6px;vertical-align:middle;"></span>
                ${sc.label}
            </td>
            <td style="padding:7px 10px;text-align:right;">${couponCell}</td>
            <td style="padding:7px 10px;text-align:right;">${redempCell}</td>
            <td style="padding:7px 10px;text-align:right;">${reinvestedCell}</td>
            <td style="padding:7px 10px;text-align:right;font-weight:700;">${valDisplay}</td>
            <td style="padding:7px 10px;text-align:right;">${deltaDisplay}</td>
        </tr>`;
    }).join('');

    const maturingBonds = _lastPortfolio.filter(b => new Date(b.maturity).getFullYear() === yr);
    let matHtml = '';
    if (maturingBonds.length) {
        // Show ISIN if multiple bonds from same issuer mature in same year
        const issuerCount = {};
        maturingBonds.forEach(b => { issuerCount[b.issuer] = (issuerCount[b.issuer] || 0) + 1; });

        // Check if any maturity_replacement scenario activates this year
        const activeRepls = (_customScenarios||[]).filter(cs =>
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
                const label = issuerCount[b.issuer] > 1
                    ? `${b.issuer} <span style="font-family:monospace;font-size:10px;opacity:0.75">${b.isin}</span>`
                    : b.issuer;
                return `<span style="font-size:12px;margin-right:16px;">${label}</span>`;
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
                        <th style="padding:7px 10px;text-align:right;">Portfolio Value</th>
                        <th style="padding:7px 10px;text-align:right;">Δ vs prev yr</th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>
                ${matHtml}
                <p style="font-size:10px;color:${isDark?'#5a6080':'#aaa'};margin-top:10px;">
                    Coupons net of withholding tax. Redemptions = face value returned. Sudden growth = bond maturation + reinvestment.
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
const BOND_COLORS_DARK  = ['#5b9bd5','#70c172','#ffd740','#ff7043','#ba68c8','#4dd0e1','#fff176','#a5d6a7','#ef9a9a','#90caf9'];
const BOND_COLORS_LIGHT = ['#1565c0','#2e7d32','#e65100','#6a1b9a','#00838f','#f9a825','#558b2f','#ad1457','#4527a0','#37474f'];
let _bondChartMode = 'stacked';

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
    (_customScenarios||[]).filter(cs=>cs._type==='maturity_replacement').forEach(cs => {
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
        const cs = (_customScenarios||[]).find(c=>c.id===t._scenarioId);
        const srcYears = cs ? (() => {
            const ys = [...years];
            for (let y=Math.max(...years)+1;y<=cs.maturityYear;y++) ys.push(y);
            return ys;
        })() : years;
        // Fix D: use portfolio.length + index-in-all-replacement-scenarios for stable color
        const allReplScenarios = (_customScenarios||[]).filter(c=>c._type==='maturity_replacement');
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

// ── Per-ISIN config + multi-scenario UI ──────────────────────────────────────
let _customScenarios = [];   // { id, name, color?, _type: 'coupon_reinvest'|'maturity_replacement', ...fields }
let _perIsinOverrides = {};  // scenId -> Map<isin, {priceShift}>  (coupon_reinvest only)

// ── Panel root ──────────────────────────────────────────────────────────────
function buildPerIsinPanel(portfolio, simResult) {
    const panel = document.getElementById('perIsinPanel');
    if (!panel) return;
    const wSAY   = simResult.weightedSAY || 3;
    const isDark  = document.body.classList.contains('dark');
    const bg      = isDark ? '#1e2338' : '#fff';
    const border  = isDark ? '#2a2d45' : '#dde3ee';
    const tabBg   = isDark ? '#252840' : '#f0f4ff';
    const tabAct  = isDark ? '#1e2338' : '#fff';
    const tabText = isDark ? '#8890b8' : '#888';

    // Preserve active tab across re-renders
    const prevTab = document.getElementById('perIsinPanel')?._activeTab || 'coupon';

    panel.innerHTML = `
        <div class="cg-scenario-panel" style="padding:0;overflow:hidden;">
            <div style="display:flex;align-items:stretch;background:${tabBg};border-bottom:1px solid ${border};">
                <button id="cgTab_coupon"     class="cg-tab-btn" onclick="switchScenarioTab('coupon')"
                    style="flex:1;padding:9px 6px;font-size:11px;font-weight:600;border:none;cursor:pointer;border-bottom:2px solid transparent;background:transparent;color:${tabText};">
                    📈 Coupon reinvest
                </button>
                <button id="cgTab_replacement" class="cg-tab-btn" onclick="switchScenarioTab('replacement')"
                    style="flex:1;padding:9px 6px;font-size:11px;font-weight:600;border:none;cursor:pointer;border-bottom:2px solid transparent;background:transparent;color:${tabText};">
                    🔄 Maturity replacement
                </button>
                <button id="cgTab_injection"   class="cg-tab-btn" onclick="switchScenarioTab('injection')"
                    style="flex:1;padding:9px 6px;font-size:11px;font-weight:600;border:none;cursor:pointer;border-bottom:2px solid transparent;background:transparent;color:${tabText};">
                    💰 Annual injection
                </button>
            </div>
            <div style="padding:12px 14px;">
                <div id="cgTabBody_coupon"     style="display:none;"></div>
                <div id="cgTabBody_replacement"style="display:none;"></div>
                <div id="cgTabBody_injection"  style="display:none;"></div>
            </div>
        </div>`;

    panel._activeTab = prevTab;
    renderCouponTab(portfolio, wSAY, isDark, border);
    renderReplacementTab(portfolio, isDark, border);
    renderInjectionTab(portfolio, isDark, border);
    switchScenarioTab(prevTab);
}

function switchScenarioTab(tab) {
    const isDark = document.body.classList.contains('dark');
    const activeColor = isDark ? '#5b8dee' : '#1a3a8c';
    ['coupon','replacement','injection'].forEach(t => {
        const btn  = document.getElementById(`cgTab_${t}`);
        const body = document.getElementById(`cgTabBody_${t}`);
        if (!btn || !body) return;
        const isActive = t === tab;
        btn.style.borderBottomColor  = isActive ? activeColor : 'transparent';
        btn.style.color              = isActive ? activeColor : (isDark ? '#8890b8' : '#888');
        btn.style.fontWeight         = isActive ? '700' : '600';
        body.style.display           = isActive ? 'block' : 'none';
    });
    const panel = document.getElementById('perIsinPanel');
    if (panel) panel._activeTab = tab;
}

// ── Tab renderers ────────────────────────────────────────────────────────────

function renderCouponTab(portfolio, wSAY, isDark, border) {
    const el = document.getElementById('cgTabBody_coupon');
    if (!el) return;
    const inpSt = `font-size:11px;padding:3px 6px;border-radius:4px;border:1px solid ${border};background:${isDark?'#1e2338':'#fff'};color:inherit;`;
    const cs = _customScenarios.find(s => s._type === 'coupon_reinvest');

    if (!cs) {
        // No coupon scenario yet — show enable button
        el.innerHTML = `
            <p style="font-size:12px;color:#888;margin:0 0 10px;">
                Define a single coupon reinvestment scenario. Coupons are reinvested into the same bond at the specified price.
            </p>
            <button class="cg-btn-secondary" style="font-size:12px;padding:6px 16px;" onclick="enableCouponScenario()">
                ＋ Enable coupon reinvestment
            </button>`;
        return;
    }

    const overrides = _perIsinOverrides[cs.id] || new Map();
    const overrideRows = portfolio.map(b => {
        const cfg     = overrides.get(b.isin) || {};
        const hasOvr  = overrides.has(b.isin);
        const bondSAY = computeSAYNet({ ...b, priceEur: (b.priceEur||0) * Math.max(0.01, 1+(hasOvr?(cfg.priceShift||0):0)/100) }).toFixed(2);
        const dis     = hasOvr ? '' : 'disabled';
        const label   = portfolio.filter(x=>x.issuer===b.issuer).length > 1
            ? `${b.issuer} <span style="font-family:monospace;font-size:9px;opacity:0.6">${b.isin}</span>`
            : b.issuer;
        return `<tr style="vertical-align:middle;">
            <td style="padding:5px 8px;">${label} <span style="font-size:9px;color:#888">(${(b.maturity||'').slice(0,4)})</span></td>
            <td style="padding:5px 8px;text-align:center;">
                <input type="checkbox" ${hasOvr?'checked':''} onchange="toggleCouponOverride('${cs.id}','${b.isin}',this.checked)">
            </td>
            <td style="padding:5px 8px;text-align:center;">
                <input type="number" ${dis} value="${cfg.priceShift??0}" min="-500" max="500" step="1"
                    onchange="updateCouponOverride('${cs.id}','${b.isin}','priceShift',parseFloat(this.value)||0)"
                    style="${inpSt}width:65px;text-align:right;" title="Price shift %">
            </td>
            <td style="padding:5px 8px;text-align:right;color:#70c172;font-size:10px;">${bondSAY}%</td>
        </tr>`;
    }).join('');

    const effSAY = computeEffectiveSAY(portfolio, cs.globalPriceShift);

    el.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
            <input value="${cs.name}" onchange="updateCouponScenarioName(this.value)"
                style="font-weight:700;font-size:12px;${inpSt}width:180px;" title="Scenario name">
            <span style="font-size:11px;color:#888;">Weighted SAY: <strong style="color:#70c172;">${wSAY.toFixed(2)}%</strong></span>
            <button onclick="disableCouponScenario()"
                style="margin-left:auto;background:transparent;border:1px solid #c62828;color:#e57373;border-radius:4px;padding:3px 10px;font-size:11px;cursor:pointer;">
                Remove
            </button>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
            <thead><tr style="color:#888;">
                <th style="text-align:left;padding:4px 8px;">Bond</th>
                <th style="padding:4px 8px;text-align:center;">Override</th>
                <th style="padding:4px 8px;text-align:center;">Price shift %</th>
                <th style="padding:4px 8px;text-align:right;">SAY (net)</th>
            </tr></thead>
            <tbody>
                <tr style="vertical-align:middle;opacity:0.7;">
                    <td style="padding:5px 8px;font-style:italic;">Global default</td>
                    <td style="padding:5px 8px;text-align:center;">—</td>
                    <td style="padding:5px 8px;text-align:center;">
                        <input type="number" value="${cs.globalPriceShift}" min="-500" max="500" step="1"
                            onchange="updateCouponGlobal(parseFloat(this.value)||0)"
                            style="${inpSt}width:65px;text-align:right;">
                    </td>
                    <td style="padding:5px 8px;text-align:right;color:#70c172;font-size:10px;">${effSAY.toFixed(2)}%</td>
                </tr>
                ${overrideRows}
            </tbody>
        </table>`;
}

function renderReplacementTab(portfolio, isDark, border) {
    const el = document.getElementById('cgTabBody_replacement');
    if (!el) return;
    const inpSt = `font-size:11px;padding:3px 6px;border-radius:4px;border:1px solid ${border};background:${isDark?'#1e2338':'#fff'};color:inherit;`;

    if (!portfolio.length) { el.innerHTML = '<p style="color:#888;font-size:12px;">No bonds loaded.</p>'; return; }

    // D: one row per bond, each bond has its own replacement config (or empty)
    const rows = portfolio.map((b, bi) => {
        const matYear = new Date(b.maturity).getFullYear();
        const label   = portfolio.filter(x=>x.issuer===b.issuer).length > 1
            ? `${b.issuer} <span style="font-family:monospace;font-size:10px;opacity:0.7">${b.isin}</span>`
            : b.issuer;
        // Find existing replacement scenario for this bond
        const cs = _customScenarios.find(s => s._type==='maturity_replacement' && s.sourceBond?.isin===b.isin);
        const si = cs ? _customScenarios.indexOf(cs) : -1;
        const enabled = !!cs;

        if (!enabled) {
            return `<div style="padding:8px 0;border-bottom:1px solid ${border};display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                <span style="font-size:12px;font-weight:600;min-width:120px;">${label}</span>
                <span style="font-size:11px;color:#888;">matures ${matYear}</span>
                <button class="cg-btn-secondary" style="font-size:11px;padding:3px 10px;margin-left:auto;"
                    onclick="enableReplacement('${b.isin}')">＋ Add replacement</button>
            </div>`;
        }

        const dotColor = SCENARIO_PALETTE[(4 + si) % SCENARIO_PALETTE.length];
        return `<div style="padding:8px 0;border-bottom:1px solid ${border};overflow-x:auto;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
                <span style="width:10px;height:10px;border-radius:50%;background:${dotColor};display:inline-block;flex-shrink:0;"></span>
                <span style="font-size:12px;font-weight:700;">${label}</span>
                <span style="font-size:11px;color:#888;">matures ${matYear} →</span>
                <input value="${cs.name}" onchange="updateMatRepl(${si},'name',this.value)"
                    style="font-size:11px;font-weight:600;${inpSt}width:150px;" title="Scenario name">
                <button onclick="disableReplacement('${b.isin}')"
                    style="margin-left:auto;background:transparent;border:1px solid #c62828;color:#e57373;border-radius:4px;padding:3px 8px;font-size:11px;cursor:pointer;">Remove</button>
            </div>
            <div class="cg-repl-fields" style="display:flex;flex-wrap:wrap;gap:10px;padding-left:20px;font-size:11px;">
                <label style="display:flex;flex-direction:column;gap:3px;">
                    <span style="color:#888;font-size:10px;">Net coupon %</span>
                    <input type="number" value="${cs.netCouponPct}" min="0" max="100" step="0.01"
                        onchange="updateMatRepl(${si},'netCouponPct',parseFloat(this.value)||0)"
                        style="${inpSt}width:80px;text-align:right;" title="Net annual coupon % of new bond after tax">
                </label>
                <label style="display:flex;flex-direction:column;gap:3px;">
                    <span style="color:#888;font-size:10px;">Price shift %</span>
                    <input type="number" value="${cs.priceShift??0}" min="-500" max="500" step="1"
                        onchange="updateMatRepl(${si},'priceShift',parseFloat(this.value)||0)"
                        style="${inpSt}width:75px;text-align:right;">
                </label>
                <label style="display:flex;flex-direction:column;gap:3px;">
                    <span style="color:#888;font-size:10px;">New maturity year</span>
                    <input type="number" value="${cs.maturityYear}" min="${new Date().getFullYear()+1}" max="2200" step="1"
                        onchange="updateMatRepl(${si},'maturityYear',parseInt(this.value)||${matYear+10})"
                        style="${inpSt}width:80px;text-align:center;">
                </label>
                <label style="display:flex;flex-direction:column;gap:3px;">
                    <span style="color:#888;font-size:10px;">Coupons</span>
                    <select onchange="updateMatRepl(${si},'reinvestCoupons',this.value==='true')" style="${inpSt}">
                        <option value="true"  ${cs.reinvestCoupons?'selected':''}>Reinvest</option>
                        <option value="false" ${!cs.reinvestCoupons?'selected':''}>Cash</option>
                    </select>
                </label>
            </div>
        </div>`;
    }).join('');

    el.innerHTML = `
        <p style="font-size:11px;color:#888;margin:0 0 10px;">
            When a bond matures, all proceeds are reinvested into a new synthetic bond. Configure one replacement per bond.
        </p>
        ${rows}`;
}

function renderInjectionTab(portfolio, isDark, border) {
    const el = document.getElementById('cgTabBody_injection');
    if (!el) return;
    const inpSt = `font-size:11px;padding:3px 6px;border-radius:4px;border:1px solid ${border};background:${isDark?'#1e2338':'#fff'};color:inherit;`;
    const inj   = _injectionConfig;
    const sym   = _cgSym();
    const enabled = inj.enabled;

    // Compute active bonds at start (non-matured)
    const today   = new Date().getFullYear();
    const activeBonds = portfolio.filter(b => new Date(b.maturity).getFullYear() > today);

    // Normalize percentages shown
    const totalPct = activeBonds.reduce((s, b) => s + (inj.pct[b.isin] ?? 0), 0);

    const bondRows = activeBonds.map(b => {
        const matYear = new Date(b.maturity).getFullYear();
        const label   = portfolio.filter(x=>x.issuer===b.issuer).length > 1
            ? `${b.issuer} <span style="font-family:monospace;font-size:10px;opacity:0.7">${b.isin}</span>`
            : b.issuer;
        const pct = inj.pct[b.isin] ?? (100 / activeBonds.length);
        return `<tr>
            <td style="padding:5px 8px;">${label} <span style="font-size:9px;color:#888">(${matYear})</span></td>
            <td style="padding:5px 8px;text-align:center;">
                <input type="number" value="${pct.toFixed(1)}" min="0" max="100" step="1"
                    onchange="updateInjectionPct('${b.isin}',parseFloat(this.value)||0)"
                    style="${inpSt}width:65px;text-align:right;" ${enabled?'':'disabled'}>
                <span style="font-size:10px;color:#888;">%</span>
            </td>
        </tr>`;
    }).join('');

    el.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;cursor:pointer;">
                <input type="checkbox" ${enabled?'checked':''} onchange="toggleInjection(this.checked)">
                Enable annual injection
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;">
                <span style="color:#888;">${sym} per year</span>
                <input type="number" value="${_cgToBase(inj.amountEur)}" min="0" step="100"
                    onchange="updateInjectionAmount(_cgFromBase(parseFloat(this.value)||0))"
                    style="${inpSt}width:100px;max-width:100%;text-align:right;" ${enabled?'':'disabled'}>
            </label>
        </div>
        <p style="font-size:11px;color:#888;margin:0 0 8px;">
            Each year, the injection amount is split across active (non-matured) bonds per the % below.
            When a bond matures, its % is redistributed proportionally to the remaining bonds.
        </p>
        ${activeBonds.length ? `
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
            <thead><tr style="color:#888;">
                <th style="text-align:left;padding:4px 8px;">Bond</th>
                <th style="padding:4px 8px;text-align:center;">Allocation %</th>
            </tr></thead>
            <tbody>${bondRows}</tbody>
        </table>
        <p style="font-size:10px;color:#888;margin-top:6px;text-align:right;">
            Total: <strong style="color:${Math.abs(totalPct-100)<0.5?'#70c172':'#ff7043'}">${totalPct.toFixed(1)}%</strong>
            ${Math.abs(totalPct-100)>0.5?'<span style="color:#ff7043;"> — should sum to 100%</span>':''}
        </p>` : '<p style="color:#888;font-size:11px;">No active bonds.</p>'}`;
}

// ── Coupon scenario handlers ─────────────────────────────────────────────────
function enableCouponScenario() {
    const id  = 'cr_single';
    const wSAY = _lastSimResult?.weightedSAY || 3;
    if (_customScenarios.find(s=>s.id===id)) return;
    _customScenarios.push({
        id, _type: 'coupon_reinvest',
        name: 'Coupon reinvestment',
        globalPriceShift: 0,
    });
    _perIsinOverrides[id] = new Map();
    _hiddenScenarioIds.delete(id);
    buildPerIsinPanel(_lastPortfolio, _lastSimResult || {weightedSAY: wSAY});
    triggerSimulation();
}

function disableCouponScenario() {
    _customScenarios = _customScenarios.filter(s => s._type !== 'coupon_reinvest');
    delete _perIsinOverrides['cr_single'];
    buildPerIsinPanel(_lastPortfolio, _lastSimResult || {weightedSAY:3});
    triggerSimulation();
}

function updateCouponScenarioName(name) {
    const cs = _customScenarios.find(s=>s._type==='coupon_reinvest');
    if (cs) { cs.name = name; triggerSimulation(); }
}

function updateCouponGlobal(val) {
    const cs = _customScenarios.find(s=>s._type==='coupon_reinvest');
    if (cs) { cs.globalPriceShift = val; triggerSimulation(); }
}

// ── Replacement handlers ──────────────────────────────────────────────────────
function enableReplacement(isin) {
    const b = _lastPortfolio.find(b=>b.isin===isin);
    if (!b) return;
    const matYear = new Date(b.maturity).getFullYear();
    const id = 'mr_' + isin;
    if (_customScenarios.find(s=>s.id===id)) return;
    const label = b.issuer + ' (' + matYear + ')';
    const wSAY = _lastSimResult?.weightedSAY || 3;
    _customScenarios.push({
        id, _type: 'maturity_replacement',
        name: label + ' → new bond',
        sourceBond: { isin: b.isin, matYear },
        netCouponPct:    Math.round(wSAY * 100) / 100,
        priceShift:      0,
        maturityYear:    matYear + 10,
        reinvestCoupons: false,
    });
    // Ensure new scenario is not accidentally hidden from a previous removal
    _hiddenScenarioIds.delete(id);
    buildPerIsinPanel(_lastPortfolio, _lastSimResult||{weightedSAY:3});
    triggerSimulation();
}

function disableReplacement(isin) {
    const id = 'mr_' + isin;
    _customScenarios = _customScenarios.filter(s=>s.id!==id);
    buildPerIsinPanel(_lastPortfolio, _lastSimResult||{weightedSAY:3});
    triggerSimulation();
}

function removeCustomScenario(id) {
    _customScenarios = _customScenarios.filter(s => s.id !== id);
    delete _perIsinOverrides[id];
    buildPerIsinPanel(_lastPortfolio, _lastSimResult||{weightedSAY:3});
    triggerSimulation();
}

// ── Maturity replacement handler ─────────────────────────────────────────────
function updateMatRepl(si, field, value) {
    if (!_customScenarios[si]) return;
    _customScenarios[si][field] = value;
    // Re-render tab to reflect changes (e.g. dropdown labels)
    const isDark  = document.body.classList.contains('dark');
    const border  = isDark ? '#2a2d45' : '#dde3ee';
    renderReplacementTab(_lastPortfolio, isDark, border);
    triggerSimulation();
}

// ── Injection config ──────────────────────────────────────────────────────────
let _injectionConfig = { enabled: false, amountEur: 1000, pct: {} };

function toggleInjection(enabled) {
    _injectionConfig.enabled = enabled;
    renderInjectionTab(_lastPortfolio, document.body.classList.contains('dark'),
        document.body.classList.contains('dark') ? '#2a2d45' : '#dde3ee');
    triggerSimulation();
}

function updateInjectionAmount(amountEur) {
    _injectionConfig.amountEur = amountEur;
    triggerSimulation();
}

function updateInjectionPct(isin, pct) {
    _injectionConfig.pct[isin] = pct;
    renderInjectionTab(_lastPortfolio, document.body.classList.contains('dark'),
        document.body.classList.contains('dark') ? '#2a2d45' : '#dde3ee');
    triggerSimulation();
}

// ── Legacy render helpers (kept for compatibility) ────────────────────────────
function renderCustomScenarios(portfolio, wSAY) {
    // No-op: now handled by individual tab renderers
}

// ── Bond selector ─────────────────────────────────────────────────────────────
let _selectedIsins = new Set();

function buildBondSelector(portfolio) {
    const el = document.getElementById('bondSelector');
    if (!el) return;

    // Preserve existing selections: only initialise _selectedIsins for NEW bonds
    const currentIsins = new Set(portfolio.map(b => b.isin));
    currentIsins.forEach(isin => { if (!_selectedIsins.has(isin)) _selectedIsins.add(isin); });
    _selectedIsins.forEach(isin => {
        // Keep replacement IDs (prefixed _repl_) alive; only prune real ISINs
        if (!isin.startsWith('_repl_') && !currentIsins.has(isin)) _selectedIsins.delete(isin);
    });

    // Show ISIN in label if multiple bonds from same issuer
    const issuerCount = {};
    portfolio.forEach(b => { issuerCount[b.issuer] = (issuerCount[b.issuer] || 0) + 1; });

    const isDark = document.body.classList.contains('dark');
    const COLORS = isDark ? BOND_COLORS_DARK : BOND_COLORS_LIGHT;

    // Real bond checkboxes
    const bondHtml = portfolio.map((b, i) => {
        const c = COLORS[i % COLORS.length];
        const lbl = issuerCount[b.issuer] > 1
            ? `${b.issuer} <span style="font-family:monospace;font-size:10px;opacity:0.7">${b.isin}</span> (${(b.maturity||'').slice(0,4)})`
            : `${b.issuer} (${(b.maturity||'').slice(0,4)})`;
        return `<label style="display:inline-flex;align-items:center;gap:5px;margin:4px 8px 4px 0;cursor:pointer;font-size:12px;font-weight:600;">
            <input type="checkbox" ${_selectedIsins.has(b.isin)?'checked':''} value="${b.isin}" onchange="toggleBondSel('${b.isin}',this.checked)">
            <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${c};flex-shrink:0;"></span>
            ${lbl}
        </label>`;
    }).join('');

    // Fix D: replacement scenario checkboxes
    const replScenarios = (_customScenarios||[]).filter(cs => cs._type === 'maturity_replacement');
    const replHtml = replScenarios.map((cs, i) => {
        const ci   = portfolio.length + i;
        const c    = COLORS[ci % COLORS.length];
        const selId = '_repl_' + cs.id;
        // Default: show replacement if not already tracked
        if (!_selectedIsins.has(selId)) _selectedIsins.add(selId);
        return `<label style="display:inline-flex;align-items:center;gap:5px;margin:4px 8px 4px 0;cursor:pointer;font-size:12px;font-weight:600;">
            <input type="checkbox" ${_selectedIsins.has(selId)?'checked':''} value="${selId}" onchange="toggleBondSel('${selId}',this.checked)">
            <span style="display:inline-block;width:10px;height:10px;border-radius:2px;border:2px dashed ${c};flex-shrink:0;"></span>
            <span style="font-style:italic;">${cs.name}</span>
        </label>`;
    }).join('');

    el.innerHTML = bondHtml + replHtml;
}

function toggleBondSel(isin, checked) {
    if (checked) _selectedIsins.add(isin); else _selectedIsins.delete(isin);
    if (_lastSimResult) renderBondYearChart(_lastPortfolio, _lastSimResult.years, _selectedIsins);
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
let _currentView = 'year';

function switchView(view) {
    _currentView = view;
    ['year','bond'].forEach(v => {
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

    // Cleanup: destroy charts explicitly before re-rendering to free GPU/canvas memory
    if (_chart)     { _chart.destroy();     _chart     = null; }
    if (_chartBond) { _chartBond.destroy(); _chartBond = null; }
    // Clear benchmark cache so horizon changes don't show stale data
    Object.keys(_benchmarkCache).forEach(k => delete _benchmarkCache[k]);

    // G: pre-fetch FX multipliers for all non-EUR bonds (parallel, cached)
    const reportCcy = localStorage.getItem('bondReportCurrency') || 'EUR';
    await _prefetchFxForPortfolio(portfolio, reportCcy);

    const costEur  = portfolio.reduce((s, b) => s + (b.totalEur || (b.priceEur||0)*b.quantity), 0);
    const input    = document.getElementById('cgCapital');
    if (input && !input._userEdited) input.value = Math.round(_cgToBase(costEur));
    const baseVal      = parseFloat(input?.value);
    const startCapital = (baseVal > 0) ? _cgFromBase(baseVal) : costEur;

    document.querySelectorAll('.cg-ccy-sym').forEach(el => el.textContent = _cgSym());

    // Build per-ISIN override configs for coupon_reinvest scenarios
    const perIsinConfigs = new Map();
    for (const cs of _customScenarios) {
        if (cs._type === 'coupon_reinvest' && _perIsinOverrides[cs.id]?.size > 0) {
            perIsinConfigs.set(cs.id, _perIsinOverrides[cs.id]);
        }
    }

    const simResult    = simulate(portfolio, startCapital, _customScenarios, perIsinConfigs, _injectionConfig);
    _lastSimResult     = simResult;
    _lastStartCapital  = startCapital;
    _lastPortfolio     = portfolio;

    renderSummaryStats(portfolio, simResult, startCapital);
    renderGrowthChart(simResult, startCapital);
    buildPerIsinPanel(portfolio, simResult);
    // By Bond view suppressed (A)

    // Re-apply any active benchmark overlays (checkboxes survive DOM rebuild)
    document.querySelectorAll('input[id^="bench-chk-"]').forEach(chk => {
        if (chk.checked) chk.dispatchEvent(new Event('change'));
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    await _cgLoadFxRates();
    document.getElementById('cgCapital')?.addEventListener('input', function() { this._userEdited = true; triggerSimulation(); });
    // By Bond view suppressed
    document.getElementById('btnBondStacked')?.addEventListener('click', () => setBondChartMode('stacked'));
    document.getElementById('btnBondLine')?.addEventListener('click', () => setBondChartMode('line'));
    await runSimulation();
    switchView('year');
});
