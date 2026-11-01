// Vilkron: o que deixa o Chrome oferecer "Instalar". Não guarda nada: sempre busca a versão nova na internet.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(fetch(e.request).catch(() => new Response('Sem internet: o Vilkron precisa de conexão para jogar.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })));
});
