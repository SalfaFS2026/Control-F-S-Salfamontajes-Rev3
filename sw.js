// ===== Service Worker - Control de Fatiga y Somnolencia (Salfamontajes) =====
// Objetivo: que la app funcione SIN INTERNET después de haberse abierto una
// primera vez con conexión. El navegador normalmente necesita internet para
// descargar la página cada vez que se visita una URL; este Service Worker
// intercepta esas peticiones y responde con una copia guardada localmente
// en el dispositivo, para que la app "abra" igual aunque no haya señal.
//
// IMPORTANTE: cada vez que se actualice index.html, hay que subir también
// este archivo cambiando el número de CACHE_NAME (ej: 'v1' -> 'v2'), para
// que los dispositivos descarguen la versión nueva la próxima vez que
// tengan señal, en vez de quedarse con la copia vieja guardada.

const CACHE_NAME = 'fs-salfamontajes-v20';

// Recursos que se guardan de entrada para que el login, el cuestionario y
// el test funcionen offline desde el primer momento.
const CORE_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js'
];

self.addEventListener('install', (event) => {
    self.skipWaiting(); // activa la versión nueva de inmediato, sin esperar a cerrar pestañas
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // Cada recurso se guarda por separado: si uno falla (ej. un CDN
            // externo no responde en ese momento) no se cae toda la instalación.
            return Promise.all(
                CORE_ASSETS.map((url) =>
                    cache.add(url).catch((err) => console.warn('[SW] No se pudo cachear:', url, err))
                )
            );
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = event.request.url;

    // El backend (Google Sheets) y el servidor de hora de Chile SIEMPRE deben
    // ir directo a la red: la app ya maneja por su cuenta qué hacer si fallan
    // (guarda localmente y reintenta). No se deben cachear estas respuestas.
    if (url.includes('script.google.com') || url.includes('worldtimeapi.org')) {
        return;
    }

    if (event.request.method !== 'GET') return;

    // La página principal (index.html) va primero a la red, para que los
    // cambios publicados se vean de inmediato. Solo si no hay señal se usa
    // la copia guardada.
    const isPage = event.request.mode === 'navigate' || url.endsWith('/index.html') || url.endsWith('/');
    if (isPage) {
        event.respondWith(
            fetch(event.request, { cache: 'no-cache' })
                .then((response) => {
                    if (response && response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    }
                    return response;
                })
                .catch(() => caches.match(event.request).then((c) => c || caches.match('./index.html')))
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cached) => {
            const networkFetch = fetch(event.request)
                .then((response) => {
                    if (response && response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    }
                    return response;
                })
                .catch(() => cached); // sin internet: se usa la copia guardada

            // Responde de inmediato con la copia guardada si existe (carga
            // instantánea y funciona offline), y de paso la actualiza en
            // segundo plano si hay señal disponible.
            return cached || networkFetch;
        })
    );
});
