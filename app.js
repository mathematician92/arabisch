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
  wi: { bereik: 'gekend', boek: 'alles', op: 'woord', zoek: '', soort: 'alles', wazn: 'alles', zwak: 'alles' },
};

/* De nummers in S.stap zijn vast (0..5, ook in de bewaarde voortgang); de
   volgorde op het scherm staat in volgorde(). Stap 3 ("Extra teksten") komt
   als laatste en alleen in lessen die oefenteksten hebben. */
const STAPPEN = [
  { t: 'Lezen' },
  { t: 'Woorden' },
  { t: 'Overhoren' },
  { t: 'Extra teksten' },
  { t: 'Spreken' },
  { t: 'Herhaling' },
];
const heeftExtra = () => { const L = les(S.les); return !!(L && L.oefen && L.oefen.length); };
const volgorde = () => heeftExtra() ? [0, 1, 2, 4, 5, 3] : [0, 1, 2, 4, 5];

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

/* Boek 2 deel 1: dars 96 is later ingevoegd als les 30. De oude les 30 en 31
   (dars 98 en 101) heten nu les 31 en 32. Voortgang van vóór die tijd (zonder
   'nummering') schuiven we één keer mee op, of hij nu van dit apparaat komt of
   uit de wolk. */
const NUMMERING = 3;
/* Stap 3: in boek 2 kregen de leesteksten hun vragen vooraf (تَهْيِئَة) en
   de titelregel erbij, vóór de tekst. De zinnen schuiven daardoor op; de
   hints (per zinnummer) schuiven we evenveel mee. Getal = aantal nieuwe
   zinsdelen vooraan. */
const VRAAG_SCHUIF = {
  baynatwee: { 2: 8, 4: 13, 6: 8, 8: 10, 10: 8, 12: 8, 14: 9, 16: 7, 18: 10, 20: 8,
               22: 10, 24: 7, 26: 7, 28: 7, 30: 8, 32: 7 },
  baynatwee2: { 2: 7, 4: 11, 6: 7, 8: 7, 10: 7, 12: 7, 14: 10, 16: 8, 18: 7, 20: 8,
                22: 8, 24: 7, 26: 9, 28: 7, 30: 8, 32: 7 },
};
function omnummer(r) {
  if (!r || !Object.keys(r).length || (r.nummering || 1) >= NUMMERING) return r;
  let u = Object.assign({}, r);
  if ((r.nummering || 1) < 2) {
    const schuif = k => {
      const m = /^baynatwee-(\d+)(.*)$/.exec(String(k));
      return m && +m[1] >= 30 ? 'baynatwee-' + (+m[1] + 1) + m[2] : k;
    };
    const obj = x => { const o = {}; for (const k of Object.keys(x || {})) o[schuif(k)] = x[k]; return o; };
    u = Object.assign(u, {
      afgerond: (u.afgerond || []).map(schuif), gelezen: (u.gelezen || []).map(schuif),
      score: obj(u.score), hints: obj(u.hints), geklikVoor: schuif(u.geklikVoor || ''),
    });
    if (u.boek === 'baynatwee' && u.les >= 30) u.les = u.les + 1;
  }
  if ((r.nummering || 1) < 3 && u.hints) {
    const h = {};
    for (const k of Object.keys(u.hints)) {
      const m = /^(baynatwee2?)-(\d+)$/.exec(k);
      const d = m && (VRAAG_SCHUIF[m[1]] || {})[+m[2]];
      if (!d) { h[k] = u.hints[k]; continue; }
      h[k] = {};
      for (const zi of Object.keys(u.hints[k] || {})) h[k][+zi + d] = u.hints[k][zi];
    }
    u.hints = h;
  }
  u.nummering = NUMMERING;
  return u;
}

function pak() {
  return {
    gekend: [...S.gekend], afgerond: [...S.afgerond], oefen: S.oefen, hints: S.hints,
    moeilijk: [...S.moeilijk], gelezen: [...S.gelezen], score: S.score,
    boek: S.boek, les: S.les, stap: S.stap, bijgewerkt: Date.now(), nummering: NUMMERING,
    gewist: S.gewist || 0,      /* moment van 'Alles wissen' */
    /* Wat je in stap 1 of 6 hebt aangetikt is nog niet vastgelegd — dat
       gebeurt pas met de knop onderaan. Toch bewaren we het, met een merkje
       erbij van welke les en welke stap het was, zodat een onderbroken
       leesbeurt niet weg is als je de app sluit. Klopt het merkje niet met
       waar je bent, dan gaat het bij het openen alsnog weg. */
    geklikt: [...S.geklikt], geklikVoor: S.boek + '-' + S.les + '-' + S.stap,
  };
}
function zet(r) {
  r = omnummer(r) || {};
  S.gekend = new Set(r.gekend || []);
  S.afgerond = new Set(r.afgerond || []);
  S.oefen = r.oefen || {};
  S.hints = r.hints || {};
  S.moeilijk = new Set(r.moeilijk || []);
  S.gelezen = new Set(r.gelezen || []);
  S.score = r.score || {};
  S.geklikt = new Set(r.geklikt || []);
  S.geklikBij = r.geklikVoor || '';
  S.gewist = r.gewist || 0;
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
  a = omnummer(a); b = omnummer(b);
  /* 'Alles wissen' gaat voor: wat van vóór het wissen is (een apparaat dat het
     wissen nog niet had gezien) telt niet meer mee, anders komt alles terug */
  const gewist = Math.max((a && a.gewist) || 0, (b && b.gewist) || 0);
  const leeg = x => ({ boek: x.boek, les: x.les, stap: x.stap, bijgewerkt: 0, gewist, nummering: NUMMERING });
  if (a && Object.keys(a).length && (a.gewist || 0) < gewist) a = leeg(a);
  if (b && Object.keys(b).length && (b.gewist || 0) < gewist) b = leeg(b);
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
    nummering: NUMMERING,
    gewist,
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
    const ouder = (op.gewist || 0) < (S.gewist || 0);
    zet(samenvoeg(Opslag.lees(), op));
    S.boek = boek; S.les = les; S.stap = stap;
    /* een ander apparaat zette oude voortgang van vóór het wissen online:
       zet de gewiste stand er meteen weer overheen */
    if (ouder) this.plan();
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
    S.stap = 0; S.zin = 0; S.open = 0; S.klaar = false;
    S.scherm = S.reeks && S.naarReeks ? 'reeks' : 'les';

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
    b.onclick = () => kiesReeks(naam);
    namen.appendChild(b);
  });

  /* Tweede stap: welke reeks. Daarna het overzicht van die reeks. */
  function kiesReeks(naam) {
    const kies = el('div', 'inlog-doos');
    kies.appendChild(el('h1', null, 'قِرَاءَة'));
    kies.appendChild(el('p', null, 'Wat ga je lezen, ' + esc(naam) + '?'));
    const rij = el('div', 'inlog-reeksen');
    for (const r of REEKSEN) {
      if (!S.index || !S.index.boeken.some(b => r.boeken.includes(b.id))) continue;
      const k = el('button', 'inlog-reeks',
        `<span class="ir-naam">${esc(r.naam)}</span><span class="ir-ar">${esc(r.ar)}</span>`);
      k.onclick = async () => {
        rij.querySelectorAll('button').forEach(x => { x.disabled = true; });
        k.classList.add('aan');
        S.reeks = r.id;
        if (naam === nu) { sluitInlog(); S.scherm = 'reeks'; Stem.stop(); teken(); window.scrollTo(0, 0); return; }
        S.naarReeks = true;
        try { await Wolk.wissel(naam); } finally { S.naarReeks = false; }
        S.scherm = 'reeks'; teken(); window.scrollTo(0, 0);
      };
      rij.appendChild(k);
    }
    kies.appendChild(rij);
    const terug = el('button', 'inlog-los', '\u2190 Andere naam');
    terug.onclick = () => { o.replaceChild(doos, kies); };
    kies.appendChild(terug);
    o.replaceChild(kies, doos);
  }
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
/* Voortgang hoort bij een boek én een les: les 3 van het ene boek is een
   andere tekst dan les 3 van het andere. Daarom is de sleutel 'boek-nr'. */
const lesSleutel = () => S.boek + '-' + S.les;
/* Vroeger stond de telling onder alleen het lesnummer. Die oude telling
   nemen we één keer over zodra je de les weer opent; woorden die niet in
   deze les voorkomen worden toch nooit gevraagd, dus dat kan geen kwaad. */
function scoreVan() {
  const k = lesSleutel();
  if (!S.score[k]) S.score[k] = Object.assign({}, S.score[S.les] || {});
  return S.score[k];
}
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

/* De titel zoals hij in het keuzemenu hoort. Bij boek 2 staat het darsnummer
   vooraan in de titel zelf; dat tonen we al apart, dus daar knippen we het
   voorstuk eraf. De rest van de boeken heeft alleen een titel. */
function lesKern(titel) {
  const t = (titel || '').trim();
  const dp = t.indexOf(':');
  if (dp > 0 && DARS.test(t.slice(0, dp + 1).replace(/[\u064B-\u0652\u0670\u0640]/g, ''))) {
    return t.slice(dp + 1).trim();
  }
  return t;
}

/* Sommige boeken bestaan uit hoofdstukken terwijl de lessen doorgenummerd
   zijn. Staat de indeling in boeken.json, dan zet de app kopjes in het
   keuzemenu en begint de telling onder elk kopje weer bij 1. */
function hoofdstukken(boek = S.boek) {
  return (S.index.boeken.find(b => b.id === boek) || {}).hoofdstukken || [];
}
function hoofdstukVan(nr, boek = S.boek) {
  return hoofdstukken(boek).find(x => nr >= x.van && nr <= x.tot) || null;
}
/* 'Les 3' — binnen een hoofdstuk opnieuw geteld, anders gewoon het lesnummer */
function lesKop() {
  return 'Les ' + lesInHoofdstuk(S.les);
}
function hoofdstukLabel(h) {
  /* 'Hoofdstuk 4 · Hūd — الْعَاصِفَةُ' */
  const kop = 'Hoofdstuk ' + (h.nr || '') + (h.profeet ? ' \u00B7 ' + h.profeet : '');
  return h.titel ? kop + ' \u2014 ' + h.titel : kop;
}
function lesInHoofdstuk(nr, boek = S.boek) {
  const h = hoofdstukVan(nr, boek);
  return h ? nr - h.van + 1 : nr;
}

/* ---------------- reeksen ----------------
   De boeken vallen in twee reeksen. Na het kiezen van een naam kies je een
   reeks en zie je het overzicht van al haar boeken. */
const REEKSEN = [
  { id: 'aby', naam: 'Al-ʿArabiyya bayna yadayk', ar: 'العربية بين يديك',
    boeken: ['bayna', 'baynatwee', 'baynatwee2', 'baynadrie', 'baynadrie2'] },
  { id: 'lees', naam: 'Leesboeken', ar: 'قصص النبيين · القراءة الراشدة',
    boeken: ['qasas', 'qirat'] },
];
const reeksVan = boek => REEKSEN.find(r => r.boeken.includes(boek)) || null;
/* Bayna: de kleur van de omslag (boek 4 wordt rood, #B5372F). Qirāʾa en Qaṣaṣ
   krijgen een kleur die op geen van die vier lijkt: paars en turkoois. */
const BOEK_KLEUR = { bayna: '#D5893D', baynatwee: '#7C984E', baynatwee2: '#7C984E',
                     baynadrie: '#3F6B98', baynadrie2: '#3F6B98',
                     qirat: '#7D4FA6', qasas: '#17969C' };
const BOEK_KORT = { bayna: 'ABY B1', baynatwee: 'ABY B2D1', baynatwee2: 'ABY B2D2',
                    baynadrie: 'ABY B3D1', baynadrie2: 'ABY B3D2', qasas: 'Qaṣaṣ', qirat: 'Qirāʾa' };

/* Waar een woord staat, kort: in het eigen boek 'les 5' of 'H2 les 1',
   uit een ander boek 'ABY B2D1L2', 'Qaṣaṣ H2L1' of 'Qirāʾa L5'. */
function plekLabel(boek, nr) {
  const h = hoofdstukVan(nr, boek), n = h ? nr - h.van + 1 : nr;
  if (boek === S.boek) return h ? 'H' + h.nr + ' les ' + n : 'les ' + n;
  let kort = BOEK_KORT[boek] || boek;
  /* Lees je zelf in Bayna Yadayk, dan is 'ABY' overbodig: B3D1L4 zegt genoeg.
     Vanuit Qasas of Qirāʾa blijft ABY erbij staan. */
  const eigen = reeksVan(S.boek);
  const aby = kort.startsWith('ABY');
  if (aby && eigen && eigen.boeken.includes(boek)) kort = kort.slice(4);
  const plek = (h ? 'H' + h.nr : '') + 'L' + n;
  return aby ? kort + plek : kort + ' ' + plek;
}

/* Waar je een woord al eerder bent tegengekomen: in dit boek elke eerdere
   les; in een ander boek alleen lessen die je gelezen of afgerond hebt.
   Per boek de eerste les. Volgorde: dit boek, dan de eigen reeks, dan de
   andere reeks. */
function plekkenVan(id) {
  const e = lem(id);
  if (!e || !e.komt) return [];
  const per = new Map();
  for (const s of e.komt) {
    const i = s.lastIndexOf('-'), boek = s.slice(0, i), nr = Number(s.slice(i + 1));
    if (boek === S.boek ? nr >= S.les : !(S.gelezen.has(s) || S.afgerond.has(s))) continue;
    if (!per.has(boek) || nr < per.get(boek)) per.set(boek, nr);
  }
  const eigen = reeksVan(S.boek);
  const rang = b => b === S.boek ? 0 : (eigen && eigen.boeken.includes(b) ? 1 : 2);
  const volg = REEKSEN.flatMap(r => r.boeken);
  return [...per.entries()]
    .sort((a, b) => rang(a[0]) - rang(b[0]) || volg.indexOf(a[0]) - volg.indexOf(b[0]))
    .map(([boek, nr]) => ({ boek, nr, label: plekLabel(boek, nr) }));
}

/* ---------------- kop + stappen ---------------- */
function tekenKop() {
  const naarLes = nr => gaNaar(S.boek, nr);
  /* De lessen staan overal in het keuzemenu. Een rij losse knopjes was met
     183 lessen een muur van vijf regels in een kop die meescrollt. */
  const kies = document.getElementById('lesKies');
  kies.innerHTML = '';
  /* Qasas loopt door van les 1 tot 74 maar bestaat uit vier verhalen. Staan
     die in boeken.json, dan zetten we ze als kopjes boven hun lessen: de
     browser toont zo'n kopje grijs en niet aanklikbaar, precies goed. */
  /* Een hoofdstuk is een eigen regel (▦): kies je die, dan ga je naar het
     overzicht bij dat hoofdstuk. De lessen staan er ingesprongen onder. */
  const bak = kies;
  let lopend = null;
  for (const L of lesLijst()) {
    const h = hoofdstukVan(L.nr);
    if (h !== lopend) {
      lopend = h;
      if (h) {
        const o = document.createElement('option');
        o.value = 'h:' + h.nr; o.className = 'kop';
        o.textContent = '\u25A6 ' + hoofdstukLabel(h);
        if (S.scherm === 'boek' && S.hfd === h.nr) o.selected = true;
        kies.appendChild(o);
      }
    }
    const o = document.createElement('option');
    const d = darsNr(L.titel);
    o.value = L.nr;
    /* binnen een hoofdstuk telt de app opnieuw vanaf 1 */
    /* ✓ = afgerond */
    o.textContent = (h ? '\u2003' : '') + (S.afgerond.has(S.boek + '-' + L.nr) ? '\u2713 ' : '') + 'Les ' + lesInHoofdstuk(L.nr) + (d ? '  \u00B7  Dars ' + d : '') +
                    (lesKern(L.titel) ? '  \u2014  ' + lesKern(L.titel) : '');
    if (L.nr === S.les && !(S.scherm === 'boek' && S.hfd)) o.selected = true;
    bak.appendChild(o);
  }
  kies.onchange = () => {
    if (kies.value.startsWith('h:')) {
      Stem.stop();
      S.hfd = Number(kies.value.slice(2)); S.scherm = 'boek';
      teken();
      const doel = document.getElementById('ovh-' + S.boek + '-' + S.hfd);
      window.scrollTo(0, doel ? doel.getBoundingClientRect().top + window.scrollY - kopHoogte() - 12 : 0);
      return;
    }
    S.hfd = null;
    naarLes(Number(kies.value));
  };
  /* boekkeuze verschijnt zodra er meer dan één boek is */
  const bk = document.getElementById('boekKies');
  bk.style.display = S.index.boeken.length > 1 ? 'block' : 'none';
  if (S.index.boeken.length > 1) {
    bk.innerHTML = '';
    /* Per reeks eerst 'overzicht', dan de losse boeken. */
    const optie = (bak, waarde, tekst, aan) => {
      const o = document.createElement('option');
      o.value = waarde; o.textContent = tekst; if (aan) o.selected = true;
      bak.appendChild(o);
    };
    const gehad = new Set();
    for (const r of REEKSEN) {
      const boeken = S.index.boeken.filter(b => r.boeken.includes(b.id))
        .sort((a, b) => r.boeken.indexOf(a.id) - r.boeken.indexOf(b.id));
      if (!boeken.length) continue;
      optie(bk, 'reeks:' + r.id, '\u25A6 ' + r.naam,
            S.scherm === 'reeks' && (S.reeks || (reeksVan(S.boek) || {}).id) === r.id);
      bk.lastChild.className = 'kop';
      for (const b of boeken) {
        gehad.add(b.id);
        optie(bk, b.id, '\u2003' + (b.ondertitel || b.titel), S.scherm !== 'reeks' && b.id === S.boek);
      }
    }
    for (const b of S.index.boeken) if (!gehad.has(b.id)) optie(bk, b.id, b.ondertitel || b.titel, S.scherm !== 'reeks' && b.id === S.boek);
    bk.onchange = () => {
      if (bk.value.startsWith('reeks:')) {
        Stem.stop();
        S.reeks = bk.value.slice(6); S.scherm = 'reeks';
        teken(); window.scrollTo(0, 0);
        return;
      }
      gaNaar(bk.value, S.index.boeken.find(b => b.id === bk.value).lessen[0].nr);
    };
  }
  const t = document.getElementById('boekTitel');
  if (t) t.textContent = (boekNu() || {}).titel || '';
  const st = document.getElementById('stappen');
  st.innerHTML = '';
  /* in Mijn woorden zit je niet in een les: dan geen stappen */
  st.style.display = S.scherm !== 'les' ? 'none' : '';
  if (S.stap === 3 && !heeftExtra()) S.stap = 4;
  const vg = volgorde(), plekNu = vg.indexOf(S.stap);
  vg.forEach((i, plek) => {
    const s = STAPPEN[i];
    const b = el('button', 'stap' + (plek < plekNu ? ' klaar' : ''), `<b>Stap ${plek + 1}</b>${s.t}`);
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
  const bo = document.getElementById('btnOverzicht');
  if (bo) bo.classList.toggle('aan', S.scherm === 'boek');
  /* de smalle balk op de telefoon */
  const mt = document.getElementById('mobTitel');
  if (mt) {
    const L = S.scherm !== 'les' ? null : les(S.les);
    mt.innerHTML = L ? esc(lesKop()) + ' \u2014 <span class="ar">' + esc(L.titel) + '</span>'
      : S.scherm === 'boek' ? 'Overzicht'
      : S.scherm === 'reeks' ? esc((REEKSEN.find(x => x.id === S.reeks) || {}).naam || 'Overzicht')
      : 'Mijn woorden';
  }
  const ms = document.getElementById('btnStap');
  if (ms) {
    ms.hidden = S.scherm !== 'les';
    /* '3/5 · Overhoren ▾': je ziet meteen in welke stap je zit */
    ms.innerHTML = (volgorde().indexOf(S.stap) + 1) + '/' + volgorde().length + ' \u00B7 ' +
      esc(STAPPEN[S.stap].t) + ' &#9662;';
  }
  st.querySelectorAll('.stap').forEach(b => b.addEventListener('click', sluitMenus));
  meetKop();
}

/* Telefoon: menu en stappen openen en sluiten. Er staat er hooguit één open. */
/* ---------------- overzicht van het boek ----------------
   Alle lessen als vakjes: afgerond, gelezen of nog niet begonnen. Tik op een
   vakje en je gaat naar die les. */
function overzichtVanBoek(blad, boekId, kopNiveau) {
  const boek = S.index.boeken.find(b => b.id === boekId) || { lessen: [] };
  const lessen = boek.lessen;
  const sl = nr => boekId + '-' + nr;
  const nAf = lessen.filter(L => S.afgerond.has(sl(L.nr))).length;
  const nGel = lessen.filter(L => !S.afgerond.has(sl(L.nr)) && S.gelezen.has(sl(L.nr))).length;
  const naam = esc(boek.ondertitel || boek.titel || '');
  if (kopNiveau === 'h2') blad.appendChild(el('h2', null, 'Overzicht — ' + naam));
  else {
    /* in het overzicht van een reeks: elk boek een eigen blok in zijn kleur */
    const sectie = el('div', 'ov-sectie' + (BOEK_KLEUR[boekId] ? ' gekleurd' : ''));
    if (BOEK_KLEUR[boekId]) sectie.style.setProperty('--bk', BOEK_KLEUR[boekId]);
    blad.appendChild(sectie);
    blad = sectie;
    const k = el('h3', 'ov-boek', naam + (boek.titel && boek.ondertitel ? ` <span class="ar">${esc(boek.titel)}</span>` : ''));
    k.id = 'ov-' + boekId;
    blad.appendChild(k);
  }
  blad.appendChild(el('div', 'balk', `<i style="width:${Math.round(100 * nAf / Math.max(1, lessen.length))}%"></i>`));
  blad.appendChild(el('div', 'balk-tekst', `${nAf} van ${lessen.length} lessen afgerond` +
    (nGel ? ` · ${nGel} gelezen` : '')));
  let rooster = null, lopend;
  for (const L of lessen) {
    const h = hoofdstukVan(L.nr, boekId);
    if (!rooster || h !== lopend) {
      lopend = h;
      if (h) {
        const hk = el('h3', 'ov-kop', esc(hoofdstukLabel(h)));
        hk.id = 'ovh-' + boekId + '-' + h.nr;
        blad.appendChild(hk);
      }
      rooster = el('div', 'ov-rooster');
      blad.appendChild(rooster);
    }
    const af = S.afgerond.has(sl(L.nr)), gel = S.gelezen.has(sl(L.nr));
    const nu = boekId === S.boek && L.nr === S.les;
    const b = el('button', 'ov-les' + (af ? ' af' : gel ? ' gel' : '') + (nu ? ' nu' : ''));
    const d = darsNr(L.titel), kern = lesKern(L.titel) || L.titel;
    b.innerHTML = `<span class="ov-nr">${lesInHoofdstuk(L.nr, boekId)}${d ? ' · Dars ' + d : ''}</span>` +
      `<span class="ov-titel">${esc(kern)}</span>`;
    b.title = (af ? 'Afgerond' : gel ? 'Gelezen' : 'Nog niet begonnen');
    b.onclick = () => { gaNaar(boekId, L.nr); window.scrollTo(0, 0); };
    rooster.appendChild(b);
  }
}
const OV_UITLEG = '<span><i class="ov-stip af"></i>afgerond</span><span><i class="ov-stip gel"></i>gelezen</span>' +
  '<span><i class="ov-stip"></i>nog niet</span>';

function tekenOverzicht() {
  const blad = el('div', 'blad overzicht');
  overzichtVanBoek(blad, S.boek, 'h2');
  blad.insertBefore(el('div', 'ov-uitleg', OV_UITLEG), blad.children[3] || null);
  return blad;
}

/* Overzicht van een hele reeks: alle boeken onder elkaar, elk met al zijn
   lessen. Bovenaan knopjes om naar een boek te springen. */
function tekenReeks() {
  const r = REEKSEN.find(x => x.id === S.reeks) || reeksVan(S.boek) || REEKSEN[0];
  const boeken = r.boeken.filter(id => S.index.boeken.some(b => b.id === id));
  const blad = el('div', 'blad overzicht');
  blad.appendChild(el('h2', null, esc(r.naam) + ` <span class="ar ov-reeks-ar">${esc(r.ar)}</span>`));
  const sprong = el('div', 'ov-sprong');
  for (const id of boeken) {
    const b = S.index.boeken.find(x => x.id === id);
    const k = el('button', 'ov-sprong-knop', esc(b.ondertitel || b.titel));
    if (BOEK_KLEUR[id]) { k.classList.add('gekleurd'); k.style.setProperty('--bk', BOEK_KLEUR[id]); }
    k.onclick = () => {
      const doel = document.getElementById('ov-' + id);
      if (doel) window.scrollTo(0, doel.getBoundingClientRect().top + window.scrollY - kopHoogte() - 12);
    };
    sprong.appendChild(k);
  }
  if (boeken.length > 1) blad.appendChild(sprong);
  blad.appendChild(el('div', 'ov-uitleg', OV_UITLEG));
  for (const id of boeken) overzichtVanBoek(blad, id, 'h3');
  return blad;
}

function sluitMenus() {
  const h = document.querySelector('header');
  if (!h) return;
  h.classList.remove('menu-open', 'stap-open');
  const m = document.getElementById('btnMenu'), s = document.getElementById('btnStap');
  if (m) m.setAttribute('aria-expanded', 'false');
  if (s) s.setAttribute('aria-expanded', 'false');
}
function wisselMenu(soort) {
  const h = document.querySelector('header');
  const open = !h.classList.contains(soort);
  sluitMenus();
  if (open) {
    h.classList.add(soort);
    const k = document.getElementById(soort === 'menu-open' ? 'btnMenu' : 'btnStap');
    if (k) k.setAttribute('aria-expanded', 'true');
  }
}

/* De kop is sticky en valt op een smal scherm over meerdere regels. De
   voorleesbalk moet er precies onder blijven hangen, dus de hoogte wordt
   opgemeten in plaats van geraden. */
function kopHoogte() {
  const h = document.querySelector('header');
  return h && h.offsetHeight ? h.offsetHeight : 58;
}

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
function kaartVan(id, opt) {
  const e = lem(id);
  opt = opt || {};
  const kent = S.gekend.has(id);
  const k = el('button', 'kaart' + (kent && opt.markeer ? ' kent' : ''));
  /* Het merkje zegt alleen waar het woord eerder in DIT boek stond. Kwam je
     het ook tegen in een ander boek dat je gelezen hebt, dan kleurt ⓘ en
     staat daaronder in welke boeken. Zo zie je meteen: nieuw in dit boek,
     maar al eens gehad. */
  const pl = plekkenVan(id);
  const hier = pl.find(p => p.boek === S.boek);
  const elders = pl.filter(p => p.boek !== S.boek);
  let merk = hier ? `<span class="merk">${esc(hier.label)}</span>` : '';
  if (opt.merk !== undefined) {
    merk = opt.merk ? `<span class="merk ${kent ? 'g' : 'o'}">${esc(opt.merk)}</span>` : '';
  }
  k.innerHTML = `<div class="mid">
      <div class="woord">${esc(e.lemma)}</div>
      <div class="bet">${merk}${esc(e.nl)}</div>
    </div>`;
  k.onclick = ev => {
    if (ev.target.closest('.info')) return;
    S.gekend.has(id) ? S.gekend.delete(id) : S.gekend.add(id);
    bewaar(); teken();
  };
  /* Staat in het merkje al een ander boek, dan hoeft ⓘ niet ook nog te kleuren. */
  const kleur = opt.merk !== undefined ? (elders.length && pl.length && pl[0].boek === S.boek) : elders.length;
  const i = el('button', 'info' + (kleur ? ' elders' : ''), 'ⓘ');
  i.setAttribute('aria-label', 'Details van ' + e.lemma);
  if (elders.length) i.title = 'Ook gezien in: ' + elders.map(p => p.label).join(' · ');
  i.onclick = ev => { ev.stopPropagation(); toonWoord([id]); };
  k.appendChild(i);
  return k;
}

function kolommenBlok(groepen, herkomst, toonHerkomst) {
  const kol = el('div', 'kolommen');
  /* een lege kolom (vaak: geen partikels) laten we weg */
  const cats = ['ism', 'fil', 'harf'].filter(c => (groepen[c] || []).length);
  if (!cats.length) cats.push('ism');
  kol.classList.add('n' + cats.length);
  for (const cat of cats) {
    const c = el('div', 'kol kol-' + cat);
    const lijst = groepen[cat];
    c.appendChild(el('h3', null,
      `<span class="ar">${CATS[cat].ar}</span><span class="lat">${CATS[cat].lat}</span>` +
      `<span class="tel">${lijst.length}</span>`));
    if (!lijst.length) c.appendChild(el('div', 'leeg', '—'));
    for (const id of lijst) c.appendChild(kaartVan(id));
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

/* Instellingen van de woordenlijst: per apparaat bewaard. */
const WI = (() => {
  const st = { verberg: false, markeer: true };
  try { Object.assign(st, JSON.parse(localStorage.getItem('qirat.woordinst') || '{}')); } catch (e) { /* geen opslag */ }
  return st;
})();
function bewaarWI() { try { localStorage.setItem('qirat.woordinst', JSON.stringify(WI)); } catch (e) { /* geen opslag */ } }

/* Stap Woorden: twee tabbladen.
   Nieuw     = nog niet gekend en nog nooit eerder tegengekomen.
   Herhaling = al eerder tegengekomen en nog niet gekend (oranje), plus alles
               wat gekend is (groen), met de les waar het woord voor het eerst
               stond. Gekende woorden kun je verbergen of groen laten oplichten. */
function tekenLijst(titel, sub, metActies) {
  const sp = splitsLes(S.les);
  const blad = el('div', 'blad');
  const ids = { ism: [...sp.nieuw.ism, ...sp.oud.ism], fil: [...sp.nieuw.fil, ...sp.oud.fil], harf: [...sp.nieuw.harf, ...sp.oud.harf] };
  const alle = [...ids.ism, ...ids.fil, ...ids.harf];
  blad.appendChild(el('h2', null, `${esc(titel)} <span class="h2-tel">· ${alle.length} unieke woorden</span>`));
  if (sub) blad.appendChild(el('p', 'sub', sub));

  const nGekend = alle.filter(i => S.gekend.has(i)).length;
  blad.appendChild(el('div', 'balk', `<i style="width:${Math.round(100 * nGekend / (alle.length || 1))}%"></i>`));

  const eerder = id => plekkenVan(id);
  const isNieuw = id => !S.gekend.has(id) && !eerder(id).length;
  const per = f => ({ ism: ids.ism.filter(f), fil: ids.fil.filter(f), harf: ids.harf.filter(f) });
  const tel = g => g.ism.length + g.fil.length + g.harf.length;
  const nieuw = per(isNieuw);
  const herh = per(id => !isNieuw(id));
  const nOranje = tel(per(id => !isNieuw(id) && !S.gekend.has(id)));
  const nGroen = tel(per(id => S.gekend.has(id)));

  if (!S.wTab) S.wTab = 'nieuw';
  const tabs = el('div', 'wtabs');
  tabs.setAttribute('role', 'tablist');
  const tab = (sleutel, naam, getallen) => {
    const b = el('button', 'wtab' + (S.wTab === sleutel ? ' aan' : ''), `<span>${naam}</span>${getallen}`);
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', S.wTab === sleutel);
    b.onclick = () => { S.wTab = sleutel; teken(); };
    tabs.appendChild(b);
  };
  tab('nieuw', 'Nieuw', `<span class="wt-n" title="nieuwe woorden">${tel(nieuw)}</span>`);
  tab('herh', 'Herhaling',
    `<span class="wt-n o" title="eerder gezien, nog niet bekend">${nOranje}</span>` +
    `<span class="wt-n g" title="bekend">${nGroen}</span>`);
  blad.appendChild(tabs);

  const blok = (groepen, kaart) => {
    const kol = el('div', 'kolommen');
    const cats = ['ism', 'fil', 'harf'].filter(c => groepen[c].length);
    if (!cats.length) return null;
    kol.classList.add('n' + cats.length);
    for (const cat of cats) {
      const c = el('div', 'kol kol-' + cat);
      c.appendChild(el('h3', null,
        `<span class="ar">${CATS[cat].ar}</span><span class="lat">${CATS[cat].lat}</span>` +
        `<span class="tel">${groepen[cat].length}</span>`));
      for (const id of groepen[cat]) c.appendChild(kaart(id));
      kol.appendChild(c);
    }
    return kol;
  };

  const wrap = el('div', 'wlijst');
  if (S.wTab === 'nieuw') {
    const b = blok(nieuw, id => kaartVan(id, { merk: '' }));
    wrap.appendChild(b || el('p', 'wleeg', 'Geen nieuwe woorden in deze les.'));
  } else {
    const sch = el('div', 'schakels');
    const schakel = (sleutel, tekst, uit) => {
      const r = el('button', 'schakel' + (WI[sleutel] ? ' aan' : '') + (uit ? ' grijs' : ''),
        `<span class="sw"><i></i></span><span>${tekst}</span>`);
      r.setAttribute('role', 'switch');
      r.setAttribute('aria-checked', !!WI[sleutel]);
      r.onclick = () => { WI[sleutel] = !WI[sleutel]; bewaarWI(); teken(); };
      sch.appendChild(r);
    };
    schakel('verberg', 'Bekende woorden verbergen');
    schakel('markeer', 'Bekende woorden groen markeren', WI.verberg);
    wrap.appendChild(sch);
    const zicht = WI.verberg ? per(id => !isNieuw(id) && !S.gekend.has(id)) : herh;
    const b = blok(zicht, id => {
      const pl = eerder(id);
      return kaartVan(id, { merk: pl.length ? pl[0].label : plekLabel(S.boek, S.les), markeer: WI.markeer });
    });
    wrap.appendChild(b || el('p', 'wleeg', WI.verberg && nGroen
      ? 'Alle woorden die je eerder tegenkwam, ken je al.' : 'Nog geen woorden om te herhalen.'));
  }
  blad.appendChild(wrap);

  if (metActies) blad.appendChild(metActies());
  return blad;
}

/* ---------------- tekstweergave ---------------- */
/* Herkent het vragenkader van Boek 3: de eerste regel is 'ما قبل القراءة',
   de eerste regel zonder leesteken daarna is de titel van de tekst.
   kop = de regels die geen vraag zijn maar een tussenkopje ('beantwoord…:'). */
const VL_TUSSEN = { baynadrie: { 2: [0], 8: [2] }, baynadrie2: { 3: [2] } };   /* per boek en les: regels die ook tussenkop zijn */
function vragenIndeling(zinnen, kopTitel) {
  if (!zinnen.length) return null;
  const kaal = z => z.woorden.map(w => w.w).join(' ').replace(/[\u064B-\u0652\u0670]/g, '');
  const k0 = kaal(zinnen[0]);
  let titel = -1;
  if (['baynadrie', 'baynadrie2'].includes(S.boek) && k0 === 'ما قبل القراءة') {
    for (let i = 1; i < zinnen.length; i++) {
      if (!zinnen[i].eind && zinnen[i].regeleinde) { titel = i; break; }
    }
  } else if (['baynatwee', 'baynatwee2'].includes(S.boek) && k0 === 'تهيئة' && kopTitel) {
    /* Boek 2: 'تَهْيِئَةٌ', de vragen, en dan de titel. Een titel kan zelf op
       een vraagteken eindigen, dus hier zoeken we de regel die gelijk is aan
       de titel van de les. */
    const schoon = t => t.replace(/[\u064B-\u0652\u0670]/g, '').replace(/[؟?!.:،,]/g, '').replace(/\s+/g, ' ').trim();
    const doel = schoon(kopTitel);
    /* soms is de eerste vraag gelijk aan de titel (les 10): neem de laatste
       treffer bovenin */
    for (let i = 1; i < Math.min(zinnen.length, 40); i++) {
      if (zinnen[i].regeleinde && schoon(kaal(zinnen[i])) === doel) titel = i;
    }
  } else return null;
  if (titel < 2) return null;
  const kop = new Set(), extra = (VL_TUSSEN[S.boek] || {})[S.les] || [];
  let begin = 1, n = 0;
  for (let i = 1; i < titel; i++) {
    if (!zinnen[i].regeleinde) continue;
    if (zinnen[i].eind === ':' || extra.includes(n)) kop.add(begin);
    begin = i + 1; n++;
  }
  return { titel, kop, titelBoven: ['baynatwee', 'baynatwee2'].includes(S.boek) };
}

function tekenTekst(zinnen, titel, sub, markeer, nieuwSet) {
  const blad = el('div', 'blad');
  if (sub) blad.appendChild(el('p', 'sub', sub));
  const t = el('div', 'tekst');
  /* Het boek op het element zetten, zodat de opmaak per boek kan verschillen:
     elk leerboek heeft zijn eigen letterbeeld en dat mag de app volgen. */
  t.dataset.boek = S.boek;
  /* Nieuwe data zegt per woord of het korantekst is (w.k), met begin (w.ko)
     en eind (w.ks) van het stuk tussen haken. Dan zetten we de haken precies
     om het vers; de oude vlag op de hele zin is alleen nog een terugval. */
  const perWoord = zinnen.some(z => z.woorden.some(w => w.k));
  /* Boek 3 begint elke tekst met de vragen 'ما قبل القراءة' uit het blauwe
     kader, daarna de titel en dan pas de tekst. Het kader krijgt een eigen
     vlak met genummerde vragen; de titel wordt een kopregel. */
  const vl = vragenIndeling(zinnen, titel);
  let kader = null, regel = null, vnr = 0, groep = [];
  const sluitGroep = () => {          /* één los punt krijgt geen nummer */
    if (groep.length === 1) groep[0].classList.add('vl-los');
    groep = []; vnr = 0;
  };
  zinnen.forEach((z, zi) => {
    const span = el('span', 'zin');
    span.dataset.zin = zi;
    z.woorden.forEach((w, wi) => {
      if (w.ko) span.appendChild(el('span', 'haak', '\uFD3F '));
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
        (gl ? ' geleend' : '') +
        (w.k ? ' kw' : '') + (w.u ? ' ku' : ''));
      /* w.u is de schrijfwijze van de moshaf; w.w blijft de gewone spelling,
         voor het voorlezen en het opzoeken. */
      const vorm = w.u || w.w;
      if (gl) {
        s.innerHTML = `<span class="gw">${esc(vorm)}</span><span class="glos">${esc(gl.nl)}</span>`;
      } else {
        s.textContent = vorm;
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
      /* w.a: dit woord sluit een vers af. Dan volgt het verseinde-teken van de
         moshaf: in het lettertype KFGQPC Hafs tekenen de Arabische cijfers
         zichzelf als het rondje met het versnummer erin. */
      const aya = w.a ? el('span', 'aya',
        '\u00A0' + String(w.a).replace(/\d/g, c => String.fromCharCode(0x0660 + Number(c)))) : null;
      if (w.ks) {
        /* laatste woord, verseinde, sluithaak en vindplaats blijven bij elkaar */
        const slot = el('span', 'vers-eind');
        slot.appendChild(s);
        if (aya) slot.appendChild(aya);
        slot.appendChild(el('span', 'haak', ' \uFD3E'));
        if (w.ref) slot.appendChild(el('span', 'versnr', ' ' + esc(w.ref)));
        span.appendChild(slot);
      } else if (aya) {
        const slot = el('span', 'vers-eind');
        slot.appendChild(s);
        slot.appendChild(aya);
        span.appendChild(slot);
      } else if (w.hv || w.hn) {
        /* ronde haakjes en aanhalingstekens uit het boek blijven aan het woord vast */
        const slot = el('span', 'vers-eind');
        if (w.hv) slot.appendChild(document.createTextNode(w.hv));
        slot.appendChild(s);
        if (w.hn) slot.appendChild(document.createTextNode(w.hn));
        span.appendChild(slot);
      } else {
        span.appendChild(s);
      }
      span.appendChild(document.createTextNode(' '));
    });
    if (z.eind) {
      /* het leesteken mag niet los naar de volgende regel springen */
      const l = span.lastChild;
      /* De harde spatie staat in een eigen span met een gewone letter: in
         Al-Mohanad zit op die plek een verkeerd teken (À). */
      if (l && l.nodeType === 3) { span.removeChild(l); span.appendChild(el('span', 'nb', '\u00A0')); }
      span.appendChild(el('span', 'zin-eind', esc(z.eind) + ' '));
    }
    /* Een koranvers krijgt de haken ﴿ ﴾ eromheen en een eigen opmaak, zoals in
       het bronmateriaal. De haken staan niet in de woordenlijst: ze horen bij
       de weergave, niet bij de tekst die je leert. */
    if (z.koran && !perWoord) span.classList.add('koran');
    if (vl && zi <= vl.titel) {
      if (zi === 0) {
        /* Boek 2: in het boek staat de titel bovenaan en het kader zonder
           kleur; boek 3 heeft een blauw kader met de titel eronder. */
        kader = el('div', 'vl-kader' + (vl.titelBoven ? ' kaal' : ''));
        const kop = el('div', 'vl-kop'); kop.appendChild(span);
        kader.appendChild(kop); t.appendChild(kader);
      } else if (zi === vl.titel) {
        sluitGroep();
        const tt = el('div', 'tekst-titel'); tt.appendChild(span);
        if (vl.titelBoven) t.insertBefore(tt, kader); else t.appendChild(tt);
      } else {
        if (!regel) {
          const tussen = vl.kop.has(zi);
          if (tussen) sluitGroep();
          regel = el('div', tussen ? 'vl-tussen' : 'vl-vraag');
          if (!tussen) {
            vnr++;
            regel.appendChild(el('span', 'vl-nr',
              String(vnr).replace(/\d/g, c => String.fromCharCode(0x0660 + Number(c)))));
            groep.push(regel);
          }
          regel.appendChild(el('span', 'vl-zin'));
          kader.appendChild(regel);
        }
        regel.lastChild.appendChild(span);
        if (z.regeleinde) regel = null;
      }
      return;
    }
    t.appendChild(span);
    /* De brontekst zet elke zin op een eigen regel; die indeling houden we aan. */
    if (z.regeleinde) t.appendChild(el('br'));
  });
  /* Voorlezen. De bediening staat op de titelregel: terug, spelen, verder,
     en de snelheid. Eén stem, door de app gekozen — een keuzemenu leverde
     vooral opties op die het niet deden. */
  /* De titel van de tekst staat als rode kopregel bovenaan de tekst zelf.
     Boek 3 heeft die al in de tekst (na het vragenkader). */
  if (titel && !vl) {
    const tt = el('div', 'tekst-titel');
    tt.dir = 'auto';
    tt.textContent = titel;
    t.insertBefore(tt, t.firstChild);
  }
  /* Voorlezen: de bediening zit in de kop (knop 🔊, klapt uit). Hier alleen
     wat die bediening van deze tekst moet weten. */
  if (Stem.kan()) {
    const ctl = { t, plek: 0 };
    const toon = i => {
      ctl.plek = Math.max(0, Math.min(zinnen.length - 1, i));
      t.querySelectorAll('.zin.klinkt').forEach(z => z.classList.remove('klinkt'));
      const z = t.querySelector('.zin[data-zin="' + ctl.plek + '"]');
      if (z) {
        z.classList.add('klinkt');
        if (z.scrollIntoView) z.scrollIntoView({ block: 'nearest' });
      }
    };
    const merk = i => { if (i >= 0) toon(i); };
    ctl.speel = uit => Stem.speel(zinnen, merk, uit, ctl.plek);
    ctl.vanaf = (i, uit) => { toon(i); if (Stem.bezig) Stem.speel(zinnen, merk, uit, ctl.plek); };
    ctl.begin = () => toon(0);
    Lees.lijst.push(ctl);
  }
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

/* De voorleesbediening in de kop: één knop 🔊 die een balk uitklapt.
   Elke getekende tekst meldt zich in Lees.lijst; de balk bedient de tekst
   die bovenaan in beeld staat (meestal is er maar één). */
const Lees = {
  lijst: [], actief: null, open: false,
  kies() {
    if (this.actief && Stem.bezig && this.lijst.includes(this.actief)) return this.actief;
    const top = kopHoogte();
    return this.lijst.find(c => c.t.isConnected && c.t.getBoundingClientRect().bottom > top + 40) || this.lijst[0];
  },
};
function tekenLeesPaneel() {
  const knoppen = ['btnLees', 'btnLeesMob'].map(id => document.getElementById(id)).filter(Boolean);
  const pan = document.getElementById('leesPaneel');
  if (!pan) return;
  const heeft = Stem.kan() && Lees.lijst.length > 0;
  const open = heeft && Lees.open;
  knoppen.forEach(k => {
    k.hidden = !heeft;
    k.classList.toggle('aan', open);
    k.classList.toggle('klinkt', heeft && Stem.bezig);
    k.setAttribute('aria-expanded', String(open));
  });
  pan.hidden = !open;
  pan.innerHTML = '';
  if (!open) { meetKop(); return; }

  const balk = el('div', 'leesbalk');
  const p = el('button', 'wi-kn speelknop', Stem.bezig ? '&#9632;' : '&#9654;');
  p.title = 'Voorlezen'; p.setAttribute('aria-label', 'Voorlezen');
  if (Stem.bezig) p.classList.add('bezig');
  const aan = () => {
    p.innerHTML = '&#9632;'; p.title = 'Stop'; p.classList.add('bezig');
    knoppen.forEach(k => k.classList.add('klinkt'));
  };
  const uit = voltooid => {
    p.innerHTML = '&#9654;'; p.title = 'Voorlezen'; p.classList.remove('bezig');
    knoppen.forEach(k => k.classList.remove('klinkt'));
    if (voltooid && Lees.actief) Lees.actief.begin();
  };
  p.onclick = () => {
    if (Stem.bezig) { Stem.stop(); return; }
    const c = Lees.kies(); if (!c) return;
    Lees.actief = c; aan(); c.speel(uit);
  };
  const stap = (teken_, naam, d) => {
    const b = el('button', 'wi-kn', teken_);
    b.title = naam; b.setAttribute('aria-label', naam);
    b.onclick = () => { const c = Lees.kies(); if (!c) return; Lees.actief = c; c.vanaf(c.plek + d, uit); };
    return b;
  };
  balk.appendChild(stap('&#9664;&#9664;', 'Vorige zin', -1));
  balk.appendChild(p);
  balk.appendChild(stap('&#9654;&#9654;', 'Volgende zin', 1));

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
    Stem.herstart();
  };
  balk.appendChild(tk);

  /* Geen Arabische stem in de lijst is geen reden om de knoppen uit te zetten:
     veel telefoons noemen hun Arabische stem niet (of pas later), maar spreken
     het wel uit als de tekst als Arabisch is gemarkeerd. Losse woorden en de
     stap Spreken deden dat al; het voorlezen van de hele tekst nu ook. */
  pan.appendChild(balk);
  meetKop();
}
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
    /* Alleen op de computer: op een telefoon (Android) zet pause() het
       voorlezen helemaal stil in plaats van het wakker te houden. */
    const ua = navigator.userAgent || '';
    if (!/Chrome\//.test(ua) || /Android|Mobile|iPhone|iPad/.test(ua)) return;
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
/* ---------------- werkwoorden bij een naamwoord ----------------
   Per stam de werkwoorden uit de bank, en per afgeleide vorm (masdar,
   ism fāʿil, ism mafʿūl) het werkwoord waar hij bij hoort. Zo vindt het
   woordvenster ook werkwoorden die in de bouw niet met de hand gekoppeld
   zijn. */
let WW_INDEX = null;
const AFL_N = s => (s || '').normalize('NFC').replace(/ـ/g, '').trim()
  .replace(/[ً-ٍ]$/, '').replace(/[َ-ِ]$/, '');
const STAM_N = r => (r || '').replace(/[أإآؤئ]/g, 'ء');
function wwIndex() {
  if (WW_INDEX) return WW_INDEX;
  const opStam = new Map(), opVorm = new Map();
  for (const [id, e] of Object.entries(S.lemmas)) {
    if (e.cat !== 'fil' || !e.root) continue;
    const r = STAM_N(e.root);
    if (!opStam.has(r)) opStam.set(r, []);
    opStam.get(r).push(id);
    for (const [veld, naam] of [['masdar', 'masdar'], ['faail', 'ism fāʿil'], ['mafool', 'ism mafʿūl']]) {
      for (const v of String(e[veld] || '').split(/[،,/]/)) {
        const k = AFL_N(v);
        if (!k) continue;
        if (!opVorm.has(k)) opVorm.set(k, []);
        opVorm.get(k).push({ id, naam });
      }
    }
  }
  WW_INDEX = { opStam, opVorm };
  return WW_INDEX;
}
/* {van: {id, naam} | null, stam: [ids]} voor een naamwoord */
function werkwoordenBij(e) {
  const { opStam, opVorm } = wwIndex();
  const r = STAM_N(e.root);
  let van = null;
  if (e.van) {
    const id = Object.keys(S.lemmas).find(i => S.lemmas[i].cat === 'fil' && S.lemmas[i].lemma === e.van.lemma);
    van = { id, naam: '', los: e.van };
  } else {
    const k = (opVorm.get(AFL_N(e.lemma)) || []).find(x => STAM_N(lem(x.id).root) === r);
    if (k) van = k;
  }
  let stam = (opStam.get(r) || []).filter(id => !van || id !== van.id);
  /* het met de hand gekoppelde 'verwante' werkwoord vooraan */
  if (e.verwant) {
    const vid = stam.find(id => lem(id).lemma === e.verwant.lemma);
    if (vid) stam = [vid, ...stam.filter(x => x !== vid)];
  }
  return { van, stam };
}
function wwRegel(v, id) {
  const r = el(id ? 'button' : 'div', 'ww-regel');
  r.innerHTML = `<span class="ar">${esc(v.madi || v.lemma)}</span><span class="ar zacht">${esc(v.mudari || '')}</span>` +
    `<span class="bet">${esc(v.nl || '')}</span>`;
  if (id) r.onclick = () => toonWoord([id], null, null, null, null);
  return r;
}

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
      const s = el(i === wi && w.ids.length ? 'b' : 'span', w.u ? 'ku' : null, esc(w.u || w.w));
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

    const pl = plekkenVan(id);
    if (pl.length) {
      const g = el('div', 'gezien');
      g.appendChild(el('span', 'gezien-kop', 'Eerder gezien in'));
      pl.forEach(x => g.appendChild(el('span', 'pil', esc(x.label))));
      d.appendChild(g);
    }
    const meta = el('div', 'meta');
    if (e.root) meta.appendChild(el('span', 'pil', 'stamletters <span class="ar">' + esc(e.root.split('').join(' ')) + '</span>'));
    if (e.soort) meta.appendChild(el('span', 'pil', '<span class="ar">' + esc(e.soort) + '</span>'));
    if (e.mv) meta.appendChild(el('span', 'pil', 'meervoud <span class="ar">' + esc(e.mv) + '</span>'));
    if (e.ev) {
      const p2 = el(e.ev.id ? 'button' : 'span', 'pil pil-ev', 'enkelvoud <span class="ar">' + esc(e.ev.lemma) + '</span>');
      if (e.ev.id) p2.onclick = () => toonWoord([e.ev.id], null, null, null, null);
      meta.appendChild(p2);
    }
    if (meta.children.length) d.appendChild(meta);
    /* staat het woord in de tekst in het meervoud? dan zeggen we dat erbij */
    if (zin && wi != null && e.mv && zin.woorden[wi]) {
      const kaalT = s => (s || '').replace(/[\u064B-\u0652\u0670\u0640]/g, '').replace(/^ال/, '');
      const vorm = kaalT(zin.woorden[wi].w).replace(/^(و|ف|ب|ل|ك)?(ال|لل)?/, '');
      const mvs = e.mv.split(/[،,/]/).map(m => kaalT(m.trim())).filter(Boolean);
      if (mvs.some(m => vorm.startsWith(m.replace(/[ةٌ]$/, '')) && kaalT(e.lemma) !== m)) {
        d.appendChild(el('div', 'hier-mv', `In de tekst staat het meervoud <span class="ar">${esc(zin.woorden[wi].w)}</span>; het enkelvoud is <span class="ar">${esc(e.lemma)}</span>.`));
      }
    }

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

    if (e.cat === 'ism' && e.root && !e.functie) {
      const { van, stam } = werkwoordenBij(e);
      if (van || stam.length) {
        const v = el('div', 'ww-blok');
        if (van) {
          v.appendChild(el('div', 'kop', 'Afgeleid van het werkwoord' + (van.naam ? ` <span class="klein">(dit is de ${van.naam})</span>` : '')));
          v.appendChild(van.id ? wwRegel(lem(van.id), van.id) : wwRegel(van.los, null));
        }
        if (stam.length) {
          v.appendChild(el('div', 'kop' + (van ? ' tweede' : ''), (van ? 'Andere werkwoorden' : 'Werkwoorden') + ' met dezelfde stamletters'));
          for (const id of stam.slice(0, 5)) v.appendChild(wwRegel(lem(id), id));
          if (stam.length > 5) v.appendChild(el('div', 'klein', `en nog ${stam.length - 5}`));
        }
        d.appendChild(v);
      }
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
  const h = (S.hints[lesSleutel()] || {});

  const blad = el('div', 'blad');
  blad.appendChild(el('h2', null, 'Spreken — les ' + lesInHoofdstuk(S.les)));
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
        S.hints[lesSleutel()] = S.hints[lesSleutel()] || {};
        S.hints[lesSleutel()][i] = S.open;
        bewaar(); teken();
      };
      a.appendChild(wk);
    }
  } else {
    const n = el('button', 'knop', i + 1 < zinnen.length ? 'Volgende zin' : 'Klaar — naar de herhaling');
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

/* ---------------- overhoren ----------------
   Overhoren gaat in rondes van tien woorden. Fout (of "Weet ik niet") komt
   in dezelfde ronde terug na twee à drie andere vragen; de ronde is klaar
   als alle tien één keer goed zijn. Een woord wordt pas bekend als je het
   beide kanten op goed had (Arabisch → Nederlands, dan Nederlands →
   Arabisch), in twee verschillende rondes, en telkens bij de eerste poging.
   Twee keer fout zet het woord op de moeilijke lijst.

   Opslag in S.score[les]: per woord één getal = volgnummer*4 + stand
   (stand 0, 1 of 2). Het volgnummer loopt alleen op, zodat bij het
   samenvoegen van twee apparaten (hoogste getal wint) altijd de laatste
   stand blijft staan, ook als die lager is. Een oude telling 1 is stand 1.
   '!id' = aantal keer fout, '#r' = rondenummer. */
const RONDE = 10;
const standVan = (sc, id) => (sc[id] || 0) % 4;
function zetStand(sc, id, s) { sc[id] = (Math.floor((sc[id] || 0) / 4) + 1) * 4 + s; }

function meng(a) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }
const KAAL = s => (s || '').replace(/[ً-ْٰـ]/g, '');

/* de woorden van deze les die je kunt overhoren (los van wat je al kent) */
function lesWoorden() {
  return splitsLes(S.les).alle.filter(i => lem(i) && lem(i).nl && !lem(i).functie && losStaand(i));
}
function ovhPool() { return lesWoorden().filter(i => !S.gekend.has(i)); }

/* Foute keuzes van hetzelfde soort woord: eerst uit deze les, dan uit de
   rest van het boek. `waarde` maakt van een woord de tekst op de knop. */
function afleiders(id, waarde, n, extraFilter) {
  const e = lem(id), goed = waarde(e), uit = [];
  const neem = ids => {
    for (const x of meng(ids)) {
      if (uit.length >= n) return;
      const a = lem(x);
      if (!a || x === id || a.cat !== e.cat || (extraFilter && !extraFilter(a))) continue;
      const v = waarde(a);
      if (!v || v === goed || uit.includes(v)) continue;
      uit.push(v);
    }
  };
  neem(lesWoorden());
  if (uit.length < n) {
    const boek = Object.keys(S.lemmas).filter(x => (lem(x).komt || []).some(s => s.startsWith(S.boek + '-')));
    neem(boek);
  }
  if (uit.length < n) neem(Object.keys(S.lemmas));
  return uit;
}

/* Een zin uit de les waarin het woord staat (voor de gatentekst en als
   voorbeeld na het antwoord). */
function zinMet(id) {
  const L = les(S.les);
  const kandidaten = [];
  L.zinnen.forEach((z, zi) => z.woorden.forEach((w, wi) => {
    if (w.ids.includes(id)) kandidaten.push({ z, zi, wi, lang: z.woorden.length });
  }));
  if (!kandidaten.length) return null;
  const goed = kandidaten.filter(k => k.lang >= 5 && k.lang <= 16);
  return meng(goed.length ? goed : kandidaten)[0];
}
function zinHtml(k, gat) {
  return k.z.woorden.map((w, i) => i === k.wi
    ? (gat ? '<span class="zin-gat">……</span>' : `<mark class="zin-hier">${esc(w.w)}</mark>`)
    : esc(w.w)).join(' ') + esc(k.z.eind || '');
}

/* Open plek: welk woord hoort in de zin? De foute keuzes zijn andere woordvormen
   uit dezelfde les, van hetzelfde soort en met dezelfde voorvoegsels. */
function gatVraag(id) {
  const e = lem(id);
  const k = zinMet(id);
  if (k && k.lang >= 5) {
    const goed = k.z.woorden[k.wi].w;
    /* dezelfde voorvoegsels (وَ, ال, بِ …) als het goede woord, anders verraadt de vorm het antwoord */
    const voor = ids => ['wa', 'fa', 'bi', 'li', 'al', 'ka'].filter(x => ids.includes(x)).join();
    const vGoed = voor(k.z.woorden[k.wi].ids);
    /* andere woordvormen uit de les van hetzelfde soort */
    const vormen = [];
    for (const z of les(S.les).zinnen) for (const w of z.woorden) {
      const hoofd = w.ids.find(x => losStaand(x) && lem(x));
      if (!hoofd || hoofd === id || w.ids.includes(id) || lem(hoofd).cat !== e.cat || voor(w.ids) !== vGoed) continue;
      if (KAAL(w.w) === KAAL(goed) || vormen.includes(w.w)) continue;
      vormen.push(w.w);
    }
    const uit = meng(vormen).slice(0, 3);
    if (uit.length === 3) {
      return { id, e, soort: 'zin', kop: 'Welk woord hoort op de open plek?', zin: k,
        ar: false, optAr: true, goed, opties: meng([goed, ...uit]) };
    }
  }
  return null;
}

function vraagVoor(id) {
  const e = lem(id), sc = scoreVan();
  const st = standVan(sc, id);
  if (st >= 1) {
    return { id, e, soort: 'nl_ar', kop: 'Welk Arabisch woord betekent dit?',
      tekst: e.nl, ar: false, optAr: true, goed: e.lemma,
      opties: meng([e.lemma, ...afleiders(id, a => a.lemma, 3)]) };
  }
  return { id, e, soort: 'ar_nl', kop: 'Wat betekent dit woord?',
    tekst: e.lemma, ar: true, optAr: false, goed: e.nl,
    opties: meng([e.nl, ...afleiders(id, a => a.nl, 3)]) };
}

function nieuweRonde() {
  const sc = scoreVan();
  sc['#r'] = (sc['#r'] || 0) + 1;
  const pool = ovhPool();
  /* eerst de woorden die al half zijn (die moeten de andere kant op), dan de rest */
  const half = meng(pool.filter(i => standVan(sc, i) === 1));
  const rest = meng(pool.filter(i => standVan(sc, i) !== 1));
  const woorden = [...half, ...rest].slice(0, RONDE);
  S.ov = { sleutel: lesSleutel(), nr: sc['#r'], woorden, rij: meng(woorden), uitslag: {},
           vraag: null, antwoord: null, nuBekend: [] };
  if (woorden.length) S.ov.vraag = vraagVoor(S.ov.rij[0]);
  bewaar();
}

const WEET_NIET = '\u2205';   /* 'Weet ik niet' */
function beantwoord(o) {
  const ov = S.ov, v = ov.vraag, sc = scoreVan();
  if (o === null) o = WEET_NIET;
  ov.antwoord = o;
  const juist = o === v.goed;
  if (juist) {
    if (!ov.uitslag[v.id]) {
      ov.uitslag[v.id] = 'goed';
      const st = standVan(sc, v.id) + 1;
      zetStand(sc, v.id, Math.min(st, 2));
      if (st >= 2) { S.gekend.add(v.id); ov.nuBekend.push(v.id); }
    } else ov.uitslag[v.id] = ov.uitslag[v.id] === 'mis' ? 'herhaald' : ov.uitslag[v.id];
  } else {
    if (ov.uitslag[v.id] !== 'mis') {
      zetStand(sc, v.id, Math.max(0, standVan(sc, v.id) - 1));
      sc['!' + v.id] = (sc['!' + v.id] || 0) + 1;
      if (sc['!' + v.id] >= 2) S.moeilijk.add(v.id);
    }
    ov.uitslag[v.id] = 'mis';
  }
  bewaar(); teken(); toonAntwoord();
}

function volgendeVraag() {
  const ov = S.ov, v = ov.vraag;
  const kop = ov.rij.shift();
  if (ov.uitslag[v.id] === 'mis') {
    /* terug in de rij, na twee à drie andere vragen */
    const plek = Math.min(ov.rij.length, 2 + Math.floor(Math.random() * 2));
    ov.rij.splice(plek, 0, kop);
  }
  ov.antwoord = null;
  ov.vraag = ov.rij.length ? vraagVoor(ov.rij[0]) : null;
  teken(); naarVraag();
}

/* Op de telefoon: Volgende staat vast onderaan het scherm, en na Volgende
   spring je naar de vraag zelf in plaats van naar de bovenkant van de pagina.
   Op de computer blijft alles zoals het was. */
const opTelefoon = () => !!(window.matchMedia && window.matchMedia('(max-width:600px)').matches);
/* De keuzes op de telefoon 2 bij 2, tenzij er een te lang is voor een half
   scherm (meer dan twee regels): dan onder elkaar. Op de computer altijd 2 bij 2. */
function optiesDoos(opties, ar) {
  const past = opties.every(o => ar ? KAAL(o).replace(/\s/g, '').length <= 14 : o.length <= 30);
  return el('div', 'opties' + (past ? ' twee' : ''));
}
function vasteKnop(n) {
  const d = el('div', 'vast-balk');
  d.appendChild(n);
  return d;
}
function naarVraag() {
  const k = opTelefoon() && document.querySelector('#main .vraagkaart');
  if (!k) { window.scrollTo(0, 0); return; }
  window.scrollTo(0, Math.max(0, k.getBoundingClientRect().top + window.scrollY - kopHoogte() - 8));
}
/* na het antwoord: zorg dat het goede antwoord niet achter de vaste knop valt */
function toonAntwoord() {
  if (!opTelefoon()) return;
  const b = document.querySelector('#main .vast-balk');
  const g = document.querySelector('#main .zb-goedzin') || document.querySelector('#main .vraagkaart .zb-regel') ||
            document.querySelector('#main .vraagkaart .optie.goed');
  if (!b || !g) return;
  const onder = g.getBoundingClientRect().bottom + 12 - b.getBoundingClientRect().top;
  if (onder > 0) window.scrollBy(0, onder);
}

/* Aan het eind van de laatste ronde van een oefening: door naar de volgende
   oefening (in de volgorde van de knoppen bovenaan) of naar spreken.
   `opruimen` zet de oefening terug, zodat hij de volgende keer opnieuw begint. */
function eindeKnoppen(huidig, opruimen) {
  const a = el('div', 'acties');
  const i = OEF_MODI.findIndex(x => x[0] === huidig);
  const vg = OEF_MODI[i + 1];
  if (vg) {
    const n = el('button', 'knop', 'Naar ' + vg[1]);
    n.onclick = () => { if (opruimen) opruimen(); S.ovModus = vg[0]; teken(); window.scrollTo(0, 0); };
    a.appendChild(n);
  }
  const d = el('button', 'knop' + (vg ? ' zacht' : ''), 'Naar spreken');
  d.onclick = () => { if (opruimen) opruimen(); S.stap = 4; teken(); window.scrollTo(0, 0); };
  a.appendChild(d);
  return a;
}

/* de knoppen bovenaan: Overhoren plus de extra oefeningen */
const OEF_MODI = [['ovh', 'Overhoren'], ['gat', 'Open plek'], ['paren', 'Paren'], ['flits', 'Flitskaarten'], ['zb', 'Zinnen bouwen'],
                  ['ww', 'Werkwoordvormen'], ['stam', 'Stamletters']];
function modiBalk() {
  const b = el('div', 'ov-modi');
  for (const [m, t] of OEF_MODI) {
    const k = el('button', 'ov-modus' + ((S.ovModus || 'ovh') === m ? ' aan' : ''), t);
    k.onclick = () => { S.ovModus = m; teken(); };
    b.appendChild(k);
  }
  return b;
}

function tekenOefening() {
  const blad = el('div', 'blad');
  blad.appendChild(modiBalk());
  const m = S.ovModus || 'ovh';
  if (m === 'paren') tekenParen(blad);
  else if (m === 'flits') tekenFlits(blad);
  else if (m === 'zb') tekenZinnenBouwen(blad);
  else if (m === 'ww') tekenVormVraag(blad, 'ww');
  else if (m === 'stam') tekenVormVraag(blad, 'stam');
  else if (m === 'gat') tekenVormVraag(blad, 'gat');
  else tekenOverhoren(blad);
  return blad;
}

function tekenOverhoren(blad) {
  if (!S.ov || S.ov.sleutel !== lesSleutel()) {
    if (!ovhPool().length) {
      blad.appendChild(el('p', 'sub ov-leeg', 'Je kent alle woorden van deze les. Bij de andere oefeningen bovenaan kun je ze nog eens doornemen.'));
      blad.appendChild(eindeKnoppen('ovh'));
      return;
    }
    nieuweRonde();
  }
  const ov = S.ov;

  /* stippen: één per woord van de ronde */
  const kop = el('div', 'ronde-kop');
  kop.appendChild(el('span', 'ronde-nr', 'Ronde ' + ov.nr));
  const stip = el('span', 'stippen');
  for (const id of ov.woorden) {
    const u = ov.uitslag[id];
    const klaar = !ov.rij.includes(id);
    stip.appendChild(el('i', klaar ? (u === 'goed' ? 'g' : 'o') : (u === 'mis' ? 'r' : '')));
  }
  kop.appendChild(stip);
  kop.appendChild(el('span', 'ronde-rest', `nog ${ovhPool().length} te leren`));
  blad.appendChild(kop);

  /* ---- ronde klaar ---- */
  if (!ov.vraag) {
    const goed = ov.woorden.filter(i => ov.uitslag[i] === 'goed').length;
    const k = el('div', 'vraagkaart ronde-klaar');
    k.appendChild(el('div', 'vraag-kop', 'Ronde ' + ov.nr + ' klaar'));
    k.appendChild(el('p', null, `<b>${goed}</b> meteen goed, <b>${ov.woorden.length - goed}</b> na herhaling.` +
      (ov.nuBekend.length ? ` <b>${ov.nuBekend.length}</b> ${ov.nuBekend.length === 1 ? 'woord is' : 'woorden zijn'} nu bekend.` : '')));
    const mis = ov.woorden.filter(i => ov.uitslag[i] !== 'goed');
    if (mis.length) {
      k.appendChild(el('div', 'klaar-kop', 'Deze gingen eerst fout'));
      const r = el('div', 'klaar-woorden');
      for (const id of mis) {
        const c = el('button', 'klaar-woord', `<span class="ar">${esc(lem(id).lemma)}</span> ${esc(lem(id).nl)}`);
        c.onclick = () => toonWoord([id], null, null, null, null);
        r.appendChild(c);
      }
      k.appendChild(r);
    }
    blad.appendChild(k);
    if (ovhPool().length) {
      const a = el('div', 'acties');
      const n = el('button', 'knop', 'Volgende ronde');
      n.onclick = () => { nieuweRonde(); teken(); window.scrollTo(0, 0); };
      a.appendChild(n);
      blad.appendChild(a);
    } else blad.appendChild(eindeKnoppen('ovh', () => { S.ov = null; }));
    return;
  }

  /* ---- de vraag ---- */
  const v = ov.vraag;
  const kaart = el('div', 'vraagkaart');
  kaart.appendChild(el('div', 'vraag-kop', v.kop));
  if (v.soort === 'zin') {
    kaart.appendChild(el('div', 'vraag-zin ar', ov.antwoord == null ? zinHtml(v.zin, true) : zinHtml(v.zin, false)));
    if (v.zin.z.nl) kaart.appendChild(el('div', 'vraag-zin-nl', esc(v.zin.z.nl)));
  } else {
    const vr = el('div', 'vraag-tekst' + (v.ar ? ' ar' : ' nl-serif'));
    vr.textContent = v.tekst;
    kaart.appendChild(vr);
  }
  const opts = optiesDoos(v.opties, v.optAr);
  for (const o of v.opties) {
    const b = el('button', 'optie' + (v.optAr ? ' ar' : ''));
    b.textContent = o;
    if (ov.antwoord != null) {
      if (o === v.goed) b.classList.add('goed');
      else if (o === ov.antwoord) b.classList.add('mis');
      b.disabled = true;
    }
    b.onclick = () => beantwoord(o);
    opts.appendChild(b);
  }
  kaart.appendChild(opts);
  if (ov.antwoord == null) {
    const wn = el('button', 'weet-niet', 'Weet ik niet');
    wn.onclick = () => beantwoord(null);
    kaart.appendChild(wn);
  } else {
    const juist = ov.antwoord === v.goed;
    const uitleg = el('div', 'uitleg');
    uitleg.innerHTML = `<b class="${juist ? 'ok' : 'nok'}">${juist ? 'Goed' : ov.antwoord === WEET_NIET ? 'Het antwoord' : 'Niet goed'}</b> ` +
      `<span class="ar">${esc(v.e.lemma)}</span> — ${esc(v.e.nl)}` +
      (v.e.root ? ` <span class="klein">stam <span class="ar">${esc(v.e.root.split('').join(' '))}</span></span>` : '');
    const st = standVan(scoreVan(), v.id);
    const k = v.soort === 'zin' ? null : zinMet(v.id);
    if (k) {
      uitleg.innerHTML += `<div class="voorbeeld"><div class="ar">${zinHtml(k, false)}</div>` +
        (k.z.nl ? `<div class="voorbeeld-nl">${esc(k.z.nl)}</div>` : '') + '</div>';
    }
    kaart.appendChild(uitleg);
  }
  blad.appendChild(kaart);

  const a = el('div', 'acties');
  if (ov.antwoord != null) {
    const n = el('button', 'knop', 'Volgende');
    n.onclick = volgendeVraag;
    a.appendChild(vasteKnop(n));
  }
  const i = el('button', 'knop zacht', 'Toon dit woord');
  i.onclick = () => toonWoord([v.id], null, null, null, null);
  a.appendChild(i);
  blad.appendChild(a);
}

/* ---------------- extra oefeningen ----------------
   Paren en Flitskaarten gebruiken de tien woorden van je huidige
   Overhoren-ronde: zo oefen je dezelfde woorden op een andere manier.
   Werkwoordvormen en Stamletters lopen in eigen rondes van tien door alle
   werkwoorden (of woorden met een stam) van de les. Overal: stippen
   bovenaan, fout komt terug in dezelfde ronde, en een einde. */
function rondeWoorden() {
  if (!S.ov || S.ov.sleutel !== lesSleutel()) {
    if (ovhPool().length) nieuweRonde();
  }
  if (S.ov && S.ov.sleutel === lesSleutel() && S.ov.woorden.length) return { ids: S.ov.woorden, sleutel: lesSleutel() + '#' + S.ov.nr };
  /* alles al bekend: tien willekeurige woorden van de les */
  if (!S.losRonde || S.losRonde.sleutel !== lesSleutel()) S.losRonde = { sleutel: lesSleutel(), ids: meng(lesWoorden()).slice(0, RONDE) };
  return { ids: S.losRonde.ids, sleutel: lesSleutel() + '#los' };
}
function stippenRij(woorden, uitslag, nogOpen, label, rechts) {
  const kop = el('div', 'ronde-kop');
  if (label) kop.appendChild(el('span', 'ronde-nr', label));
  const stip = el('span', 'stippen');
  for (const id of woorden) {
    const u = uitslag[id], klaar = !nogOpen.includes(id);
    stip.appendChild(el('i', klaar ? (u === 'goed' ? 'g' : 'o') : (u === 'mis' ? 'r' : '')));
  }
  kop.appendChild(stip);
  if (rechts) kop.appendChild(el('span', 'ronde-rest', rechts));
  return kop;
}

/* ---- paren: twee sets van vijf ---- */
function tekenParen(blad) {
  const rw = rondeWoorden();
  if (!S.paren || S.paren.sleutel !== rw.sleutel || S.paren.opnieuw) {
    /* geen twee keer dezelfde betekenis in één set */
    const ids = meng(rw.ids), sets = [[], []];
    for (const id of ids) {
      const s = sets.find(x => x.length < 5 && !x.some(y => lem(y).nl === lem(id).nl));
      if (s) s.push(id);
    }
    S.paren = { sleutel: rw.sleutel, sets: sets.filter(s => s.length >= 2), i: 0, keus: {}, klaar: [], mis: null, fouten: 0 };
    S.paren.ar = meng(S.paren.sets[0] || []); S.paren.nl = meng(S.paren.sets[0] || []);
  }
  const P = S.paren;
  if (!P.sets.length) { blad.appendChild(el('p', 'sub', 'Te weinig woorden in deze les voor paren.')); return; }
  blad.appendChild(el('p', 'sub ov-uitleg', 'De woorden van je Overhoren-ronde. Tik een betekenis en het Arabische woord dat erbij hoort.'));
  const set = P.sets[P.i] || [];
  const alleKlaar = P.i >= P.sets.length;
  const kop = el('div', 'ronde-kop');
  kop.appendChild(el('span', 'ronde-nr', alleKlaar ? 'Klaar' : `Set ${P.i + 1} van ${P.sets.length}`));
  const st = el('span', 'stippen');
  P.sets.forEach((s, k) => s.forEach(id => st.appendChild(el('i', k < P.i || P.klaar.includes(id) ? 'g' : ''))));
  kop.appendChild(st);
  blad.appendChild(kop);
  if (alleKlaar) {
    const k = el('div', 'vraagkaart ronde-klaar');
    k.appendChild(el('div', 'vraag-kop', 'Paren klaar'));
    k.appendChild(el('p', null, P.fouten ? `Alle ${P.sets.flat().length} woorden gekoppeld, met <b>${P.fouten}</b> ${P.fouten === 1 ? 'misser' : 'missers'}.` : `Alle ${P.sets.flat().length} woorden gekoppeld, zonder fouten!`));
    blad.appendChild(k);
    blad.appendChild(eindeKnoppen('paren', () => { P.opnieuw = true; }));
    return;
  }
  const vak = el('div', 'paren');
  const kolom = (kant, lijst) => {
    const c = el('div', 'paren-kol ' + kant);
    for (const id of lijst) {
      const klaar = P.klaar.includes(id);
      const b = el('button', 'paar' + (kant === 'ar' ? ' ar' : '') + (klaar ? ' klaar' : '') +
        (P.keus[kant] === id ? ' gekozen' : '') + (P.mis && P.mis[kant] === id ? ' mis' : ''),
        esc(kant === 'ar' ? lem(id).lemma : lem(id).nl));
      b.disabled = klaar;
      b.onclick = () => {
        P.keus[kant] = P.keus[kant] === id ? null : id;
        P.mis = null;
        if (P.keus.ar && P.keus.nl) {
          if (P.keus.ar === P.keus.nl) {
            P.klaar.push(P.keus.ar);
            if (set.every(x => P.klaar.includes(x))) {
              /* set af: even laten zien, dan de volgende */
              setTimeout(() => {
                if (S.paren !== P) return;
                P.i++;
                if (P.sets[P.i]) { P.ar = meng(P.sets[P.i]); P.nl = meng(P.sets[P.i]); }
                teken();
              }, 600);
            }
          } else {
            P.fouten++;
            P.mis = { ar: P.keus.ar, nl: P.keus.nl };
            setTimeout(() => { if (S.paren === P) { P.mis = null; teken(); } }, 700);
          }
          P.keus = {};
        }
        teken();
      };
      c.appendChild(b);
    }
    return c;
  };
  /* Nederlands links, Arabisch rechts: zo lees je van de betekenis naar het woord */
  vak.appendChild(kolom('nl', P.nl));
  vak.appendChild(kolom('ar', P.ar));
  blad.appendChild(vak);
}

/* ---- flitskaarten: de tien woorden van de ronde ---- */
function tekenFlits(blad) {
  const rw = rondeWoorden();
  if (!S.flits || S.flits.sleutel !== rw.sleutel || S.flits.opnieuw) {
    S.flits = { sleutel: rw.sleutel, woorden: rw.ids.slice(), stapel: meng(rw.ids), uitslag: {}, om: false };
  }
  const F = S.flits;
  blad.appendChild(el('p', 'sub ov-uitleg', 'De woorden van je Overhoren-ronde. Bedenk de betekenis, draai de kaart om en zeg eerlijk of je het wist. Wat je niet wist, komt terug.'));
  blad.appendChild(stippenRij(F.woorden, F.uitslag, F.stapel, F.stapel.length ? `nog ${F.stapel.length}` : 'Klaar'));
  if (!F.stapel.length) {
    const wist = F.woorden.filter(i => F.uitslag[i] === 'goed').length;
    const k = el('div', 'vraagkaart ronde-klaar');
    k.appendChild(el('div', 'vraag-kop', 'Flitskaarten klaar'));
    k.appendChild(el('p', null, `<b>${wist}</b> meteen geweten, <b>${F.woorden.length - wist}</b> na herhaling.`));
    blad.appendChild(k);
    blad.appendChild(eindeKnoppen('flits', () => { F.opnieuw = true; }));
    return;
  }
  const id = F.stapel[0], e = lem(id);
  const kaart = el('button', 'flitskaart' + (F.om ? ' om' : ''));
  kaart.innerHTML = `<div class="fk-woord ar">${esc(e.lemma)}</div>` + (F.om
    ? `<div class="fk-bet">${esc(e.nl)}</div>` + (e.root ? `<div class="klein">stam <span class="ar">${esc(e.root.split('').join(' '))}</span></div>` : '')
    : '<div class="fk-tik">tik om om te draaien</div>');
  kaart.onclick = () => { if (!F.om) { F.om = true; teken(); } };
  blad.appendChild(kaart);
  const a = el('div', 'acties');
  if (F.om) {
    const ja = el('button', 'knop', 'Wist ik');
    ja.onclick = () => { if (!F.uitslag[id]) F.uitslag[id] = 'goed'; else if (F.uitslag[id] === 'mis') F.uitslag[id] = 'herhaald'; F.stapel.shift(); F.om = false; teken(); };
    const nee = el('button', 'knop zacht', 'Wist ik niet');
    nee.onclick = () => {
      F.uitslag[id] = 'mis'; F.stapel.shift();
      F.stapel.splice(Math.min(F.stapel.length, 2 + Math.floor(Math.random() * 2)), 0, id); F.om = false; teken();
    };
    a.appendChild(ja); a.appendChild(nee);
  } else {
    const om = el('button', 'knop', 'Draai om');
    om.onclick = () => { F.om = true; teken(); };
    a.appendChild(om);
  }
  blad.appendChild(a);
}

/* ---------------- zinnen bouwen ----------------
   De Nederlandse zin staat erboven; tik de Arabische woorden in de goede
   volgorde. Alleen zinnen van 3 tot 8 woorden uit de les, in rondes van
   tien. Fout of "Weet ik niet" komt in dezelfde ronde terug. */
function zbZinnen() {
  const L = les(S.les), uit = [];
  L.zinnen.forEach((z, i) => {
    const n = z.woorden.length;
    if (n < 3 || n > 8 || !z.nl) return;
    if (!z.woorden.every(w => /[ء-ي]/.test(w.w))) return;
    /* alle woorden gelijk (zoals een herhaald woord) heeft geen zin */
    if (new Set(z.woorden.map(w => w.w)).size < 2) return;
    uit.push(i);
  });
  return uit;
}
function zbNieuweVraag(Z) {
  const zi = Z.rij[0];
  const z = les(S.les).zinnen[zi];
  let volg = meng([...z.woorden.keys()]);
  /* niet toevallig al in de goede volgorde */
  for (let k = 0; k < 5 && volg.every((v, i) => z.woorden[v].w === z.woorden[i].w); k++) volg = meng(volg);
  Z.vraag = { zi, z, volg, gelegd: [], uitkomst: null };
}
function tekenZinnenBouwen(blad) {
  const sk = lesSleutel() + '~zb';
  let Z = S.zb;
  const startRonde = () => {
    Z.nr++;
    Z.woorden = Z.volgorde.slice((Z.nr - 1) * RONDE, Z.nr * RONDE);
    Z.rij = meng(Z.woorden); Z.uitslag = {};
    if (Z.rij.length) zbNieuweVraag(Z); else Z.vraag = null;
  };
  if (!Z || Z.sleutel !== sk) {
    Z = S.zb = { sleutel: sk, volgorde: meng(zbZinnen()), nr: 0 };
    startRonde();
  }
  if (!Z.volgorde.length) { blad.appendChild(el('p', 'sub', 'In deze les staan geen zinnen die kort genoeg zijn om te bouwen.')); return; }
  const totaal = Math.ceil(Z.volgorde.length / RONDE);
  blad.appendChild(el('p', 'sub ov-uitleg', `Alle ${Z.volgorde.length} korte zinnen van deze les, in rondes van ${RONDE}.`));
  blad.appendChild(stippenRij(Z.woorden, Z.uitslag, Z.rij, `Ronde ${Z.nr} van ${totaal}`));

  /* ronde klaar */
  if (!Z.vraag) {
    const goed = Z.woorden.filter(i => Z.uitslag[i] === 'goed').length;
    const laatste = Z.nr >= totaal;
    const k = el('div', 'vraagkaart ronde-klaar');
    k.appendChild(el('div', 'vraag-kop', laatste ? 'Klaar — alle zinnen gehad' : `Ronde ${Z.nr} klaar`));
    k.appendChild(el('p', null, `<b>${goed}</b> meteen goed, <b>${Z.woorden.length - goed}</b> na herhaling.` +
      (laatste ? '' : ` Nog ${totaal - Z.nr} ${totaal - Z.nr === 1 ? 'ronde' : 'rondes'}.`)));
    blad.appendChild(k);
    if (!laatste) {
      const a = el('div', 'acties');
      const n = el('button', 'knop', 'Volgende ronde');
      n.onclick = () => { startRonde(); teken(); window.scrollTo(0, 0); };
      a.appendChild(n);
      blad.appendChild(a);
    } else blad.appendChild(eindeKnoppen('zb', () => { S.zb = null; }));
    return;
  }

  const V = Z.vraag, z = V.z, klaar = V.uitkomst != null;
  const kaart = el('div', 'vraagkaart');
  kaart.appendChild(el('div', 'vraag-kop', 'Zet de woorden in de goede volgorde'));
  kaart.appendChild(el('div', 'zb-nl', esc(z.nl)));
  const regel = el('div', 'zb-regel' + (V.uitkomst === 'goed' ? ' goed' : klaar ? ' mis' : ''));
  V.gelegd.forEach((wi, pos) => {
    const fout = klaar && V.uitkomst !== 'goed' && z.woorden[wi].w !== z.woorden[pos].w;
    const t = el('button', 'zb-tegel' + (fout ? ' f' : ''), esc(z.woorden[wi].w));
    t.disabled = klaar;
    t.onclick = () => { V.gelegd.splice(pos, 1); teken(); };
    regel.appendChild(t);
  });
  kaart.appendChild(regel);
  if (!klaar) {
    const tg = el('div', 'zb-tegels');
    for (const wi of V.volg) {
      const weg = V.gelegd.includes(wi);
      const t = el('button', 'zb-tegel' + (weg ? ' leeg' : ''), esc(z.woorden[wi].w));
      t.disabled = weg;
      t.onclick = () => { V.gelegd.push(wi); teken(); };
      tg.appendChild(t);
    }
    kaart.appendChild(tg);
  } else {
    const goedeZin = z.woorden.map(w => esc(w.w)).join(' ') + esc(z.eind || '');
    kaart.appendChild(el('div', 'uitleg', V.uitkomst === 'goed'
      ? '<b class="ok">Goed!</b>'
      : `<b class="nok">${V.uitkomst === 'weet' ? 'Het antwoord' : 'Niet helemaal.'}</b> Zo is het goed:` +
        `<div class="zb-goedzin">${goedeZin}</div><div class="klein">Deze zin komt later in de ronde terug.</div>`));
  }
  blad.appendChild(kaart);

  const a = el('div', 'acties');
  const beoordeel = uitkomst => {
    V.uitkomst = uitkomst;
    if (uitkomst === 'goed') { if (!Z.uitslag[V.zi]) Z.uitslag[V.zi] = 'goed'; else if (Z.uitslag[V.zi] === 'mis') Z.uitslag[V.zi] = 'herhaald'; }
    else Z.uitslag[V.zi] = 'mis';
    teken(); toonAntwoord();
  };
  if (!klaar) {
    const vol = V.gelegd.length === z.woorden.length;
    const c = el('button', 'knop' + (vol ? '' : ' zacht'), 'Controleer');
    c.disabled = !vol;
    c.onclick = () => beoordeel(V.gelegd.every((wi, pos) => z.woorden[wi].w === z.woorden[pos].w) ? 'goed' : 'mis');
    a.appendChild(c);
    const w = el('button', 'knop zacht', 'Weet ik niet');
    w.onclick = () => { V.gelegd = [...z.woorden.keys()]; beoordeel('weet'); };
    a.appendChild(w);
  } else {
    const n = el('button', 'knop', 'Volgende');
    n.onclick = () => {
      const kop = Z.rij.shift();
      if (Z.uitslag[kop] === 'mis') Z.rij.splice(Math.min(Z.rij.length, 2 + Math.floor(Math.random() * 2)), 0, kop);
      if (Z.rij.length) zbNieuweVraag(Z); else Z.vraag = null;
      teken(); naarVraag();
    };
    a.appendChild(vasteKnop(n));
  }
  blad.appendChild(a);
}

/* ---------------- werkwoordvormen en stamletters ---------------- */
const PERS_NL = { 'أنا': 'ik', 'أنت': 'jij (m)', 'أنتِ': 'jij (v)', 'هو': 'hij', 'هي': 'zij', 'نحن': 'wij',
  'أنتم': 'jullie (m)', 'أنتن': 'jullie (v)', 'هم': 'zij (m mv)', 'هن': 'zij (v mv)',
  'أنتما': 'jullie twee', 'هما': 'zij twee (m)', 'هما مؤ': 'zij twee (v)', 'أنتما مؤ': 'jullie twee (v)' };
const VORMEN = [
  ['mudari', 'المُضارِع'], ['amr', 'الأَمْر'], ['masdar', 'المَصْدَر'],
  ['faail', 'اسم الفاعِل'], ['mafool', 'اسم المَفْعول'],
];
const wwWoorden = () => lesWoorden().filter(i => lem(i).cat === 'fil' && (lem(i).mudari || lem(i).masdar));
const stamWoorden = () => lesWoorden().filter(i => lem(i).cat !== 'harf' && lem(i).root && lem(i).root.length >= 3);
/* ---- foute keuzes voor Werkwoordvormen: altijd van hetzelfde werkwoord ---- */
const HARAKA = /[ً-ْٰ]/;
const KLINKER = { a: 'َ', i: 'ِ', u: 'ُ' };
const KORT = /[َُِ]/;
const LANG = { a: 'ا', i: 'ي', u: 'و' };
function trossen(w) {
  const t = [];
  for (const c of w) {
    if (HARAKA.test(c) && t.length) t[t.length - 1].m += c;
    else t.push({ b: c, m: '' });
  }
  return t;
}
const plak = t => t.map(x => x.b + x.m).join('');
const kopie = t => t.map(x => ({ b: x.b, m: x.m }));
/* de klinker in de stam (vóór de laatste stamletter) op drie manieren */
function stamVarianten(w, soort) {
  const t = trossen(w);
  let L = t.length - 1;
  if (t[L].b === 'ة' || (t[L].b === 'ا' && L > 0 && /[ً]/.test(t[L - 1].m))) L--;   /* ة of ـًا */
  const uit = [];
  const zetKort = (i, k) => { const n = kopie(t); n[i].m = KORT.test(n[i].m) ? n[i].m.replace(KORT, KLINKER[k]) : null; return n[i].m == null ? null : n; };
  const laatste = t[L];
  /* naqis: يَرْمِي / يَبْلُو / يَتَحَلَّى */
  if (soort === 'mudari' && /[يوى]/.test(laatste.b) && !laatste.m && L > 0 && KORT.test(t[L - 1].m)) {
    for (const k of ['a', 'i', 'u']) { const n = zetKort(L - 1, k); n[L].b = k === 'a' ? 'ى' : LANG[k]; uit.push(plak(n)); }
    return uit;
  }
  /* gebiedende wijs zonder sukun op het eind (حَابِ / اُبْلُ): de laatste klinker */
  if (soort === 'amr' && KORT.test(laatste.m) && !/ْ/.test(laatste.m)) {
    for (const k of ['a', 'i', 'u']) uit.push(plak(zetKort(L, k)));
    return uit;
  }
  if (L < 1) return uit;
  const voor = t[L - 1];
  /* lange klinker: يَطُولُ / يُثِيرُ / تَدْقِيقٌ */
  if (/[اوي]/.test(voor.b) && !voor.m && L > 1 && KORT.test(t[L - 2].m)) {
    for (const k of ['a', 'i', 'u']) { const n = zetKort(L - 2, k); n[L - 1].b = LANG[k]; uit.push(plak(n)); }
    return uit;
  }
  if (KORT.test(voor.m)) for (const k of ['a', 'i', 'u']) uit.push(plak(zetKort(L - 1, k)));
  return uit;
}
/* de klinker van het voorvoegsel: يَـ / يُـ, of اُ / اِ bij de gebiedende wijs */
function voorVariant(w, soort) {
  const t = trossen(w);
  if (!t.length || !KORT.test(t[0].m)) return null;
  if (soort === 'mudari') { const n = kopie(t); n[0].m = n[0].m.replace(KORT, /َ/.test(t[0].m) ? KLINKER.u : KLINKER.a); return plak(n); }
  if (soort === 'amr' && t[0].b === 'ا') { const n = kopie(t); n[0].m = n[0].m.replace(KORT, /ُ/.test(t[0].m) ? KLINKER.i : KLINKER.u); return plak(n); }
  return null;
}
/* als laatste redmiddel: een andere klinker op een andere plek in het woord */
function klinkerVarianten(w) {
  const t = trossen(w), uit = [];
  for (let i = 0; i < t.length - 1; i++) {
    if (!KORT.test(t[i].m) || (i + 1 < t.length && t[i + 1].b === '\u0627' && !t[i + 1].m)) continue;
    for (const k of ['a', 'i', 'u']) { const n = kopie(t); n[i].m = n[i].m.replace(KORT, KLINKER[k]); uit.push(plak(n)); }
  }
  return uit;
}
/* gebiedende wijs: de vorm met het voorvoegsel van 'jij' (تَكْتُبْ i.p.v. اُكْتُبْ),
   en bij holle werkwoorden de lange klinker die er juist niet hoort (قُولْ i.p.v. قُلْ) */
function amrExtra(e) {
  const amr = e.amr, mud = e.mudari || '';
  const t = trossen(amr), m = trossen(mud), uit = [];
  if (m.length && KORT.test(m[0].m)) {
    const weg = t[0].b === '\u0627' || (t[0].b === '\u0623' && /\u064E/.test(t[0].m) && /\u064F/.test(m[0].m));   /* اُكْتُبْ, أَثِرْ (vorm IV) */
    const rest = weg ? plak(t.slice(1)) : amr;
    uit.push('\u062A' + m[0].m + rest);
  }
  if (t.length === 2 && KORT.test(t[0].m) && /\u0652/.test(t[1].m))
    for (const k of ['a', 'i', 'u']) uit.push(t[0].b + KLINKER[k] + LANG[k] + t[1].b + t[1].m);
  return uit;
}
function vormKeuzes(e, veld) {
  const goed = e[veld];
  const echt = new Set([e.lemma, e.madi, e.mudari, e.amr, e.masdar, e.faail, e.mafool].filter(Boolean));
  const uit = [];
  const voeg = x => { if (x && x !== goed && !uit.includes(x)) uit.push(x); };
  if (veld === 'masdar' || veld === 'faail' || veld === 'mafool') {
    for (const v of meng(['masdar', 'faail', 'mafool'])) if (v !== veld) voeg(e[v]);
    for (const x of meng(stamVarianten(goed, veld))) voeg(x);
  } else {
    const stam = stamVarianten(goed, veld);
    for (const x of meng(stam)) if (!echt.has(x)) voeg(x);
    const vv = voorVariant(goed, veld);
    if (vv) { voeg(vv); for (const x of stamVarianten(vv, veld)) if (!echt.has(x)) voeg(x); }
    if (veld === 'amr') for (const x of meng(amrExtra(e))) if (!echt.has(x)) voeg(x);
  }
  if (uit.length < 3) for (const x of meng(klinkerVarianten(goed))) if (!echt.has(x)) voeg(x);
  return uit.length >= 3 ? uit.slice(0, 3) : null;
}

function wwVraag(id) {
  const e = lem(id);
  /* soms een vervoeging: andere personen van hetzelfde werkwoord zijn de foute keuzes */
  if (e.tabel && Math.random() < 0.4) {
    const tijd = meng(['الماضي', 'المضارع'])[0];
    const rij = e.tabel[tijd] || {};
    const pers = meng(['أنا', 'أنت', 'أنتِ', 'هو', 'هي', 'نحن', 'أنتم', 'هم'].filter(p => rij[p]))[0];
    if (pers) {
      const goed = rij[pers];
      const uit = meng([...new Set(Object.values(rij).filter(x => x && x !== goed))]).slice(0, 3);
      if (uit.length === 3) return { id, e, kop: `Vervoeg — ${tijd === 'الماضي' ? 'الماضي (verleden tijd)' : 'المضارع (tegenwoordige tijd)'}`,
        tekst: `${e.lemma}  ·  ${pers}`, sub: PERS_NL[pers] || '', goed, opties: meng([goed, ...uit]) };
    }
  }
  for (const [veld, naam] of meng(VORMEN.filter(([v]) => e[v]))) {
    const goed = e[veld];
    const uit = vormKeuzes(e, veld);
    if (uit) return { id, e, kop: 'Wat is ' + naam + '?', tekst: e.lemma, sub: e.nl, goed, opties: meng([goed, ...uit]) };
  }
  return null;
}
let STAMMEN = null;
function stamVraag(id) {
  const e = lem(id);
  if (!STAMMEN) STAMMEN = [...new Set(Object.values(S.lemmas).map(x => x.root).filter(r => r && r.length >= 3))];
  const goed = e.root;
  const lijkt = r => { let n = 0; for (let i = 0; i < Math.min(r.length, goed.length); i++) if (r[i] === goed[i]) n++; return n; };
  const uit = meng(STAMMEN.filter(r => r !== goed && r.length === goed.length && lijkt(r) >= 2)).slice(0, 3);
  for (const r of meng(STAMMEN)) { if (uit.length >= 3) break; if (r !== goed && !uit.includes(r)) uit.push(r); }
  const sp = r => r.split('').join(' ');
  return { id, e, kop: 'Wat zijn de stamletters?', tekst: e.lemma, sub: e.nl, goed: sp(goed),
           opties: meng([sp(goed), ...uit.map(sp)]) };
}
function tekenVormVraag(blad, soort) {
  const sk = lesSleutel() + '~' + soort;
  if (!S.vv) S.vv = {};
  let R = S.vv[soort];
  const maakVraag = id => soort === 'ww' ? wwVraag(id) : soort === 'gat' ? gatVraag(id) : stamVraag(id);
  const startRonde = () => {
    R.nr++;
    R.woorden = R.volgorde.slice((R.nr - 1) * RONDE, R.nr * RONDE);
    R.rij = meng(R.woorden); R.uitslag = {}; R.antwoord = null;
    R.vraag = R.rij.length ? maakVraag(R.rij[0]) : null;
  };
  if (!R || R.sleutel !== sk) {
    const alle = meng(soort === 'ww' ? wwWoorden() : soort === 'gat' ? lesWoorden() : stamWoorden()).filter(id => maakVraag(id));
    R = S.vv[soort] = { sleutel: sk, volgorde: alle, nr: 0 };
    startRonde();
  }
  const totaal = Math.ceil(R.volgorde.length / RONDE);
  const naam = soort === 'ww' ? 'werkwoorden' : soort === 'gat' ? 'woorden met een zin' : 'woorden met een stam';
  if (!R.volgorde.length) {
    blad.appendChild(el('p', 'sub', soort === 'ww' ? 'In deze les staan geen werkwoorden om te oefenen.' :
      soort === 'gat' ? 'In deze les staan geen zinnen om een open plek in te maken.' : 'In deze les staan geen woorden met stamletters.'));
    return;
  }
  blad.appendChild(el('p', 'sub ov-uitleg', `Alle ${R.volgorde.length} ${naam} van deze les, in rondes van ${RONDE}.`));
  blad.appendChild(stippenRij(R.woorden, R.uitslag, R.rij, `Ronde ${R.nr} van ${totaal}`));

  /* ronde klaar */
  if (!R.vraag) {
    const goed = R.woorden.filter(i => R.uitslag[i] === 'goed').length;
    const laatste = R.nr >= totaal;
    const k = el('div', 'vraagkaart ronde-klaar');
    k.appendChild(el('div', 'vraag-kop', laatste ? `Klaar — alle ${naam} gehad` : `Ronde ${R.nr} klaar`));
    k.appendChild(el('p', null, `<b>${goed}</b> meteen goed, <b>${R.woorden.length - goed}</b> na herhaling.` +
      (laatste ? '' : ` Nog ${totaal - R.nr} ${totaal - R.nr === 1 ? 'ronde' : 'rondes'}.`)));
    blad.appendChild(k);
    if (!laatste) {
      const a = el('div', 'acties');
      const n = el('button', 'knop', 'Volgende ronde');
      n.onclick = () => { startRonde(); teken(); window.scrollTo(0, 0); };
      a.appendChild(n);
      blad.appendChild(a);
    } else blad.appendChild(eindeKnoppen(soort, () => { S.vv[soort] = null; }));
    return;
  }

  const v = R.vraag;
  const kaart = el('div', 'vraagkaart');
  kaart.appendChild(el('div', 'vraag-kop', v.kop));
  if (v.zin) {
    kaart.appendChild(el('div', 'vraag-zin ar', zinHtml(v.zin, R.antwoord == null)));
    if (v.zin.z.nl) kaart.appendChild(el('div', 'vraag-zin-nl', esc(v.zin.z.nl)));
  } else {
    kaart.appendChild(el('div', 'vraag-tekst ar', esc(v.tekst)));
    if (v.sub) kaart.appendChild(el('div', 'vraag-sub', esc(v.sub)));
  }
  const opts = optiesDoos(v.opties, true);
  const antwoord = o => {
    R.antwoord = o;
    if (o === v.goed) { if (!R.uitslag[v.id]) R.uitslag[v.id] = 'goed'; else if (R.uitslag[v.id] === 'mis') R.uitslag[v.id] = 'herhaald'; }
    else R.uitslag[v.id] = 'mis';
    teken(); toonAntwoord();
  };
  for (const o of v.opties) {
    const b = el('button', 'optie ar', esc(o));
    if (R.antwoord != null) {
      if (o === v.goed) b.classList.add('goed'); else if (o === R.antwoord) b.classList.add('mis');
      b.disabled = true;
    }
    b.onclick = () => antwoord(o);
    opts.appendChild(b);
  }
  kaart.appendChild(opts);
  if (R.antwoord == null) {
    const wn = el('button', 'weet-niet', 'Weet ik niet');
    wn.onclick = () => antwoord(WEET_NIET);
    kaart.appendChild(wn);
  } else {
    const e = v.e;
    if (soort === 'ww') {
      const regels = [['الماضي', e.madi || e.lemma], ['المضارع', e.mudari], ['الأمر', e.amr], ['المصدر', e.masdar], ['اسم الفاعل', e.faail], ['اسم المفعول', e.mafool]]
        .filter(r => r[1]);
      kaart.appendChild(el('div', 'uitleg vormen', regels.map(([k, w]) => `<div><span class="klein">${k}</span> <span class="ar">${esc(w)}</span></div>`).join('')));
    } else {
      kaart.appendChild(el('div', 'uitleg', `<span class="ar">${esc(e.lemma)}</span> — ${esc(e.nl)}` +
        (e.root ? ` <span class="klein">stam <span class="ar">${esc(e.root.split('').join(' '))}</span></span>` : '')));
    }
  }
  blad.appendChild(kaart);
  const a = el('div', 'acties');
  if (R.antwoord != null) {
    const n = el('button', 'knop', 'Volgende');
    n.onclick = () => {
      const kop = R.rij.shift();
      if (R.uitslag[kop] === 'mis') R.rij.splice(Math.min(R.rij.length, 2 + Math.floor(Math.random() * 2)), 0, kop);
      R.antwoord = null;
      R.vraag = R.rij.length ? maakVraag(R.rij[0]) : null;
      teken(); naarVraag();
    };
    a.appendChild(vasteKnop(n));
  }
  blad.appendChild(a);
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
  wr.classList.add('n' + new Set([...S.moeilijk].filter(i => lem(i)).map(i => lem(i).cat)).size);
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
let wiKijker = null;   // let op welke letter bovenaan staat
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

/* ---------------- wazn van een werkwoord ----------------
   De woordenbank kent geen wazn; we leiden hem af uit de verleden tijd
   (lemma) en de stamletters. Uitkomst: 'I' t/m 'X', 'Q' (فَعْلَلَ) of
   'QII' (تَفَعْلَلَ) of 'QIV' (اِفْعَلَلَّ). */
const WAZNS = [
  ['I', 'فَعَلَ', 'يَفْعَلُ', 'اِفْعَلْ'], ['II', 'فَعَّلَ', 'يُفَعِّلُ', 'فَعِّلْ'], ['III', 'فاعَلَ', 'يُفاعِلُ', 'فاعِلْ'],
  ['IV', 'أَفْعَلَ', 'يُفْعِلُ', 'أَفْعِلْ'], ['V', 'تَفَعَّلَ', 'يَتَفَعَّلُ', 'تَفَعَّلْ'], ['VI', 'تَفاعَلَ', 'يَتَفاعَلُ', 'تَفاعَلْ'],
  ['VII', 'اِنْفَعَلَ', 'يَنْفَعِلُ', 'اِنْفَعِلْ'], ['VIII', 'اِفْتَعَلَ', 'يَفْتَعِلُ', 'اِفْتَعِلْ'], ['IX', 'اِفْعَلَّ', 'يَفْعَلُّ', 'اِفْعَلَّ'],
  ['X', 'اِسْتَفْعَلَ', 'يَسْتَفْعِلُ', 'اِسْتَفْعِلْ'], ['Q', 'فَعْلَلَ', 'يُفَعْلِلُ', 'فَعْلِلْ'], ['QII', 'تَفَعْلَلَ', 'يَتَفَعْلَلُ', 'تَفَعْلَلْ'], ['QIV', 'اِفْعَلَلَّ', 'يَفْعَلِلُّ', 'اِفْعَلِلَّ'],
];
const WAZN_DIA = /[ً-ِْٰـ]/g;   /* alle tekens behalve de shadda */
const HAMZA = /[أإآءؤئ]/g;
function waznVan(e) {
  if (!e || e.cat !== 'fil') return null;
  if (e._wazn !== undefined) return e._wazn;
  const r = (e.root || '').replace(HAMZA, 'ء');
  let s = (e.madi || e.lemma || '').replace(WAZN_DIA, '').replace(/ٱ/g, 'ا');
  const kaal = s.replace(/ّ/g, '');          /* zonder shadda */
  const n = kaal.length;
  const h = kaal.replace(HAMZA, 'ء');
  let w;
  if (r.length === 4) w = /^ت/.test(h) && h[1] === r[0] ? 'QII' : /^ا/.test(h) ? 'QIV' : 'Q';
  else if (/^است/.test(h) && n >= 5 && r[0] !== 'س') w = 'X';
  else if (/^ان/.test(h) && r[0] !== 'ن') w = 'VII';
  else if (/^ا/.test(h) && n >= 4) {
    /* اِفْعَلَّ: shadda op de laatste letter, en geen verdubbelde stam */
    w = /ّ$/.test(s) && r[1] !== r[2] && !/^ا.ت/.test(h) ? 'IX' : 'VIII';
  }
  else if (/^ء/.test(h) && r[0] !== 'ء') w = 'IV';
  /* آ = أَأْ (IV: آمَنَ يُؤْمِنُ) of أَا (III: آخَذَ يُؤاخِذُ); de مضارع beslist */
  else if (/^آ/.test(kaal) && r[0] === 'ء') w = /ؤا/.test((e.mudari || '').replace(WAZN_DIA, '')) || /^مؤا/.test((e.masdar || '').replace(WAZN_DIA, '')) ? 'III' : 'IV';
  else if (/^ت/.test(h) && (r[0] !== 'ت' || /^تت/.test(h)) && n >= 4) w = h[2] === 'ا' ? 'VI' : 'V';
  else if (n >= 4 && h[1] === 'ا') w = 'III';
  else if (/^.ّ?.ّ/.test(s) && s.indexOf('ّ') === 2 && !(r[1] === r[2] && n === 2)) w = 'II';
  else if (n === 4 && /^ء/.test(h)) w = 'IV';
  else w = 'I';
  e._wazn = w;
  return w;
}

/* Bij wazn I de klinker van de مضارع (باب): يَفْعُلُ, يَفْعِلُ of يَفْعَلُ.
   We kijken naar de klinker op de middelste stamletter in de مضارع zoals
   die in de bank staat (dat is ook wat de vervoeging gebruikt). */
function babVan(e) {
  if (waznVan(e) !== 'I') return null;
  if (e._bab !== undefined) return e._bab;
  const m = (e.mudari || '').normalize('NFC');
  const r = STAM_N(e.root || '');
  /* letters met hun tekens: [letter, tekens] */
  const lt = [];
  for (const ch of m) {
    if (/[ً-ْٰ]/.test(ch)) { if (lt.length) lt[lt.length - 1][1] += ch; }
    else lt.push([ch, '']);
  }
  let bab = null;
  const kl = t => t.includes('ُ') ? 'u' : t.includes('ِ') ? 'i' : t.includes('َ') ? 'a' : null;
  /* hol: يَقُولُ / يَبِيعُ / يَنَامُ — de lange klinker na de eerste stamletter */
  if (lt.length >= 3) {
    const [, t1] = lt[1], [c2] = lt[2];
    if (c2 === 'و' && kl(t1) === 'u') bab = 'u';
    else if (c2 === 'ي' && kl(t1) === 'i' && r[1] !== 'ي' + '') bab = 'i';
    else if (c2 === 'ا' && kl(t1) === 'a') bab = 'a';
    else if (c2 === 'ي' && kl(t1) === 'i') bab = 'i';
  }
  if (!bab) {
    /* gewoon: de klinker op de derde letter (ي ك ت ب → ت), bij مثال
       zonder و (يَصِلُ: ص is de tweede letter) of verdubbeld (يَمُدُّ) */
    if (/^[وي]/.test(r) && lt.length >= 3 && lt[1][0] !== 'و' && lt[1][0] !== 'ي' && !lt[1][1].includes('ْ')) bab = kl(lt[1][1]);
    else if (r[1] === r[2] && lt.length >= 3 && lt[2][1].includes('ّ')) bab = kl(lt[1][1]);
    else if (lt.length >= 3) bab = kl(lt[2][1]);
  }
  if (!bab) bab = e.ft === 'ضمة' ? 'u' : e.ft === 'كسرة' ? 'i' : e.ft === 'فتحة' ? 'a' : null;
  e._bab = bab;
  return bab;
}
const BAB = { u: ['يَفْعُلُ', 'اُفْعُلْ'], i: ['يَفْعِلُ', 'اِفْعِلْ'], a: ['يَفْعَلُ', 'اِفْعَلْ'] };

/* Zwakke werkwoorden: uit de stamletters. Een werkwoord kan in meer dan één
   soort vallen (أَتَى is مهموز én ناقص). سالم = geen van alle. */
const ZWAK = [
  /* [code, naam, voorbeeld, uitleg, groep] — in de volgorde van de grammatica */
  ['salim', 'سالم', 'كَتَبَ', 'gezond', 'sahih'],
  ['mahmuz', 'مهموز', 'سَأَلَ', 'met een hamza', 'sahih'],
  ['mudaaf', 'مضعّف', 'شَدَّ', 'laatste twee letters gelijk', 'sahih'],
  ['mithal', 'مثال', 'وَصَلَ', 'zwakke eerste letter', 'mutal'],
  ['ajwaf', 'أجوف', 'قالَ', 'zwakke middelste letter', 'mutal'],
  ['naqis', 'ناقص', 'رَمَى', 'zwakke laatste letter', 'mutal'],
  ['lafif_m', 'لفيف مفروق', 'وَقَى', 'eerste en laatste zwak', 'mutal'],
  ['lafif_q', 'لفيف مقرون', 'طَوَى', 'middelste en laatste zwak', 'mutal'],
  ['ruba', 'رباعي', 'تَرْجَمَ', 'vier stamletters', ''],
];
const ZWAK_GROEP = { sahih: 'صحيح — geen zwakke letter', mutal: 'معتل — met een zwakke letter' };
function zwakVan(e) {
  if (!e || e.cat !== 'fil') return [];
  if (e._zwak) return e._zwak;
  const r = STAM_N(e.root || '');
  const uit = [];
  if (r.length === 4) uit.push('ruba');
  else if (r.length === 3) {
    const z = [...r].map(c => c === 'و' || c === 'ي');
    if (z[0] && z[2]) uit.push('lafif_m');
    else if (z[1] && z[2]) uit.push('lafif_q');
    else {
      if (z[0]) uit.push('mithal');
      if (z[1]) uit.push('ajwaf');
      if (z[2]) uit.push('naqis');
    }
    if (r[1] === r[2] && !z[2]) uit.push('mudaaf');
    if (r.includes('ء')) uit.push('mahmuz');
    if (!uit.length) uit.push('salim');
  }
  e._zwak = uit;
  return uit;
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
  const waznTel = {}, zwakTel = {};
  for (const id of bron) {
    const e = lem(id);
    /* bouwsteentjes horen hier net zomin thuis als in de voortgangsbalk */
    if (!e || isBouwsteen(id)) continue;
    if (wi.boek !== 'alles' &&
        !(e.komt || []).some(s => s.slice(0, s.lastIndexOf('-')) === wi.boek)) continue;
    const k = sorteersleutel(e.lemma);
    if (wi.zoek.trim() && !k.includes(zoekAr) &&
        !(e.nl || '').toLowerCase().includes(zoekNl)) continue;
    if (wi.soort !== 'alles' && e.cat !== wi.soort) continue;
    if (wi.soort === 'fil') {
      /* wazn: 'I' is heel wazn I, 'I-u' / 'I-i' / 'I-a' één باب daarvan */
      const wz = waznVan(e), bab = babVan(e);
      const waznOk = wi.wazn === 'alles' || wi.wazn === wz || wi.wazn === 'I-' + bab;
      const zwakOk = wi.zwak === 'alles' || zwakVan(e).includes(wi.zwak);
      if (zwakOk) {
        waznTel[wz] = (waznTel[wz] || 0) + 1;
        if (bab) waznTel['I-' + bab] = (waznTel['I-' + bab] || 0) + 1;
      }
      if (waznOk) for (const z of zwakVan(e)) zwakTel[z] = (zwakTel[z] || 0) + 1;
      if (!waznOk || !zwakOk) continue;
    }
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
  balk.appendChild(wiKnoppen('bereik', [['gekend', 'Bekend'], ['moeilijk', 'Moeilijk'], ['alles', 'Alles']]));
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

  /* ---- soort woord, en bij werkwoorden de wazn ---- */
  const balk2 = el('div', 'wi-balk');
  const sk = wiKnoppen('soort', [['alles', 'Alle soorten'], ['ism', 'اسم'], ['fil', 'فعل'], ['harf', 'حرف']]);
  sk.querySelectorAll('.wi-kn').forEach((b, i) => { if (i) b.classList.add('ar-kn'); });
  balk2.appendChild(sk);
  if (wi.soort === 'fil') {
    const wz = el('select', 'les-kies wazn-kies');
    wz.setAttribute('aria-label', 'Filter op wazn');
    wz.style.marginLeft = '0';
    const opt = (waarde, tekst) => {
      const o = document.createElement('option');
      o.value = waarde; o.textContent = tekst;
      if (wi.wazn === waarde) o.selected = true;
      wz.appendChild(o);
    };
    opt('alles', 'Alle wazns');
    for (const [code, madi] of WAZNS) {
      if (waznTel[code] || wi.wazn === code) opt(code, `${code} · ${madi} (${waznTel[code] || 0})`);
      if (code === 'I') for (const b of ['u', 'i', 'a']) {
        const c = 'I-' + b;
        if (waznTel[c] || wi.wazn === c) opt(c, `\u00a0\u00a0\u00a0I · ${BAB[b][0]} (${waznTel[c] || 0})`);
      }
    }
    wz.onchange = () => { wi.wazn = wz.value; teken(); };
    balk2.appendChild(wz);
    /* zwakke werkwoorden */
    const zw = el('select', 'les-kies wazn-kies');
    zw.setAttribute('aria-label', 'Filter op soort werkwoord');
    zw.style.marginLeft = '0';
    const zopt = (waarde, tekst) => {
      const o = document.createElement('option');
      o.value = waarde; o.textContent = tekst;
      if (wi.zwak === waarde) o.selected = true;
      zw.appendChild(o);
    };
    zopt('alles', 'Alle soorten werkwoord');
    /* Arabisch eerst, dan de uitleg, dan het aantal: zo blijft de regel ook
       op een telefoon in de goede volgorde staan */
    const groepen = {};
    for (const [code, ar, vb, nl, groep] of ZWAK) {
      if (!zwakTel[code] && wi.zwak !== code) continue;
      const o = document.createElement('option');
      o.value = code; o.textContent = `${ar} · ${vb} — ${nl} (${zwakTel[code] || 0})`;
      if (wi.zwak === code) o.selected = true;
      if (groep) {
        if (!groepen[groep]) { groepen[groep] = document.createElement('optgroup'); groepen[groep].label = ZWAK_GROEP[groep]; zw.appendChild(groepen[groep]); }
        groepen[groep].appendChild(o);
      } else zw.appendChild(o);
    }
    zw.onchange = () => { wi.zwak = zw.value; teken(); };
    balk2.appendChild(zw);
  }
  blad.appendChild(balk2);
  const metVormen = wi.soort === 'fil' && (wi.wazn !== 'alles' || wi.zwak !== 'alles');
  if (wi.soort === 'fil' && wi.wazn !== 'alles') {
    const bab = wi.wazn.startsWith('I-') ? wi.wazn.slice(2) : null;
    const [code, madi, mud, amr] = WAZNS.find(x => x[0] === (bab ? 'I' : wi.wazn));
    const mudTekst = bab ? BAB[bab][0] : code === 'I' ? 'يَفْعُلُ / يَفْعِلُ / يَفْعَلُ' : mud;
    const amrTekst = bab ? BAB[bab][1] : code === 'I' ? 'اُفْعُلْ / اِفْعِلْ / اِفْعَلْ' : amr;
    blad.appendChild(el('div', 'wazn-patroon',
      `<span class="lbl">ماضٍ</span><span class="ar">${madi}</span>` +
      `<span class="lbl">مُضارِع</span><span class="ar">${mudTekst}</span>` +
      `<span class="lbl">أَمْر</span><span class="ar">${amrTekst}</span>`));
  }

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
    /* De wortels staan op alfabet, dus de letterbalk werkt hier ook: hij
       springt naar de eerste wortel die met die letter begint. */
    let vorig = '';
    for (const w of wortels) {
      const c = sorteersleutel(w)[0] || '';
      const eerste = ALFABET.includes(c) && c !== vorig;
      if (eerste) vorig = c;
      groepen.push({ kop: [...w].join(' '), rijen: bak.get(w), letter: eerste ? c : null });
    }
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

  /* ---- letterbalk ----
     Blijft onder de kop hangen, zodat je van letter naar letter kunt zonder
     eerst helemaal terug te scrollen. Achtentwintig knoppen passen op een
     telefoon niet naast elkaar; in plaats van af te breken schuift de balk
     zijwaarts, en hij schuift zelf mee naar de letter waar je bent. */
  const lb = el('div', 'wi-letters');
  const knoppen = {};
  for (const c of ALFABET) {
    const g = groepen.findIndex(x => x.letter === c);
    const b = el('button', null, c);
    knoppen[c] = b;
    if (g < 0) b.disabled = true;
    else b.onclick = () => {
      const dv = document.getElementById('wi-g' + g);
      if (dv && dv.scrollIntoView) dv.scrollIntoView({ block: 'start', behavior: 'smooth' });
    };
    lb.appendChild(b);
  }
  blad.appendChild(lb);

  /* ---- de lijst zelf ----
     In één keer als HTML-tekst opgebouwd en met één klikafhandelaar op de
     omhulling: bij drieduizend regels is een knoop per woord te traag. */
  const stukken = [];
  groepen.forEach((g, i) => {
    const rs = g.rijen.map(r =>
      `<button class="wi-rij c-${r.e.cat}${metVormen ? ' ww' : ''}" data-id="${esc(r.id)}">` +
      (metVormen
        ? `<span class="wi-vormen"><span class="wi-ar">${esc(r.e.madi || r.e.lemma)}</span>` +
          `<span class="wi-ar">${esc(r.e.mudari || '')}</span><span class="wi-ar">${esc(r.e.amr || '')}</span></span>`
        : `<span class="wi-ar">${esc(r.e.lemma)}</span>`) +
      `<span class="wi-nl">${esc(r.e.nl || '')}</span>` +
      (S.moeilijk.has(r.id) ? '<span class="wi-ml" aria-label="moeilijk"></span>' : '') +
      '</button>').join('');
    stukken.push(
      `<div class="wi-groep" id="wi-g${i}">` +
      `<div class="wi-kop"><span class="${g.plat ? '' : 'lt'}">${esc(g.kop)}</span>` +
      `<span class="tel">${g.rijen.length}</span></div>` +
      `<div class="wi-rijen">${rs}</div></div>`);
  });
  const wrap = el('div', 'woordindex' + (metVormen ? ' met-vormen' : ''), stukken.join(''));
  wrap.onclick = ev => {
    const b = ev.target.closest('.wi-rij');
    if (b) toonWoord([b.dataset.id], null, null, null, null);
  };
  blad.appendChild(wrap);

  /* welke letter is in beeld? die lichten we op in de balk */
  if (wiKijker) { wiKijker.disconnect(); wiKijker = null; }
  if (typeof IntersectionObserver !== 'undefined') {
    const bij = {};
    groepen.forEach((g, i) => { if (g.letter) bij['wi-g' + i] = g.letter; });
    const merkLetter = c => {
      for (const k in knoppen) knoppen[k].classList.toggle('aan', k === c);
      const b = knoppen[c];
      if (b && b.scrollIntoView) b.scrollIntoView({ block: 'nearest', inline: 'center' });
    };
    wiKijker = new IntersectionObserver(lijst => {
      const raak = lijst.filter(x => x.isIntersecting);
      if (!raak.length) return;
      raak.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      const c = bij[raak[0].target.id];
      if (c) merkLetter(c);
    }, { rootMargin: '-' + (kopHoogte() + 56) + 'px 0px -80% 0px' });
    setTimeout(() => {
      for (const id in bij) {
        const dv = document.getElementById(id);
        if (dv) wiKijker.observe(dv);
      }
    }, 0);
  }
  return blad;
}

/* ---------------- schermen ---------------- */
/* ---------------- waar je precies was ----------------
   Per apparaat (niet online): het scherm, de oefening en hoe ver je daarin
   was (ronde, vraag, gekozen antwoord), de zin bij spreken en hoe ver je naar
   beneden was gescrold. Bij het openen kom je daar precies terug, zolang je
   in dezelfde les bent. */
const PLEK = () => 'qirat.plek.' + (Opslag.gebruiker || 'los');
const PLEK_VELDEN = ['ovModus', 'ov', 'paren', 'flits', 'zb', 'vv', 'losRonde', 'zin', 'open', 'klaar',
                     'oefenIdx', 'vraag', 'antwoord', 'wTab'];
let plekKlaar = false, plekTijd = null;
function bewaarPlek() {
  if (!plekKlaar) return;
  clearTimeout(plekTijd);
  const p = { boek: S.boek, les: S.les, stap: S.stap, scherm: S.scherm, reeks: S.reeks, hfd: S.hfd,
              wi: S.wi, y: Math.round(window.scrollY) };
  for (const v of PLEK_VELDEN) p[v] = S[v];
  try { localStorage.setItem(PLEK(), JSON.stringify(p)); } catch (e) { /* vol of geen opslag */ }
}
function planPlek() {
  if (!plekKlaar) return;
  clearTimeout(plekTijd);
  plekTijd = setTimeout(bewaarPlek, 500);
}
/* geeft de scrollpositie terug, of null als er niets te herstellen viel */
function herstelPlek() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(PLEK()) || 'null'); } catch (e) { p = null; }
  if (!p) return null;
  if (p.wi) Object.assign(S.wi, p.wi);
  if (['lijst', 'reeks', 'boek'].includes(p.scherm)) { S.scherm = p.scherm; S.reeks = p.reeks; S.hfd = p.hfd; }
  if (p.boek !== S.boek || p.les !== S.les) return S.scherm !== 'les' ? p.y || 0 : null;
  if (typeof p.stap === 'number' && p.stap >= 0 && p.stap <= 5) S.stap = p.stap;
  for (const v of PLEK_VELDEN) if (p[v] !== undefined && p[v] !== null) S[v] = p[v];
  if (!S.vv) S.vv = {};
  if (!S.oefenIdx) S.oefenIdx = {};
  return p.y || 0;
}
addEventListener('scroll', planPlek, { passive: true });
addEventListener('pagehide', bewaarPlek);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') bewaarPlek(); });

function teken() {
  planPlek();
  Lees.lijst = [];
  queueMicrotask(tekenLeesPaneel);
  tekenKop();
  /* dun randje bovenaan in de kleur van het boek, behalve in Mijn woorden en
     in het overzicht van een hele reeks */
  const bk = S.scherm === 'lijst' || S.scherm === 'reeks' ? '' : (BOEK_KLEUR[S.boek] || '');
  document.documentElement.style.setProperty('--boek', bk || 'transparent');
  const m = document.getElementById('main');
  m.innerHTML = '';

  /* Mijn woorden staat naast de lessen, niet erin: geen les nodig */
  if (S.scherm === 'lijst') { m.appendChild(tekenIndex()); return; }
  if (S.scherm === 'boek') { m.appendChild(tekenOverzicht()); return; }
  if (S.scherm === 'reeks') { m.appendChild(tekenReeks()); return; }

  const L = les(S.les);
  const sp = splitsLes(S.les);
  /* "Extra teksten" bestaat niet in een les zonder oefenteksten */
  if (S.stap === 3 && !heeftExtra()) S.stap = 4;

  /* ---- stap 1: lezen en aanklikken ---- */
  if (S.stap === 0) {
    const blad = tekenTekst(L.zinnen, lesKern(L.titel),
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
      S.gelezen.add(lesSleutel()); S.geklikt = new Set(); S.stap = 1;
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
    m.appendChild(tekenLijst('Woorden — les ' + lesInHoofdstuk(S.les), '',
      () => volgendeKnop('Naar de oefeningen', 2)));
    const md = tekenMoeilijk(); if (md) m.appendChild(md);
  }

  /* ---- stap 3: oefeningen ---- */
  else if (S.stap === 2) m.appendChild(tekenOefening());

  /* ---- stap 4: vaste oefenteksten ---- */
  else if (S.stap === 3) {
    const vast = L.oefen || [];
    const idx = Math.min(S.oefenIdx[lesSleutel()] || 0, Math.max(0, vast.length - 1));
    const blad = el('div', 'blad');
    blad.appendChild(el('h2', null, 'Extra teksten'));

    /* nog geen oefenteksten: geen lege knoppenrij en geen leeg keuzemenu */
    if (!vast.length) {
      blad.appendChild(el('p', 'leeg', 'Deze les heeft nog geen oefenteksten.'));
      m.appendChild(blad);
      return;
    }

    const rij = el('div', 'oefen-rij');
    vast.forEach((t, k) => {
      const b = el('button', 'oefen-knop' + (k === idx ? ' nu' : ''));
      b.innerHTML = `<span class="ok-nr">${k + 1}</span><span class="ok-titel">${esc(t.titel)}</span>`;
      b.onclick = () => { S.oefenIdx[lesSleutel()] = k; teken(); window.scrollTo(0, 0); };
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
    kz.onchange = () => { S.oefenIdx[lesSleutel()] = Number(kz.value); teken(); window.scrollTo(0, 0); };
    blad.appendChild(kz);
    m.appendChild(blad);

    if (vast[idx]) {
      const t = vast[idx];
      m.appendChild(tekenTekst(t.zinnen, t.titel,
        '', false, new Set(t.nieuw || [])));
    }
    const volgX = lesLijst().find(l => l.nr === S.les + 1);
    if (volgX) {
      const a = el('div', 'acties');
      const b = el('button', 'knop', 'Naar de volgende les');
      b.onclick = () => gaNaar(S.boek, volgX.nr);
      a.appendChild(b); m.appendChild(a);
    }
  }

  /* ---- stap 5: zinnen zeggen ---- */
  else if (S.stap === 4) {
    m.appendChild(tekenZinnen());
  }

  /* ---- stap 6: nog eens lezen ---- */
  else if (S.stap === 5) {
    const blad = tekenTekst(L.zinnen, lesKern(L.titel),
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
      S.afgerond.add(lesSleutel());
      S.geklikt = new Set();
      const volg = lesLijst().find(l => l.nr === S.les + 1);
      bewaar();
      if (heeftExtra()) { S.stap = 3; teken(); window.scrollTo(0, 0); return; }
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

document.getElementById('btnOverzicht').onclick = () => {
  S.scherm = S.scherm === 'boek' ? 'les' : 'boek'; S.hfd = null;
  teken(); window.scrollTo(0, 0);
};
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

document.getElementById('btnWis').onclick = async () => {
  if (!confirm('Weet je het zeker?\n\nAl je voortgang wordt gewist: bekende woorden, ' +
      'moeilijke woorden en afgeronde lessen. Dit kan niet ongedaan worden.' +
      (Wolk.klaar ? '\n\nOok online, en dus op al je apparaten.' : ''))) return;
  localStorage.removeItem(Opslag.sleutel());
  S.gekend = new Set(); S.afgerond = new Set(); S.moeilijk = new Set();
  S.gelezen = new Set(); S.geklikt = new Set(); S.oefen = {}; S.score = {}; S.hints = {};
  S.ov = null; S.paren = null; S.flits = null; S.zb = null; S.vv = {};
  /* het moment van wissen bewaren: andere apparaten met oude voortgang zien
     zo dat die weg moet, in plaats van hem terug te zetten */
  S.gewist = Date.now();
  Opslag.schrijf(pak());
  /* ook online leegmaken: anders zet het samenvoegen alles zo weer terug */
  if (Wolk.klaar) { clearTimeout(Wolk.tijd); await Wolk.duw(); }
  teken();
};

document.getElementById('btnWie').onclick = () => toonInlog();
['btnLees', 'btnLeesMob'].forEach(id => {
  const k = document.getElementById(id);
  if (k) k.onclick = () => { Lees.open = !Lees.open; tekenLeesPaneel(); };
});
document.getElementById('btnMenu').onclick = () => wisselMenu('menu-open');
document.getElementById('btnStap').onclick = () => wisselMenu('stap-open');
/* een keuze in het menu maken sluit het; zoom en donker niet, die probeer je vaak een paar keer */
['lesKies', 'boekKies'].forEach(id => document.getElementById(id).addEventListener('change', sluitMenus));
['btnIndex', 'btnWie', 'btnOverzicht'].forEach(id => document.getElementById(id).addEventListener('click', sluitMenus));
/* tik je in de tekst, dan gaat wat openstaat dicht */
document.getElementById('main').addEventListener('click', sluitMenus);

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
    /* en precies waar je was: oefening, vraag, scrollpositie */
    const y = herstelPlek();
    keurGeklikt();
    pasWeergaveToe();
    teken();
    if (y) {
      /* de pagina is pas helemaal hoog als de lettertypes er zijn */
      const zet = () => { if (window.scrollY < y - 20) window.scrollTo(0, y); };
      requestAnimationFrame(zet);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(zet);
      setTimeout(zet, 500);
    }
    plekKlaar = true;
    /* pas nu de wolk: de app staat er al, ingelogd of niet */
    if (!Wolk.start()) Wolk.staat('fout', 'niet gekoppeld — alleen dit apparaat');
  } catch (e) {
    document.getElementById('main').innerHTML =
      '<div class="blad"><div class="fout">Kon de gegevens niet laden: ' + esc(e.message) +
      '</div></div>';
  }
})();
