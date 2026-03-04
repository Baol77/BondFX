'use strict';
/**
 * CurrencyHelper — currency symbol, conversion helpers for the UI.
 * Reads cgRates (populated by BondFXClient.loadFxRates) and localStorage.
 */

import { cgRates } from '../infrastructure/BondFXClient.js';

const CG_SYM = { EUR: '€', CHF: '₣', USD: '$', GBP: '£', JPY: '¥', CAD: 'C$', NOK: 'kr', SEK: 'kr', PLN: 'zł' };

export function cgBaseCcy()   { return localStorage.getItem('bondBaseCurrency') || 'EUR'; }
export function cgSym()       { return CG_SYM[cgBaseCcy()] || '€'; }
export function cgToBase(v)   { return v * (cgRates[cgBaseCcy()] || 1); }
export function cgFromBase(v) { return v / (cgRates[cgBaseCcy()] || 1); }
export function cgFmt(eur)    { return cgSym() + cgToBase(eur).toLocaleString(undefined, { maximumFractionDigits: 0 }); }
