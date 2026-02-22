<div id="portfolioModal" class="portfolio-modal">
    <div id="modalContent" class="portfolio-modal-content">

        <div id="modalHeader" class="portfolio-modal-header">
            <h2>🎯 Portfolio Analyzer</h2>
            <button onclick="window.portfolioAnalyzer.closeModal()" class="portfolio-modal-close-btn">&times;</button>
        </div>

        <div class="portfolio-modal-body">

            <!-- Basket labels — populated by openModalWithBasket() -->
            <div id="basketLabels" class="basket-labels" style="display:none"></div>

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

                <div id="bondDetails" class="bond-details-box"></div>

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
                            <input type="number" id="quantity" min="0.01" step="0.01" class="form-input" placeholder="auto">
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
                            <th style="text-align:center;">Issuer</th>
                            <th style="text-align:center;">Price (€)</th>
                            <th style="text-align:center;">Currency</th>
                            <th style="text-align:center;">Rating</th>
                            <th style="text-align:center;">Qty</th>
                            <th style="text-align:center;">Invest.(€)</th>
                            <th style="text-align:center;">Maturity</th>
                            <th style="text-align:center;">Yield (net%)</th>
                            <th style="text-align:center;">SAY (net%)</th>
                            <th style="text-align:center;" title="Withholding tax at source. Editable per bond.">Tax %</th>
                            <th style="text-align:center;">Profit (€)</th>
                            <th style="text-align:center;">
                                <div class="portfolio-table-header-flex" title="Toggle to include/exclude all bonds">
                                    <span>Σ</span>
                                    <input type="checkbox" id="toggleAllStatistics" checked
                                           onchange="window.portfolioAnalyzer.toggleAllStatistics(this.checked)">
                                </div>
                            </th>
                            <th style="text-align:center;">Action</th>
                        </tr>
                        </thead>
                        <tbody id="portfolioTableBody"></tbody>
                    </table>
                </div>
                <p id="emptyPortfolioMsg" class="empty-portfolio-msg">Portfolio is empty. Add bonds above.</p>
            </div>

            <div style="margin-bottom:30px;">
                <h3>3️⃣ Portfolio Statistics</h3>

                <div class="stats-grid">
                    <div id="card-totalInvestment" class="stat-card stat-neutral">
                        <div class="stat-label">Total Init. Investment</div>
                        <p id="statTotalInvestment" class="stat-value">€0.00</p>
                    </div>
                    <div id="card-avgPrice" class="stat-card stat-neutral">
                        <div class="stat-label">Avg Price</div>
                        <p id="statAvgPrice" class="stat-value">€0.00</p>
                    </div>
                    <div id="card-weightedSAY" class="stat-card stat-neutral">
                        <div class="stat-label">Weighted SAY (gross)</div>
                        <p id="statWeightedSAY" class="stat-value">0.00%</p>
                    </div>
                    <div id="card-weightedSAYNet" class="stat-card stat-neutral">
                        <div class="stat-label">Weighted SAY (net)</div>
                        <p id="statWeightedSAYNet" class="stat-value">0.00%</p>
                    </div>
                    <div id="card-weightedYield" class="stat-card stat-neutral">
                        <div class="stat-label">Weighted Yield (gross)</div>
                        <p id="statWeightedYield" class="stat-value">0.00%</p>
                    </div>
                    <div id="card-weightedYieldNet" class="stat-card stat-neutral">
                        <div class="stat-label">Weighted Yield (net)</div>
                        <p id="statWeightedYieldNet" class="stat-value">0.00%</p>
                    </div>
                    <div id="card-avgCoupon" class="stat-card stat-neutral">
                        <div class="stat-label">Avg Coupon</div>
                        <p id="statAvgCoupon" class="stat-value">0.00%</p>
                    </div>
                    <div id="card-bondCount" class="stat-card stat-neutral">
                        <div class="stat-label">Bond Count</div>
                        <p id="statBondCount" class="stat-value">0</p>
                    </div>
                    <div id="card-weightedRisk" class="stat-card stat-neutral">
                        <div class="stat-label">Avg Risk (Maturity)</div>
                        <p id="statWeightedRisk" class="stat-value">0.00 yrs</p>
                    </div>
                    <div id="card-weightedRating" class="stat-card stat-neutral">
                        <div class="stat-label">Weighted Rating</div>
                        <p id="statWeightedRating" class="stat-value">-</p>
                    </div>
                    <div id="card-totalProfit" class="stat-card stat-neutral">
                        <div class="stat-label">Total Profit</div>
                        <p id="statTotalProfit" class="stat-value">€0.00</p>
                    </div>
                    <div id="card-couponIncome" class="stat-card stat-neutral">
                        <div class="stat-label">Coupon Income (Current Year, net)</div>
                        <p id="statTotalCouponIncome" class="stat-value">€0.00</p>
                    </div>
                </div>

                <p style="font-size:11px;color:#999;margin:8px 0 0;">
                    ⚠️ Net values reflect withholding tax at source on coupon income only.
                    Capital gains taxation depends on your country of residence and is not modelled here.
                    Default rates are configured in <code>tax-rates.yaml</code> and can be overridden per bond.
                </p>

                <div style="margin-top:20px;">
                    <h4 style="margin-top:0;margin-bottom:10px;">Currency Breakdown (by Investment %)</h4>
                    <div id="currencyBreakdown" class="currency-breakdown"></div>
                </div>
            </div>

            <!-- 4️⃣ DIVIDEND CALENDAR -->
            <div style="margin-bottom:30px;">
                <h3>4️⃣ Dividend Calendar — Next 12 Months</h3>
                <p style="font-size:12px;color:#888;margin:0 0 10px;">Estimated coupon income per month (EUR equivalent). Assumes semi-annual coupons paid at coupon date each year.</p>
                <div id="dividendCalendar" class="calendar-grid"></div>
            </div>

            <!-- 5️⃣ MATURITY CALENDAR -->
            <div style="margin-bottom:30px;">
                <h3>5️⃣ Maturity Calendar</h3>
                <p style="font-size:12px;color:#888;margin:0 0 10px;">Capital returned at maturity per bond. Non-EUR bonds shown in original currency.</p>
                <div id="maturityCalendar" class="maturity-list"></div>
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
