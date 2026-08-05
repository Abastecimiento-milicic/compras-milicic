/* ===== CONFIGURACIÓN GLOBAL Y CACHÉ ===== */

// 1. Fecha visible en la app
window.FECHA_ULTIMA_ACTUALIZACION = "03/08/2026";   //CAMBIAR FECHA

// 2. Clave de versión global (Fallback seguro siempre)
window.MI_CACHE_VERSION = window.FECHA_ULTIMA_ACTUALIZACION.replace(/\//g, "") || "20260805";   //CAMBIAR FECHA

// Dibuja la fecha automáticamente al cargar
document.addEventListener("DOMContentLoaded", () => {
  const el = document.getElementById("lastUpdate");
  if (el) {
    el.textContent = window.FECHA_ULTIMA_ACTUALIZACION;
  }
});
