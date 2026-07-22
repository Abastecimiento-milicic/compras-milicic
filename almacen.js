/* ===== Cumplimiento de Almacén JS Logic ===== */

// Cache Buster unificado
const CACHE_BUSTER = window.MI_CACHE_VERSION;

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

const TARGET_OBJ = 78; // Objetivo Almacén: 78%

/* ============================
   COLORES (TEMA ALMACÉN - NARANJA)
   ============================ */
const COLORS = {
  green: "#10b981",       
  amber: "#f59e0b",  
  red: "#ef4444",    
  purple: "#8b5cf6",      
  orange_brand: "#F26716",  
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

  const clients = getSelValues("clienteSelect");
  if (clients.length) rows = rows.filter(r => clients.includes(clean(r[CLIENTE_COL])));

  const clasifs = getSelValues("clasificacionSelect");
  if (clasifs.length) rows = rows.filter(r => clasifs.includes(clean(r[CLASIFICACION_COL])));

  const clases = getSelValues("claseDocSelect");
  if (clases.length) rows = rows.filter(r => clases.includes(clean(r[CLASE_DOC_COL])));

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
  let at = 0, ft = 0, no = 0;
  for (const r of rows) {
    at += toNumber(r["CUMPLIDO AT"]);
    ft += toNumber(r["CUMPLIDO FT"]);
    no += toNumber(r["NO CUMPLIDO ALMACEN"]);
  }
  const total = at + ft + no;
  return { at, ft, no, total };
}

function calcMonthTotals(rows, month) {
  let at = 0, ft = 0, no = 0;
  for (const r of rows) {
    if (clean(r[MONTH_COL]) !== month) continue;
    at += toNumber(r["CUMPLIDO AT"]);
    ft += toNumber(r["CUMPLIDO FT"]);
    no += toNumber(r["NO CUMPLIDO ALMACEN"]);
  }
  const total = at + ft + no;
  return { 
    at, ft, no, total,
    pctAT: total ? at / total : NaN,
    pctFT: total ? ft / total : NaN,
    pctNO: total ? no / total : NaN 
  };
}

function updateKPIsGeneral(rows) {
  const t = calcTotals(rows);
  const pctAT = t.total ? t.at / t.total : NaN;

  setText("kpiTotal", fmtInt(t.total));
  setText("kpiATpct", fmtPct01(pctAT));
  setText("kpiATqty", `Cantidad: ${fmtInt(t.at)}`);
  
  const elAT = document.getElementById("kpiATpct");
  if (elAT) elAT.style.color = (isFinite(pctAT) && pctAT >= (TARGET_OBJ / 100)) ? "#10b981" : "#ef4444";

  setText("kpiFTPct", fmtPct01(t.total ? t.ft / t.total : NaN));
  setText("kpiFTQty", `Cantidad: ${fmtInt(t.ft)}`);

  setText("kpiNOPct", fmtPct01(t.total ? t.no / t.total : NaN));
  setText("kpiNOQty", `Cantidad: ${fmtInt(t.no)}`);

  const avgG = avgDelay(rows);
  setText("kpiDemoraAvg", isNaN(avgG) ? "-" : (Math.round(avgG) + " d"));
  const elDemG = document.getElementById("kpiDemoraAvg");
  if (elDemG) elDemG.style.color = (!isNaN(avgG) && avgG > 7) ? "#ef4444" : "#10b981";
}

function updateKPIsMonthly(rows, months) {
  const mes = getSingleMes(months);
  if (!mes) return;

  const cur = calcMonthTotals(rows, mes);
  setText("kpiTotalMes", fmtInt(cur.total));
  setText("kpiATmes", fmtPct01(cur.pctAT));
  
  const elATmes = document.getElementById("kpiATmes");
  if (elATmes) elATmes.style.color = (isFinite(cur.pctAT) && cur.pctAT >= (TARGET_OBJ / 100)) ? "#10b981" : "#ef4444";

  setText("kpiFTmes", fmtPct01(cur.pctFT));
  setText("kpiNOmes", fmtPct01(cur.pctNO));

  const mesRows = rows.filter(r => clean(r[MONTH_COL]) === mes);
  const avgM = avgDelay(mesRows);
  setText("kpiDemoraMes", isNaN(avgM) ? "-" : (Math.round(avgM) + " d"));
  const elDemM = document.getElementById("kpiDemoraMes");
  if (elDemM) elDemM.style.color = (!isNaN(avgM) && avgM > 7) ? "#ef4444" : "#10b981";
}

/* ============================
   CHARTS (ECHARTS ALMACÉN COMPLETO Y AJUSTADO)
   ============================ */
function buildChartMes(rows) {
  const agg = new Map();
  const monthsSet = new Set();

  for (const r of rows) {
    const mk = clean(r[MONTH_COL]);
    if (!mk) continue;
    monthsSet.add(mk);

    if (!agg.has(mk)) {
      agg.set(mk, { at: 0, ft: 0, no: 0, demSum: 0, demCnt: 0 });
    }
    const c = agg.get(mk);
    c.at += toNumber(r["CUMPLIDO AT"]);
    c.ft += toNumber(r["CUMPLIDO FT"]);
    c.no += toNumber(r["NO CUMPLIDO ALMACEN"]);

    const dem = toNumAny(r[DEMORA_COL]);
    if (!isNaN(dem)) { c.demSum += dem; c.demCnt += 1; }
  }

  const months = [...monthsSet].sort();
  const qAT = months.map(m => agg.get(m)?.at ?? 0);
  const qFT = months.map(m => agg.get(m)?.ft ?? 0);
  const qNO = months.map(m => agg.get(m)?.no ?? 0);

  const totals = months.map((_, i) => qAT[i] + qFT[i] + qNO[i]);

  const pAT = months.map((_, i) => totals[i] ? (qAT[i] / totals[i]) * 100 : 0);
  const pFT = months.map((_, i) => totals[i] ? (qFT[i] / totals[i]) * 100 : 0);
  const pNO = months.map((_, i) => totals[i] ? (qNO[i] / totals[i]) * 100 : 0);

  // Línea Violeta: % AT Acumulado
  const pAT_acum = [];
  let cumAT = 0, cumTotal = 0;
  for (let i = 0; i < months.length; i++) {
    cumAT += qAT[i];
    cumTotal += totals[i];
    pAT_acum.push(cumTotal ? (cumAT / cumTotal) * 100 : 0);
  }

  const avgDem = months.map(m => {
    const c = agg.get(m);
    return (c && c.demCnt) ? (c.demSum / c.demCnt) : null;
  });

  const el = document.getElementById("chartMes");
  if (!el || !window.echarts) return;
  if (!chartMes) chartMes = echarts.init(el, null, { renderer: "canvas" });

  const labelMonths = months.map(formatMonthKey);

  const option = {
    // Aumentamos el margen superior (top: 55) para que no se corten las etiquetas rojas superiores
    grid: { left: 55, right: 65, top: 55, bottom: 65 },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      confine: true,
      formatter: (params) => {
        const idx = params?.[0]?.dataIndex ?? 0;
        const rawM = months[idx] ?? "";
        let html = `<b>${rawM.toUpperCase()} (Total: ${fmtInt(totals[idx])})</b><br/>`;
        
        const byName = Object.fromEntries(params.map(p => [p.seriesName, p]));
        const at = byName["Entregados AT"];
        const ft = byName["Entregados FT"];
        const no = byName["No entregados"];
        const cum = byName["%AT Acumulado"];
        const dem = byName["Promedio días de demora"];

        if (at) html += `${at.marker} Entregados AT: <b>${fmtInt(qAT[idx])}</b> (${_fmtNum1(at.value)}%)<br/>`;
        if (ft) html += `${ft.marker} Entregados FT: <b>${fmtInt(qFT[idx])}</b> (${_fmtNum1(ft.value)}%)<br/>`;
        if (no) html += `${no.marker} No entregados: <b>${fmtInt(qNO[idx])}</b> (${_fmtNum1(no.value)}%)<br/>`;
        if (cum) html += `${cum.marker} <span style="color:#8b5cf6;">%AT Acumulado: <b>${_fmtNum1(cum.value)}%</b></span><br/>`;
        if (dem && dem.value != null) html += `${dem.marker} <span style="color:#0284c7;">Demora prom.: <b>${_fmtNum1(dem.value)}</b> d</span><br/>`;
        return html;
      }
    },
    legend: {
      bottom: 0,
      left: "center",
      itemWidth: 14,
      itemHeight: 10,
      textStyle: { fontWeight: 700, fontSize: 12 },
      data: ["Entregados AT", "Entregados FT", "No entregados", "%AT Acumulado", "Promedio días de demora"]
    },
    xAxis: {
      type: "category",
      data: labelMonths,
      axisLabel: { fontWeight: 800, fontSize: 11, color: "#334155" }
    },
    yAxis: [
      {
        type: "value",
        min: 0,
        max: 100,
        interval: 20,
        axisLabel: { formatter: "{value}%", fontWeight: 700, fontSize: 11 },
        splitLine: { lineStyle: { color: "rgba(15,23,42,0.06)" } }
      },
      {
        type: "value",
        name: "Días de demora",
        nameTextStyle: { fontWeight: 700, fontSize: 11, color: "#64748b" },
        position: "right",
        min: 0,
        max: 25,
        interval: 5,
        axisLabel: { fontWeight: 700, fontSize: 11 },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: "Entregados AT",
        type: "bar",
        stack: "pct",
        data: pAT.map((v, idx) => {
          const val = +(v).toFixed(2);
          const q = qAT[idx];
          const pct = Math.round(v);
          if (v < TARGET_OBJ) {
            return {
              value: val,
              itemStyle: { borderColor: "#ef4444", borderWidth: 2, borderType: "solid" },
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
                fontSize: 10,
                formatter: () => `⚠️ ${fmtInt(q)}\n(${pct}%)`
              }
            };
          } else {
            return {
              value: val,
              label: {
                show: true,
                position: "inside",
                fontWeight: 900,
                fontSize: 10,
                color: "#ffffff",
                formatter: () => `${fmtInt(q)}\n(${pct}%)`
              }
            };
          }
        }),
        barMaxWidth: 44,
        itemStyle: { color: COLORS.green }
      },
      {
        name: "Entregados FT",
        type: "bar",
        stack: "pct",
        data: pFT.map((v, idx) => {
          const val = +(v).toFixed(2);
          const q = qFT[idx];
          const pct = Math.round(v);
          return {
            value: val,
            label: {
              show: true,
              position: "inside",
              fontWeight: 900,
              fontSize: 10,
              color: "#0f172a",
              formatter: () => pct > 4 ? `${fmtInt(q)}\n(${pct}%)` : ""
            }
          };
        }),
        barMaxWidth: 44,
        itemStyle: { color: COLORS.amber }
      },
      {
        name: "No entregados",
        type: "bar",
        stack: "pct",
        data: pNO.map((v, idx) => {
          const val = +(v).toFixed(2);
          const q = qNO[idx];
          const pct = Math.round(v);
          return {
            value: val,
            label: {
              show: true,
              position: "top",
              backgroundColor: "#ef4444",
              color: "#ffffff",
              borderRadius: 4,
              padding: [3, 5],
              fontWeight: 900,
              fontSize: 10,
              formatter: () => `${fmtInt(q)} (${pct}%)`
            }
          };
        }),
        barMaxWidth: 44,
        itemStyle: { color: COLORS.red }
      },
      {
        name: "%AT Acumulado",
        type: "line",
        data: pAT_acum.map(v => +(v).toFixed(2)),
        symbol: "square",
        symbolSize: 7,
        lineStyle: { width: 3, color: COLORS.purple },
        itemStyle: { color: COLORS.purple, borderColor: "#fff", borderWidth: 1.5 },
        label: {
          show: true,
          position: "top",
          backgroundColor: "#ffffff",
          borderColor: COLORS.purple,
          borderWidth: 1.5,
          borderRadius: 4,
          padding: [3, 5],
          fontWeight: 900,
          fontSize: 10,
          color: "#6b21a8",
          formatter: (p) => _fmtPct(p.value)
        },
        markLine: {
          silent: true,
          symbol: ["none", "none"],
          lineStyle: { type: "dashed", width: 2, color: "#1e293b" },
          data: [
            {
              yAxis: TARGET_OBJ,
              label: {
                show: true,
                position: "end",
                fontWeight: 900,
                fontSize: 11,
                backgroundColor: "#1e293b",
                borderRadius: 4,
                padding: [4, 6],
                color: "#ffffff",
                formatter: `Obj ${TARGET_OBJ}%`
              }
            }
          ]
        }
      },
      {
        name: "Promedio días de demora",
        type: "line",
        yAxisIndex: 1,
        data: avgDem,
        symbol: "circle",
        symbolSize: 8,
        lineStyle: { width: 3, color: COLORS.blue },
        itemStyle: { color: COLORS.blue, borderColor: "#fff", borderWidth: 2 },
        label: {
          show: true,
          position: "bottom",
          backgroundColor: "#ffffff",
          borderColor: COLORS.blue,
          borderWidth: 1.5,
          padding: [3, 6],
          borderRadius: 4,
          fontWeight: 900,
          fontSize: 10,
          color: COLORS.blue,
          formatter: (p) => (p.value == null || isNaN(p.value)) ? "" : `${Math.round(p.value)} d`
        },
        markLine: {
          silent: true,
          symbol: ["none", "none"],
          lineStyle: { type: "dashed", width: 1.5, color: "#475569" },
          data: [
            {
              yAxis: 7,
              label: {
                show: true,
                position: "end",
                fontWeight: 900,
                fontSize: 11,
                backgroundColor: "#334155",
                borderRadius: 3,
                padding: [3, 5],
                color: "#ffffff",
                formatter: "Lím 7 d"
              }
            }
          ]
        }
      }
    ]
  };

  chartMes.setOption(option, true);
}

/* ============================
   CHART 2: TENDENCIA HISTÓRICA
   ============================ */
function buildChartTendencia(rows) {
  const agg = new Map();
  const monthsSet = new Set();

  for (const r of rows) {
    const mk = clean(r[MONTH_COL]);
    if (!mk) continue;
    monthsSet.add(mk);

    if (!agg.has(mk)) {
      agg.set(mk, { at: 0, ft: 0, no: 0 });
    }
    const c = agg.get(mk);
    c.at += toNumber(r["CUMPLIDO AT"]);
    c.ft += toNumber(r["CUMPLIDO FT"]);
    c.no += toNumber(r["NO CUMPLIDO ALMACEN"]);
  }

  const months = [...monthsSet].sort();
  const totals = months.map(m => agg.get(m).at + agg.get(m).ft + agg.get(m).no);

  const pAT = months.map((m, i) => totals[i] ? (agg.get(m).at / totals[i]) * 100 : 0);
  const pFT = months.map((m, i) => totals[i] ? (agg.get(m).ft / totals[i]) * 100 : 0);
  const pNO = months.map((m, i) => totals[i] ? (agg.get(m).no / totals[i]) * 100 : 0);

  const el = document.getElementById("chartTendencia");
  if (!el || !window.echarts) return;
  if (!chartTendencia) chartTendencia = echarts.init(el, null, { renderer: "canvas" });

  const labelMonths = months.map(formatMonthKey);

  const option = {
    grid: { left: 50, right: 30, top: 40, bottom: 50 },
    tooltip: { trigger: "axis", confine: true },
    legend: {
      bottom: 0,
      left: "center",
      textStyle: { fontWeight: 700, fontSize: 11 },
      data: ["A Tiempo %", "Fuera Tiempo %", "No Entregados %"]
    },
    xAxis: { type: "category", data: labelMonths, axisLabel: { fontWeight: 800, fontSize: 11 } },
    yAxis: {
      type: "value",
      min: 0,
      max: 100,
      axisLabel: { formatter: "{value}%", fontWeight: 700, fontSize: 11 },
      splitLine: { lineStyle: { color: "rgba(15,23,42,0.06)" } }
    },
    series: [
      {
        name: "A Tiempo %",
        type: "line",
        data: pAT.map(v => {
          const val = +(v).toFixed(1);
          if (v < TARGET_OBJ) {
            return {
              value: val,
              label: {
                show: true,
                position: "top",
                backgroundColor: "#ffffff",
                borderColor: "#ef4444",
                borderWidth: 1.5,
                borderRadius: 4,
                padding: [2, 4],
                color: "#b91c1c",
                fontWeight: 900,
                fontSize: 10,
                formatter: (p) => `⚠️ ${_fmtNum1(p.value)}%`
              }
            };
          }
          return {
            value: val,
            label: {
              show: true,
              position: "top",
              fontWeight: 900,
              fontSize: 10,
              color: "#10b981",
              formatter: (p) => `${_fmtNum1(p.value)}%`
            }
          };
        }),
        lineStyle: { width: 3, color: COLORS.green },
        itemStyle: { color: COLORS.green }
      },
      {
        name: "Fuera Tiempo %",
        type: "line",
        data: pFT.map(v => +(v).toFixed(1)),
        lineStyle: { width: 2.5, color: COLORS.amber },
        itemStyle: { color: COLORS.amber },
        label: {
          show: true,
          position: "top",
          fontWeight: 800,
          fontSize: 10,
          color: "#0f172a",
          formatter: (p) => `${_fmtNum1(p.value)}%`
        }
      },
      {
        name: "No Entregados %",
        type: "line",
        data: pNO.map(v => +(v).toFixed(1)),
        lineStyle: { width: 2.5, color: COLORS.red },
        itemStyle: { color: COLORS.red },
        label: {
          show: true,
          position: "top",
          fontWeight: 800,
          fontSize: 10,
          color: "#b91c1c",
          formatter: (p) => `${_fmtNum1(p.value)}%`
        }
      }
    ]
  };

  chartTendencia.setOption(option, true);
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
  buildChartTendencia(rows);
}

/* ============================
   INIT Y CARGA RÁPIDA CON CACHÉ
   ============================ */
window.addEventListener("DOMContentLoaded", () => {
  async function loadData() {
    console.log("[almacen] Cargando datos con caché IndexedDB...");
    const gzUrl = csvUrl + ".gz?v=" + CACHE_BUSTER;
    const rawUrl = csvUrl + "?v=" + CACHE_BUSTER;

    if (typeof window.fetchWithCache === "function") {
      try {
        return await window.fetchWithCache(gzUrl);
      } catch (err) {
        return await window.fetchWithCache(rawUrl);
      }
    } else {
      const response = await fetch(rawUrl);
      if (!response.ok) throw new Error(`No se pudo abrir ${csvUrl}`);
      return response.text();
    }
  }

  loadData()
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

      document.getElementById("btnDownloadNO")?.addEventListener("click", () => {
        const rows = filteredRowsByAll().filter(r => toNumber(r["NO CUMPLIDO ALMACEN"]) > 0);
        downloadCSV("NO_CUMPLIDOS_ALMACEN.csv", rows, headers);
      });

      document.getElementById("btnDownloadFT")?.addEventListener("click", () => {
        const rows = filteredRowsByAll().filter(r => toNumber(r["CUMPLIDO FT"]) > 0);
        downloadCSV("FUERA_TERMINO_ALMACEN.csv", rows, headers);
      });
    })
    .catch(err => {
      console.error(err);
      showError("Error cargando datos de Almacén: " + (err?.message || err));
    })
    .finally(() => {
      const loader = document.getElementById("loader");
      if (loader && !loader.classList.contains("hidden")) loader.classList.add("hidden");
    });
});

window.addEventListener("resize", () => {
  if (chartMes) chartMes.resize();
  if (chartTendencia) chartTendencia.resize();
}, { passive: true });
