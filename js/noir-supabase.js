/* NOIR BARBER — Cliente Supabase */
(function (global) {
  let client = null;

  function isConfigured() {
    const c = global.NOIR_SUPABASE;
    return !!(c?.url && c?.anonKey
      && !c.url.includes('SEU_PROJETO')
      && !c.anonKey.includes('SUA_CHAVE'));
  }

  function getClient() {
    if (!global.supabase?.createClient) {
      throw new Error('Biblioteca Supabase não carregada. Verifique a conexão com a internet.');
    }
    if (!isConfigured()) {
      throw new Error('Configure o Supabase em js/supabase-config.js (veja SETUP-SUPABASE.md).');
    }
    if (!client) {
      client = global.supabase.createClient(
        global.NOIR_SUPABASE.url,
        global.NOIR_SUPABASE.anonKey,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
          },
        }
      );
    }
    return client;
  }

  global.NoirSupabase = {
    getClient,
    isConfigured,
  };
})(typeof window !== 'undefined' ? window : globalThis);
