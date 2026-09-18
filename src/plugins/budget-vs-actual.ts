import type { MapPlugin } from "./core";
import { getMunicipalityCode } from "../municipality";

const API_BASE = "https://municipaldata.treasury.gov.za/api/cubes/incexp_v2/aggregate";
const BUDGET_AMOUNT_TYPE = "ORGB"; // Original Budget — fixed reference point

// "ACT" (in-year actual) has no data at all in this cube (verified against
// the live API), so only these three "actual" variants are offered.
const ACTUAL_TYPES: { code: string; label: string }[] = [
  { code: "AUDA", label: "Audited Actual" },
  { code: "PAUD", label: "Pre-audit" },
  { code: "RAUD", label: "Restructured Audit" },
];

// Years where Original Budget and an audited/pre-audit actual figure
// realistically overlap for most municipalities. ORGB has no data before
// 2020; audited actuals lag the current financial year by roughly a year,
// so 2025 (FY ending June 2025) is the most recent year with broad
// audited-actual coverage.
const MIN_YEAR = 2020;
const MAX_YEAR = 2025;

// Line items (Section 71 return form) — revenue and operating expenditure,
// excluding composed subtotals (2900 Total Revenue, 4400 Total
// Expenditure, etc.). Treasury only stores those subtotals as facts from
// roughly FY2023 onward; summing the components ourselves is what works
// consistently across all years, and matches Treasury's own subtotal
// exactly in years where it's also present as a fact (verified).
const ITEM_LABELS: Record<string, string> = {
  "0300": "Service charges – Electricity",
  "0400": "Service charges – Water",
  "0500": "Service charges – Waste Water Management",
  "0600": "Service charges – Waste Management",
  "0700": "Sale of Goods and Rendering of Services",
  "0800": "Agency services",
  "0900": "Interest – Deemed Interest",
  "1000": "Interest earned from Receivables",
  "1100": "Interest earned from Current and Non Current Assets",
  "1200": "Dividends",
  "1300": "Rent on Land",
  "1400": "Rental from Fixed Assets",
  "1500": "Licence or permits",
  "1550": "Special rating levies",
  "1570": "Construction Contract Revenue",
  "1590": "Development Charges",
  "1600": "Operational Revenue",
  "1700": "Gains on disposal of PPE",
  "1800": "Property rates",
  "1900": "Surcharges and Taxes",
  "2000": "Fines, penalties and forfeits",
  "2100": "Licences or permits",
  "2200": "Transfers and subsidies – Operational",
  "2300": "Interest Receivables",
  "2400": "Fuel Levy",
  "2500": "Operational Revenue",
  "2600": "Gains on Disposal of Fixed and Intangible Assets",
  "2700": "Other Gains",
  "2800": "Discontinued Operations",
  "3000": "Loss on disposal of PPE",
  "3100": "Employee related costs",
  "3200": "Remuneration of councillors",
  "3300": "Bulk purchases – electricity",
  "3400": "Inventory consumed",
  "3500": "Debt impairment",
  "3600": "Depreciation, Amortisation and Impairment",
  "3700": "Interest, Dividends and Rent on Land",
  "3800": "Contracted services",
  "3900": "Transfers and subsidies",
  "4000": "Irrecoverable debts written off",
  "4100": "Operational Cost and Other Cost",
  "4200": "Disposal of Fixed and Intangible Assets",
  "4300": "Other Losses",
};
const EXPENDITURE_ITEM_CODES = new Set([
  "3000", "3100", "3200", "3300", "3400", "3500",
  "3600", "3700", "3800", "3900", "4000", "4100", "4200", "4300",
]);

// Overall deviation bands (Actual vs Original Budget, Total Expenditure).
// Diverging scale: communicates direction + magnitude, not a value
// judgement about which side is "better" — under-spending has its own
// service-delivery implications, not just over-spending.
const DEVIATION_BANDS: { max: number; color: string; label: string }[] = [
  { max: -0.15, color: "#3a6ea8", label: "Well under budget (< -15%)" },
  { max: -0.05, color: "#8aafc9", label: "Under budget (-15% to -5%)" },
  { max: 0.05, color: "#cfc7ab", label: "On budget (±5%)" },
  { max: 0.15, color: "#d99a6c", label: "Over budget (5% to 15%)" },
  { max: Infinity, color: "#a8442f", label: "Well over budget (> 15%)" },
];

interface MuniFinancials {
  totalExpenditure: number;
  items: Record<string, number>;
}
interface MuniComparison {
  budget: MuniFinancials;
  actual: MuniFinancials;
  deviationRatio: number; // (actual - budget) / budget, on Total Expenditure
}

function colorForDeviation(ratio: number): string {
  for (const band of DEVIATION_BANDS) {
    if (ratio <= band.max) return band.color;
  }
  return DEVIATION_BANDS[DEVIATION_BANDS.length - 1].color;
}

function formatRand(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  if (abs >= 1_000_000_000) return `${sign}R${(abs / 1_000_000_000).toFixed(2)} billion`;
  if (abs >= 1_000_000) return `${sign}R${(abs / 1_000_000).toFixed(1)} million`;
  return `${sign}R${Math.round(abs).toLocaleString("en-ZA")}`;
}

async function fetchFinancials(
  year: number,
  amountType: string,
): Promise<Map<string, MuniFinancials>> {
  const url =
    `${API_BASE}?cut=financial_year_end.year:${year}` +
    `|amount_type.code:"${amountType}"|period_length.length:"year"` +
    "&drilldown=demarcation.code|item.code&aggregates=amount.sum&page_size=10000";

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { cells: Array<Record<string, unknown>> };

  const byMuni = new Map<string, MuniFinancials>();
  for (const cell of json.cells) {
    const itemCode = String(cell["item.code"]);
    if (!(itemCode in ITEM_LABELS)) continue; // skip composed subtotal rows

    const code = String(cell["demarcation.code"]);
    const amount = Number(cell["amount.sum"] ?? 0);
    if (!byMuni.has(code)) byMuni.set(code, { totalExpenditure: 0, items: {} });
    const rec = byMuni.get(code)!;
    rec.items[itemCode] = (rec.items[itemCode] ?? 0) + amount;
    if (EXPENDITURE_ITEM_CODES.has(itemCode)) rec.totalExpenditure += amount;
  }
  return byMuni;
}

function computeComparisons(
  budgetData: Map<string, MuniFinancials>,
  actualData: Map<string, MuniFinancials>,
): Map<string, MuniComparison> {
  const result = new Map<string, MuniComparison>();
  for (const [code, budget] of budgetData) {
    const actual = actualData.get(code);
    if (!actual || budget.totalExpenditure <= 0) continue;
    result.set(code, {
      budget,
      actual,
      deviationRatio: (actual.totalExpenditure - budget.totalExpenditure) / budget.totalExpenditure,
    });
  }
  return result;
}

export function createBudgetVsActualPlugin(
  setColors: (colorByCode: Map<string, string> | null) => void,
  refreshPanel: () => void,
): MapPlugin {
  let year = MAX_YEAR;
  let actualType = ACTUAL_TYPES[0].code;
  let comparisons: Map<string, MuniComparison> | null = null;
  let loading = false;
  let loadError: string | null = null;
  let active = false;
  let loadToken = 0;
  const pendingListeners: Array<() => void> = [];
  let renderConfigNow: (() => void) | null = null;

  function applyColors() {
    if (!active) return;
    if (!comparisons) {
      setColors(null);
      return;
    }
    const colorByCode = new Map<string, string>();
    for (const [code, cmp] of comparisons) {
      colorByCode.set(code, colorForDeviation(cmp.deviationRatio));
    }
    setColors(colorByCode);
  }

  // A newer request (year slider / actual-type dropdown) can start before
  // an older one resolves — the token guard drops a stale response
  // instead of letting a slow earlier fetch clobber a newer one.
  function startLoad() {
    const token = ++loadToken;
    loading = true;
    comparisons = null;
    loadError = null;

    void (async () => {
      try {
        const [budgetData, actualData] = await Promise.all([
          fetchFinancials(year, BUDGET_AMOUNT_TYPE),
          fetchFinancials(year, actualType),
        ]);
        if (token !== loadToken) return; // superseded by a later request
        comparisons = computeComparisons(budgetData, actualData);
      } catch (err) {
        if (token !== loadToken) return;
        loadError = (err as Error).message;
      } finally {
        if (token === loadToken) {
          loading = false;
          const listeners = pendingListeners.splice(0);
          for (const listener of listeners) listener();
        }
      }
    })();
  }

  // Multiple independent call sites (onActivate, renderConfig) may all
  // want to know when the current data becomes available. If a load is
  // already in flight, just queue behind it rather than starting another
  // — but always register interest, even when one is already running.
  function ensureLoaded(onDone: () => void) {
    if (comparisons || loadError) {
      onDone();
      return;
    }
    pendingListeners.push(onDone);
    if (!loading) startLoad();
  }

  // User explicitly changed a control (year/actual type) — always start a
  // fresh fetch even if we already have cached comparisons.
  function forceReload(onDone: () => void) {
    pendingListeners.push(onDone);
    startLoad();
  }

  return {
    id: "budget-vs-actual",
    name: "Budget vs actual",
    category: "coloring",
    onActivate() {
      active = true;
      if (comparisons) applyColors();
      else ensureLoaded(applyColors);
    },
    onDeactivate() {
      active = false;
      setColors(null);
    },
    renderConfig(container) {
      const render = () => {
        container.innerHTML = "";

        const field = document.createElement("div");
        field.className = "plugin-field";
        const label = document.createElement("label");
        label.append(document.createTextNode("Actual:"));
        const select = document.createElement("select");
        for (const opt of ACTUAL_TYPES) {
          const option = document.createElement("option");
          option.value = opt.code;
          option.textContent = opt.label;
          option.selected = opt.code === actualType;
          select.append(option);
        }
        select.addEventListener("change", () => {
          actualType = select.value;
          forceReload(() => {
            render();
            applyColors();
            refreshPanel();
          });
          render();
        });
        label.append(select);
        field.append(label);
        container.append(field);

        if (loading) {
          const p = document.createElement("p");
          p.textContent = "Loading…";
          container.append(p);
          return;
        }
        if (loadError) {
          const p = document.createElement("p");
          p.className = "plugin-error";
          p.textContent = `Could not load data: ${loadError}`;
          container.append(p);
          return;
        }

        const intro = document.createElement("p");
        intro.textContent = `Actual expenditure vs Original Budget, FY${year}.`;
        container.append(intro);

        const legend = document.createElement("ul");
        legend.className = "plugin-legend";
        for (const band of DEVIATION_BANDS) {
          const item = document.createElement("li");
          const swatch = document.createElement("span");
          swatch.className = "plugin-legend-swatch";
          swatch.style.background = band.color;
          item.append(swatch, document.createTextNode(` ${band.label}`));
          legend.append(item);
        }
        container.append(legend);
      };

      renderConfigNow = render;
      render();
      ensureLoaded(() => {
        render();
        applyColors();
      });
    },
    renderControls(container) {
      const wrap = document.createElement("div");
      wrap.className = "year-slider";

      const label = document.createElement("span");
      label.className = "year-slider-label";
      label.textContent = `FY ${year}`;

      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = String(MIN_YEAR);
      slider.max = String(MAX_YEAR);
      slider.step = "1";
      slider.value = String(year);
      slider.addEventListener("input", () => {
        year = Number(slider.value);
        label.textContent = `FY ${year}`;
      });
      slider.addEventListener("change", () => {
        forceReload(() => {
          renderConfigNow?.();
          applyColors();
          refreshPanel();
        });
      });

      wrap.append(label, slider);
      container.append(wrap);
    },
    renderPanel(container, properties) {
      const heading = document.createElement("h3");
      heading.textContent = `Budget vs Actual (FY${year})`;
      container.append(heading);

      const code = getMunicipalityCode(properties);
      const cmp = code ? comparisons?.get(code) : undefined;

      if (!cmp) {
        const p = document.createElement("p");
        p.textContent = loading ? "Loading…" : "No comparable data available.";
        container.append(p);
        return;
      }

      const dl = document.createElement("dl");
      dl.className = "identity-grid";
      const addRow = (labelText: string, value: string) => {
        const dt = document.createElement("dt");
        dt.textContent = labelText;
        const dd = document.createElement("dd");
        dd.textContent = value;
        dl.append(dt, dd);
      };
      addRow("Budget (expenditure)", formatRand(cmp.budget.totalExpenditure));
      addRow("Actual (expenditure)", formatRand(cmp.actual.totalExpenditure));
      addRow(
        "Deviation",
        `${cmp.deviationRatio >= 0 ? "+" : ""}${(cmp.deviationRatio * 100).toFixed(1)}%`,
      );
      container.append(dl);

      const itemCodes = new Set([...Object.keys(cmp.budget.items), ...Object.keys(cmp.actual.items)]);
      const deviations = Array.from(itemCodes)
        .map((itemCode) => {
          const budgetAmount = cmp.budget.items[itemCode] ?? 0;
          const actualAmount = cmp.actual.items[itemCode] ?? 0;
          return { itemCode, delta: actualAmount - budgetAmount };
        })
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 3);

      const subheading = document.createElement("h4");
      subheading.textContent = "Biggest deviations";
      container.append(subheading);

      const list = document.createElement("ul");
      list.className = "deviation-list";
      for (const dev of deviations) {
        const li = document.createElement("li");
        const name = document.createElement("span");
        name.className = "deviation-name";
        name.textContent = ITEM_LABELS[dev.itemCode] ?? dev.itemCode;
        const amount = document.createElement("span");
        amount.className = "deviation-amount";
        amount.textContent = `${dev.delta >= 0 ? "+" : ""}${formatRand(dev.delta)}`;
        li.append(name, amount);
        list.append(li);
      }
      container.append(list);

      const actualLabel = ACTUAL_TYPES.find((opt) => opt.code === actualType)?.label ?? actualType;

      const tableHeading = document.createElement("h4");
      tableHeading.textContent = "All line items";
      container.append(tableHeading);

      const table = document.createElement("table");
      table.className = "line-item-table";

      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      for (const text of ["Item", "Budget", actualLabel]) {
        const th = document.createElement("th");
        th.textContent = text;
        headRow.append(th);
      }
      thead.append(headRow);
      table.append(thead);

      const tbody = document.createElement("tbody");
      for (const itemCode of Object.keys(ITEM_LABELS)) {
        const budgetAmount = cmp.budget.items[itemCode] ?? 0;
        const actualAmount = cmp.actual.items[itemCode] ?? 0;

        const row = document.createElement("tr");
        const nameCell = document.createElement("td");
        nameCell.textContent = ITEM_LABELS[itemCode];
        const budgetCell = document.createElement("td");
        budgetCell.textContent = formatRand(budgetAmount);
        const actualCell = document.createElement("td");
        actualCell.textContent = formatRand(actualAmount);
        row.append(nameCell, budgetCell, actualCell);
        tbody.append(row);
      }
      table.append(tbody);
      container.append(table);
    },
  };
}
