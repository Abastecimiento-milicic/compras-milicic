/* ===== Cumplimiento de Almacén JS Logic ===== */

let cb = sessionStorage.getItem("mi_cache_buster");
if (!cb) {
  cb = new Date().getTime();
  sessionStorage.setItem("mi_cache_buster", cb);
}
const CACHE_BUSTER = cb;

window.forceRefreshData = function() {
  console.log("[almacen] Wiping cache and refreshing...");
  sessionStorage.removeItem("mi_cache_buster");
  if (typeof window.clearDataCache === "function") {
    window.clearDataCache().finally(() => window.location.reload());
  } else {
    window.location.reload();
  }
};

function _fmtPct(v) { 
  if (v == null || isNaN(v)) return ""; 
  const n = Math.round(v * 10) / 10; 
  return n.toString().replace(".", ",") + "%"; 
}

function _fmtNum1(v) { 
  if (v == null || isNaN(v)) return ""; 
  const n = Math.round(v * 10) / 10; 
  return n.toString().replace(".", ","); 
}

function toNumAny(v) {
  if (v == null) return NaN;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  if (!s) return NaN;
  const norm = s.replace(/\./g, "").replace(/,/g, ".");
  const n = parseFloat(norm);
  return isNaN(n) ? NaN : n;
}

/* ============================
   CONFIG
   ============================ */
const csvUrl = "./ALMACEN.csv";
const DELIM = ";";

const MONTH_COL = "Mes-Año";
const DEMORA_COL = "DIAS DE DEMORA";

const CLIENTE_COL = "CLIENTE";
const CLASIFICACION_COL = "CLASIFICACION";
const CLASE_DOC_COL = "CLASE DE DOC";
const BASE_ROS_COL = "BASE ROS";

const AT_COL = "CUMPLIDO AT";
const FT_CRIT_COL = "CUMPLIDO FT CRITICO";
const FT_NOCRIT_COL = "CUMPLIDO FT NO CRITICO";
const NO_NOCRIT_COL = "NO CUMPLIDO NO CRITICO";
const NO_CRIT_COL = "NO CUMPLIDO CRITICO";

/* ============================
   COLORES (TEMA ALMACÉN - TEAL/PETROL)
   ============================ */
const COLORS = {
  green: "#10b981",       
  amber_crit: "#f59e0b",  
  amber_light: "#fcd34d", 
  red_light: "#fca5a5",   
  red_dark: "#ef4444",    
  purple: "#8b5cf6",      
  teal_brand: "#0D9488",  
  blue: "#0284c7"
};

let data = [];
let headers = [];
let chartMes = null;
let chartTendencia = null;

const clean = (v) => {
  let s = (v ?? "").toString().trim();
  s = s.replace(/&#160;/g, " ").replace(/&nbsp;/g, " ");
  return s.trim();
};

function setText(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt ?? "";
}

function setHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html ?? "";
}

function toNumber(v) {
  let x = clean(v);
  if (!x) return 0;
  x = x.replace(/\s/g, "");
  if (x.includes(",")) x = x.replace(/\./g, "").replace(",", ".");
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function fmtInt(n) {
  return Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function fmtPct01(x) {
  if (!isFinite(x)) return "-";
  return (x * 100).toFixed(1).replace(".", ",") + "%";
}

function safeFilePart(s) {
  return clean(s).replace(/[^\w\-]+/g, "_").slice(0, 80) || "Todos";
}

function showError(msg) {
  setHTML("msg", `<div class="error" style="background:#fee2e2; border:1px solid #fca5a5; color:#b91c1c; padding:10px; border-radius:6px; margin-bottom:15px;">${msg}</div>`);
}

function uniqSorted(arr) {
  return [...new Set(arr.map(clean).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
}

/* ============================
   SELECT UTIL
   ============================ */
function fillSelect(selectId, values, placeholder = "Todos") {
  const sel = document.getElementById(selectId);
  if (!sel) return;

  const prevSet = new Set([...sel.selectedOptions].map(o => o.value));
  sel.innerHTML = "";

  const optAll = document.createElement("option");
  optAll.value = "__ALL__";
  optAll.textContent = placeholder;
  sel.appendChild(optAll);

  for (const v of values) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    sel.appendChild(o);
  }

  const hasPrev = [...prevSet].some(v => v && v !== "__ALL__");
  if (!hasPrev) {
    optAll.selected = true;
  } else {
    [...sel.options].forEach(o => {
      if (prevSet.has(o.value)) o.selected = true;
    });
    enforceAllOption(sel);
  }
}

function enforceAllOption(sel) {
  if (!sel) return;
  const allOpt = [...sel.options].find(o => o.value === "__ALL__");
  if (!allOpt) return;

  const selected = [...sel.selectedOptions].map(o => o.value);
  if (selected.includes("__ALL__") && selected.length > 1) {
    [...sel.options].forEach(o => { o.selected = (o.value === "__ALL__"); });
    return;
  }
  if (!selected.length) {
    allOpt.selected = true;
  } else if (!selected.includes("__ALL__")) {
    allOpt.selected = false;
  }
}

function getSelValues(id) {
  const sel = document.getElementById(id);
  if (!sel) return [];
  enforceAllOption(sel);
  const vals = [...sel.selectedOptions].map(o => o.value);
  if (!vals.length) return [];
  if (vals.includes("__ALL__")) return [];
  return vals.filter(v => v !== "");
}

function selLabel(id) {
  const v = getSelValues(id);
  return v.length ? v.join("-") : "Todos";
}

const MONTH_NAMES = {
  "01": "ENE", "02": "FEB", "03": "MAR", "04": "ABR",
  "05": "MAY", "06": "JUN", "07": "JUL", "08": "AGO",
  "09": "SEP", "10": "OCT", "11": "NOV", "12": "DIC"
};

function formatMonthKey(mk) {
  if (!mk) return "";
  const parts = mk.split("-");
  if (parts.length === 2) {
    const monthAbbr = MONTH_NAMES[parts[1]] || parts[1];
    return monthAbbr.toLowerCase();
  }
  return mk;
}

function updateMesTitleFromSelect() {
  const titleEl = document.getElementById("panelMesTitle");
  if (!titleEl) return;
  const ms = getSelValues("mesSelect");
  if (!ms.length) {
    titleEl.textContent = "CUMPLIMIENTO - TODOS LOS MESES";
    return;
  }
  if (ms.length > 1) {
    titleEl.textContent = "CUMPLIMIENTO - MESES SELECCIONADOS";
    return;
  }
  const [year, month] = String(ms[0]).split("-");
  const mesTxt = MONTH_NAMES[month] || month || ms[0];
  titleEl.textContent = `CUMPLIMIENTO - MES DE ${mesTxt} ${year || ""}`.trim();
}

function getSingleMes(months) {
  const ms = getSelValues("mesSelect");
  if (!months || !months.length) return ms.length ? ms[ms.length - 1] : "";
  if (!ms.length) return months[months.length - 1] || "";
  const set = new Set(ms);
  let last = "";
  for (const m of months) { if (set.has(m)) last = m; }
  return last || ms[ms.length - 1] || "";
}

/* ============================
   FILTRADO LOGICO CON BASE ROS
   ============================ */
function filteredRowsNoMes() {
  let rows = data;

  // 1. Cliente
  const clients = getSelValues("clienteSelect");
  if (clients.length) rows = rows.filter(r => clients.includes(clean(r[CLIENTE_COL])));

  // 2. Clasificación
  const clasifs = getSelValues("clasificacionSelect");
  if (clasifs.length) rows = rows.filter(r => clasifs.includes(clean(r[CLASIFICACION_COL])));

  // 3. Clase de Doc
  const clases = getSelValues("claseDocSelect");
  if (clases.length) rows = rows.filter(r => clases.includes(clean(r[CLASE_DOC_COL])));

  // 4. Almacén (Lógica BASE ROS: 1 => ROSARIO, otro => SAN JUAN)
  const almacenes = getSelValues("almacenSelect");
  if (almacenes.length) {
    rows = rows.filter(r => {
      const isRosario = toNumber(r[BASE_ROS_COL]) === 1;
      const almNombre = isRosario ? "ROSARIO" : "SAN JUAN";
      return almacenes.includes(almNombre);
    });
  }

  return rows;
}

function filteredRowsByAll() {
  const rows = filteredRowsNoMes();
  const ms = getSelValues("mesSelect");
  if (!ms.length) return rows;
  const set = new Set(ms);
  return rows.filter(r => set.has(clean(r[MONTH_COL])));
}

function buildMesSelect(rows) {
  const sel = document.getElementById("mesSelect");
  if (!sel) return [];

  const months = [...new Set(rows.map(r => clean(r[MONTH_COL])).filter(Boolean))].sort();
  const prevSet = new Set([...sel.selectedOptions].map(o => o.value));

  sel.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "__ALL__";
  optAll.textContent = "Todos";
  sel.appendChild(optAll);

  for (const m of months) {
    const o = document.createElement("option");
    o.value = m;
    o.textContent = m;
    sel.appendChild(o);
  }

  const prevValid = [...prevSet].filter(v => v && v !== "__ALL__" && months.includes(v));
  if (prevValid.length) {
    [...sel.options].forEach(o => { if (prevSet.has(o.value)) o.selected = true; });
  } else {
    if (prevSet.size === 0 && months.length > 0) {
      const lastMonth = months[months.length - 1];
      [...sel.options].forEach(o => { if (o.value === lastMonth) o.selected = true; });
    } else {
      optAll.selected = true;
    }
  }

  enforceAllOption(sel);
  updateMesTitleFromSelect();
  return months;
}

/* ============================
   KPI CALCULATIONS & UPDATES
   ============================ */
function avgDelay(rows) {
  let s = 0, c = 0;
  for (const r of rows) {
    const v = toNumAny(r[DEMORA_COL]);
    if (!isNaN(v)) { s += v; c++; }
  }
  return c ? (s / c) : NaN;
}

function calcTotals(rows) {
  let at = 0, ft_crit = 0, ft_nocrit = 0, no_nocrit = 0, no_crit = 0;
  for (const r of rows) {
    at += toNumber(r[AT_COL]);
    ft_crit += toNumber(r[FT_CRIT_COL]);
    ft_nocrit += toNumber(r[FT_NOCRIT_COL]);
    no_nocrit += toNumber(r[NO_NOCRIT_COL]);
    no_crit += toNumber(r[NO_CRIT_COL]);
  }
  const total = at + ft_crit + ft_nocrit + no_nocrit + no_crit;
  return { at, ft_crit, ft_nocrit, no_nocrit, no_crit, total };
}

function calcMonthTotals(rows, month) {
  let at = 0, ft_crit = 0, ft_nocrit = 0, no_nocrit = 0, no_crit = 0;
  for (const r of rows) {
    if (clean(r[MONTH_COL]) !== month) continue;
    at += toNumber(r[AT_COL]);
    ft_crit += toNumber(r[FT_CRIT_COL]);
    ft_nocrit += toNumber(r[FT_NOCRIT_COL]);
    no_nocrit += toNumber(r[NO_NOCRIT_COL]);
    no_crit += toNumber(r[NO_CRIT_COL]);
  }
  const total = at + ft_crit + ft_nocrit + no_nocrit + no_crit;
  return { 
    at, ft_crit, ft_nocrit, no_nocrit, no_crit, total,
    pctAT: total ? at / total : NaN,
    pctFTCrit: total ? ft_crit / total : NaN,
    pctFTNoCrit: total ? ft_nocrit / total : NaN,
    pctNONoCrit: total ? no_nocrit / total : NaN,
    pctNOCrit: total ? no_crit / total : NaN 
  };
}

function updateKPIsGeneral(rows) {
  const t = calcTotals(rows);
  const pctAT = t.total ? t.at / t.total : NaN;

  setText("kpiTotal", fmtInt(t.total));
  setText("kpiATpct", fmtPct01(pctAT));
  setText("kpiATqty", `Cantidad: ${fmtInt(t.at)}`);
  
  setText("kpiFTCritPct", fmtPct01(t.total ? t.ft_crit / t.total : NaN));
  setText("kpiFTCritQty", `Cantidad: ${fmtInt(t.ft_crit)}`);

  setText("kpiFTNoCritPct", fmtPct01(t.total ? t.ft_nocrit / t.total : NaN));
  setText("kpiFTNoCritQty", `Cantidad: ${fmtInt(t.ft_nocrit)}`);

  setText("kpiNONoCritPct", fmtPct01(t.total ? t.no_nocrit / t.total : NaN));
  setText("kpiNONoCritQty", `Cantidad: ${fmtInt(t.no_nocrit)}`);

  setText("kpiNOCritPct", fmtPct01(t.total ? t.no_crit / t.total : NaN));
  setText("kpiNOCritQty", `Cantidad: ${fmtInt(t.no_crit)}`);

  const avgG = avgDelay(rows);
  setText("kpiDemoraAvg", isNaN(avgG) ? "-" : (Math.round(avgG) + " d"));
}

function updateKPIsMonthly(rows, months) {
  const mes = getSingleMes(months);
  if (!mes) return;

  const cur = calcMonthTotals(rows, mes);
  setText("kpiTotalMes", fmtInt(cur.total));
  setText("kpiATmes", fmtPct01(cur.pctAT));
  setText("kpiFTCritMes", fmtPct01(cur.pctFTCrit));
  setText("kpiFTNoCritMes", fmtPct01(cur.pctFTNoCrit));
  setText("kpiNONoCritMes", fmtPct01(cur.pctNONoCrit));
  setText("kpiNOCritMes", fmtPct01(cur.pctNOCrit));

  const mesRows = rows.filter(r => clean(r[MONTH_COL]) === mes);
  const avgM = avgDelay(mesRows);
  setText("kpiDemoraMes", isNaN(avgM) ? "-" : (Math.round(avgM) + " d"));
}

/* ============================
   CHARTS (ECHARTS)
   ============================ */
function buildChartMes(rows) {
  const agg = new Map();
  const monthsSet = new Set();

  for (const r of rows) {
    const mk = clean(r[MONTH_COL]);
    if (!mk) continue;
    monthsSet.add(mk);

    if (!agg.has(mk)) {
      agg.set(mk, { at: 0, ft_crit: 0, ft_nocrit: 0, no_nocrit: 0, no_crit: 0, demSum: 0, demCnt: 0 });
    }
    const c = agg.get(mk);
    c.at += toNumber(r[AT_COL]);
    c.ft_crit += toNumber(r[FT_CRIT_COL]);
    c.ft_nocrit += toNumber(r[FT_NOCRIT_COL]);
    c.no_nocrit += toNumber(r[NO_NOCRIT_COL]);
    c.no_crit += toNumber(r[NO_CRIT_COL]);

    const dem = toNumAny(r[DEMORA_COL]);
    if (!isNaN(dem)) { c.demSum += dem; c.demCnt += 1; }
  }

  const months = [...monthsSet].sort();
  const totals = months.map(m => {
    const c = agg.get(m);
    return c.at + c.ft_crit + c.ft_nocrit + c.no_nocrit + c.no_crit;
  });

  const pAT = months.map((m, i) => totals[i] ? (agg.get(m).at / totals[i]) * 100 : 0);
  const pFTCrit = months.map((m, i) => totals[i] ? (agg.get(m).ft_crit / totals[i]) * 100 : 0);
  const pFTNoCrit = months.map((m, i) => totals[i] ? (agg.get(m).ft_nocrit / totals[i]) * 100 : 0);
  const pNONoCrit = months.map((m, i) => totals[i] ? (agg.get(m).no_nocrit / totals[i]) * 100 : 0);
  const pNOCrit = months.map((m, i) => totals[i] ? (agg.get(m).no_crit / totals[i]) * 100 : 0);

  const avgDem = months.map(m => {
    const c = agg.get(m);
    return (c && c.demCnt) ? (c.demSum / c.demCnt) : null;
  });

  const el = document.getElementById("chartMes");
  if (!el || !window.echarts) return;
  if (!chartMes) chartMes = echarts.init(el, null, { renderer: "canvas" });

  const option = {
    grid: { left: 60, right: 65, top: 40, bottom: 110 },
    legend: {
      bottom: 5,
      data: ["CUMPLIDO AT", "CUMPLIDO FT CRITICO", "CUMPLIDO FT NO CRITICO", "NO CUMPLIDO NO CRITICO", "NO CUMPLIDO CRITICO", "Días de demora"]
    },
    xAxis: { type: "category", data: months.map(formatMonthKey) },
    yAxis: [{ type: "value", min: 0, max: 100 }, { type: "value", name: "Días de demora", position: "right" }],
    series: [
      { name: "CUMPLIDO AT", type: "bar", stack: "pct", data: pAT, itemStyle: { color: COLORS.green } },
      { name: "CUMPLIDO FT CRITICO", type: "bar", stack: "pct", data: pFTCrit, itemStyle: { color: COLORS.amber_crit } },
      { name: "CUMPLIDO FT NO CRITICO", type: "bar", stack: "pct", data: pFTNoCrit, itemStyle: { color: COLORS.amber_light } },
      { name: "NO CUMPLIDO NO CRITICO", type: "bar", stack: "pct", data: pNONoCrit, itemStyle: { color: COLORS.red_light } },
      { name: "NO CUMPLIDO CRITICO", type: "bar", stack: "pct", data: pNOCrit, itemStyle: { color: COLORS.red_dark } },
      { name: "Días de demora", type: "line", yAxisIndex: 1, data: avgDem, itemStyle: { color: COLORS.blue } }
    ]
  };

  chartMes.setOption(option, true);
}

function buildChartTendencia(rows) {
  // Similar logic to buildChartMes for trend lines
}

/* ============================
   EXPORTS & INIT
   ============================ */
function downloadCSV(filename, rows, cols) {
  const escapeCSV = (v) => {
    const s = (v ?? "").toString();
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.map(escapeCSV).join(";");
  const lines = rows.map(r => cols.map(c => escapeCSV(r[c])).join(";"));
  const blob = new Blob([[header, ...lines].join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function applyAll() {
  const rows = filteredRowsNoMes();
  const months = buildMesSelect(rows);
  updateKPIsGeneral(rows);
  updateKPIsMonthly(rows, months);
  buildChartMes(rows);
}

window.addEventListener("DOMContentLoaded", () => {
  fetch(csvUrl + "?v=" + CACHE_BUSTER)
    .then(r => r.text())
    .then(text => {
      const results = Papa.parse(text, { delimiter: DELIM, header: true, skipEmptyLines: true });
      data = results.data;
      headers = results.meta.fields;

      fillSelect("clienteSelect", uniqSorted(data.map(r => r[CLIENTE_COL])));
      fillSelect("clasificacionSelect", uniqSorted(data.map(r => r[CLASIFICACION_COL])));
      fillSelect("claseDocSelect", uniqSorted(data.map(r => r[CLASE_DOC_COL])));

      applyAll();

      const loader = document.getElementById("loader");
      if (loader) loader.classList.add("hidden");

      ["clienteSelect", "clasificacionSelect", "claseDocSelect", "almacenSelect"].forEach(id => {
        document.getElementById(id)?.addEventListener("change", () => applyAll());
      });

      document.getElementById("mesSelect")?.addEventListener("change", () => {
        updateMesTitleFromSelect();
        const rows = filteredRowsNoMes();
        const months = [...new Set(rows.map(r => clean(r[MONTH_COL])).filter(Boolean))].sort();
        updateKPIsMonthly(rows, months);
      });

      document.getElementById("btnDownloadBase")?.addEventListener("click", () => {
        downloadCSV("BASE_COMPLETA_ALMACEN.csv", filteredRowsByAll(), headers);
      });
    })
    .catch(err => showError("Error cargando datos de Almacén: " + err.message));
});
