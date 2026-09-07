/* Service worker — maakt de app installeerbaar en offline bruikbaar.

   Twee verschillende regels, met opzet:

   - De app zelf (index.html, app.js) komt eerst van het net. Zet je een nieuwe
     versie op de server, dan heb je die meteen; is er geen verbinding, dan komt
     hij uit de kast. Zo hoef je nooit te wachten of te verversen.
   - De lessen en de woordenbank komen eerst uit de kast en worden op de
     achtergrond bijgewerkt. Die zijn samen een paar megabyte en veranderen
     zelden, dus openen gaat meteen; een nieuwe les staat er de keer daarna.

   VERSIE ophogen bij elke levering: dat ruimt de oude kast op.
*/
const VERSIE = 'v1';
const SCHIL = 'qiraa-schil-' + VERSIE;
const SPUL = 'qiraa-spul-' + VERSIE;

/* Wat er meteen bij het installeren mee moet, zodat de app ook offline
   opstart als je hem net hebt neergezet. Let op de verdeling: elk bestand
   moet in dezelfde kast als waar de fetch-regels hieronder het zoeken,
   anders staat het er wel maar vindt niemand het terug. */
const SCHIL_VOORRAAD = [
  './',
  './index.html',
  './app.js',
  './manifest.webmanifest',
];
const SPUL_VOORRAAD = [
  './icons/icoon-192.png',
  './icons/icoon-512.png',
  './data/boeken.json',
  './data/woorden.json',
];

self.addEventListener('install', ev => {
  ev.waitUntil((async () => {
    const [schil, spul] = await Promise.all([caches.open(SCHIL), caches.open(SPUL)]);
    /* stuk voor stuk: mist er één bestand, dan mag de rest wel geladen worden */
    await Promise.all([
      ...SCHIL_VOORRAAD.map(u => schil.add(u).catch(() => null)),
      ...SPUL_VOORRAAD.map(u => spul.add(u).catch(() => null)),
    ]);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', ev => {
  ev.waitUntil((async () => {
    const namen = await caches.keys();
    await Promise.all(namen
      .filter(n => n.startsWith('qiraa-') && n !== SCHIL && n !== SPUL)
      .map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

/* eerst het net, met de kast als vangnet */
async function netEerst(verzoek, kastnaam) {
  const kast = await caches.open(kastnaam);
  try {
    const antwoord = await fetch(verzoek);
    if (antwoord && antwoord.ok) kast.put(verzoek, antwoord.clone());
    return antwoord;
  } catch (e) {
    const bewaard = await kast.match(verzoek);
    if (bewaard) return bewaard;
    /* een pagina die nergens staat: geef in elk geval de app terug */
    if (verzoek.mode === 'navigate') {
      const schil = await kast.match('./index.html') || await caches.match('./index.html');
      if (schil) return schil;
    }
    throw e;
  }
}

/* eerst de kast, ondertussen op de achtergrond bijwerken */
async function kastEerst(verzoek, kastnaam) {
  const kast = await caches.open(kastnaam);
  const bewaard = await kast.match(verzoek);
  const heen = fetch(verzoek).then(a => {
    if (a && a.ok) kast.put(verzoek, a.clone());
    return a;
  }).catch(() => null);
  return bewaard || heen.then(a => a || Promise.reject(new Error('niet beschikbaar')));
}

self.addEventListener('fetch', ev => {
  const v = ev.request;
  if (v.method !== 'GET') return;

  const url = new URL(v.url);

  /* Firebase en alle andere gesprekken met een server laten we met rust:
     die moeten altijd vers zijn en mogen nooit uit een kast komen. */
  const lettertype = /^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (url.origin !== self.location.origin && !lettertype) return;

  /* de letters van Google mogen wel bewaard blijven: anders ziet de tekst er
     zonder verbinding heel anders uit */
  if (lettertype) { ev.respondWith(kastEerst(v, SPUL)); return; }

  const pad = url.pathname;
  const isSpul = /\/(data|page|icons)\//.test(pad) ||
                 /\.(json|png|jpg|jpeg|webp|svg|woff2?)$/i.test(pad);

  ev.respondWith(isSpul ? kastEerst(v, SPUL) : netEerst(v, SCHIL));
});
