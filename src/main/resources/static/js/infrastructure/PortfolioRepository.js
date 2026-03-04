'use strict';
/**
 * PortfolioRepository — reads the active portfolio from localStorage.
 */
export function loadPortfolio() {
    try {
        const raw = localStorage.getItem('bondPortfolios_v2');
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return (parsed?.portfolios?.[parsed?.activeId]?.bonds ?? [])
            .filter(b => b.includeInStatistics !== false);
    } catch(e) { return []; }
}
