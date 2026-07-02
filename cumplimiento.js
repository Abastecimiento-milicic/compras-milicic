/* ===== Cumplimiento de Compras JS Logic ===== */

// Setup Cache Buster per session for IndexedDB caching
let cb = sessionStorage.getItem("mi_cache_buster");
if (!cb) {
  cb = new Date().getTime();
  sessionStorage.setItem("mi_cache_buster", cb);
}
const CACHE_BUSTER = cb;

window.forceRefreshData = function() {
  console.log("[cumplimiento] Wiping cache and refreshing...");
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
const csvUrl = "./R1 - REPORTE CUMPLIMIENTO COMPRAS ACUMULADO.csv";
const DELIM = ";";

const MONTH_COL = "Mes-Año";
const DEMORA_COL = "DIAS DE DEMORA";
const OBJETIVO_COL = "ObjetivoCompras";

const COMPRADOR_COL = "OPERADOR OC";
const CLASIFICACION_COL = "CLASIFICACION";
const CLIENTE_COL = "CLIENTE";
const CENTRO_COL = "CENTRO";
const COMPRAS_NICO_COL = "SOLO COMPRAS ABASTECIMIENTO";
const GC_OC_COL = "GRUPO DE COMPRA OC";
const PROVEEDOR_COL = "PROVEEDOR";

const AT_COL = "CUMPLIDO AT";
const FT_CRIT_COL = "CUMPLIDO FT CRITICO";
const FT_NOCRIT_COL = "CUMPLIDO FT NO CRITICO";
const NO_NOCRIT_COL = "NO CUMPLIDO NO CRITICO";
const NO_CRIT_COL = "NO CUMPLIDO CRITICO";

/* ============================
   COLORES (TEMA CUMPLIMIENTO COMPRAS)
   ============================ */
const COLORS = {
  green: "#10b981",       // Verde - CUMPLIDO AT (Sede)
  amber_crit: "#f59e0b",  // Naranja - CUMPLIDO FT CRITICO (Sede)
  amber_light: "#fcd34d", // Amarillo claro - CUMPLIDO FT NO CRITICO
  red_light: "#fca5a5",   // Rojo claro - NO CUMPLIDO NO CRITICO
  red_dark: "#ef4444",    // Rojo oscuro - NO CUMPLIDO CRITICO (Sede)
  purple: "#a855f7",      // Púrpura - % AT Acumulado
  line_green: "#F26716",  // Naranja Objetivo - Invertido
  line_red: "#ef4444",    // Rojo Demora
  blue: "#2563eb",        // Azul de contraste para Demora (Sede)
  grid: "rgba(15, 23, 42, 0.08)",
  text: "#0f172a",
  muted: "#64748b",
};

/* ============================
   GLOBAL STATE
   ============================ */
let data = [];
let headers = [];

let chartMes = null;
let chartTendencia = null;

/* ============================
   HELPERS
   ============================ */
const clean = (v) => {
  let s = (v ?? "").toString().trim();
  s = s.replace(/&#160;/g, " ");
  s = s.replace(/&nbsp;/g, " ");
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
function fillSelect(selectId, values, placeholder = "Todos", selectedValue = null) {
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
    if (selectedValue !== null && v === selectedValue) {
      o.selected = true;
    }
    sel.appendChild(o);
  }

  const hasPrev = [...prevSet].some(v => v && v !== "__ALL__");
  if (selectedValue === null) {
    if (!hasPrev) {
      optAll.selected = true;
    } else {
      [...sel.options].forEach(o => {
        if (prevSet.has(o.value)) o.selected = true;
      });
      enforceAllOption(sel);
    }
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

/* ============================
   DATE / MONTH UTILS
   ============================ */
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
  if (!months || !months.length) {
    return ms.length ? ms[ms.length - 1] : "";
  }
  if (!ms.length) return months[months.length - 1] || "";
  const set = new Set(ms);
  let last = "";
  for (const m of months) {
    if (set.has(m)) last = m;
  }
  return last || ms[ms.length - 1] || "";
}

/* ============================
   FILTERING LOGIC
   ============================ */

/* ============================
   FILTERING LOGIC
   ============================ */

/* ============================
   FILTERING LOGIC
   ============================ */
function filteredRowsNoMes() {
  let rows = data;

  // 1. Comprador
  const buyers = getSelValues("compradorSelect");
  if (buyers.length) rows = rows.filter(r => buyers.includes(clean(r[COMPRADOR_COL])));

  // 2. Cliente
  const clients = getSelValues("clienteSelect");
  if (clients.length) rows = rows.filter(r => clients.includes(clean(r[CLIENTE_COL])));

  // 3. Clasificacion
  const clasifs = getSelValues("clasificacionSelect");
  if (clasifs.length) rows = rows.filter(r => clasifs.includes(clean(r[CLASIFICACION_COL])));

  // 4. Clasificacion Pedidos
  const clasifPeds = getSelValues("clasifPedidosSelect");
  if (clasifPeds.length) rows = rows.filter(r => clasifPeds.includes(clean(r[CLASIF_PEDIDOS_COL])));

  // 5. Grupo Compra Solped
  const solpeds = getSelValues("gcsolpedSelect");
  if (solpeds.length) rows = rows.filter(r => solpeds.includes(clean(r[GC_SOLPED_COL])));

  // 6. Grupo Compra OC
  const ocs = getSelValues("gcocSelect");
  if (ocs.length) rows = rows.filter(r => ocs.includes(clean(r[GC_OC_COL])));

  // 7. Proveedor
  const provs = getSelValues("proveedorSelect");
  if (provs.length) rows = rows.filter(r => provs.includes(clean(r[PROVEEDOR_COL])));

 // 8. Solo Compras Abastecimiento (Caja de lista fija)
  const abastVals = getSelValues("comprasAbastecimientoSelect");
  if (abastVals.includes("SI")) {
    rows = rows.filter(r => toNumber(r[COMPRAS_NICO_COL]) === 1);
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

/* Clasificacion filter converted to standard multi-select */

function renderComprasAbastecimiento() {
  const container = document.getElementById("comprasAbastecimientoList"); // ID nuevo para el HTML
  if (!container) return;

  container.innerHTML = "";

  const allLabel = document.createElement("label");
  allLabel.className = "check-all";
  const allCb = document.createElement("input");
  allCb.type = "checkbox";
  allCb.className = "check-all-cb";
  allCb.checked = false; 
  allLabel.appendChild(allCb);
  allLabel.appendChild(document.createTextNode(" Todos"));
  container.appendChild(allLabel);

  const options = [
    { label: "SI", value: "SI", checked: true },
    { label: "NO", value: "NO", checked: false }
  ];

  for (const opt of options) {
    const lbl = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = opt.value;
    cb.checked = opt.checked;
    cb.className = "abast-cb";
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(" " + opt.label));
    container.appendChild(lbl);
  }

  allCb.addEventListener("change", () => {
    const itemCbs = [...container.querySelectorAll(".abast-cb")];
    itemCbs.forEach(c => c.checked = allCb.checked);
    applyAll();
  });

  container.querySelectorAll(".abast-cb").forEach(cb => {
    cb.addEventListener("change", () => {
      const items = [...container.querySelectorAll(".abast-cb")];
      allCb.checked = items.every(c => c.checked);
      applyAll();
    });
  });
}

function getCheckedComprasAbastecimiento() {
  const container = document.getElementById("comprasAbastecimientoList");
  if (!container) return ["SI"]; 
  const allCb = container.querySelector(".check-all-cb");
  if (allCb && allCb.checked) return ["SI", "NO"];
  const checked = [...container.querySelectorAll(".abast-cb:checked")].map(cb => cb.value);
  return checked;
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
      [...sel.options].forEach(o => {
        if (o.value === lastMonth) o.selected = true;
      });
    } else {
      optAll.selected = true;
    }
  }

  enforceAllOption(sel);

  const hint = document.getElementById("mesHint");
  if (hint) {
    const label = selLabel("mesSelect");
    hint.textContent = label === "Todos" ? "Mes seleccionado: Todos" : `Mes seleccionado: ${label}`;
  }

  updateMesTitleFromSelect();
  return months;
}

/* ============================
   KPI CALCULATIONS
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
  const ft = ft_crit + ft_nocrit;
  const no = no_nocrit + no_crit;
  return { at, ft, no, ft_crit, ft_nocrit, no_nocrit, no_crit, total };
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
  
  const pctAT = total ? at / total : NaN;
  const pctFTCrit = total ? ft_crit / total : NaN;
  const pctFTNoCrit = total ? ft_nocrit / total : NaN;
  const pctNONoCrit = total ? no_nocrit / total : NaN;
  const pctNOCrit = total ? no_crit / total : NaN;

  return { 
    at, ft_crit, ft_nocrit, no_nocrit, no_crit, total, 
    pctAT, pctFTCrit, pctFTNoCrit, pctNONoCrit, pctNOCrit 
  };
}

function deltaInfo(curr, prev) {
  if (!isFinite(curr) || !isFinite(prev)) return { text: "Sin mes anterior", diff: NaN };
  const diff = curr - prev;
  const eps = 0.000001;
  if (Math.abs(diff) < eps) return { text: "• 0,0% vs anterior", diff: 0 };
  const arrow = diff > 0 ? "▲" : "▼";
  const txt = `${arrow} ${(Math.abs(diff) * 100).toFixed(1).replace(".", ",")}% vs ant.`;
  return { text: txt, diff };
}

function setDelta(el, text, cls) {
  if (!el) return;
  el.className = "kpi-sub kpi-sub-strong";
  if (cls) el.classList.add(cls);
  el.textContent = text;
}

/* ============================
   KPIs UI UPDATERS
   ============================ */
function updateKPIsGeneral(rows) {
  const t = calcTotals(rows);
  const pctAT = t.total ? t.at / t.total : NaN;
  const pctFTCrit = t.total ? t.ft_crit / t.total : NaN;
  const pctFTNoCrit = t.total ? t.ft_nocrit / t.total : NaN;
  const pctNONoCrit = t.total ? t.no_nocrit / t.total : NaN;
  const pctNOCrit = t.total ? t.no_crit / t.total : NaN;

  setText("kpiTotal", fmtInt(t.total));

  setText("kpiATpct", fmtPct01(pctAT));
  setText("kpiATqty", `Cantidad: ${fmtInt(t.at)}`);
  const elAT = document.getElementById("kpiATpct");
  if (elAT) elAT.style.color = (isFinite(pctAT) && pctAT >= 0.78) ? "#16a34a" : "#ef4444";

  setText("kpiFTCritPct", fmtPct01(pctFTCrit));
  setText("kpiFTCritQty", `Cantidad: ${fmtInt(t.ft_crit)}`);

  setText("kpiFTNoCritPct", fmtPct01(pctFTNoCrit));
  setText("kpiFTNoCritQty", `Cantidad: ${fmtInt(t.ft_nocrit)}`);

  setText("kpiNONoCritPct", fmtPct01(pctNONoCrit));
  setText("kpiNONoCritQty", `Cantidad: ${fmtInt(t.no_nocrit)}`);

  setText("kpiNOCritPct", fmtPct01(pctNOCrit));
  setText("kpiNOCritQty", `Cantidad: ${fmtInt(t.no_crit)}`);

  const avgG = avgDelay(rows);
  setText("kpiDemoraAvg", isNaN(avgG) ? "-" : (Math.round(avgG) + " d"));
  const elDemG = document.getElementById("kpiDemoraAvg");
  if (elDemG) elDemG.style.color = (!isNaN(avgG) && avgG > 7) ? "#ef4444" : "#16a34a";
}

function updateKPIsMonthly(rows, months) {
  const ms = getSelValues("mesSelect");
  if (!ms.length) {
    const t = calcTotals(rows);
    const pctAT = t.total ? t.at / t.total : NaN;
    const pctFTCrit = t.total ? t.ft_crit / t.total : NaN;
    const pctFTNoCrit = t.total ? t.ft_nocrit / t.total : NaN;
    const pctNONoCrit = t.total ? t.no_nocrit / t.total : NaN;
    const pctNOCrit = t.total ? t.no_crit / t.total : NaN;

    setText("kpiTotalMes", fmtInt(t.total));

    setText("kpiATmes", fmtPct01(pctAT));
    const elATmes = document.getElementById("kpiATmes");
    if (elATmes) elATmes.style.color = (isFinite(pctAT) && pctAT >= 0.78) ? "#16a34a" : "#ef4444";

    setText("kpiFTCritMes", fmtPct01(pctFTCrit));
    setText("kpiFTNoCritMes", fmtPct01(pctFTNoCrit));
    setText("kpiNONoCritMes", fmtPct01(pctNONoCrit));
    setText("kpiNOCritMes", fmtPct01(pctNOCrit));

    const avgM = avgDelay(rows);
    setText("kpiDemoraMes", isNaN(avgM) ? "-" : (Math.round(avgM) + " d"));
    const elDemM = document.getElementById("kpiDemoraMes");
    if (elDemM) elDemM.style.color = (!isNaN(avgM) && avgM > 7) ? "#ef4444" : "#16a34a";

    setDelta(document.getElementById("kpiATmesSub"), `Cant: ${fmtInt(t.at)} · Todos`, "");
    setDelta(document.getElementById("kpiFTCritMesSub"), `Cant: ${fmtInt(t.ft_crit)} · Todos`, "");
    setDelta(document.getElementById("kpiFTNoCritMesSub"), `Cant: ${fmtInt(t.ft_nocrit)} · Todos`, "");
    setDelta(document.getElementById("kpiNONoCritMesSub"), `Cant: ${fmtInt(t.no_nocrit)} · Todos`, "");
    setDelta(document.getElementById("kpiNOCritMesSub"), `Cant: ${fmtInt(t.no_crit)} · Todos`, "");
    return;
  }

  const mes = getSingleMes(months);
  if (!mes) return;

  const idx = months.indexOf(mes);
  const prevMes = idx > 0 ? months[idx - 1] : null;

  const cur = calcMonthTotals(rows, mes);
  const prev = prevMes ? calcMonthTotals(rows, prevMes) : null;

  setText("kpiTotalMes", fmtInt(cur.total));

  // AT Mes
  setText("kpiATmes", fmtPct01(cur.pctAT));
  const elATmes = document.getElementById("kpiATmes");
  if (elATmes) elATmes.style.color = (isFinite(cur.pctAT) && cur.pctAT >= 0.78) ? "#16a34a" : "#ef4444";

  // FT Crit Mes
  setText("kpiFTCritMes", fmtPct01(cur.pctFTCrit));

  // FT No Crit Mes
  setText("kpiFTNoCritMes", fmtPct01(cur.pctFTNoCrit));

  // NO Cumplido No Crit Mes
  setText("kpiNONoCritMes", fmtPct01(cur.pctNONoCrit));

  // NO Cumplido Crit Mes
  setText("kpiNOCritMes", fmtPct01(cur.pctNOCrit));

  // Demora Mes
  const mesRows = rows.filter(r => clean(r[MONTH_COL]) === mes);
  const avgM = avgDelay(mesRows);
  setText("kpiDemoraMes", isNaN(avgM) ? "-" : (Math.round(avgM) + " d"));
  const elDemM = document.getElementById("kpiDemoraMes");
  if (elDemM) elDemM.style.color = (!isNaN(avgM) && avgM > 7) ? "#ef4444" : "#16a34a";

  const atSub = document.getElementById("kpiATmesSub");
  const ftCritSub = document.getElementById("kpiFTCritMesSub");
  const ftNoCritSub = document.getElementById("kpiFTNoCritMesSub");
  const noNoCritSub = document.getElementById("kpiNONoCritMesSub");
  const noCritSub = document.getElementById("kpiNOCritMesSub");

  if (!prev) {
    setDelta(atSub, `Cant: ${fmtInt(cur.at)} · Sin mes anterior`, "");
    setDelta(ftCritSub, `Cant: ${fmtInt(cur.ft_crit)} · Sin mes anterior`, "");
    setDelta(ftNoCritSub, `Cant: ${fmtInt(cur.ft_nocrit)} · Sin mes anterior`, "");
    setDelta(noNoCritSub, `Cant: ${fmtInt(cur.no_nocrit)} · Sin mes anterior`, "");
    setDelta(noCritSub, `Cant: ${fmtInt(cur.no_crit)} · Sin mes anterior`, "");
    return;
  }

  const dAT = deltaInfo(cur.pctAT, prev.pctAT);
  const dFTC = deltaInfo(cur.pctFTCrit, prev.pctFTCrit);
  const dFTN = deltaInfo(cur.pctFTNoCrit, prev.pctFTNoCrit);
  const dNON = deltaInfo(cur.pctNONoCrit, prev.pctNONoCrit);
  const dNOC = deltaInfo(cur.pctNOCrit, prev.pctNOCrit);

  // Styling logic for AT (Higher is Better)
  let clsAT = dAT.diff >= 0 ? "delta-good" : "delta-bad";
  
  // Styling logic for FT / NO (Lower is Better)
  let clsFTC = dFTC.diff <= 0 ? "delta-good" : "delta-bad";
  let clsFTN = dFTN.diff <= 0 ? "delta-good" : "delta-bad";
  let clsNON = dNON.diff <= 0 ? "delta-good" : "delta-bad";
  let clsNOC = dNOC.diff <= 0 ? "delta-good" : "delta-bad";

  setDelta(atSub, `Cant: ${fmtInt(cur.at)} · ${dAT.text}`, clsAT);
  setDelta(ftCritSub, `Cant: ${fmtInt(cur.ft_crit)} · ${dFTC.text}`, clsFTC);
  setDelta(ftNoCritSub, `Cant: ${fmtInt(cur.ft_nocrit)} · ${dFTN.text}`, clsFTN);
  setDelta(noNoCritSub, `Cant: ${fmtInt(cur.no_nocrit)} · ${dNON.text}`, clsNON);
  setDelta(noCritSub, `Cant: ${fmtInt(cur.no_crit)} · ${dNOC.text}`, clsNOC);
}

/* ============================
   CHART 1: 100% Stacked Bar + Trend Lines (ECharts)
   ============================ */
function buildChartMes(rows) {
  const agg = new Map();
  const monthsSet = new Set();

  for (const r of rows) {
    const mk = clean(r[MONTH_COL]);
    if (!mk) continue;
    monthsSet.add(mk);

    if (!agg.has(mk)) {
      agg.set(mk, { 
        at: 0, 
        ft_crit: 0, 
        ft_nocrit: 0, 
        no_nocrit: 0, 
        no_crit: 0, 
        demSum: 0, 
        demCnt: 0,
        objSum: 0,
        objCnt: 0
      });
    }
    const c = agg.get(mk);

    c.at += toNumber(r[AT_COL]);
    c.ft_crit += toNumber(r[FT_CRIT_COL]);
    c.ft_nocrit += toNumber(r[FT_NOCRIT_COL]);
    c.no_nocrit += toNumber(r[NO_NOCRIT_COL]);
    c.no_crit += toNumber(r[NO_CRIT_COL]);

    const dem = toNumAny(r[DEMORA_COL]);
    if (!isNaN(dem)) { c.demSum += dem; c.demCnt += 1; }

    const obj = toNumAny(r[OBJETIVO_COL]);
    if (!isNaN(obj)) { c.objSum += obj; c.objCnt += 1; }
  }

  const months = [...monthsSet].sort();
  const qAT = months.map(m => agg.get(m)?.at ?? 0);
  const qFTCrit = months.map(m => agg.get(m)?.ft_crit ?? 0);
  const qFTNoCrit = months.map(m => agg.get(m)?.ft_nocrit ?? 0);
  const qNONoCrit = months.map(m => agg.get(m)?.no_nocrit ?? 0);
  const qNOCrit = months.map(m => agg.get(m)?.no_crit ?? 0);

  // Compute 100% Stacked Percentages
  const pAT = [];
  const pFTCrit = [];
  const pFTNoCrit = [];
  const pNONoCrit = [];
  const pNOCrit = [];
  const totals = [];

  for (let i = 0; i < months.length; i++) {
    const t = qAT[i] + qFTCrit[i] + qFTNoCrit[i] + qNONoCrit[i] + qNOCrit[i];
    totals.push(t);
    pAT.push(t ? (qAT[i] / t) * 100 : 0);
    pFTCrit.push(t ? (qFTCrit[i] / t) * 100 : 0);
    pFTNoCrit.push(t ? (qFTNoCrit[i] / t) * 100 : 0);
    pNONoCrit.push(t ? (qNONoCrit[i] / t) * 100 : 0);
    pNOCrit.push(t ? (qNOCrit[i] / t) * 100 : 0);
  }

  // Purple Line: CUMULATIVE A TIEMPO %
  const pAT_acum = [];
  let cumAT = 0;
  let cumTotal = 0;
  for (let i = 0; i < months.length; i++) {
    cumAT += qAT[i];
    cumTotal += totals[i];
    pAT_acum.push(cumTotal ? (cumAT / cumTotal) * 100 : 0);
  }

  // Green Line: ObjetivoCompras Dynamic
  const avgObj = months.map(m => {
    const c = agg.get(m);
    return (c && c.objCnt) ? (c.objSum / c.objCnt) * 100 : 70; // fallback to 70%
  });

  // Red Line: Average days of delay
  const avgDem = months.map(m => {
    const c = agg.get(m);
    return (c && c.demCnt) ? (c.demSum / c.demCnt) : null;
  });

  const el = document.getElementById("chartMes");
  if (!el || !window.echarts) return;

  if (!chartMes) chartMes = echarts.init(el, null, { renderer: "canvas" });

  const labelMonths = months.map(formatMonthKey);

  const option = {
    grid: { left: 60, right: 65, top: 40, bottom: 110 },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      confine: true,
      formatter: (params) => {
        const axisIndex = params?.[0]?.dataIndex ?? 0;
        const axisRawMonth = months[axisIndex] ?? "";
        let html = `<b>${axisRawMonth.toUpperCase()} (Total: ${fmtInt(totals[axisIndex])})</b><br/>`;
        
        const byName = Object.fromEntries(params.map(p => [p.seriesName, p]));
        const at = byName["CUMPLIDO AT"];
        const ftc = byName["CUMPLIDO FT CRITICO"];
        const ftn = byName["CUMPLIDO FT NO CRITICO"];
        const ncn = byName["NO CUMPLIDO NO CRITICO"];
        const ncc = byName["NO CUMPLIDO CRITICO"];
        const cum = byName["% AT Acumulado"];
        const dem = byName["Días de demora"];

        if (at) html += `${at.marker} A Tiempo: <b>${fmtInt(qAT[axisIndex])}</b> (${_fmtNum1(at.value)}%)<br/>`;
        if (ftc) html += `${ftc.marker} FT Crítico: <b>${fmtInt(qFTCrit[axisIndex])}</b> (${_fmtNum1(ftc.value)}%)<br/>`;
        if (ftn) html += `${ftn.marker} FT No Crítico: <b>${fmtInt(qFTNoCrit[axisIndex])}</b> (${_fmtNum1(ftn.value)}%)<br/>`;
        if (ncn) html += `${ncn.marker} No Cumplido No Crítico: <b>${fmtInt(qNONoCrit[axisIndex])}</b> (${_fmtNum1(ncn.value)}%)<br/>`;
        if (ncc) html += `${ncc.marker} No Cumplido Crítico: <b>${fmtInt(qNOCrit[axisIndex])}</b> (${_fmtNum1(ncc.value)}%)<br/>`;
        
        if (cum) html += `${cum.marker} <span style="color:${COLORS.purple};">AT Acumulado: <b>${_fmtNum1(cum.value)}%</b></span><br/>`;
        if (dem && dem.value != null) html += `${dem.marker} <span style="color:${COLORS.line_red};">Demora prom.: <b>${_fmtNum1(dem.value)}</b> días</span><br/>`;
        return html;
      }
    },
    legend: {
      bottom: 5,
      left: "center",
      itemWidth: 12,
      itemHeight: 10,
      textStyle: { fontWeight: 700, fontSize: 11 },
      data: [
        "CUMPLIDO AT", "CUMPLIDO FT CRITICO", "CUMPLIDO FT NO CRITICO", 
        "NO CUMPLIDO NO CRITICO", "NO CUMPLIDO CRITICO", 
        "% AT Acumulado", "Min de ObjetivoCompras", "Días de demora"
      ]
    },
    xAxis: {
      type: "category",
      data: labelMonths,
      axisTick: { alignWithLabel: true },
      axisLabel: { 
        fontWeight: 700,
        fontSize: 9,
        formatter: (val, idx) => {
          const mKey = months[idx];
          const tot = totals[idx] ?? 0;
          return `${val.toUpperCase()}\nTOTAL ${fmtInt(tot)}`;
        }
      }
    },
    yAxis: [
      {
        type: "value",
        min: 0,
        max: 100,
        interval: 10,
        axisLabel: { formatter: "{value}%", fontWeight: 700 },
        splitLine: { lineStyle: { color: "rgba(15,23,42,0.06)" } }
      },
      {
        type: "value",
        name: "Días de demora",
        nameTextStyle: { fontWeight: 700 },
        position: "right",
        axisLabel: { fontWeight: 700 },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: "CUMPLIDO AT",
        type: "bar",
        stack: "pct",
        data: pAT.map((v, idx) => {
          const target = 75;
          const val = +(v).toFixed(4);
          if (v < target) {
            const q = qAT[idx];
            const pct = Math.round(v);
            return {
              value: val,
              itemStyle: {
                borderColor: "#ef4444",
                borderWidth: 2,
                borderType: "solid"
              },
              label: {
                show: true,
                position: "inside",
                backgroundColor: "#ffffff",
                borderColor: "#ef4444",
                borderWidth: 1.5,
                borderRadius: 4,
                padding: [3, 5],
                color: "#b91c1c",
                fontWeight: 900,
                fontSize: 9,
                formatter: () => `⚠️ ${fmtInt(q)}\n(${pct}%)`
              }
            };
          } else {
            return {
              value: val
            };
          }
        }),
        barMaxWidth: 48,
        itemStyle: { color: COLORS.green },
        label: {
          show: true,
          position: "inside",
          fontWeight: 900,
          fontSize: 9,
          color: "#0f172a",
          formatter: (p) => {
            const idx = p.dataIndex;
            const pct = Math.round(p.value);
            const q = qAT[idx];
            return pct > 8 ? `${fmtInt(q)}\n(${pct}%)` : "";
          }
        }
      },
      {
        name: "CUMPLIDO FT CRITICO",
        type: "bar",
        stack: "pct",
        data: pFTCrit.map(v => +(v).toFixed(4)),
        barMaxWidth: 48,
        itemStyle: { color: COLORS.amber_crit },
        label: {
          show: true,
          position: "inside",
          fontWeight: 900,
          fontSize: 9,
          color: "#0f172a",
          formatter: (p) => {
            const idx = p.dataIndex;
            const pct = Math.round(p.value);
            const q = qFTCrit[idx];
            return pct > 8 ? `${fmtInt(q)}\n(${pct}%)` : "";
          }
        }
      },
      {
        name: "CUMPLIDO FT NO CRITICO",
        type: "bar",
        stack: "pct",
        data: pFTNoCrit.map(v => +(v).toFixed(4)),
        barMaxWidth: 48,
        itemStyle: { color: COLORS.amber_light },
        label: {
          show: true,
          position: "inside",
          fontWeight: 900,
          fontSize: 9,
          color: "#0f172a",
          formatter: (p) => {
            const idx = p.dataIndex;
            const pct = Math.round(p.value);
            const q = qFTNoCrit[idx];
            return pct > 8 ? `${fmtInt(q)}\n(${pct}%)` : "";
          }
        }
      },
      {
        name: "NO CUMPLIDO NO CRITICO",
        type: "bar",
        stack: "pct",
        data: pNONoCrit.map(v => +(v).toFixed(4)),
        barMaxWidth: 48,
        itemStyle: { color: COLORS.red_light },
        label: {
          show: true,
          position: "inside",
          fontWeight: 900,
          fontSize: 9,
          color: "#7f1d1d",
          formatter: (p) => {
            const idx = p.dataIndex;
            const pct = Math.round(p.value);
            const q = qNONoCrit[idx];
            return pct > 8 ? `${fmtInt(q)}\n(${pct}%)` : "";
          }
        }
      },
      {
        name: "NO CUMPLIDO CRITICO",
        type: "bar",
        stack: "pct",
        data: pNOCrit.map(v => +(v).toFixed(4)),
        barMaxWidth: 48,
        itemStyle: { color: COLORS.red_dark },
        label: {
          show: true,
          position: "top",
          formatter: (p) => {
            const idx = p.dataIndex;
            const q = qNONoCrit[idx] + qNOCrit[idx];
            if (q === 0) return "-";
            const pct = Math.round(pNONoCrit[idx] + pNOCrit[idx]);
            return `{val|${fmtInt(q)} (${pct}%)}`;
          },
          rich: {
            val: {
              backgroundColor: "#ef4444",
              color: "#fff",
              padding: [2, 4],
              borderRadius: 3,
              fontWeight: 900,
              fontSize: 9
            }
          }
        }
      },
      {
        name: "% AT Acumulado",
        type: "line",
        data: pAT_acum.map(v => +(v).toFixed(2)),
        symbol: "square",
        symbolSize: 6,
        lineStyle: { width: 2.5, type: "dashed", color: COLORS.purple },
        itemStyle: { color: COLORS.purple, borderColor: "#fff", borderWidth: 1.5 },
        label: {
          show: true,
          position: "top",
          fontWeight: 900,
          fontSize: 9,
          backgroundColor: "#f5f3ff",
          borderColor: COLORS.purple,
          borderWidth: 1,
          borderRadius: 3,
          padding: [2, 4],
          color: "#5b21b6",
          formatter: (p) => _fmtPct(p.value)
        },
        markLine: {
          silent: true,
          symbol: ["none", "none"],
          lineStyle: { type: "dashed", width: 1.5, color: "#C94F0C" },
          data: [
            {
              yAxis: 75,
              label: {
                show: true,
                position: "end",
                fontWeight: 900,
                fontSize: 10,
                backgroundColor: "#C94F0C",
                borderColor: "#C94F0C",
                borderWidth: 1,
                borderRadius: 3,
                padding: [3, 5],
                color: "#ffffff",
                formatter: "Obj 75%"
              }
            }
          ]
        }
      },
      {
        name: "Días de demora",
        type: "line",
        yAxisIndex: 1,
        data: avgDem,
        symbol: "circle",
        symbolSize: 7,
        showSymbol: true,
        connectNulls: true,
        lineStyle: { width: 2.5, type: "solid", color: COLORS.blue },
        itemStyle: { color: COLORS.blue, borderColor: "#fff", borderWidth: 2 },
        label: {
          show: true,
          position: "bottom",
          backgroundColor: "rgba(255,255,255,0.9)",
          borderColor: COLORS.blue,
          borderWidth: 1,
          padding: [2, 4],
          borderRadius: 4,
          fontWeight: 900,
          fontSize: 10,
          color: COLORS.blue,
          formatter: (p) => (p.value == null || isNaN(p.value)) ? "" : `${Math.round(p.value)} d`
        }
      }
    ]
  };

  chartMes.setOption(option, true);
  window.addEventListener("resize", () => chartMes && chartMes.resize(), { passive: true });
}

/* ============================
   CHART 2: Historical Trend Lines (ECharts)
   ============================ */
function buildChartTendencia(rows) {
  const agg = new Map();
  const monthsSet = new Set();

  for (const r of rows) {
    const mk = clean(r[MONTH_COL]);
    if (!mk) continue;
    monthsSet.add(mk);

    if (!agg.has(mk)) {
      agg.set(mk, { 
        at: 0, 
        ft_crit: 0, 
        ft_nocrit: 0, 
        no_nocrit: 0, 
        no_crit: 0
      });
    }
    const c = agg.get(mk);

    c.at += toNumber(r[AT_COL]);
    c.ft_crit += toNumber(r[FT_CRIT_COL]);
    c.ft_nocrit += toNumber(r[FT_NOCRIT_COL]);
    c.no_nocrit += toNumber(r[NO_NOCRIT_COL]);
    c.no_crit += toNumber(r[NO_CRIT_COL]);
  }

  const months = [...monthsSet].sort();

  const qAT = months.map(m => agg.get(m)?.at ?? 0);
  const qFTCrit = months.map(m => agg.get(m)?.ft_crit ?? 0);
  const qFTNoCrit = months.map(m => agg.get(m)?.ft_nocrit ?? 0);
  const qNONoCrit = months.map(m => agg.get(m)?.no_nocrit ?? 0);
  const qNOCrit = months.map(m => agg.get(m)?.no_crit ?? 0);

  const pAT = [];
  const pFTCrit = [];
  const pFTNoCrit = [];
  const pNONoCrit = [];
  const pNOCrit = [];
  const totals = [];

  for (let i = 0; i < months.length; i++) {
    const t = qAT[i] + qFTCrit[i] + qFTNoCrit[i] + qNONoCrit[i] + qNOCrit[i];
    totals.push(t);
    pAT.push(t ? (qAT[i] / t) * 100 : 0);
    pFTCrit.push(t ? (qFTCrit[i] / t) * 100 : 0);
    pFTNoCrit.push(t ? (qFTNoCrit[i] / t) * 100 : 0);
    pNONoCrit.push(t ? (qNONoCrit[i] / t) * 100 : 0);
    pNOCrit.push(t ? (qNOCrit[i] / t) * 100 : 0);
  }

  // Purple Line: AT Acumulado %
  const pAT_acum = [];
  let cumAT = 0;
  let cumTotal = 0;
  for (let i = 0; i < months.length; i++) {
    cumAT += qAT[i];
    cumTotal += totals[i];
    pAT_acum.push(cumTotal ? (cumAT / cumTotal) * 100 : 0);
  }

  const el = document.getElementById("chartTendencia");
  if (!el || !window.echarts) return;

  if (!chartTendencia) chartTendencia = echarts.init(el, null, { renderer: "canvas" });

  const labelMonths = months.map(formatMonthKey);

  const option = {
    grid: { left: 60, right: 30, top: 40, bottom: 90 },
    tooltip: {
      trigger: "axis",
      confine: true,
      formatter: (params) => {
        const idx = params?.[0]?.dataIndex ?? 0;
        const rawM = months[idx] ?? "";
        let html = `<b>TENDENCIA HISTÓRICA - ${rawM.toUpperCase()} (Total: ${fmtInt(totals[idx])})</b><br/>`;
        for (const p of params) {
          html += `${p.marker} ${p.seriesName}: <b>${_fmtNum1(p.data)}%</b><br/>`;
        }
        return html;
      }
    },
    legend: {
      bottom: 5,
      left: "center",
      itemWidth: 12,
      itemHeight: 10,
      textStyle: { fontWeight: 700, fontSize: 10 },
      data: [
        "CUMPLIDO AT", "CUMPLIDO FT CRITICO", "CUMPLIDO FT NO CRITICO", 
        "NO CUMPLIDO NO CRITICO", "NO CUMPLIDO CRITICO", "% AT Acumulado"
      ]
    },
    xAxis: {
      type: "category",
      data: labelMonths,
      axisLabel: { fontWeight: 700 }
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 100,
      axisLabel: { formatter: "{value}%", fontWeight: 700 },
      splitLine: { lineStyle: { color: "rgba(15,23,42,0.06)" } }
    },
    series: [
      {
        name: "CUMPLIDO AT",
        type: "line",
        data: pAT.map(v => +(v).toFixed(2)),
        symbolSize: 6,
        lineStyle: { width: 3, color: COLORS.green },
        itemStyle: { color: COLORS.green, borderColor: "#fff", borderWidth: 2 },
        label: {
          show: true,
          position: "top",
          fontWeight: 900,
          fontSize: 8.5,
          color: COLORS.text,
          formatter: (p) => _fmtPct(p.value)
        }
      },
      {
        name: "CUMPLIDO FT CRITICO",
        type: "line",
        data: pFTCrit.map(v => +(v).toFixed(2)),
        symbolSize: 6,
        lineStyle: { width: 2.5, color: COLORS.amber_crit },
        itemStyle: { color: COLORS.amber_crit, borderColor: "#fff", borderWidth: 2 },
        label: {
          show: true,
          position: "bottom",
          fontWeight: 900,
          fontSize: 8.5,
          color: COLORS.text,
          formatter: (p) => _fmtPct(p.value)
        }
      },
      {
        name: "CUMPLIDO FT NO CRITICO",
        type: "line",
        data: pFTNoCrit.map(v => +(v).toFixed(2)),
        symbolSize: 6,
        lineStyle: { width: 2.5, color: COLORS.amber_light },
        itemStyle: { color: COLORS.amber_light, borderColor: "#fff", borderWidth: 2 },
        label: {
          show: true,
          position: "bottom",
          fontWeight: 900,
          fontSize: 8.5,
          color: COLORS.text,
          formatter: (p) => _fmtPct(p.value)
        }
      },
      {
        name: "NO CUMPLIDO NO CRITICO",
        type: "line",
        data: pNONoCrit.map(v => +(v).toFixed(2)),
        symbolSize: 6,
        lineStyle: { width: 2.5, color: COLORS.red_light },
        itemStyle: { color: COLORS.red_light, borderColor: "#fff", borderWidth: 2 },
        label: {
          show: true,
          position: "top",
          fontWeight: 900,
          fontSize: 8.5,
          color: COLORS.text,
          formatter: (p) => _fmtPct(p.value)
        }
      },
      {
        name: "NO CUMPLIDO CRITICO",
        type: "line",
        data: pNOCrit.map(v => +(v).toFixed(2)),
        symbolSize: 6,
        lineStyle: { width: 2.5, color: COLORS.red_dark },
        itemStyle: { color: COLORS.red_dark, borderColor: "#fff", borderWidth: 2 },
        label: {
          show: true,
          position: "bottom",
          fontWeight: 900,
          fontSize: 8.5,
          color: COLORS.text,
          formatter: (p) => _fmtPct(p.value)
        }
      },
      {
        name: "% AT Acumulado",
        type: "line",
        data: pAT_acum.map(v => +(v).toFixed(2)),
        symbol: "square",
        symbolSize: 6,
        lineStyle: { width: 2.5, type: "dashed", color: COLORS.purple },
        itemStyle: { color: COLORS.purple, borderColor: "#fff", borderWidth: 1.5 },
        label: {
          show: true,
          position: "top",
          fontWeight: 900,
          fontSize: 8.5,
          color: COLORS.purple,
          formatter: (p) => _fmtPct(p.value)
        }
      }
    ]
  };

  chartTendencia.setOption(option, true);
  window.addEventListener("resize", () => chartTendencia && chartTendencia.resize(), { passive: true });
}

/* ============================
   DOWNLOAD CSV
   ============================ */
function escapeCSV(v) {
  const s = (v ?? "").toString();
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCSV(filename, rows, cols) {
  const header = cols.map(escapeCSV).join(";");
  const lines = rows.map(r => cols.map(c => escapeCSV(r[c])).join(";"));
  const csv = [header, ...lines].join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function getNoEntregadosRows(rows) {
  return rows.filter(r => toNumber(r[NO_NOCRIT_COL]) > 0 || toNumber(r[NO_CRIT_COL]) > 0);
}

// NUEVA FUNCIÓN AGREGADA
function getFueraDeTerminoRows(rows) {
  return rows.filter(r => toNumber(r[FT_CRIT_COL]) > 0 || toNumber(r[FT_NOCRIT_COL]) > 0);
}
/* ============================
   APPLY ALL FILTERS & RE-RENDER
   ============================ */
/* ============================
   RECALCULO DE FILTROS SUBORDINADOS
   ============================ */
/* ============================
   RECALCULO DE FILTROS SUBORDINADOS
   ============================ */
function updateSubordinatedFilters() {
 // 1. Obtenemos las filas filtradas ÚNICAMENTE por el select de Abastecimiento
  let rowsForSub = data;
  const abastVals = getSelValues("comprasAbastecimientoSelect");
  if (abastVals.includes("SI")) {
    rowsForSub = rowsForSub.filter(r => toNumber(r[COMPRAS_NICO_COL]) === 1);
  }

  // 2. Extraemos los valores únicos de esa porción de datos
  const activeBuyers = uniqSorted(rowsForSub.map(r => r[COMPRADOR_COL]));
  const activeOcs = uniqSorted(rowsForSub.map(r => r[GC_OC_COL]));

  // 3. Volvemos a llenar los select manteniendo la selección previa si existía
  fillSelect("compradorSelect", activeBuyers, "Todos");
  fillSelect("gcocSelect", activeOcs, "Todos");
}



function applyAll() {
  // RECALCULO DE SUBORDINADOS ANTES DE FILTRAR LA BASE GENERAL
  updateSubordinatedFilters();

  const rows = filteredRowsNoMes();

  const months = buildMesSelect(rows);

  // Update KPIs general & monthly
  updateKPIsGeneral(rows);
  updateKPIsMonthly(rows, months);

  // Render Charts
  buildChartMes(rows);
  buildChartTendencia(rows);
}
/* ============================
   INITIALIZATION
   ============================ */
window.addEventListener("DOMContentLoaded", () => {
  async function loadData() {
    console.log("Cargando reporte de cumplimiento compras con cache IndexedDB...");
    const gzUrl = csvUrl + ".gz?v=" + CACHE_BUSTER;
    const rawUrl = csvUrl + "?v=" + CACHE_BUSTER;

    try {
      if (typeof window.fetchWithCache === "function") {
        try {
          return await window.fetchWithCache(gzUrl);
        } catch (err) {
          console.warn("Could not load compressed Gzip file, falling back to raw CSV.", err);
          return await window.fetchWithCache(rawUrl);
        }
      } else {
        // Fallback without caching utility
        try {
          const response = await fetch(gzUrl);
          if (!response.ok) throw new Error("Gzip file fetch failed");
          const buf = await response.arrayBuffer();
          if (typeof fflate !== 'undefined') {
            const decompressed = fflate.gunzipSync(new Uint8Array(buf));
            return fflate.strFromU8(decompressed);
          } else {
            throw new Error("fflate library not loaded");
          }
        } catch (err) {
          console.warn("Gzip fetch/decompression failed, falling back to raw CSV fetch.", err);
          const response = await fetch(rawUrl);
          if (!response.ok) throw new Error(`No pude abrir el reporte ${csvUrl}`);
          return response.text();
        }
      }
    } catch (e) {
      throw new Error(`Error al cargar datos: ${e.message}`);
    }
  }

  loadData()
    .then(text => {
      // Parse CSV
      if (typeof Papa !== 'undefined') {
        const results = Papa.parse(text, {
          delimiter: DELIM,
          header: true,
          skipEmptyLines: true
        });
        data = results.data;
        headers = results.meta.fields;
      } else {
        showError("Librería PapaParse no está disponible.");
        return;
      }

      // Check required columns
      const required = [MONTH_COL, AT_COL, FT_CRIT_COL, FT_NOCRIT_COL, NO_NOCRIT_COL, NO_CRIT_COL];
      const missing = required.filter(c => !headers.includes(c));
      if (missing.length) {
        showError("Faltan columnas requeridas en el CSV: " + missing.join(", "));
        return;
      }

      // 1. Cliente Select
const clients = uniqSorted(data.map(r => r[CLIENTE_COL]));
fillSelect("clienteSelect", clients, "Todos");

// 2. Comprador Select
const buyers = uniqSorted(data.map(r => r[COMPRADOR_COL]));
fillSelect("compradorSelect", buyers, "Todos");

// 3. Clasificacion Select
const clasifs = uniqSorted(data.map(r => r[CLASIFICACION_COL]));
fillSelect("clasificacionSelect", clasifs, "Todos");

// 4. Grupo Compra OC Select
const ocs = uniqSorted(data.map(r => r[GC_OC_COL]));
fillSelect("gcocSelect", ocs, "Todos");

// 5. Centro Select (Nuevo)
const centros = uniqSorted(data.map(r => r[CENTRO_COL]));
fillSelect("centroSelect", centros, "Todos");

// 6. Proveedor Select
const provs = uniqSorted(data.map(r => r[PROVEEDOR_COL]));
fillSelect("proveedorSelect", provs, "Todos");

// Inicializar el nuevo checklist de Abastecimiento
renderComprasAbastecimiento();
applyAll();

      // Hide Loader
      const loader = document.getElementById("loader");
      if (loader) loader.classList.add("hidden");

      // Set up Event Listeners
 // Set up Event Listeners
      const elementsToListen = [
        "clienteSelect", "compradorSelect", "clasificacionSelect", 
        "gcocSelect", "centroSelect", "proveedorSelect", "comprasAbastecimientoSelect"
      ];

     elementsToListen.forEach(id => {
        document.getElementById(id)?.addEventListener("change", (e) => {
          enforceAllOption(e.target);
          applyAll(true);
        });
      });

      document.getElementById("mesSelect")?.addEventListener("change", (e) => {
        enforceAllOption(e.target);
        updateMesTitleFromSelect();
        const rows = filteredRowsNoMes();
        const months = [...new Set(rows.map(r => clean(r[MONTH_COL])).filter(Boolean))].sort();
        updateKPIsMonthly(rows, months);
      });

      document.getElementById("btnDownloadBase")?.addEventListener("click", () => {
        const rowsFilt = filteredRowsByAll();

        if (!rowsFilt.length) {
          alert("No hay registros para los filtros actuales.");
          return;
        }

        const cols = headers.slice();
        const comprador = safeFilePart(selLabel("compradorSelect"));
        const cliente = safeFilePart(selLabel("clienteSelect"));
        const mes = safeFilePart(selLabel("mesSelect"));
        const filename = `BASE_COMPLETA_COMPRAS_${comprador}_${cliente}_${mes}.csv`;
        
        downloadCSV(filename, rowsFilt, cols);
      });

    document.getElementById("btnDownloadNO")?.addEventListener("click", () => {
        const rowsFilt = filteredRowsByAll();
        const noRows = getNoEntregadosRows(rowsFilt);

        if (!noRows.length) {
          alert("No hay registros NO CUMPLIDOS para los filtros actuales.");
          return;
        }

        const cols = headers.slice();
        const comprador = safeFilePart(selLabel("compradorSelect"));
        const cliente = safeFilePart(selLabel("clienteSelect"));
        const mes = safeFilePart(selLabel("mesSelect"));
        const filename = `NO_CUMPLIDOS_COMPRAS_${comprador}_${cliente}_${mes}.csv`;
        
        downloadCSV(filename, noRows, cols);
      });

      // NUEVO ESCUCHADOR PARA EL BOTÓN AGREGADO
      document.getElementById("btnDownloadFT")?.addEventListener("click", () => {
        const rowsFilt = filteredRowsByAll();
        const ftRows = getFueraDeTerminoRows(rowsFilt);

        if (!ftRows.length) {
          alert("No hay registros FUERA DE TÉRMINO para los filtros actuales.");
          return;
        }

        const cols = headers.slice();
        const comprador = safeFilePart(selLabel("compradorSelect"));
        const cliente = safeFilePart(selLabel("clienteSelect"));
        const mes = safeFilePart(selLabel("mesSelect"));
        const filename = `FUERA_DE_TERMINO_COMPRAS_${comprador}_${cliente}_${mes}.csv`;
        
        downloadCSV(filename, ftRows, cols);
      });

      setHTML("msg", "");
    })
    .catch(err => {
      console.error(err);
      showError("Error cargando CSV: " + (err?.message || err));
    })
    .finally(() => {
      const loader = document.getElementById("loader");
      if (loader && !loader.classList.contains("hidden")) loader.classList.add("hidden");
    });
});
