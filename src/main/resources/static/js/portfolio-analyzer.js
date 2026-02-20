// Portfolio Analyzer - Client-Side Portfolio Management
// Fixed version: draggable modal, CSV import/export, corrected weighted calculations
// Embedded in FreeMarker template via <#include "portfolio-analyzer.js" parse=false>
// No backend required - uses browser localStorage

class PortfolioAnalyzer {
    constructor() {
        this.portfolio = [];
        this.modal = null;
        this.currentBond = null;
        this.highlightedIndex = -1;
        this.currentMatches = [];
        this.init();
    }

    init() {
        // Load saved portfolio from localStorage
        const saved = localStorage.getItem('bondPortfolio');
        if (saved) {
            try {
                this.portfolio = JSON.parse(saved);
            } catch (e) {
                console.warn('Failed to load portfolio:', e);
                this.portfolio = [];
            }
        }

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
        if (this.modal) {
            this.modal.classList.add('open');
            this.updatePortfolioTable();
            this.updateStatistics();
            document.getElementById('searchResults').style.display = "none";
        }
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

    showAddBondForm(bond) {
        this.currentBond = bond;

        const detailsDiv = document.getElementById('bondDetails');
        detailsDiv.innerHTML = `
            <strong>${bond.issuer}</strong><br>
            ISIN: <i>${bond.isin}</i><br>
            Maturity: <i>${bond.maturity}</i><br>
            Price: <i>${bond.currency} ${bond.price.toFixed(2)}${bond.currency !== 'EUR' ? ` (€ ${bond.priceEur.toFixed(2)})` : ''}</i><br>
            Rating: <i>${bond.rating}</i> | Coupon: <i>${bond.coupon.toFixed(2)}%</i> | SAY: <i>${bond.say.toFixed(2)}%</i>
        `;

        // Reset fields
        document.getElementById('quantity').innerText = '0';
        document.getElementById('amount').value = '';

        const originalWrapper = document.getElementById('originalCurrencyWrapper');
        const originalLabel = document.getElementById('originalCurrencyLabel');
        const originalInput = document.getElementById('amountOriginal');

        if (bond.currency === 'EUR') {
            originalWrapper.style.display = 'none';
            originalInput.value = '';
        } else {
            originalWrapper.style.display = 'flex';
            originalLabel.textContent = bond.currency;
            originalInput.value = '';
        }

        // Update displayed total live (only EUR total shown)
        document.getElementById('amount').addEventListener('input', () => {
            const eur = parseFloat(document.getElementById('amount').value.replace(",",".")) || 0;
            this.updateGrossQuantity();
        });

       // Call alignment logic
       this.alignTotalAmounts();

       document.getElementById('addBondForm').style.display = 'block';
    }

    alignTotalAmounts() {
        if (!this.currentBond) return;

        const eurInput = document.getElementById('amount');
        const originalInput = document.getElementById('amountOriginal');

        if (!eurInput) return;

        const bond = this.currentBond;

        // If EUR bond → only update total display
        if (bond.currency === 'EUR') {
            eurInput.oninput = () => {
                const eur = parseFloat(eurInput.value) || 0;
                 this.updateGrossQuantity();
            };
            return;
        }

        const fxRate = bond.priceEur / bond.price;

        // EUR → Original
        eurInput.oninput = () => {
            const eur = parseFloat(eurInput.value) || 0;
            const original = eur / fxRate;

            originalInput.value = original.toFixed(2);

            this.updateGrossQuantity();
        };

        // Original → EUR
        originalInput.oninput = () => {
            const original = parseFloat(originalInput.value) || 0;
            const eur = original * fxRate;

            eurInput.value = eur.toFixed(2);

            this.updateGrossQuantity();
        };
    }

    updateGrossQuantity() {
        if (!this.currentBond) return;

        const eurInput = document.getElementById('amount');
        const grossInfo = document.getElementById('quantity');

        const eur = parseFloat(eurInput.value) || 0;

        if (eur === 0) {
            grossInfo.innerText = '0';
            return;
        }

        const grossQty = eur / this.currentBond.priceEur;

        grossInfo.innerText = `${grossQty.toFixed(2)}`;
    }

    addBondToPortfolio() {
        if (!this.currentBond) return;

        const qty = parseFloat(document.getElementById('quantity').innerText.replace(",",".")) || 1;

        // Get invested EUR
        const totalEur = parseFloat(
            document.getElementById('amount')
                .value
                .replace(/[^\d.-]/g, '')
        ) || 0;

        // Get original currency total (if exists)
        const totalOriginalField = document.getElementById('totalOriginal');
        const totalOriginal = totalOriginalField
            ? parseFloat(totalOriginalField.value) || 0
            : totalEur;

        // Keep it simple
        this.portfolio.push({
            ...this.currentBond,
            quantity: qty,
            totalEur: totalEur,
            totalOriginal: totalOriginal,
            includeInStatistics: true
        });

        this.savePortfolio();
        this.updatePortfolioTable();
        this.updateStatistics();

        document.getElementById('isinSearch').value = '';
        document.getElementById('addBondForm').style.display = 'none';
        document.getElementById('searchResults').innerHTML = '';

        this.currentBond = null;

        alert(`✅ Bond added! Quantity added: ${qty}`);
    }

    removeBond(index) {
        this.portfolio.splice(index, 1);
        this.savePortfolio();
        this.updatePortfolioTable();
        this.updateStatistics();
    }

    updateQuantityInPortfolio(index, newQuantity) {
        const qty = parseFloat(newQuantity);

        if (isNaN(qty) || qty < 1) {
            alert('Quantity must be at least 1');
            this.updatePortfolioTable();
            return;
        }

        const bond = this.portfolio[index];

        // Calculate unit cost BEFORE changing quantity
        const unitCost = bond.totalEur / bond.quantity;

        // Update quantity
        bond.quantity = qty;

        // Scale invested proportionally
        bond.totalEur = unitCost * qty;

        this.savePortfolio();
        this.updatePortfolioTable();
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
             New Avg Cost: €${weightedAvgPrice.toFixed(2)}`
        );
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

            return `<tr style="border-bottom:1px solid #eee;">
                <td>${bond.isin}</td>
                <td>${bond.issuer}</td>
                <td>€${bond.priceEur.toFixed(2)}</td>
                <td>${bond.currency}</td>
                <td>${bond.rating}</td>
                <td>
                    <input type="number"
                           value="${bond.quantity}"
                           min="0.01"
                           step="0.01"
                           onchange="window.portfolioAnalyzer.updateQuantityInPortfolio(${idx}, this.value)"
                           style="width:45px;padding:4px;font-size:12px;">
                </td>

                <td>€${(bond.totalEur ?? 0).toFixed(2)}</td>
                <td style="white-space: nowrap;">${bond.maturity}</td>
                <td>${bond.currentYield.toFixed(2)}%</td>
                <td>${bond.say.toFixed(2)}%</td>
                <td class="${gainLoss >= 0 ? 'good' : 'bad'}">
                    ${gainLoss}
                </td>
                <td>
                    <input type="checkbox" title="Toggle to include/exclude this bond from statistics calculations"
                           ${bond.includeInStatistics ? 'checked' : ''}
                           onchange="window.portfolioAnalyzer.toggleStatistics(${idx})">
                </td>
                <td>
                   <div style="display:flex;justify-content:flex-end;align-items:center;gap:10px;width:100%;">
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

    updateStatistics() {
        if (this.portfolio.length === 0) {
            document.getElementById('statTotalInvestment').textContent = '€0.00';
            document.getElementById('statAvgPrice').textContent = '€0.00';
            document.getElementById('statWeightedSAY').textContent = '0.00%';
            document.getElementById('statWeightedYield').textContent = '0.00%';
            document.getElementById('statAvgCoupon').textContent = '0.00%';
            document.getElementById('statBondCount').textContent = '0';
            document.getElementById('statWeightedRisk').textContent = '0.00 yrs';
            document.getElementById('statWeightedRating').textContent = '-';
            document.getElementById('currencyBreakdown').innerHTML = '';
            document.getElementById('statTotalProfit').textContent = '€0';
            document.getElementById('statTotalCouponIncome').textContent = '€0.00';
            return;
        }

        let totalInvestment = 0;
        let totalInvestment1 = 0;
        let weightedSAY = 0;
        let weightedYield = 0;
        let weightedCoupon = 0;
        let weightedRisk = 0;
        let currencyTotals = {}; // Track investment by currency
        let totalProfit = 0;
        let totalCouponIncome = 0;

        const bonds = this.portfolio.filter(b => b.includeInStatistics);
        bonds.forEach(bond => {

            const currentValue = bond.priceEur * bond.quantity;   // market value
            const investedAmount = bond.totalEur || 0;            // what you paid

            totalInvestment += investedAmount;
            totalInvestment1 += currentValue;

            weightedSAY += (bond.say * currentValue);
            weightedYield += (bond.currentYield * currentValue);
            weightedCoupon += (bond.coupon * currentValue);

            // TOTAL PROFIT (correct now)
            totalProfit += (currentValue - investedAmount);

            // TOTAL COUPON INCOME (ANNUAL, IN EUR)
            const nominal = bond.nominal || 100;
            const annualCouponOriginal = (bond.coupon / 100) * nominal * bond.quantity;

            const annualCouponEur = bond.currency === 'EUR'
                ? annualCouponOriginal
                : annualCouponOriginal * (bond.priceEur / bond.price);

            totalCouponIncome += annualCouponEur;

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

        const weightedSAYPercent = (weightedSAY / totalInvestment1);
        const weightedYieldPercent = (weightedYield / totalInvestment1);
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
        document.getElementById('statTotalInvestment').textContent = `€${totalInvestment}`;
        document.getElementById('statAvgPrice').textContent = `€${avgPrice.toFixed(2)}`;
        document.getElementById('statWeightedSAY').textContent = `${weightedSAYPercent.toFixed(2)}%`;
        document.getElementById('statWeightedYield').textContent = `${weightedYieldPercent.toFixed(2)}%`;
        document.getElementById('statAvgCoupon').textContent = `${weightedCouponPercent.toFixed(2)}%`;
        const uniqueISINs = new Set(bonds.map(b => b.isin));
        document.getElementById('statBondCount').textContent = uniqueISINs.size;
        document.getElementById('statWeightedRisk').textContent = `${weightedRiskYears.toFixed(2)} yrs`;
        document.getElementById('statWeightedRating').textContent = weightedRating;

        // Total Profit
        totalProfit = Math.round(totalProfit);
        const profitElement = document.getElementById('statTotalProfit');
        if (profitElement) {
            profitElement.textContent = `€${totalProfit}`;
            profitElement.style.color = totalProfit >= 0 ? '#4CAF50' : '#f44336';
        }

        // Total Coupon Income (Current Year)
        totalCouponIncome = Math.round(totalCouponIncome);
        const couponElement = document.getElementById('statTotalCouponIncome');
        if (couponElement) {
            couponElement.textContent = `€${totalCouponIncome}`;
        }

        // Display currency breakdown
        this.updateCurrencyBreakdown(currencyTotals, totalInvestment1);
    }

    updateCurrencyBreakdown(currencyTotals, totalInvestment) {
        const breakdown = document.getElementById('currencyBreakdown');
        const currencies = Object.keys(currencyTotals).sort();

        breakdown.innerHTML = currencies.map(currency => {
            const amount = Math.round(currencyTotals[currency]);
            const percentage = Math.round((amount / totalInvestment * 100));
            return `
                <div style="background:white;padding:10px;border-radius:4px;border-left:4px solid #4CAF50;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
                    <div style="font-size:11px;color:#666;font-weight:600;margin-bottom:6px;">${currency}</div>
                    <p style="margin:0;font-size:14px;font-weight:bold;color:#4CAF50;">${percentage}%</p>
                    <p style="margin:5px 0 0 0;font-size:11px;color:#999;">€${amount}</p>
                </div>
            `;
        }).join('');
    }

    savePortfolio() {
        localStorage.setItem('bondPortfolio', JSON.stringify(this.portfolio));
    }

    exportPortfolio() {
        if (this.portfolio.length === 0) {
            alert('Portfolio is empty');
            return;
        }

        // New reduced header
        let csv = 'ISIN,Issuer,Quantity,Investment EUR,Coupon %,Rating,Currency,Maturity\n';

        this.portfolio.forEach(bond => {
            const investment = bond.totalEur ?? 0;

            csv += `${bond.isin},"${bond.issuer}",${bond.quantity},${investment.toFixed(2)},${bond.coupon},"${bond.rating}",${bond.currency},${bond.maturity}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'portfolio.csv');
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
                const lines = csv.trim().split('\n');

                if (lines.length < 2) {
                    alert('Invalid CSV format');
                    return;
                }

                // Parse CSV rows into { isin, quantity, totalEur } entries
                const rows = [];
                for (let i = 1; i < lines.length; i++) {
                    const parts = this.parseCSVLine(lines[i]);
                    if (parts.length < 3) continue;
                    const isin     = parts[0].trim();
                    const quantity = parseFloat(parts[2]) || 0;
                    const totalEur = parseFloat((parts[3] || '0').replace(/[^\d.-]/g, '')) || 0;
                    if (isin && quantity > 0) rows.push({ isin, quantity, totalEur });
                }

                if (rows.length === 0) {
                    alert('No valid rows found in CSV');
                    return;
                }

                // Fetch fresh Java-calculated data for each ISIN
                const imported   = [];
                const notFound   = [];
                const priceChanges = [];

                // Show progress feedback
                const statusEl = document.getElementById('portfolioRefreshStatus') ||
                                 { textContent: '' };
                if (statusEl) statusEl.textContent = `⟳ Fetching live data for ${rows.length} bonds…`;

                for (const row of rows) {
                    try {
                        const res = await fetch(`/api/bond/${encodeURIComponent(row.isin)}`);
                        if (res.status === 404) {
                            notFound.push(row.isin);
                            continue;
                        }
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);

                        const bond = await res.json();

                        // Check if already in portfolio — compare old vs new price
                        const existing = this.portfolio.find(b => b.isin === row.isin);
                        if (existing && Math.abs(existing.priceEur - bond.priceEur) > 0.01) {
                            priceChanges.push({
                                isin: row.isin,
                                oldPrice: existing.priceEur,
                                newPrice: bond.priceEur,
                                change: bond.priceEur - existing.priceEur
                            });
                        }

                        imported.push({
                            ...bond,
                            quantity: row.quantity,
                            totalEur: row.totalEur,
                            includeInStatistics: true
                        });
                    } catch (err) {
                        console.warn(`Failed to fetch ${row.isin}:`, err);
                        notFound.push(row.isin);
                    }
                }

                if (statusEl) statusEl.textContent = '';

                if (imported.length === 0) {
                    alert('No bonds found — ISINs may not be in today\'s scrape');
                    return;
                }

                // Append imported bonds (do NOT replace existing ones)
                imported.forEach(bond => this.portfolio.push(bond));
                this.savePortfolio();
                this.updatePortfolioTable();
                this.updateStatistics();

                // Summary message
                let message = `✅ Imported ${imported.length} bond(s) with live Java data!`;

                if (priceChanges.length > 0) {
                    message += `\n\n📊 Price changes since last import:`;
                    priceChanges.forEach(c => {
                        const sign = c.change > 0 ? '+' : '';
                        message += `\n${c.isin}: €${c.oldPrice.toFixed(2)} → €${c.newPrice.toFixed(2)} (${sign}€${c.change.toFixed(2)})`;
                    });
                }

                if (notFound.length > 0) {
                    message += `\n\n⚠️ Not found in today's scrape: ${notFound.join(', ')}`;
                }

                alert(message);
                document.getElementById('csvFileInput').value = '';

            } catch (error) {
                alert('Error importing CSV: ' + error.message);
                console.error(error);
            }
        };
        reader.readAsText(file);
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
});