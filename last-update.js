/* ===== CONFIGURACIÓN GLOBAL DE ACTUALIZACIÓN ===== */

// 1. Cambiá únicamente esta fecha cuando actualices las bases CSV
window.FECHA_ULTIMA_ACTUALIZACION = "14/07/2026";

// 2. Clave de versión para renovar el caché automáticamente cuando cambies la fecha
window.MI_CACHE_VERSION = window.FECHA_ULTIMA_ACTUALIZACION.replace(/\//g, "");

// Dibuja la fecha automáticamente en el encabezado
document.addEventListener("DOMContentLoaded", () => {
  const el = document.getElementById("lastUpdate");
  if (el) {
    el.textContent = window.FECHA_ULTIMA_ACTUALIZACION;
  }
});
