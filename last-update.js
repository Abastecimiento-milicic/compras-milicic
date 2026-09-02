/* ===== CONFIGURACIÓN GLOBAL Y CACHÉ ===== */

// 1. Fecha visible en la app (puedes mantenerla o actualizarla)
window.FECHA_ULTIMA_ACTUALIZACION = "01/09/2026"; // Actualiza a la fecha de tu reporte

// 2. Clave de versión dinámica (Genera un timestamp automático)
// Esto fuerza al navegador a pedir los CSVs nuevos en cada carga
window.MI_CACHE_VERSION = "02/09/2026"; 

// Dibuja la fecha automáticamente al cargar
document.addEventListener("DOMContentLoaded", () => {
  const el = document.getElementById("lastUpdate");
  if (el) {
    el.textContent = window.FECHA_ULTIMA_ACTUALIZACION;
  }
});
