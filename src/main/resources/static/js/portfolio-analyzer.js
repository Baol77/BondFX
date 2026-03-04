// Portfolio Analyzer - Client-Side Portfolio Management
// Fixed version: draggable modal, CSV import/export, corrected weighted calculations

/* ── Base Currency helpers (mirrors bond-report.js; work standalone on /analyzer) ── */
const _PA_SYMBOL = { EUR: '€', CHF: '₣', USD: '$', GBP: '£' };
let _paFxRates = { EUR: 1.0, CHF: 0.93, USD: 1.08, GBP: 0.86 };

async function _paLoadFxRates() {
    try {
        const res = await fetch('/api/fx-rates');
        if (res.ok) _paFxRates = await res.json();
    } catch(e) {}
}

function _paBaseCcy() {
    return localStorage.getItem('bondBaseCurrency') || 'EUR';
}

function _paSym(ccy) {
    return _PA_SYMBOL[ccy] || ccy;
}

/** EUR value → base currency value */
function _paToBase(eurVal) {
    const ccy = _paBaseCcy();
    return ccy === 'EUR' ? eurVal : eurVal * (_paFxRates[ccy] || 1.0);
}

/** Base currency → EUR (for CSV import conversion) */
function _paFromBase(baseVal) {
    const ccy = _paBaseCcy();
    return ccy === 'EUR' ? baseVal : baseVal / (_paFxRates[ccy] || 1.0);
}

/** Update all .pa-base-sym spans with current currency symbol */
function _paApplyBaseCurrencyUI() {
    const sym = _paSym(_paBaseCcy());
    document.querySelectorAll('.pa-base-sym').forEach(el => el.textContent = sym);
}

/** Format as base currency */
function _paFmt(eurVal, decimals = 0) {
    const sym = _paSym(_paBaseCcy());
    const val = _paToBase(eurVal);
    // Fix: avoid -0 display
    const rounded = decimals > 0 ? parseFloat(val.toFixed(decimals)) : Math.round(val);
    const display = rounded === 0 ? 0 : rounded;
    return sym + (decimals > 0 ? display.toFixed(decimals) : display.toLocaleString());
}
// Embedded in FreeMarker template via <#include "portfolio-analyzer.js" parse=false>
// No backend required - uses browser localStorage

class PortfolioAnalyzer {
    constructor() {
        this.portfolio = [];
        this.modal = null;
        this.currentBond = null;
        this.highlightedIndex = -1;
        this.currentMatches = [];
        // Multi-portfolio state
        this.portfolios = {};      // { id: { name, bonds[] } }
        this.activePortfolioId = null;
        this.init();
    }

    // ── Multi-Portfolio Storage Helpers ──────────────────────────────────────

    _loadAllPortfolios() {
        try {
            const raw = localStorage.getItem('bondPortfolios_v2');
            if (raw) {
                const data = JSON.parse(raw);
                this.portfolios = data.portfolios || {};
                this.activePortfolioId = data.activeId || null;
            }
        } catch(e) { this.portfolios = {}; this.activePortfolioId = null; }

        // Migration: if old single-portfolio data exists, import it
        if (Object.keys(this.portfolios).length === 0) {
            const oldData = localStorage.getItem('bondPortfolio');
            const id = this._genId();
            let bonds = [];
            if (oldData) {
                try { bonds = JSON.parse(oldData); } catch(e) {}
            }
            this.portfolios[id] = { name: 'Portfolio 1', bonds };
            this.activePortfolioId = id;
            this._saveAllPortfolios();
        }

        // Ensure activeId is valid
        if (!this.portfolios[this.activePortfolioId]) {
            this.activePortfolioId = Object.keys(this.portfolios)[0];
        }

        this.portfolio = this.portfolios[this.activePortfolioId]?.bonds || [];
    }

    _saveAllPortfolios() {
        // Keep active portfolio's bonds in sync
        if (this.activePortfolioId && this.portfolios[this.activePortfolioId]) {
            this.portfolios[this.activePortfolioId].bonds = this.portfolio;
        }
        localStorage.setItem('bondPortfolios_v2', JSON.stringify({
            portfolios: this.portfolios,
            activeId: this.activePortfolioId
        }));
    }

    _genId() {
        return 'pf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    }

    _switchPortfolio(id) {
        if (!this.portfolios[id]) return;
        // Save current before switching
        if (this.activePortfolioId && this.portfolios[this.activePortfolioId]) {
            this.portfolios[this.activePortfolioId].bonds = this.portfolio;
        }
        this.activePortfolioId = id;
        this.portfolio = this.portfolios[id].bonds;
        this._saveAllPortfolios();
        this._renderPortfolioSwitcher();
        this.updatePortfolioTable();
        this.updateStatistics();
        this.updateCalendars();
    }

    _addPortfolio() {
        const count = Object.keys(this.portfolios).length + 1;
        const name = prompt('Portfolio name:', `Portfolio ${count}`);
        if (!name) return;
        const id = this._genId();
        // Save current first
        if (this.activePortfolioId && this.portfolios[this.activePortfolioId]) {
            this.portfolios[this.activePortfolioId].bonds = this.portfolio;
        }
        this.portfolios[id] = { name: name.trim(), bonds: [] };
        this.activePortfolioId = id;
        this.portfolio = [];
        this._saveAllPortfolios();
        this._renderPortfolioSwitcher();
        this.updatePortfolioTable();
        this.updateStatistics();
        this.updateCalendars();
    }

    _removePortfolio() {
        const keys = Object.keys(this.portfolios);
        if (keys.length <= 1) {
            alert('Cannot remove the last portfolio.');
            return;
        }
        const name = this.portfolios[this.activePortfolioId]?.name || 'this portfolio';
        if (!confirm(`Remove "${name}"? This cannot be undone.`)) return;
        delete this.portfolios[this.activePortfolioId];
        this.activePortfolioId = Object.keys(this.portfolios)[0];
        this.portfolio = this.portfolios[this.activePortfolioId].bonds;
        this._saveAllPortfolios();
        this._renderPortfolioSwitcher();
        this.updatePortfolioTable();
        this.updateStatistics();
        this.updateCalendars();
    }

    _renamePortfolio() {
        const current = this.portfolios[this.activePortfolioId]?.name || '';
        const name = prompt('Rename portfolio:', current);
        if (!name || name.trim() === current) return;
        this.portfolios[this.activePortfolioId].name = name.trim();
        this._saveAllPortfolios();
        this._renderPortfolioSwitcher();
    }

    _renderPortfolioSwitcher() {
        const bar = document.getElementById('portfolioSwitcherBar');
        if (!bar) return;

        const isDark = document.body.classList.contains('dark');
        const ids = Object.keys(this.portfolios);
        const selectHtml = `
            <select id="portfolioSelect"
                onchange="window.portfolioAnalyzer._switchPortfolio(this.value)"
                style="padding:5px 10px;border-radius:6px;font-size:13px;font-weight:600;
                       border:1.5px solid ${isDark ? '#3a3f60' : '#c0cce0'};
                       background:${isDark ? '#1e2338' : '#f5f8ff'};
                       color:${isDark ? '#c8d0f0' : '#1a2a4a'};
                       cursor:pointer;min-width:160px;">
                ${ids.map(id => `<option value="${id}" ${id === this.activePortfolioId ? 'selected' : ''}>${this.portfolios[id].name}</option>`).join('')}
            </select>`;

        // base style (no hover — applied via onmouseenter/leave below)
        const btnBase = (color) =>
            `padding:5px 10px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;
             border:1.5px solid ${color};color:${color};
             background:${isDark ? '#1e2338' : '#fff'};
             transition:background 0.15s,color 0.15s,border-color 0.15s;`;

        // hover: fill with the accent colour, text white
        const hoverIn  = (color) => `this.style.background='${color}';this.style.color='#fff';this.style.borderColor='${color}';`;
        const hoverOut = (color, bgDefault) => `this.style.background='${bgDefault}';this.style.color='${color}';this.style.borderColor='${color}';`;

        const bgDef = isDark ? '#1e2338' : '#fff';

        // per-button accent colours
        const renameColor = isDark ? '#7aaeff' : '#1a73e8';
        const addColor    = isDark ? '#6ac870' : '#2e7d32';
        const removeColor = isDark ? '#e86060' : '#c62828';

        bar.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 0;margin-bottom:10px;
                        border-bottom:1.5px solid ${isDark ? '#2a2d45' : '#e8edf2'};">
                <span style="font-size:11px;font-weight:700;color:${isDark ? '#6870a0' : '#888'};
                             text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap;">Portfolio:</span>
                ${selectHtml}
                <button onclick="window.portfolioAnalyzer._renamePortfolio()"
                    title="Rename current portfolio"
                    onmouseenter="${hoverIn(renameColor)}"
                    onmouseleave="${hoverOut(renameColor, bgDef)}"
                    style="${btnBase(renameColor)}">✏️</button>
                <button onclick="window.portfolioAnalyzer._addPortfolio()"
                    title="Add new portfolio"
                    onmouseenter="${hoverIn(addColor)}"
                    onmouseleave="${hoverOut(addColor, bgDef)}"
                    style="${btnBase(addColor)}">＋ New</button>
                <button onclick="window.portfolioAnalyzer._removePortfolio()"
                    title="Remove current portfolio"
                    onmouseenter="${hoverIn(removeColor)}"
                    onmouseleave="${hoverOut(removeColor, bgDef)}"
                    style="${btnBase(removeColor)}">🗑</button>
            </div>`;
    }

    init() {
        // Load all portfolios (with migration from old single-portfolio)
        this._loadAllPortfolios();

        // Create modal interface
        this.createModal();

        const input = document.getElementById('isinSearch');
        input.addEventListener('input', () => {
            this.searchBond();
        });

        input.addEventListener('keydown', (e) => {
            this.handleSearchKeydown(e);
        });

        console.log('📊 Portfolio Analyzer initialized — search backed by Java API');
    }

    createModal() {
        this.modal = document.getElementById('portfolioModal');

        if (!this.modal) {
           console.error('Portfolio modal not found in DOM. Did you include portfolio-modal.ftl?');
           return;
        }

        this.setupDragging();
    }

    setupDragging() {
        const modalContent = document.getElementById('modalContent');
        const modalHeader = document.getElementById('modalHeader');

        let isDragging = false;
        let offsetX = 0;
        let offsetY = 0;
        let minY = 20; // Minimum distance from top

        modalHeader.addEventListener('mousedown', (e) => {
            isDragging = true;
            offsetX = e.clientX - modalContent.offsetLeft;
            offsetY = e.clientY - modalContent.offsetTop;
            modalHeader.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            modalContent.style.position = 'fixed';
            modalContent.style.left = (e.clientX - offsetX) + 'px';

            // Constrain vertical movement - don't allow window to go too far up
            let newTop = e.clientY - offsetY;
            newTop = Math.max(minY, newTop); // Keep at least 20px from top
            newTop = Math.max(0, newTop); // Never negative

            modalContent.style.top = newTop + 'px';
            modalContent.style.margin = '0';
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            modalHeader.style.cursor = 'move';
        });
    }

    openModal() {
        this._initView([]);
    }

    openModalWithBasket(basketItems) {
        this._initView(basketItems || []);
    }

    _initView(basketItems) {
        // Works both as modal (homepage) and as standalone page (/analyzer)
        if (this.modal) {
            this.modal.classList.add('open');
        }
        this._renderPortfolioSwitcher();
        this.updatePortfolioTable();
        this.updateStatistics();
        this.updateCalendars();
        const sr = document.getElementById('searchResults');
        if (sr) sr.style.display = 'none';
        this.renderBasketLabels(basketItems);
    }

    renderBasketLabels(basketItems) {
        const container = document.getElementById('basketLabels');
        if (!container) return;

        if (!basketItems || basketItems.length === 0) {
            container.style.display = 'none';
            container.innerHTML = '';
            return;
        }

        const FLAG_MAP = {
            "ITALIA":"🇮🇹","GERMANIA":"🇩🇪","FRANCIA":"🇫🇷","SPAGNA":"🇪🇸",
            "PORTOGALLO":"🇵🇹","GRECIA":"🇬🇷","AUSTRIA":"🇦🇹","BELGIO":"🇧🇪",
            "OLANDA":"🇳🇱","FINLANDIA":"🇫🇮","IRLANDA":"🇮🇪","SVEZIA":"🇸🇪",
            "DANIMARCA":"🇩🇰","NORVEGIA":"🇳🇴","SVIZZERA":"🇨🇭",
            "REGNO UNITO":"🇬🇧","USA":"🇺🇸","GIAPPONE":"🇯🇵",
            "ROMANIA":"🇷🇴","POLONIA":"🇵🇱","UNGHERIA":"🇭🇺","BULGARIA":"🇧🇬",
            "CROAZIA":"🇭🇷","SLOVENIA":"🇸🇮","SLOVACCHIA":"🇸🇰",
            "REPUBBLICA CECA":"🇨🇿","ESTONIA":"🇪🇪","LETTONIA":"🇱🇻","LITUANIA":"🇱🇹",
            "CIPRO":"🇨🇾","LUSSEMBURGO":"🇱🇺","TURCHIA":"🇹🇷","BRASILE":"🇧🇷",
            "MESSICO":"🇲🇽","CILE":"🇨🇱","SUDAFRICA":"🇿🇦","PERU":"🇵🇪","AUSTRALIA":"🇦🇺"
        };

        container.style.display = 'block';
        const chips = basketItems.map(b => {
            const flag = FLAG_MAP[b.issuer.toUpperCase()] || '🏳️';
            const year = b.maturity ? b.maturity.substring(0, 4) : '';
            return `<button class="basket-chip" onclick="window.portfolioAnalyzer.loadFromBasket('${b.isin}')" title="${b.isin}">
                ${flag} ${b.issuer} ${b.coupon}% ${year}
            </button>`;
        }).join('');

        container.innerHTML = `
            <div class="basket-labels__title">🛒 From basket — click to load:</div>
            <div class="basket-labels__chips">${chips}</div>`;
        if (typeof twemoji !== 'undefined') twemoji.parse(container);
    }

    loadFromBasket(isin) {
        const searchInput = document.getElementById('isinSearch');
        if (searchInput) {
            searchInput.value = isin;
            this.searchBond();
        }
    }

    closeAddForm() {
        const form = document.getElementById('addBondForm');
        if (form) form.style.display = 'none';
        // Clear selection
        this.selectedBond = null;
        const details = document.getElementById('bondDetails');
        if (details) details.innerHTML = '';
        const amountInput = document.getElementById('amount');
        if (amountInput) amountInput.value = '';
        const searchInput = document.querySelector('.search-input');
        if (searchInput) searchInput.value = '';
        const results = document.getElementById('searchResults');
        if (results) results.innerHTML = '';
    }

    closeModal() {
        if (this.modal) {
            this.modal.classList.remove('open');
            this.clearSearch();
        }
    }

    handleSearchKeydown(e) {
        const container = document.getElementById('searchResults');
        if (container.style.display !== 'block') return;

        if (!['ArrowDown','ArrowUp','Enter'].includes(e.key)) return;

        const results = document.querySelectorAll('.search-result');
        if (!results.length) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.highlightedIndex =
                (this.highlightedIndex + 1) % results.length;
            this.updateHighlightedResult();
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.highlightedIndex =
                (this.highlightedIndex - 1 + results.length) % results.length;
            this.updateHighlightedResult();
        }

        if (e.key === 'Enter') {
            e.preventDefault();

            if (this.highlightedIndex >= 0) {
                const bond = this.currentMatches[this.highlightedIndex];

                this.showAddBondForm(bond);

                document.getElementById('isinSearch').value = '';
                this.clearSearchResults();
            }
        }
    }


    clearSearchResults() {
        const container = document.getElementById('searchResults');
        container.innerHTML = '';
        container.style.display = 'none';

        this.highlightedIndex = -1;
        this.currentMatches = [];
    }

    updateHighlightedResult() {
        const results = document.querySelectorAll('.search-result');
        const container = document.getElementById('searchResults');
        const moreLabel = container.querySelector('.search-results-more');

        // remove previous highlight
        results.forEach(r => r.classList.remove('active'));

        if (this.highlightedIndex < 0) return;
        if (this.highlightedIndex >= results.length) return;

        const el = results[this.highlightedIndex];
        el.classList.add('active');

        // keep visible when navigating
        el.scrollIntoView({
            block: 'nearest'
        });

        // NEW — reveal "more results" label when last result selected
        if (this.highlightedIndex === results.length - 1 && moreLabel) {
            moreLabel.scrollIntoView({
                block: 'nearest'
            });
        }
    }

    searchBond() {
        const input = document.getElementById('isinSearch');
        const query = input.value.trim();
        const resultsContainer = document.getElementById('searchResults');

        if (!query || query.length < 2) {
            resultsContainer.innerHTML = '';
            resultsContainer.style.display = 'none';
            return;
        }

        // Debounce: cancel previous pending request
        clearTimeout(this._searchTimer);
        this._searchTimer = setTimeout(async () => {
            try {
                const res = await fetch(`/api/bonds/search?q=${encodeURIComponent(query)}`);
                if (!res.ok) throw new Error('Search failed');
                const bonds = await res.json();
                this.showSearchResults(bonds);
            } catch (err) {
                console.error('Search error:', err);
                resultsContainer.innerHTML = '<div class="search-no-results">Search error — try again</div>';
                resultsContainer.style.display = 'block';
            }
        }, 200);
    }

    showSearchResults = function (matches) {
        const MAX_RESULTS = 8;
        const newMatches = matches.slice(0, MAX_RESULTS);

        const sameResults =
            this.currentMatches.length === newMatches.length &&
            this.currentMatches.every((b, i) => b.isin === newMatches[i].isin);

        this.currentMatches = newMatches;

        if (!sameResults) {
            this.highlightedIndex = 0; // auto select first result (professional UX)
        }

        if (this.highlightedIndex >= newMatches.length) {
            this.highlightedIndex = newMatches.length - 1;
        }

        const container = document.getElementById("searchResults");
        container.innerHTML = "";

        if (!matches || matches.length === 0) {
            container.innerHTML = `
                <div class="search-no-results">
                    No bond found
                </div>
            `;
            container.style.display = "block";
            return;
        }

        // limit results (important UX)
        const resultsToShow = matches.slice(0, MAX_RESULTS);

        resultsToShow.forEach(bond => {

            const row = document.createElement("div");
            row.className = "search-result";

            row.innerHTML = `
                <div class="sr-main">
                    <strong>${bond.issuer}</strong>
                    ${bond.coupon}%
                    ${this.formatDate(bond.maturity)}
                </div>
                <div class="sr-meta">
                    ${bond.isin} - ${bond.price}${bond.currency}
                </div>
            `;

            row.onclick = () => {
                this.showAddBondForm(bond);
                container.innerHTML = "";
                container.style.display = "none";
            };

            container.appendChild(row);
        });

        // Show message in case the results are too many
        if (matches.length > MAX_RESULTS) {
            const remaining = matches.length - MAX_RESULTS;

            const moreMsg = document.createElement("div");
            moreMsg.className = "search-results-more";
            moreMsg.textContent = `${remaining} more result${remaining > 1 ? "s are" : " is"} not shown`;

            container.appendChild(moreMsg);
        }

        container.style.display = "block";

        // CRITICAL — reapply highlight after DOM render
        this.updateHighlightedResult();
    };

    formatDate = function (dateStr) {
        const d = new Date(dateStr);
        return d.toLocaleDateString();
    };


    handleSearch() {
        this.searchBond();
    }

    async showAddBondForm(bond) {
        this.currentBond = bond;

        // Prefetch FX for this bond before computing SAY (needed for non-EUR bonds)
        await PortfolioAnalyzer.prefetchFxForBonds([bond]);
        const say = this.computeSAY(bond);
        const currentYield = bond.priceEur > 0
            ? (bond.coupon / bond.priceEur) * 100
            : 0;

        const detailsDiv = document.getElementById('bondDetails');
        detailsDiv.innerHTML = `
            <strong>${bond.issuer}</strong><br>
            ISIN: <i>${bond.isin}</i><br>
            Maturity: <i>${bond.maturity}</i><br>
            Price: <i>${bond.currency} ${bond.price.toFixed(2)}${bond.currency !== 'EUR' ? ` (${_paSym(_paBaseCcy())} ${_paToBase(bond.priceEur).toFixed(2)})` : ''}</i><br>
            Rating: <i>${bond.rating}</i> | Coupon: <i>${bond.coupon.toFixed(2)}%</i> | SAY: <i>${say.toFixed(2)}%</i>
        `;

        // Reset fields
        document.getElementById('quantity').value = '';
        document.getElementById('amount').value = '';

        const originalWrapper = document.getElementById('originalCurrencyWrapper');
        const originalLabel = document.getElementById('originalCurrencyLabel');
        const originalInput = document.getElementById('amountOriginal');

        // Show native-currency input only when bond currency ≠ user's base currency
        // (no point showing USD→USD conversion if base is already USD)
        const baseCcy = _paBaseCcy();
        if (bond.currency === baseCcy) {
            originalWrapper.style.display = 'none';
            originalInput.value = '';
        } else {
            originalWrapper.style.display = 'flex';
            originalLabel.textContent = bond.currency;
            originalInput.value = '';
        }

        this.alignTotalAmounts();
        document.getElementById('addBondForm').style.display = 'block';
    }

    alignTotalAmounts() {
        if (!this.currentBond) return;

        const eurInput  = document.getElementById('amount');
        const qtyInput  = document.getElementById('quantity');
        const origInput = document.getElementById('amountOriginal');
        if (!eurInput || !qtyInput) return;

        const bond    = this.currentBond;
        const fxRate  = bond.currency !== 'EUR' ? (bond.priceEur / bond.price) : 1;

        // Base-currency amount input → qty + native currency
        eurInput.oninput = () => {
            const baseAmt = parseFloat(eurInput.value) || 0;
            const eur = _paFromBase(baseAmt);            // base → EUR
            qtyInput.value = eur > 0 ? (eur / bond.priceEur).toFixed(4) : '';
            // Fill native input only if it differs from base currency
            if (bond.currency !== _paBaseCcy() && origInput)
                origInput.value = eur > 0 ? (eur / fxRate).toFixed(2) : ''; // EUR → native
        };

        // Original currency input only wired when bond currency ≠ base currency
        if (bond.currency !== _paBaseCcy() && origInput) {
            origInput.oninput = () => {
                const orig = parseFloat(origInput.value) || 0;
                const eur  = orig * fxRate;              // native → EUR
                eurInput.value = orig > 0 ? _paToBase(eur).toFixed(2) : ''; // EUR → base
                qtyInput.value = orig > 0 ? (eur / bond.priceEur).toFixed(4) : '';
            };
        }
    }

    addBondToPortfolio() {
        if (!this.currentBond) return;

        const qty = parseFloat(document.getElementById('quantity').value) || 0;
        const _amountBaseInput = parseFloat(document.getElementById('amount').value.replace(/[^\d.-]/g, '')) || 0;
        const totalEur = _paFromBase(_amountBaseInput); // base currency → EUR

        if (qty <= 0 && _amountBaseInput <= 0) {
            alert('Please enter either a quantity or an investment amount.');
            return;
        }

        // If only qty given, compute totalEur; if only totalEur given, qty already computed by align
        const finalQty    = qty > 0 ? qty : totalEur / this.currentBond.priceEur;
        const finalEur    = totalEur > 0 ? totalEur : finalQty * this.currentBond.priceEur;

        this.portfolio.push({
            ...this.currentBond,
            quantity: finalQty,
            totalEur: finalEur,
            includeInStatistics: true
        });

        this.savePortfolio();
        this.updatePortfolioTable();
        this.updateStatistics();

        document.getElementById('isinSearch').value = '';
        document.getElementById('addBondForm').style.display = 'none';
        document.getElementById('searchResults').innerHTML = '';
        this.currentBond = null;

        alert(`✅ Bond added! Quantity: ${finalQty.toFixed(4)}`);
    }

    removeBond(index) {
        this.portfolio.splice(index, 1);
        this.savePortfolio();
        this.updatePortfolioTable();
        this.updateStatistics();
    }

    updateQuantityInPortfolio(index, newQuantity) {
        const qty = parseFloat(newQuantity);

        if (isNaN(qty) || qty <= 0) {
            alert('Quantity must be greater than 0');
            this.updatePortfolioTable();
            return;
        }

        // Update quantity -> update total investment as well
        this.portfolio[index].quantity = qty;
        this.portfolio[index].totalEur = qty * this.portfolio[index].priceEur;

        this.savePortfolio();
        this.updatePortfolioTable();
        this.updateStatistics();
    }

    updateTaxRate(index, value) {
        const rate = parseFloat(value);
        if (isNaN(rate) || rate < 0 || rate > 100) {
            alert('Tax rate must be between 0 and 100');
            this.updatePortfolioTable();
            return;
        }
        this.portfolio[index].taxRate = rate;
        this.savePortfolio();
        this.updatePortfolioTable();  // redraw Yield/SAY cells immediately
        this.updateStatistics();
    }

    mergeBond(isin) {
        const matches = this.portfolio.filter(b => b.isin === isin);
        if (matches.length < 2) return;

        // REAL invested capital (what user paid)
        const totalInvested = matches.reduce(
            (sum, b) => sum + (b.totalEur || 0),
            0
        );

        // Total quantity
        const totalQty = matches.reduce(
            (sum, b) => sum + b.quantity,
            0
        );

        // True weighted average cost basis
        const weightedAvgPrice = totalQty > 0
            ? totalInvested / totalQty
            : 0;

        // Keep latest market data
        const latestData = matches[matches.length - 1];

        // Remove old entries
        this.portfolio = this.portfolio.filter(b => b.isin !== isin);

        // Push consolidated bond
        this.portfolio.push({
            ...latestData,
            quantity: totalQty,
            totalEur: totalInvested,        // VERY IMPORTANT
            priceEur: latestData.priceEur   // keep current market price
        });

        this.savePortfolio();
        this.updatePortfolioTable();
        this.updateStatistics();

        console.log(
            `Consolidated ${matches.length} entries for ${isin}.
             New Avg Cost: ${_paFmt(weightedAvgPrice, 2)}`
        );
    }

    // ── Dynamic calculations ─────────────────────────────────────────────────

    // ── FX multipliers — via /api/fx-multipliers (shared cache with capital-growth) ──
    // Cache: Map stored on window._paFxCache; key = "CCY_REPORTCCY_YEARS"
    static _getFxCache() {
        if (!window._paFxCache) window._paFxCache = new Map();
        return window._paFxCache;
    }

    // Sync lookup — only valid after prefetchFxForBonds() has been called.
    _fxGet(currency, years) {
        if (!currency || currency === 'EUR') return { fxBuy:1, fxCoupon:1, fxFuture:1 };
        const reportCcy = localStorage.getItem('bondReportCurrency') || 'EUR';
        const key = `${currency}_${reportCcy}_${Math.max(1, Math.round(years))}`;
        return PortfolioAnalyzer._getFxCache().get(key) || { fxBuy:1, fxCoupon:1, fxFuture:1 };
    }

    // Pre-fetch FX for a list of bonds (called at portfolio load time).
    static async prefetchFxForBonds(bonds) {
        const reportCcy = localStorage.getItem('bondReportCurrency') || 'EUR';
        const needed = new Set();
        bonds.forEach(b => {
            if (b.currency && b.currency !== reportCcy && b.maturity) {
                const yrs = Math.max(1, Math.round((new Date(b.maturity)-new Date())/(365.25*24*3600*1000)));
                needed.add(`${b.currency}:${yrs}`);
            }
        });
        const cache = PortfolioAnalyzer._getFxCache();
        await Promise.all([...needed].map(async k => {
            const [ccy, yrs] = k.split(':');
            const key = `${ccy}_${reportCcy}_${yrs}`;
            const cached = cache.get(key);
            if (cached && cached.expiresAt > Date.now()) return;
            try {
                const r = await fetch(`/api/fx-multipliers?currency=${ccy}&years=${yrs}&reportCurrency=${reportCcy}`);
                if (!r.ok) throw new Error(r.status);
                const data = await r.json();
                cache.set(key, { ...data, expiresAt: Date.now() + (data.ttlSeconds||3600)*1000 });
            } catch { /* fallback: no-op, fxGet returns 1,1,1 */ }
        }));
    }

    _computeSAYWithFx(bond) {
        const yrs = Math.max(0.01, (new Date(bond.maturity) - new Date()) / (365.25*24*3600*1000));
        const price = bond.price || bond.priceEur;
        if (!price || !bond.priceEur) return 0;
        const fx = this._fxGet(bond.currency, yrs);
        const couponNet  = bond.coupon * (1 - (bond.taxRate || 0) / 100);
        const bondNbr    = 1000 / (fx.fxBuy * price);
        const capCoupons = bondNbr * couponNet * Math.ceil(yrs) * fx.fxCoupon;
        const capGain    = 100 * bondNbr * fx.fxFuture;
        return (capCoupons + capGain - 1000) / (10 * yrs);
    }

    computeSAY(bond) {
        return this._computeSAYWithFx(bond);
    }

    computeCurrentYield(bond) {
        const nominal   = bond.nominal || 100;
        const fxRate    = bond.currency !== 'EUR' ? (bond.priceEur / bond.price) : 1;
        const nominalEur = nominal * fxRate;
        const couponEur  = (bond.coupon / 100) * nominalEur;
        return bond.priceEur > 0 ? (couponEur / bond.priceEur) * 100 : 0;
    }

    computeSAYNet(bond) {
        return this._computeSAYWithFx(bond);
    }

    computeCurrentYieldNet(bond) {
        return this.computeCurrentYield(bond) * (1 - (bond.taxRate || 0) / 100);
    }

    updatePortfolioTable() {
        const tbody = document.getElementById('portfolioTableBody');
        const empty = document.getElementById('emptyPortfolioMsg');

        if (this.portfolio.length === 0) {
            tbody.innerHTML = '';
            empty.style.display = 'block';
            return;
        }
        empty.style.display = 'none';

        // Count ISINs to identify which ones need a merge button
        const isinCounts = this.portfolio.reduce((acc, b) => {
            acc[b.isin] = (acc[b.isin] || 0) + 1;
            return acc;
        }, {});

        tbody.innerHTML = this.portfolio.map((bond, idx) => {
            const hasDuplicates = isinCounts[bond.isin] > 1;

            const currentValueEur = bond.quantity * bond.priceEur;
            const gainLoss = Math.round(currentValueEur - bond.totalEur);

            const _dk = document.body.classList.contains('dark');
            const _trBorder = _dk ? '#2a2d45' : '#eee';
            const _inputStyle = _dk ? 'background:#1e2338;border:1px solid #3a3f60;color:#c8d0f0;' : '';
            return `<tr style="border-bottom:1px solid ${_trBorder};">
                <td>${bond.isin}</td>
                <td>${bond.issuer}</td>
                <td>${_paToBase(bond.priceEur).toFixed(2)}</td>
                <td>${bond.currency}</td>
                <td>${bond.rating}</td>
                <td>
                    <input type="number"
                           value="${bond.quantity.toFixed(2)}"
                           min="0.01"
                           step="0.01"
                           onchange="window.portfolioAnalyzer.updateQuantityInPortfolio(${idx}, this.value)"
                           style="width:58px;padding:4px;font-size:12px;${_inputStyle}">
                </td>
                <td>${_paFmt(bond.totalEur ?? 0, 2)}</td>
                <td style="white-space:nowrap;">${bond.maturity}</td>
                <td>${this.computeCurrentYieldNet(bond).toFixed(2)}</td>
                <td>${this.computeSAYNet(bond).toFixed(2)}</td>
                <td>
                    <input type="number" min="0" max="100" step="0.5"
                           value="${(bond.taxRate ?? 0).toFixed(1)}"
                           style="width:48px;padding:3px;font-size:12px;text-align:right;${_inputStyle}"
                           title="Withholding tax % on coupon income"
                           onchange="window.portfolioAnalyzer.updateTaxRate(${idx}, this.value)">
                </td>
                <td class="${gainLoss > 0 ? 'good' : gainLoss < 0 ? 'bad' : ''}">${Math.round(_paToBase(gainLoss))}</td>
                <td>
                    <input type="checkbox" title="Toggle to include/exclude this bond from statistics calculations"
                           ${bond.includeInStatistics ? 'checked' : ''}
                           onchange="window.portfolioAnalyzer.toggleStatistics(${idx})">
                </td>
                <td>
                   <div style="display:flex;justify-content:flex-end;align-items:center;gap:10px;">
                       ${hasDuplicates ? `<span onclick="window.portfolioAnalyzer.mergeBond('${bond.isin}')" title="Merge duplicates" style="cursor:pointer;font-size:18px;transition:opacity 0.15s ease;" onmouseover="this.style.opacity='0.6'" onmouseout="this.style.opacity='1'">🔄</span>` : ''}
                       <span onclick="window.portfolioAnalyzer.removeBond(${idx})" title="Delete bond" style="cursor:pointer;font-size:18px;transition:opacity 0.15s ease;" onmouseover="this.style.opacity='0.6'" onmouseout="this.style.opacity='1'">❌</span>
                   </div>
                </td>
            </tr>`;
        }).join('');
    }

    toggleAllStatistics(checked) {
        this.portfolio.forEach(b => {
            b.includeInStatistics = checked;
        });

        this.savePortfolio();
        this.updatePortfolioTable();
        this.updateStatistics();
    }

    toggleStatistics(index) {
        this.portfolio[index].includeInStatistics =
            !this.portfolio[index].includeInStatistics;

        this.savePortfolio();
        this.updateStatistics();
    }

    async updateStatistics() {
        // B: pre-fetch FX multipliers for all non-EUR bonds before computing SAY/totalReturn
        await PortfolioAnalyzer.prefetchFxForBonds(this.portfolio);
        if (this.portfolio.length === 0) {
            document.getElementById('statTotalInvestment').textContent = _paSym(_paBaseCcy()) + '0';
            document.getElementById('statAvgPrice').textContent = _paSym(_paBaseCcy()) + '0.00';
            document.getElementById('statWeightedSAY').textContent = '0.00%';
            document.getElementById('statWeightedSAYNet').textContent = '0.00%';
            document.getElementById('statWeightedYield').textContent = '0.00%';
            document.getElementById('statWeightedYieldNet').textContent = '0.00%';
            document.getElementById('statAvgCoupon').textContent = '0.00%';
            document.getElementById('statBondCount').textContent = '0';
            document.getElementById('statWeightedRisk').textContent = '0.00 yrs';
            document.getElementById('statWeightedRating').textContent = '-';
            document.getElementById('currencyBreakdown').innerHTML = '';
            const ceEl = document.getElementById('countryExposureChart');
            if (ceEl) ceEl.innerHTML = '';
            document.getElementById('statTotalProfit').textContent = _paSym(_paBaseCcy()) + '0';
            document.getElementById('statTotalCouponIncome').textContent = _paSym(_paBaseCcy()) + '0';
            document.getElementById('statTotalReturn').textContent = _paSym(_paBaseCcy()) + '0';
            this.updateCalendars();
            // reset all cards to neutral when empty
            ['card-totalInvestment','card-avgPrice','card-weightedSAY','card-weightedSAYNet',
             'card-weightedYield','card-weightedYieldNet','card-avgCoupon','card-bondCount',
             'card-weightedRisk','card-weightedRating','card-totalProfit','card-couponIncome',
             'card-totalReturn'
            ].forEach(id => this.setCardColor(id, 'neutral'));
            return;
        }

        let totalInvestment = 0;
        let totalInvestment1 = 0;
        let weightedSAY = 0;
        let weightedSAYNet = 0;
        let weightedYield = 0;
        let weightedYieldNet = 0;
        let weightedCoupon = 0;
        let weightedRisk = 0;
        let currencyTotals = {}; // Track investment by currency
        let totalProfit = 0;
        let totalCouponIncome = 0;
        let totalReturn = 0; // lifetime net: coupons * years + face redemption - invested

        const bonds = this.portfolio.filter(b => b.includeInStatistics);
        bonds.forEach(bond => {

            const currentValue = bond.priceEur * bond.quantity;   // market value
            const investedAmount = bond.totalEur || 0;            // what you paid

            totalInvestment += investedAmount;
            totalInvestment1 += currentValue;

            weightedSAY    += (this.computeSAY(bond) * currentValue);
            weightedSAYNet += (this.computeSAYNet(bond) * currentValue);
            weightedYield    += (this.computeCurrentYield(bond) * currentValue);
            weightedYieldNet += (this.computeCurrentYieldNet(bond) * currentValue);
            weightedCoupon += (bond.coupon * currentValue);

            // TOTAL PROFIT (correct now)
            totalProfit += (currentValue - investedAmount);

            // TOTAL RETURN (lifetime): BondScoreEngine formula with FX haircuts, scaled to investedAmount
            const years2   = Math.max(0, (new Date(bond.maturity) - new Date()) / (365.25 * 24 * 60 * 60 * 1000));
            const price2   = bond.price || bond.priceEur || 1;
            const fx2      = this._fxGet(bond.currency, years2);
            const coupNet2 = bond.coupon * (1 - (bond.taxRate || 0) / 100);
            // Scale from 1000€ basis to actual investedAmount
            const scale2   = investedAmount / 1000;
            const bondNbr2 = scale2 * 1000 / (fx2.fxBuy * price2);
            const capC2    = bondNbr2 * coupNet2 * Math.ceil(years2) * fx2.fxCoupon;
            const capG2    = 100 * bondNbr2 * fx2.fxFuture;
            totalReturn   += (capC2 + capG2) - investedAmount;

            // TOTAL COUPON INCOME (ANNUAL, IN EUR, NET OF WITHHOLDING TAX)
            const nominal = bond.nominal || 100;
            const annualCouponOriginal = (bond.coupon / 100) * nominal * bond.quantity;

            const annualCouponEur = bond.currency === 'EUR'
                ? annualCouponOriginal
                : annualCouponOriginal * (bond.priceEur / bond.price);

            totalCouponIncome += annualCouponEur * (1 - (bond.taxRate || 0) / 100);

            // Risk (years to maturity)
            const maturityDate = new Date(bond.maturity);
            const today = new Date();
            const yearsToMaturity =
                (maturityDate - today) / (365.25 * 24 * 60 * 60 * 1000);

            weightedRisk += (Math.max(0, yearsToMaturity) * currentValue);

            // Currency breakdown
            if (!currencyTotals[bond.currency]) {
                currencyTotals[bond.currency] = 0;
            }
            currencyTotals[bond.currency] += currentValue;

        });

        const totalQty = bonds.reduce((sum, b) => sum + b.quantity, 0);
        const avgPrice = totalInvestment / totalQty;

        const weightedSAYPercent    = (weightedSAY / totalInvestment1);
        const weightedSAYNetPercent = (weightedSAYNet / totalInvestment1);
        const weightedYieldPercent    = (weightedYield / totalInvestment1);
        const weightedYieldNetPercent = (weightedYieldNet / totalInvestment1);
        const weightedCouponPercent = (weightedCoupon / totalInvestment1);
        const weightedRiskYears = (weightedRisk / totalInvestment1);

        // Calculate weighted average rating (using rating order)
        const ratingOrder = ['AAA', 'AA+', 'AA', 'AA-', 'A+', 'A', 'A-', 'BBB+', 'BBB', 'BBB-', 'BB+', 'BB', 'BB-', 'B+', 'B', 'B-', 'CCC', 'CC', 'C', 'D'];
        let weightedRatingScore = 0;
        bonds.forEach(bond => {
            const marketValue = bond.priceEur * bond.quantity;
            const ratingIndex = ratingOrder.indexOf(bond.rating);
            const ratingScore = ratingIndex >= 0 ? ratingIndex : 20; // Default to lowest if not found
            weightedRatingScore += (ratingScore * marketValue);
        });
        const avgRatingScore = weightedRatingScore / totalInvestment1;
        const weightedRating = ratingOrder[Math.round(avgRatingScore)] || '-';

        totalInvestment = Math.round(totalInvestment);
        document.getElementById('statTotalInvestment').textContent = _paFmt(totalInvestment);
        document.getElementById('statAvgPrice').textContent = _paFmt(avgPrice, 2);
        document.getElementById('statWeightedSAY').textContent = `${weightedSAYPercent.toFixed(2)}%`;
        document.getElementById('statWeightedSAYNet').textContent = `${weightedSAYNetPercent.toFixed(2)}%`;
        document.getElementById('statWeightedYield').textContent = `${weightedYieldPercent.toFixed(2)}%`;
        document.getElementById('statWeightedYieldNet').textContent = `${weightedYieldNetPercent.toFixed(2)}%`;
        document.getElementById('statAvgCoupon').textContent = `${weightedCouponPercent.toFixed(2)}%`;
        const uniqueISINs = new Set(bonds.map(b => b.isin));
        document.getElementById('statBondCount').textContent = uniqueISINs.size;
        document.getElementById('statWeightedRisk').textContent = `${weightedRiskYears.toFixed(2)} yrs`;
        document.getElementById('statWeightedRating').textContent = weightedRating;

        // Total Profit
        totalProfit = Math.round(totalProfit);
        const profitElement = document.getElementById('statTotalProfit');
        if (profitElement) {
            profitElement.textContent = _paFmt(totalProfit);
            profitElement.style.color = totalProfit >= 0 ? '#4CAF50' : '#f44336';
        }

        // Total Return (lifetime, net)
        totalReturn = Math.round(totalReturn);
        const returnElement = document.getElementById('statTotalReturn');
        if (returnElement) {
            returnElement.textContent = _paFmt(totalReturn);
        }

        // Total Coupon Income (Current Year)
        totalCouponIncome = Math.round(totalCouponIncome);
        const couponElement = document.getElementById('statTotalCouponIncome');
        if (couponElement) {
            couponElement.textContent = _paFmt(totalCouponIncome);
        }

        // Display currency breakdown
        this.updateCurrencyBreakdown(currencyTotals, totalInvestment);
        this.updateCountryExposure(bonds);
        this.updateStatCardColors(weightedSAYPercent, weightedSAYNetPercent,
                                  weightedYieldPercent, weightedYieldNetPercent,
                                  weightedCouponPercent, weightedRiskYears,
                                  weightedRating, avgPrice,
                                  totalProfit, totalReturn, totalInvestment);
        this.updateCalendars();
    }

    updateCurrencyBreakdown(currencyTotals, totalInvestment) {
        const breakdown = document.getElementById('currencyBreakdown');
        const currencies = Object.keys(currencyTotals).sort();

        const _dark = document.body.classList.contains('dark');
        const _cardBg   = _dark ? '#1e2338' : 'white';
        const _labelClr = _dark ? '#8890b8' : '#666';
        const _amtClr   = _dark ? '#6a7090' : '#999';
        breakdown.innerHTML = currencies.map(currency => {
            const amount = Math.round(currencyTotals[currency]);
            const percentage = Math.round((amount / totalInvestment * 100));
            return `
                <div style="background:${_cardBg};padding:10px;border-radius:4px;border-left:4px solid #4CAF50;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
                    <div style="font-size:11px;color:${_labelClr};font-weight:600;margin-bottom:6px;">${currency}</div>
                    <p style="margin:0;font-size:14px;font-weight:bold;color:#4CAF50;">${percentage}%</p>
                    <p style="margin:5px 0 0 0;font-size:11px;color:${_amtClr};">${_paSym(_paBaseCcy())}${Math.round(_paToBase(amount))}</p>
                </div>
            `;
        }).join('');
    }

    updateCountryExposure(bonds) {
        const el = document.getElementById('countryExposureChart');
        if (!el) return;

        if (!bonds || bonds.length === 0) {
            el.innerHTML = '';
            return;
        }

        // Aggregate investment by country (using issuer field mapped to FLAG_MAP)
        const FLAG_MAP = {
            "ITALIA":"🇮🇹","GERMANIA":"🇩🇪","FRANCIA":"🇫🇷","SPAGNA":"🇪🇸",
            "PORTOGALLO":"🇵🇹","GRECIA":"🇬🇷","AUSTRIA":"🇦🇹","BELGIO":"🇧🇪",
            "OLANDA":"🇳🇱","FINLANDIA":"🇫🇮","IRLANDA":"🇮🇪","SVEZIA":"🇸🇪",
            "DANIMARCA":"🇩🇰","NORVEGIA":"🇳🇴","SVIZZERA":"🇨🇭",
            "REGNO UNITO":"🇬🇧","UK":"🇬🇧","USA":"🇺🇸","GIAPPONE":"🇯🇵",
            "ROMANIA":"🇷🇴","POLONIA":"🇵🇱","UNGHERIA":"🇭🇺","BULGARIA":"🇧🇬",
            "CROAZIA":"🇭🇷","SLOVENIA":"🇸🇮","SLOVACCHIA":"🇸🇰",
            "REPUBBLICA CECA":"🇨🇿","ESTONIA":"🇪🇪","LETTONIA":"🇱🇻","LITUANIA":"🇱🇹",
            "CIPRO":"🇨🇾","LUSSEMBURGO":"🇱🇺","TURCHIA":"🇹🇷","BRASILE":"🇧🇷",
            "MESSICO":"🇲🇽","CILE":"🇨🇱","SUDAFRICA":"🇿🇦","PERU":"🇵🇪","AUSTRALIA":"🇦🇺"
        };

        // Map bond issuer → country name
        // --- Aggregazione ---
        const countryTotals = {};
        bonds.forEach(bond => {
            const issuerUp = (bond.issuer || '').toUpperCase();
            let country = 'OTHER';

            for (const key of Object.keys(FLAG_MAP)) {
                if (issuerUp.includes(key)) { country = key; break; }
            }

            if (bond.country) country = bond.country.toUpperCase();

            const val = bond.totalEur || 0;
            countryTotals[country] = (countryTotals[country] || 0) + val;
        });

        const entries = Object.entries(countryTotals)
            .filter(([_, v]) => v > 0)
            .sort((a, b) => b[1] - a[1]);

        if (!entries.length) {
            el.innerHTML = '';
            return;
        }

        const labels = entries.map(([c]) => `${FLAG_MAP[c] || '🌍'} ${c}`);
        const data = entries.map(([_, v]) => v);

        const COLORS = ['#2196F3','#4CAF50','#FF9800','#E91E63','#9C27B0',
                        '#00BCD4','#CDDC39','#FF5722','#607D8B','#3F51B5'];

        const isDark = document.body.classList.contains('dark');
        const sym = _paSym(_paBaseCcy());

        // Reset container
        el.innerHTML = `<canvas id="countryPie" width="160" height="160"></canvas>`;

        const ctx = document.getElementById('countryPie').getContext('2d');

        if (this._countryChart) {
            this._countryChart.destroy();
        }

        this._countryChart = new Chart(ctx, {
            type: 'doughnut',   // pie → doughnut è più moderno
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: COLORS,
                    borderColor: isDark ? '#13151f' : '#fff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: isDark ? '#e0e4ff' : '#1a2a4a',
                            font: { size: 11 }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: ctx => {
                                const total = ctx.dataset.data
                                    .reduce((a, b) => a + b, 0);
                                const pct = (ctx.raw / total * 100).toFixed(1);
                                const amount = Math.round(_paToBase(ctx.raw))
                                    .toLocaleString();
                                return `${ctx.label}: ${pct}% (${sym}${amount})`;
                            }
                        }
                    }
                },
                cutout: '55%'  // donut thickness
            }
        });
    }

    updateCalendars() {
        this.updateDividendCalendar();
        this.updateMaturityCalendar();
    }

    updateDividendCalendar() {
        const el = document.getElementById('dividendCalendar');
        if (!el) return;

        const bonds = this.portfolio.filter(b => b.includeInStatistics);
        if (bonds.length === 0) {
            el.innerHTML = `<p style="color:${document.body.classList.contains('dark') ? '#4a5070' : '#999'};font-size:13px;">No bonds in portfolio.</p>`;
            return;
        }

        // Build 12 monthly buckets starting from next month
        const today = new Date();
        const months = [];
        for (let i = 0; i < 12; i++) {
            const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
            months.push({ year: d.getFullYear(), month: d.getMonth(), income: 0, label: d.toLocaleString('default', { month: 'short', year: 'numeric' }) });
        }

        bonds.forEach(bond => {
            const matDate  = new Date(bond.maturity);
            if (matDate <= today) return; // already matured

            const nominal  = bond.nominal || 100;
            const fxRate   = bond.currency !== 'EUR' ? (bond.priceEur / bond.price) : 1;
            const nomEur   = nominal * fxRate;
            // annual coupon in EUR per unit * quantity
            const annualCouponGross = (bond.coupon / 100) * nomEur * bond.quantity;
            const annualCouponTotal  = annualCouponGross * (1 - (bond.taxRate || 0) / 100);

            // payments per year from backend (1=annual, 2=semi-annual, 4=quarterly)
            const freq = bond.couponFrequency || 1;
            const couponPerPayment = annualCouponTotal / freq;
            // interval in months between payments
            const intervalMonths = Math.round(12 / freq);

            // Reference month = maturity month (coupon paid on same month each cycle)
            const refMonth = matDate.getMonth(); // 0-11

            // Build set of payment months within a year
            const paymentMonths = new Set();
            for (let i = 0; i < freq; i++) {
                paymentMonths.add((refMonth - i * intervalMonths + 120) % 12);
            }

            months.forEach(bucket => {
                if (paymentMonths.has(bucket.month)) {
                    const bucketDate = new Date(bucket.year, bucket.month + 1, 0);
                    if (bucketDate <= matDate) {
                        bucket.income += couponPerPayment;
                    }
                }
            });
        });

        el.innerHTML = months.map(m => {
            const income = Math.round(m.income);
            const height = income > 0 ? Math.max(20, Math.min(80, income / 5)) : 0;
            const color  = income > 0 ? '#4CAF50' : '#e0e0e0';
            return `
                <div class="cal-month">
                    <div class="cal-bar-wrap">
                        <div class="cal-bar" style="height:${height}px;background:${color};"
                             title="${m.label}: ${_paSym(_paBaseCcy())}${Math.round(_paToBase(income))}"></div>
                    </div>
                    <div class="cal-amount">${income > 0 ? _paSym(_paBaseCcy()) + Math.round(_paToBase(income)) : '—'}</div>
                    <div class="cal-label">${m.label}</div>
                </div>`;
        }).join('');
    }

    updateMaturityCalendar() {
        const el = document.getElementById('maturityCalendar');
        if (!el) return;

        const bonds = this.portfolio.filter(b => b.includeInStatistics);
        if (bonds.length === 0) {
            el.innerHTML = `<p style="color:${document.body.classList.contains('dark') ? '#4a5070' : '#999'};font-size:13px;">No bonds in portfolio.</p>`;
            return;
        }

        // Group by maturity date, sorted ascending
        const sorted = [...bonds].sort((a, b) => new Date(a.maturity) - new Date(b.maturity));

        // Merge same ISIN entries
        const merged = {};
        sorted.forEach(bond => {
            const key = bond.isin;
            if (!merged[key]) {
                merged[key] = { ...bond };
            } else {
                merged[key].quantity += bond.quantity;
                merged[key].totalEur = (merged[key].totalEur || 0) + (bond.totalEur || 0);
            }
        });

        const rows = Object.values(merged).sort((a, b) => new Date(a.maturity) - new Date(b.maturity));

        el.innerHTML = rows.map(bond => {
            const nominal    = bond.nominal || 100;
            const isEur      = bond.currency === 'EUR';
            const fxRate     = isEur ? 1 : (bond.priceEur / bond.price);

            // Capital returned at maturity (face value * quantity, in native currency)
            const faceNative = nominal * bond.quantity;
            const faceEur    = faceNative * fxRate;

            // Capital gain = face value - cost basis
            const costBasis  = bond.totalEur || (bond.priceEur * bond.quantity);
            const gainEur    = faceEur - costBasis;
            const gainClass  = gainEur >= 0 ? 'good' : 'bad';
            const gainSign   = gainEur >= 0 ? '+' : '';

            const matStr     = new Date(bond.maturity).toLocaleDateString('default', { year:'numeric', month:'short', day:'numeric' });

            // Show native amount only if bond currency differs from user's base currency
            const baseSym  = _paSym(_paBaseCcy());
            const baseCcy2 = _paBaseCcy();
            const sameAsBase = bond.currency === baseCcy2;
            const faceBase = Math.round(_paToBase(faceEur)).toLocaleString();
            const faceDisplay = sameAsBase
                ? `${baseSym}${faceBase}`
                : `${bond.currency} ${Math.round(faceNative).toLocaleString()} (≈${baseSym}${faceBase})`;

            return `
                <div class="maturity-row-item">
                    <div class="mat-date">${matStr}</div>
                    <div class="mat-info">
                        <strong>${bond.issuer}</strong>
                        <span style="color:#888;font-size:12px;">${bond.isin}</span>
                    </div>
                    <div class="mat-face">${faceDisplay}</div>
                    <div class="mat-gain ${gainClass}">${gainSign}${_paSym(_paBaseCcy())}${Math.round(_paToBase(gainEur)).toLocaleString()}</div>
                </div>`;
        }).join('');
    }

    // ── Stat card colour logic ────────────────────────────────────────────────

    setCardColor(cardId, level) {
        const el = document.getElementById(cardId);
        if (!el) return;
        el.classList.remove('stat-neutral', 'stat-green', 'stat-yellow', 'stat-red');
        el.classList.add('stat-' + level);
    }

    updateStatCardColors(sayGross, sayNet, yieldGross, yieldNet,
                         coupon, riskYears, rating, avgPrice, totalProfit,
                         totalReturn = 0, totalInvestment = 0) {

        const ratingOrder = ['AAA','AA+','AA','AA-','A+','A','A-',
                             'BBB+','BBB','BBB-','BB+','BB','BB-',
                             'B+','B','B-','CCC','CC','C','D'];

        // Helper: map value to green/yellow/red given [greenMax, yellowMax] thresholds
        // For "lower is better" metrics pass invert=true
        const band = (val, greenThresh, yellowThresh, invert = false) => {
            if (invert) {
                if (val <= greenThresh)  return 'green';
                if (val <= yellowThresh) return 'yellow';
                return 'red';
            } else {
                if (val >= greenThresh)  return 'green';
                if (val >= yellowThresh) return 'yellow';
                return 'red';
            }
        };

        // Static neutral cards
        this.setCardColor('card-totalInvestment', 'neutral');
        this.setCardColor('card-bondCount',        'neutral');
        this.setCardColor('card-couponIncome',     'neutral');

        // SAY gross / net  (≥3.5% green, ≥2% yellow, <2% red)
        this.setCardColor('card-weightedSAY',    band(sayGross, 3.5, 2.0));
        this.setCardColor('card-weightedSAYNet', band(sayNet,   3.5, 2.0));

        // Yield gross / net  (≥3% green, ≥1.5% yellow, <1.5% red)
        this.setCardColor('card-weightedYield',    band(yieldGross, 3.0, 1.5));
        this.setCardColor('card-weightedYieldNet', band(yieldNet,   3.0, 1.5));

        // Avg Coupon  (≥3% green, ≥1.5% yellow, <1.5% red)
        this.setCardColor('card-avgCoupon', band(coupon, 3.0, 1.5));

        // Avg Risk — lower is better  (≤7y green, ≤15y yellow, >15y red)
        this.setCardColor('card-weightedRisk', band(riskYears, 7, 15, true));

        // Avg Price — lower is better  (≤110 green, ≤120 yellow, >120 red)
        this.setCardColor('card-avgPrice', band(avgPrice, 110, 120, true));

        // Total Profit  (≥0 green, <0 yellow)
        this.setCardColor('card-totalProfit', totalProfit >= 0 ? 'green' : 'yellow');

        // Total Return — soglie su % dell'investimento iniziale
        // ≥50% verde, ≥20% giallo, <20% rosso
        if (totalInvestment > 0) {
            const retPct = (totalReturn / totalInvestment) * 100;
            this.setCardColor('card-totalReturn', retPct >= 50 ? 'green' : retPct >= 20 ? 'yellow' : 'red');
        } else {
            this.setCardColor('card-totalReturn', 'neutral');
        }

        // Weighted Rating  (≥A- green, ≥BBB- yellow, <BBB- red)
        const ratingIdx = ratingOrder.indexOf(rating);
        let ratingColor = 'neutral';
        if (ratingIdx >= 0) {
            if (ratingIdx <= ratingOrder.indexOf('A-'))   ratingColor = 'green';
            else if (ratingIdx <= ratingOrder.indexOf('BBB-')) ratingColor = 'yellow';
            else ratingColor = 'red';
        }
        this.setCardColor('card-weightedRating', ratingColor);
    }

    savePortfolio() {
        this._saveAllPortfolios();
    }


    exportPDF() {
        if (this.portfolio.length === 0) {
            alert('Portfolio is empty');
            return;
        }
        // Show title popup first, then export
        this._showPdfTitlePopup();
    }

    _showPdfTitlePopup() {
        const defaultTitle = `BondFX — Portfolio Report (${_paBaseCcy()})`;
        // Remove any existing popup
        const existing = document.getElementById('pdfTitlePopup');
        if (existing) existing.remove();

        const isDark = document.body.classList.contains('dark');
        const popup = document.createElement('div');
        popup.id = 'pdfTitlePopup';
        popup.innerHTML = `
            <div id="pdfTitleBackdrop" style="
                position:fixed;inset:0;z-index:2000;
                background:rgba(0,0,0,0.55);
                display:flex;align-items:center;justify-content:center;
                padding:16px;box-sizing:border-box;
                animation:fadeInPdf 0.15s ease;">
                <div style="
                    background:${isDark ? '#1e2338' : '#fff'};
                    border:1px solid ${isDark ? '#3a3f60' : '#d0d8e8'};
                    border-radius:10px;
                    padding:24px 24px 20px;
                    width:100%;max-width:420px;
                    box-shadow:0 12px 40px rgba(0,0,0,0.35);
                    box-sizing:border-box;">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${isDark ? '#7aadee' : '#1a4a9c'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                        <span style="font-weight:700;font-size:14px;color:${isDark ? '#e0e8ff' : '#1a2a4a'};">Export PDF</span>
                    </div>
                    <label style="display:block;font-size:11px;font-weight:600;color:${isDark ? '#8890b8' : '#666'};margin-bottom:6px;letter-spacing:0.5px;text-transform:uppercase;">Report Title</label>
                    <input id="pdfTitleInput" type="text" value="${defaultTitle.replace(/"/g, '&quot;')}"
                        style="
                            width:100%;box-sizing:border-box;
                            padding:9px 12px;
                            border:1.5px solid ${isDark ? '#3a4a6a' : '#c0cce0'};
                            border-radius:6px;
                            background:${isDark ? '#151825' : '#f5f8ff'};
                            color:${isDark ? '#c8d0f0' : '#1a2a4a'};
                            font-size:13px;
                            outline:none;
                            transition:border-color 0.15s;">
                    <div style="display:flex;gap:10px;margin-top:18px;justify-content:flex-end;flex-wrap:wrap;">
                        <button id="pdfTitleCancel" style="
                            padding:8px 18px;
                            border:1.5px solid ${isDark ? '#3a3f60' : '#bbb'};
                            background:${isDark ? '#2a2d45' : '#f5f5f5'};
                            color:${isDark ? '#c0c8e8' : '#444'};
                            border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;
                            transition:all 0.15s;">Cancel</button>
                        <button id="pdfTitleConfirm" style="
                            padding:8px 22px;
                            border:none;
                            background:#1a4a9c;
                            color:#fff;
                            border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;
                            transition:background 0.15s;">
                            ⬇ Export PDF</button>
                    </div>
                </div>
            </div>`;
        // Add animation keyframe once
        if (!document.getElementById('pdfFadeStyle')) {
            const s = document.createElement('style');
            s.id = 'pdfFadeStyle';
            s.textContent = '@keyframes fadeInPdf{from{opacity:0;transform:scale(0.97)}to{opacity:1;transform:scale(1)}}';
            document.head.appendChild(s);
        }
        document.body.appendChild(popup);

        const input = document.getElementById('pdfTitleInput');
        const cancel = document.getElementById('pdfTitleCancel');
        const confirm = document.getElementById('pdfTitleConfirm');
        const backdrop = document.getElementById('pdfTitleBackdrop');

        // Focus + select all
        setTimeout(() => { input.focus(); input.select(); }, 50);

        // Hover states
        cancel.onmouseenter  = () => { cancel.style.background = isDark ? '#3a3f60' : '#e8e8e8'; };
        cancel.onmouseleave  = () => { cancel.style.background = isDark ? '#2a2d45' : '#f5f5f5'; };
        confirm.onmouseenter = () => { confirm.style.background = '#2560c8'; };
        confirm.onmouseleave = () => { confirm.style.background = '#1a4a9c'; };
        input.onfocus        = () => { input.style.borderColor = isDark ? '#5a7acc' : '#4a7cc7'; };
        input.onblur         = () => { input.style.borderColor = isDark ? '#3a4a6a' : '#c0cce0'; };

        const close = () => popup.remove();
        const doExportWithTitle = () => {
            const title = document.getElementById('pdfTitleInput')?.value?.trim() || defaultTitle;
            close();
            this._doExportPDF(title);
        };

        cancel.onclick  = close;
        confirm.onclick = doExportWithTitle;
        // Click outside to cancel
        backdrop.onclick = (e) => { if (e.target === backdrop) close(); };
        // Enter to confirm
        input.onkeydown = (e) => { if (e.key === 'Enter') doExportWithTitle(); if (e.key === 'Escape') close(); };
    }

    _doExportPDF(reportTitle) {
        // Load jsPDF dynamically if not already loaded
        const doExport = () => {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            const pageW = doc.internal.pageSize.getWidth();
            const pageH = doc.internal.pageSize.getHeight();
            const margin = 12;

            // ── Header ──
            doc.setFillColor(26, 58, 92);
            doc.rect(0, 0, pageW, 16, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(13);
            doc.setFont('helvetica', 'bold');
            doc.text(reportTitle, margin, 11);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            const _d = new Date();
            const now = _d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })
                + ' ' + _d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
            doc.text('Generated: ' + now, pageW - margin, 11, { align: 'right' });

            // ── Portfolio table ──
            doc.setTextColor(0, 0, 0);
            const headers = ['ISIN', 'Issuer', `Price ${_paSym(_paBaseCcy())}`, 'Curr.', 'Rating', 'Qty', `Invest. ${_paSym(_paBaseCcy())}`,
                             'Maturity', 'Yield%', 'SAY%', 'Tax%', `Profit ${_paSym(_paBaseCcy())}`];
            const colW    = [28, 28, 18, 12, 14, 12, 22, 22, 14, 14, 12, 18];
            let y = 24;

            // Header row
            doc.setFillColor(240, 244, 250);
            doc.rect(margin, y - 4, pageW - margin * 2, 7, 'F');
            doc.setFontSize(7);
            doc.setFont('helvetica', 'bold');
            let x = margin;
            headers.forEach((h, i) => {
                doc.text(h, x + colW[i] / 2, y, { align: 'center' });
                x += colW[i];
            });
            y += 5;

            // Data rows
            doc.setFont('helvetica', 'normal');
            this.portfolio.forEach((bond, idx) => {
                if (y > pageH - 40) {
                    doc.addPage();
                    y = 20;
                }
                if (idx % 2 === 0) {
                    doc.setFillColor(250, 252, 255);
                    doc.rect(margin, y - 3.5, pageW - margin * 2, 6, 'F');
                }
                const say = this.computeSAYNet(bond);
                const yld = this.computeCurrentYieldNet(bond);
                const profit = ((bond.priceEur ?? bond.price ?? 0) * bond.quantity) - (bond.totalEur ?? 0);
                const row = [
                    bond.isin,
                    bond.issuer,
                    _paToBase(bond.priceEur ?? bond.price ?? 0).toFixed(2),
                    bond.currency,
                    bond.rating,
                    bond.quantity.toFixed(2),
                    _paToBase(bond.totalEur ?? 0).toFixed(2),
                    bond.maturity,
                    yld.toFixed(2),
                    say.toFixed(2),
                    (bond.taxRate ?? 0).toFixed(1),
                    _paToBase(profit).toFixed(2)
                ];
                x = margin;
                row.forEach((val, i) => {
                    doc.setFontSize(6.5);
                    doc.text(String(val), x + colW[i] / 2, y, { align: 'center', maxWidth: colW[i] - 1 });
                    x += colW[i];
                });
                // Profit color indicator
                const profitNum = profit;
                if (profitNum >= 0) doc.setTextColor(46, 125, 50);
                else                doc.setTextColor(198, 40, 40);
                x = margin + colW.slice(0, 11).reduce((a,b) => a + b, 0);
                doc.text(_paToBase(profitNum).toFixed(2), x + colW[11] / 2, y, { align: 'center' });
                doc.setTextColor(0, 0, 0);
                y += 6;
            });

            // ── Statistics summary ──
            y += 4;
            if (y > pageH - 55) { doc.addPage(); y = 20; }

            doc.setFillColor(26, 58, 92);
            doc.rect(margin, y, pageW - margin * 2, 6, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.text('Portfolio Statistics', margin + 3, y + 4);
            y += 10;
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);

            const totalInv = this.portfolio.reduce((s, b) => s + (b.totalEur ?? 0), 0);
            const stats = [
                ['Total Investment', _paFmt(totalInv, 2)],
                ['Bond Count', this.portfolio.length],
                ['Weighted SAY (gross)', document.getElementById('statWeightedSAY')?.textContent ?? '-'],
                ['Weighted SAY (net)',   document.getElementById('statWeightedSAYNet')?.textContent ?? '-'],
                ['Weighted Yield (net)', document.getElementById('statWeightedYieldNet')?.textContent ?? '-'],
                ['Avg Risk (Maturity)',  document.getElementById('statWeightedRisk')?.textContent ?? '-'],
                ['Weighted Rating',      document.getElementById('statWeightedRating')?.textContent ?? '-'],
                ['Total Profit',         document.getElementById('statTotalProfit')?.textContent ?? '-'],
                ['Coupon Income (net)',   document.getElementById('statTotalCouponIncome')?.textContent ?? '-'],
                ['Total Return (lifetime, net)', document.getElementById('statTotalReturn')?.textContent ?? '-'],
            ];
            const statColW = (pageW - margin * 2) / 3;
            stats.forEach((s, i) => {
                const col = i % 3;
                const row = Math.floor(i / 3);
                if (col === 0 && row > 0 && i > 0) y += 0;
                const sx = margin + col * statColW;
                const sy = y + row * 7;
                doc.setFont('helvetica', 'bold');
                doc.text(s[0] + ':', sx, sy);
                doc.setFont('helvetica', 'normal');
                doc.text(String(s[1]), sx + statColW * 0.55, sy);
            });


            // ── Currency Breakdown ──
            const totalRows = Math.ceil(stats.length / 3);
            y += totalRows * 7 + 10;
            if (y > pageH - 40) { doc.addPage(); y = 20; }

            doc.setFillColor(26, 58, 92);
            doc.rect(margin, y, pageW - margin * 2, 6, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.text('Currency Breakdown', margin + 3, y + 4);
            y += 10;
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);

            const totalInvCurr = this.portfolio.reduce((s, b) => s + (b.totalEur ?? 0), 0);
            const byCurrency = {};
            this.portfolio.forEach(b => {
                const cur = b.currency || 'EUR';
                if (!byCurrency[cur]) byCurrency[cur] = 0;
                byCurrency[cur] += (b.totalEur ?? 0);
            });
            let cx = margin;
            Object.entries(byCurrency).sort((a,b) => b[1]-a[1]).forEach(([cur, amt]) => {
                const pct = totalInvCurr > 0 ? (amt / totalInvCurr * 100).toFixed(1) : '0.0';
                doc.setFont('helvetica', 'bold');
                doc.text(cur + ':', cx, y);
                doc.setFont('helvetica', 'normal');
                doc.text(_paSym(_paBaseCcy()) + Math.round(_paToBase(amt)).toLocaleString() + ' (' + pct + '%)', cx + 12, y);
                cx += 55;
                if (cx > pageW - margin - 50) { cx = margin; y += 7; }
            });
            y += 12;

            // ── Dividend Calendar ──
            if (y > pageH - 60) { doc.addPage(); y = 20; }
            doc.setFillColor(26, 58, 92);
            doc.rect(margin, y, pageW - margin * 2, 6, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.text(`Dividend Calendar — Next 12 Months (net coupon income, ${_paBaseCcy()})`, margin + 3, y + 4);
            y += 10;
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'normal');

            // Rebuild month data (same logic as updateDividendCalendar)
            const today2 = new Date();
            const divMonths = [];
            for (let i = 0; i < 12; i++) {
                const d = new Date(today2.getFullYear(), today2.getMonth() + i, 1);
                divMonths.push({ year: d.getFullYear(), month: d.getMonth(), income: 0,
                    label: d.toLocaleString('default', { month: 'short', year: '2-digit' }) });
            }
            this.portfolio.filter(b => b.includeInStatistics).forEach(bond => {
                const matDate = new Date(bond.maturity);
                if (matDate <= today2) return;
                const nominal = bond.nominal || 100;
                const fxRate  = bond.currency !== 'EUR' ? (bond.priceEur / bond.price) : 1;
                const annualNet = (bond.coupon / 100) * nominal * fxRate * bond.quantity * (1 - (bond.taxRate || 0) / 100);
                const freq = bond.couponFrequency || 1;
                const perPayment = annualNet / freq;
                const intervalMonths = Math.round(12 / freq);
                const refMonth = matDate.getMonth();
                const payMonths = new Set();
                for (let i = 0; i < freq; i++) payMonths.add((refMonth - i * intervalMonths + 120) % 12);
                divMonths.forEach(bucket => {
                    if (payMonths.has(bucket.month)) {
                        const bd = new Date(bucket.year, bucket.month + 1, 0);
                        if (bd <= matDate) bucket.income += perPayment;
                    }
                });
            });

            // Draw as bar chart in PDF: month labels + amounts in a grid
            const colW12 = (pageW - margin * 2) / 12;
            const maxIncome = Math.max(...divMonths.map(m => m.income), 1);
            const barMaxH = 18;
            divMonths.forEach((m, i) => {
                const bx = margin + i * colW12;
                const barH = m.income > 0 ? Math.max(2, (m.income / maxIncome) * barMaxH) : 0;
                // bar
                if (barH > 0) {
                    doc.setFillColor(76, 175, 80);
                    doc.rect(bx + 2, y + barMaxH - barH, colW12 - 4, barH, 'F');
                }
                // amount
                doc.setFontSize(6);
                doc.setTextColor(0, 0, 0);
                const amt = Math.round(m.income);
                doc.text(amt > 0 ? _paSym(_paBaseCcy()) + Math.round(_paToBase(amt)) : '—', bx + colW12 / 2, y + barMaxH + 4, { align: 'center' });
                // label
                doc.setFontSize(5.5);
                doc.text(m.label, bx + colW12 / 2, y + barMaxH + 9, { align: 'center' });
            });
            y += barMaxH + 14;

            // ── Maturity Calendar ──
            if (y > pageH - 40) { doc.addPage(); y = 20; }
            doc.setFillColor(26, 58, 92);
            doc.rect(margin, y, pageW - margin * 2, 6, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.text('Maturity Calendar', margin + 3, y + 4);
            y += 10;
            doc.setTextColor(0, 0, 0);

            // Header row
            doc.setFillColor(240, 244, 250);
            doc.rect(margin, y - 4, pageW - margin * 2, 7, 'F');
            doc.setFontSize(7);
            doc.setFont('helvetica', 'bold');
            const matCols = ['Maturity', 'Issuer', 'ISIN', 'Capital Returned', 'Capital Gain'];
            const matColW = [28, 40, 32, 42, 36];
            let mx = margin;
            matCols.forEach((h, i) => { doc.text(h, mx + matColW[i]/2, y, {align:'center'}); mx += matColW[i]; });
            y += 6;

            doc.setFont('helvetica', 'normal');
            const sorted2 = [...this.portfolio.filter(b => b.includeInStatistics)]
                .sort((a,b) => new Date(a.maturity) - new Date(b.maturity));
            // merge same ISIN
            const merged2 = {};
            sorted2.forEach(bond => {
                if (!merged2[bond.isin]) merged2[bond.isin] = {...bond};
                else { merged2[bond.isin].quantity += bond.quantity; merged2[bond.isin].totalEur = (merged2[bond.isin].totalEur||0) + (bond.totalEur||0); }
            });
            Object.values(merged2).sort((a,b) => new Date(a.maturity)-new Date(b.maturity)).forEach((bond, idx) => {
                if (y > pageH - 15) { doc.addPage(); y = 20; }
                const nominal  = bond.nominal || 100;
                const fxRate   = bond.currency !== 'EUR' ? (bond.priceEur / bond.price) : 1;
                const faceEur  = nominal * bond.quantity * fxRate;
                const gain     = faceEur - (bond.totalEur || 0);
                // If bond currency differs from base, prefix capital with native amount
                const _natFace = bond.currency !== _paBaseCcy()
                    ? bond.currency + ' ' + Math.round(nominal * bond.quantity) + ' / '
                    : '';
                const matStr  = new Date(bond.maturity).toLocaleDateString('en-GB', {year:'numeric',month:'short',day:'2-digit'});
                if (idx % 2 === 0) {
                    doc.setFillColor(250,252,255);
                    doc.rect(margin, y-3.5, pageW-margin*2, 6, 'F');
                }
                const _sym2 = _paSym(_paBaseCcy());
                const row2 = [matStr, bond.issuer, bond.isin,
                    _natFace + _sym2 + Math.round(_paToBase(faceEur)).toLocaleString(),
                    (gain >= 0 ? '+' : '') + _sym2 + Math.round(_paToBase(gain)).toLocaleString()];
                mx = margin;
                row2.forEach((val, i) => {
                    doc.setFontSize(6.5);
                    if (i === 4) doc.setTextColor(gain >= 0 ? 46 : 198, gain >= 0 ? 125 : 40, gain >= 0 ? 50 : 40);
                    else         doc.setTextColor(0, 0, 0);
                    doc.text(String(val), mx + matColW[i]/2, y, {align:'center', maxWidth: matColW[i]-1});
                    mx += matColW[i];
                });
                doc.setTextColor(0,0,0);
                y += 6;
            });

            // ── Footer ──
            y += 6;
            doc.setFontSize(7);
            doc.setTextColor(150, 150, 150);
            doc.text('BondFX v6 — Net values reflect withholding tax at source on coupon income only. Capital gains not modelled.',
                margin, pageH - 8);

            doc.save('BondFX-Portfolio-' + new Date().toISOString().slice(0,10) + '.pdf');
        };

        if (window.jspdf) {
            doExport();
        } else {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            script.onload = doExport;
            document.head.appendChild(script);
        }
    }  // end _doExportPDF

    exportPortfolio() {
        const allIds = Object.keys(this.portfolios);
        if (allIds.every(id => this.portfolios[id].bonds.length === 0)) {
            alert('All portfolios are empty');
            return;
        }

        const _exportCcy = _paBaseCcy();
        const _exportRate = _paFxRates[_exportCcy] || 1.0;

        // Save current portfolio into portfolios map before exporting
        if (this.activePortfolioId && this.portfolios[this.activePortfolioId]) {
            this.portfolios[this.activePortfolioId].bonds = this.portfolio;
        }

        let csv = `# BondFX Multi-Portfolio Export | baseCurrency=${_exportCcy} | fxRate=${_exportRate.toFixed(6)} | defaultPortfolio=${this.activePortfolioId}\n`;

        allIds.forEach(id => {
            const pf = this.portfolios[id];
            if (!pf || pf.bonds.length === 0) return;
            // Portfolio header row
            csv += `## PORTFOLIO | id=${id} | name=${JSON.stringify(pf.name)}\n`;
            csv += `ISIN,Issuer,Quantity,Investment ${_exportCcy},Coupon %,Rating,Currency,Maturity,TaxRate %\n`;
            pf.bonds.forEach(bond => {
                const investment = bond.totalEur ?? 0;
                const invBase = _paToBase(investment);
                csv += `${bond.isin},"${bond.issuer}",${bond.quantity},${invBase.toFixed(2)},${bond.coupon},"${bond.rating}",${bond.currency},${bond.maturity},${(bond.taxRate ?? 0).toFixed(1)}\n`;
            });
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `bondfx_portfolios_${_exportCcy}_${new Date().toISOString().slice(0,10)}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }


    importPortfolio(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const csv = e.target.result;
                const allLines = csv.trim().split('\n');

                // ── Detect format ──
                const isMulti = allLines[0].includes('Multi-Portfolio Export');

                if (isMulti) {
                    await this._importMultiPortfolio(allLines);
                } else {
                    await this._importSinglePortfolio(allLines);
                }

                document.getElementById('csvFileInput').value = '';
            } catch (error) {
                alert('Error importing CSV: ' + error.message);
                console.error(error);
            }
        };
        reader.readAsText(file);
    }

    async _importMultiPortfolio(allLines) {
        // Parse metadata from line 0
        const meta0 = allLines[0];
        const ccyMatch    = meta0.match(/baseCurrency=([A-Z]+)/);
        const rateMatch   = meta0.match(/fxRate=([\d.]+)/);
        const defaultMatch = meta0.match(/defaultPortfolio=([a-z0-9_]+)/);
        const csvBaseCcy  = ccyMatch  ? ccyMatch[1]  : 'EUR';
        const csvFxRate   = rateMatch ? parseFloat(rateMatch[1]) : 1.0;
        const defaultId   = defaultMatch ? defaultMatch[1] : null;

        // Split lines into portfolio sections
        const sections = [];
        let current = null;
        for (let i = 1; i < allLines.length; i++) {
            const line = allLines[i].trim();
            if (!line) continue;
            if (line.startsWith('## PORTFOLIO')) {
                if (current) sections.push(current);
                const idMatch   = line.match(/id=([a-z0-9_]+)/);
                const nameMatch = line.match(/name=(.*)/);
                let pfName = 'Imported Portfolio';
                if (nameMatch) {
                    try { pfName = JSON.parse(nameMatch[1].trim()); } catch(e) { pfName = nameMatch[1].trim(); }
                }
                current = { id: idMatch ? idMatch[1] : this._genId(), name: pfName, lines: [] };
            } else if (current) {
                current.lines.push(line);
            }
        }
        if (current) sections.push(current);

        if (sections.length === 0) {
            alert('No portfolio sections found in CSV');
            return;
        }

        const currentCcy  = _paBaseCcy();
        const currentRate = _paFxRates[currentCcy] || 1.0;

        const statusEl = document.getElementById('portfolioRefreshStatus') || { textContent: '' };
        if (statusEl) statusEl.textContent = `⟳ Importing ${sections.length} portfolio(s)…`;

        const newPortfolios = {};
        let totalImported = 0;
        const allNotFound = [];

        for (const section of sections) {
            const rows = this._parseCSVRows(section.lines, csvFxRate);
            const { imported, notFound } = await this._fetchBondsForRows(rows, statusEl);
            newPortfolios[section.id] = { name: section.name, bonds: imported };
            totalImported += imported.length;
            allNotFound.push(...notFound);
        }

        if (statusEl) statusEl.textContent = '';

        // Replace all portfolios with imported ones
        this.portfolios = newPortfolios;

        // Set default portfolio: use CSV default if valid, else first
        if (defaultId && newPortfolios[defaultId]) {
            this.activePortfolioId = defaultId;
        } else {
            this.activePortfolioId = Object.keys(newPortfolios)[0];
        }
        this.portfolio = this.portfolios[this.activePortfolioId].bonds;
        this._saveAllPortfolios();
        this._renderPortfolioSwitcher();
        this.updatePortfolioTable();
        this.updateStatistics();

        let msg = `✅ Imported ${sections.length} portfolio(s) with ${totalImported} bond(s) total.\nActive: "${this.portfolios[this.activePortfolioId].name}"`;
        if (allNotFound.length > 0) msg += `\n\n⚠️ Not found: ${allNotFound.join(', ')}`;
        alert(msg);
    }

    async _importSinglePortfolio(allLines) {
        // Legacy single-portfolio import: replaces ONLY current portfolio
        let csvBaseCcy = 'EUR';
        let csvFxRate  = 1.0;
        let dataStart  = 0;
        if (allLines[0].startsWith('#')) {
            const meta = allLines[0];
            const ccyMatch  = meta.match(/baseCurrency=([A-Z]+)/);
            const rateMatch = meta.match(/fxRate=([\d.]+)/);
            if (ccyMatch)  csvBaseCcy = ccyMatch[1];
            if (rateMatch) csvFxRate  = parseFloat(rateMatch[1]);
            dataStart = 1;
        }

        const lines = allLines.slice(dataStart);
        if (lines.length < 2) { alert('Invalid CSV format'); return; }

        const rows = this._parseCSVRows(lines, csvFxRate);
        if (rows.length === 0) { alert('No valid rows found in CSV'); return; }

        const statusEl = document.getElementById('portfolioRefreshStatus') || { textContent: '' };
        if (statusEl) statusEl.textContent = `⟳ Fetching live data for ${rows.length} bonds…`;

        const { imported, notFound, priceChanges } = await this._fetchBondsForRows(rows, statusEl, this.portfolio);
        if (statusEl) statusEl.textContent = '';

        if (imported.length === 0) { alert('No bonds found — ISINs may not be in today\'s scrape'); return; }

        // Replace current portfolio only
        this.portfolio = imported;
        if (this.activePortfolioId && this.portfolios[this.activePortfolioId]) {
            this.portfolios[this.activePortfolioId].bonds = this.portfolio;
        }
        this.savePortfolio();
        this.updatePortfolioTable();
        this.updateStatistics();

        let message = `✅ Imported ${imported.length} bond(s) with live data!`;
        if (priceChanges && priceChanges.length > 0) {
            message += `\n\n📊 Price changes since last import:`;
            priceChanges.forEach(c => {
                const sign = c.change > 0 ? '+' : '';
                message += `\n${c.isin}: €${c.oldPrice.toFixed(2)} → €${c.newPrice.toFixed(2)} (${sign}€${c.change.toFixed(2)})`;
            });
        }
        if (notFound.length > 0) message += `\n\n⚠️ Not found: ${notFound.join(', ')}`;
        alert(message);
    }

    _parseCSVRows(lines, csvFxRate) {
        // Skip the header line (ISIN,Issuer,...)
        const dataLines = lines.filter(l => l && !l.startsWith('ISIN,') && !l.startsWith('#'));
        const rows = [];
        for (const line of dataLines) {
            const parts = this.parseCSVLine(line);
            if (parts.length < 3) continue;
            const isin     = parts[0].trim();
            const quantity = parseFloat(parts[2]) || 0;
            const rawInvest = parseFloat((parts[3] || '0').replace(/[^\d.-]/g, '')) || 0;
            const totalEur  = rawInvest / csvFxRate;
            const taxRate   = parseFloat(parts[8]) || null;
            if (isin && quantity > 0) rows.push({ isin, quantity, totalEur, taxRate });
        }
        return rows;
    }

    async _fetchBondsForRows(rows, statusEl, existingPortfolio = []) {
        const imported = [];
        const notFound = [];
        const priceChanges = [];

        for (const row of rows) {
            try {
                const res = await fetch(`/api/bond/${encodeURIComponent(row.isin)}`);
                if (res.status === 404) { notFound.push(row.isin); continue; }
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const bond = await res.json();

                const existing = existingPortfolio.find(b => b.isin === row.isin);
                if (existing && Math.abs(existing.priceEur - bond.priceEur) > 0.01) {
                    priceChanges.push({ isin: row.isin, oldPrice: existing.priceEur, newPrice: bond.priceEur, change: bond.priceEur - existing.priceEur });
                }
                imported.push({ ...bond, quantity: row.quantity, totalEur: row.totalEur, taxRate: row.taxRate !== null ? row.taxRate : bond.taxRate, includeInStatistics: true });
            } catch (err) {
                console.warn(`Failed to fetch ${row.isin}:`, err);
                notFound.push(row.isin);
            }
        }
        return { imported, notFound, priceChanges };
    }

    parseCSVLine(line) {
        const result = [];
        let current = '';
        let insideQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                insideQuotes = !insideQuotes;
                current += char;
            } else if (char === ',' && !insideQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current);
        return result;
    }

    clearPortfolio() {
        if (confirm('Clear entire portfolio?')) {
            this.portfolio = [];
            this.savePortfolio();
            this.updatePortfolioTable();
            this.updateStatistics();
        }
    }

    clearSearch() {
        document.getElementById('isinSearch').value = '';
        document.getElementById('searchResults').innerHTML = '';
        document.getElementById('addBondForm').style.display = 'none';
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.portfolioAnalyzer = new PortfolioAnalyzer();

    function _paMobileLabels() {
        const isMobile = window.innerWidth <= 768;
        document.querySelectorAll('.analyzer-header__back, .analyzer-header__cg-btn').forEach(btn => {
            if (!btn.dataset.full) btn.dataset.full = btn.lastChild.textContent.trim();
            btn.lastChild.textContent = ' ' + (isMobile ? btn.dataset.short : btn.dataset.full);
        });
    }
    _paMobileLabels();
    window.addEventListener('resize', _paMobileLabels);

    // If running as standalone /analyzer page, auto-init with basket from localStorage
    // Load FX rates then apply base currency UI + init view
    _paLoadFxRates().then(() => {
        _paApplyBaseCurrencyUI();
        if (window.location.pathname === '/analyzer') {
            try {
                const basket = JSON.parse(localStorage.getItem('bondBasket') || '[]');
                window.portfolioAnalyzer._initView(basket);
            } catch(e) {
                window.portfolioAnalyzer._initView([]);
            }
        }
    });
});

// React to base currency changes made from the home page (cross-tab via localStorage)
window.addEventListener('storage', (e) => {
    if (e.key === 'bondBaseCurrency') {
        _paApplyBaseCurrencyUI();
        if (window.portfolioAnalyzer) {
            window.portfolioAnalyzer.updatePortfolioTable();
            window.portfolioAnalyzer.updateStatistics();
            window.portfolioAnalyzer.updateCalendars();
        }
    }
});