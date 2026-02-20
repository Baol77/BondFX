<div id="portfolioModal" class="portfolio-modal">
    <div id="modalContent" class="portfolio-modal-content">

        <div id="modalHeader" class="portfolio-modal-header">
            <h2>🎯 Portfolio Analyzer</h2>
            <button onclick="window.portfolioAnalyzer.closeModal()" class="portfolio-modal-close-btn">&times;</button>
        </div>

        <div class="portfolio-modal-body">

            <div class="search-section">
                <h3>1️⃣ Search & Add Bond</h3>
                <div class="search-bar">
                    <input type="text"
                           id="isinSearch"
                           placeholder="Search ISIN, issuer or coupon (e.g. XS 3%, Romania 2.5)"
                           onkeyup="window.portfolioAnalyzer.searchBond()"
                           class="search-input">
                    <div id="searchResults" class="search-results"></div>
                </div>
            </div>

            <div id="addBondForm" class="add-bond-form">
                <h4>Bond Details</h4>

                <div id="bondDetails" class="bond-details-box">
                </div>

                <div class="input-grid">
                    <div class="input-column">
                        <label class="input-label">
                            Total Investment (€):
                            <input type="number" id="amount" min="0" step="1" class="form-input">
                        </label>

                        <label id="originalCurrencyWrapper" class="input-label" style="display:none;">
                            <span>Total Investment (<span id="originalCurrencyLabel"></span>)</span>
                            <input type="number" id="amountOriginal" min="0.01" step="0.01" class="form-input">
                        </label>
                    </div>

                    <div class="input-column">
                        <label class="input-label">
                            Quantity:
                            <label id="quantity" class="form-input"></label>
                        </label>
                    </div>
                </div>

                <button onclick="window.portfolioAnalyzer.addBondToPortfolio()" class="btn btn-add">
                    ➕ Add to Portfolio
                </button>
            </div>


            <div class="portfolio-table-wrapper">
                <h3>2️⃣ Your Portfolio</h3>
                <div style="overflow-x:auto;">
                    <table id="portfolioTable" class="portfolio-table">
                        <thead>
                        <tr>
                            <th>ISIN</th>
                            <th>Issuer</th>
                            <th>Price</th>
                            <th>Currency</th>
                            <th>Rating</th>
                            <th>Qty</th>
                            <th>Investment</th>
                            <th>Maturity</th>
                            <th>Curr. Yield</th>
                            <th>SAY</th>
                            <th>Profit (€)</th>
                            <th>
                                <div class="portfolio-table-header-flex" title="Toggle to include/exclude all bonds">
                                    <span>Σ</span>
                                    <input type="checkbox" id="toggleAllStatistics" checked
                                           onchange="window.portfolioAnalyzer.toggleAllStatistics(this.checked)">
                                </div>
                            </th>
                            <th>Action</th>
                        </tr>
                        </thead>
                        <tbody id="portfolioTableBody">
                        </tbody>
                    </table>
                </div>
                <p id="emptyPortfolioMsg" class="empty-portfolio-msg">Portfolio is empty. Add bonds above.</p>
            </div>

            <div style="margin-bottom:30px;">
                <h3>3️⃣ Portfolio Statistics</h3>

                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-label">Total Init. Investment</div>
                        <p id="statTotalInvestment" class="stat-value">€0.00</p>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Avg Price</div>
                        <p id="statAvgPrice" class="stat-value">€0.00</p>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Weighted SAY</div>
                        <p id="statWeightedSAY" class="stat-value">0.00%</p>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Weighted Yield</div>
                        <p id="statWeightedYield" class="stat-value">0.00%</p>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Avg Coupon</div>
                        <p id="statAvgCoupon" class="stat-value">0.00%</p>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Bond Count</div>
                        <p id="statBondCount" class="stat-value">0</p>
                    </div>

                    <div class="stat-card orange">
                        <div class="stat-label">Avg Risk (Maturity)</div>
                        <p id="statWeightedRisk" class="stat-value">0.00 yrs</p>
                    </div>

                    <div class="stat-card purple">
                        <div class="stat-label">Weighted Rating</div>
                        <p id="statWeightedRating" class="stat-value">-</p>
                    </div>

                    <div class="stat-card green">
                        <div class="stat-label">Total Profit</div>
                        <p id="statTotalProfit" class="stat-value">€0.00</p>
                    </div>

                    <div class="stat-card deep-purple">
                        <div class="stat-label">Coupon Income (Current Year)</div>
                        <p id="statTotalCouponIncome" class="stat-value">€0.00</p>
                    </div>
                </div>

                <div style="margin-top:20px;">
                    <h4 style="margin-top:0;margin-bottom:10px;">Currency Breakdown (by Investment %)</h4>
                    <div id="currencyBreakdown" class="currency-breakdown">
                    </div>
                </div>
            </div>

            <div class="actions-footer">
                <button onclick="window.portfolioAnalyzer.exportPortfolio()" class="btn btn-export">
                    📥 Export CSV
                </button>

                <button onclick="document.getElementById('csvFileInput').click()" class="btn btn-import">
                    📤 Import CSV
                </button>
                <input type="file" id="csvFileInput" accept=".csv" style="display:none;"
                       onchange="window.portfolioAnalyzer.importPortfolio(event)">

                <button onclick="window.portfolioAnalyzer.clearPortfolio()" class="btn btn-clear">
                    🗑️ Clear Portfolio
                </button>
            </div>

        </div>
    </div>
</div>