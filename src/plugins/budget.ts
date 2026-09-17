import type { MapPlugin } from "./core";
import { getMunicipalityCode } from "../municipality";

// National Treasury Municipal Money API (municipaldata.treasury.gov.za),
// "Income and Expenditure (v2)" cube — Section 71 mSCOA aggregation.
// Public, CORS-enabled (verified: responds with
// access-control-allow-origin: * when a browser Origin header is sent).
const API_BASE = "https://municipaldata.treasury.gov.za/api/cubes/incexp_v2/aggregate";

// FY2025 (year ending 30 June 2025) Original Budget. FY2026 exists in the
// API but its item/row counts and totals are roughly double neighbouring
// years for spot-checked municipalities — looks like still-settling data,
// so FY2025 was used as the last year that passed a sanity check.
const FINANCIAL_YEAR = 2025;
const AMOUNT_TYPE = "ORGB"; // Original Budget

// mSCOA item codes for the operating-expenditure line items (Section 71
// return form, items 3000-4300). Summed, these reconstruct the "Total
// Expenditure" subtotal (item 4400) — Treasury's API stores only the
// underlying line items as facts, not the composed subtotal itself.
const EXPENDITURE_ITEM_CODES = new Set([
  "3000", "3100", "3200", "3300", "3400", "3500",
  "3600", "3700", "3800", "3900", "4000", "4100", "4200", "4300",
]);
const EMPLOYEE_COST_ITEM_CODE = "3100"; // "Employee related costs"

interface MunicipalBudget {
  totalExpenditure: number;
  employeeCost: number;
  ratio: number;
}

// Staff-cost-to-total-expenditure bands. Fixed in code, not user
// configurable: informed by National Treasury/COGTA norms (staff costs
// are generally expected to stay under ~35-40% of operating expenditure
// for financial sustainability) and the actual FY2025 distribution across
// all 213 municipalities (median ~33%, 90th percentile ~41%).
const RATIO_BANDS: { max: number; color: string; label: string }[] = [
  { max: 0.25, color: "#4f8f72", label: "Under 25%" },
  { max: 0.35, color: "#cbb454", label: "25% – 35%" },
  { max: 0.45, color: "#c17a3a", label: "35% – 45%" },
  { max: Infinity, color: "#a8442f", label: "Over 45%" },
];

function colorForRatio(ratio: number): string {
  for (const band of RATIO_BANDS) {
    if (ratio <= band.max) return band.color;
  }
  return RATIO_BANDS[RATIO_BANDS.length - 1].color;
}

function formatRand(amount: number): string {
  if (amount >= 1_000_000_000) return `R${(amount / 1_000_000_000).toFixed(2)} billion`;
  if (amount >= 1_000_000) return `R${(amount / 1_000_000).toFixed(1)} million`;
  return `R${Math.round(amount).toLocaleString("en-ZA")}`;
}

async function fetchBudgetData(): Promise<Map<string, MunicipalBudget>> {
  const url =
    `${API_BASE}?cut=financial_year_end.year:${FINANCIAL_YEAR}` +
    `|amount_type.code:"${AMOUNT_TYPE}"|period_length.length:"year"` +
    "&drilldown=demarcation.code|item.code&aggregates=amount.sum&page_size=10000";

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { cells: Array<Record<string, unknown>> };

  const totals = new Map<string, { totalExpenditure: number; employeeCost: number }>();
  for (const cell of json.cells) {
    const code = String(cell["demarcation.code"]);
    const itemCode = String(cell["item.code"]);
    const amount = Number(cell["amount.sum"] ?? 0);

    if (!totals.has(code)) totals.set(code, { totalExpenditure: 0, employeeCost: 0 });
    const rec = totals.get(code)!;
    if (EXPENDITURE_ITEM_CODES.has(itemCode)) rec.totalExpenditure += amount;
    if (itemCode === EMPLOYEE_COST_ITEM_CODE) rec.employeeCost += amount;
  }

  const result = new Map<string, MunicipalBudget>();
  for (const [code, rec] of totals) {
    if (rec.totalExpenditure > 0) {
      result.set(code, { ...rec, ratio: rec.employeeCost / rec.totalExpenditure });
    }
  }
  return result;
}

export function createBudgetPlugin(
  setColors: (colorByCode: Map<string, string> | null) => void,
): MapPlugin {
  let data: Map<string, MunicipalBudget> | null = null;
  let loadError: string | null = null;
  let loading = false;
  let active = false;

  function applyColors() {
    if (!active) return;
    if (!data) {
      setColors(null);
      return;
    }
    const colorByCode = new Map<string, string>();
    for (const [code, budget] of data) {
      colorByCode.set(code, colorForRatio(budget.ratio));
    }
    setColors(colorByCode);
  }

  const pendingListeners: Array<() => void> = [];

  async function ensureLoaded(onSettled: () => void) {
    if (data) {
      onSettled();
      return;
    }
    pendingListeners.push(onSettled);
    if (loading) return;

    loading = true;
    try {
      data = await fetchBudgetData();
    } catch (err) {
      loadError = (err as Error).message;
    } finally {
      loading = false;
      const listeners = pendingListeners.splice(0);
      for (const listener of listeners) listener();
    }
  }

  return {
    id: "budget-staff-ratio",
    name: "Staff cost ratio",
    category: "coloring",
    onActivate() {
      active = true;
      if (data) applyColors();
      else void ensureLoaded(applyColors);
    },
    onDeactivate() {
      active = false;
      setColors(null);
    },
    renderConfig(container) {
      const render = () => {
        container.innerHTML = "";

        if (loading) {
          const p = document.createElement("p");
          p.textContent = "Loading budget data…";
          container.append(p);
          return;
        }
        if (loadError) {
          const p = document.createElement("p");
          p.className = "plugin-error";
          p.textContent = `Could not load budget data: ${loadError}`;
          container.append(p);
          return;
        }

        const intro = document.createElement("p");
        intro.textContent =
          `Employee costs as a share of total expenditure ` +
          `(FY${FINANCIAL_YEAR} Original Budget, National Treasury).`;
        container.append(intro);

        const legend = document.createElement("ul");
        legend.className = "plugin-legend";
        for (const band of RATIO_BANDS) {
          const item = document.createElement("li");
          const swatch = document.createElement("span");
          swatch.className = "plugin-legend-swatch";
          swatch.style.background = band.color;
          item.append(swatch, document.createTextNode(` ${band.label}`));
          legend.append(item);
        }
        container.append(legend);
      };

      render();
      if (!data && !loadError) {
        void ensureLoaded(() => {
          render();
          applyColors();
        });
      }
    },
    renderPanel(container, properties) {
      const heading = document.createElement("h3");
      heading.textContent = `Budget (FY${FINANCIAL_YEAR} Original Budget)`;
      container.append(heading);

      const code = getMunicipalityCode(properties);
      const budget = code ? data?.get(code) : undefined;

      if (!budget) {
        const p = document.createElement("p");
        p.textContent = loading
          ? "Loading…"
          : "No budget data available for this municipality.";
        container.append(p);
        return;
      }

      const dl = document.createElement("dl");
      dl.className = "identity-grid";
      const addRow = (label: string, value: string) => {
        const dt = document.createElement("dt");
        dt.textContent = label;
        const dd = document.createElement("dd");
        dd.textContent = value;
        dl.append(dt, dd);
      };
      addRow("Total expenditure", formatRand(budget.totalExpenditure));
      addRow("Employee costs", formatRand(budget.employeeCost));
      addRow("Staff cost ratio", `${(budget.ratio * 100).toFixed(1)}%`);
      container.append(dl);
    },
  };
}
