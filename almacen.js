/* ===== Cumplimiento de Almacén JS Logic ===== */

// Cache Buster dinámico: Si existe MI_CACHE_VERSION la usa, si no, genera un timestamp único
const getCacheBuster = () => window.MI_CACHE_VERSION || new Date().getTime().toString();

window.forceRefreshData = function() {
  console.log("[almacen] Wiping cache and refreshing...");
  sessionStorage.removeItem("mi_cache_buster");
  localStorage.clear(); // Limpia también el almacenamiento local si hubiera copia guardada
  
  if (typeof window.clearDataCache === "function") {
    window.clearDataCache().finally(() => window.location.reload(true));
  } else {
    window.location.reload(true);
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
const FECHA_COL = "FECHA ENTREGA ESPERADA";

let AT_COL = "CUMPLIDO AT";
let FT_COL = "CUMPLIDO FT";
let NO_COL = "NO CUMPLIDO ALMACEN";

const CLIENTE_COL = "CLIENTE";
const CLASIFICACION_COL = "CLASIFICACION";
const CLASE_DOC_COL = "CLASE DE DOC";
const BASE_ROS_COL = "BASE ROS";

const TARGET_OBJ = 78; // Objetivo Almacén: 78%

/* ============================
   COLORES (TEMA ALMACÉN - NARANJA)
   ============================ */
  const COLORS = {
    blue: "#3b82f6",
    green: "#10b981",
    amber: "#f59e0b",
    red: "#ef4444",
    grid: "rgba(15, 23, 42, 0.10)",
    text: "#0f172a",
    muted: "#64748b",
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

function deltaInfo(curr, prev) {
  if (isNaN(curr) || isNaN(prev)) return { text: "-", diff: 0 };
  const diff = curr - prev;
  const sign = diff > 0 ? "▲" : diff < 0 ? "▼" : "=";
  const pct = Math.abs(diff * 100).toFixed(1).replace(".", ",") + "%";
  return { text: `${sign} ${pct} vs mes anterior`, diff };
}

function setDelta(el, text, cls) {
  if (!el) return;
  el.textContent = text;
  el.className = "kpi-sub kpi-sub-strong " + cls;
}

function updateKPIsMonthly(rows, months) {
  const ms = getSelValues("mesSelect");
  if (!ms.length) {
    const t = calcTotals(rows);
    const pctAT = t.total ? t.at / t.total : NaN;
    const pctFT = t.total ? t.ft / t.total : NaN;
    const pctNO = t.total ? t.no / t.total : NaN;

    setText("kpiTotalMes", fmtInt(t.total));

    setText("kpiATmes", fmtPct01(pctAT));
    const elATmes = document.getElementById("kpiATmes");
    if (elATmes) elATmes.style.color = (isFinite(pctAT) && pctAT >= (TARGET_OBJ / 100)) ? "#10b981" : "#ef4444";

    setText("kpiFTmes", fmtPct01(pctFT));
    setText("kpiNOmes", fmtPct01(pctNO));

    const avgM = avgDelay(rows);
    setText("kpiDemoraMes", isNaN(avgM) ? "-" : (Math.round(avgM) + " d"));
    const elDemM = document.getElementById("kpiDemoraMes");
    if (elDemM) elDemM.style.color = (!isNaN(avgM) && avgM > 7) ? "#ef4444" : "#10b981";

    const atSub = document.getElementById("kpiATmesSub");
    const ftSub = document.getElementById("kpiFTmesSub");
    const noSub = document.getElementById("kpiNOmesSub");

    if (atSub) setDelta(atSub, `Cant: ${fmtInt(t.at)} · Todos los meses`, "delta-neutral");
    if (ftSub) setDelta(ftSub, `Cant: ${fmtInt(t.ft)} · Todos los meses`, "delta-neutral");
    if (noSub) setDelta(noSub, `Cant: ${fmtInt(t.no)} · Todos los meses`, "delta-neutral");
    return;
  }

  const mes = getSingleMes(months);
  if (!mes) return;

  const idx = months.indexOf(mes);
  const prevMes = idx > 0 ? months[idx - 1] : null;

  const cur = calcMonthTotals(rows, mes);
  const prev = prevMes ? calcMonthTotals(rows, prevMes) : null;

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

  const atSub = document.getElementById("kpiATmesSub");
  const ftSub = document.getElementById("kpiFTmesSub");
  const noSub = document.getElementById("kpiNOmesSub");

  if (!prev) {
    setDelta(atSub, `Cant: ${fmtInt(cur.at)} · Sin mes anterior`, "delta-neutral");
    setDelta(ftSub, `Cant: ${fmtInt(cur.ft)} · Sin mes anterior`, "delta-neutral");
    setDelta(noSub, `Cant: ${fmtInt(cur.no)} · Sin mes anterior`, "delta-neutral");
    return;
  }

  const dAT = deltaInfo(cur.pctAT, prev.pctAT);
  const dFT = deltaInfo(cur.pctFT, prev.pctFT);
  const dNO = deltaInfo(cur.pctNO, prev.pctNO);

  let clsAT = "delta-good";
  if (dAT.diff < 0) clsAT = "delta-bad";

  let clsFT = "delta-bad";
  if (dFT.diff < 0) clsFT = "delta-good";

  let clsNO = "delta-good";
  if (dNO.diff > 0) clsNO = "delta-bad";

  setDelta(atSub, `Cant: ${fmtInt(cur.at)} · ${dAT.text}`, clsAT);
  setDelta(ftSub, `Cant: ${fmtInt(cur.ft)} · ${dFT.text}`, clsFT);
  setDelta(noSub, `Cant: ${fmtInt(cur.no)} · ${dNO.text}`, clsNO);
}

/* ============================
   CHARTS (ECHARTS ALMACÉN COMPLETO Y AJUSTADO)
   ============================ */


  function parseDateAny(s) {
    const t = clean(s);
    if (!t) return null;

    let m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);

    m = t.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);

    return null;
  }

  function monthKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function getMonthKeyFromRow(r) {
    const d = parseDateAny(r[FECHA_COL]);
    return d ? monthKey(d) : null;
  }

function buildChartMes(rows) {
    const agg = new Map();
    const monthsSet = new Set();

    for (const r of rows) {
      const d = parseDateAny(r[FECHA_COL]);
      if (!d) continue;

      const mk = monthKey(d);
      monthsSet.add(mk);

      if (!agg.has(mk)) agg.set(mk, { at: 0, ft: 0, no: 0, comp: 0, demSum: 0, demCnt: 0 });
      const c = agg.get(mk);

      let rAt = toNumber(r[AT_COL]);
      let rFt = toNumber(r[FT_COL]);
      let rNo = toNumber(r[NO_COL]);

      c.at += rAt;
      c.ft += rFt;
      c.no += rNo;
      c.comp += toNumber(r["COMPROMETIDOS"]) || (rAt + rFt + rNo);

      const dem = toNumAny(r[DEMORA_COL]);
      if (!isNaN(dem)) { c.demSum += dem; c.demCnt += 1; }
    }

    const months = [...monthsSet].sort();
    const qAT = months.map(m => agg.get(m)?.at ?? 0);
    const qFT = months.map(m => agg.get(m)?.ft ?? 0);
    const qNO = months.map(m => agg.get(m)?.no ?? 0);

    const pAT = qAT.map((v, i) => { const t = qAT[i] + qFT[i] + qNO[i]; return t ? (v / t) * 100 : 0; });
    const pFT = qFT.map((v, i) => { const t = qAT[i] + qFT[i] + qNO[i]; return t ? (v / t) * 100 : 0; });
    const pNO = qNO.map((v, i) => { const t = qAT[i] + qFT[i] + qNO[i]; return t ? (v / t) * 100 : 0; });

    const avgDem = months.map(m => {
      const c = agg.get(m);
      return (c && c.demCnt) ? (c.demSum / c.demCnt) : null;
    });

    const pAT_acum = [];
    let sumaEntregadosATAcum = 0;
    let sumaComprometidosAcum = 0;

    for (let i = 0; i < months.length; i++) {
      const c = agg.get(months[i]);
      sumaEntregadosATAcum += (c?.at ?? 0);
      sumaComprometidosAcum += (c?.comp ?? 0);
      const pctAcum = sumaComprometidosAcum ? (sumaEntregadosATAcum / sumaComprometidosAcum) * 100 : 0;
      pAT_acum.push(pctAcum);
    }

    const el = document.getElementById("chartMes");
    if (!el || !window.echarts) return;

    if (!chartMes) chartMes = echarts.init(el, null, { renderer: "canvas" });

    const lineSegments = [];

    if (months.length === 1) {
      const anoActual = parseInt(months[0].substring(0, 4), 10);
      const hActual = (anoActual >= 2026) ? 78 : 75;
      lineSegments.push({
        yAxis: hActual,
        label: {
          show: true,
          formatter: `Obj ${hActual}%`,
          fontWeight: 800,
          fontSize: 11,
          position: "end",
          backgroundColor: '#374151',
          color: '#fff',
          padding: [4, 6],
          borderRadius: 4
        }
      });
    } else {
      for (let i = 0; i < months.length - 1; i++) {
        const anoActual = parseInt(months[i].substring(0, 4), 10);
        const hActual = (anoActual >= 2026) ? 78 : 75;
        
        const isLastSegment = (i === months.length - 2);

        const anoSig = parseInt(months[i + 1].substring(0, 4), 10);
        const hSig = (anoSig >= 2026) ? 78 : 75;

        const showLabelOnHorizontal = isLastSegment && (hActual === hSig);

        lineSegments.push([
          { 
            xAxis: i, 
            yAxis: hActual, 
            label: showLabelOnHorizontal ? {
              show: true,
              formatter: `Obj ${hSig}%`,
              fontWeight: 800,
              fontSize: 11,
              position: "end",
              offset: [35, 0],
              backgroundColor: '#374151',
              color: '#fff',
              padding: [4, 6],
              borderRadius: 4
            } : { show: false }
          },
          { 
            xAxis: i + 1, 
            yAxis: hActual
          }
        ]);

        if (hActual !== hSig) {
          const showLabelOnVertical = isLastSegment;
          
          lineSegments.push([
            { 
              xAxis: i + 1, 
              yAxis: hActual, 
              label: showLabelOnVertical ? {
                show: true,
                formatter: `Obj ${hSig}%`,
                fontWeight: 800,
                fontSize: 11,
                position: "end",
                offset: [35, 0],
                backgroundColor: '#374151',
                color: '#fff',
                padding: [4, 6],
                borderRadius: 4
              } : { show: false }
            },
            { 
              xAxis: i + 1, 
              yAxis: hSig
            }
          ]);
        }
      }
    }

    const option = {
      animation: true,
      animationDuration: 800,
      animationDurationUpdate: 600,
      animationEasing: "cubicOut",
      animationEasingUpdate: "cubicOut",
      grid: { left: 56, right: 70, top: 40, bottom: 62 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        confine: true,
        backgroundColor: "transparent",
        borderColor: "transparent",
        shadowColor: "transparent",
        shadowBlur: 0,
        borderWidth: 0,
        padding: 0,
        formatter: (params) => {
          const axis = params?.[0]?.axisValue ?? "";
          const byName = Object.fromEntries(params.map(p => [p.seriesName, p]));
          const at = byName["Entregados AT"];
          const ft = byName["Entregados FT"];
          const ne = byName["No entregados"];
          const acum = byName["%AT Acumulado"];
          const dem = byName["Promedio días de demora"];

          let html = `
            <div style="font-family: var(--font-body), sans-serif; padding: 10px 14px; min-width: 190px; background: #ffffff; border-radius: 8px; box-shadow: var(--shadow-xl); border: 1.5px solid var(--border-light); color: var(--text-main);">
              <div style="font-family: var(--font-main), sans-serif; font-weight: 800; font-size: 0.9rem; margin-bottom: 8px; border-bottom: 1.5px solid var(--border-light); padding-bottom: 6px; color: var(--text-main); letter-spacing: 0.02em;">
                📅 ${axis}
              </div>
              <div style="display: flex; flex-direction: column; gap: 6px;">
          `;

          if (at) {
            html += `
              <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8rem; gap: 15px;">
                <span style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600; color: var(--text-muted);">
                  <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #10b981;"></span>
                  A Tiempo
                </span>
                <span style="font-weight: 800; color: var(--text-main);">${fmtInt(qAT[at.dataIndex])} <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 500;">(${_fmtNum1(at.value)}%)</span></span>
              </div>
            `;
          }
          if (ft) {
            html += `
              <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8rem; gap: 15px;">
                <span style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600; color: var(--text-muted);">
                  <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #f59e0b;"></span>
                  Fuera Tiempo
                </span>
                <span style="font-weight: 800; color: var(--text-main);">${fmtInt(qFT[ft.dataIndex])} <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 500;">(${_fmtNum1(ft.value)}%)</span></span>
              </div>
            `;
          }
          if (ne) {
            html += `
              <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8rem; gap: 15px;">
                <span style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600; color: var(--text-muted);">
                  <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #ef4444;"></span>
                  No Entregados
                </span>
                <span style="font-weight: 800; color: #ef4444;">${fmtInt(qNO[ne.dataIndex])} <span style="font-size: 0.75rem; color: #ef4444; font-weight: 600;">(${_fmtNum1(ne.value)}%)</span></span>
              </div>
            `;
          }
          if (acum) {
            html += `
              <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8rem; border-top: 1.5px solid var(--border-light); padding-top: 6px; margin-top: 2px; gap: 15px;">
                <span style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600; color: var(--text-muted);">
                  <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #7c3aed;"></span>
                  % AT Acum.
                </span>
                <span style="font-weight: 800; color: #7c3aed;">${_fmtNum1(acum.value)}%</span>
              </div>
            `;
          }
          if (dem && dem.value != null && !isNaN(dem.value)) {
            html += `
              <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8rem; border-top: 1.5px solid var(--border-light); padding-top: 6px; margin-top: 2px; gap: 15px;">
                <span style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600; color: var(--text-muted);">
                  <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #3b82f6;"></span>
                  Demora Prom.
                </span>
                <span style="font-weight: 800; color: #2563eb;">${Math.round(dem.value)} días</span>
              </div>
            `;
          }

          html += `
              </div>
            </div>
          `;
          return html;
        }
      },
      legend: {
        bottom: 12,
        left: "center",
        itemWidth: 14,
        itemHeight: 10,
        textStyle: { fontWeight: 800 }
      },
      xAxis: {
        type: "category",
        data: months,
        axisTick: { alignWithLabel: true },
        axisLabel: { fontWeight: 700 }
      },
      yAxis: [
        {
          type: "value",
          min: 0,
          max: 100,
          axisLabel: { formatter: "{value}%" },
          splitLine: { lineStyle: { color: "rgba(15,23,42,0.10)" } }
        },
        {
          type: "value",
          name: "Días de demora",
          position: "right",
          axisLabel: { fontWeight: 700 },
          splitLine: { show: false },
          boundaryGap: [0, '25%']
        }
      ],
      series: [
        {
          name: "Entregados AT",
          type: "bar",
          stack: "pct",
          data: pAT.map(v => {
            const val = +(+v).toFixed(4);
            if (val < 78) {
              return {
                value: val,
                itemStyle: {
                  borderColor: '#dc2626',
                  borderWidth: 2,
                  borderType: 'solid',
                  borderRadius: [6, 6, 0, 0]
                }
              };
            }
            return val;
          }),
          barMaxWidth: 52,
          itemStyle: {
            color: {
              type: "linear",
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: "#10b981" },
                { offset: 1, color: "#047857" }
              ]
            },
            borderRadius: [6, 6, 0, 0]
          },
          label: {
            show: true,
            position: "insideBottom", 
            distance: 10,
            fontWeight: 900,
            fontSize: 11,
            lineHeight: 12,
            formatter: (p) => {
              const i = p.dataIndex;
              const pct = +p.value || 0;
              const q = (qAT)[i] || 0;
              if (!q) return "";
              if (pct < 6) return "";
              const pctRound = Math.round(pct);
              if (pct < 78) return `{warn|${fmtInt(q)}\n⚠ (${pctRound}%)}`;
              return `${fmtInt(q)}\n(${pctRound}%)`;
            },
            rich: {
              warn: {
                fontWeight: 950,
                color: "#7f1d1d",
                backgroundColor: "rgba(254, 202, 202, 0.9)",
                borderColor: "#b91c1c",
                borderWidth: 1.5,
                borderRadius: 4,
                padding: [2, 4],
                fontSize: 11,
                lineHeight: 14,
                align: 'center'
              }
            },
            color: "#ffffff",
            backgroundColor: "rgba(0,0,0,0.15)",
            borderRadius: 4,
            padding: [2, 4]
          },
          labelLayout: { hideOverlap: true },
          emphasis: { disabled: true },
          markLine: {
            silent: true,
            symbol: ["none", "none"],
            lineStyle: { type: "dashed", width: 2, color: "#374151" },
            clip: false,
            data: lineSegments
          },
          z: 1,
          zlevel: 0
        },
        {
          name: "Entregados FT",
          type: "bar",
          stack: "pct",
          data: pFT.map(v => +(+v).toFixed(4)),
          barMaxWidth: 52,
          itemStyle: {
            color: {
              type: "linear",
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: "#f59e0b" },
                { offset: 1, color: "#d97706" }
              ]
            }
          },
          label: {
            show: true,
            position: "insideTop", 
            distance: 4,
            color: "#111",
            fontWeight: 950,
            fontSize: 11,
            lineHeight: 12,
            formatter: (p) => {
              const i = p.dataIndex;
              const pct = +p.data || 0;
              const q = (qFT)[i] || 0;
              if (!q) return "";
              if (pct < 8) return ""; 
              return `${fmtInt(q)}\n(${Math.round(pct)}%)`;
            }
          },
          labelLayout: { hideOverlap: true },
          emphasis: { disabled: true },
          z: 1,
          zlevel: 0
        },
        {
          name: "No entregados",
          type: "bar",
          stack: "pct",
          data: pNO.map(v => +(+v).toFixed(4)),
          barMaxWidth: 52,
          itemStyle: {
            color: {
              type: "linear",
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: "#f87171" },
                { offset: 1, color: "#ef4444" }
              ]
            }
          },
          label: {
            show: true,
            position: "top", 
            distance: 2,
            color: "#fff",
            fontWeight: 900,
            fontSize: 11,
            lineHeight: 12,
            backgroundColor: "rgba(239, 68, 68, 0.9)", 
            padding: [2, 4],
            borderRadius: 3,
            formatter: (p) => {
              const i = p.dataIndex;
              const pct = +p.data || 0;
              const q = (qNO)[i] || 0;
              if (!q) return "";
              return `${fmtInt(q)} (${Math.round(pct)}%)`;
            }
          },
          labelLayout: { hideOverlap: true },
          emphasis: { disabled: true },
          z: 1,
          zlevel: 0
        },
        {
          name: "%AT Acumulado",
          type: "line",
          data: pAT_acum.map(v => +(+v).toFixed(2)),
          showSymbol: true,         
          symbol: "circle",         
          symbolSize: 1,            
          showAllSymbol: true,      
          lineStyle: { 
            width: 3.5,         
            type: "solid",      
            color: "#7c3aed"    
          },
          itemStyle: { color: "#7c3aed" },
          label: {
            show: true,             
            position: "bottom",   
            distance: 6,          
            formatter: (p) => {
              const val = +p.data;
              if (val == null || isNaN(val)) return "";
              return val.toFixed(2).replace(".", ",") + "%";
            },
            backgroundColor: "rgba(255, 255, 255, 0.85)", 
            padding: [2, 4],                             
            borderRadius: 3,                             
            borderColor: "rgba(124, 58, 237, 0.25)",      
            borderWidth: 1,
            textStyle: { fontWeight: 850, color: "#6d28d9", fontSize: 10 }
          },
          emphasis: {
            disabled: false,
            scale: false, 
            label: {
              show: true, 
              position: "bottom",
              formatter: (p) => {
                const val = +p.data;
                if (val == null || isNaN(val)) return "";
                return val.toFixed(2).replace(".", ",") + "%";
              },
              textStyle: { fontWeight: 850, color: "#6d28d9", fontSize: 10 }
            }
          },
          z: 6
        },
        {
          name: "Promedio días de demora",
          type: "line",
          yAxisIndex: 1,
          data: avgDem,
          symbol: "circle",
          symbolSize: 0,          
          showSymbol: true,       
          connectNulls: true,
          lineStyle: { width: 3, color: COLORS.blue },
          itemStyle: { color: COLORS.blue },
          label: {
            show: true,
            position: "top",      
            distance: 8,
            backgroundColor: "rgba(255,255,255,0.85)", 
            padding: [2, 4],
            borderRadius: 4,
            fontWeight: 950,
            color: "#0b1220",
            formatter: (p) => (p.data == null || isNaN(p.data)) ? "" : `${Math.round(p.data)} d`
          },
          markLine: {
            silent: true,
            symbol: ["none", "none"],
            label: {
              show: true,
              formatter: "Lím 7 d",
              fontWeight: 800,
              fontSize: 11,
              position: "end",
              backgroundColor: '#374151',
              color: '#fff',
              padding: [4, 6],
              borderRadius: 4
            },
            lineStyle: { type: "dashed", width: 2, color: "#374151" },
            data: [{ yAxis: 7 }]
          },
          z: 10
        }
      ]
    };

    chartMes.setOption(option, true);
    window.addEventListener("resize", () => chartMes && chartMes.resize(), { passive: true });
  }

/* ============================
   CHART 2: TENDENCIA HISTÓRICA
   ============================ */
function buildChartTendencia(rows) {
    const agg = new Map();
    const monthsSet = new Set();

    for (const r of rows) {
      const d = parseDateAny(r[FECHA_COL]);
      if (!d) continue;
      const mk = monthKey(d);
      monthsSet.add(mk);

      if (!agg.has(mk)) agg.set(mk, { at: 0, ft: 0, no: 0 });
      const c = agg.get(mk);

      let rAt = toNumber(r[AT_COL]);
      let rFt = toNumber(r[FT_COL]);
      let rNo = toNumber(r[NO_COL]);

      c.at += rAt;
      c.ft += rFt;
      c.no += rNo;
    }

    const months = [...monthsSet].sort();

    const pAT = months.map(m => {
      const c = agg.get(m); const t = (c?.at ?? 0) + (c?.ft ?? 0) + (c?.no ?? 0);
      return t ? ((c.at ?? 0) / t) * 100 : 0;
    });
    const pFT = months.map(m => {
      const c = agg.get(m); const t = (c?.at ?? 0) + (c?.ft ?? 0) + (c?.no ?? 0);
      return t ? ((c.ft ?? 0) / t) * 100 : 0;
    });
    const pNO = months.map(m => {
      const c = agg.get(m); const t = (c?.at ?? 0) + (c?.ft ?? 0) + (c?.no ?? 0);
      return t ? ((c.no ?? 0) / t) * 100 : 0;
    });

    const el = document.getElementById("chartTendencia");
    if (!el || !window.echarts) return;
    if (!chartTendencia) chartTendencia = echarts.init(el, null, { renderer: "canvas" });

    const option = {
      animation: true,
      animationDuration: 800,
      animationDurationUpdate: 600,
      animationEasing: "cubicOut",
      animationEasingUpdate: "cubicOut",
      grid: { left: 56, right: 18, top: 16, bottom: 62 },
      tooltip: {
        trigger: "axis",
        confine: true,
        backgroundColor: "transparent",
        borderColor: "transparent",
        shadowColor: "transparent",
        shadowBlur: 0,
        borderWidth: 0,
        padding: 0,
        formatter: (params) => {
          const axis = params?.[0]?.axisValue ?? "";
          let html = `
            <div style="font-family: var(--font-body), sans-serif; padding: 10px 14px; min-width: 190px; background: #ffffff; border-radius: 8px; box-shadow: var(--shadow-xl); border: 1.5px solid var(--border-light); color: var(--text-main);">
              <div style="font-family: var(--font-main), sans-serif; font-weight: 800; font-size: 0.9rem; margin-bottom: 8px; border-bottom: 1.5px solid var(--border-light); padding-bottom: 6px; color: var(--text-main); letter-spacing: 0.02em;">
                📅 Tendencia: ${axis}
              </div>
              <div style="display: flex; flex-direction: column; gap: 6px;">
          `;
          for (const p of params) {
            const color = p.color || "#0d9488";
            html += `
              <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8rem; gap: 15px;">
                <span style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600; color: var(--text-muted);">
                  <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${color};"></span>
                  ${p.seriesName}
                </span>
                <span style="font-weight: 800; color: var(--text-main);">${_fmtNum1(p.data)}%</span>
              </div>
            `;
          }
          html += `
              </div>
            </div>
          `;
          return html;
        }
      },
      legend: {
        bottom: 12,
        left: "center",
        itemWidth: 14,
        itemHeight: 10,
        textStyle: { fontWeight: 800 }
      },
      xAxis: { type: "category", data: months, axisLabel: { fontWeight: 700 } },
      yAxis: {
        type: "value",
        min: 0,max: 100,
        axisLabel: { formatter: "{value}%" },
        splitLine: { lineStyle: { color: "rgba(15, 23, 42, 0.10)" } }
      },
      series: [
        {
          name: "A Tiempo %",
          type: "line",
          data: pAT.map(v => +(+v).toFixed(2)),
          symbolSize: 7,
          lineStyle: { width: 3, color: COLORS.green },
          itemStyle: { color: COLORS.green, borderColor: "#fff", borderWidth: 2 },
          label: {
            show: true,
            position: "top",
            formatter: (p) => {
              const v = +p.data || 0;
              return (v < 78) ? `{warn|⚠ ${_fmtPct(v)}}` : `{ok|${_fmtPct(v)}}`;
            },
            rich: {
              ok: { fontWeight: 900, color: COLORS.green },
              warn: { fontWeight: 950, color: "#7f1d1d", backgroundColor: "rgba(239,68,68,0.18)", borderColor: "#ef4444", borderWidth: 1, borderRadius: 4, padding: [2, 4] }
            }
          },
          zlevel: 5, z: 5
        },
        {
          name: "Fuera Tiempo %",
          type: "line",
          data: pFT.map(v => +(+v).toFixed(2)),
          symbolSize: 7,
          lineStyle: { width: 3, color: COLORS.amber },
          itemStyle: { color: COLORS.amber, borderColor: "#fff", borderWidth: 2 },
          label: { show: true, position: "top", fontWeight: 900, formatter: (p) => _fmtPct(p.data) },
          zlevel: 5, z: 5
        },
        {
          name: "No Entregados %",
          type: "line",
          data: pNO.map(v => +(+v).toFixed(2)),
          symbolSize: 7,
          lineStyle: { width: 3, color: COLORS.red },
          itemStyle: { color: COLORS.red, borderColor: "#fff", borderWidth: 2 },
          label: { show: true, position: "top", fontWeight: 900, formatter: (p) => _fmtPct(p.data) },
          zlevel: 5, z: 5
        }
      ]
    };

    chartTendencia.setOption(option, true);
    window.addEventListener("resize", () => chartTendencia && chartTendencia.resize(), { passive: true });
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
   INIT Y CARGA RÁPIDA DESDE CSV LOCAL
   ============================ */
window.addEventListener("DOMContentLoaded", () => {
  async function loadFromSupabase() {
    console.log("[almacen] Cargando datos desde Supabase (tabla ALMACEN)...");
    try {
      const dbData = await window.fetchTableFromSupabase('ALMACEN');

      if (!dbData.length) {
        throw new Error("La tabla ALMACEN en Supabase está vacía o no se pudo leer.");
      }

      headers = Object.keys(dbData[0]);
      data = dbData.map(row => {
        const o = {};
        headers.forEach(h => { o[h] = clean(row[h]); });
        return o;
      });

      initDashboard();
      const loader = document.getElementById("loader");
      if (loader && !loader.classList.contains("hidden")) loader.classList.add("hidden");
    } catch (err) {
      console.warn("Supabase falló, intentando CSV local...", err);
      loadFromCsvLocal();
    }
  }

  function loadFromCsvLocal() {
    console.log("[almacen] Cargando datos desde CSV local (ALMACEN.csv)...");
    fetch(csvUrl + "?t=" + getCacheBuster())
      .then(res => {
        if (!res.ok) throw new Error("No se pudo leer el archivo CSV local.");
        return res.text();
      })
      .then(text => {
        const parsed = Papa.parse(text, { delimiter: DELIM, skipEmptyLines: true });
        const m = parsed.data;
        if (!m.length || m.length < 2) {
          showError("El CSV de Almacén está vacío o no se pudo procesar.");
          return;
        }
        headers = m[0].map(clean);
        data = m.slice(1).map(row => {
          const o = {};
          headers.forEach((h, i) => { o[h] = clean(row[i]); });
          return o;
        });
        initDashboard();
      })
      .catch(err2 => {
        console.error(err2);
        showError("Error al cargar datos (Supabase fuera de línea y fallo al leer CSV local): " + err2.message);
      })
      .finally(() => {
        const loader = document.getElementById("loader");
        if (loader) {
          loader.style.display = "none";
          loader.classList.add("hidden");
        }
      });
  }

  function initDashboard() {
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
  }

  loadFromSupabase();
});

window.addEventListener("resize", () => {
  if (chartMes) chartMes.resize();
  if (chartTendencia) chartTendencia.resize();
}, { passive: true });
