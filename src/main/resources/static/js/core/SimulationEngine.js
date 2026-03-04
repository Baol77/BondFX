'use strict';
/**
 * SimulationEngine — pure simulation logic.
 *
 * No DOM, no fetch, no localStorage.
 * All inputs arrive as plain JS objects/Maps.
 * Exports are stable — the .mjs headless runner imports:
 *   buildSlots, _scenarioToSimArgs, _buildInjectionByYear,
 *   _runScenarioSim, fxCurveCache  (from FxCurveStore)
 *
 * BUG C FIX (2026-03-04):
 *   Annual injection block moved to end-of-year (after dataPoints.push) in both
 *   runScenario() and runMaturityReplacement(). Injected units bought in year T
 *   are now first visible in year T+1 bondsVal, matching the intended semantics
 *   documented in BugCInjectionTotalPctTest ("injection starts 2026 but is first
 *   reflected in bondsVal at 2028").
 */

import { fxCurveGet, fxCurveCache } from './FxCurveStore.js';
import { computeCache, computeSAYNet, weightedSAY } from './ComputeCache.js';

export { fxCurveCache };

// ── Slot value ────────────────────────────────────────────────────────────────

export function slotValue(sl, yr, startYear, reportCcy) {
    if (sl.synthetic && sl._type !== 'same_bond') {
        return sl.unitsHeld * (sl.facePerUnit + sl.accruedPerUnit);
    }
    let fxFactor = 1.0;
    if (sl.currency && sl.currency !== (reportCcy || 'EUR') && !sl._isReplacement && yr != null) {
        fxFactor = fxCurveGet(sl.currency, reportCcy || 'EUR', yr, startYear);
    }
    return sl.unitsHeld * sl.pricePerUnit * fxFactor;
}

// ── Build slots from portfolio ────────────────────────────────────────────────

export function buildSlots(portfolio) {
    return portfolio.map(b => {
        const cached   = computeCache.get(b.isin);
        const spotRate = cached?.fxBuy
            ?? ((b.currency !== 'EUR' && b.price > 0) ? b.priceEur / b.price : 1.0);
        const nomEur   = 100 * spotRate;
        const pxEur    = (b.priceEur > 0) ? b.priceEur : nomEur;
        return {
            isin:           b.isin,
            issuer:         b.issuer,
            currency:       b.currency || 'EUR',
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

// ── Helper: global price-shift per-isin config ────────────────────────────────

export function buildGlobalPriceShiftConfig(portfolio, priceShift, wSAY) {
    if (!priceShift) return null;
    const m = new Map();
    portfolio.forEach(b => {
        m.set(b.isin, { mode: 'same_bond', priceShift, reinvestYield: wSAY });
    });
    return m;
}

// ── Core scenario runner ──────────────────────────────────────────────────────

export function runScenario(slots, years, globalMode, globalPriceShift, globalReinvestYield, perIsinConfig, injectionByYear, fxOpts = {}) {
    let pool       = slots.map(s => ({ ...s }));
    let cash       = 0;
    const endYear  = years[years.length - 1];
    const startYear  = fxOpts.startYear ?? years[0];
    const reportCcy  = fxOpts.reportCcy ?? 'EUR';

    const dataPoints = [pool.reduce((s, sl) => s + slotValue(sl, startYear, startYear, reportCcy), 0) + cash];
    const yearEvents = [];

    for (let i = 1; i < years.length; i++) {
        const yr           = years[i];
        const portfolioVal = () => pool.reduce((s, sl) => s + slotValue(sl, yr, startYear, reportCcy), 0) + cash;
        let yearCoupons = 0, yearRedemptions = 0, reinvested = 0;
        const alive    = [];
        const perSlot  = [];

        for (const sl of pool) {
            if (sl.matYear < yr) continue;

            const fxC        = sl.currency ? fxCurveGet(sl.currency, reportCcy, yr, startYear)         : 1.0;
            const fxM        = sl.currency ? fxCurveGet(sl.currency, reportCcy, sl.matYear, startYear) : 1.0;
            const couponCash = sl.unitsHeld * sl.couponPerUnit * fxC;
            yearCoupons     += couponCash;

            if (!sl.isin?.startsWith('_')) {
                const slRedemp = (sl.matYear === yr) ? sl.unitsHeld * sl.facePerUnit * fxM : 0;
                perSlot.push({ isin: sl.isin, issuer: sl.issuer || '',
                    coupon: couponCash, redemption: slRedemp,
                    portVal: slotValue(sl, yr, startYear, reportCcy), reinvested: 0 });
            }

            if (sl.synthetic) {
                if (sl._type !== 'same_bond') sl.accruedPerUnit += sl.couponPerUnit;
                if (sl._isReplacement && sl._takeCouponAsCash) {
                    cash        += couponCash;
                    yearCoupons -= couponCash;
                }
            }

            if (sl.matYear === yr) {
                const fxMat = sl.currency ? fxCurveGet(sl.currency, reportCcy, yr, startYear) : 1.0;
                yearRedemptions += sl.synthetic
                    ? sl.unitsHeld * (sl.facePerUnit + sl.accruedPerUnit) * fxMat
                    : sl.unitsHeld * sl.facePerUnit * fxMat;
            } else {
                alive.push(sl);
            }
        }

        pool = alive;

        const cashIn       = yearCoupons + yearRedemptions;
        const maturedSlots = slots.filter(sl => sl.matYear === yr);
        const refPool      = pool.length > 0 ? pool : maturedSlots;
        const totalFace    = refPool.reduce((s, sl) => s + sl.unitsHeld * sl.facePerUnit, 0);

        if (cashIn > 0 && totalFace > 0) {
            let marketAvgTotal = 0, marketAvgCostPerUnit = 0, marketAvgYield = 0, marketAvgCount = 0;

            for (const sl of refPool) {
                if (sl._isReplacement) continue;
                const cfg     = perIsinConfig?.get(sl.isin);
                const mode    = cfg?.mode          ?? globalMode;
                const pShift  = cfg?.priceShift    ?? globalPriceShift;
                const rYield  = (cfg?.reinvestYield ?? globalReinvestYield) / 100;
                const adjFact = 1 + pShift / 100;
                const share   = (sl.unitsHeld * sl.facePerUnit) / totalFace;
                const myShare = cashIn * share;

                if (mode === 'none') {
                    cash += myShare;
                } else if (mode === 'same_bond') {
                    const cost = sl.pricePerUnit * adjFact;
                    if (cost > 0) {
                        const liveSlot = pool.find(p => p.isin === sl.isin);
                        if (liveSlot) {
                            liveSlot.unitsHeld += myShare / cost;
                        } else {
                            pool.push({
                                isin: sl.isin + '_reinv_' + yr, issuer: sl.issuer,
                                matYear: endYear + 30, unitsHeld: myShare / cost,
                                facePerUnit: sl.facePerUnit, couponPerUnit: sl.couponPerUnit,
                                pricePerUnit: cost, accruedPerUnit: 0,
                                synthetic: true, _type: 'same_bond',
                            });
                        }
                        reinvested += myShare;
                    } else { cash += myShare; }
                } else {
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

            if (marketAvgTotal > 0 && marketAvgCount > 0) {
                const avgCost  = marketAvgCostPerUnit / marketAvgCount;
                const avgYield = marketAvgYield / marketAvgCount;
                pool.push({
                    isin: '_mkt_' + yr, issuer: 'Reinvested', matYear: endYear,
                    unitsHeld: marketAvgTotal / Math.max(0.01, avgCost),
                    facePerUnit: avgCost, couponPerUnit: avgYield, pricePerUnit: avgCost,
                    accruedPerUnit: 0, synthetic: true,
                });
            }
        } else if (cashIn > 0) {
            cash += cashIn;
        }

        const cashInTot = yearCoupons + yearRedemptions;
        perSlot.forEach(s => {
            s.reinvested = (reinvested > 0 && cashInTot > 0)
                ? reinvested * (s.coupon + s.redemption) / cashInTot : 0;
        });

        const bondsVal = pool.reduce((s, sl) => s + slotValue(sl, yr, startYear, reportCcy), 0);
        yearEvents.push({ yr, coupons: yearCoupons, redemptions: yearRedemptions,
            cashIn, reinvested, cash, bondsVal, perSlot });
        dataPoints.push(portfolioVal());

        // ── BUG C FIX: injection applied AFTER snapshot ───────────────────────
        // Moved from before yearEvents.push() to here so injected units are first
        // visible in next year's bondsVal, not the current year's.
        if (injectionByYear) {
            const injThisYear = injectionByYear.get(yr);
            if (injThisYear) {
                for (const [isin, injEur] of injThisYear.entries()) {
                    const liveSlot = pool.find(s => s.isin === isin);
                    if (liveSlot && liveSlot.pricePerUnit > 0)
                        liveSlot.unitsHeld += injEur / liveSlot.pricePerUnit;
                }
            }
        }
    }
    return { dataPoints, yearEvents };
}

// ── Maturity replacement runner ───────────────────────────────────────────────

export function runMaturityReplacement(slots, years, matReplacementOrArray, injectionByYear, fxOpts = {}) {
    const replacements = Array.isArray(matReplacementOrArray) ? matReplacementOrArray : [matReplacementOrArray];
    const primary = replacements[0];
    const { sourceBond, netCouponPct, maturityYear, reinvestCoupons, priceShift } = primary;
    const startYear  = fxOpts.startYear ?? years[0];
    const reportCcy  = fxOpts.reportCcy ?? 'EUR';

    let pool = slots.map(s => ({ ...s }));
    let cash = 0;
    const simEndYear   = years[years.length - 1];
    const maxRepMatYear = Math.max(...replacements.map(r => r.maturityYear || 0));
    const allYears = [...years];
    for (let y = simEndYear + 1; y <= maxRepMatYear; y++) allYears.push(y);

    const dataPoints = [pool.reduce((s, sl) => s + slotValue(sl, startYear, startYear, reportCcy), 0) + cash];
    const yearEvents = [];

    for (let i = 1; i < allYears.length; i++) {
        const yr           = allYears[i];
        const portfolioVal = () => pool.reduce((s, sl) => s + slotValue(sl, yr, startYear, reportCcy), 0) + cash;
        let yearCoupons = 0, yearRedemptions = 0, reinvested = 0, replCoupons = 0;
        let replacementActivated = false;
        const alive   = [];
        const perSlot = [];

        for (const sl of pool) {
            if (sl.matYear < yr) continue;

            const fxC2       = sl.currency ? fxCurveGet(sl.currency, reportCcy, yr, startYear)         : 1.0;
            const fxM2       = sl.currency ? fxCurveGet(sl.currency, reportCcy, sl.matYear, startYear) : 1.0;
            const couponCash = sl.unitsHeld * sl.couponPerUnit * (sl._isReplacement ? 1.0 : fxC2);

            if (!sl.isin?.startsWith('_') || sl._isReplacement) {
                const slRedemp2     = (sl.matYear === yr) ? sl.unitsHeld * sl.facePerUnit * (sl._isReplacement ? 1.0 : fxM2) : 0;
                const displayIsin   = sl._isReplacement ? ((sl._srcIsin ?? sourceBond.isin) + '_repl') : sl.isin;
                const displayIssuer = sl._isReplacement ? (sl.issuer + ' → repl.') : (sl.issuer || '');
                perSlot.push({ isin: displayIsin, issuer: displayIssuer,
                    coupon: sl._isReplacement ? 0 : couponCash,
                    replCoupon: sl._isReplacement ? couponCash : 0,
                    redemption: slRedemp2, portVal: slotValue(sl, yr, startYear, reportCcy), reinvested: 0,
                    _isReplacement: !!sl._isReplacement, matYear: sl._isReplacement ? sl.matYear : undefined });
            }

            if (sl._isReplacement) {
                if (sl._takeCouponAsCash) { cash += couponCash; }
                else                      { sl.unitsHeld += couponCash / sl.pricePerUnit; }
                replCoupons += couponCash;
            } else {
                yearCoupons += couponCash;
                if (sl.synthetic && sl._type !== 'same_bond') sl.accruedPerUnit += sl.couponPerUnit;
            }

            if (sl.matYear === yr) {
                yearRedemptions += sl.synthetic
                    ? sl.unitsHeld * (sl.facePerUnit + sl.accruedPerUnit)
                    : sl.unitsHeld * sl.facePerUnit;
                if (replacements.some(r => r.sourceBond?.isin === sl.isin)) replacementActivated = true;
            } else {
                alive.push(sl);
            }
        }
        pool = alive;

        const cashIn         = yearCoupons + yearRedemptions;
        const maturedOrigSlots = slots.filter(sl => sl.matYear === yr);
        const refPool        = pool.length > 0 ? pool : maturedOrigSlots;
        const totalFace      = refPool.reduce((s, sl) => sl._isReplacement ? s : s + sl.unitsHeld * sl.facePerUnit, 0);
        let totalSrcCash     = 0;

        // ── Phase A: create replacement slots ────────────────────────────────
        if (cashIn > 0) {
            for (const rep of replacements) {
                const repSrcSlot = pool.find(s => s.isin === rep.sourceBond?.isin)
                    ?? maturedOrigSlots.find(s => s.isin === rep.sourceBond?.isin);
                if (!repSrcSlot || repSrcSlot.matYear !== yr) continue;
                const repFxM      = repSrcSlot.currency ? fxCurveGet(repSrcSlot.currency, reportCcy, yr, startYear) : 1.0;
                const repFxC      = repSrcSlot.currency ? fxCurveGet(repSrcSlot.currency, reportCcy, yr, startYear) : 1.0;
                const repRedemption = repSrcSlot.unitsHeld * repSrcSlot.facePerUnit * repFxM;
                const repCoupon     = repSrcSlot.unitsHeld * repSrcSlot.couponPerUnit * repFxC;
                const repSrcCash    = repRedemption + repCoupon;
                const repAdjFact    = Math.max(0.01, 1 + (rep.priceShift || 0) / 100);

                if (rep.maturityYear > yr && repSrcCash > 0) {
                    pool.push({
                        isin:              rep.sourceBond.isin + '_repl_' + yr,
                        _srcIsin:          rep.sourceBond.isin,
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
                    });
                    reinvested   += repSrcCash;
                    totalSrcCash += repSrcCash;
                } else if (repSrcCash > 0) {
                    cash         += repSrcCash;
                    totalSrcCash += repSrcCash;
                }
            }
        }

        // ── Phase B: distribute remaining cash to surviving bonds ────────────
        const otherCash = cashIn - totalSrcCash;
        if (otherCash > 0 && totalFace > 0) {
            for (const sl of refPool) {
                if (sl._isReplacement) continue;
                const share   = (sl.unitsHeld * sl.facePerUnit) / totalFace;
                const myShare = otherCash * share;
                const cost    = sl.pricePerUnit;
                if (cost > 0) {
                    const liveSlot = pool.find(p => p.isin === sl.isin);
                    if (liveSlot) {
                        liveSlot.unitsHeld += myShare / cost;
                    } else {
                        pool.push({
                            isin: sl.isin + '_cont_' + yr, issuer: sl.issuer,
                            matYear: simEndYear + 30, unitsHeld: myShare / cost,
                            facePerUnit: sl.facePerUnit, couponPerUnit: sl.couponPerUnit,
                            pricePerUnit: cost, accruedPerUnit: 0,
                            synthetic: true, _type: 'same_bond',
                        });
                    }
                    reinvested += myShare;
                } else { cash += myShare; }
            }
        } else if (otherCash > 0) {
            cash += otherCash;
        }

        const cashInTotR = yearCoupons + yearRedemptions;
        perSlot.forEach(s => {
            s.reinvested = (reinvested > 0 && cashInTotR > 0)
                ? reinvested * (s.coupon + s.redemption) / cashInTotR : 0;
        });

        const bondsValR = pool.reduce((s, sl) => s + slotValue(sl, yr, startYear, reportCcy), 0);
        yearEvents.push({
            yr, coupons: yearCoupons + replCoupons, redemptions: yearRedemptions,
            cashIn, reinvested: replacementActivated ? 0 : reinvested,
            switched: replacementActivated ? reinvested : 0,
            replCoupons, cash, bondsVal: bondsValR, replacementActivated,
            replacementBond: replacementActivated ? { netCouponPct, maturityYear, reinvestCoupons } : null,
            perSlot,
        });
        dataPoints.push(portfolioVal());

        // ── BUG C FIX: injection applied AFTER snapshot ───────────────────────
        // Moved from before yearEvents.push() to here so injected units are first
        // visible in next year's bondsVal, not the current year's.
        if (injectionByYear) {
            const injThisYear = injectionByYear.get(yr);
            if (injThisYear) {
                for (const [isin, injEur] of injThisYear.entries()) {
                    const liveSlot = pool.find(s => s.isin === isin);
                    if (liveSlot && liveSlot.pricePerUnit > 0)
                        liveSlot.unitsHeld += injEur / liveSlot.pricePerUnit;
                }
            }
        }
    }
    return { dataPoints, yearEvents, extendedYears: allYears };
}

// ── Scenario → sim args converter ────────────────────────────────────────────

export function _scenarioToSimArgs(sc, portfolio) {
    const customScenarios = [];
    const perIsinConfigs  = new Map();

    if (sc.couponReinvest.enabled) {
        const csId  = sc.id + '_cr';
        const csObj = { id: csId, _type: 'coupon_reinvest', name: sc.label,
                        globalPriceShift: sc.couponReinvest.globalPriceShift };
        customScenarios.push(csObj);
        if (sc.couponReinvest.perIsin.size > 0) perIsinConfigs.set(csId, sc.couponReinvest.perIsin);
    }

    sc.maturityReplacement.forEach((cfg, isin) => {
        if (!cfg.enabled) return;
        const b = portfolio.find(x => x.isin === isin);
        if (!b) return;
        const matYear = new Date(b.maturity).getFullYear();
        customScenarios.push({
            id: sc.id + '_mr_' + isin, _type: 'maturity_replacement', name: sc.label,
            sourceBond: { isin, matYear }, netCouponPct: cfg.netCouponPct,
            priceShift: cfg.priceShift, maturityYear: cfg.maturityYear, reinvestCoupons: cfg.reinvestCoupons,
        });
    });

    const injCfg = sc.injection;
    const injectionConfig = injCfg.enabled
        ? { enabled: true, amountEur: injCfg.amountEur, from: injCfg.from, to: injCfg.to, pct: injCfg.pct }
        : { enabled: false, amountEur: 0, from: 0, to: 0, pct: {} };

    return { customScenarios, perIsinConfigs, injectionConfig };
}

// ── Injection helper ──────────────────────────────────────────────────────────

export function _buildInjectionByYear(portfolio, injectionConfig, years) {
    if (!injectionConfig.enabled || injectionConfig.amountEur <= 0) return null;
    const injectionByYear = new Map();
    const { from, to, amountEur, pct } = injectionConfig;
    for (let yi = 1; yi < years.length; yi++) {
        const yr = years[yi];
        if (yr < from || yr > to) continue;
        const active = portfolio.filter(b => new Date(b.maturity).getFullYear() >= yr);
        if (!active.length) continue;
        const rawPcts  = active
            .filter(b => (pct[b.isin] ?? 0) > 0)
            .map(b => ({ isin: b.isin, pct: pct[b.isin] }));
        if (!rawPcts.length) continue;
        const yearMap = new Map();
        rawPcts.forEach(x => {
            const amt = amountEur * (x.pct / 100);
            if (amt > 0) yearMap.set(x.isin, amt);
        });
        injectionByYear.set(yr, yearMap);
    }
    return injectionByYear;
}

// ── Single-scenario runner ────────────────────────────────────────────────────

export function _runScenarioSim(sc, portfolio, startCapital, reportCcy = 'EUR') {
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
    const wSAY    = weightedSAY(portfolio);

    const { customScenarios, perIsinConfigs, injectionConfig } = _scenarioToSimArgs(sc, portfolio);
    const injectionByYear = _buildInjectionByYear(portfolio, injectionConfig, years);
    const fxOpts = { startYear: years[0], reportCcy };

    const { dataPoints: noRDP, yearEvents: noREV } =
        runScenario(slots, years, 'none', 0, wSAY, null, injectionByYear, fxOpts);

    const hasCoupon  = customScenarios.some(cs => cs._type === 'coupon_reinvest');
    const hasReplace = customScenarios.some(cs => cs._type === 'maturity_replacement');

    let mainData, mainEvents, extYears;

    if (!hasCoupon && !hasReplace) {
        mainData   = noRDP;
        mainEvents = noREV;
        extYears   = null;
    } else if (hasCoupon && !hasReplace) {
        const csObj   = customScenarios.find(cs => cs._type === 'coupon_reinvest');
        const perIsin = perIsinConfigs.get(csObj.id) || buildGlobalPriceShiftConfig(portfolio, csObj.globalPriceShift, wSAY);
        const { dataPoints, yearEvents } =
            runScenario(slots, years, 'same_bond', csObj.globalPriceShift, wSAY, perIsin, injectionByYear, fxOpts);
        mainData   = dataPoints;
        mainEvents = yearEvents;
        extYears   = null;
    } else if (hasReplace && !hasCoupon) {
        const repCs = customScenarios.filter(cs => cs._type === 'maturity_replacement');
        const { dataPoints, yearEvents, extendedYears } =
            runMaturityReplacement(slots, years, repCs, injectionByYear, fxOpts);
        const noReinvByYear = new Map();
        noRDP.forEach((v, i) => noReinvByYear.set(years[i], v));
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
        const repCs = customScenarios.filter(cs => cs._type === 'maturity_replacement');
        const { dataPoints, yearEvents, extendedYears } =
            runMaturityReplacement(slots, years, repCs, injectionByYear, fxOpts);
        const maxRepMat = Math.max(...repCs.map(r => r.maturityYear || 0));
        const allYears  = [...years];
        for (let y = endYear + 1; y <= maxRepMat; y++) allYears.push(y);
        mainData = allYears.map((yr, idx) =>
            (idx < dataPoints.length && isFinite(dataPoints[idx])) ? dataPoints[idx] : null
        );
        mainEvents = yearEvents;
        extYears   = allYears;
    }

    return {
        id: sc.id, label: sc.label, color: sc.color,
        data:   sc2arr(mainData),
        yearEvents: mainEvents, scale,
        _custom: true, _extendedYears: extYears,
        _type:  hasReplace ? 'maturity_replacement' : hasCoupon ? 'coupon_reinvest' : 'no_reinvest',
        _sourceBond: hasReplace ? customScenarios.find(cs => cs._type === 'maturity_replacement')?.sourceBond : null,
        _hasCouponReinvest: hasCoupon,
        _wSAY: wSAY, _years: extYears || years,
    };
}

// ── Master simulate ───────────────────────────────────────────────────────────

export function simulateAll(portfolio, startCapital, scenarios, nrBenchmark, reportCcy = 'EUR') {
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
    const wSAY    = weightedSAY(portfolio);

    const { dataPoints: nrDP, yearEvents: nrEV } =
        runScenario(slots, years, 'none', 0, wSAY, null, null,
            { startYear: years[0], reportCcy });
    if (nrBenchmark) {
        nrBenchmark.data       = sc2arr(nrDP);
        nrBenchmark.yearEvents = nrEV;
        nrBenchmark.years      = years;
        nrBenchmark.scale      = scale;
    }

    const resultScenarios = [];
    for (const sc of scenarios) {
        const r = _runScenarioSim(sc, portfolio, startCapital, reportCcy);
        if (r) resultScenarios.push(r);
    }

    return { years, scenarios: resultScenarios, weightedSAY: wSAY, scale };
}

// ── Bond timeline builder ─────────────────────────────────────────────────────

export function buildBondTimeline(portfolio, years, getAllMatReplacementCs, cgToBase) {
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
            if (i === 0) return cgToBase(costEur);
            if (yr > matYear) return 0;
            const yrsElapsed   = yr - curYear;
            const couponsAccum = annNet * Math.max(0, Math.min(yrsElapsed, matYear - curYear));
            const capGain      = (yr === matYear) ? Math.max(0, faceEur - costEur) : 0;
            return cgToBase(costEur + couponsAccum + capGain);
        });

        const bondLabel = issuerCount[b.issuer] > 1
            ? `${b.issuer} ${b.isin} (${(b.maturity||'').slice(0,4)})`
            : `${b.issuer} (${(b.maturity||'').slice(0,4)})`;

        return { isin: b.isin, label: bondLabel, data };
    });

    (getAllMatReplacementCs?.() || [])
        .filter(cs => cs._type === 'maturity_replacement')
        .forEach(cs => {
            const src = portfolio.find(b => b.isin === cs.sourceBond?.isin);
            if (!src) return;
            const srcMatYear  = new Date(src.maturity).getFullYear();
            const replMatYear = cs.maturityYear;
            if (replMatYear <= srcMatYear) return;

            const srcSeries  = series.find(s => s.isin === src.isin);
            const srcMatIdx  = years.indexOf(srcMatYear);
            const startValue = srcSeries && srcMatIdx >= 0 ? srcSeries.data[srcMatIdx] : 0;

            const allYears = [...years];
            for (let y = Math.max(...years) + 1; y <= replMatYear; y++) allYears.push(y);

            const replAdjFact = Math.max(0.01, 1 + (cs.priceShift || 0) / 100);
            const replUnits   = startValue / replAdjFact;

            const replData = allYears.map((yr) => {
                if (yr < srcMatYear) return null;
                if (yr === srcMatYear) return startValue;
                if (yr > replMatYear) return null;
                const yrsHeld       = Math.min(yr - srcMatYear, replMatYear - srcMatYear);
                const couponPerUnit = cs.netCouponPct / 100;
                if (cs.reinvestCoupons) {
                    let u = replUnits;
                    for (let y = 0; y < yrsHeld; y++) u += (u * couponPerUnit) / replAdjFact;
                    return u * replAdjFact;
                } else {
                    return replUnits * replAdjFact + replUnits * couponPerUnit * yrsHeld;
                }
            });

            series.push({
                isin: '_repl_' + cs.id,
                label: `${cs.name}: ${src.issuer} → new bond (${replMatYear})`,
                data: replData, _isReplacement: true, _scenarioId: cs.id,
            });
        });

    return series;
}