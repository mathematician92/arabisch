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
  geklikt: new Set(),     // wat je in dit scherm hebt aangeklikt als onbekend
  gelezen: new Set(),     // lesnummers waarvan stap 1 is afgerond
  afgerond: new Set(),    // lesnummers die je hebt afgerond
  oefen: {},              // {lesnr: [gegenereerde teksten]}
  oefenIdx: {},           // welke oefentekst je nu bekijkt
  bezig: false,
  fout: '',
  zoom: 1,         // tekstgrootte van de Arabische tekst
  donker: false,   // donkere modus
  vraag: null,     // huidige oefenvraag
  antwoord: null,  // gegeven antwoord
  score: {},       // {lesnr: {lemma-id: aantal keer goed}}
  zin: 0,          // welke zin je nu oefent
  hints: {},       // {lesnr: {zinindex: aantal gevraagde woorden}}
  open: 0,         // hoeveel woorden nu onthuld zijn
  klaar: false,    // hele zin zichtbaar
  lades: {},       // welke laden openstaan (niet bewaard: standaard dicht)
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

function laad() {
  try {
    const r = Opslag.lees();
    /* eenmalige overname van de oude opslag */
    if (!Object.keys(r).length) {
      const oud = localStorage.getItem('qirat.v1');
      if (oud) Object.assign(r, JSON.parse(oud));
    }
    S.gekend = new Set(r.gekend || []);
    S.afgerond = new Set(r.afgerond || []);
    S.oefen = r.oefen || {};
    S.hints = r.hints || {};
    S.moeilijk = new Set(r.moeilijk || []);
    S.gelezen = new Set(r.gelezen || []);
    S.score = r.score || {};
  } catch (e) { /* eerste keer */ }
}
function bewaar() {
  Opslag.schrijf({
    gekend: [...S.gekend], afgerond: [...S.afgerond], oefen: S.oefen, hints: S.hints,
    moeilijk: [...S.moeilijk], gelezen: [...S.gelezen], score: S.score,
    boek: S.boek, les: S.les,
  });
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
    o.value = L.nr; o.textContent = 'Les ' + L.nr;
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
      S.stap = i; S.antwoord = null; teken(); window.scrollTo(0, 0);
    };
    st.appendChild(b);
  });
}

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
  blad.appendChild(el('h2', null, titel));
  if (sub) blad.appendChild(el('p', 'sub', sub));
  const t = el('div', 'tekst');
  zinnen.forEach((z, zi) => {
    const span = el('span', 'zin');
    span.dataset.zin = zi;
    z.woorden.forEach((w, wi) => {
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
    t.appendChild(span);
    if ((z.eind || '').includes('\n')) t.appendChild(el('br'));
  });
  blad.appendChild(t);
  return blad;
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
      const s = el(i === wi ? 'b' : 'span', null, esc(w.w));
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
    d.appendChild(el('div', 'lemma-groot ar', esc(e.lemma)));
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

/* ---------------- schermen ---------------- */
function teken() {
  tekenKop();
  const m = document.getElementById('main');
  m.innerHTML = '';
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
  localStorage.setItem('qirat.weergave', JSON.stringify({ zoom: S.zoom, donker: S.donker }));
  pasWeergaveToe();
}

/* ---------------- start ---------------- */
try {
  const wg = JSON.parse(localStorage.getItem('qirat.weergave') || '{}');
  S.zoom = wg.zoom || 1; S.donker = !!wg.donker;
} catch (e) { /* eerste keer */ }

document.getElementById('btnIn').onclick =
  () => stelWeergaveIn('zoom', Math.min(1.6, Math.round(((S.zoom || 1) + 0.15) * 100) / 100));
document.getElementById('btnUit').onclick =
  () => stelWeergaveIn('zoom', Math.max(0.75, Math.round(((S.zoom || 1) - 0.15) * 100) / 100));
document.getElementById('btnDonker').onclick = () => stelWeergaveIn('donker', !S.donker);
pasWeergaveToe();

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
  const b = new Blob([localStorage.getItem(SLEUTEL) || '{}'], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = 'qirat-voortgang.json'; a.click();
};
document.getElementById('btnWis').onclick = () => {
  if (!confirm('Alle voortgang wissen?')) return;
  localStorage.removeItem(SLEUTEL);
  S.gekend = new Set(); S.afgerond = new Set(); S.moeilijk = new Set();
  S.gelezen = new Set(); S.geklikt = new Set(); S.oefen = {}; S.score = {}; S.hints = {};
  teken();
};

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
    laad();
    const r = Opslag.lees();
    if (r.boek && S.index.boeken.some(b => b.id === r.boek)) S.boek = r.boek;
    const eerste = lesLijst()[0];
    const start = (r.les && lesLijst().some(l => l.nr === r.les)) ? r.les : (eerste || {}).nr;
    if (!window.__DATA__) await laadLes(S.boek, start);
    S.les = start;
    pasWeergaveToe();
    teken();
  } catch (e) {
    document.getElementById('main').innerHTML =
      '<div class="blad"><div class="fout">Kon de gegevens niet laden: ' + esc(e.message) +
      '</div></div>';
  }
})();
