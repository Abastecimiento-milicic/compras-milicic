// Configuración del cliente Supabase
const SUPABASE_URL = "https://lzertbaraxpuxhvzhaau.supabase.co";
const SUPABASE_KEY = "sb_publishable_13H3Qh-22apy25DGIWGSbw_m9bPSvqe";

// Inicializa el cliente global de Supabase
window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Función global para consultar cualquier tabla completa de Supabase en paralelo,
 * limitando la concurrencia para evitar bloqueos y statement timeouts (error 500 / 57014).
 * Incluye almacenamiento en caché mediante IndexedDB para evitar recargas innecesarias al cambiar de pestaña.
 */
window.fetchTableFromSupabase = async function(tableName, concurrency = 6) {
  const cacheKey = `supabase_${tableName}_${window.MI_CACHE_VERSION || 'default'}`;

  // 1. Intentar obtener datos desde el caché de IndexedDB
  if (typeof window.getCachedData === "function") {
    try {
      const cached = await window.getCachedData(cacheKey);
      if (cached && Array.isArray(cached) && cached.length > 0) {
        console.log(`[supabase-config] Cache HIT para tabla: ${tableName}`);
        return cached;
      }
    } catch (err) {
      console.warn(`[supabase-config] No se pudo leer el caché de la tabla: ${tableName}`, err);
    }
  }

  console.log(`[supabase-config] Cache MISS para tabla: ${tableName}. Consultando Supabase...`);

  // 2. Obtener cantidad total de registros
  const { count, error: countError } = await supabaseClient
    .from(tableName)
    .select('*', { count: 'exact', head: true });

  if (countError) throw countError;
  if (!count) return [];

  const step = 1000;
  const totalBatches = Math.ceil(count / step);
  const allData = [];

  // 3. Traer lotes en paralelo controlado (bloques de tamaño 'concurrency')
  for (let i = 0; i < totalBatches; i += concurrency) {
    const batchPromises = [];
    for (let j = 0; j < concurrency && (i + j) < totalBatches; j++) {
      const batchIdx = i + j;
      const from = batchIdx * step;
      const to = from + step - 1;
      batchPromises.push(
        supabaseClient
          .from(tableName)
          .select('*')
          .range(from, to)
          .then(({ data, error }) => {
            if (error) throw error;
            return data || [];
          })
      );
    }
    const batchResults = await Promise.all(batchPromises);
    allData.push(...batchResults.flat());
  }

  // 4. Guardar datos en el caché de IndexedDB
  if (typeof window.setCachedData === "function" && allData.length > 0) {
    try {
      await window.setCachedData(cacheKey, allData);
      console.log(`[supabase-config] Tabla ${tableName} guardada en el caché de IndexedDB`);
    } catch (err) {
      console.warn(`[supabase-config] Error guardando en caché la tabla: ${tableName}`, err);
    }
  }

  return allData;
};
