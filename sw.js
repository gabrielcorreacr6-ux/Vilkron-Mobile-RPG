// Vilkron: o que deixa o Chrome oferecer "Instalar". Não guarda nada e não mexe na abertura das páginas
// (a navegação vai direto para a internet, do jeito normal do navegador).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.mode === 'navigate' || r.method !== 'GET' || new URL(r.url).origin !== self.location.origin) return;
  e.respondWith(fetch(r).catch(() => Response.error()));
});
