/* ============================================================
   CONFIGURAÇÃO DO MODO ONLINE (Supabase)
   Cole aqui os dois valores do seu projeto:
   Supabase > Project Settings > API (ou "Data API" / "API Keys")
     url   = Project URL         (ex.: https://abcdxyz.supabase.co)
     chave = anon public key     (começa com eyJ... ou sb_publishable_...)
   A chave "anon/publishable" pode ficar pública: quem protege os dados
   são as regras do arquivo supabase.sql. NUNCA cole a "service_role"/"secret".
   Enquanto estiver vazio, o jogo roda sozinho (offline), como antes.
   ============================================================ */
window.ONLINE = {
  url: '',
  chave: ''
};
