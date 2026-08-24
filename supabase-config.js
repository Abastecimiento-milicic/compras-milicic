// supabase-config.js
const SUPABASE_URL = "https://lzertbaraxpuhvhzhaau.supabase.co";
const SUPABASE_KEY = "sb_publishable_13H3Qh-22apy25DGIWGSbw_m9bPSvqe";

const { createClient } = window.supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

window.fetchTableFromSupabase = async function(tableName) {
  let allData = [];
  let from = 0;
  const step = 5000; // Descargar en bloques de 5000 para optimizar velocidad y memoria

  while (true) {
    const { data, error } = await _supabase
      .from(tableName)
      .select('*')
      .range(from, from + step - 1);

    if (error) {
      console.error(`Error en bloque ${from} de tabla ${tableName}:`, error);
      throw error;
    }

    if (!data || data.length === 0) break;

    allData = allData.concat(data);
    if (data.length < step) break;
    from += step;
  }
  return allData;
};
