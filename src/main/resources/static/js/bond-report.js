/* =========================
   FILTERING ENGINE
========================== */
const BondFilteringEngine = (function () {
    let bondIndex = new Map(); // private
    let activePreset = null;

    /* =========================
       INIT
    ========================== */
    function init() {
        bondIndex = buildBondIndex();
        //filterTable(); // first rendering
    }

    /* =========================
           BUILD INDEX (PRIVATE)
    ========================== */
    function buildBondIndex() {
        const rows = document.querySelectorAll("#bondTable tbody tr");
        const map = new Map();

        rows.forEach(r => {
            const bond = {
                row: r,
                isin: r.cells[COL.ISIN].innerText.trim(),
                issuer: r.cells[COL.ISSUER].innerText.toLowerCase(),
                price: parseNum(r.cells[COL.PRICE].innerText),
                currency: r.cells[COL.CURRENCY].innerText,
                rating: r.cells[COL.RATING].innerText.trim(),
                maturity: new Date(r.cells[COL.MATURITY].innerText + "T00:00:00"),
                currYield: parseNum(r.cells[COL.CURR_YIELD].innerText),
                capitalAtMat: parseNum(r.cells[COL.CAPITAL_AT_MAT].innerText),
                say: parseNum(r.cells[COL.SAY].innerText)
            };

            map.set(bond.isin, bond);
        });

        return map;
    }

    /* =========================
       FILTER ENTRY POINT
    ========================== */
    function filterTable(preset = null) {
        // Keep preset memory (the UI buttons should affect the COMPOSITE filtering in case
        if (preset) {
            activePreset = preset;
        }

        if (activePreset?.filters?.groups) {
            applyCompositeFilters(activePreset);
        } else {
            applyNormalFilters();
        }

        postFilterUIUpdates();
    }

    /* =========================
       NORMAL FILTERING
    ========================== */
    function getFilters() {
        return {
            isin: document.getElementById("filterIsin")?.value.toLowerCase() || "",
            issuer: document.getElementById("filterIssuer")?.value.toLowerCase() || "",

            minPrice : parseFloat(document.getElementById("filterPriceMin")?.value) || null,
            maxPrice : parseFloat(document.getElementById("filterPriceMax")?.value) || null,

            currency: document.getElementById("filterCurrency")?.value || "",

            minRating: document.getElementById("filterMinRating")?.value || "",

            minMatYears: document.getElementById("filterMinMat")?.value || "",
            maxMatYears: document.getElementById("filterMaxMat")?.value || "",

            minYield: parseFloat(document.getElementById("filterminYield")?.value) || null,
            minCapitalAtMat: parseFloat(document.getElementById("filterMinCapitalAtMat")?.value) || null,
            minSAY: parseFloat(document.getElementById("filterMinSAY")?.value) || null
        };
    }

    /* =========================
       FILTERING HELPERS
    ========================== */
    function resolveMaturityBounds(filters) {
        const today = new Date();

        const addYearsDecimal = (baseDate, yearsDecimal) => {
            if (yearsDecimal == null) return null;

            const wholeYears = Math.floor(yearsDecimal);
            const remainingFraction = yearsDecimal - wholeYears;

            const result = new Date(baseDate);
            result.setFullYear(result.getFullYear() + wholeYears);

            // Convert the ratio into days (~365.25)
            const daysToAdd = remainingFraction * 365.25;
            result.setDate(result.getDate() + daysToAdd);

            return result;
        };

        let minDate = null;
        let maxDate = null;

        // PRIORITY to absolute dates
        if (filters.fromDate) {
            minDate = new Date(filters.fromDate);
        } else if (filters.minMatYears != null) {
            minDate = addYearsDecimal(today, filters.minMatYears);
        }
        if (filters.toDate) {
            maxDate = new Date(filters.toDate);
        } else if (filters.maxMatYears != null) {
            maxDate = addYearsDecimal(today, filters.maxMatYears);
        }

        return { minDate, maxDate };
    }

    function bondMatchesFilters(bond, filters, bounds) {
        // ISIN
        if (filters.isin && !bond.isin.toLowerCase().includes(filters.isin)) return false; // partial research

        // Issuer
        if (filters.issuer && !bond.issuer.includes(filters.issuer)) return false; // partial research

        // Price
        if (filters.minPrice !== null && bond.price < filters.minPrice) return false;
        if (filters.maxPrice !== null && bond.price > filters.maxPrice) return false;

        // Currency
        if (filters.currency && bond.currency !== filters.currency) return false;

        // Rating
        if (filters.minRating) {
            const ratingRank = RATING_RANK[bond.rating] ?? -100;
            const minRatingRank = RATING_RANK[filters.minRating] ?? -100;
            if (ratingRank < minRatingRank) return false;
        }

        if (filters.maxRating) {
            const ratingRank = RATING_RANK[bond.rating] ?? -100;
            const maxRatingRank = RATING_RANK[filters.maxRating] ?? 100;
            if (ratingRank > maxRatingRank) return false;
        }

        // Maturity
        if (bounds.minDate && bond.maturity < bounds.minDate) return false;
        if (bounds.maxDate && bond.maturity > bounds.maxDate) return false;

        // Yield/Capital/SAY
        if (filters.minYield !== null && bond.currYield < filters.minYield) return false;
        if (filters.minCapitalAtMat !== null && bond.capitalAtMat < filters.minCapitalAtMat) return false;
        if (filters.minSAY !== null && bond.say < filters.minSAY) return false;

        return true;
    }

    function applyNormalFilters() {
        const filters = getFilters();
        var bounds = {minDate: new Date(filters.minMatYears), maxDate: new Date(filters.maxMatYears)};

        bondIndex.forEach(bond => {
            bond.row.style.display = bondMatchesFilters(bond, filters,bounds) ? "" : "none";
        });
    }

    function filterBonds(bonds, filters) {
        const bounds = resolveMaturityBounds(filters);

        return bonds.filter(bond =>
            bondMatchesFilters(bond, filters, bounds)
        );
    }

    /* =========================
       COMPOSITE FILTERING
    ========================== */
    function applyCompositeFilters(preset) {
        const uiFilters = getFilters(); // let's read UI in case of overrides
        const allBonds = [...bondIndex.values()];
        const resultSet = new Set();

        const overridableKeys = [
            "isin",
            "issuer",
            "minPrice",
            "maxPrice",
            "currency",
            "minRating",
            "minYield",
            "minCapitalAtMat",
            "minSAY"
        ];

        preset.filters.groups.forEach(group => {
            // Store group filters
            const mergedFilters = { ...group.filters };

            // Override ad-hoc
            overridableKeys.forEach(key => {
                if (uiFilters[key] !== "" && uiFilters[key] !== null) {
                    mergedFilters[key] = uiFilters[key];
                }
            });

            let filtered = filterBonds(allBonds, mergedFilters);
            filtered.sort((a, b) => b.currYield - a.currYield);
            filtered.slice(0, group.top)
                .forEach(bond => resultSet.add(bond));
        });

        bondIndex.forEach(bond => {
            bond.row.style.display = resultSet.has(bond) ? "" : "none";
        });
    }

    /* =========================
       UI HELPERS
    ========================== */
    function postFilterUIUpdates() {
        applyHeatmap();
        syncBasketButtons();
        checkWishlistAlerts();
        syncWishlistButtons();
    }

    /* =========================
       PUBLIC API
    ========================== */
    return {
        init,
        filterTable,
        resolveMaturityBounds
    };
})();



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
        let x = parseValue(a.cells[col].innerText);
        let y = parseValue(b.cells[col].innerText);

        // SPECIAL CASE: RATING COLUMN
        if (col === COL.RATING) {
            x = RATING_RANK[x] ?? -999;
            y = RATING_RANK[y] ?? -999;
            return dir === "asc" ? x - y : y - x;
        }

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

function clearColumnFilters(fromButton=false) {
    document.getElementById("filterMinMat").value = "";
    document.getElementById("filterMaxMat").value = "";

    document.getElementById("filterIsin").value = "";
    document.getElementById("filterIssuer").value = "";
    document.getElementById("filterPriceMin").value = "";
    document.getElementById("filterPriceMax").value = "";
    document.getElementById("filterCurrency").value = "";
    document.getElementById("filterMinRating").value = "";
    document.getElementById("filterminYield").value = "";

    document.getElementById("filterMinCapitalAtMat").value = "";
    document.getElementById("filterMinSAY").value = "";

    if(fromButton) BondFilteringEngine.filterTable("reset"); // remove all pre-filtering in Engine

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
    const dark = isDarkMode();

    // Light palette
    const L = {
        red:       [255, 215, 215],
        yellow:    [255, 245, 190],
        green:     [215, 245, 215],
        darkGreen: [100, 200, 100],
        topGreen:  [50,  180,  50],
    };
    // Dark palette — muted, readable on dark bg
    const D = {
        red:       [ 90,  30,  30],
        yellow:    [ 80,  70,  20],
        green:     [ 25,  70,  30],
        darkGreen: [ 20,  90,  40],
        topGreen:  [ 15, 110,  45],
    };
    const P = dark ? D : L;

    // Text colors: light mode inherits from table; dark mode needs explicit contrast
    const textRed    = dark ? '#e88'  : null;
    const textYellow = dark ? '#dda'  : null;
    const textGreen  = dark ? '#8d8'  : null;
    const textTop    = dark ? '#6e6'  : null;

    function setCellColor(cell, bg, fg) {
        cell.style.backgroundColor = bg;
        cell.style.color = fg || '';
    }

    rows.forEach(r => {
        // === Current Yield ===
        const v = parseNum(r.cells[COL.CURR_YIELD].innerText);
        let bg, fg;

        if (currentMode === "income") {
            if (v <= 3.0) {
                bg = "rgb(" + P.red.join(",") + ")"; fg = textRed;
            } else if (v <= 4.5) {
                bg = lerpColor(P.red, P.yellow, (v - 3.0) / 1.5); fg = textYellow;
            } else if (v <= 5.5) {
                bg = lerpColor(P.yellow, P.green, (v - 4.5) / 1.0); fg = textGreen;
            } else if (v <= 6.5) {
                bg = lerpColor(P.green, P.darkGreen, (v - 5.5) / 1.0); fg = textGreen;
            } else {
                bg = "rgb(" + P.topGreen.join(",") + ")"; fg = textTop;
            }
        } else {
            // SAY mode: subtle
            if (v <= 1.5) {
                bg = dark ? "rgba(90,30,30,0.5)" : "rgba(255,215,215,0.3)"; fg = textRed;
            } else if (v < 3.0) {
                bg = lerpColor(P.red, P.yellow, (v - 1.5) / 1.5); fg = textYellow;
            } else if (v < 5.0) {
                bg = lerpColor(P.yellow, P.green, (v - 3.0) / 2.0); fg = textGreen;
            } else {
                bg = dark ? "rgba(20,80,30,0.6)" : "rgba(215,245,215,0.5)"; fg = textTop;
            }
        }
        setCellColor(r.cells[COL.CURR_YIELD], bg, fg);

        // === Total Capital at Maturity ===
        const w = parseNum(r.cells[COL.CAPITAL_AT_MAT].innerText);
        let bg2, fg2;
        if (w <= 1150) {
            bg2 = dark ? "rgba(90,30,30,0.5)" : "rgba(255,215,215,0.3)"; fg2 = textRed;
        } else if (w < 1400) {
            bg2 = lerpColor(P.red, P.yellow, (w - 1150) / 250); fg2 = textYellow;
        } else if (w < 1650) {
            bg2 = lerpColor(P.yellow, P.green, (w - 1400) / 250); fg2 = textGreen;
        } else {
            bg2 = dark ? "rgba(20,80,30,0.6)" : "rgba(215,245,215,0.5)"; fg2 = textTop;
        }
        setCellColor(r.cells[COL.CAPITAL_AT_MAT], bg2, fg2);

        // === SAY ===
        const say = parseNum(r.cells[COL.SAY].innerText);
        let bg3, fg3;

        if (currentMode !== "income") {
            // Capital Gain / SAY MODE: strong coloring
            if (say <= 1.0) {
                bg3 = "rgb(" + P.red.join(",") + ")"; fg3 = textRed;
            } else if (say <= 2.5) {
                bg3 = lerpColor(P.red, P.yellow, (say - 1.0) / 1.5); fg3 = textYellow;
            } else if (say <= 3.5) {
                bg3 = lerpColor(P.yellow, P.green, (say - 2.5) / 1.0); fg3 = textGreen;
            } else if (say <= 4.5) {
                bg3 = lerpColor(P.green, P.darkGreen, (say - 3.5) / 1.0); fg3 = textGreen;
            } else {
                bg3 = "rgb(" + P.topGreen.join(",") + ")"; fg3 = textTop;
            }
        } else {
            // INCOME MODE: subtle SAY
            if (say <= 1.0) {
                bg3 = dark ? "rgba(90,30,30,0.3)" : "rgba(255,215,215,0.2)"; fg3 = textRed;
            } else if (say <= 2.5) {
                bg3 = dark ? "rgba(80,70,20,0.3)" : "rgba(255,245,190,0.2)"; fg3 = textYellow;
            } else if (say <= 3.5) {
                bg3 = dark ? "rgba(25,70,30,0.3)" : "rgba(215,245,215,0.2)"; fg3 = textGreen;
            } else {
                bg3 = dark ? "rgba(20,80,30,0.4)" : "rgba(215,245,215,0.3)"; fg3 = textTop;
            }
        }
        setCellColor(r.cells[COL.SAY], bg3, fg3);
    });
}

function lerpColor(c1, c2, t) {
    return "rgb(" +
        Math.round(c1[0] + (c2[0] - c1[0]) * t) + "," +
        Math.round(c1[1] + (c2[1] - c1[1]) * t) + "," +
        Math.round(c1[2] + (c2[2] - c1[2]) * t) + ")";
}

function isDarkMode() {
    return document.body.classList.contains('dark');
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

function formatDate(date) {
    if (!date) return "";

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

/* =======================
   PROFILE MANAGER  (v5.3)
   State lives in localStorage:
     bondProfileOrder    → ["cashParking","ultraShortHigh", ...]   full ordered list of ids
     bondProfileSelected → ["cashParking","balancedCore", ...]     ids with ✓
     bondCustomProfiles  → [{id,name,emoji,description,profileType,sortedBy,filters}, ...]
======================= */

// ids of built-in profiles (order = YAML order, used as fallback)
const BUILTIN_IDS = ["retirement_32_35", "cashParking","ultraShortHigh","balancedCore","deepDiscount",
                     "maxIncome","fortressSafe","longQuality","retirementIncome"];

function _profileOrder() {
    try { return JSON.parse(localStorage.getItem('bondProfileOrder') || 'null'); } catch(e){ return null; }
}
function _profileSelected() {
    try { return JSON.parse(localStorage.getItem('bondProfileSelected') || 'null'); } catch(e){ return null; }
}
function _customProfiles() {
    try { return JSON.parse(localStorage.getItem('bondCustomProfiles') || '[]'); } catch(e){ return []; }
}
function _saveProfileOrder(arr)    { localStorage.setItem('bondProfileOrder',    JSON.stringify(arr)); }
function _saveProfileSelected(arr) { localStorage.setItem('bondProfileSelected', JSON.stringify(arr)); }
function _saveCustomProfiles(arr)  { localStorage.setItem('bondCustomProfiles',  JSON.stringify(arr)); }

/** Returns full ordered list of profile ids (builtin + custom), respecting saved order */
function _allProfileIds() {
    const custom = _customProfiles().map(p => p.id);
    const all    = [...BUILTIN_IDS, ...custom];
    const saved  = _profileOrder();
    if (!saved) return all;
    // keep saved order, drop ids no longer existing, append new ones at end
    const valid  = saved.filter(id => all.includes(id));
    const added  = all.filter(id => !valid.includes(id));
    return [...valid, ...added];
}

/** Returns set of selected profile ids */
function _selectedSet() {
    const saved = _profileSelected();
    if (saved) return new Set(saved);
    // default: all builtin selected
    return new Set(BUILTIN_IDS);
}

/** Toggle selection of a profile */
function toggleProfileSelected(id) {
    const sel = _selectedSet();
    if (sel.has(id)) sel.delete(id); else sel.add(id);
    _saveProfileSelected([...sel]);
    renderProfileChips();
    renderProfileBar();
}

/** Delete a custom profile */
function deleteCustomProfile(id) {
    const customs = _customProfiles().filter(p => p.id !== id);
    _saveCustomProfiles(customs);
    // also remove from order and selected
    _saveProfileOrder(_allProfileIds().filter(x => x !== id));
    const sel = _selectedSet(); sel.delete(id); _saveProfileSelected([...sel]);
    // remove from PRESETS
    delete getPresetById(id);
    renderProfileChips();
    renderProfileBar();
}

/* ── Render the chips inside the Settings modal ── */
function renderProfileChips() {
    const container = document.getElementById('profileChips');
    if (!container) return;

    const ids     = _allProfileIds();
    const sel     = _selectedSet();
    const customs = new Set(_customProfiles().map(p => p.id));

    container.innerHTML = '';

    ids.forEach(id => {
        const preset  = getPresetById(id);
        if (!preset) return;
        const isSelected = sel.has(id);
        const isCustom   = customs.has(id);

        const chip = document.createElement('div');
        chip.className = 'profile-chip' + (isSelected ? ' profile-chip--selected' : '') + (isCustom ? ' profile-chip--custom' : '');
        chip.draggable = true;
        chip.dataset.id = id;

        // checkmark
        const check = document.createElement('span');
        check.className = 'profile-chip__check';
        check.textContent = '✓';

        // label (click = toggle)
        const label = document.createElement('span');
        label.className = 'profile-chip__label';
        label.textContent = (preset.emoji || '') + ' ' + preset.label;
        label.title = preset.description || '';
        label.onclick = () => toggleProfileSelected(id);

        chip.appendChild(check);
        chip.appendChild(label);

        // X button for custom profiles
        if (isCustom) {
            const del = document.createElement('button');
            del.className = 'profile-chip__delete';
            del.textContent = '✕';
            del.title = 'Remove profile';
            del.onclick = (e) => { e.stopPropagation(); deleteCustomProfile(id); };
            chip.appendChild(del);
        }

        // drag handle
        const handle = document.createElement('span');
        handle.className = 'profile-chip__handle';
        handle.innerHTML = '⠿';
        handle.title = 'Drag to reorder';
        chip.appendChild(handle);

        container.appendChild(chip);
    });

    _initChipDrag(container);
}

/* ── Drag-and-drop for chips ── */
let _dragSrc = null;
function _initChipDrag(container) {
    container.querySelectorAll('.profile-chip').forEach(chip => {
        chip.addEventListener('dragstart', e => {
            _dragSrc = chip;
            chip.classList.add('profile-chip--dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        chip.addEventListener('dragend', () => {
            chip.classList.remove('profile-chip--dragging');
            container.querySelectorAll('.profile-chip').forEach(c => c.classList.remove('profile-chip--dragover'));
            // save new order
            const newOrder = [...container.querySelectorAll('.profile-chip')].map(c => c.dataset.id);
            _saveProfileOrder(newOrder);
            renderProfileBar();
        });
        chip.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (_dragSrc && _dragSrc !== chip) {
                container.querySelectorAll('.profile-chip').forEach(c => c.classList.remove('profile-chip--dragover'));
                chip.classList.add('profile-chip--dragover');
            }
        });
        chip.addEventListener('drop', e => {
            e.preventDefault();
            if (_dragSrc && _dragSrc !== chip) {
                const chips = [...container.querySelectorAll('.profile-chip')];
                const fromIdx = chips.indexOf(_dragSrc);
                const toIdx   = chips.indexOf(chip);
                if (fromIdx < toIdx) chip.after(_dragSrc);
                else chip.before(_dragSrc);
            }
        });
    });
}

/* ── Render the homepage preset bar (only selected, in order) ── */
function renderProfileBar() {
    const bar = document.getElementById('profilePresetsBar');
    if (!bar) return;

    const ids = _allProfileIds();
    const sel = _selectedSet();

    // remove all buttons (keep label and presetDesc)
    bar.querySelectorAll('.preset-button').forEach(b => b.remove());

    const desc  = document.getElementById('presetDesc');
    const label = bar.querySelector('label');

    ids.filter(id => sel.has(id)).forEach(id => {
        const preset = getPresetById(id);
        if (!preset) return;
        const btn = document.createElement('button');
        btn.className = 'preset-button';
        btn.id = 'bar-' + id;
        btn.title = preset.description || '';
        btn.textContent = (preset.emoji || '') + ' ' + preset.label;
        btn.onclick = () => applyPreset(id);
        // insert before presetDesc
        bar.insertBefore(btn, desc);
    });
}

/* ── updatePresetButtons: highlights active button in the bar ── */
function updatePresetButtons(activeId) {
    document.querySelectorAll('#profilePresetsBar .preset-button').forEach(btn => {
        const id = btn.id.replace('bar-', '');
        btn.classList.toggle('active', id === activeId);
    });
}

/* =======================
   YAML IMPORT
======================= */
function handleYamlImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    const note = document.getElementById('profileImportNote');

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const parsed = parseYamlProfiles(e.target.result);
            if (parsed && parsed.length > 0) {
                // merge into custom profiles (replace if same id)
                const existing = _customProfiles().filter(p => !parsed.find(x => x.id === p.id));
                const merged   = [...existing, ...parsed];

                // register in PRESETS
                merged.map(normalizePreset)
                  .forEach(p => {
                      const index = PRESETS.findIndex(pr => pr.id === p.id);
                      if (index !== -1) {
                          PRESETS[index] = p;
                      } else {
                          PRESETS.push(p);
                      }
                  });

                if (note) { note.textContent = '✅ ' + parsed.length + ' profile(s) imported.'; note.style.color = '#4CAF50'; }

                _saveCustomProfiles(merged);
                renderProfileChips();
                renderProfileBar();
            } else {
                if (note) { note.textContent = '⚠️ No valid profiles found.'; note.style.color = '#ff9800'; }
            }
        } catch(err) {
            if (note) {
                note.textContent = '❌ Parse error: ' + err.message; note.style.color = '#f44336';
                console.log("❌ YAML Parse error: " + err.stack);
            }
        }
        event.target.value = '';
    };
    reader.readAsText(file);
}

function parseYamlProfiles(yamlText) {
     try {
           const data = jsyaml.load(yamlText);

           if (!data || !Array.isArray(data.profiles)) {
               console.warn("No valid 'profiles' array found in YAML");
               return [];
           }

           return data.profiles;
       } catch (err) {
           console.error("YAML parsing error:", err);
           return [];
       }
}

// mergeCustomProfiles replaced by new profile manager (v5.3)


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

function applyPreset(presetName) {
    showLoading();

    setTimeout(() => {
        const preset = getPresetById(presetName);
        if (!preset) {
            hideLoading();
            return;
        }

        clearColumnFilters();

        currentMode = preset.profileType ? preset.profileType.toLowerCase() : "say";

        if (preset.filters?.mode !== "COMPOSITE") {
            // Price
            document.getElementById("filterPriceMin").value = preset.filters.minPrice || "";
            document.getElementById("filterPriceMax").value = preset.filters.maxPrice || "";

            // Rating
            document.getElementById("filterMinRating").value = preset.filters.minRating || "";

            // Dates
            const { minDate, maxDate } = BondFilteringEngine.resolveMaturityBounds(preset.filters);
            if(minDate) {
                document.getElementById("filterMinMat").value = formatDate(minDate);
            }
            if(maxDate) {
                document.getElementById("filterMaxMat").value = formatDate(maxDate);
            }

            // Mode-specific filters
            document.getElementById("filterminYield").value = preset.filters.minYield || "";
            document.getElementById("filterMinCapitalAtMat").value = preset.filters.minCapitalAtMat || "";
            document.getElementById("filterMinSAY").value = preset.filters.minSAY || "";
        }

        // Just 1 entry point to filtering engine
        BondFilteringEngine.filterTable(preset);

        updatePresetButtons(presetName);
        updateLegend();
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

// updatePresetButtons defined in profile manager (v5.3)


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
   SETTINGS / THEME
======================= */
function openSettingsModal() {
    document.getElementById('settingsBackdrop').classList.add('open');
    _updateThemeToggleUI();
    _applyBaseCurrencyUI();
}
function closeSettingsModal(e) {
    if (e.target === document.getElementById('settingsBackdrop')) closeSettingsModalDirect();
}
function closeSettingsModalDirect() {
    document.getElementById('settingsBackdrop').classList.remove('open');
}

function _updateThemeToggleUI() {
    const dark = document.body.classList.contains('dark');
    const text = document.getElementById('themeText');
    if (text) text.textContent = dark ? 'Dark' : 'Light';
}

function toggleTheme() {
    const dark = document.body.classList.toggle('dark');
    localStorage.setItem('bondTheme', dark ? 'dark' : 'light');
    _updateThemeToggleUI();
    if (typeof applyHeatmap === 'function') applyHeatmap();
}

function loadTheme() {
    const saved = localStorage.getItem('bondTheme');
    if (saved === 'dark') {
        document.body.classList.add('dark');
    }
}

// Apply theme immediately (before DOM fully painted) to avoid flash
loadTheme();

/* =======================
   BASE CURRENCY SYSTEM
======================= */
// All bond values are stored in EUR in the backend.
// The base currency setting converts them for display only.

const CURRENCY_SYMBOLS = { EUR: '€', CHF: '₣', USD: '$', GBP: '£' };
const SUPPORTED_CURRENCIES = ['EUR', 'CHF', 'USD', 'GBP'];

// FX rates from ECB via /api/fx-rates (EUR=1, others = units of CCY per 1 EUR)
// e.g. USD=1.08 means 1 EUR = 1.08 USD
let _fxRates = { EUR: 1.0, CHF: 0.93, USD: 1.08, GBP: 0.86 }; // sensible defaults

async function _loadFxRates() {
    try {
        const res = await fetch('/api/fx-rates');
        if (res.ok) _fxRates = await res.json();
    } catch(e) { /* use defaults */ }
}

function getBaseCurrency() {
    return localStorage.getItem('bondBaseCurrency') || 'EUR';
}

function getCurrencySymbol(ccy) {
    return CURRENCY_SYMBOLS[ccy] || ccy;
}

/** Convert an EUR amount to the current base currency. */
function eurToBase(eurAmount) {
    const ccy = getBaseCurrency();
    if (ccy === 'EUR') return eurAmount;
    // _fxRates[ccy] = how many CCY per 1 EUR
    return eurAmount * (_fxRates[ccy] || 1.0);
}

/** Format a base-currency amount with its symbol. */
function fmtBase(eurAmount, decimals = 0) {
    const sym = getCurrencySymbol(getBaseCurrency());
    const val = eurToBase(eurAmount);
    return sym + (decimals > 0 ? val.toFixed(decimals) : Math.round(val).toLocaleString());
}

function setBaseCurrency(ccy) {
    if (!SUPPORTED_CURRENCIES.includes(ccy)) return;
    localStorage.setItem('bondBaseCurrency', ccy);
    _applyBaseCurrencyUI();
    _refreshBaseCurrencyCells();
    // If portfolio analyzer is open, re-render its data too
    if (window.portfolioAnalyzer) {
        window.portfolioAnalyzer.updatePortfolioTable();
        window.portfolioAnalyzer.updateStatistics();
        window.portfolioAnalyzer.updateCalendars();
    }
}

function _applyBaseCurrencyUI() {
    const ccy = getBaseCurrency();
    const sym = getCurrencySymbol(ccy);
    // Update page title
    const titleEl = document.getElementById('titleCurrency');
    if (titleEl) {
        const symbol = sym || ccy;
        titleEl.innerHTML = '(<b>' + symbol + '</b>)';
    }
    // Update Price column TH
    const thPrice = document.getElementById('thPriceCurrency');
    if (thPrice) thPrice.textContent = ccy;
    // Update Total Return TH symbol spans
    document.querySelectorAll('.th-base-ccy').forEach(el => el.textContent = sym);
    // Update currency selector active button
    document.querySelectorAll('.currency-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.ccy === ccy);
    });
    // Update FX rate note in settings
    const note = document.getElementById('fxRateNote');
    if (note) {
        if (ccy === 'EUR') {
            note.textContent = '';
        } else {
            const rate = (_fxRates[ccy] || 1).toFixed(4);
            note.textContent = `1 EUR = ${rate} ${ccy} (ECB rate)`;
        }
    }
}

function _refreshBaseCurrencyCells() {
    // Re-render PRICE_R and CAPITAL_AT_MAT columns from data-* attributes
    const rows = document.querySelectorAll('#bondTable tbody tr');
    rows.forEach(r => {
        // PRICE_R cell (col 6): data-price-eur attribute
        const priceEur = parseFloat(r.dataset.priceEur || r.cells[COL.PRICE_R]?.dataset?.priceEur || 0);
        if (priceEur && r.cells[COL.PRICE_R]) {
            r.cells[COL.PRICE_R].textContent = eurToBase(priceEur).toFixed(2);
        }
        // CAPITAL_AT_MAT cell (col 10): data-capital-eur attribute
        const capEur = parseFloat(r.cells[COL.CAPITAL_AT_MAT]?.dataset?.capitalEur || 0);
        if (capEur && r.cells[COL.CAPITAL_AT_MAT]) {
            r.cells[COL.CAPITAL_AT_MAT].textContent = Math.round(eurToBase(capEur));
        }
    });
    applyHeatmap();
}


/* =======================
   SETTINGS EXPORT / IMPORT
======================= */

function exportSettings() {
    const note = document.getElementById('settingsBackupNote');
    try {
        const settings = {
            _version: '5.3',
            _exported: new Date().toISOString(),
            theme:          localStorage.getItem('bondTheme') || 'light',
            baseCurrency:   localStorage.getItem('bondBaseCurrency') || 'EUR',
            basket:         JSON.parse(localStorage.getItem('bondBasket')    || '[]'),
            wishlist:       JSON.parse(localStorage.getItem('bondWishlist')  || '[]'),
            profileOrder:   _allProfileIds(),
            profileSelected:[..._selectedSet()],
            customProfiles: _customProfiles(),
        };
        const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'bondfx-settings-' + new Date().toISOString().slice(0,10) + '.json';
        link.click();
        if (note) { note.textContent = '✅ Settings exported successfully.'; note.style.color = '#4CAF50'; }
    } catch(e) {
        if (note) { note.textContent = '❌ Export failed: ' + e.message; note.style.color = '#f44336'; }
    }
}

function importSettings(event) {
    const file = event.target.files[0];
    const note = document.getElementById('settingsBackupNote');
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const s = JSON.parse(e.target.result);
            if (!s._version) throw new Error('Not a valid BondFX settings file');

            // Theme
            if (s.theme === 'dark') document.body.classList.add('dark');
            else document.body.classList.remove('dark');
            localStorage.setItem('bondTheme', s.theme || 'light');

            // Base currency
            if (s.baseCurrency) {
                localStorage.setItem('bondBaseCurrency', s.baseCurrency);
                _applyBaseCurrencyUI();
                _refreshBaseCurrencyCells();
            }

            // Basket
            if (Array.isArray(s.basket)) {
                localStorage.setItem('bondBasket', JSON.stringify(s.basket));
                if (typeof renderBasket === 'function') renderBasket();
                if (typeof syncBasketButtons === 'function') syncBasketButtons();
            }

            // Wishlist
            if (Array.isArray(s.wishlist)) {
                localStorage.setItem('bondWishlist', JSON.stringify(s.wishlist));
                if (typeof renderWishlist === 'function') renderWishlist();
                if (typeof syncWishlistButtons === 'function') syncWishlistButtons();
            }

            // Custom profiles
            if (Array.isArray(s.customProfiles)) {
                _saveCustomProfiles(s.customProfiles);
               s.customProfiles.forEach(p => {
                   const normalized = normalizePreset(p);
                   const index = PRESETS.findIndex(pr => pr.id === normalized.id);
                   if (index !== -1) {
                       PRESETS[index] = normalized;   // update
                   } else {
                       PRESETS.push(normalized);      // insert
                   }
               });
            }

            // Profile order & selection
            if (Array.isArray(s.profileOrder))    _saveProfileOrder(s.profileOrder);
            if (Array.isArray(s.profileSelected)) _saveProfileSelected(s.profileSelected);

            _updateThemeToggleUI();
            renderProfileChips();
            renderProfileBar();

            if (note) {
                note.textContent = `✅ Imported: theme, currency, ${s.basket?.length||0} basket, ${s.wishlist?.length||0} alerts, ${s.customProfiles?.length||0} custom profile(s).`;
                note.style.color = '#4CAF50';
            }
        } catch(err) {
            if (note) { note.textContent = '❌ Import failed: ' + err.message; note.style.color = '#f44336'; }
        }
        event.target.value = '';
    };
    reader.readAsText(file);
}

function getPresetById(id) {
    return PRESETS.find(p => p.id === id);
}

function normalizePreset(p) {

    const base = {
        id: p.id,
        label: p.label || p.id,
        emoji: p.emoji || '🎯',
        description: p.description || '',
        profileType: p.profileType || 'SAY',
        sortedBy: p.sortedBy || (p.profileType === 'income' ? 'CURR_YIELD' : 'SAY')
    };

    const filters = p.filters || {};

    // ---- COMPOSITE (auto-detected by groups) ----
    if (Array.isArray(filters.groups)) {

        return {
            ...base,
            filters: {
                groups: filters.groups.map(g => ({
                    filters: g.filters || {},
                    top: typeof g.top === 'number' ? g.top : 999
                }))
            }
        };
    }

    // ---- SIMPLE ----
    return {
        ...base,
        filters
    };
}

/* =======================
   INITIALIZATION
======================= */
document.addEventListener("DOMContentLoaded", () => {
    BondFilteringEngine.init();

    // v5.3 profile system: register custom profiles from localStorage into PRESETS
    _customProfiles().forEach(p => {
       const index = PRESETS.findIndex(pr => pr.id === p.id);

           const normalized = normalizePreset(p);

           if (index !== -1) {
               PRESETS[index] = normalized;   // update
           } else {
               PRESETS.push(normalized);      // insert
           }
    });
    renderProfileBar();    // populate homepage bar with selected profiles
    renderProfileChips();  // populate settings modal chips

    // Apply first selected profile in the bar (user-configured order)
    (function() {
        const ids = _allProfileIds().filter(id => _selectedSet().has(id));
        if (ids.length > 0) applyPreset(ids[0]);
    })();
    renderBasket();
    checkWishlistAlerts();
    renderWishlist();
    syncWishlistButtons();
    _updateThemeToggleUI();
    _loadFxRates().then(() => {
        _applyBaseCurrencyUI();
        _refreshBaseCurrencyCells();
    });
    if (typeof twemoji !== 'undefined') {
      document.querySelectorAll('td.td-issuer, span.basket-item__label')
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
