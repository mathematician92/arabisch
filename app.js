/* القراءة الراشدة — woordenschat
   Prototype voor les 1 en 2. Voortgang staat in localStorage. */

const S = {
  index: null,     // boeken.json
  lemmas: {},      // woorden.json
  woordenboek: {},
  boek: 'qirat',
  lessen: {},      // ingeladen lessen, op sleutel 'boek-nr'
  data: null,
  les: 1,
  stap: 0,
  gekend: new Set(),      // lemma-ids die je kent
  moeilijk: new Set(),    // lemma-ids die na de tweede lezing nog niet zaten
  geklikt: new Set(),
  geklikBij: '',   // bij welke les en stap het aangetikte hoort
  gelezen: new Set(),     // lesnummers waarvan stap 1 is afgerond
  afgerond: new Set(),    // lesnummers die je hebt afgerond
  oefen: {},              // {lesnr: [gegenereerde teksten]}
  oefenIdx: {},           // welke oefentekst je nu bekijkt
  bezig: false,
  fout: '',
  zoom: 1,         // tekstgrootte van de Arabische tekst
  tempo: 0.9,      // voorleessnelheid
  donker: false,   // donkere modus
  vraag: null,     // huidige oefenvraag
  antwoord: null,  // gegeven antwoord
  score: {},       // {lesnr: {lemma-id: aantal keer goed}}
  zin: 0,          // welke zin je nu oefent
  hints: {},       // {lesnr: {zinindex: aantal gevraagde woorden}}
  open: 0,         // hoeveel woorden nu onthuld zijn
  klaar: false,    // hele zin zichtbaar
  lades: {},       // welke laden openstaan (niet bewaard: standaard dicht)
  scherm: 'les',   // 'les' of 'lijst' — Mijn woorden staat naast de lessen
  wi: { bereik: 'gekend', boek: 'alles', op: 'woord', zoek: '' },
};

const STAPPEN = [
  { b: 'Stap 1', t: 'Lees de tekst' },
  { b: 'Stap 2', t: 'Wat ken je al?' },
  { b: 'Stap 3', t: 'Oefenen' },
  { b: 'Stap 4', t: 'Oefenteksten' },
  { b: 'Stap 5', t: 'Zinnen zeggen' },
  { b: 'Stap 6', t: 'Nog eens lezen' },
];

/* Voor- en achtervoegsels: die plak je aan een woord vast, ze zijn zelf geen
   woord om te markeren of te overhoren. */
const CLITIC = new Set(['wa', 'fa', 'bi', 'li', 'al', 'ka', 'sa', 'lam_t']);
const losStaand = id => !CLITIC.has(id) && !id.startsWith('_');

const CATS = {
  ism:  { ar: 'اسم',  lat: 'Naamwoord' },
  fil:  { ar: 'فعل',  lat: 'Werkwoord' },
  harf: { ar: 'حرف',  lat: 'Partikel' },
};

/* ---------------- opslag ----------------
   Alles loopt via deze twee functies. Voor Firebase hoeft alleen `Opslag`
   vervangen te worden door een versie die naar Firestore leest en schrijft,
   met de ingelogde gebruiker als sleutel. De rest van de app verandert niet. */
const Opslag = {
  gebruiker: 'lokaal',
  sleutel() { return 'qirat.v2.' + this.gebruiker; },
  lees() {
    try { return JSON.parse(localStorage.getItem(this.sleutel()) || '{}'); }
    catch (e) { return {}; }
  },
  schrijf(data) {
    localStorage.setItem(this.sleutel(), JSON.stringify(data));
  },
};
const SLEUTEL = 'qirat.v2.lokaal';
const WIE = 'qirat.wie';   // wie er op dit apparaat het laatst inlogde

function pak() {
  return {
    gekend: [...S.gekend], afgerond: [...S.afgerond], oefen: S.oefen, hints: S.hints,
    moeilijk: [...S.moeilijk], gelezen: [...S.gelezen], score: S.score,
    boek: S.boek, les: S.les, stap: S.stap, bijgewerkt: Date.now(),
    /* Wat je in stap 1 of 6 hebt aangetikt is nog niet vastgelegd — dat
       gebeurt pas met de knop onderaan. Toch bewaren we het, met een merkje
       erbij van welke les en welke stap het was, zodat een onderbroken
       leesbeurt niet weg is als je de app sluit. Klopt het merkje niet met
       waar je bent, dan gaat het bij het openen alsnog weg. */
    geklikt: [...S.geklikt], geklikVoor: S.boek + '-' + S.les + '-' + S.stap,
  };
}
function zet(r) {
  S.gekend = new Set(r.gekend || []);
  S.afgerond = new Set(r.afgerond || []);
  S.oefen = r.oefen || {};
  S.hints = r.hints || {};
  S.moeilijk = new Set(r.moeilijk || []);
  S.gelezen = new Set(r.gelezen || []);
  S.score = r.score || {};
  S.geklikt = new Set(r.geklikt || []);
  S.geklikBij = r.geklikVoor || '';
}

/* het aangetikte hoort bij één les en één stap; ergens anders is het niet geldig */
function keurGeklikt() {
  if (S.geklikBij !== S.boek + '-' + S.les + '-' + S.stap) S.geklikt = new Set();
}

function laad() {
  try {
    const r = Opslag.lees();
    /* eenmalige overname van de oude opslag */
    if (!Object.keys(r).length) {
      const oud = localStorage.getItem('qirat.v1');
      if (oud) Object.assign(r, JSON.parse(oud));
    }
    zet(r);
  } catch (e) { /* eerste keer */ }
}
function bewaar() {
  Opslag.schrijf(pak());
  Wolk.plan();          /* lokaal meteen, online zo dadelijk */
}

/* ---------------- samenvoegen ----------------
   Twee apparaten kunnen allebei iets hebben geleerd sinds de laatste keer.
   Voortgang groeit vrijwel altijd alleen aan, dus verzamelingen worden
   samengevoegd in plaats van overschreven: dan kan werk niet verdwijnen.
   Alleen de moeilijke lijst kun je afvinken, daar telt de nieuwste versie. */
function samenvoeg(a, b) {
  if (!a || !Object.keys(a).length) return b || {};
  if (!b || !Object.keys(b).length) return a;
  const unie = (x, y) => [...new Set([...(x || []), ...(y || [])])];
  const nieuwste = (b.bijgewerkt || 0) >= (a.bijgewerkt || 0) ? b : a;
  /* per les de hoogste telling aanhouden */
  const hoogste = (x, y) => {
    const uit = {};
    for (const k of new Set([...Object.keys(x || {}), ...Object.keys(y || {})])) {
      const p = (x || {})[k], q = (y || {})[k];
      if (typeof p === 'object' && typeof q === 'object') {
        uit[k] = {};
        for (const j of new Set([...Object.keys(p || {}), ...Object.keys(q || {})])) {
          uit[k][j] = Math.max((p || {})[j] || 0, (q || {})[j] || 0);
        }
      } else uit[k] = (typeof q === 'undefined') ? p : (typeof p === 'undefined') ? q : Math.max(p, q);
    }
    return uit;
  };
  return {
    gekend: unie(a.gekend, b.gekend),
    afgerond: unie(a.afgerond, b.afgerond),
    gelezen: unie(a.gelezen, b.gelezen),
    moeilijk: nieuwste.moeilijk || [],
    score: hoogste(a.score, b.score),
    hints: hoogste(a.hints, b.hints),
    oefen: Object.assign({}, a.oefen, b.oefen),
    boek: nieuwste.boek, les: nieuwste.les, stap: nieuwste.stap,
    /* een halve leesbeurt is van één apparaat: die van het nieuwste telt */
    geklikt: nieuwste.geklikt || [], geklikVoor: nieuwste.geklikVoor || '',
    bijgewerkt: Math.max(a.bijgewerkt || 0, b.bijgewerkt || 0),
  };
}

/* ---------------- de wolk ----------------
   Eén document per persoon, op `voortgang/{uid}`. De app werkt zonder dit
   alles gewoon door: valt het netwerk weg, dan blijft localStorage de
   waarheid en gaat het bij de volgende keer alsnog omhoog. */
const Wolk = {
  klaar: false,       // ingelogd en verbonden
  auth: null, db: null, doc: null, naam: null,
  af: null,           // stopt het meeluisteren
  laatst: 0,          // tijdstip van het laatste bericht dat we verwerkt hebben
  tijd: null, bezig: false,

  ingesteld() {
    return typeof firebase !== 'undefined' && window.FB_CONFIG &&
           window.FB_CONFIG.apiKey && window.FB_CONFIG.apiKey.indexOf('VUL-IN') !== 0;
  },

  staat(soort, tekst) {
    const e = document.getElementById('wolkStaat');
    if (!e) return;
    e.hidden = false;
    e.className = 'wolk-staat ' + soort;
    e.lastElementChild.textContent = tekst;
    const u = document.getElementById('btnWie');
    if (u) { u.hidden = !this.naam; u.textContent = this.naam || ''; }
  },

  /* niet bij elke handeling schrijven: dat zijn honderden schrijfbewerkingen
     per les. Hooguit eens per vier seconden, en bij het wegklikken. */
  plan() {
    if (!this.klaar) return;
    clearTimeout(this.tijd);
    this.tijd = setTimeout(() => this.duw(), 4000);
  },

  async duw() {
    if (!this.klaar || this.bezig) return;
    clearTimeout(this.tijd);
    this.bezig = true;
    this.staat('bezig', 'opslaan…');
    try {
      const data = pak();
      this.laatst = data.bijgewerkt;      /* zodat onze eigen schrijfbeurt niet terugkaatst */
      await this.db.collection('voortgang').doc(this.doc).set(data);
      this.staat('aan', this.naam + ' — bewaard');
    } catch (e) {
      this.staat('fout', 'niet opgeslagen (staat lokaal)');
    }
    this.bezig = false;
  },

  async haal() {
    const d = await this.db.collection('voortgang').doc(this.doc).get();
    return d.exists ? d.data() : {};
  },

  /* Meeluisteren: schrijft je telefoon iets weg, dan komt het hier vanzelf
     binnen zonder dat je hoeft te verversen. Firestore stuurt alleen bij een
     echte wijziging, dus dit kost een leesbewerking per keer — een paar
     tientallen per dag. */
  luister() {
    if (!this.db || !this.doc) return;
    if (this.af) { try { this.af(); } catch (e) { /* al los */ } this.af = null; }
    this.af = this.db.collection('voortgang').doc(this.doc).onSnapshot(
      moment => {
        /* onze eigen schrijfbeurt kaatst terug: die slaan we over */
        if (moment.metadata && moment.metadata.hasPendingWrites) return;
        if (!moment.exists) return;
        const op = moment.data();
        if (!op || (op.bijgewerkt || 0) <= (this.laatst || 0)) return;
        this.laatst = op.bijgewerkt;
        this.binnen(op);
      },
      () => { /* verbinding weg: de gewone opslag loopt gewoon door */ });
  },

  /* Een bericht van een ander toestel verwerken. Alles wordt samengevoegd,
     maar waar jíj op dit moment bent blijft staan: je wordt niet midden in
     een les naar een andere les getrokken, en wat je nu aan het aantikken
     bent gaat niet verloren. */
  binnen(op) {
    const boek = S.boek, les = S.les, stap = S.stap;
    const eigen = S.geklikt.size ? [...S.geklikt] : null;
    const eigenBij = S.geklikBij;
    zet(samenvoeg(Opslag.lees(), op));
    S.boek = boek; S.les = les; S.stap = stap;
    if (eigen) { S.geklikt = new Set(eigen); S.geklikBij = eigenBij; }
    else keurGeklikt();
    Opslag.schrijf(pak());
    teken();
    this.staat('aan', this.naam + ' — bijgewerkt');
  },

  /* na het kiezen van een naam: lokaal en online bij elkaar leggen */
  async begin(naam) {
    this.naam = naam;
    this.doc = naam.toLowerCase();
    Opslag.gebruiker = this.doc;
    localStorage.setItem(WIE, naam);
    laad();                       /* wat op dit apparaat staat */
    sluitInlog();
    teken();
    this.staat('bezig', 'ophalen…');
    try {
      const samen = samenvoeg(Opslag.lees(), await this.haal());
      zet(samen);
      Opslag.schrijf(samen);
      this.klaar = true;
      /* stond je op een ander apparaat in een andere les, ga daar dan heen */
      if (samen.boek && S.index.boeken.some(b => b.id === samen.boek)) {
        if (!S.lessen[samen.boek + '-' + samen.les] && !window.__DATA__) {
          try { await laadLes(samen.boek, samen.les); } catch (e) { /* dan blijf je hier */ }
        }
        if (S.lessen[samen.boek + '-' + samen.les]) { S.boek = samen.boek; S.les = samen.les; }
      }
      if (typeof samen.stap === 'number' && samen.stap >= 0 && samen.stap <= 5) S.stap = samen.stap;
      keurGeklikt();
      teken();
      await this.duw();
      this.luister();
    } catch (e) {
      this.klaar = false;
      this.staat('fout', 'geen verbinding — alleen dit apparaat');
    }
  },

  start() {
    if (!this.ingesteld()) return false;
    try {
      firebase.initializeApp(window.FB_CONFIG);
      this.auth = firebase.auth();
      this.db = firebase.firestore();
    } catch (e) { return false; }
    this.auth.onAuthStateChanged(u => {
      /* De aanmelding is anoniem en dient alleen om de database te mogen
         benaderen; wie je bent bepaalt de naam die je aantikt. */
      if (!u) return;
      const wie = localStorage.getItem(WIE);
      if (wie) this.begin(wie); else toonInlog();
    });
    this.auth.signInAnonymously().catch(() => {
      this.klaar = false;
      this.staat('fout', 'geen verbinding — alleen dit apparaat');
      toonInlog();
    });
    /* bij het wegklikken nog even wegschrijven wat open staat */
    addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && this.klaar) this.duw();
    });
    return true;
  },

  /* Van persoon wisselen op een gedeeld apparaat. Eerst het werk van de
     vorige veilig wegschrijven, dan met een schone lei de ander inladen.
     Geen herlaadbeurt: dat kost op de tablet seconden en is niet nodig. */
  async wissel(naam) {
    clearTimeout(this.tijd);
    if (this.af) { try { this.af(); } catch (e) { /* al los */ } this.af = null; }
    if (this.klaar) { try { await this.duw(); } catch (e) { /* staat lokaal */ } }
    else bewaar();
    this.klaar = false; this.doc = null; this.naam = null;

    zet({});                       /* alles leeg voor de volgende */
    S.geklikt = new Set();
    S.oefenIdx = {}; S.vraag = null; S.antwoord = null;
    S.stap = 0; S.zin = 0; S.open = 0; S.klaar = false; S.scherm = 'les';

    localStorage.setItem(WIE, naam);
    if (this.auth) {
      await this.begin(naam);
    } else {
      this.naam = naam;
      Opslag.gebruiker = String(naam).toLowerCase();
      laad(); sluitInlog(); teken();
      this.staat('fout', naam + ' — alleen dit apparaat');
    }
    window.scrollTo(0, 0);
  },
};

/* ---------------- naamkeuze ----------------
   Geen wachtwoorden: twee knoppen. De keuze blijft op dit apparaat staan,
   dus je doet dit één keer per telefoon, laptop of tablet. */

function sluitInlog() {
  const o = document.getElementById('inlogScherm');
  if (o) o.remove();
}

function toonInlog() {
  if (document.getElementById('inlogScherm')) return;
  const mensen = window.FB_MENSEN || [];
  const nu = Wolk.naam;                 /* al iemand bezig? dan is dit wisselen */
  const o = el('div', 'inlog');
  o.id = 'inlogScherm';
  const doos = el('div', 'inlog-doos');
  doos.appendChild(el('h1', null, 'قِرَاءَة'));
  doos.appendChild(el('p', null, nu
    ? 'Wie gaat er verder? Het werk van ' + esc(nu) + ' is opgeslagen.'
    : 'Wie leest er? Je kunt hier altijd wisselen.'));

  const namen = el('div', 'inlog-namen');
  mensen.forEach(naam => {
    const b = el('button', 'inlog-naam' + (naam === nu ? ' aan' : ''), esc(naam));
    b.onclick = () => {
      namen.querySelectorAll('button').forEach(k => { k.disabled = true; });
      b.classList.add('aan');
      if (naam === nu) { sluitInlog(); return; }   /* toch dezelfde */
      Wolk.wissel(naam);
    };
    namen.appendChild(b);
  });
  doos.appendChild(namen);
  doos.appendChild(el('div', 'inlog-fout'));

  if (nu) {
    const terug = el('button', 'inlog-terug', 'Terug naar de les');
    terug.onclick = sluitInlog;
    doos.appendChild(terug);
  } else {
    const los = el('button', 'inlog-los', 'Nu even zonder — alleen op dit apparaat');
    los.onclick = () => {
      Opslag.gebruiker = 'lokaal';
      laad(); sluitInlog(); teken();
      Wolk.staat('fout', 'geen naam gekozen — alleen dit apparaat');
    };
    doos.appendChild(los);
  }

  o.appendChild(doos);
  document.body.appendChild(o);
}

/* ---------------- hulpjes ---------------- */
const el = (t, k, h) => { const e = document.createElement(t); if (k) e.className = k; if (h != null) e.innerHTML = h; return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const les = n => S.lessen[S.boek + '-' + n] || null;
const lem = id => S.lemmas[id];
const boekNu = () => S.index.boeken.find(b => b.id === S.boek);
const lesLijst = () => (boekNu() || { lessen: [] }).lessen;

async function laadLes(boek, nr) {
  const sleutel = boek + '-' + nr;
  if (S.lessen[sleutel]) return S.lessen[sleutel];
  const r = await fetch('data/les/' + sleutel + '.json');
  if (!r.ok) throw new Error('Les ' + nr + ' kon niet geladen worden.');
  S.lessen[sleutel] = await r.json();
  return S.lessen[sleutel];
}

async function gaNaar(boek, nr) {
  Stem.stop();
  S.scherm = 'les';
  S.boek = boek; S.les = nr; S.stap = 0; S.zin = 0; S.open = 0; S.klaar = false;
  S.geklikt = new Set(); S.vraag = null; S.antwoord = null;
  document.getElementById('main').innerHTML =
    '<div class="blad"><div class="leeg">Bezig met laden…</div></div>';
  try { await laadLes(boek, nr); } catch (e) {
    document.getElementById('main').innerHTML =
      '<div class="blad"><div class="fout">' + esc(e.message) + '</div></div>';
    return;
  }
  bewaar(); teken(); window.scrollTo(0, 0);
}

/* alle lemma-ids van een les, in volgorde van voorkomen */
function lesIds(n) {
  const L = les(n), uit = { ism: [], fil: [], harf: [] }, gezien = new Set();
  for (const z of L.zinnen) for (const w of z.woorden) for (const id of w.ids) {
    if (gezien.has(id)) continue;
    gezien.add(id);
    const e = lem(id); if (e) uit[e.cat].push(id);
  }
  return uit;
}

/* Bouwsteentjes: het lidwoord, de voegwoorden en de aangehechte
   voornaamwoorden. Die staan in elke les opnieuw in de lijst en leveren na
   les 1 niets meer op. Ze krijgen een eigen lade en tellen niet mee in de
   voortgangsbalk. */
const BOUWSTEEN = new Set(['al', 'wa', 'fa', 'sa', 'lam_t']);
const isBouwsteen = id => id.startsWith('_') || BOUWSTEEN.has(id);

/* eerste les waarin een woord voorkomt, vóór lesnummer `tot`.
   null = het woord is nieuw in deze les. */
function eerdereLes(id, tot) {
  /* Elk woord draagt zelf bij zich in welke lessen het voorkomt, zodat we
     eerdere lessen niet hoeven in te laden. */
  const e = lem(id);
  if (!e || !e.komt) return null;
  let vroegste = null;
  for (const s of e.komt) {
    const [boek, nr] = [s.slice(0, s.lastIndexOf('-')), Number(s.slice(s.lastIndexOf('-') + 1))];
    if (boek !== S.boek || nr >= tot) continue;
    if (vroegste === null || nr < vroegste) vroegste = nr;
  }
  return vroegste;
}

/* de woorden van een les, gesplitst in nieuw / al eerder gezien */
function splitsLes(nr) {
  const ids = lesIds(nr);
  const nieuw = { ism: [], fil: [], harf: [] };
  const oud = { ism: [], fil: [], harf: [] };
  const bouw = { ism: [], fil: [], harf: [] };
  const herkomst = new Map();
  for (const cat of ['ism', 'fil', 'harf']) for (const id of ids[cat]) {
    if (isBouwsteen(id)) { bouw[cat].push(id); continue; }
    const e = eerdereLes(id, nr);
    if (e == null) nieuw[cat].push(id);
    else { oud[cat].push(id); herkomst.set(id, e); }
  }
  /* `alle` blijft compleet: stap 1 en stap 6 boeken daarmee je oordeel weg.
     `telbaar` is wat je in de lijst en in de balk te zien krijgt. */
  const alle = [...ids.ism, ...ids.fil, ...ids.harf];
  return { nieuw, oud, bouw, herkomst, alle, telbaar: alle.filter(i => !isBouwsteen(i)) };
}

/* Boek 2 van Bayna Yadayk telt door in eigen lesnummers: onze les 3 is daar
   الدرس (7). Dat nummer staat in de titel, dus we vissen het eruit voor het
   keuzemenu. De klinkertekens gaan er eerst af (de spelling van الدَّرْسُ
   wisselt), en Arabische cijfers worden omgezet zodat het menu één soort
   cijfers toont. Boeken zonder zo'n nummer merken hier niets van. */
const DARS = /الدرس\s*\(\s*([0-9\u0660-\u0669]+)\s*\)/;
function darsNr(titel) {
  const kaal = (titel || '').replace(/[\u064B-\u0652\u0670\u0640]/g, '');
  const m = DARS.exec(kaal);
  if (!m) return null;
  return [...m[1]].map(c => (c >= '\u0660' && c <= '\u0669')
    ? String(c.charCodeAt(0) - 0x0660) : c).join('');
}

/* ---------------- kop + stappen ---------------- */
function tekenKop() {
  const naarLes = nr => gaNaar(S.boek, nr);
  const nav = document.getElementById('lesTabs');
  nav.innerHTML = '';
  for (const L of lesLijst()) {
    const b = el('button', null, 'Les ' + L.nr);
    b.setAttribute('aria-current', L.nr === S.les);
    b.onclick = () => naarLes(L.nr);
    nav.appendChild(b);
  }
  /* op smalle schermen staan de lessen in een keuzemenu */
  const kies = document.getElementById('lesKies');
  kies.innerHTML = '';
  for (const L of lesLijst()) {
    const o = document.createElement('option');
    const d = darsNr(L.titel);
    o.value = L.nr;
    o.textContent = 'Les ' + L.nr + (d ? '  \u00B7  Dars ' + d : '');
    if (L.nr === S.les) o.selected = true;
    kies.appendChild(o);
  }
  kies.onchange = () => naarLes(Number(kies.value));
  /* boekkeuze verschijnt zodra er meer dan één boek is */
  const bk = document.getElementById('boekKies');
  bk.style.display = S.index.boeken.length > 1 ? 'block' : 'none';
  if (S.index.boeken.length > 1) {
    bk.innerHTML = '';
    for (const b of S.index.boeken) {
      const o = document.createElement('option');
      o.value = b.id; o.textContent = b.ondertitel || b.titel;
      if (b.id === S.boek) o.selected = true;
      bk.appendChild(o);
    }
    bk.onchange = () => gaNaar(bk.value, S.index.boeken.find(b => b.id === bk.value).lessen[0].nr);
  }
  const t = document.getElementById('boekTitel');
  if (t) t.textContent = (boekNu() || {}).titel || '';
  const st = document.getElementById('stappen');
  st.innerHTML = '';
  STAPPEN.forEach((s, i) => {
    const b = el('button', 'stap' + (i < S.stap ? ' klaar' : ''), `<b>${s.b}</b>${s.t}`);
    b.setAttribute('aria-current', i === S.stap);
    b.onclick = () => {
      /* elke leesronde begint schoon: wat je vorige keer aantikte staat er niet meer */
      if (i !== S.stap && (i === 0 || i === 5 || S.stap === 0 || S.stap === 5)) {
        S.geklikt = new Set();
      }
      /* een stap aanklikken brengt je terug uit Mijn woorden */
      Stem.stop();
      S.scherm = 'les';
      S.stap = i; S.antwoord = null; teken(); window.scrollTo(0, 0);
    };
    st.appendChild(b);
  });
  const bi = document.getElementById('btnIndex');
  if (bi) bi.classList.toggle('aan', S.scherm === 'lijst');
  meetKop();
}

/* De kop is sticky en valt op een smal scherm over meerdere regels. De
   voorleesbalk moet er precies onder blijven hangen, dus de hoogte wordt
   opgemeten in plaats van geraden. */
function meetKop() {
  const h = document.querySelector('header');
  if (!h) return;
  const hoog = h.offsetHeight;
  /* nul betekent: nog niet opgebouwd. Dan liever de reservewaarde uit de CSS
     laten staan dan de balk onder de kop laten wegglijden. */
  if (hoog > 0) document.documentElement.style.setProperty('--kop-h', hoog + 'px');
}
if (typeof ResizeObserver !== 'undefined') {
  const ro = new ResizeObserver(meetKop);
  addEventListener('DOMContentLoaded', () => {
    const h = document.querySelector('header');
    if (h) ro.observe(h);
  });
}
addEventListener('resize', meetKop);
addEventListener('orientationchange', meetKop);

/* ---------------- woordenlijst ---------------- */
function kaartVan(id, restMap) {
  const e = lem(id);
  const k = el('button', 'kaart' + (S.gekend.has(id) ? ' gekend' : ''));
  const merk = restMap && restMap.has(id)
    ? `<span class="merk">les ${restMap.get(id)}</span>` : '';
  k.innerHTML = `<div class="mid">
      <div class="woord">${esc(e.lemma)}</div>
      <div class="bet">${merk}${esc(e.nl)}</div>
    </div>`;
  k.onclick = ev => {
    if (ev.target.closest('.info')) return;
    S.gekend.has(id) ? S.gekend.delete(id) : S.gekend.add(id);
    bewaar(); teken();
  };
  const i = el('button', 'info', 'ⓘ');
  i.setAttribute('aria-label', 'Details van ' + e.lemma);
  i.onclick = ev => { ev.stopPropagation(); toonWoord([id]); };
  k.appendChild(i);
  return k;
}

function kolommenBlok(groepen, herkomst, toonHerkomst) {
  const kol = el('div', 'kolommen');
  for (const cat of ['ism', 'fil', 'harf']) {
    const c = el('div', 'kol kol-' + cat);
    const lijst = groepen[cat];
    c.appendChild(el('h3', null,
      `<span class="ar">${CATS[cat].ar}</span><span class="lat">${CATS[cat].lat}</span>` +
      `<span class="tel">${lijst.length}</span>`));
    if (!lijst.length) c.appendChild(el('div', 'leeg', '—'));
    for (const id of lijst) c.appendChild(kaartVan(id, toonHerkomst ? herkomst : null));
    kol.appendChild(c);
  }
  return kol;
}

function groepKop(titel, uitleg, aantal) {
  const h = el('div', 'groepkop');
  h.innerHTML = `<span class="gk-titel">${titel}</span>` +
                `<span class="gk-tel">${aantal}</span>` +
                `<span class="gk-uitleg">${uitleg}</span>`;
  return h;
}

/* Een lade die je open- en dichtklapt. De stand staat in S.lades, zodat hij
   niet dichtvalt zodra je binnenin een woord aantikt en het scherm hertekent. */
function vouwLade(sleutel, titel, aantal, maakInhoud) {
  const lade = el('div', 'lade');
  const open = !!S.lades[sleutel];
  const knop = el('button', 'lade-knop' + (open ? ' open' : ''),
    `<span class="lk-pijl">\u25b8</span><span class="lk-titel">${titel}</span>` +
    `<span class="lk-tel">${aantal}</span>`);
  knop.setAttribute('aria-expanded', open);
  knop.onclick = () => { S.lades[sleutel] = !open; teken(); };
  lade.appendChild(knop);
  if (open) lade.appendChild(maakInhoud());
  return lade;
}

function tekenLijst(titel, sub, metActies) {
  const sp = splitsLes(S.les);
  const blad = el('div', 'blad');
  blad.appendChild(el('h2', null, titel));
  if (sub) blad.appendChild(el('p', 'sub', sub));

  const nTotaal = sp.telbaar.length || 1;
  const nGekend = sp.telbaar.filter(i => S.gekend.has(i)).length;
  blad.appendChild(el('div', 'balk', `<i style="width:${Math.round(100 * nGekend / nTotaal)}%"></i>`));
  blad.appendChild(el('div', 'balk-tekst', `${nGekend} van ${sp.telbaar.length} woorden gekend`));

  const open = g => ({
    ism: g.ism.filter(i => !S.gekend.has(i)),
    fil: g.fil.filter(i => !S.gekend.has(i)),
    harf: g.harf.filter(i => !S.gekend.has(i)),
  });
  const tel = g => g.ism.length + g.fil.length + g.harf.length;

  const oNieuw = open(sp.nieuw), oOud = open(sp.oud);
  const heeftOud = tel(sp.oud) > 0;

  const wrap = el('div');
  wrap.style.marginTop = '22px';

  if (heeftOud) wrap.appendChild(groepKop('Nieuw in deze les', '', tel(oNieuw)));
  wrap.appendChild(kolommenBlok(oNieuw, null, false));

  if (heeftOud) {
    const h = groepKop('Al eerder gezien', '', tel(oOud));
    h.style.marginTop = '30px';
    wrap.appendChild(h);
    wrap.appendChild(kolommenBlok(oOud, sp.herkomst, true));
  }
  blad.appendChild(wrap);

  /* lade met gekende woorden van deze les */
  const gek = {
    ism: [...sp.nieuw.ism, ...sp.oud.ism].filter(i => S.gekend.has(i)),
    fil: [...sp.nieuw.fil, ...sp.oud.fil].filter(i => S.gekend.has(i)),
    harf: [...sp.nieuw.harf, ...sp.oud.harf].filter(i => S.gekend.has(i)),
  };
  if (tel(gek)) {
    blad.appendChild(vouwLade('gekend', 'Gekend', tel(gek),
      () => kolommenBlok(gek, sp.herkomst, true)));
  }

  /* lidwoord, voegwoorden en aanhechtsels apart */
  if (tel(sp.bouw)) {
    blad.appendChild(vouwLade('bouw', 'Bouwsteentjes', tel(sp.bouw),
      () => kolommenBlok(sp.bouw, null, false)));
  }

  if (metActies) blad.appendChild(metActies());
  return blad;
}

/* ---------------- tekstweergave ---------------- */
function tekenTekst(zinnen, titel, sub, markeer, nieuwSet) {
  const blad = el('div', 'blad');
  if (sub) blad.appendChild(el('p', 'sub', sub));
  const t = el('div', 'tekst');
  /* Het boek op het element zetten, zodat de opmaak per boek kan verschillen:
     elk leerboek heeft zijn eigen letterbeeld en dat mag de app volgen. */
  t.dataset.boek = S.boek;
  zinnen.forEach((z, zi) => {
    const span = el('span', 'zin');
    span.dataset.zin = zi;
    z.woorden.forEach((w, wi) => {
      /* Een getal of jaartal: hoort in de zin maar is geen woord om te leren.
         Neutraal tonen, niet aanklikbaar, telt niet mee als 'nog te leren'. */
      if (!w.ids.length) {
        span.appendChild(el('span', 'getal', w.w));
        span.appendChild(document.createTextNode(' '));
        return;
      }
      let inhoud = w.ids.filter(i => lem(i) && losStaand(i));
      if (!inhoud.length) inhoud = w.ids.slice();
      /* voor- en achtervoegsels tellen niet mee: die 'ken' je nooit los */
      const gekend = inhoud.length && inhoud.every(i => S.gekend.has(i));
      const aan = markeer && inhoud.some(i => S.geklikt.has(i));
      const lastig = inhoud.some(i => S.moeilijk.has(i));
      /* woord van buiten deze les: betekenis er meteen onder */
      const gl = nieuwSet ? w.ids.map(i => lem(i)).find(e => e && nieuwSet.has(e.id)) : null;
      /* Stap 1 en 6 zijn een frisse lezing: de tekst staat er neutraal, alleen wat
         je nu aantikt kleurt amber. Geen grijs, want dat stuurt je oordeel.
         In de oefenteksten krijgen woorden die je nog niet kent een dun streepje;
         geleende woorden niet, die hebben hun eigen lijntje boven de betekenis. */
      const s = el('span', 'w' +
        (markeer
          ? (aan ? ' onbekend' : '') + (lastig && !aan ? ' lastig' : '')
          : (!gekend && !gl ? ' teleren' : '')) +
        (gl ? ' geleend' : ''));
      if (gl) {
        s.innerHTML = `<span class="gw">${esc(w.w)}</span><span class="glos">${esc(gl.nl)}</span>`;
      } else {
        s.textContent = w.w;
      }
      s.onclick = () => {
        if (markeer) {
          const doelen = inhoud.length ? inhoud : w.ids;
          const nu = doelen.some(i => S.geklikt.has(i));
          doelen.forEach(i => nu ? S.geklikt.delete(i) : S.geklikt.add(i));
          bewaar(); teken();
          if (!nu) toonWoord(w.ids, z, wi, null, null);
          return;
        }
        toonWoord(w.ids, z, wi, span, s);
      };
      span.appendChild(s);
      span.appendChild(document.createTextNode(' '));
    });
    if (z.eind) span.appendChild(el('span', 'zin-eind', esc(z.eind) + ' '));
    /* Een koranvers krijgt de haken ﴿ ﴾ eromheen en een eigen opmaak, zoals in
       het bronmateriaal. De haken staan niet in de woordenlijst: ze horen bij
       de weergave, niet bij de tekst die je leert. */
    if (z.koran) span.classList.add('koran');
    t.appendChild(span);
    /* De brontekst zet elke zin op een eigen regel; die indeling houden we aan. */
    if (z.regeleinde) t.appendChild(el('br'));
  });
  /* Voorlezen. De bediening staat op de titelregel: terug, spelen, verder,
     en de snelheid. Eén stem, door de app gekozen — een keuzemenu leverde
     vooral opties op die het niet deden. */
  const kop = el('div', 'titelrij');
  kop.appendChild(el('h2', null, titel));
  if (Stem.kan()) {
    const balk = el('div', 'leesbalk');
    let plek = 0;                     /* waar je bent, ook als er niets klinkt */

    const toon = i => {
      plek = Math.max(0, Math.min(zinnen.length - 1, i));
      t.querySelectorAll('.zin.klinkt').forEach(z => z.classList.remove('klinkt'));
      const z = t.querySelector('.zin[data-zin="' + plek + '"]');
      if (z) {
        z.classList.add('klinkt');
        if (z.scrollIntoView) z.scrollIntoView({ block: 'nearest' });
      }
    };
    const merk = i => { if (i >= 0) toon(i); };

    const p = el('button', 'wi-kn speelknop', '&#9654;');
    p.title = 'Voorlezen'; p.setAttribute('aria-label', 'Voorlezen');
    const aan = () => { p.innerHTML = '&#9632;'; p.title = 'Stop'; p.classList.add('bezig'); };
    const uit = voltooid => {
      p.innerHTML = '&#9654;'; p.title = 'Voorlezen'; p.classList.remove('bezig');
      if (voltooid) toon(0);
    };
    /* vanaf de huidige zin lezen, of daarheen springen als hij al bezig is */
    const vanaf = i => {
      toon(i);
      if (Stem.bezig) Stem.speel(zinnen, merk, uit, plek);
    };
    p.onclick = () => {
      if (Stem.bezig) { Stem.stop(); return; }
      aan(); Stem.speel(zinnen, merk, uit, plek);
    };

    const stap = (teken_, naam, fn) => {
      const b = el('button', 'wi-kn', teken_);
      b.title = naam; b.setAttribute('aria-label', naam);
      b.onclick = fn;
      return b;
    };
    balk.appendChild(stap('&#9664;&#9664;', 'Vorige zin', () => vanaf(plek - 1)));
    balk.appendChild(p);
    balk.appendChild(stap('&#9654;&#9654;', 'Volgende zin', () => vanaf(plek + 1)));

    const tk = el('select', 'oefen-kies tempo-kies');
    tk.setAttribute('aria-label', 'Voorleessnelheid');
    tk.title = 'Snelheid';
    for (const v of TEMPOS) {
      const o = document.createElement('option');
      o.value = String(v);
      o.textContent = (v === 1 ? 'normaal' : String(v).replace('.', ',') + '\u00D7');
      if (Math.abs(v - (S.tempo || 0.9)) < 0.001) o.selected = true;
      tk.appendChild(o);
    }
    tk.onchange = () => {
      stelWeergaveIn('tempo', parseFloat(tk.value));
      Stem.herstart();          /* klinkt er iets, dan meteen op de nieuwe snelheid */
    };
    balk.appendChild(tk);

    /* geen bruikbare stem: knoppen uit, met de reden erachter */
    if (!Stem.stem) {
      const reden = Stem.lijst.length
        ? 'Geen Arabische stem op dit toestel'
        : 'De stemmen zijn nog niet geladen — ververs de pagina';
      balk.querySelectorAll('button, select').forEach(b => {
        b.disabled = true; b.title = reden;
      });
    }
    kop.appendChild(balk);
  }
  blad.insertBefore(kop, blad.firstChild);

  blad.appendChild(t);
  return blad;
}

/* ---------------- voorlezen ----------------
   De stemmen van het toestel zelf (SpeechSynthesis). Geen abonnement, geen
   sleutel, werkt ook zonder verbinding zodra de stem eenmaal geladen is.
   iOS en Android hebben een goede Arabische stem ingebouwd; Windows meestal
   niet — daar moet je hem er in de taalinstellingen bij zetten. Vindt de app
   geen Arabische stem, dan verschijnen de knoppen gewoon niet. */
const TEMPOS = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.25, 1.5];
const Stem = {
  lijst: [], arabisch: [], stem: null, rij: [], idx: 0, bezig: false,
  beurt: 0,           // elke leesronde krijgt een nummer, zie speel()
  klok: null,         // houdt Chrome wakker tijdens het lezen
  opZin: null, naAfloop: null,

  kan() { return typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined'; },

  /* Alle stemmen van het toestel, de Arabische bovenaan. Ze staan er allemaal
     bij omdat sommige systemen de taal verkeerd labelen — dan kun je er zelf
     een aanwijzen in plaats van dat de knop stilzwijgend wegblijft. */
  zoek() {
    if (!this.kan()) return;
    const alle = speechSynthesis.getVoices() || [];
    const isAr = v => /^ar(-|_|$)/i.test(v.lang || '');
    /* stemmen die van het net moeten komen achteraan: die haperen zonder
       verbinding en zijn juist bij lange teksten onbetrouwbaar */
    this.arabisch = alle.filter(isAr)
      .sort((a, b) => (a.localService === false) - (b.localService === false));
    this.lijst = this.arabisch.concat(alle.filter(v => !isAr(v)));
    /* de betere stemmen eerst: Apple's Maged en Google's ar-XA klinken
       een stuk natuurlijker dan de standaardkeuze */
    const beter = /maged|tarik|laila|hoda|majed|enhanced|premium|natural|google/i;
    /* Eén stem, door de app gekozen: eerst de stemmen op het toestel zelf
       (die haperen niet zonder verbinding), en daarbinnen de mooiste naam. */
    const lokaal = this.arabisch.filter(v => v.localService !== false);
    const eerst = lokaal.length ? lokaal : this.arabisch;
    this.stem = eerst.find(v => beter.test(v.name)) || eerst[0] || null;
  },



  /* de losse woorden van een zin weer aan elkaar */
  zinTekst(z) {
    return z.woorden.map(w => w.w).join(' ') + (z.eind ? ' ' + z.eind : '');
  },

  leeg() {
    this.rij = []; this.idx = 0; this.bezig = false;
    this.beurt++;     /* alles wat nog van de vorige ronde binnenkomt is oud */
    clearInterval(this.klok);
    if (this.kan()) { try { speechSynthesis.cancel(); } catch (e) { /* laat maar */ } }
  },

  stop() {
    const na = this.naAfloop;
    this.leeg();
    if (na) na(false);          /* met de hand gestopt: de plek blijft staan */
  },

  /* Het tempo van een zin die al klinkt kan niet halverwege veranderen.
     Dus: dezelfde zin opnieuw, met de nieuwe snelheid, en gewoon doorlopen. */
  herstart() {
    if (!this.bezig) return;
    this.speel(this.rij, this.opZin, this.naAfloop, Math.max(0, this.idx - 1));
  },

  /* één stuk tekst uitspreken. `begin` wordt geroepen zodra de stem echt
     begint, niet zodra de zin in de wachtrij gaat: anders loopt de markering
     voor op het geluid en spring je vanaf het verkeerde nummer. */
  zeg(tekst, na, begin) {
    if (!tekst) { if (na) na(); return false; }
    const u = new SpeechSynthesisUtterance(tekst);
    if (this.stem) u.voice = this.stem;
    u.lang = (this.stem && this.stem.lang) || 'ar-SA';
    u.rate = S.tempo || 0.9;
    let gemeld = false;
    u.onstart = () => { if (!gemeld) { gemeld = true; if (begin) begin(); } };
    u.onend = () => { if (na) na(); };
    u.onerror = () => { if (na) na(); };
    speechSynthesis.speak(u);
    /* Niet elke browser meldt `onstart` betrouwbaar. Blijft die uit, dan
       toch markeren, zodat de zin nooit ongemarkeerd blijft. */
    setTimeout(() => { if (!gemeld) { gemeld = true; if (begin) begin(); } }, 350);
    return true;
  },

  /* Chrome legt het voorlezen na een halve minuut spontaan stil. Een tikje
     pause/resume houdt het aan de praat. */
  wakker() {
    clearInterval(this.klok);
    this.klok = setInterval(() => {
      if (!this.bezig) { clearInterval(this.klok); return; }
      try { speechSynthesis.pause(); speechSynthesis.resume(); } catch (e) { /* niet erg */ }
    }, 9000);
  },

  /* een reeks zinnen achter elkaar, met terugkoppeling welke er klinkt */
  /* `vanaf` is de zin waar begonnen wordt; zo kun je terugspringen en verder
     lezen. Elke ronde krijgt een eigen nummer, want `speechSynthesis.cancel()`
     laat de afgebroken zin op sommige browsers alsnog zijn einde melden — zonder
     dat nummer zou die oude melding de nieuwe ronde vooruit duwen. */
  speel(zinnen, opZin, naAfloop, vanaf) {
    if (!this.kan()) return;
    const liep = this.bezig;
    this.leeg();
    const mijn = this.beurt;
    this.rij = zinnen; this.idx = vanaf || 0; this.bezig = true;
    this.opZin = opZin; this.naAfloop = naAfloop;
    const volgende = () => {
      if (mijn !== this.beurt) return;          /* van een vorige ronde */
      if (!this.bezig || this.idx >= this.rij.length) {
        const voltooid = this.idx >= this.rij.length;
        this.bezig = false;
        clearInterval(this.klok);
        if (this.naAfloop) this.naAfloop(voltooid);
        return;
      }
      const i = this.idx++;
      this.zeg(this.zinTekst(this.rij[i]), volgende,
        () => { if (mijn === this.beurt && this.opZin) this.opZin(i); });
    };
    this.wakker();
    /* Vlak na `cancel()` is de spraakmotor nog aan het opruimen en laat hij een
       nieuwe zin soms vallen. Even wachten als er echt iets liep. */
    if (liep) setTimeout(() => { if (mijn === this.beurt) volgende(); }, 140);
    else volgende();
  },
};
if (Stem.kan()) {
  Stem.zoek();
  /* de stemmenlijst komt op de meeste browsers pas even later binnen */
  speechSynthesis.onvoiceschanged = () => { const had = !!Stem.stem; Stem.zoek(); if (!had && Stem.stem) teken(); };
}

/* een luidsprekerknopje voor één stuk tekst */
function luidspreker(tekst, klasse) {
  if (!Stem.kan()) return null;
  const b = el('button', 'spreek' + (klasse ? ' ' + klasse : ''), '&#9654;');
  b.setAttribute('aria-label', 'Voorlezen');
  b.title = 'Voorlezen';
  b.onclick = ev => {
    ev.stopPropagation();
    Stem.stop();
    Stem.zeg(tekst, null);
  };
  return b;
}

/* ---------------- detailpaneel ---------------- */
let vorigActief = null;
function toonWoord(ids, zin, wi, zinEl, wEl) {
  const p = document.getElementById('paneelInhoud');
  p.innerHTML = '';

  if (vorigActief) vorigActief.classList.remove('actief');
  document.querySelectorAll('.zin').forEach(z => z.classList.remove('dim'));
  if (wEl) { wEl.classList.add('actief'); vorigActief = wEl; }
  if (zinEl) document.querySelectorAll('.zin').forEach(z => { if (z !== zinEl) z.classList.add('dim'); });

  /* zin met dit woord vetgedrukt */
  if (zin) {
    const d = el('div', 'deel');
    d.appendChild(el('div', 'kop', 'De zin'));
    const ar = el('div', 'zin-ar');
    zin.woorden.forEach((w, i) => {
      const s = el(i === wi && w.ids.length ? 'b' : 'span', null, esc(w.w));
      ar.appendChild(s); ar.appendChild(document.createTextNode(' '));
    });
    d.appendChild(ar);
    if (zin.nl) d.appendChild(el('div', 'zin-nl', esc(zin.nl)));
    p.appendChild(d);
  }

  /* Het lidwoord الْـ en het voegwoord وَ zeggen niets over het woord zelf en
     zouden bij bijna elk woord een eigen blok krijgen. Die laten we weg. */
  const VERBERG = new Set(['al', 'wa']);
  const tonen = ids.filter(i => !VERBERG.has(i));
  for (const id of (tonen.length ? tonen : ids)) {
    const e = lem(id); if (!e) continue;
    const d = el('div', 'deel');
    d.appendChild(el('div', 'kop', CATS[e.cat].lat + ' — ' + CATS[e.cat].ar));
    const lr = el('div', 'lemma-rij');
    lr.appendChild(el('div', 'lemma-groot ar', esc(e.lemma)));
    const lu = luidspreker(e.lemma);
    if (lu) lr.appendChild(lu);
    d.appendChild(lr);
    d.appendChild(el('div', 'lemma-nl', esc(e.nl)));

    const meta = el('div', 'meta');
    if (e.root) meta.appendChild(el('span', 'pil', 'stamletters <span class="ar">' + esc(e.root.split('').join(' ')) + '</span>'));
    if (e.soort) meta.appendChild(el('span', 'pil', '<span class="ar">' + esc(e.soort) + '</span>'));
    if (e.mv) meta.appendChild(el('span', 'pil', 'meervoud <span class="ar">' + esc(e.mv) + '</span>'));
    if (meta.children.length) d.appendChild(meta);

    if (e.cat === 'fil') {
      const dl = el('dl');
      const rij = (k, v) => { if (!v) return; const r = el('div', 'rij'); r.innerHTML = `<dt>${k}</dt><dd>${esc(v)}</dd>`; dl.appendChild(r); };
      rij('verleden tijd', e.madi);
      rij('tegenwoordige tijd', e.mudari);
      rij('gebiedende wijs', e.amr);
      rij('masdar', e.masdar);
      rij('ism fāʿil', e.faail);
      rij('ism mafʿūl', e.mafool);
      d.appendChild(dl);
      const knop = el('button', 'tabelknop', 'Volledige vervoeging tonen');
      const tabelWrap = el('div');
      tabelWrap.style.display = 'none';
      knop.onclick = () => {
        const aan = tabelWrap.style.display === 'none';
        tabelWrap.style.display = aan ? 'block' : 'none';
        knop.textContent = aan ? 'Vervoeging verbergen' : 'Volledige vervoeging tonen';
        if (aan && !tabelWrap.dataset.klaar) { tabelWrap.appendChild(vervoegTabel(e)); tabelWrap.dataset.klaar = '1'; }
      };
      d.appendChild(knop); d.appendChild(tabelWrap);
    }

    const bron = e.van || e.verwant;
    if (bron) {
      const v = el('div');
      v.style.cssText = 'margin-top:12px;padding:10px 12px;background:var(--paper);border-radius:3px';
      const kop = e.van ? 'Afgeleid van het werkwoord' : 'Werkwoord met dezelfde stamletters';
      const noot = e.van ? '' :
        '<div class="verwant-noot">Dit woord is niet uit dit werkwoord gevormd; ze delen alleen de wortel.</div>';
      v.innerHTML = `<div class="kop" style="color:var(--carry)">${kop}</div>
        <div class="rij"><dt>verleden tijd</dt><dd>${esc(bron.madi)}</dd></div>
        <div class="rij"><dt>tegenwoordige tijd</dt><dd>${esc(bron.mudari)}</dd></div>
        <div class="bet" style="margin-top:5px">${esc(bron.nl)}</div>` + noot;
      d.appendChild(v);
    }

    if (e.root && S.woordenboek[e.root]) {
      d.appendChild(woordenboekBlok(e));
    }

    p.appendChild(d);
  }

  document.getElementById('paneel').classList.add('aan');
  document.getElementById('sluier').classList.add('aan');
}

function woordenboekBlok(e) {
  const wb = S.woordenboek[e.root];
  const d = el('div', 'deel');
  const b = el('button', 'knop zacht wb-open', 'Open in woordenboek');
  b.onclick = () => toonScan(wb);
  d.appendChild(b);
  return d;
}

function toonScan(wb) {
  const ov = document.getElementById('scan');
  const beeld = document.getElementById('scanBeeld');
  document.getElementById('scanTitel').innerHTML =
    `<span class="ar">${esc(wb.wortel)}</span>`;
  beeld.innerHTML = '';
  beeld.scrollTop = 0;

  wb.paginas.forEach((p, i) => {
    const vak = el('div', 'scan-pagina');
    const img = new Image();
    img.alt = 'Woordenboekpagina ' + p;
    img.loading = i < 2 ? 'eager' : 'lazy';
    img.onerror = () => {
      vak.innerHTML = `<div class="scan-fout">Scan <code>${p}.jpg</code> ontbreekt in de map <code>page/</code>.</div>`;
    };
    /* rood streepje op de regel waar het lemma begint */
    if (i === 0 && wb.totaal > 1) {
      img.onload = () => {
        const merk = el('div', 'scan-merk');
        merk.style.top = (100 * wb.regel / wb.totaal) + '%';
        vak.appendChild(merk);
        const y = vak.offsetTop + img.offsetHeight * (wb.regel / wb.totaal)
                  - beeld.clientHeight * 0.18;
        beeld.scrollTop = Math.max(0, y);
      };
    }
    img.src = 'page/' + p + '.jpg';
    vak.appendChild(img);
    beeld.appendChild(vak);
  });
  ov.classList.add('aan');
}

function vervoegTabel(e) {
  const wrap = el('div');
  const PRON = ['أنا', 'نحن', 'أنت', 'أنتِ', 'أنتما', 'أنتم', 'أنتن', 'هو', 'هي', 'هما', 'هم', 'هن'];
  for (const [naam, sleutel] of [['Verleden tijd', 'الماضي'], ['Tegenwoordige tijd', 'المضارع'], ['Gebiedende wijs', 'الأمر']]) {
    const tb = e.tabel[sleutel]; if (!tb) continue;
    const t = el('table', 'vv');
    t.innerHTML = `<tr><th colspan="2">${naam}</th></tr>`;
    for (const p of PRON) {
      if (!tb[p]) continue;
      const r = el('tr');
      r.innerHTML = `<td class="p ar">${esc(p)}</td><td class="ar">${esc(tb[p])}</td>`;
      t.appendChild(r);
    }
    wrap.appendChild(t);
  }
  return wrap;
}

function sluitPaneel() {
  document.getElementById('paneel').classList.remove('aan');
  document.getElementById('sluier').classList.remove('aan');
  if (vorigActief) { vorigActief.classList.remove('actief'); vorigActief = null; }
  document.querySelectorAll('.zin').forEach(z => z.classList.remove('dim'));
}

/* ---------------- zinnen zeggen ---------------- */
function tekenZinnen() {
  const L = les(S.les);
  const zinnen = L.zinnen;
  const i = Math.min(S.zin, zinnen.length - 1);
  const z = zinnen[i];
  const h = (S.hints[S.les] || {});

  const blad = el('div', 'blad');
  blad.appendChild(el('h2', null, 'Zinnen zeggen — les ' + S.les));
  blad.appendChild(el('div', 'balk', `<i style="width:${Math.round(100 * (i + 1) / zinnen.length)}%"></i>`));
  blad.appendChild(el('div', 'balk-tekst', `Zin ${i + 1} van ${zinnen.length}`));

  const kaart = el('div', 'zinkaart');
  kaart.appendChild(el('div', 'zin-vraag nl-serif', esc(z.nl)));

  /* het Arabisch: onthuld tot S.open, daarna verborgen */
  const ar = el('div', 'zin-antwoord');
  z.woorden.forEach((w, wi) => {
    const zichtbaar = S.klaar || wi < S.open;
    const s = el('span', 'zw' + (zichtbaar ? ' zichtbaar' : ' verborgen'));
    s.textContent = zichtbaar ? w.w : '•'.repeat(Math.max(2, Math.min(6, w.w.length - 2)));
    if (zichtbaar) s.onclick = () => toonWoord(w.ids, z, wi, null, null);
    ar.appendChild(s);
    ar.appendChild(document.createTextNode(' '));
  });
  if (S.klaar) {
    const lu = luidspreker(Stem.zinTekst(z), 'groot');
    if (lu) { lu.innerHTML = '&#9654; Hoor de zin'; ar.appendChild(document.createElement('br')); ar.appendChild(lu); }
  }
  kaart.appendChild(ar);
  blad.appendChild(kaart);

  const a = el('div', 'acties');
  if (!S.klaar) {
    const g = el('button', 'knop', 'Ik heb het gezegd — laat zien');
    g.onclick = () => { S.klaar = true; teken(); };
    a.appendChild(g);
    if (S.open < z.woorden.length) {
      const wk = el('button', 'knop zacht',
        S.open === 0 ? 'Geef het eerste woord' : 'Geef nog een woord');
      wk.onclick = () => {
        S.open++;
        S.hints[S.les] = S.hints[S.les] || {};
        S.hints[S.les][i] = S.open;
        bewaar(); teken();
      };
      a.appendChild(wk);
    }
  } else {
    const n = el('button', 'knop', i + 1 < zinnen.length ? 'Volgende zin' : 'Klaar — naar stap 6');
    n.onclick = () => {
      if (i + 1 < zinnen.length) { S.zin = i + 1; S.open = 0; S.klaar = false; }
      else { S.stap = 5; S.geklikt = new Set(); }
      teken(); window.scrollTo(0, 0);
    };
    a.appendChild(n);
    const o = el('button', 'knop zacht', 'Nog een keer');
    o.onclick = () => { S.open = 0; S.klaar = false; teken(); };
    a.appendChild(o);
  }
  if (i > 0) {
    const v = el('button', 'knop zacht', 'Vorige');
    v.onclick = () => { S.zin = i - 1; S.open = 0; S.klaar = false; teken(); };
    a.appendChild(v);
  }
  blad.appendChild(a);

  /* zinnen waar je hulp bij nodig had */
  const lastig = Object.keys(h).filter(k => h[k] > 0).map(Number).sort((x, y) => x - y);
  if (lastig.length) {
    const lade = el('div', 'lade');
    lade.appendChild(el('h2', null, 'Hier had je hulp bij nodig'));
    const wr = el('div', 'lastig');
    for (const k of lastig) {
      if (!zinnen[k]) continue;
      const b = el('button', 'lastig-zin' + (k === i ? ' nu' : ''));
      b.innerHTML = `<span class="lz-nr">${k + 1}</span>` +
        `<span class="lz-nl">${esc(zinnen[k].nl)}</span>` +
        `<span class="lz-tel">${h[k]} ${h[k] === 1 ? 'woord' : 'woorden'}</span>`;
      b.onclick = () => { S.zin = k; S.open = 0; S.klaar = false; teken(); window.scrollTo(0, 0); };
      wr.appendChild(b);
    }
    lade.appendChild(wr);
    blad.appendChild(lade);
  }
  return blad;
}

/* ---------------- oefeningen ---------------- */
const SOORTEN = [
  { id: 'ar_nl', vraag: e => e.lemma, vraagAr: true,
    kop: 'Wat betekent dit woord?', opt: e => e.nl, optAr: false },
  { id: 'nl_ar', vraag: e => e.nl, vraagAr: false,
    kop: 'Welk woord is dit?', opt: e => e.lemma, optAr: true },
  { id: 'wortel', vraag: e => e.lemma, vraagAr: true,
    kop: 'Wat zijn de stamletters?', opt: e => (e.root || '').split('').join(' '), optAr: true },
  { id: 'soort', vraag: e => e.lemma, vraagAr: true,
    kop: 'Is dit een اسم, فعل of حرف?', opt: e => CATS[e.cat].ar, optAr: true, vast: true },
];

function meng(a) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

function nieuweVraag(pool) {
  const kandidaat = pool.filter(id => {
    const e = lem(id); return e && e.nl;
  });
  if (!kandidaat.length) return null;
  const id = kandidaat[Math.floor(Math.random() * kandidaat.length)];
  const e = lem(id);
  let mogelijk = SOORTEN.filter(s => s.id !== 'wortel' || e.root);
  const s = mogelijk[Math.floor(Math.random() * mogelijk.length)];

  let opties;
  if (s.vast) {
    opties = ['ism', 'fil', 'harf'].map(c => CATS[c].ar);
  } else {
    const anderen = meng(kandidaat.filter(x => x !== id)).slice(0, 12)
      .map(x => lem(x)).filter(x => x && s.opt(x) && s.opt(x) !== s.opt(e));
    const uniek = [];
    for (const a of anderen) { const v = s.opt(a); if (!uniek.includes(v)) uniek.push(v); if (uniek.length === 3) break; }
    opties = [s.opt(e), ...uniek];
  }
  return { id, e, s, opties: meng(opties), goed: s.opt(e) };
}

function tekenOefening() {
  const sp = splitsLes(S.les);
  const pool = sp.alle.filter(i => !S.gekend.has(i) && lem(i) &&
    !lem(i).functie && losStaand(i));
  const blad = el('div', 'blad');
  blad.appendChild(el('h2', null, 'Oefenen — les ' + S.les));

  if (!pool.length) {
    blad.appendChild(el('p', 'sub', 'Je hebt geen onbekende woorden meer in deze les.'));
    blad.appendChild(volgendeKnop('Naar de oefenteksten', 3));
    return blad;
  }


  if (!S.vraag || !pool.includes(S.vraag.id)) S.vraag = nieuweVraag(pool);
  const v = S.vraag;
  if (!v) { blad.appendChild(el('div', 'leeg', 'Geen vragen mogelijk.')); return blad; }

  const goedTotaal = S.score[S.les] || {};
  const af = pool.filter(i => (goedTotaal[i] || 0) >= 2).length;
  blad.appendChild(el('div', 'balk', `<i style="width:${Math.round(100 * af / pool.length)}%"></i>`));
  blad.appendChild(el('div', 'balk-tekst', `${af} van ${pool.length} woorden twee keer goed`));

  const kaart = el('div', 'vraagkaart');
  kaart.appendChild(el('div', 'vraag-kop', v.s.kop));
  const vr = el('div', 'vraag-tekst' + (v.s.vraagAr ? ' ar' : ' nl-serif'));
  vr.textContent = v.s.vraag(v.e);
  kaart.appendChild(vr);

  const opts = el('div', 'opties');
  for (const o of v.opties) {
    const b = el('button', 'optie' + (v.s.optAr ? ' ar' : ''));
    b.textContent = o;
    if (S.antwoord != null) {
      if (o === v.goed) b.classList.add('goed');
      else if (o === S.antwoord) b.classList.add('mis');
      b.disabled = true;
    }
    b.onclick = () => {
      S.antwoord = o;
      S.score[S.les] = S.score[S.les] || {};
      const n = S.score[S.les][v.id] || 0;
      S.score[S.les][v.id] = (o === v.goed) ? n + 1 : 0;
      if (o === v.goed && S.score[S.les][v.id] >= 2) S.gekend.add(v.id);
      bewaar(); teken();
    };
    opts.appendChild(b);
  }
  kaart.appendChild(opts);

  if (S.antwoord != null) {
    const uitleg = el('div', 'uitleg');
    const juist = S.antwoord === v.goed;
    uitleg.innerHTML = `<b class="${juist ? 'ok' : 'nok'}">${juist ? 'Goed' : 'Niet goed'}</b> ` +
      `<span class="ar">${esc(v.e.lemma)}</span> — ${esc(v.e.nl)}` +
      (v.e.root ? ` <span class="klein">stam <span class="ar">${esc(v.e.root.split('').join(' '))}</span></span>` : '');
    kaart.appendChild(uitleg);
  }
  blad.appendChild(kaart);

  const a = el('div', 'acties');
  if (S.antwoord != null) {
    const n = el('button', 'knop', 'Volgende');
    n.onclick = () => { S.antwoord = null; S.vraag = nieuweVraag(pool); teken(); };
    a.appendChild(n);
  }
  const d = el('button', 'knop zacht', 'Genoeg — naar de oefenteksten');
  d.onclick = () => { S.stap = 3; S.antwoord = null; teken(); window.scrollTo(0, 0); };
  a.appendChild(d);
  const i = el('button', 'knop zacht', 'Toon dit woord');
  i.onclick = () => toonWoord([v.id], null, null, null, null);
  a.appendChild(i);
  blad.appendChild(a);
  return blad;
}

function volgendeKnop(tekst, stap) {
  const a = el('div', 'acties');
  const b = el('button', 'knop', tekst);
  b.onclick = () => { S.stap = stap; teken(); window.scrollTo(0, 0); };
  a.appendChild(b);
  return a;
}

/* ---------------- moeilijke woorden ---------------- */
function tekenMoeilijk() {
  if (!S.moeilijk.size) return null;
  const lade = el('div', 'lade');
  lade.appendChild(el('h2', null, 'Moeilijke woorden'));

  const wr = el('div', 'kolommen');
  for (const cat of ['ism', 'fil', 'harf']) {
    const lijst = [...S.moeilijk].filter(i => lem(i) && lem(i).cat === cat);
    if (!lijst.length) continue;
    const c = el('div', 'kol kol-' + cat);
    c.appendChild(el('h3', null,
      `<span class="ar">${CATS[cat].ar}</span><span class="lat">${CATS[cat].lat}</span><span class="tel">${lijst.length}</span>`));
    for (const id of lijst) {
      const e = lem(id);
      const k = el('button', 'kaart');
      k.innerHTML = `<div class="mid"><div class="woord">${esc(e.lemma)}</div>` +
        `<div class="bet">${esc(e.nl)}</div></div>`;
      k.onclick = ev => { if (ev.target.closest('.info')) return;
        S.moeilijk.delete(id); S.gekend.add(id); bewaar(); teken(); };
      const inf = el('button', 'info', 'ⓘ');
      inf.onclick = ev => { ev.stopPropagation(); toonWoord([id], null, null, null, null); };
      k.appendChild(inf);
      c.appendChild(k);
    }
    wr.appendChild(c);
  }
  lade.appendChild(wr);
  return lade;
}

/* ---------------- mijn woorden ----------------
   Eén doorlopend overzicht van alles wat je kent, los van de lessen en over
   alle boeken heen. `gekend` is immers één verzameling. */

/* Sorteersleutel: klinkertekens eraf en de schrijfvarianten gelijkgetrokken,
   zodat أَحْمَد onder de alif staat en سَمَاء naast سَمَاءٌ. Na deze bewerking
   staan de Arabische letters in Unicode al in alfabetische volgorde, dus een
   gewone vergelijking volstaat — `localeCompare('ar')` is niet nodig.
   Het lidwoord blijft staan: strippen zou اِلْتَفَتَ (achtste stam) tot تفت
   maken, en dat is een ander woord. */
const WI_DIA = /[\u064B-\u0652\u0670\u0640\u0653-\u065F\u06D6-\u06ED]/g;
const ALFABET = [...'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'];
function sorteersleutel(s) {
  return (s || '').replace(WI_DIA, '')
    .replace(/[\u0623\u0625\u0622\u0671\u0621]/g, '\u0627')  /* أ إ آ ٱ ء → ا */
    .replace(/\u0629/g, '\u0647')                            /* ة → ه */
    .replace(/[\u0649\u0626]/g, '\u064A')                    /* ى ئ → ي */
    .replace(/\u0624/g, '\u0648');                           /* ؤ → و */
}

function wiKnoppen(veld, opties) {
  const wr = el('div', 'wi-groepknoppen');
  for (const [waarde, tekst] of opties) {
    const b = el('button', 'wi-kn' + (S.wi[veld] === waarde ? ' aan' : ''), esc(tekst));
    b.onclick = () => { S.wi[veld] = waarde; teken(); };
    wr.appendChild(b);
  }
  return wr;
}

function tekenIndex() {
  const wi = S.wi;
  const blad = el('div', 'blad');
  blad.appendChild(el('h2', null, 'Mijn woorden'));

  /* ---- welke woorden horen erbij ---- */
  const bron = wi.bereik === 'moeilijk' ? [...S.moeilijk]
             : wi.bereik === 'alles' ? Object.keys(S.lemmas)
             : [...S.gekend];
  const zoekAr = sorteersleutel(wi.zoek.trim());
  const zoekNl = wi.zoek.trim().toLowerCase();
  const rijen = [];
  for (const id of bron) {
    const e = lem(id);
    /* bouwsteentjes horen hier net zomin thuis als in de voortgangsbalk */
    if (!e || isBouwsteen(id)) continue;
    if (wi.boek !== 'alles' &&
        !(e.komt || []).some(s => s.slice(0, s.lastIndexOf('-')) === wi.boek)) continue;
    const k = sorteersleutel(e.lemma);
    if (wi.zoek.trim() && !k.includes(zoekAr) &&
        !(e.nl || '').toLowerCase().includes(zoekNl)) continue;
    rijen.push({ id, e, k });
  }
  rijen.sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));

  const sub = el('p', 'sub');
  sub.textContent = wi.bereik === 'moeilijk'
    ? `${rijen.length} ${rijen.length === 1 ? 'woord staat' : 'woorden staan'} op je moeilijke lijst.`
    : wi.bereik === 'alles'
      ? `${rijen.length} van de ${Object.keys(S.lemmas).length} woorden in de bank.`
      : `${rijen.length} ${rijen.length === 1 ? 'woord' : 'woorden'} die je kent` +
        (S.moeilijk.size ? `, waarvan ${[...S.moeilijk].filter(i => S.gekend.has(i)).length} met een stip: die staan ook op je moeilijke lijst.` : '.');
  blad.appendChild(sub);

  /* ---- de knoppenbalk ---- */
  const balk = el('div', 'wi-balk');
  const zoek = document.createElement('input');
  zoek.type = 'text'; zoek.value = wi.zoek;
  zoek.placeholder = 'Zoek in het Arabisch of Nederlands';
  zoek.setAttribute('aria-label', 'Zoeken');
  /* niet opnieuw tekenen bij elke toetsaanslag: dat kost bij duizenden
     woorden merkbaar tijd op de tablet */
  let tik = null;
  zoek.oninput = () => {
    clearTimeout(tik);
    tik = setTimeout(() => {
      wi.zoek = zoek.value;
      teken();
      const nw = document.querySelector('.wi-balk input');
      if (nw) { nw.focus(); nw.setSelectionRange(nw.value.length, nw.value.length); }
    }, 220);
  };
  balk.appendChild(zoek);
  balk.appendChild(wiKnoppen('bereik', [['gekend', 'Gekend'], ['moeilijk', 'Moeilijk'], ['alles', 'Alles']]));
  balk.appendChild(wiKnoppen('op', [['woord', 'Op woord'], ['wortel', 'Op wortel']]));
  /* de boektitels zijn te lang voor knoppen */
  const bk = el('select', 'les-kies');
  bk.setAttribute('aria-label', 'Filter op boek');
  bk.style.marginLeft = '0';
  for (const [waarde, tekst] of [['alles', 'Alle boeken'],
       ...S.index.boeken.map(b => [b.id, b.ondertitel || b.titel])]) {
    const o = document.createElement('option');
    o.value = waarde; o.textContent = tekst;
    if (wi.boek === waarde) o.selected = true;
    bk.appendChild(o);
  }
  bk.onchange = () => { wi.boek = bk.value; teken(); };
  balk.appendChild(bk);
  blad.appendChild(balk);

  if (!rijen.length) {
    blad.appendChild(el('div', 'leeg', wi.zoek.trim()
      ? 'Niets gevonden.'
      : 'Hier komen de woorden te staan zodra je een les hebt afgerond.'));
    return blad;
  }

  /* ---- groeperen ---- */
  const groepen = [];   // {kop, sleutel, rijen}
  if (wi.op === 'wortel') {
    const bak = new Map();
    for (const r of rijen) {
      const w = r.e.root || '';
      if (!bak.has(w)) bak.set(w, []);
      bak.get(w).push(r);
    }
    const wortels = [...bak.keys()].filter(Boolean)
      .sort((a, b) => { const x = sorteersleutel(a), y = sorteersleutel(b); return x < y ? -1 : x > y ? 1 : 0; });
    for (const w of wortels) groepen.push({ kop: [...w].join(' '), rijen: bak.get(w) });
    if (bak.has('')) groepen.push({ kop: 'zonder wortel', rijen: bak.get(''), plat: true });
  } else {
    const bak = new Map();
    for (const r of rijen) {
      const c = ALFABET.includes(r.k[0]) ? r.k[0] : '*';
      if (!bak.has(c)) bak.set(c, []);
      bak.get(c).push(r);
    }
    for (const c of ALFABET) if (bak.has(c)) groepen.push({ kop: c, letter: c, rijen: bak.get(c) });
    if (bak.has('*')) groepen.push({ kop: 'overig', rijen: bak.get('*'), plat: true });
  }

  /* ---- letterbalk om naartoe te springen ---- */
  if (wi.op === 'woord') {
    const lb = el('div', 'wi-letters');
    for (const c of ALFABET) {
      const g = groepen.findIndex(x => x.letter === c);
      const b = el('button', null, c);
      if (g < 0) b.disabled = true;
      else b.onclick = () => {
        const d = document.getElementById('wi-g' + g);
        if (d) d.scrollIntoView({ block: 'start', behavior: 'smooth' });
      };
      lb.appendChild(b);
    }
    blad.appendChild(lb);
  }

  /* ---- de lijst zelf ----
     In één keer als HTML-tekst opgebouwd en met één klikafhandelaar op de
     omhulling: bij drieduizend regels is een knoop per woord te traag. */
  const stukken = [];
  groepen.forEach((g, i) => {
    const rs = g.rijen.map(r =>
      `<button class="wi-rij c-${r.e.cat}" data-id="${esc(r.id)}">` +
      `<span class="wi-ar">${esc(r.e.lemma)}</span>` +
      `<span class="wi-nl">${esc(r.e.nl || '')}</span>` +
      (S.moeilijk.has(r.id) ? '<span class="wi-ml" aria-label="moeilijk"></span>' : '') +
      '</button>').join('');
    stukken.push(
      `<div class="wi-groep" id="wi-g${i}">` +
      `<div class="wi-kop"><span class="${g.plat ? '' : 'lt'}">${esc(g.kop)}</span>` +
      `<span class="tel">${g.rijen.length}</span></div>` +
      `<div class="wi-rijen">${rs}</div></div>`);
  });
  const wrap = el('div', 'woordindex', stukken.join(''));
  wrap.onclick = ev => {
    const b = ev.target.closest('.wi-rij');
    if (b) toonWoord([b.dataset.id], null, null, null, null);
  };
  blad.appendChild(wrap);
  return blad;
}

/* ---------------- schermen ---------------- */
function teken() {
  tekenKop();
  const m = document.getElementById('main');
  m.innerHTML = '';

  /* Mijn woorden staat naast de lessen, niet erin: geen les nodig */
  if (S.scherm === 'lijst') { m.appendChild(tekenIndex()); return; }

  const L = les(S.les);
  const sp = splitsLes(S.les);

  /* ---- stap 1: lezen en aanklikken ---- */
  if (S.stap === 0) {
    const blad = tekenTekst(L.zinnen, L.niveau + ' — ' + L.titel,
'', true);
    const tel = el('div', 'balk-tekst');
    tel.style.marginTop = '16px';
    tel.textContent = S.geklikt.size
      ? `${S.geklikt.size} ${S.geklikt.size === 1 ? 'woord' : 'woorden'} aangetikt als onbekend.`
      : 'Nog niets aangetikt.';
    blad.appendChild(tel);
    const a = el('div', 'acties');
    const b = el('button', 'knop', 'Klaar met lezen');
    b.onclick = () => {
      for (const id of sp.alle) {
        if (S.geklikt.has(id)) S.gekend.delete(id);
        else { S.gekend.add(id); S.moeilijk.delete(id); }
      }
      S.gelezen.add(S.les); S.geklikt = new Set(); S.stap = 1;
      bewaar(); teken(); window.scrollTo(0, 0);
    };
    a.appendChild(b);
    if (S.geklikt.size) {
      const w = el('button', 'knop zacht', 'Alles wissen');
      w.onclick = () => { S.geklikt = new Set(); bewaar(); teken(); };
      a.appendChild(w);
    }
    blad.appendChild(a);
    m.appendChild(blad);
  }

  /* ---- stap 2: woordenlijst ---- */
  else if (S.stap === 1) {
    m.appendChild(tekenLijst('Wat ken je al? — les ' + S.les, '',
      () => volgendeKnop('Naar de oefeningen', 2)));
    const md = tekenMoeilijk(); if (md) m.appendChild(md);
  }

  /* ---- stap 3: oefeningen ---- */
  else if (S.stap === 2) m.appendChild(tekenOefening());

  /* ---- stap 4: vaste oefenteksten ---- */
  else if (S.stap === 3) {
    const vast = L.oefen || [];
    const idx = Math.min(S.oefenIdx[S.les] || 0, Math.max(0, vast.length - 1));
    const blad = el('div', 'blad');
    blad.appendChild(el('h2', null, 'Oefenteksten'));

    /* nog geen oefenteksten: geen lege knoppenrij en geen leeg keuzemenu */
    if (!vast.length) {
      blad.appendChild(el('p', 'leeg', 'Deze les heeft nog geen oefenteksten.'));
      m.appendChild(blad);
      m.appendChild(volgendeKnop('Naar de zinnen', 4));
      return;
    }

    const rij = el('div', 'oefen-rij');
    vast.forEach((t, k) => {
      const b = el('button', 'oefen-knop' + (k === idx ? ' nu' : ''));
      b.innerHTML = `<span class="ok-nr">${k + 1}</span><span class="ok-titel">${esc(t.titel)}</span>`;
      b.onclick = () => { S.oefenIdx[S.les] = k; teken(); window.scrollTo(0, 0); };
      rij.appendChild(b);
    });
    blad.appendChild(rij);
    /* op smalle schermen een keuzemenu in plaats van acht knoppen */
    const kz = el('select', 'oefen-kies');
    vast.forEach((t, k) => {
      const o = document.createElement('option');
      o.value = k; o.textContent = (k + 1) + '. ' + t.titel;
      if (k === idx) o.selected = true;
      kz.appendChild(o);
    });
    kz.onchange = () => { S.oefenIdx[S.les] = Number(kz.value); teken(); window.scrollTo(0, 0); };
    blad.appendChild(kz);
    m.appendChild(blad);

    if (vast[idx]) {
      const t = vast[idx];
      m.appendChild(tekenTekst(t.zinnen, t.titel,
        '', false, new Set(t.nieuw || [])));
    }
    m.appendChild(volgendeKnop('Naar de zinnen', 4));
  }

  /* ---- stap 5: zinnen zeggen ---- */
  else if (S.stap === 4) {
    m.appendChild(tekenZinnen());
  }

  /* ---- stap 6: nog eens lezen ---- */
  else if (S.stap === 5) {
    const blad = tekenTekst(L.zinnen, 'Nog eens lezen — ' + L.titel,
'', true);
    const tel = el('div', 'balk-tekst');
    tel.style.marginTop = '16px';
    tel.textContent = S.geklikt.size
      ? `${S.geklikt.size} ${S.geklikt.size === 1 ? 'woord gaat' : 'woorden gaan'} naar je moeilijke woorden.`
      : 'Niets aangetikt — alles blijft als bekend staan.';
    blad.appendChild(tel);
    const a = el('div', 'acties');
    const b = el('button', 'knop', 'Les afronden');
    b.onclick = () => {
      for (const id of sp.alle) {
        if (S.geklikt.has(id)) { S.moeilijk.add(id); S.gekend.delete(id); }
        else { S.gekend.add(id); S.moeilijk.delete(id); }
      }
      S.afgerond.add(S.les);
      S.geklikt = new Set();
      const volg = lesLijst().find(l => l.nr === S.les + 1);
      bewaar();
      if (volg) { gaNaar(S.boek, volg.nr); return; }
      teken(); window.scrollTo(0, 0);
    };
    a.appendChild(b);
    blad.appendChild(a);
    m.appendChild(blad);
    const md = tekenMoeilijk(); if (md) m.appendChild(md);
  }
}

/* ---------------- weergave: zoom en donkere modus ---------------- */
function pasWeergaveToe() {
  document.body.classList.toggle('donker', !!S.donker);
  document.documentElement.style.setProperty('--zoom', S.zoom || 1);
  const z = document.getElementById('btnDonker');
  if (z) z.textContent = S.donker ? '☀' : '☾';
  const u = document.getElementById('btnUit');
  if (u) u.disabled = (S.zoom || 1) <= 0.75;
  const i = document.getElementById('btnIn');
  if (i) i.disabled = (S.zoom || 1) >= 1.6;
}

function stelWeergaveIn(veld, waarde) {
  S[veld] = waarde;
  localStorage.setItem('qirat.weergave', JSON.stringify({ zoom: S.zoom, donker: S.donker, tempo: S.tempo }));
  pasWeergaveToe();
}

/* ---------------- start ---------------- */
try {
  const wg = JSON.parse(localStorage.getItem('qirat.weergave') || '{}');
  S.zoom = wg.zoom || 1; S.donker = !!wg.donker;
  /* wg.traag komt uit de vorige versie: die knop had twee standen */
  S.tempo = wg.tempo || (wg.traag ? 0.6 : 0.9);
} catch (e) { /* eerste keer */ }

document.getElementById('btnIn').onclick =
  () => stelWeergaveIn('zoom', Math.min(1.6, Math.round(((S.zoom || 1) + 0.15) * 100) / 100));
document.getElementById('btnUit').onclick =
  () => stelWeergaveIn('zoom', Math.max(0.75, Math.round(((S.zoom || 1) - 0.15) * 100) / 100));
document.getElementById('btnDonker').onclick = () => stelWeergaveIn('donker', !S.donker);
pasWeergaveToe();

document.getElementById('btnIndex').onclick = () => {
  S.scherm = S.scherm === 'lijst' ? 'les' : 'lijst';
  teken(); window.scrollTo(0, 0);
};

document.getElementById('btnDicht').onclick = sluitPaneel;
document.getElementById('scanDicht').onclick = () => document.getElementById('scan').classList.remove('aan');
/* twee keer tikken op de scan sluit hem ook */
document.getElementById('scanBeeld').ondblclick = () =>
  document.getElementById('scan').classList.remove('aan');
document.getElementById('scan').onclick = ev => {
  if (ev.target.id === 'scan') ev.currentTarget.classList.remove('aan');
};
document.getElementById('sluier').onclick = sluitPaneel;
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const s = document.getElementById('scan');
  if (s.classList.contains('aan')) s.classList.remove('aan'); else sluitPaneel();
});

document.getElementById('btnExport').onclick = () => {
  const b = new Blob([localStorage.getItem(Opslag.sleutel()) || '{}'], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = 'qirat-voortgang-' + Opslag.gebruiker + '.json'; a.click();
};
document.getElementById('btnWis').onclick = async () => {
  if (!confirm('Alle voortgang wissen?' +
      (Wolk.klaar ? '\n\nOok online, en dus op al je apparaten.' : ''))) return;
  localStorage.removeItem(Opslag.sleutel());
  S.gekend = new Set(); S.afgerond = new Set(); S.moeilijk = new Set();
  S.gelezen = new Set(); S.geklikt = new Set(); S.oefen = {}; S.score = {}; S.hints = {};
  /* ook online leegmaken: anders zet het samenvoegen alles zo weer terug */
  if (Wolk.klaar) { clearTimeout(Wolk.tijd); await Wolk.duw(); }
  teken();
};

document.getElementById('btnWie').onclick = () => toonInlog();

(async function start() {
  try {
    if (window.__DATA__) {
      /* alles in één bestand (offline gebruik) */
      S.index = window.__DATA__.index;
      S.lemmas = window.__DATA__.woorden.lemmas;
      S.woordenboek = window.__DATA__.woorden.woordenboek || {};
      Object.assign(S.lessen, window.__DATA__.lessen);
    } else {
      const [ix, wo] = await Promise.all([
        fetch('data/boeken.json').then(r => r.json()),
        fetch('data/woorden.json').then(r => r.json()),
      ]);
      S.index = ix;
      S.lemmas = wo.lemmas;
      S.woordenboek = wo.woordenboek || {};
    }
    /* wie hier het laatst inlogde, zodat de juiste voortgang meteen staat */
    const wie = localStorage.getItem(WIE);
    if (wie) Opslag.gebruiker = wie.toLowerCase();
    laad();
    const r = Opslag.lees();
    if (r.boek && S.index.boeken.some(b => b.id === r.boek)) S.boek = r.boek;
    const eerste = lesLijst()[0];
    const start = (r.les && lesLijst().some(l => l.nr === r.les)) ? r.les : (eerste || {}).nr;
    if (!window.__DATA__) await laadLes(S.boek, start);
    S.les = start;
    /* op dezelfde stap terugkomen waar je was */
    if (typeof r.stap === 'number' && r.stap >= 0 && r.stap <= 5) S.stap = r.stap;
    keurGeklikt();
    pasWeergaveToe();
    teken();
    /* pas nu de wolk: de app staat er al, ingelogd of niet */
    if (!Wolk.start()) Wolk.staat('fout', 'niet gekoppeld — alleen dit apparaat');
  } catch (e) {
    document.getElementById('main').innerHTML =
      '<div class="blad"><div class="fout">Kon de gegevens niet laden: ' + esc(e.message) +
      '</div></div>';
  }
})();
