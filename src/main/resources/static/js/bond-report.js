/* =======================
   COLUMN MAPPING
======================= */
const COL = {
    ADD: 0,       // ➕ basket button column
    ISIN: 1,
    ISSUER: 2,
    PRICE: 3,
    CURRENCY: 4,
    RATING: 5,
    PRICE_R: 6,
    COUPON: 7,
    MATURITY: 8,
    CURR_YIELD: 9,
    CAPITAL_AT_MAT: 10,
    SAY: 11
};

/* =======================
   RATING HIERARCHY (for minimum rating filtering)
======================= */
const RATING_RANK = {
    "AAA": 10,
    "AA+": 9,
    "AA": 8,
    "AA-": 7,
    "A+": 6,
    "A": 5,
    "A-": 4,
    "BBB+": 3,
    "BBB": 2,
    "BBB-": 1,
    "BB+": 0,
    "BB": -1,
    "BB-": -2,
    "B+": -3,
    "B": -4,
    "B-": -5,
    "CCC": -6,
    "CC": -7,
    "C": -8,
    "D": -9
};

/* =======================
   GLOBAL STATE
======================= */
let currentSortCol = COL.SAY;
let currentSortDir = "desc";
let currentMode = "say"; // "say" or "income"
let customProfileIds = []; // Track custom profile IDs for highlighting

/* =======================
   UTILITY FUNCTIONS
======================= */
function parseValue(v) {
    v = v.replace(/[€CHF%]/g, "").replace(",", ".").trim();
    const n = parseFloat(v);
    return isNaN(n) ? v : n;
}

function parseNum(s) {
    return parseFloat(s.replace(",", "."));
}

/* =======================
   SORTING
======================= */
function sortTable(col, initial) {
    const table = document.getElementById("bondTable");
    const tbody = table.tBodies[0];
    const rows = Array.from(tbody.rows);

    const ths = table.tHead.rows[0].cells;
    let dir = "desc";  // Changed default from "asc" to "desc"

    if (!initial && col === currentSortCol) {
        dir = currentSortDir === "asc" ? "desc" : "asc";
    } else if (initial) {
        dir = currentSortDir;
    } else {
        dir = "desc";
    }

    currentSortCol = col;
    currentSortDir = dir;

    Array.from(ths).forEach(h => {
        const s = h.querySelector(".arrow");
        if (s) s.textContent = "";
    });
    ths[col].querySelector(".arrow").textContent = dir === "asc" ? "▲" : "▼";

    rows.sort((a, b) => {
        const x = parseValue(a.cells[col].innerText);
        const y = parseValue(b.cells[col].innerText);
        if (typeof x === "number" && typeof y === "number") {
            return dir === "asc" ? x - y : y - x;
        }
        return dir === "asc"
            ? x.toString().localeCompare(y.toString())
            : y.toString().localeCompare(x.toString());
    });

    rows.forEach(r => tbody.appendChild(r));
    syncBasketButtons();
}

/* =======================
   FILTERING
======================= */
function filterTable() {
    const isin = document.getElementById("filterIsin").value.toLowerCase();
    const issuer = document.getElementById("filterIssuer").value.toLowerCase();
    const priceMin = parseFloat(document.getElementById("filterPriceMin").value || "0");
    const priceMax = parseFloat(document.getElementById("filterPriceMax").value || "0");
    const currency = document.getElementById("filterCurrency").value;
    const minRating = document.getElementById("filterMinRating").value;
    const minMat = document.getElementById("filterMinMat").value;
    const maxMat = document.getElementById("filterMaxMat").value;
    const minYield = parseFloat(document.getElementById("filterminYield").value || "0");
    const minCapitalAtMat = parseFloat(document.getElementById("filterMinCapitalAtMat").value || "0");
    const minSAY = parseFloat(document.getElementById("filterMinSAY").value || "0");

    const rows = document.querySelectorAll("#bondTable tbody tr");

    rows.forEach(r => {
        const isinCell = r.cells[COL.ISIN].innerText.toLowerCase();
        const issuerCell = r.cells[COL.ISSUER].innerText.toLowerCase();
        const priceCell = parseNum(r.cells[COL.PRICE].innerText);
        const currencyCell = r.cells[COL.CURRENCY].innerText;
        const ratingCell = r.cells[COL.RATING].innerText.trim();
        const mat = r.cells[COL.MATURITY].innerText;
        const currCoupon = parseNum(r.cells[COL.CURR_YIELD].innerText);
        const capitalAtMat = parseNum(r.cells[COL.CAPITAL_AT_MAT].innerText);
        const say = parseNum(r.cells[COL.SAY].innerText);

        let ok = true;
        if (isin && isinCell.indexOf(isin) === -1) ok = false;
        if (issuer && issuerCell.indexOf(issuer) === -1) ok = false;
        if (priceMin && priceMin > priceCell) ok = false;
        if (priceMax && priceMax < priceCell) ok = false;
        if (currency && currencyCell !== currency) ok = false;

        // Rating: minimum rating filter (e.g., "≥ BBB" means rating must be BBB or better)
        if (minRating) {
            const ratingRank = RATING_RANK[ratingCell] || -100;
            const minRatingRank = RATING_RANK[minRating] || -100;
            if (ratingRank < minRatingRank) ok = false;
        }

        if (minMat && mat < minMat) ok = false;
        if (maxMat && mat > maxMat) ok = false;
        if (currCoupon < minYield) ok = false;
        if (capitalAtMat < minCapitalAtMat) ok = false;
        if (say < minSAY) ok = false;

        r.style.display = ok ? "" : "none";
    });

    applyHeatmap();
    syncBasketButtons();
    checkWishlistAlerts();
    syncWishlistButtons();
}

function clearColumnFilters() {
    document.getElementById("filterIsin").value = "";
    document.getElementById("filterIssuer").value = "";
    document.getElementById("filterPriceMin").value = "";
    document.getElementById("filterPriceMax").value = "";
    document.getElementById("filterCurrency").value = "";
    document.getElementById("filterMinRating").value = "";
    document.getElementById("filterminYield").value = "";
    document.getElementById("filterMinCapitalAtMat").value = "";
    document.getElementById("filterMinSAY").value = "";
    setDefaultMaturityFilters();
    filterTable();
    updatePresetButtons(null);
    document.getElementById("presetDesc").textContent = "";
}

/* =======================
   EXPORT
======================= */
function exportCSV() {
    const rows = document.querySelectorAll("#bondTable tr:not([style*='display: none'])");
    let csv = [];

    rows.forEach(r => {
        const cols = Array.from(r.cells).map(td => {
            const text = td.textContent.replace(/\s+/g, " ").trim();
            return '"' + text.replace(/"/g, '""') + '"';
        });
        csv.push(cols.join(","));
    });

    const blob = new Blob([csv.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bond-report.csv";
    a.click();
    URL.revokeObjectURL(url);
}

/* =======================
   HEATMAP - DUAL MODE
======================= */
function applyHeatmap() {
    const rows = document.querySelectorAll("#bondTable tbody tr");

    const red = [255, 215, 215];
    const yellow = [255, 245, 190];
    const green = [215, 245, 215];

    rows.forEach(r => {
        // === Current Yield ===
        const v = parseNum(r.cells[COL.CURR_YIELD].innerText);
        let bg;

        if (currentMode === "income") {
            // INCOME MODE: Strong coloring
            if (v <= 3.0) {
                bg = "rgb(" + red.join(",") + ")";
            } else if (v <= 4.5) {
                bg = lerpColor(red, yellow, (v - 3.0) / 1.5);
            } else if (v <= 5.5) {
                bg = lerpColor(yellow, green, (v - 4.5) / 1.0);
            } else if (v <= 6.5) {
                const darkGreen = [100, 200, 100];
                bg = lerpColor(green, darkGreen, (v - 5.5) / 1.0);
            } else {
                bg = "rgb(50, 180, 50)";
            }
        } else {
            // SAY MODE: Light coloring
            if (v <= 1.5) {
                bg = "rgba(255, 215, 215, 0.3)";
            } else if (v < 3.0) {
                bg = lerpColor(red, yellow, (v - 1.5) / 1.5);
            } else if (v < 5.0) {
                bg = lerpColor(yellow, green, (v - 3.0) / 2.0);
            } else {
                bg = "rgba(215, 245, 215, 0.5)";
            }
        }
        r.cells[COL.CURR_YIELD].style.backgroundColor = bg;

        // === Total Capital at Maturity ===
        const w = parseNum(r.cells[COL.CAPITAL_AT_MAT].innerText);
        let bg2;
        if (w <= 1150) {
            bg2 = "rgba(255, 215, 215, 0.3)";
        } else if (w < 1400) {
            bg2 = lerpColor(red, yellow, (w - 1150) / 250);
        } else if (w < 1650) {
            bg2 = lerpColor(yellow, green, (w - 1400) / 250);
        } else {
            bg2 = "rgba(215, 245, 215, 0.5)";
        }
        r.cells[COL.CAPITAL_AT_MAT].style.backgroundColor = bg2;

        // === SAY (Simple Annual Yield) ===
        const say = parseNum(r.cells[COL.SAY].innerText);
        let bg3;

        if (currentMode === "say") {
            // SAY MODE: Strong coloring
            if (say <= 1.0) {
                bg3 = "rgb(" + red.join(",") + ")";
            } else if (say <= 2.5) {
                bg3 = lerpColor(red, yellow, (say - 1.0) / 1.5);
            } else if (say <= 3.5) {
                bg3 = lerpColor(yellow, green, (say - 2.5) / 1.0);
            } else if (say <= 4.5) {
                const darkGreen = [100, 200, 100];
                bg3 = lerpColor(green, darkGreen, (say - 3.5) / 1.0);
            } else {
                bg3 = "rgb(50, 180, 50)";
            }
        } else {
            // INCOME MODE: Light coloring
            if (say <= 1.0) {
                bg3 = "rgba(255, 215, 215, 0.2)";
            } else if (say <= 2.5) {
                bg3 = "rgba(255, 245, 190, 0.2)";
            } else if (say <= 3.5) {
                bg3 = "rgba(215, 245, 215, 0.2)";
            } else {
                bg3 = "rgba(215, 245, 215, 0.3)";
            }
        }
        r.cells[COL.SAY].style.backgroundColor = bg3;
    });
}

function lerpColor(c1, c2, t) {
    return "rgb(" +
        Math.round(c1[0] + (c2[0] - c1[0]) * t) + "," +
        Math.round(c1[1] + (c2[1] - c1[1]) * t) + "," +
        Math.round(c1[2] + (c2[2] - c1[2]) * t) + ")";
}

function updateLegend() {
    const legendTitle = document.getElementById("legendTitle");
    const legendTable = document.getElementById("legendTable");

    if (!legendTitle || !legendTable) return;

    if (currentMode === "income") {
        legendTitle.textContent = "Current Yield Heatmap (Income Mode)";
        legendTable.innerHTML = `
            <tr>
                <td style="background: rgb(255, 215, 215); padding: 6px 8px;">< 3%</td>
                <td style="padding: 6px 8px;">Too low (worse than risk-free rate)</td>
            </tr>
            <tr>
                <td style="background: rgb(255, 245, 190); padding: 6px 8px;">3–4.5%</td>
                <td style="padding: 6px 8px;">Acceptable (moderate income)</td>
            </tr>
            <tr>
                <td style="background: rgb(215, 245, 215); padding: 6px 8px;">4.5–5.5%</td>
                <td style="padding: 6px 8px;">Good (solid income)</td>
            </tr>
            <tr>
                <td style="background: rgb(100, 200, 100); padding: 6px 8px;">5.5–6.5%</td>
                <td style="padding: 6px 8px;">Excellent (high income)</td>
            </tr>
            <tr>
                <td style="background: rgb(50, 180, 50); padding: 6px 8px;">> 6.5%</td>
                <td style="padding: 6px 8px;">⭐ Outstanding (premium income)</td>
            </tr>
        `;
    } else {
        legendTitle.textContent = "SAY Heatmap (Capital Gain Mode)";
        legendTable.innerHTML = `
            <tr>
                <td style="background: rgb(255, 215, 215); padding: 6px 8px;">< 1%</td>
                <td style="padding: 6px 8px;">Terrible (FX currency bonds)</td>
            </tr>
            <tr>
                <td style="background: rgb(255, 245, 190); padding: 6px 8px;">1–2.5%</td>
                <td style="padding: 6px 8px;">Poor (needs improvement)</td>
            </tr>
            <tr>
                <td style="background: rgb(215, 245, 215); padding: 6px 8px;">2.5–3.5%</td>
                <td style="padding: 6px 8px;">Good (standard sovereign)</td>
            </tr>
            <tr>
                <td style="background: rgb(100, 200, 100); padding: 6px 8px;">3.5–4.5%</td>
                <td style="padding: 6px 8px;">Excellent (best value)</td>
            </tr>
            <tr>
                <td style="background: rgb(50, 180, 50); padding: 6px 8px;">> 4.5%</td>
                <td style="padding: 6px 8px;">⭐ Top performers</td>
            </tr>
        `;
    }
}

/* =======================
   MATURITY DEFAULTS
======================= */
function setDefaultMaturityFilters() {
    const today = new Date();
    const min = new Date(today.getFullYear() + 5, today.getMonth(), today.getDate());
    const max = new Date(today.getFullYear() + 30, today.getMonth(), today.getDate());

    function formatDate(d) {
        const y = d.getFullYear();
        const m = ("0" + (d.getMonth() + 1)).slice(-2);
        const day = ("0" + d.getDate()).slice(-2);
        return y + "-" + m + "-" + day;
    }

    document.getElementById("filterMinMat").value = formatDate(min);
    document.getElementById("filterMaxMat").value = formatDate(max);
}

        
/* =======================
   YAML IMPORT
======================= */
function handleYamlImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const yamlContent = e.target.result;
            const customProfiles = parseYamlProfiles(yamlContent);

            if (customProfiles && customProfiles.length > 0) {
                mergeCustomProfiles(customProfiles);
                alert('\u2713 Successfully imported ' + customProfiles.length + ' custom profile(s)!');
            } else {
                alert('\u26a0\ufe0f No valid profiles found in YAML file.');
            }
        } catch (error) {
            alert('\u274c Error parsing YAML file: ' + error.message);
            console.error('YAML parse error:', error);
        }
    };
    reader.readAsText(file);

    // Reset file input so same file can be imported again
    event.target.value = '';
}

function parseYamlProfiles(yamlText) {
    // Simple YAML parser for the specific structure we expect
    const profiles = [];
    const lines = yamlText.split('\n');
    let currentProfile = null;
    let inFilters = false;

    for (let line of lines) {
        line = line.trim();

        // Skip comments and empty lines
        if (!line || line.startsWith('#')) continue;

        // New profile
        if (line.startsWith('- id:')) {
            if (currentProfile) {
                profiles.push(currentProfile);
            }
            currentProfile = {
                id: line.split(':')[1].trim(),
                filters: {}
            };
            inFilters = false;
        }
        // Profile properties
        else if (currentProfile) {
            if (line.startsWith('label:')) {
                currentProfile.name = line.split(':')[1].trim().replace(/['"]/g, '');
            }
            else if (line.startsWith('emoji:')) {
                currentProfile.emoji = line.split(':')[1].trim().replace(/['"]/g, '');
            }
            else if (line.startsWith('description:')) {
                currentProfile.description = line.split(':')[1].trim().replace(/['"]/g, '');
            }
            else if (line.startsWith('profileType:')) {
                currentProfile.profileType = line.split(':')[1].trim().replace(/['"]/g, '');
            }
            else if (line.startsWith('sortedBy:')) {
                currentProfile.sortedBy = line.split(':')[1].trim().replace(/['"]/g, '');
            }
            else if (line.startsWith('filters:')) {
                inFilters = true;
            }
            else if (inFilters && line.includes(':')) {
                const parts = line.split(':');
                const key = parts[0].trim();
                let value = parts[1].trim();

                // Parse numeric values
                if (!isNaN(value)) {
                    value = parseFloat(value);
                } else {
                    // Remove quotes from string values
                    value = value.replace(/['"]/g, '');
                }

                currentProfile.filters[key] = value;
            }
        }
    }

    // Add last profile
    if (currentProfile) {
        profiles.push(currentProfile);
    }

    return profiles;
}

function mergeCustomProfiles(customProfiles) {
    const presetsContainer = document.querySelector('.profile-presets');
    const resetButton = document.getElementById('preset-reset');
    const importButton = document.getElementById('import-yaml-btn');

    // Remove existing custom buttons (those after the default presets)
    const customButtons = presetsContainer.querySelectorAll('.preset-button.custom');
    customButtons.forEach(btn => btn.remove());

    // Clear and rebuild custom profile IDs list
    customProfileIds = [];

    // Add new custom profile buttons before reset button
    customProfiles.forEach(profile => {
        // Track this custom profile ID
        customProfileIds.push(profile.id);

        // Add to PRESETS object with profileType and sortedBy
        PRESETS[profile.id] = {
            name: profile.name || profile.id,
            description: profile.description || 'Custom profile',
            profileType: profile.profileType || 'SAY',      // NEW: Capture profileType
            sortedBy: profile.sortedBy || 'SAY',            // NEW: Capture sortedBy
            filters: profile.filters
        };

        // Create button
        const button = document.createElement('button');
        button.className = 'preset-button custom';
        button.id = profile.id;
        button.onclick = () => applyPreset(profile.id);
        button.title = profile.description || 'Custom profile';

        const emoji = profile.emoji || '🎯';
        button.textContent = emoji + ' ' + (profile.name || profile.id);

        // Insert before reset button
        presetsContainer.insertBefore(button, resetButton);
    });
}


function showLoading() {
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) {
        overlay.classList.add("active");
    }
}

function hideLoading() {
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) {
        overlay.classList.remove("active");
    }
}

function addYearsDecimal(date, yearsDecimal) {
    const result = new Date(date);

    const wholeYears = Math.floor(yearsDecimal);
    const remainingMonths = Math.round((yearsDecimal - wholeYears) * 12);

    result.setFullYear(result.getFullYear() + wholeYears);
    result.setMonth(result.getMonth() + remainingMonths);

    return result;
}

function applyPreset(presetName) {
    showLoading();

    setTimeout(() => {
        if (presetName === "reset") {
            clearColumnFilters();
            updatePresetButtons(presetName);
            updateLegend();
            applyHeatmap();
            document.getElementById("presetDesc").textContent = "";
            hideLoading();
            return;
        }

        const preset = PRESETS[presetName];
        if (!preset) {
            hideLoading();
            return;
        }

        clearColumnFilters();

        // Price
        document.getElementById("filterPriceMin").value = preset.filters.minPrice || "";
        document.getElementById("filterPriceMax").value = preset.filters.maxPrice || "";

        // Rating
        document.getElementById("filterMinRating").value = preset.filters.minRating || "";

        // Maturity
        const today = new Date();
        const minMat = addYearsDecimal(today, preset.filters.minMatYears);
        const maxMat = addYearsDecimal(today, preset.filters.maxMatYears);

        function formatDate(d) {
            const y = d.getFullYear();
            const m = ("0" + (d.getMonth() + 1)).slice(-2);
            const day = ("0" + d.getDate()).slice(-2);
            return y + "-" + m + "-" + day;
        }

        document.getElementById("filterMinMat").value = formatDate(minMat);
        document.getElementById("filterMaxMat").value = formatDate(maxMat);

        // Mode-specific filters
        document.getElementById("filterminYield").value = preset.filters.minYield || "";
        document.getElementById("filterMinCapitalAtMat").value = preset.filters.minCapitalAtMat || "";
        document.getElementById("filterMinSAY").value = preset.filters.minSAY || "";

        // Apply profileType from preset (SAY or income)
        currentMode = preset.profileType ? preset.profileType.toLowerCase() : "say";

        filterTable();
        updatePresetButtons(presetName);
        updateLegend();
        applyHeatmap();
        document.getElementById("presetDesc").textContent = "✓ " + preset.description;

        // Apply sortedBy property: resolve column name to COL constant
        let sortColumn = COL.SAY; // default
        if (preset.sortedBy) {
            const sortMap = {
                "SAY": COL.SAY,
                "CURR_YIELD": COL.CURR_YIELD,
                "CAPITAL_AT_MAT": COL.CAPITAL_AT_MAT,
                "PRICE": COL.PRICE,
                "MATURITY": COL.MATURITY,
                "ISIN": COL.ISIN,
                "ISSUER": COL.ISSUER,
                "COUPON": COL.COUPON,
                "RATING": COL.RATING,
                "PRICE_R": COL.PRICE_R,
                "CURRENCY": COL.CURRENCY
            };
            sortColumn = sortMap[preset.sortedBy] !== undefined ? sortMap[preset.sortedBy] : COL.SAY;
        }

        // Always use DESC as initial sort direction
        currentSortDir = "desc";
        sortTable(sortColumn, true);

        hideLoading();
    }, 100);
}

function updatePresetButtons(activePreset) {
    // Update built-in preset buttons
    const ids = ["cashParking", "ultraShortHigh", "balancedCore", "maxIncome", "deepDiscount", "fortressSafe", "longQuality", "retirementIncome"];
    ids.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.classList.toggle("active", id === activePreset);
    });

    // Update custom profile buttons
    customProfileIds.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.classList.toggle("active", id === activePreset);
    });

    document.getElementById("preset-reset").classList.remove("active");
}


/* =======================
   BOND BASKET
======================= */
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

function flagFor(issuer) {
    return FLAG_MAP[issuer.toUpperCase()] || "🏳️";
}

// basket: array of { isin, issuer, coupon, maturity }
let basket = JSON.parse(localStorage.getItem('bondBasket') || '[]');

function saveBasket() {
    localStorage.setItem('bondBasket', JSON.stringify(basket));
}

function addToBasket(btn) {
    const isin     = btn.dataset.isin;
    const issuer   = btn.dataset.issuer;
    const coupon   = btn.dataset.coupon;
    const maturity = btn.dataset.maturity;

    if (basket.find(b => b.isin === isin)) {
        // already in — show green ✓ briefly
        setBasketBtnState(btn, true);
        return;
    }
    basket.push({ isin, issuer, coupon, maturity });
    saveBasket();
    renderBasket();
    setBasketBtnState(btn, true);
}

function setBasketBtnState(btn, inBasket) {
    if (inBasket) {
        btn.textContent = '✓';
        btn.classList.add('in-basket');
    } else {
        btn.textContent = '＋';
        btn.classList.remove('in-basket');
    }
}

function syncBasketButtons() {
    document.querySelectorAll('.add-to-basket-btn').forEach(btn => {
        const isin = btn.dataset.isin;
        setBasketBtnState(btn, !!basket.find(b => b.isin === isin));
    });
}

function removeFromBasket(isin) {
    basket = basket.filter(b => b.isin !== isin);
    saveBasket();
    renderBasket(); // renderBasket already calls syncBasketButtons

    // force open after DOM update + event bubbling
    setTimeout(() => {
        const el = document.getElementById('basketDropdown');
        if (el) el.style.display = 'block';
    }, 0);
}

function clearBasket() {
    basket = [];
    saveBasket();
    renderBasket();
    document.getElementById('basketDropdown').style.display = 'none';
}

function toggleBasketDropdown() {
    const dd = document.getElementById('basketDropdown');
    dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

// Close dropdown when clicking outside
document.addEventListener('click', e => {
    const widget = document.getElementById('basketWidget');
    if (widget && !widget.contains(e.target)) {
        const dd = document.getElementById('basketDropdown');
        if (dd) dd.style.display = 'none';
    }
});

function renderBasket() {
    const countEl = document.getElementById('basketCount');
    const itemsEl = document.getElementById('basketItems');
    if (!countEl || !itemsEl) return;

    if (basket.length === 0) {
        countEl.style.display = 'none';
        itemsEl.innerHTML = '<p class="basket-empty">No bonds selected yet.<br>Click ＋ on any row.</p>';
    } else {
        countEl.style.display = 'inline-flex';
        countEl.textContent = basket.length;
        itemsEl.innerHTML = basket.map(b => {
            const year = b.maturity ? b.maturity.substring(0, 4) : '';
            return `<div class="basket-item">
                <span class="basket-item__label">${flagFor(b.issuer)} ${b.issuer} ${b.coupon}% ${year}</span>
                <button class="basket-item__remove" onclick="removeFromBasket('${b.isin}')" title="Remove">✕</button>
            </div>`;
        }).join('');
    }

    if (typeof twemoji !== 'undefined') twemoji.parse(itemsEl);
    syncBasketButtons();
}

function openAnalyzerFromBasket() {
    goToAnalyzer();
}

function goToAnalyzer() {
    document.getElementById('basketDropdown').style.display = 'none';
    // basket is already persisted in localStorage — just navigate
    window.location.href = '/analyzer';
}


/* =======================
   WISHLIST
======================= */
let wishlist = JSON.parse(localStorage.getItem('bondWishlist') || '[]');
let _wishlistDialogData = null; // { isin, issuer, price, say }

function saveWishlistData() {
    localStorage.setItem('bondWishlist', JSON.stringify(wishlist));
}

function openWishlistDialog(btn) {
    _wishlistDialogData = {
        isin:     btn.dataset.isin,
        issuer:   btn.dataset.issuer,
        coupon:   btn.dataset.coupon,
        maturity: btn.dataset.maturity,
        price:  parseFloat((btn.dataset.price || '0').replace(',', '.')),
        say:    parseFloat((btn.dataset.say   || '0').replace(',', '.'))
    };
    // Pre-fill if already in wishlist
    const existing = wishlist.find(w => w.isin === _wishlistDialogData.isin);
    document.getElementById('wishlistDialogTitle').textContent =
        _wishlistDialogData.issuer + ' (' + _wishlistDialogData.isin + ')  —  Price: ' +
        _wishlistDialogData.price.toFixed(2) + '  SAY: ' + _wishlistDialogData.say.toFixed(2) + '%';
    document.getElementById('wlPriceCheck').checked = !!(existing?.targetPrice);
    document.getElementById('wlPriceVal').value   = existing?.targetPrice ?? '';
    document.getElementById('wlSayCheck').checked  = !!(existing?.targetSay);
    document.getElementById('wlSayVal').value    = existing?.targetSay ?? '';
    document.getElementById('wishlistDialog').style.display = 'flex';
}

function closeWishlistDialog(e) {
    if (e.target === document.getElementById('wishlistDialog')) closeWishlistDialogDirect();
}
function closeWishlistDialogDirect() {
    document.getElementById('wishlistDialog').style.display = 'none';
    _wishlistDialogData = null;
}

function saveWishlistItem() {
    if (!_wishlistDialogData) return;
    const priceCheck = document.getElementById('wlPriceCheck').checked;
    const sayCheck   = document.getElementById('wlSayCheck').checked;
    const priceVal   = parseFloat(document.getElementById('wlPriceVal').value);
    const sayVal     = parseFloat(document.getElementById('wlSayVal').value);

    if (!priceCheck && !sayCheck) {
        alert('Please enable at least one criterion.');
        return;
    }
    if (priceCheck && isNaN(priceVal)) {
        alert('Please enter a valid price threshold.');
        return;
    }
    if (sayCheck && isNaN(sayVal)) {
        alert('Please enter a valid SAY threshold.');
        return;
    }

    // Remove existing entry for same ISIN
    wishlist = wishlist.filter(w => w.isin !== _wishlistDialogData.isin);
    wishlist.push({
        isin:        _wishlistDialogData.isin,
        issuer:      _wishlistDialogData.issuer,
        coupon:      _wishlistDialogData.coupon,
        maturity:    _wishlistDialogData.maturity,
        targetPrice: priceCheck ? priceVal : null,
        targetSay:   sayCheck  ? sayVal   : null
    });
    saveWishlistData();
    closeWishlistDialogDirect();
    checkWishlistAlerts();   // re-evaluate immediately
    renderWishlist();
    syncWishlistButtons();
}

function removeFromWishlist(isin) {
    wishlist = wishlist.filter(w => w.isin !== isin);
    saveWishlistData();
    checkWishlistAlerts();
    renderWishlist();
    syncWishlistButtons();
    setTimeout(() => {
        const el = document.getElementById('wishlistDropdown');
        if (el) el.style.display = 'block';
    }, 0);
}

function moveWishlistToBasket(isin) {
    // Find current price/data from table row
    const row = document.querySelector(`tr[data-isin="${isin}"]`);
    if (row) {
        const btn = row.querySelector('.add-to-basket-btn');
        if (btn) addToBasket(btn);
    }
    removeFromWishlist(isin);
}

function clearWishlist() {
    wishlist = [];
    saveWishlistData();
    renderWishlist();
    syncWishlistButtons();
    document.getElementById('wishlistDropdown').style.display = 'none';
}

function toggleWishlistDropdown() {
    const dd = document.getElementById('wishlistDropdown');
    dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

// Close wishlist dropdown when clicking outside
document.addEventListener('click', e => {
    const widget = document.getElementById('wishlistWidget');
    if (widget && !widget.contains(e.target)) {
        const dd = document.getElementById('wishlistDropdown');
        if (dd) dd.style.display = 'none';
    }
});

function checkWishlistAlerts() {
    if (wishlist.length === 0) {
        stopWishlistPulse();
        return;
    }
    let anyTriggered = false;
    wishlist.forEach(item => {
        const row = document.querySelector(`tr[data-isin="${item.isin}"]`);
        if (!row) return;
        const currentPrice = parseFloat((row.cells[COL.PRICE_R]?.innerText || '999').replace(',', '.').replace(/[^0-9.-]/g, ''));
        const currentSay   = parseFloat(row.cells[COL.SAY]?.innerText?.replace(',', '.') || '0');

        const priceOk = item.targetPrice !== null && currentPrice <= item.targetPrice;
        const sayOk   = item.targetSay   !== null && currentSay   >= item.targetSay;
        item._priceTriggered = priceOk;
        item._sayTriggered   = sayOk;

        if (priceOk || sayOk) anyTriggered = true;
    });

    if (anyTriggered) startWishlistPulse();
    else              stopWishlistPulse();
}

function startWishlistPulse() {
    document.getElementById('wishlistIcon')?.classList.add('wishlist-pulse');
    document.getElementById('wishlistBtn')?.classList.add('wishlist-triggered');
}
function stopWishlistPulse() {
    document.getElementById('wishlistIcon')?.classList.remove('wishlist-pulse');
    document.getElementById('wishlistBtn')?.classList.remove('wishlist-triggered');
}

function renderWishlist() {
    const countEl = document.getElementById('wishlistCount');
    const itemsEl = document.getElementById('wishlistItems');
    if (!countEl || !itemsEl) return;

    if (wishlist.length === 0) {
        countEl.style.display = 'none';
        itemsEl.innerHTML = '<p class="basket-empty">No alerts set.<br>Click ★ on any row.</p>';
        return;
    }
    countEl.style.display = 'inline-flex';
    countEl.textContent = wishlist.length;

    itemsEl.innerHTML = wishlist.map(item => {
        const triggered = item._priceTriggered || item._sayTriggered;
        const criteria = [];
        if (item.targetPrice !== null) {
            const ok = item._priceTriggered;
            criteria.push(`<span class="wl-criterion${ok ? ' wl-ok' : ''}">Price ≤ ${item.targetPrice.toFixed(2)}${ok ? ' ✓' : ''}</span>`);
        }
        if (item.targetSay !== null) {
            const ok = item._sayTriggered;
            criteria.push(`<span class="wl-criterion${ok ? ' wl-ok' : ''}">SAY ≥ ${item.targetSay.toFixed(2)}%${ok ? ' ✓' : ''}</span>`);
        }
        const year = item.maturity ? item.maturity.substring(0, 4) : '';
        return `<div class="basket-item${triggered ? ' wl-triggered' : ''}">
            <div style="flex:1;min-width:0;">
                <div class="basket-item__label">${flagFor(item.issuer)} ${item.issuer} ${item.coupon}% ${year}</div>
                <div class="wl-criteria">${criteria.join(' ')}</div>
                <div class="wl-actions">
                    <button class="wl-move-btn" onclick="moveWishlistToBasket('${item.isin}')" title="Move to basket">→ Basket</button>
                    <button class="basket-item__remove" onclick="removeFromWishlist('${item.isin}')" title="Remove">✕</button>
                </div>
            </div>
        </div>`;
    }).join('');

    if (typeof twemoji !== 'undefined') twemoji.parse(itemsEl);
}

function syncWishlistButtons() {
    document.querySelectorAll('.add-to-wishlist-btn').forEach(btn => {
        const isin = btn.dataset.isin;
        const inWl = !!wishlist.find(w => w.isin === isin);
        btn.classList.toggle('in-wishlist', inWl);
        btn.textContent = inWl ? '★' : '★';  // always star, color via CSS
    });
}
/* =======================
   INITIALIZATION
======================= */
document.addEventListener("DOMContentLoaded", () => {
    setDefaultMaturityFilters();
    applyPreset("cashParking");
    renderBasket();           // also calls syncBasketButtons
    renderWishlist();         // render wishlist from localStorage
    syncWishlistButtons();    // restore ★ state on all rows
    checkWishlistAlerts();    // check thresholds and pulse if needed
    // Parse emoji once after page load (covers flag column in table)
    if (typeof twemoji !== 'undefined') {
      document
        .querySelectorAll('td.td-issuer, span.basket-item__label')
        .forEach(el => twemoji.parse(el));
    }
});
// ─── INFO MODAL ──────────────────────────────────────────────────────────────
function openInfoModal() {
    document.getElementById('infoModal').classList.add('open');
    document.getElementById('infoModalBackdrop').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeInfoModal() {
    document.getElementById('infoModal').classList.remove('open');
    document.getElementById('infoModalBackdrop').classList.remove('open');
    document.body.style.overflow = '';
}

// Close on Escape key
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeInfoModal();
});

// Intercept #anchor clicks inside the modal — scroll within the modal body
// instead of jumping the main page, which would close or misplace the view.
document.addEventListener('click', e => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;

    const modal = document.getElementById('infoModal');
    if (!modal || !modal.contains(link)) return;

    e.preventDefault();

    const targetId = link.getAttribute('href').slice(1);          // strip the #
    const target   = modal.querySelector('#' + CSS.escape(targetId));
    if (target) {
        const body = modal.querySelector('.info-modal__body');
        // Scroll the modal body so the heading is near the top with a small offset
        const offset = target.offsetTop - body.offsetTop - 12;
        body.scrollTo({ top: offset, behavior: 'smooth' });
    }
});

// ─── DATA AGE COUNTER ─────────────────────────────────────────────────────────
(function () {
    // Parse the timestamp rendered by FreeMarker: "yyyy-MM-dd HH:mm"
    const metaEl = document.getElementById('pageMeta');
    const ageEl  = document.getElementById('dataAge');
    if (!metaEl || !ageEl) return;

    // Use epoch ms from hidden span — avoids any timezone parsing ambiguity
    const msEl = document.getElementById('generatedAtMs');
    if (!msEl) return;
    const generatedAt = new Date(parseInt(msEl.textContent.trim(), 10));

    // Show timestamp in browser's local timezone
    const localEl = document.getElementById('generatedAtLocal');
    if (localEl) {
        const pad = n => String(n).padStart(2, '0');
        const d = generatedAt;
        localEl.textContent =
            d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) +
            ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }

    function update() {
        const seconds = Math.floor((Date.now() - generatedAt.getTime()) / 1000);
        const minutes = Math.floor(seconds / 60);
        let color, label;

        if (minutes < 1) {
            color = 'green'; label = 'now';
        } else if (minutes < 10) {
            color = 'green'; label = minutes + ' min ago';
        } else if (minutes < 30) {
            color = 'yellow'; label = minutes + ' min ago';
        } else {
            color = 'red'; label = minutes + ' min ago';
        }

        ageEl.className = 'data-age-dot data-age-' + color;
        ageEl.textContent = label;
    }

    update();
    setInterval(update, 30000); // every 30s for "now" to flip quickly
})();
