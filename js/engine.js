/* =========================================================================
   engine.js — moteur de simulation : demande, exploitation, concurrence,
   finances, événements, victoire / faillite.
   ========================================================================= */

const G = {
  s: null,               // état de la partie
  demandCache: new Map(),
  listeners: {},

  on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
  emit(ev, a, b) { (this.listeners[ev] || []).forEach(f => f(a, b)); }
};

/* Réglage de difficulté de la partie en cours. */
function DIFF() {
  return (G.s && DIFFICULTIES[G.s.diff]) || DIFFICULTIES.normal;
}
G.DIFF = DIFF;

/* ------------------------------- géométrie ------------------------------- */
function distKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const s = Math.sin(dLat/2)**2 +
            Math.cos(a.lat*rad) * Math.cos(b.lat*rad) * Math.sin(dLon/2)**2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(s))));
}
function pairKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }
function refPrice(d) { return BAL.PRICE_A + BAL.PRICE_B * d; }

/* -------------------------- demande d'une liaison ------------------------ */
function baseDemand(codeA, codeB) {
  const k = pairKey(codeA, codeB);
  let v = G.demandCache.get(k);
  if (v !== undefined) return v;

  const ca = CITY_BY_CODE[codeA], cb = CITY_BY_CODE[codeB];
  const d = distKm(ca, cb);
  if (d < BAL.MIN_DISTANCE) { G.demandCache.set(k, null); return null; }

  const sz    = Math.pow(ca.size * cb.size, 0.86);
  const decay = 1 / (1 + Math.pow(d / BAL.DEMAND_HALF, 1.30));
  const prox  = ca.country === cb.country ? 1.85 : (ca.region === cb.region ? 1.30 : 1.0);
  const bizI  = ca.biz * cb.biz, tourI = ca.tour * cb.tour;

  const total = BAL.DEMAND_K * sz * decay * prox * (0.55 + 0.60 * bizI + 0.55 * tourI);
  const longF = 0.70 + 0.50 * Math.min(1, d / 9000);
  const fBiz  = (0.050 + 0.145 * bizI) * longF;
  const fFst  = (0.008 + 0.030 * bizI) * longF;

  const cargo = BAL.CARGO_K * sz * (0.40 + 0.80 * bizI) / (1 + Math.pow(d / 6000, 0.9));

  v = {
    dist: d,
    eco:   total * (1 - fBiz - fFst),
    biz:   total * fBiz,
    first: total * fFst,
    total: total,
    cargoT: cargo,
    price: refPrice(d)
  };
  G.demandCache.set(k, v);
  return v;
}

/* ------------------------- capacité d'un appareil ------------------------ */
function seatsOf(type, cabinId) {
  if (type.seats === 0) return {eco:0, biz:0, first:0, total:0};
  const c = CABINS[cabinId] || CABINS.standard;
  const eco   = Math.round(type.seats * c.eco);
  const biz   = Math.round(type.seats * c.biz   / BAL.CLASS_SPACE.biz);
  const first = Math.round(type.seats * c.first / BAL.CLASS_SPACE.first);
  return {eco, biz, first, total: eco + biz + first};
}
function blockHours(type, dist) { return dist / type.speed + type.turn; }
function legsPerDay(type, dist) {
  const bh = blockHours(type, dist);
  return Math.max(0, Math.min(14, Math.floor(BAL.UTIL_HOURS / bh)));
}

/* ========================================================================= */
/*                            CRÉATION DE PARTIE                             */
/* ========================================================================= */
G.newGame = function (airlineName, homeCode, diff) {
  const D = DIFFICULTIES[diff] || DIFFICULTIES.normal;
  const s = {
    version: 1,
    diff: D.id,
    airline: {name: airlineName || 'Skyline', color: '#1f4e79'},
    home: homeCode,
    day: 0, y: BAL.START_YEAR, m: 0, d: 1,
    cash: D.cash,
    profitStreak: 0, yearProfit: 0,
    rep: BAL.REP_START,
    loans: [],
    slots: {},
    hubs: [homeCode],
    fleet: [], routes: [], nextId: 1,
    programs: {},
    rivals: [],
    mods: {fuel:1, demand:1, region:null, regionMult:1, closed:null,
           hotCity:null, hotMult:1, acPrice:1, fees:1},
    events: [],
    history: [],
    month: null,
    today: {rev:0, cost:0, pax:0},
    negDays: 0,
    totals: {pax:0, flights:0},
    won: false, dead: false,
    log: []
  };
  s.month = newMonth();
  s.slots[homeCode] = 6;

  // flotte de départ : deux moyen-courriers
  G.s = s;
  for (let i = 0; i < 2; i++) addAircraft('a320', true);
  G.demandCache.clear();
  initRivals();
  pushLog('Bienvenue', 'Votre compagnie décolle depuis ' + CITY_BY_CODE[homeCode].name +
          '. Créez vos premières lignes en cliquant deux villes sur la carte.', 'good');
  return s;
};

function initRivals() {
  const s = G.s;
  s.rivals = RIVAL_DEFS.map(def => {
    const r = Object.assign({}, def, {routes: [], paxDay: 0, revYear: 0});
    // réseau initial : liaisons depuis le hub vers les grandes villes des régions couvertes
    const home = CITY_BY_CODE[def.home];
    const cand = CITIES.filter(c => c.code !== def.home && def.regions.indexOf(c.region) >= 0)
      .map(c => ({c, sc: (baseDemand(def.home, c.code) || {total:0}).total}))
      .sort((a, b) => b.sc - a.sc).slice(0, 16);
    cand.forEach((x, i) => {
      if (x.sc < 60) return;
      r.routes.push({
        a: def.home, b: x.c.code,
        freq: Math.max(1, Math.round(2 + 5 * Math.exp(-i / 5))),
        price: def.priceMult,
        seats: 160 + Math.round(120 * Math.exp(-i / 6))
      });
    });
    // quelques lignes transversales, hors du hub
    const pool = CITIES.filter(c => def.regions.indexOf(c.region) >= 0 && c.code !== def.home)
      .sort((x, y) => y.size - x.size).slice(0, 12);
    for (let i = 0; i < pool.length - 1 && r.routes.length < 26; i += 2) {
      const A = pool[i], B = pool[i + 1];
      const dm = baseDemand(A.code, B.code);
      if (!dm || dm.total < 120) continue;
      if (r.routes.some(rt => pairKey(rt.a, rt.b) === pairKey(A.code, B.code))) continue;
      r.routes.push({a: A.code, b: B.code, freq: 3, price: def.priceMult, seats: 190});
    }
    return r;
  });
  rebuildRivalIndex();
}

/* index : clé de paire → liste des concurrents présents */
let RIVAL_IDX = new Map();
function rebuildRivalIndex() {
  RIVAL_IDX = new Map();
  G.s.rivals.forEach(r => r.routes.forEach(rt => {
    const k = pairKey(rt.a, rt.b);
    if (!RIVAL_IDX.has(k)) RIVAL_IDX.set(k, []);
    RIVAL_IDX.get(k).push({r, rt});
  }));
}

/* ========================================================================= */
/*                                  ACTIONS                                  */
/* ========================================================================= */
/* Chaque entrée du journal porte sa date de jeu et sa rubrique, pour être
   relue et filtrée plus tard. La rubrique se déduit du titre : ils forment un
   ensemble fini, et les inscrire une par une aux vingt appels n'apprendrait
   rien de plus au lecteur. `stop` marque les nouvelles qui méritent qu'on
   arrête la partie pour les lire. */
const LOG_CATS = {
  'Livraison':'flotte', 'Vente':'flotte', 'Révision':'flotte',
  'Révision programmée':'flotte', 'Révision terminée':'flotte',
  'Usure élevée':'flotte', 'Immobilisation':'flotte',
  'Amélioration installée':'flotte', 'Programme lancé':'flotte',
  'Créneau acquis':'réseau', 'Nouveau hub':'réseau', 'Ligne ouverte':'réseau',
  'Ligne fermée':'réseau', 'Ligne en service':'réseau',
  'Emprunt':'finances', 'Emprunt soldé':'finances',
  'Alerte trésorerie':'finances', 'Exercice clos':'finances',
  'Concurrence':'concurrence', 'Bienvenue':'divers', 'Retour à la normale':'événement'
};
const LOG_STOP = {'Immobilisation':1, 'Alerte trésorerie':1};

function pushLog(title, text, kind) {
  const s = G.s;
  const e = {t: title, x: text, k: kind || '', day: s.day,
             y: s.y, m: s.m, d: s.d,
             cat: LOG_CATS[title] || (kind === 'evt' ? 'événement' : 'divers'),
             stop: !!LOG_STOP[title]};
  s.log.unshift(e);
  if (s.log.length > 240) s.log.pop();
  G.emit('log', e);
  if (e.stop) G.emit('attention', e);
}

function regFor() {
  const n = G.s.nextId;
  return 'F-' + String.fromCharCode(72 + (n % 18)) + String.fromCharCode(65 + ((n * 7) % 26)) +
         String.fromCharCode(65 + ((n * 13) % 26)) + String.fromCharCode(65 + ((n * 3) % 26));
}

function addAircraft(typeId, free) {
  const s = G.s, t = AC_BY_ID[typeId];
  const price = Math.round(t.price * s.mods.acPrice);
  if (!free) {
    if (s.cash < price) return {ok:false, why:'Trésorerie insuffisante.'};
    s.cash -= price;
  }
  const ac = {
    id: s.nextId++, type: typeId, reg: regFor(),
    cabin: t.seats ? 'standard' : 'cargo',
    wear: 0, ageM: 0, routeId: null, status: 'idle', maintLeft: 0, mods: [],
    phase: Math.random(), dir: 1, paid: free ? t.price : price
  };
  s.fleet.push(ac);
  return {ok:true, ac};
}
G.buyAircraft = function (typeId) {
  const r = addAircraft(typeId, false);
  if (r.ok) pushLog('Livraison', AC_BY_ID[typeId].name + ' immatriculé ' + r.ac.reg +
                    ' rejoint la flotte.', 'good');
  return r;
};
G.sellAircraft = function (acId) {
  const s = G.s, i = s.fleet.findIndex(a => a.id === acId);
  if (i < 0) return;
  const ac = s.fleet[i];
  if (ac.routeId) G.unassign(acId);
  const v = Math.round(acValue(ac) * 0.88);
  s.cash += v;
  s.fleet.splice(i, 1);
  pushLog('Vente', ac.reg + ' cédé pour ' + money(v) + '.', '');
};
function acValue(ac) {
  const t = AC_BY_ID[ac.type];
  const base = t.price * Math.pow(1 - BAL.DEPRECIATION, ac.ageM) * (1 - 0.25 * Math.min(1, ac.wear));
  // les rétrofits se revendent mal : on n'en récupère qu'une part
  return base + (ac.modPaid || 0) * 0.45 * Math.pow(1 - BAL.DEPRECIATION, ac.ageM);
}

/* ------------------------------- créneaux -------------------------------- */
/* Les créneaux détenus, horaires creux compris : pour poser un avion, un
   créneau à six heures du matin en vaut un autre. Ce qu'il coûte en
   attractivité se règle ailleurs, dans `offPeakPenalty`. */
function slotsOwned(code) {
  return (G.s.slots[code] || 0) + ((G.s.slotsOff || {})[code] || 0);
}
function slotsPeak(code) { return G.s.slots[code] || 0; }
function slotsUsed(code) {
  let n = 0;
  G.s.routes.forEach(r => { if (r.a === code || r.b === code) n += r.ac.length; });
  return n;
}
function rivalSlots(code) {   /* occupation estimée des concurrents */
  let n = 0;
  G.s.rivals.forEach(r => r.routes.forEach(rt => {
    if (rt.a === code || rt.b === code) n += Math.ceil(rt.freq / 3);
  }));
  return n;
}
/* Capacité effective d'un aéroport : la difficulté la resserre. */
function slotsTotal(code) {
  return Math.max(4, Math.round(CITY_BY_CODE[code].slots * DIFF().slotCap)) +
         ((G.s && G.s.slotsAdd) ? (G.s.slotsAdd[code] || 0) : 0);
}
G.slotsTotal = slotsTotal;

function slotsFree(code) {
  return Math.max(0, slotsTotal(code) - rivalSlots(code) - slotsPeak(code));
}
function slotCost(code) {
  const c = CITY_BY_CODE[code];
  return Math.round((BAL.SLOT_BASE + BAL.SLOT_SIZE * c.size) * DIFF().slotPrice *
                    (1 + 0.35 * (1 - slotsFree(code) / Math.max(1, slotsTotal(code)))));
}

/* Réputation exigée pour obtenir un créneau. Les grandes plateformes ne
   traitent pas avec une compagnie inconnue ; la base d'attache fait exception,
   sans quoi la partie serait bloquée dès le premier jour. */
function slotMinRep(code) {
  const g = DIFF().repGate;
  if (!g || code === G.s.home) return 0;
  const sz = CITY_BY_CODE[code].size;
  if (sz >= 0.88) return Math.round(62 * g);
  if (sz >= 0.72) return Math.round(52 * g);
  if (sz >= 0.56) return Math.round(42 * g);
  return 0;
}
G.slotMinRep = slotMinRep;

G.buySlot = function (code) {
  const s = G.s, cost = slotCost(code);
  const need = slotMinRep(code);
  if (need && s.rep < need)
    return {ok:false, why: CITY_BY_CODE[code].name + ' n’accorde de créneau qu’aux compagnies ' +
            'de réputation ' + need + ' ou plus. La vôtre est de ' + Math.round(s.rep) + '.'};
  if (slotsFree(code) <= 0) return {ok:false, why:'Plus aucun créneau disponible ici.'};
  if (s.cash < cost) return {ok:false, why:'Trésorerie insuffisante.'};
  s.cash -= cost;
  s.slots[code] = slotsOwned(code) + 1;
  pushLog('Créneau acquis', CITY_BY_CODE[code].name + ' — ' + money(cost) + '.', '');
  return {ok:true};
};
G.hubCost = function (code) {
  return Math.round(BAL.HUB_BASE + BAL.HUB_SIZE * CITY_BY_CODE[code].size);
};
G.makeHub = function (code) {
  const s = G.s;
  if (s.hubs.indexOf(code) >= 0) return {ok:false, why:'Déjà un hub.'};
  if (s.hubs.length >= BAL.MAX_HUBS) return {ok:false, why:'Nombre maximal de hubs atteint (' + BAL.MAX_HUBS + ').'};
  const cost = G.hubCost(code);
  if (s.cash < cost) return {ok:false, why:'Trésorerie insuffisante.'};
  s.cash -= cost;
  s.hubs.push(code);
  pushLog('Nouveau hub', CITY_BY_CODE[code].name + ' devient un hub : redevances réduites et correspondances possibles.', 'good');
  return {ok:true};
};

/* ===================== sortir d'un aéroport saturé ======================= */
/* Un grand aéroport finit par n'avoir plus rien à vendre. Trois portes restent
   ouvertes, de la moins chère à la plus chère :

   — les créneaux en heure creuse : toujours disponibles, moitié prix, mais un
     vol à six heures du matin attire moins de monde ;
   — l'agrandissement : on finance des travaux, très cher, et on attend des
     mois avant d'en voir la couleur ;
   — le rachat à une compagnie installée : immédiat, hors de prix, et elle peut
     refuser.

   Ces trois voies laissent la rareté intacte — elles la rendent négociable. */

function slotsOff(code) { return (G.s.slotsOff || {})[code] || 0; }
function slotsAdd(code) { return (G.s.slotsAdd || {})[code] || 0; }

/* Capacité en heure creuse : une marge que personne ne se dispute, parce que
   personne n'en veut vraiment. */
function offPeakCap(code) {
  return Math.round(slotsTotal(code) * BAL.OFFPEAK_SHARE);
}
function offPeakFree(code) { return Math.max(0, offPeakCap(code) - slotsOff(code)); }
function offPeakCost(code) { return Math.round(slotCost(code) * BAL.OFFPEAK_PRICE); }
G.offPeakCap = offPeakCap;
G.offPeakFree = offPeakFree;
G.offPeakCost = offPeakCost;

/* Part de vos vols posés sur un horaire creux à cette escale. Les bons
   créneaux servent d'abord : un horaire creux acheté d'avance ne pénalise rien
   tant qu'aucun appareil supplémentaire ne s'en sert. */
function offPeakShare(code) {
  const used = slotsUsed(code);
  if (used <= 0) return 0;
  return Math.min(1, Math.max(0, used - slotsPeak(code)) / used);
}
G.offPeakShare = offPeakShare;

/* Ce que les horaires creux coûtent en attractivité sur une liaison : la
   moyenne des deux escales, plafonnée par BAL.OFFPEAK_MALUS. */
function offPeakPenalty(a, b) {
  return 1 - BAL.OFFPEAK_MALUS * (offPeakShare(a) + offPeakShare(b)) / 2;
}
G.offPeakPenalty = offPeakPenalty;

G.buyOffPeak = function (code) {
  const s = G.s, cost = offPeakCost(code);
  if (offPeakFree(code) <= 0) return {ok:false, why:'Plus aucun horaire creux disponible ici.'};
  if (s.cash < cost) return {ok:false, why:'Trésorerie insuffisante.'};
  s.cash -= cost;
  if (!s.slotsOff) s.slotsOff = {};
  s.slotsOff[code] = slotsOff(code) + 1;
  pushLog('Créneau acquis', CITY_BY_CODE[code].name + ', en heure creuse — ' + money(cost) +
          '. Vos vols y seront moins attractifs qu’aux heures de pointe.', '');
  return {ok:true};
};

/* ----------------------------- agrandissement ---------------------------- */
G.expandCost = function (code) {
  const c = CITY_BY_CODE[code];
  return Math.round((BAL.EXPAND_BASE + BAL.EXPAND_SIZE * c.size) * DIFF().slotPrice);
};
G.expandGain = function (code) {
  return Math.max(3, Math.round(slotsTotal(code) * BAL.EXPAND_GAIN));
};
G.expandMonths = function (code) {
  return Math.round(BAL.EXPAND_MONTHS_BASE + BAL.EXPAND_MONTHS_SIZE * CITY_BY_CODE[code].size);
};
G.worksAt = function (code) {
  return (G.s.works || []).find(w => w.code === code) || null;
};
G.expandAirport = function (code) {
  const s = G.s, cost = G.expandCost(code);
  if (G.worksAt(code)) return {ok:false, why:'Des travaux sont déjà en cours ici.'};
  if (s.cash < cost) return {ok:false, why:'Trésorerie insuffisante.'};
  s.cash -= cost;
  if (!s.works) s.works = [];
  const w = {code: code, left: G.expandMonths(code), add: G.expandGain(code)};
  s.works.push(w);
  pushLog('Travaux lancés', CITY_BY_CODE[code].name + ' — ' + money(cost) + ' engagés pour ' +
          w.add + ' créneaux de plus dans ' + w.left + ' mois.', '');
  return {ok:true, works:w};
};

/* Avance les chantiers d'un mois. Appelé à la clôture. */
function worksTurn() {
  const s = G.s;
  if (!s.works || !s.works.length) return;
  for (let i = s.works.length - 1; i >= 0; i--) {
    const w = s.works[i];
    if (--w.left > 0) continue;
    if (!s.slotsAdd) s.slotsAdd = {};
    s.slotsAdd[w.code] = slotsAdd(w.code) + w.add;
    s.works.splice(i, 1);
    pushLog('Travaux livrés', CITY_BY_CODE[w.code].name + ' gagne ' + w.add +
            ' créneaux. Les compagnies installées vont s’en disputer une partie.', 'good');
    G.emit('works', {code: w.code, add: w.add});
  }
}

/* -------------------------- rachat à un concurrent ----------------------- */
/* Une compagnie ne cède un créneau que si elle y perd peu et si vous pesez
   quelque chose. Le prix suit ce qu'elle y gagne, pas le tarif de l'aéroport. */
G.slotOffers = function (code) {
  const s = G.s, out = [];
  s.rivals.forEach(rv => {
    const here = rv.routes.filter(rt => rt.a === code || rt.b === code);
    if (!here.length) return;
    const slots = here.reduce((t, rt) => t + Math.ceil(rt.freq / 3), 0);
    if (slots < 2) return;                       // on ne vide pas une compagnie
    // elle lâche d'abord sa liaison la moins fréquentée d'ici
    const give = here.slice().sort((x, y) => x.freq - y.freq)[0];
    const dem = baseDemand(give.a, give.b);
    const worth = dem ? dem.total * dem.price / 1000 : 0;
    const price = Math.round(slotCost(code) * (BAL.SLOT_RESALE + worth / 4e4) * DIFF().slotPrice);
    const need = Math.round(BAL.SLOT_RESALE_REP * (1 + CITY_BY_CODE[code].size));
    out.push({rival: rv, slots: slots, route: give, price: price, minRep: need,
              ok: s.rep >= need, other: CITY_BY_CODE[give.a === code ? give.b : give.a]});
  });
  return out.sort((a, b) => a.price - b.price);
};

G.buySlotFrom = function (code, rivalName) {
  const s = G.s;
  const offer = G.slotOffers(code).find(o => o.rival.name === rivalName);
  if (!offer) return {ok:false, why:'Cette compagnie n’a plus rien à céder ici.'};
  if (!offer.ok)
    return {ok:false, why: offer.rival.name + ' ne traite qu’avec les compagnies de réputation ' +
            offer.minRep + ' ou plus. La vôtre est de ' + Math.round(s.rep) + '.'};
  if (s.cash < offer.price) return {ok:false, why:'Trésorerie insuffisante.'};

  s.cash -= offer.price;
  // la compagnie libère la place : moins de fréquence, voire la ligne entière
  const rt = offer.route, rv = offer.rival;
  rt.freq -= 3;
  if (rt.freq < 1) {
    const i = rv.routes.indexOf(rt);
    if (i >= 0) rv.routes.splice(i, 1);
    rebuildRivalIndex();
  }
  s.slots[code] = slotsOwned(code) + 1;
  pushLog('Créneau racheté', rv.name + ' cède un créneau à ' + CITY_BY_CODE[code].name +
          ' pour ' + money(offer.price) + ' et allège sa desserte de ' + offer.other.name + '.', 'good');
  return {ok:true};
};

/* -------------------------------- lignes --------------------------------- */
G.findRoute = function (a, b) {
  return G.s.routes.find(r => (r.a === a && r.b === b) || (r.a === b && r.b === a));
};
G.createRoute = function (a, b) {
  const s = G.s;
  if (a === b) return {ok:false, why:'Choisissez deux villes différentes.'};
  if (G.findRoute(a, b)) return {ok:false, why:'Cette ligne existe déjà.'};
  const dem = baseDemand(a, b);
  if (!dem) return {ok:false, why:'Liaison trop courte : la demande aérienne est nulle.'};
  const r = {
    id: s.nextId++, a, b, dist: dem.dist, priceMult: 1.0, freqCap: 0, ac: [],
    last: {pax:0, rev:0, cost:0, profit:0, lf:0, seats:0, share:0, cargo:0, connect:0}
  };
  s.routes.push(r);
  pushLog('Ligne ouverte', CITY_BY_CODE[a].name + ' ↔ ' + CITY_BY_CODE[b].name +
          ' (' + num(dem.dist) + ' km). Affectez-lui un avion.', 'good');
  return {ok:true, route:r};
};
G.closeRoute = function (id) {
  const s = G.s, i = s.routes.findIndex(r => r.id === id);
  if (i < 0) return;
  s.routes[i].ac.forEach(acId => {
    const ac = s.fleet.find(a => a.id === acId);
    if (ac) { ac.routeId = null; ac.status = 'idle'; }
  });
  pushLog('Ligne fermée', CITY_BY_CODE[s.routes[i].a].name + ' ↔ ' + CITY_BY_CODE[s.routes[i].b].name + '.', '');
  s.routes.splice(i, 1);
};
G.assign = function (acId, routeId) {
  const s = G.s;
  const ac = s.fleet.find(a => a.id === acId), r = s.routes.find(x => x.id === routeId);
  if (!ac || !r) return {ok:false, why:'Introuvable.'};
  const t = AC_BY_ID[ac.type];
  if (t.range < r.dist) return {ok:false, why:'Autonomie insuffisante (' + num(t.range) + ' km < ' + num(r.dist) + ' km).'};
  if (ac.status === 'maint') return {ok:false, why:'Appareil en révision.'};
  if (ac.routeId) G.unassign(acId);
  if (slotsOwned(r.a) - slotsUsed(r.a) < 1)
    return {ok:false, why:'Pas de créneau libre à ' + CITY_BY_CODE[r.a].name + '. Achetez-en un.'};
  if (slotsOwned(r.b) - slotsUsed(r.b) < 1)
    return {ok:false, why:'Pas de créneau libre à ' + CITY_BY_CODE[r.b].name + '. Achetez-en un.'};
  ac.routeId = routeId;
  ac.status = ac.wear >= BAL.MAINT_GROUND ? 'aog' : 'flying';
  r.ac.push(acId);
  if (!r.freqCap) r.freqCap = G.suggestFreq(r);   // fréquence de départ raisonnable
  return {ok:true};
};
/* Fréquence quotidienne (par appareil) qui maximise le résultat de la ligne,
   compte tenu de la demande, de la concurrence et des coûts. */
/* ------------------- simulation à blanc d'une ligne ---------------------- */
/* Rejoue une journée d'exploitation d'une ligne sous des réglages donnés,
   sans toucher à l'état du jeu. C'est le calcul du moteur, moins les charges
   passives et les correspondances : il sert à comparer des réglages entre eux,
   pas à tenir les comptes. De là viennent la fréquence conseillée, le tarif
   conseillé et le diagnostic affiché sur la fiche de ligne. */
/* `fleet` permet de projeter une ligne qui n'existe pas encore, servie par des
   appareils qu'on n'a pas encore achetés. Sans lui, on lit la flotte réelle. */
function routeCtx(route, fleet) {
  const s = G.s, dem = baseDemand(route.a, route.b);
  if (!dem) return null;
  const acs = fleet || route.ac.map(id => s.fleet.find(a => a.id === id))
                      .filter(a => a && a.status !== 'maint' && a.status !== 'aog');
  if (!acs.length) return null;
  const rivals = RIVAL_IDX.get(pairKey(route.a, route.b)) || [];
  let rivalAttr = incumbent(dem);
  rivals.forEach(x => rivalAttr += attract(x.rt.freq, x.rt.price, x.r.rep));
  const feeA = CITY_BY_CODE[route.a].fee * (s.hubs.indexOf(route.a) >= 0 ? BAL.HUB_FEE_DISCOUNT : 1);
  const feeB = CITY_BY_CODE[route.b].fee * (s.hubs.indexOf(route.b) >= 0 ? BAL.HUB_FEE_DISCOUNT : 1);
  let cap = 0;
  acs.forEach(a => cap = Math.max(cap, legsPerDay(AC_BY_ID[a.type], route.dist)));
  return {dem, acs, rivalAttr, feeA, feeB, cap, fuelPrice: BAL.FUEL_BASE * s.mods.fuel,
          offPeak: offPeakPenalty(route.a, route.b)};
}

function simRoute(route, ctx, L, priceMult) {
  const s = G.s, dem = ctx.dem;
  let seats = {eco:0, biz:0, first:0}, legs = 0, cost = 0, cargoCap = 0;
  ctx.acs.forEach(a => {
    const t = AC_BY_ID[a.type];
    const l = Math.min(L, legsPerDay(t, route.dist));
    if (!l) return;
    legs += l;
    const sp = seatsOf(t, a.cabin);
    seats.eco += sp.eco * l; seats.biz += sp.biz * l; seats.first += sp.first * l;
    cargoCap += (t.cargo || t.belly) * l;
    const bh = blockHours(t, route.dist);
    cost += l * (t.fuel * route.dist * ctx.fuelPrice +
                 t.crewH * bh + t.maintH * bh * (1 + a.wear) +
                 BAL.ATC_KM * route.dist * t.feeW +
                 (ctx.feeA + ctx.feeB) / 2 * t.feeW * s.mods.fees +
                 BAL.GROUND_LEG * t.feeW);
  });
  if (!legs) return null;
  const myAttr = attract(legs, priceMult, s.rep) * ctx.offPeak;
  const share = myAttr / (myAttr + ctx.rivalAttr);
  const wE = dem.eco * share, wB = dem.biz * share, wF = dem.first * share;
  const pE = Math.min(wE, seats.eco), pB = Math.min(wB, seats.biz), pF = Math.min(wF, seats.first);
  const cg = Math.min(dem.cargoT * cargoShare(cargoCap, dem, priceMult), cargoCap);
  const p = dem.price * priceMult;
  const ticket = pE * p + pB * p * BAL.CLASS_MULT.biz + pF * p * BAL.CLASS_MULT.first;
  const rev = ticket + cg * 1000 * (BAL.CARGO_A + BAL.CARGO_B * route.dist);
  const pax = pE + pB + pF;
  const paxCost = pax * (BAL.CATERING_A + BAL.CATERING_B * route.dist);
  const offered = seats.eco + seats.biz * BAL.CLASS_SPACE.biz + seats.first * BAL.CLASS_SPACE.first;
  const sold = pE + pB * BAL.CLASS_SPACE.biz + pF * BAL.CLASS_SPACE.first;
  return {legs: legs, pax: pax, share: share, rev: rev,
          profit: rev - cost - paxCost - ticket * BAL.DISTRIB_RATE,
          lf: offered > 0 ? sold / offered : 0,
          unmet: Math.max(0, (wE - pE) + (wB - pB) + (wF - pF))};
}

/* Fréquence qui maximise le résultat, à tarif inchangé. 0 = fréquence maximale. */
G.suggestFreq = function (route) {
  const ctx = routeCtx(route);
  if (!ctx) return 0;
  let bestL = 1, bestP = -Infinity;
  for (let L = 1; L <= ctx.cap; L++) {
    const r = simRoute(route, ctx, L, route.priceMult);
    if (r && r.profit > bestP) { bestP = r.profit; bestL = L; }
  }
  return bestL >= ctx.cap ? 0 : bestL;      // 0 = fréquence maximale
};

/* Tarif qui maximise le résultat, à fréquence inchangée, en pourcentage du
   prix de référence — la plage exacte du curseur de la fiche de ligne. */
G.suggestPrice = function (route) {
  const ctx = routeCtx(route);
  if (!ctx) return null;
  const L = route.freqCap ? Math.min(route.freqCap, ctx.cap) : ctx.cap;
  let best = null, bestP = -Infinity;
  for (let m = 60; m <= 170; m++) {
    const r = simRoute(route, ctx, L, m / 100);
    if (r && r.profit > bestP) { bestP = r.profit; best = m; }
  }
  return best;
};

/* ===================== devis d'ouverture d'une ligne ===================== */
/* Ouvrir une ligne, c'est en réalité trois achats — des créneaux à chaque
   escale, un ou plusieurs appareils, la ligne elle-même — et deux réglages.
   `planRoute` chiffre l'ensemble avant d'engager un euro et projette le
   résultat quotidien ; `openRoute` exécute le devis d'un bloc, ou rien. */

/* Un appareil fictif, neuf, pour les projections. */
function ghostAc(typeId, n) {
  const t = AC_BY_ID[typeId], out = [];
  for (let i = 0; i < n; i++)
    out.push({id: -1 - i, type: typeId, cabin: t.seats ? 'standard' : 'cargo',
              wear: 0, ageM: 0, paid: t.price, status: 'idle', routeId: null, mods: []});
  return out;
}

/* Meilleur couple (fréquence, tarif) pour une liaison servie par ces appareils.
   Le tarif est balayé par pas de 2 %, assez fin pour l'optimum et assez large
   pour rester instantané. */
function bestSetting(route, acs) {
  const ctx = routeCtx(route, acs);
  if (!ctx) return null;
  let best = null;
  for (let L = 1; L <= ctx.cap; L++)
    for (let m = 60; m <= 170; m += 2) {
      const r = simRoute(route, ctx, L, m / 100);
      if (r && (!best || r.profit > best.profit))
        best = {profit: r.profit, lf: r.lf, pax: r.pax, share: r.share,
                unmet: r.unmet, freq: L, priceMult: m / 100, cap: ctx.cap};
    }
  return best;
}

/* Les appareils du catalogue capables de tenir la distance, classés par
   résultat quotidien une fois bien réglés. C'est la réponse chiffrée à
   « quel avion mettre sur cette ligne ». */
G.rankAircraft = function (a, b, count) {
  const dem = baseDemand(a, b);
  if (!dem) return [];
  const n = Math.max(1, count || 1);
  const route = {id: -1, a: a, b: b, dist: dem.dist, priceMult: 1, freqCap: 0, ac: []};
  const out = [];
  AIRCRAFT.forEach(t => {
    if (t.range < dem.dist) return;
    const best = bestSetting(route, ghostAc(t.id, n));
    if (!best) return;
    const price = Math.round(t.price * G.s.mods.acPrice) * n;
    const fixed = ghostAc(t.id, n).reduce((s, x) => s + G.aircraftFixedTotal(x), 0) / 30;
    const net = best.profit - fixed;
    out.push({type: t, kind: t.seats ? 'pax' : 'cargo',
              price: price, freq: best.freq, priceMult: best.priceMult,
              lf: best.lf, pax: best.pax, share: best.share,
              gross: best.profit, fixed: fixed, profit: net,
              payback: net > 0 ? price / net : null});
  });
  // Le classement par défaut suit le retour sur investissement, pas le résultat
  // brut : un gros porteur gagne toujours en valeur absolue, mais immobilise un
  // capital que la trésorerie n'a pas. Les appareils qui ne se remboursent
  // jamais ferment la marche.
  out.sort((x, y) => (x.payback === null) - (y.payback === null) ||
                     (x.payback === null ? y.profit - x.profit : x.payback - y.payback));
  return out;
};

/* Quand aucun appareil ne tient la distance d'une traite, la liaison n'est pas
   perdue : elle se fait en deux tronçons. On cherche les escales qui coupent le
   trajet en deux vols possibles, en préférant celles où l'on est déjà installé
   et celles qui ne rallongent pas trop la route. */
G.relayCities = function (a, b) {
  const s = G.s, ca = CITY_BY_CODE[a], cb = CITY_BY_CODE[b];
  if (!ca || !cb) return [];
  const direct = distKm(ca, cb);
  let maxRange = 0;
  AIRCRAFT.forEach(t => { if (t.range > maxRange) maxRange = t.range; });
  const out = [];
  CITIES.forEach(c => {
    if (c.code === a || c.code === b) return;
    const d1 = distKm(ca, c), d2 = distKm(c, cb);
    if (d1 > maxRange || d2 > maxRange) return;
    if (d1 < BAL.MIN_DISTANCE || d2 < BAL.MIN_DISTANCE) return;
    const detour = (d1 + d2) / direct;
    if (detour > 1.35) return;                       // un crochet, pas un détour
    const hub = s.hubs.indexOf(c.code) >= 0;
    const owned = (s.slots[c.code] || 0) > 0;
    out.push({city: c, d1: Math.round(d1), d2: Math.round(d2), detour: detour,
              hub: hub, owned: owned,
              score: detour - (hub ? 0.30 : 0) - (owned ? 0.10 : 0) - c.size * 0.12});
  });
  out.sort((x, y) => x.score - y.score);
  return out.slice(0, 4);
};

G.planRoute = function (a, b, opt) {
  const s = G.s;
  opt = opt || {};
  const plan = {a: a, b: b, blocking: [], notes: []};
  if (!a || !b) { plan.why = 'Choisissez une ville de départ et une destination.'; return plan; }
  if (a === b) { plan.why = 'Choisissez deux villes différentes.'; return plan; }
  const exist = G.findRoute(a, b);
  if (exist) { plan.why = 'Cette ligne existe déjà.'; plan.route = exist; return plan; }
  const dem = baseDemand(a, b);
  if (!dem) { plan.why = 'Liaison trop courte : en dessous de ' + num(BAL.MIN_DISTANCE) +
              ' km, le train et la route l’emportent.'; return plan; }
  plan.dem = dem;
  plan.dist = dem.dist;
  plan.rivals = RIVAL_IDX.get(pairKey(a, b)) || [];

  const count = Math.max(1, Math.min(8, opt.count || 1));
  plan.count = count;

  // --- appareils : ceux qui dorment déjà en flotte d'abord, le reste à l'achat
  const typeId = opt.typeId;
  plan.typeId = typeId;
  if (typeId) {
    const t = AC_BY_ID[typeId];
    plan.type = t;
    if (t.range < dem.dist)
      plan.blocking.push('Le ' + t.name + ' n’a pas l’autonomie : ' + num(t.range) +
                         ' km pour une liaison de ' + num(dem.dist) + ' km.');
    plan.reuse = s.fleet.filter(x => x.type === typeId && !x.routeId && x.status !== 'maint')
                        .slice(0, count);
    plan.buy = count - plan.reuse.length;
    plan.acCost = Math.round(t.price * s.mods.acPrice) * plan.buy;
  } else {
    plan.reuse = []; plan.buy = 0; plan.acCost = 0;
    plan.blocking.push('Choisissez un appareil.');
  }

  // --- créneaux : un par appareil et par escale, déduction faite des libres
  plan.slots = [a, b].map(code => {
    const owned = slotsOwned(code), used = slotsUsed(code);
    const spare = Math.max(0, owned - used);
    const need = Math.max(0, count - spare);
    const unit = slotCost(code);
    const rep = slotMinRep(code);
    const forSale = slotsFree(code);
    const o = {code: code, city: CITY_BY_CODE[code], spare: spare, need: need,
               unit: unit, cost: unit * need, minRep: rep, forSale: forSale,
               offFree: offPeakFree(code), offCost: offPeakCost(code),
               offShare: offPeakShare(code)};
    if (need > 0) {
      if (rep && s.rep < rep)
        plan.blocking.push(o.city.name + ' réserve ses créneaux aux compagnies de réputation ' +
                           rep + ' ou plus ; la vôtre est de ' + Math.round(s.rep) + '.');
      else if (forSale < need)
        plan.blocking.push(o.city.name + ' n’a plus que ' + forSale + ' créneau(x) à vendre pour ' +
                           need + ' demandé(s). Ouvrez sa fiche : horaires creux, rachat à une ' +
                           'compagnie installée ou agrandissement.');
    }
    return o;
  });
  plan.slotCost = plan.slots.reduce((t, o) => t + o.cost, 0);
  plan.total = plan.slotCost + plan.acCost;
  plan.cashAfter = s.cash - plan.total;
  if (!DIFF().sandbox && plan.total > s.cash)
    plan.blocking.push('Il manque ' + money(plan.total - s.cash) + ' en trésorerie.');

  // --- projection : la ligne une fois ouverte et bien réglée
  if (typeId && AC_BY_ID[typeId].range >= dem.dist) {
    const route = {id: -1, a: a, b: b, dist: dem.dist, priceMult: 1, freqCap: 0, ac: []};
    const acs = plan.reuse.length === count ? plan.reuse.slice() : ghostAc(typeId, count);
    const best = bestSetting(route, acs);
    if (best) {
      const fixed = acs.reduce((t, x) => t + G.aircraftFixedTotal(x), 0) / 30;
      const marketing = BAL.MARKETING_ROUTE / 30;
      const upkeep = plan.slots.reduce((t, o) => t + (o.spare + o.need), 0) * BAL.SLOT_UPKEEP / 30;
      plan.proj = {freq: best.freq, priceMult: best.priceMult, lf: best.lf, pax: best.pax,
                   share: best.share, gross: best.profit,
                   fixed: fixed + marketing + upkeep,
                   profit: best.profit - fixed - marketing - upkeep};
      plan.proj.payback = plan.proj.profit > 0 && plan.total > 0
        ? plan.total / plan.proj.profit : null;
      plan.fare = Math.round(dem.price * best.priceMult);
    }
  }

  // --- ce que la ligne apporte au-delà de son résultat
  const regions = new Set();
  s.routes.forEach(r => { regions.add(CITY_BY_CODE[r.a].region); regions.add(CITY_BY_CODE[r.b].region); });
  const fresh = [];
  [a, b].forEach(c => {
    const rg = CITY_BY_CODE[c].region;
    if (!regions.has(rg) && fresh.indexOf(rg) < 0) fresh.push(rg);
  });
  if (fresh.length) plan.notes.push((fresh.length > 1 ? 'Premières lignes en ' : 'Première ligne en ') +
    fresh.map(r => REGION_NAMES[r]).join(' et ') + ' : ' + (fresh.length > 1 ? 'deux régions' : 'une région') +
    ' de plus vers l’objectif de réseau mondial.');
  [a, b].forEach(c => {
    if (s.hubs.indexOf(c) >= 0) {
      const n = s.routes.filter(r => r.a === c || r.b === c).length;
      if (n) plan.notes.push('Escale à votre hub de ' + CITY_BY_CODE[c].name +
        ' : les correspondances avec vos ' + n + ' autre(s) ligne(s) rempliront les sièges invendus.');
    }
  });
  plan.ok = !plan.blocking.length;
  return plan;
};

/* Exécute un devis : créneaux, appareils, ligne, affectation, réglages. */
G.openRoute = function (plan) {
  const s = G.s;
  if (!plan || !plan.ok) return {ok: false, why: (plan && plan.blocking[0]) || plan.why || 'Devis incomplet.'};

  // on revérifie tout avant d'engager le premier euro
  const fresh = G.planRoute(plan.a, plan.b, {typeId: plan.typeId, count: plan.count});
  if (!fresh.ok) return {ok: false, why: fresh.blocking[0] || fresh.why};

  for (let k = 0; k < fresh.slots.length; k++) {
    const o = fresh.slots[k];
    for (let i = 0; i < o.need; i++) {
      const r = G.buySlot(o.code);
      if (!r.ok) return {ok: false, why: r.why};
    }
  }
  const acs = fresh.reuse.slice();
  for (let i = 0; i < fresh.buy; i++) {
    const r = G.buyAircraft(fresh.typeId);   // passe par l'achat normal : le journal le note
    if (!r.ok) return {ok: false, why: r.why};
    acs.push(r.ac);
  }
  const made = G.createRoute(plan.a, plan.b);
  if (!made.ok) return made;
  const route = made.route;
  acs.forEach(ac => G.assign(ac.id, route.id));
  if (fresh.proj) route.priceMult = fresh.proj.priceMult;
  route.freqCap = G.suggestFreq(route);   // recalculée sur les appareils réels
  pushLog('Ligne en service', CITY_BY_CODE[plan.a].name + ' ↔ ' + CITY_BY_CODE[plan.b].name +
          ' — ' + acs.length + ' appareil(s), ' + money(fresh.total) + ' engagés.', 'good');
  return {ok: true, route: route};
};

/* --------------------------- conseiller de ligne ------------------------- */
/* Une phrase : ce qui limite le résultat ici, et le geste qui le débloque.
   On ne liste pas tout ce qui cloche, seulement le levier le plus rentable,
   chiffré par la simulation ci-dessus. */
G.routeAdvice = function (route) {
  const s = G.s;
  if (!route.ac.length)
    return {text: 'Aucun appareil affecté : la ligne ne vole pas et ne rapporte rien.',
            kind: 'bad', action: null};

  const crew = route.ac.map(id => s.fleet.find(a => a.id === id)).filter(Boolean);
  const grounded = crew.filter(a => a.status === 'aog' || a.status === 'maint');
  if (crew.length && grounded.length === crew.length) {
    const aog = grounded.filter(a => a.status === 'aog');
    return {text: aog.length
              ? 'Tous les appareils de la ligne sont cloués au sol par l’usure. Une révision les remet en vol.'
              : 'Tous les appareils de la ligne sont en révision. Ils reprendront leur poste au retour.',
            kind: aog.length ? 'bad' : 'warn',
            action: aog.length
              ? {a: 'maint', v: aog[0].id, label: 'Envoyer ' + aog[0].reg + ' en révision'} : null};
  }

  const ctx = routeCtx(route);
  if (!ctx) return null;
  const L = route.freqCap ? Math.min(route.freqCap, ctx.cap) : ctx.cap;
  const now = simRoute(route, ctx, L, route.priceMult);
  if (!now) return null;

  // les deux leviers, évalués séparément : on ne recommande que le meilleur
  const bestF = G.suggestFreq(route), newL = bestF || ctx.cap;
  let gainF = 0;
  if (newL !== L) {
    const alt = simRoute(route, ctx, newL, route.priceMult);
    if (alt) gainF = alt.profit - now.profit;
  }
  const bestM = G.suggestPrice(route);
  let gainM = 0;
  if (bestM && bestM !== Math.round(route.priceMult * 100)) {
    const alt = simRoute(route, ctx, L, bestM / 100);
    if (alt) gainM = alt.profit - now.profit;
  }
  // un conseil ne vaut d'être donné que s'il pèse : 2 k€/jour et 6 % du résultat
  const worth = g => g > 2000 && g > Math.abs(now.profit) * 0.06;

  if (now.unmet > Math.max(15, now.pax * 0.5) && now.lf > 0.85 && !worth(gainF) && !worth(gainM))
    return {text: 'Les avions partent pleins et vous renvoyez environ ' + num(now.unmet) +
              ' passagers par jour. Un appareil de plus sur la ligne les capterait.',
            kind: 'warn', action: null};

  if (worth(gainF) && gainF >= gainM)
    return {text: (newL > L ? 'Monter à ' : 'Descendre à ') + newL + ' vol' + (newL > 1 ? 's' : '') +
              ' par jour et par appareil rapporterait environ ' + money(gainF) + ' de plus par jour' +
              (newL < L ? ' : vous volez plus souvent que la demande ne le justifie.' : '.'),
            kind: 'info', action: {a: 'optfreq', v: route.id, label: 'Appliquer la fréquence conseillée'}};

  if (worth(gainM)) {
    const up = bestM > route.priceMult * 100;
    return {text: (up ? 'Vous vendez trop bas' : 'Vous vendez trop cher') + ' : à ' + bestM +
              ' % du prix de référence (' + Math.round(ctx.dem.price * bestM / 100) + ' € en éco), ' +
              'le résultat gagnerait environ ' + money(gainM) + ' par jour.',
            kind: 'info', action: {a: 'optprice', v: route.id, label: 'Appliquer le tarif conseillé'}};
  }

  if (now.profit < 0)
    return {text: 'La ligne perd de l’argent, et ni le tarif ni la fréquence n’y changeront grand-chose : ' +
              'l’appareil est mal calibré pour cette distance, ou la demande ne suffit pas.',
            kind: 'warn', action: {a: 'closeroute', v: route.id, label: 'Fermer la ligne'}};

  return {text: 'Ligne bien réglée : tarif et fréquence sont déjà proches de l’optimum.',
          kind: 'ok', action: null};
};

G.unassign = function (acId) {
  const s = G.s, ac = s.fleet.find(a => a.id === acId);
  if (!ac || !ac.routeId) return;
  const r = s.routes.find(x => x.id === ac.routeId);
  if (r) r.ac = r.ac.filter(i => i !== acId);
  ac.routeId = null;
  if (ac.status !== 'maint') ac.status = 'idle';
};
/* Coût et durée d'une grande visite. L'atelier intégré fait baisser les deux. */
G.maintCost = function (acId) {
  const ac = G.s.fleet.find(a => a.id === acId);
  if (!ac) return 0;
  const t = AC_BY_ID[ac.type];
  const raw = t.price * BAL.MAINT_COST_RATIO * Math.max(0.35, ac.wear);
  return Math.round(raw * (G.hasProgram('mro') ? 0.75 : 1));
};
G.maintDays = function () {
  return Math.max(2, BAL.MAINT_DAYS - (G.hasProgram('mro') ? 3 : 0));
};
G.sendMaint = function (acId, quiet) {
  const s = G.s, ac = s.fleet.find(a => a.id === acId);
  if (!ac) return {ok:false};
  if (ac.status === 'maint') return {ok:false, why:'Déjà en révision.'};
  const cost = G.maintCost(acId), days = G.maintDays();
  if (s.cash < cost) return {ok:false, why:'Trésorerie insuffisante (' + money(cost) + ').'};
  s.cash -= cost;
  s.month.cost += cost;
  s.month.led.overhaul += cost;
  ac.status = 'maint';
  ac.maintLeft = days;
  pushLog(quiet ? 'Révision programmée' : 'Révision',
          ac.reg + ' immobilisé ' + days + ' jours — ' + money(cost) + '.' +
          (quiet ? ' Planification automatique.' : ''), '');
  return {ok:true, cost};
};

/* -------------------------------- emprunts ------------------------------- */
G.assets = function () {
  const s = G.s;
  let v = s.cash;
  s.fleet.forEach(a => v += acValue(a));
  Object.keys(s.slots).forEach(c => v += slotCost(c) * 0.6 * s.slots[c]);
  s.hubs.forEach(c => v += G.hubCost(c) * 0.5);
  return v;
};
G.debtTotal = function () { return G.s.loans.reduce((t, l) => t + l.remaining, 0); };
G.maxLoan = function () {
  return Math.max(0, Math.round((G.assets() * BAL.DEBT_RATIO - G.debtTotal()) / 1e6) * 1e6);
};
G.takeLoan = function (amount) {
  const s = G.s;
  amount = Math.round(amount);
  if (amount <= 0) return {ok:false, why:'Montant invalide.'};
  if (amount > G.maxLoan()) return {ok:false, why:'Au-delà de votre capacité d’endettement.'};
  const r = BAL.LOAN_RATE / 12, n = BAL.LOAN_MONTHS;
  const monthly = amount * r / (1 - Math.pow(1 + r, -n));
  s.loans.push({id: s.nextId++, principal: amount, remaining: amount, monthly, months: n});
  s.cash += amount;
  pushLog('Emprunt', money(amount) + ' débloqués — ' + money(monthly) + '/mois pendant ' + n + ' mois.', '');
  return {ok:true};
};
G.repayLoan = function (id) {
  const s = G.s, l = s.loans.find(x => x.id === id);
  if (!l) return {ok:false};
  const amt = Math.round(l.remaining * 1.02);
  if (s.cash < amt) return {ok:false, why:'Trésorerie insuffisante (' + money(amt) + ').'};
  s.cash -= amt;
  s.loans = s.loans.filter(x => x.id !== id);
  pushLog('Emprunt soldé', money(amt) + ' remboursés par anticipation.', 'good');
  return {ok:true};
};

/* ========================================================================= */
/*                          SIMULATION QUOTIDIENNE                           */
/* ========================================================================= */
function demandMods(codeA, codeB) {
  const s = G.s;
  let m = s.mods.demand;
  if (s.mods.region) {
    const ra = CITY_BY_CODE[codeA].region, rb = CITY_BY_CODE[codeB].region;
    if (ra === s.mods.region || rb === s.mods.region) m *= s.mods.regionMult;
  }
  if (s.mods.hotCity && (codeA === s.mods.hotCity || codeB === s.mods.hotCity)) m *= s.mods.hotMult;
  // saisonnalité : pic d'été (juillet-août) et de fin d'année
  const seas = 1 + 0.14 * Math.sin((s.m + 0.5 - 3.2) / 12 * Math.PI * 2);
  return m * seas;
}
function routeClosed(r) {
  const c = G.s.mods.closed;
  return c && (r.a === c || r.b === c);
}

/* attractivité d'un opérateur sur une liaison */
function attract(freq, priceMult, rep) {
  if (freq <= 0) return 0;
  return Math.pow(freq, 0.50) * Math.pow(1 / Math.max(0.3, priceMult), 1.8) *
         Math.pow(Math.max(20, rep) / 70, 0.7);
}
/* part de marché fret : les chargeurs regardent la capacité offerte */
function cargoShare(cap, dem, priceMult) {
  if (cap <= 0) return 0;
  const mine = Math.pow(cap, 0.5) * Math.pow(1 / Math.max(0.5, priceMult), 0.6);
  return mine / (mine + Math.pow(Math.max(4, dem.cargoT * 0.8), 0.5));
}

/* concurrence de fond : toutes les compagnies non modélisées, d'autant plus
   présentes que la liaison est importante. Empêche tout monopole gratuit. */
function incumbent(dem) {
  return attract(Math.max(2, Math.min(22, dem.total / 260)), 1.0, 70);
}

/* ------------------------------ comptabilité ----------------------------- */
function newLedger() {
  const l = {};
  LEDGER_KEYS.forEach(k => l[k] = 0);
  REV_LINES.forEach(r => l[r[0]] = 0);
  return l;
}
function newMonth() {
  return {rev:0, cost:0, pax:0, cargo:0, ask:0, rpk:0, ftk:0,
          hours:0, flights:0, cancels:0, led: newLedger()};
}
function daysInMonth() {
  const s = G.s;
  return DAYS_IN_MONTH[s.m] + ((s.m === 1 && s.y % 4 === 0) ? 1 : 0);
}

/* Charges passives d'un appareil : dues qu'il vole ou non. */
G.aircraftFixed = function (ac) {
  const t = AC_BY_ID[ac.type], v = acValue(ac);
  const school = G.hasProgram('school');
  return {
    crewFix:   t.crewFix * (school ? 0.85 : 1),
    maintFix:  t.maintFix,
    insurance: v * BAL.INSURANCE_M,
    parking:   BAL.PARK_M * t.feeW,
    training:  school ? 0 : BAL.TRAIN_M * t.feeW,
    admin:     BAL.ADMIN_M
  };
};
G.aircraftFixedTotal = function (ac) {
  const f = G.aircraftFixed(ac);
  return f.crewFix + f.maintFix + f.insurance + f.parking + f.training + f.admin;
};

function simulateDay() {
  const s = G.s;
  const L = s.month.led, dim = daysInMonth();
  let dayRev = 0, dayCost = 0, dayPax = 0, dayCargo = 0;
  // la couverture carburant amortit de moitié les écarts de prix du kérosène
  const fuelSwing = G.hasProgram('hedge') ? 1 + (s.mods.fuel - 1) * 0.45 : s.mods.fuel;
  const fuelPrice = BAL.FUEL_BASE * fuelSwing;
  const feeMult = s.mods.fees;

  // ---- 1. exploitation de chaque ligne ----
  s.routes.forEach(r => {
    const dem = baseDemand(r.a, r.b);
    r.last = {pax:0, rev:0, cost:0, profit:0, lf:0, seats:0, share:0, cargo:0, connect:0,
              spare:0, unmet:0, cancel:0, legs:0, hours:0, fixed:0, varCost:0};
    if (!dem) return;
    const closed = routeClosed(r);

    let seats = {eco:0, biz:0, first:0}, cargoCap = 0, legs = 0, cost = 0,
        cancelled = 0, hours = 0, fixed = 0;

    r.ac.forEach(acId => {
      const ac = s.fleet.find(a => a.id === acId);
      if (!ac) return;
      const t = AC_BY_ID[ac.type];

      // charges passives : dues même si l'appareil ne vole pas
      const f = G.aircraftFixed(ac);
      Object.keys(f).forEach(k => { L[k] += f[k] / dim; fixed += f[k] / dim; });

      if (ac.status === 'maint' || ac.status === 'aog') return;

      let l = legsPerDay(t, r.dist);
      if (r.freqCap) l = Math.min(l, r.freqCap);
      if (closed) { cancelled += l; l = 0; }
      if (ac.wear > BAL.MAINT_THRESHOLD) {
        const lost = Math.min(l, Math.round(l * (ac.wear - BAL.MAINT_THRESHOLD) * 0.8));
        cancelled += lost; l -= lost;
      }
      if (l <= 0) return;

      legs += l;
      const sp = seatsOf(t, ac.cabin);
      seats.eco += sp.eco * l; seats.biz += sp.biz * l; seats.first += sp.first * l;
      cargoCap += (t.cargo || t.belly) * l;

      const bh = blockHours(t, r.dist);
      hours += bh * l;
      const feeA = CITY_BY_CODE[r.a].fee * (s.hubs.indexOf(r.a) >= 0 ? BAL.HUB_FEE_DISCOUNT : 1);
      const feeB = CITY_BY_CODE[r.b].fee * (s.hubs.indexOf(r.b) >= 0 ? BAL.HUB_FEE_DISCOUNT : 1);

      const cFuel  = t.fuel * r.dist * fuelPrice * (1 + 0.012 * (ac.ageM / 12)) *
                     (1 + modSum(ac, 'fuel')) * l;
      const cCrew  = t.crewH * bh * l;
      const cMaint = t.maintH * bh * (1 + ac.wear) * (1 + modSum(ac, 'maint')) * l;
      const cAtc   = BAL.ATC_KM * r.dist * t.feeW * l;
      const cLand  = (feeA + feeB) / 2 * t.feeW * feeMult * l;
      const cGrnd  = BAL.GROUND_LEG * t.feeW * l;
      L.fuel += cFuel; L.crewH += cCrew; L.maintH += cMaint;
      L.atc += cAtc; L.landing += cLand; L.ground += cGrnd;
      cost += cFuel + cCrew + cMaint + cAtc + cLand + cGrnd;

      ac.wear += bh * l * t.wear * (1 + modSum(ac, 'wear'));
      if (ac.wear > BAL.MAINT_THRESHOLD && !ac.warned) {
        ac.warned = true;
        pushLog('Usure élevée', ac.reg + ' dépasse ' + pct(BAL.MAINT_THRESHOLD) +
                ' d\u2019usure : annulations en vue, programmez une révision.', 'bad');
      }
      if (ac.wear >= BAL.MAINT_GROUND && ac.status === 'flying') {
        ac.status = 'aog';
        pushLog('Immobilisation', ac.reg + ' est cloué au sol : révision obligatoire.', 'bad');
      }
    });

    r.last.legs = legs; r.last.cancel = cancelled;
    r.last.hours = hours; r.last.fixed = fixed;
    s.month.cancels += cancelled;
    if (legs === 0) { r.last.cost = cost + fixed; dayCost += cost + fixed; return; }

    // parts de marché : une cabine rénovée fait accepter un tarif plus élevé
    let fareBonus = 0, nAc = 0;
    r.ac.forEach(id => {
      const a = s.fleet.find(x => x.id === id);
      if (a) { fareBonus += modSum(a, 'fare'); nAc++; }
    });
    if (nAc) fareBonus /= nAc;
    // un vol posé sur un horaire creux attire moins de monde : la pénalité
    // s'applique ici, là où se joue la part de marché réelle
    const myAttr = attract(legs, r.priceMult / (1 + fareBonus), s.rep) * offPeakPenalty(r.a, r.b);
    let sumAttr = myAttr + incumbent(dem);
    (RIVAL_IDX.get(pairKey(r.a, r.b)) || []).forEach(x =>
      sumAttr += attract(x.rt.freq, x.rt.price, x.r.rep));
    const share = sumAttr > 0 ? myAttr / sumAttr : 1;

    const dm = demandMods(r.a, r.b);
    const availEco = dem.eco * dm * share;
    const paxEco = Math.min(availEco, seats.eco);
    const paxBiz = Math.min(dem.biz * dm * share, seats.biz);
    const paxFst = Math.min(dem.first * dm * share, seats.first);

    const p = dem.price * r.priceMult;
    const rEco = paxEco * p, rBiz = paxBiz * p * BAL.CLASS_MULT.biz,
          rFst = paxFst * p * BAL.CLASS_MULT.first;
    L.revEco += rEco; L.revBiz += rBiz; L.revFirst += rFst;

    const cargoT = Math.min(dem.cargoT * dm * cargoShare(cargoCap, dem, r.priceMult), cargoCap);
    const rCargo = cargoT * 1000 * (BAL.CARGO_A + BAL.CARGO_B * r.dist);
    L.revCargo += rCargo;

    const pax = paxEco + paxBiz + paxFst;
    const cCater = pax * (BAL.CATERING_A + BAL.CATERING_B * r.dist);
    const cDist  = (rEco + rBiz + rFst) * BAL.DISTRIB_RATE;
    L.catering += cCater; L.distrib += cDist;
    cost += cCater + cDist;

    const totalSeats = seats.eco + seats.biz + seats.first;
    r.last.pax = pax;
    r.last.seats = totalSeats;
    r.last.share = share;
    r.last.rev = rEco + rBiz + rFst + rCargo;
    r.last.varCost = cost;
    r.last.cost = cost + fixed;
    r.last.cargo = cargoT;
    r.last.spare = Math.max(0, seats.eco - paxEco);
    r.last.unmet = Math.max(0, availEco - paxEco);

    s.month.ask += totalSeats * r.dist;
    s.month.rpk += pax * r.dist;
    s.month.ftk += cargoT * r.dist;
    s.month.hours += hours;
    s.month.flights += legs;
    s.totals.flights += legs;

    dayRev += r.last.rev; dayCost += r.last.cost;
    dayPax += pax; dayCargo += cargoT;
  });

  // ---- 2. appareils sans ligne : les charges passives courent quand même ----
  s.fleet.forEach(ac => {
    if (ac.routeId) return;
    const f = G.aircraftFixed(ac);
    Object.keys(f).forEach(k => { L[k] += f[k] / dim; dayCost += f[k] / dim; });
  });

  // ---- 3. correspondances via les hubs ----
  s.hubs.forEach(h => {
    const at = s.routes.filter(r => (r.a === h || r.b === h) && r.last.legs > 0);
    for (let i = 0; i < at.length; i++) {
      for (let j = i + 1; j < at.length; j++) {
        const r1 = at[i], r2 = at[j];
        const A = r1.a === h ? r1.b : r1.a, B = r2.a === h ? r2.b : r2.a;
        if (A === B || G.findRoute(A, B)) continue;
        const dem = baseDemand(A, B);
        if (!dem) continue;
        const dm = demandMods(A, B);
        const mine = attract(Math.min(r1.last.legs, r2.last.legs),
                             (r1.priceMult + r2.priceMult) / 2, s.rep) * 0.6 *
                     (1 - BAL.OFFPEAK_MALUS * offPeakShare(h));
        let sumAttr = mine + incumbent(dem);
        (RIVAL_IDX.get(pairKey(A, B)) || []).forEach(x =>
          sumAttr += attract(x.rt.freq, x.rt.price, x.r.rep));
        const share = sumAttr > 0 ? mine / sumAttr : 0.6;
        const want = dem.total * dm * share * BAL.CONNECT_RATE;
        const pax = Math.min(want, r1.last.spare, r2.last.spare);

        // Les correspondances qu'on ne peut pas embarquer faute de sièges sont
        // une demande refusée, au même titre que le trafic direct : on l'impute
        // au tronçon qui bloque, c'est là qu'il faut ajouter un appareil.
        const lost = want - pax;
        if (lost > 0.5) {
          if (r1.last.spare <= r2.last.spare) r1.last.unmet += lost;
          if (r2.last.spare <= r1.last.spare) r2.last.unmet += lost;
        }
        if (pax <= 0.5) continue;

        const rev = pax * dem.price * 1.15 * ((r1.priceMult + r2.priceMult) / 2);
        const cCater = pax * (BAL.CATERING_A + BAL.CATERING_B * dem.dist);
        const cDist = rev * BAL.DISTRIB_RATE;
        L.revConnect += rev; L.catering += cCater; L.distrib += cDist;

        r1.last.spare -= pax; r2.last.spare -= pax;
        r1.last.rev += rev / 2; r2.last.rev += rev / 2;
        r1.last.cost += (cCater + cDist) / 2; r2.last.cost += (cCater + cDist) / 2;
        r1.last.connect += pax; r2.last.connect += pax;
        r1.last.pax += pax; r2.last.pax += pax;
        s.month.rpk += pax * dem.dist;
        dayRev += rev; dayCost += cCater + cDist; dayPax += pax;
      }
    }
  });

  s.routes.forEach(r => {
    r.last.profit = r.last.rev - r.last.cost;
    if (r.last.seats > 0) r.last.lf = Math.min(1, r.last.pax / r.last.seats);
    // cumul du mois en cours, remis à zéro à la clôture : c'est lui qui
    // départage les lignes dans le bilan mensuel
    const t = r.mtd || (r.mtd = {rev:0, cost:0, profit:0, pax:0, days:0});
    t.rev += r.last.rev; t.cost += r.last.cost;
    t.profit += r.last.profit; t.pax += r.last.pax; t.days++;
  });

  // ---- 4. concurrents ----
  s.rivals.forEach(rv => {
    let pax = 0;
    rv.routes.forEach(rt => {
      const dem = baseDemand(rt.a, rt.b);
      if (!dem) return;
      const mine = attract(rt.freq, rt.price, rv.rep);
      let sum = mine + incumbent(dem);
      (RIVAL_IDX.get(pairKey(rt.a, rt.b)) || []).forEach(x => {
        if (x.r !== rv) sum += attract(x.rt.freq, x.rt.price, x.r.rep);
      });
      const pr = G.findRoute(rt.a, rt.b);
      if (pr && pr.last.legs > 0)
        sum += attract(pr.last.legs, pr.priceMult, s.rep) * offPeakPenalty(pr.a, pr.b);
      const share = sum > 0 ? mine / sum : 1;
      pax += Math.min(dem.total * demandMods(rt.a, rt.b) * share, rt.freq * rt.seats * 0.92);
    });
    rv.paxDay = pax;
  });

  // ---- 5. trésorerie ----
  s.cash += dayRev - dayCost;
  s.month.rev += dayRev; s.month.cost += dayCost;
  s.month.pax += dayPax; s.month.cargo += dayCargo;
  s.today = {rev: dayRev, cost: dayCost, pax: dayPax};
  s.totals.pax += dayPax;


  // ---- 6. maintenance ----
  s.fleet.forEach(ac => {
    if (ac.status === 'maint') {
      ac.maintLeft--;
      if (ac.maintLeft <= 0) {
        ac.wear = 0.03; ac.status = ac.routeId ? 'flying' : 'idle'; ac.warned = false;
        pushLog('Révision terminée', ac.reg + ' est de nouveau disponible.', 'good');
      }
    }
  });

  // ---- 6 bis. révisions automatiques ----
  if (G.hasProgram('auto')) {
    // capacité d'atelier limitée : on ne cloue pas toute la flotte au sol le
    // même jour, les plus usés passent d'abord
    const inShop = s.fleet.filter(a => a.status === 'maint').length;
    const slotsShop = Math.max(1, Math.ceil(s.fleet.length / 6)) - inShop;
    if (slotsShop > 0) {
      s.fleet
        .filter(a => a.status !== 'maint' && a.wear >= BAL.MAINT_THRESHOLD)
        .sort((a, b) => b.wear - a.wear)
        .slice(0, slotsShop)
        .forEach(ac => {
          if (s.cash < G.maintCost(ac.id) * 3) return;   // on garde de la marge
          G.sendMaint(ac.id, true);
        });
    }
  }

  tickEvents();

  // ---- 7. faillite (jamais en mode créatif) ----
  if (DIFF().sandbox) { s.cash = Math.max(s.cash, DIFF().cash); s.negDays = 0; }
  else if (s.cash < 0) {
    s.negDays++;
    if (s.negDays === 15 || s.negDays === 35)
      pushLog('Alerte trésorerie', 'Vous êtes à découvert depuis ' + s.negDays +
              ' jours. Faillite dans ' + (BAL.BANKRUPT_DAYS - s.negDays) + ' jours.', 'bad');
    if (s.negDays >= BAL.BANKRUPT_DAYS && !s.dead) { s.dead = true; G.emit('gameover'); }
  } else s.negDays = 0;
}

/* -------------------------------- événements ----------------------------- */
function tickEvents() {
  const s = G.s;
  for (let i = s.events.length - 1; i >= 0; i--) {
    const e = s.events[i];
    e.left--;
    if (e.left <= 0) {
      const def = EVENT_DEFS.find(d => d.id === e.id);
      resetMods();
      s.events.splice(i, 1);
      s.events.forEach(x => { const d2 = EVENT_DEFS.find(d => d.id === x.id); d2.apply(s, x.region, x.city); });
      pushLog('Retour à la normale', (def ? def.title : 'L’événement') + ' : c’est terminé.', '');
    }
  }
  if (s.day > 45 && Math.random() < 0.0038 && s.events.length < 2) {
    const def = EVENT_DEFS[Math.floor(Math.random() * EVENT_DEFS.length)];
    if (s.events.some(e => e.id === def.id)) return;
    let region = null, city = null, label = def.title;
    if (def.regional) {
      const rs = Object.keys(REGION_NAMES);
      region = rs[Math.floor(Math.random() * rs.length)];
      label += ' — ' + REGION_NAMES[region];
    }
    if (def.cityBound) {
      const pool = s.routes.length ? s.routes : null;
      const c = pool ? [pool[Math.floor(Math.random() * pool.length)].a]
                     : [CITIES[Math.floor(Math.random() * CITIES.length)].code];
      city = c[0];
      label += ' — ' + CITY_BY_CODE[city].name;
    }
    def.apply(s, region, city);
    s.events.push({id: def.id, left: def.days, region, city, label});
    pushLog(label, def.text, 'evt');
    s.log[0].stop = true;
    G.emit('event', {title: label, text: def.text, days: def.days});
  }
}
function resetMods() {
  G.s.mods = {fuel:1, demand:1, region:null, regionMult:1, closed:null,
              hotCity:null, hotMult:1, acPrice:1, fees:1};
}

/* ========================================================================= */
/*                                 MENSUEL                                   */
/* ========================================================================= */
function monthEnd() {
  const s = G.s, L = s.month.led;

  let slots = 0;
  Object.keys(s.slots).forEach(c => slots += s.slots[c] * BAL.SLOT_UPKEEP);
  Object.keys(s.slotsOff || {}).forEach(c => slots += s.slotsOff[c] * BAL.SLOT_UPKEEP * 0.7);
  const marketing = s.routes.length * BAL.MARKETING_ROUTE;
  let interest = 0;
  s.loans.forEach(l => {
    const int = l.remaining * BAL.LOAN_RATE / 12;
    l.remaining -= Math.min(l.remaining, l.monthly - int);
    l.months--;
    interest += l.monthly;
  });
  s.loans = s.loans.filter(l => l.remaining > 1);

  L.hq += BAL.MONTHLY_HQ; L.slots += slots; L.marketing += marketing; L.interest += interest;
  const structure = BAL.MONTHLY_HQ + slots + marketing + interest;
  s.cash -= structure;
  s.month.cost += structure;

  s.fleet.forEach(a => a.ageM++);

  // réputation
  const nf = s.fleet.length || 1;
  const avgWear = s.fleet.reduce((t, a) => t + a.wear, 0) / nf;
  const avgAge = s.fleet.reduce((t, a) => t + a.ageM, 0) / nf / 12;
  const cabBonus = s.fleet.reduce((t, a) =>
    t + (CABINS[a.cabin] ? CABINS[a.cabin].rep : 0) + modSum(a, 'rep'), 0) / nf;
  const avgPM = s.routes.length ? s.routes.reduce((t, r) => t + r.priceMult, 0) / s.routes.length : 1;
  const target = 70 - 32 * avgWear - 0.7 * avgAge + cabBonus + 1.6 * s.hubs.length
               - 16 * Math.max(0, avgPM - 1.10) + 14 * Math.max(0, 1.0 - avgPM) * 0.4
               + 5 * Math.min(1, s.routes.length / 14);
  s.rep += (Math.max(15, Math.min(96, target)) - s.rep) * 0.28;

  const m = s.month;
  s.history.push({
    y: s.y, m: s.m, rev: m.rev, cost: m.cost, profit: m.rev - m.cost,
    cash: s.cash, pax: m.pax, cargo: m.cargo, fleet: s.fleet.length,
    routes: s.routes.length, ask: m.ask, rpk: m.rpk, ftk: m.ftk,
    hours: m.hours, flights: m.flights, cancels: m.cancels,
    led: m.led, value: G.companyValue(), rep: s.rep, share: G.marketShare()
  });
  if (s.history.length > 240) s.history.shift();

  // bilan de l'année civile : une année bénéficiaire avec une réputation
  // correcte prolonge la série, sinon elle repart de zéro
  s.yearProfit = (s.yearProfit || 0) + (m.rev - m.cost);
  if (s.m === 11) {
    const D = DIFF();
    if (s.yearProfit > 0 && s.rep >= D.minRep) {
      s.profitStreak = (s.profitStreak || 0) + 1;
      pushLog('Exercice clos', 'Année ' + s.y + ' bénéficiaire (' + money(s.yearProfit) +
              '). ' + s.profitStreak + ' année(s) de suite dans le vert.', 'good');
    } else {
      if (s.profitStreak) pushLog('Exercice clos',
        'La série d’années bénéficiaires est rompue.', 'bad');
      s.profitStreak = 0;
    }
    s.yearProfit = 0;
  }
  worksTurn();
  const report = buildReport();
  s.month = newMonth();
  s.routes.forEach(r => r.mtd = null);

  rivalTurn();
  checkVictory();
  G.emit('report', report);
}

/* --------------------------- bilan de fin de mois ------------------------ */
/* Ce qui a changé depuis le mois précédent, ce qui a le mieux et le moins bien
   marché, et ce qu'ont fait les concurrents. Construit après l'écriture de
   l'historique, avant la remise à zéro des compteurs. */
function buildReport() {
  const s = G.s;
  const h = s.history, cur = h[h.length - 1], prev = h.length > 1 ? h[h.length - 2] : null;
  const rank = s.routes.filter(r => r.mtd && r.mtd.days)
    .map(r => ({r: r, profit: r.mtd.profit, pax: r.mtd.pax,
                lf: r.last.lf, state: G.routeState(r)}))
    .sort((x, y) => y.profit - x.profit);

  const month = MONTHS[cur.m] + ' ' + cur.y;
  const news = s.log.filter(l => l.day > s.day - daysInMonth() &&
                                 (l.k === 'evt' || l.k === 'bad' || l.cat === 'concurrence'))
                    .slice(0, 6);

  return {
    month: month, y: cur.y, m: cur.m, days: daysInMonth(),
    profit: cur.profit, dProfit: prev ? cur.profit - prev.profit : null,
    rev: cur.rev, dRev: prev ? cur.rev - prev.rev : null,
    cost: cur.cost, dCost: prev ? cur.cost - prev.cost : null,
    cash: cur.cash, dCash: prev ? cur.cash - prev.cash : null,
    pax: cur.pax, dPax: prev ? cur.pax - prev.pax : null,
    value: cur.value, dValue: prev ? cur.value - prev.value : null,
    rep: cur.rep, dRep: prev ? cur.rep - prev.rep : null,
    share: cur.share, dShare: prev ? cur.share - prev.share : null,
    fleet: cur.fleet, routes: cur.routes,
    lf: cur.ask > 0 ? cur.rpk / cur.ask : 0,
    best: rank.slice(0, 3), worst: rank.slice(-3).reverse().filter(x => x.profit < 0),
    news: news,
    events: s.events.map(e => ({label: e.label, left: e.left})),
    rivals: s.rivals.map(rv => ({name: rv.name, color: rv.color, pax: rv.paxDay,
                                 routes: rv.routes.length}))
                    .sort((a, b) => b.pax - a.pax),
    streak: s.profitStreak || 0
  };
}

/* ----------------------------- IA concurrente ---------------------------- */
const RIVAL_MAX_ROUTES = 30, RIVAL_MAX_FREQ = 9;
function rivalTurn() {
  const s = G.s;
  s.rivals.forEach(rv => {
    const aggro = rv.aggro * DIFF().aggro;
    const budget = aggro * (0.9 + Math.random() * 0.6);

    // 0. guerre des prix : là où le joueur domine, on casse les tarifs
    if (DIFF().aggro >= 1) {
      s.routes.forEach(r => {
        if (r.last.share < 0.42 || r.last.pax < 120) return;
        const ex = rv.routes.find(rt => pairKey(rt.a, rt.b) === pairKey(r.a, r.b));
        if (!ex) return;
        if (Math.random() < 0.34 * aggro) {
          ex.price = Math.max(0.68, ex.price - 0.035);
          ex.freq = Math.min(RIVAL_MAX_FREQ, ex.freq + 1);
        }
      });
    }

    // 1. réaction : attaquer les meilleures lignes du joueur
    if (Math.random() < 0.30 * aggro && s.routes.length) {
      const best = s.routes.slice().sort((a, b) => b.last.profit - a.last.profit)[0];
      if (best && best.last.profit > 25e3) {
        const okRegion = rv.regions.indexOf(CITY_BY_CODE[best.a].region) >= 0 ||
                         rv.regions.indexOf(CITY_BY_CODE[best.b].region) >= 0;
        if (okRegion) {
          const ex = rv.routes.find(rt => pairKey(rt.a, rt.b) === pairKey(best.a, best.b));
          if (ex) { ex.freq = Math.min(RIVAL_MAX_FREQ, ex.freq + 1); ex.price = Math.max(0.72, ex.price - 0.04); }
          else if (rv.routes.length < RIVAL_MAX_ROUTES) {
            rv.routes.push({a: best.a, b: best.b, freq: 2, price: rv.priceMult * 0.95,
                            seats: 190});
            pushLog('Concurrence', rv.name + ' ouvre une ligne ' + CITY_BY_CODE[best.a].name +
                    ' ↔ ' + CITY_BY_CODE[best.b].name + ' face à vous.', 'bad');
          }
        }
      }
    }
    // 2. croissance organique — de plus en plus lente à mesure qu'ils grossissent
    const saturation = Math.max(0.1, 1 - rv.routes.length / RIVAL_MAX_ROUTES);
    if (Math.random() > saturation) return;
    const n = Math.random() < budget - 0.5 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      if (Math.random() > 0.55) {
        // renforcer une ligne existante
        if (rv.routes.length) {
          const rt = rv.routes[Math.floor(Math.random() * rv.routes.length)];
          if (rt.freq < RIVAL_MAX_FREQ) rt.freq++;
        }
      } else {
        if (rv.routes.length >= RIVAL_MAX_ROUTES) continue;
        // ouvrir une liaison depuis une de ses villes
        const from = rv.routes.length && Math.random() < 0.6
          ? [rv.home, rv.routes[Math.floor(Math.random() * rv.routes.length)].b][Math.random() < 0.5 ? 0 : 1]
          : rv.home;
        const cand = CITIES.filter(c => c.code !== from && rv.regions.indexOf(c.region) >= 0 &&
          !rv.routes.some(rt => pairKey(rt.a, rt.b) === pairKey(from, c.code)));
        if (!cand.length) continue;
        cand.sort((x, y) => ((baseDemand(from, y.code) || {total:0}).total) -
                            ((baseDemand(from, x.code) || {total:0}).total));
        const pick = cand[Math.floor(Math.random() * Math.min(6, cand.length))];
        const dem = baseDemand(from, pick.code);
        if (!dem || dem.total < 90) continue;
        if (slotsFree(pick.code) <= 0) continue;
        rv.routes.push({a: from, b: pick.code, freq: 2, price: rv.priceMult, seats: 200});
      }
    }
    rv.rep += (rv.rep < 82 ? 0.15 : -0.1) * (Math.random() < 0.5 ? 1 : 0);
  });
  rebuildRivalIndex();
}

/* --------------------------- état d'une ligne ---------------------------- */
/* Quatre situations, du plus urgent au plus banal. « saturée » veut dire que
   la demande dépasse les sièges offerts : des passagers repartent chez le
   concurrent, il faut ajouter un appareil ou monter en fréquence. */
G.routeState = function (r) {
  if (!r.ac.length)        return 'vide';
  if (r.last.legs === 0)   return 'clouee';
  // « Saturée » ne veut pas dire « pleine » : un avion plein est le régime
  // normal d'une ligne bien réglée. Ce qui appelle une action, c'est la demande
  // qu'on renvoie faute de sièges — trafic direct comme correspondances.
  // Seuil calé sur la mesure : une ligne correctement dotée renvoie environ
  // autant de monde qu'elle en transporte ; une ligne étranglée en renvoie
  // trois à quatre fois plus. On alerte au-delà de une fois et demie.
  const turned = r.last.unmet || 0;
  if (r.last.lf >= 0.88 && turned > Math.max(10, r.last.pax * 1.5)) return 'saturee';
  if (r.last.profit < 0) return 'deficitaire';
  // Sans demande renvoyée en masse, une ligne qui part complète reste saine,
  // mais elle est au plafond : plus un siège à vendre. On la signale.
  if (r.last.lf >= 0.99) return 'pleine';
  if (r.last.lf < 0.50)  return 'creuse';
  return 'normale';
};
G.ROUTE_STATES = {
  saturee:     {label: 'saturée',      tag: 'bad',
                hint: 'Les avions partent pleins : vous refusez des passagers. Ajoutez un appareil, ' +
                      'montez en fréquence ou augmentez le tarif.'},
  pleine:      {label: 'pleine',       tag: 'bad',
                hint: 'Les avions partent complets : impossible de prendre un passager de plus. ' +
                      'Un appareil supplémentaire, ou un tarif plus élevé, augmenterait la recette.'},
  deficitaire: {label: 'déficitaire',  tag: 'warn', hint: 'La ligne perd de l’argent.'},
  creuse:      {label: 'peu remplie',  tag: 'warn', hint: 'Beaucoup de sièges vides : baissez la fréquence ou le tarif.'},
  clouee:      {label: 'clouée au sol','tag': 'bad', hint: 'Aucun vol : appareils immobilisés ou ligne fermée.'},
  vide:        {label: 'sans avion',   tag: 'bad',  hint: 'Aucun appareil affecté.'},
  normale:     {label: '',             tag: '',     hint: ''}
};

/* ------------------------ améliorations et programmes -------------------- */
/* Somme d'un effet donné sur les rétrofits installés sur un appareil. */
function modSum(ac, key) {
  let v = 0;
  (ac.mods || []).forEach(id => { const m = MOD_BY_ID[id]; if (m && m[key]) v += m[key]; });
  return v;
}
G.modSum = modSum;
G.hasProgram = function (id) { return !!(G.s.programs && G.s.programs[id]); };

G.modCostFor = function (ac, modId) {
  return modCost(AC_BY_ID[ac.type], MOD_BY_ID[modId]);
};
G.buyMod = function (acId, modId) {
  const s = G.s, ac = s.fleet.find(a => a.id === acId), m = MOD_BY_ID[modId];
  if (!ac || !m) return {ok:false, why:'Introuvable.'};
  if ((ac.mods || []).indexOf(modId) >= 0) return {ok:false, why:'Déjà installé.'};
  const cost = G.modCostFor(ac, modId);
  if (s.cash < cost) return {ok:false, why:'Trésorerie insuffisante (' + money(cost) + ').'};
  s.cash -= cost;
  ac.mods = (ac.mods || []).concat(modId);
  ac.modPaid = (ac.modPaid || 0) + cost;
  pushLog('Amélioration installée', m.name + ' sur ' + ac.reg + ' — ' + money(cost) + '.', 'good');
  return {ok:true};
};
G.buyProgram = function (id) {
  const s = G.s, p = PROGRAM_BY_ID[id];
  if (!p) return {ok:false, why:'Introuvable.'};
  if (s.programs[id]) return {ok:false, why:'Programme déjà en place.'};
  if (s.cash < p.cost) return {ok:false, why:'Trésorerie insuffisante (' + money(p.cost) + ').'};
  s.cash -= p.cost;
  s.programs[id] = true;
  pushLog('Programme lancé', p.name + ' — ' + money(p.cost) + '.', 'good');
  return {ok:true};
};

/* --------------------------- statistiques aéroport ----------------------- */
G.airportStats = function (code) {
  const s = G.s, c = CITY_BY_CODE[code];
  const routes = s.routes.filter(r => r.a === code || r.b === code);
  const st = {routes: routes.length, legs: 0, pax: 0, cargo: 0, seats: 0,
              rev: 0, cost: 0, fees: 0, connect: 0, hours: 0, lf: 0};
  routes.forEach(r => {
    st.legs += r.last.legs;
    st.pax += r.last.pax;
    st.cargo += r.last.cargo;
    st.seats += r.last.seats;
    st.connect += r.last.connect;
    st.hours += r.last.hours;
    st.rev += r.last.rev / 2;      // recettes réparties entre les deux escales
    st.cost += r.last.cost / 2;
    r.ac.forEach(id => {
      const ac = s.fleet.find(a => a.id === id);
      if (!ac) return;
      const t = AC_BY_ID[ac.type];
      let l = legsPerDay(t, r.dist);
      if (r.freqCap) l = Math.min(l, r.freqCap);
      st.fees += c.fee * (s.hubs.indexOf(code) >= 0 ? BAL.HUB_FEE_DISCOUNT : 1) *
                 t.feeW * s.mods.fees * l / 2;
    });
  });
  st.lf = st.seats > 0 ? st.pax / st.seats : 0;

  // marché total de l'aéroport, tous transporteurs confondus
  let market = 0;
  CITIES.forEach(x => {
    if (x.code === code) return;
    const d = baseDemand(code, x.code);
    if (d) market += d.total;
  });
  st.market = market;
  st.share = market > 0 ? st.pax / market : 0;

  // concurrents présents
  st.rivals = [];
  s.rivals.forEach(rv => {
    let n = 0, freq = 0;
    rv.routes.forEach(rt => { if (rt.a === code || rt.b === code) { n++; freq += rt.freq; } });
    if (n) st.rivals.push({rv, routes: n, freq});
  });
  st.rivals.sort((a, b) => b.freq - a.freq);

  st.total = slotsTotal(code);
  st.owned = slotsOwned(code);
  st.used = slotsUsed(code);
  st.rivalSlots = Math.min(slotsTotal(code), rivalSlots(code));
  st.free = slotsFree(code);
  return st;
};

/* ------------------------------ valeur / victoire ------------------------ */
G.companyValue = function () {
  const s = G.s;
  let v = s.cash;
  s.fleet.forEach(a => v += acValue(a));
  Object.keys(s.slots).forEach(c => v += slotCost(c) * 0.6 * s.slots[c]);
  s.hubs.forEach(c => v += G.hubCost(c) * 0.5);
  v -= G.debtTotal();
  const h = s.history.slice(-6);
  if (h.length) {
    const avg = h.reduce((t, x) => t + x.profit, 0) / h.length;
    if (avg > 0) v += avg * 10;
  }
  return v;
};
G.marketShare = function () {
  const s = G.s;
  const mine = s.routes.reduce((t, r) => t + r.last.pax, 0);
  let tot = mine;
  s.rivals.forEach(r => tot += r.paxDay);
  return tot > 0 ? mine / tot : 0;
};
/* Les quatre conditions de victoire, et leur avancement. */
G.goals = function () {
  const s = G.s, D = DIFF();
  if (D.sandbox) return [];
  const val = G.companyValue();
  const myPax = s.routes.reduce((t, x) => t + x.last.pax, 0);
  const bestRival = s.rivals.length ? Math.max(...s.rivals.map(r => r.paxDay)) : 0;
  const regions = new Set();
  s.routes.forEach(r => {
    if (r.last.legs > 0) {
      regions.add(CITY_BY_CODE[r.a].region);
      regions.add(CITY_BY_CODE[r.b].region);
    }
  });
  return [
    {id:'value', label:'Valeur d’entreprise',
     done: val >= D.goal, now: val, target: D.goal,
     text: money(val) + ' / ' + money(D.goal)},
    {id:'lead', label:'Première compagnie mondiale',
     done: myPax >= bestRival && myPax > 0, now: myPax, target: Math.max(1, bestRival),
     text: num(myPax) + ' contre ' + num(bestRival) + ' pax/jour au meilleur concurrent'},
    {id:'world', label:'Réseau mondial',
     done: regions.size >= REGION_ALL.length && s.hubs.length >= 3,
     now: regions.size + Math.min(1, s.hubs.length / 3), target: REGION_ALL.length + 1,
     text: regions.size + ' / ' + REGION_ALL.length + ' régions desservies · ' +
           s.hubs.length + ' / 3 hubs' +
           (regions.size < REGION_ALL.length
             ? '. Il manque : ' + REGION_ALL.filter(r => !regions.has(r))
                 .map(r => REGION_NAMES[r]).join(', ') + '.'
             : '')},
    {id:'solid', label:'Rentabilité durable',
     done: s.profitStreak >= D.profitYears && s.rep >= D.minRep,
     now: s.profitStreak, target: D.profitYears,
     text: s.profitStreak + ' / ' + D.profitYears + ' années bénéficiaires d’affilée · ' +
           'réputation ' + Math.round(s.rep) + ' / ' + D.minRep}
  ];
};

/* ========================================================================= */
/*                          CENTRE D'ALERTES                                 */
/* ========================================================================= */
/* Tout ce qui, à cet instant, mérite une décision : classé du plus urgent au
   plus accessoire, chaque entrée portant l'action qui la règle. C'est la
   réponse à « je ne sais pas quoi faire ensuite ». */

/* Le conseil de ligne coûte quelques milliers de simulations : on ne le
   recalcule qu'une fois par jour de jeu, et seulement si on le demande. */
let adviceCache = {day: -1, list: null, gain: 0};
G.adviceScan = function () {
  const s = G.s;
  if (adviceCache.day === s.day && adviceCache.list) return adviceCache;
  const list = [];
  s.routes.forEach(r => {
    const a = G.routeAdvice(r);
    if (a && a.action && (a.action.a === 'optfreq' || a.action.a === 'optprice'))
      list.push({route: r, advice: a});
  });
  adviceCache = {day: s.day, list: list, gain: 0};
  return adviceCache;
};

const SEV_RANK = {bad: 0, warn: 1, info: 2};

/* `deep` déclenche en plus le balayage des réglages de ligne, coûteux : le
   panneau d'alertes le demande, les pastilles de la barre d'outils non. */
G.alerts = function (deep) {
  const s = G.s, out = [];
  if (!s) return out;
  const push = a => out.push(a);
  const D = DIFF();

  /* ------------------------------ finances ------------------------------ */
  if (!D.sandbox && s.cash < 0)
    push({id: 'cash-neg', sev: 'bad', panel: 'finance',
          title: 'Trésorerie négative',
          text: 'À découvert depuis ' + s.negDays + ' jour' + (s.negDays > 1 ? 's' : '') +
                '. Dépôt de bilan dans ' + Math.max(0, BAL.BANKRUPT_DAYS - s.negDays) +
                ' jours si rien ne change. Empruntez, vendez un appareil ou fermez vos lignes déficitaires.',
          action: {a: 'panel', v: 'finance', label: 'Ouvrir les finances'}});
  else if (!D.sandbox) {
    const burn = s.history.length ? s.history[s.history.length - 1].profit : 0;
    if (burn < 0 && s.cash < -burn * 2)
      push({id: 'cash-low', sev: 'warn', panel: 'finance',
            title: 'Trésorerie tendue',
            text: 'Il reste ' + money(s.cash) + ' en caisse pour une perte de ' + money(-burn) +
                  ' le mois dernier : moins de deux mois de réserve.',
            action: {a: 'panel', v: 'finance', label: 'Ouvrir les finances'}});
  }

  /* -------------------------------- flotte ------------------------------ */
  const aog = s.fleet.filter(a => a.status === 'aog');
  if (aog.length)
    push({id: 'aog', sev: 'bad', panel: 'fleet',
          title: aog.length + ' appareil' + (aog.length > 1 ? 's cloués' : ' cloué') + ' au sol',
          text: 'Usure à 100 % : ' + aog.map(a => a.reg).slice(0, 4).join(', ') +
                (aog.length > 4 ? '…' : '') + '. Ils coûtent leurs charges passives sans voler.',
          action: aog.length > 1
            ? {a: 'fleetsel', v: aog.map(a => a.id).join(','),
               label: 'Sélectionner les ' + aog.length + ' appareils'}
            : {a: 'maint', v: aog[0].id, label: 'Envoyer ' + aog[0].reg + ' en révision'}});

  const worn = s.fleet.filter(a => a.status !== 'maint' && a.status !== 'aog' &&
                                   a.wear >= BAL.MAINT_THRESHOLD);
  if (worn.length && !G.hasProgram('auto')) {
    worn.sort((a, b) => b.wear - a.wear);
    push({id: 'wear', sev: 'warn', panel: 'fleet',
          title: worn.length + ' appareil' + (worn.length > 1 ? 's usés' : ' usé'),
          text: 'Au-delà de ' + pct(BAL.MAINT_THRESHOLD) + ' d’usure, les vols commencent à être annulés. ' +
                'Le plus touché : ' + worn[0].reg + ' à ' + pct(worn[0].wear) + '.',
          action: worn.length > 1
            ? {a: 'fleetsel', v: worn.map(a => a.id).join(','),
               label: 'Sélectionner les ' + worn.length + ' appareils'}
            : {a: 'maint', v: worn[0].id, label: 'Réviser ' + worn[0].reg}});
  }

  const idle = s.fleet.filter(a => !a.routeId && a.status !== 'maint');
  if (idle.length) {
    const cost = idle.reduce((t, a) => t + G.aircraftFixedTotal(a), 0) / 30;
    push({id: 'idle', sev: 'warn', panel: 'fleet',
          title: idle.length + ' appareil' + (idle.length > 1 ? 's sans ligne' : ' sans ligne'),
          text: 'Un avion au sol paie quand même son équipage, son assurance et son hangar : ' +
                money(cost) + ' par jour perdus. Affectez-le ou revendez-le.',
          action: {a: 'fleetsel', v: idle.map(a => a.id).join(','),
                   label: idle.length > 1 ? 'Sélectionner les ' + idle.length + ' appareils'
                                          : 'Voir ' + idle[0].reg}});
  }

  /* -------------------------------- réseau ------------------------------ */
  const byState = {};
  s.routes.forEach(r => {
    const st = G.routeState(r);
    (byState[st] || (byState[st] = [])).push(r);
  });

  (byState.vide || []).slice(0, 1).forEach(() => {
    const list = byState.vide;
    push({id: 'route-vide', sev: 'bad', panel: 'network',
          title: list.length + ' ligne' + (list.length > 1 ? 's sans appareil' : ' sans appareil'),
          text: 'Ouverte' + (list.length > 1 ? 's' : '') + ' mais sans avion : ' +
                list.slice(0, 3).map(r => CITY_BY_CODE[r.a].name + ' ↔ ' + CITY_BY_CODE[r.b].name).join(', ') +
                '. Elles paient leur marketing sans rien transporter.',
          action: {a: 'route', v: list[0].id, label: 'Ouvrir la fiche'}});
  });

  const sat = (byState.saturee || []).concat(byState.pleine || []);
  if (sat.length) {
    sat.sort((a, b) => (b.last.unmet || 0) - (a.last.unmet || 0));
    const lost = sat.reduce((t, r) => t + (r.last.unmet || 0), 0);
    push({id: 'route-sat', sev: 'warn', panel: 'network',
          title: sat.length + ' ligne' + (sat.length > 1 ? 's saturées' : ' saturée'),
          text: 'Vous refusez environ ' + num(lost) + ' passagers par jour faute de sièges. ' +
                'La plus étranglée : ' + CITY_BY_CODE[sat[0].a].name + ' ↔ ' + CITY_BY_CODE[sat[0].b].name + '.',
          action: {a: 'route', v: sat[0].id, label: 'Ouvrir la fiche'}});
  }

  const def = (byState.deficitaire || []).slice().sort((a, b) => a.last.profit - b.last.profit);
  if (def.length) {
    const loss = def.reduce((t, r) => t + r.last.profit, 0);
    push({id: 'route-def', sev: 'warn', panel: 'network',
          title: def.length + ' ligne' + (def.length > 1 ? 's déficitaires' : ' déficitaire'),
          text: money(-loss) + ' par jour de pertes. La pire : ' +
                CITY_BY_CODE[def[0].a].name + ' ↔ ' + CITY_BY_CODE[def[0].b].name +
                ' à ' + moneySigned(def[0].last.profit) + ' par jour.',
          action: {a: 'route', v: def[0].id, label: 'Ouvrir la fiche'}});
  }

  const creuse = (byState.creuse || []);
  if (creuse.length)
    push({id: 'route-creuse', sev: 'info', panel: 'network',
          title: creuse.length + ' ligne' + (creuse.length > 1 ? 's peu remplies' : ' peu remplie'),
          text: 'Moins de la moitié des sièges vendus. Baissez la fréquence ou le tarif, ' +
                'ou mettez un appareil plus petit.',
          action: {a: 'route', v: creuse[0].id, label: 'Ouvrir la fiche'}});

  /* ------------------------- réglages perfectibles ---------------------- */
  const scan = deep ? G.adviceScan() : {list: []};
  if (scan.list.length)
    push({id: 'tuning', sev: 'info', panel: 'network',
          title: scan.list.length + ' ligne' + (scan.list.length > 1 ? 's mal réglées' : ' mal réglée'),
          text: 'Le tarif ou la fréquence y laissent de l’argent sur la table. ' +
                'Première concernée : ' + CITY_BY_CODE[scan.list[0].route.a].name + ' ↔ ' +
                CITY_BY_CODE[scan.list[0].route.b].name + ' — ' + scan.list[0].advice.text,
          action: scan.list[0].advice.action});

  /* ------------------------------ créneaux ------------------------------ */
  let dorm = 0, dormCity = null;
  Object.keys(s.slots).forEach(c => {
    const free = s.slots[c] - slotsUsed(c);
    if (free > 0) { dorm += free; if (!dormCity || free > (s.slots[dormCity] - slotsUsed(dormCity))) dormCity = c; }
  });
  if (dorm >= 2)
    push({id: 'slots-idle', sev: 'info', panel: 'network',
          title: dorm + ' créneaux inutilisés',
          text: 'Chaque créneau détenu coûte ' + money(BAL.SLOT_UPKEEP) + ' par mois, utilisé ou non — ' +
                money(dorm * BAL.SLOT_UPKEEP) + ' au total. Le plus dormant est à ' +
                CITY_BY_CODE[dormCity].name + '.',
          action: {a: 'city', v: dormCity, label: 'Voir ' + CITY_BY_CODE[dormCity].name}});

  /* ------------------------------ objectifs ----------------------------- */
  if (!D.sandbox && s.routes.length >= 3) {
    const g = G.goals().filter(x => !x.done);
    if (g.length)
      push({id: 'goal', sev: 'info', panel: 'goals',
            title: 'Objectif : ' + g[0].label.toLowerCase(),
            text: g[0].text,
            action: {a: 'panel', v: 'goals', label: 'Voir les objectifs'}});
  }

  /* --------------------------- premiers pas ----------------------------- */
  if (!s.routes.length)
    push({id: 'start', sev: 'info', panel: 'network',
          title: 'Ouvrez votre première ligne',
          text: 'Partez de votre base, ' + CITY_BY_CODE[s.home].name +
                ' : sa fiche liste les marchés les plus porteurs, avec un bouton « ouvrir » par destination.',
          action: {a: 'city', v: s.home, label: 'Voir ' + CITY_BY_CODE[s.home].name}});

  out.sort((a, b) => SEV_RANK[a.sev] - SEV_RANK[b.sev]);
  return out;
};

/* Comptage par panneau, pour les pastilles de la barre d'outils. */
G.alertCounts = function () {
  const c = {total: 0, worst: null};
  G.alerts(false).forEach(a => {
    c[a.panel] = (c[a.panel] || 0) + 1;
    c.total++;
    if (!c.worst || SEV_RANK[a.sev] < SEV_RANK[c.worst]) c.worst = a.sev;
  });
  return c;
};

/* ========================================================================= */
/*                        PALIERS DE COMPAGNIE                               */
/* ========================================================================= */
/* Entre la première ligne et la première place mondiale, il se passe des
   années. Ces paliers donnent un cap intermédiaire : ils ne rapportent rien,
   ils nomment où vous en êtes et ce qui vient ensuite. */

const TIERS = [
  {id: 'locale', name: 'Compagnie locale',
   desc: 'Une ligne, un avion, et les comptes qui commencent à tourner.',
   reqs: s => [
     ['Lignes en service', s.routes.filter(r => r.last.legs > 0).length, 1],
     ['Appareils en ligne', s.fleet.filter(a => a.routeId).length, 1]]},
  {id: 'regionale', name: 'Compagnie régionale',
   desc: 'Un vrai petit réseau autour de votre base.',
   reqs: s => [
     ['Lignes ouvertes', s.routes.length, 4],
     ['Appareils', s.fleet.length, 4],
     ['Réputation', Math.round(s.rep), 60]]},
  {id: 'nationale', name: 'Transporteur national',
   desc: 'Deux plateformes, des correspondances, une flotte qui compte.',
   reqs: s => [
     ['Lignes ouvertes', s.routes.length, 9],
     ['Hubs', s.hubs.length, 2],
     ['Appareils', s.fleet.length, 10]]},
  {id: 'continentale', name: 'Compagnie continentale',
   desc: 'Vos avions sortent de votre région d’origine.',
   reqs: s => [
     ['Régions desservies', regionsServed(s).size, 3],
     ['Appareils', s.fleet.length, 18],
     ['Valeur d’entreprise', Math.round(G.companyValue() / 1e6), 400]]},
  {id: 'intercont', name: 'Compagnie intercontinentale',
   desc: 'Trois hubs, cinq régions : le long-courrier est votre métier.',
   reqs: s => [
     ['Régions desservies', regionsServed(s).size, 5],
     ['Hubs', s.hubs.length, 3],
     ['Appareils', s.fleet.length, 28]]},
  {id: 'mondiale', name: 'Grand réseau mondial',
   desc: 'Les sept régions du monde, et le poids qui va avec.',
   reqs: s => [
     ['Régions desservies', regionsServed(s).size, REGION_ALL.length],
     ['Valeur d’entreprise', Math.round(G.companyValue() / 1e6), 1000],
     ['Passagers par jour', Math.round(s.routes.reduce((t, r) => t + r.last.pax, 0)), 25000]]},
  {id: 'premiere', name: 'Première compagnie mondiale',
   desc: 'Plus aucun concurrent ne transporte plus de monde que vous.',
   reqs: s => {
     const mine = Math.round(s.routes.reduce((t, r) => t + r.last.pax, 0));
     const best = s.rivals.length ? Math.round(Math.max(...s.rivals.map(r => r.paxDay))) : 0;
     return [['Passagers par jour', mine, Math.max(1, best)]];
   }}
];

function regionsServed(s) {
  const set = new Set();
  s.routes.forEach(r => {
    if (r.last.legs > 0) { set.add(CITY_BY_CODE[r.a].region); set.add(CITY_BY_CODE[r.b].region); }
  });
  return set;
}

/* Les paliers, avec l'avancement de chaque condition. Un palier n'est acquis
   que si tous les précédents le sont : le rang ne saute pas d'étape. */
G.tiers = function () {
  const s = G.s;
  let chain = true;
  return TIERS.map(t => {
    const reqs = t.reqs(s).map(r => ({label: r[0], now: r[1], target: r[2], done: r[1] >= r[2]}));
    const met = reqs.every(r => r.done);
    const done = chain && met;
    if (!done) chain = false;
    return {id: t.id, name: t.name, desc: t.desc, reqs: reqs, done: done, met: met};
  });
};

/* Le rang atteint, et le suivant à viser. */
G.tierNow = function () {
  const list = G.tiers();
  let last = -1;
  list.forEach((t, i) => { if (t.done) last = i; });
  return {index: last, tier: last >= 0 ? list[last] : null,
          next: list[last + 1] || null, list: list};
};

/* Appelé une fois par jour : signale le franchissement d'un palier. */
function checkTier() {
  const s = G.s;
  const now = G.tierNow().index;
  if (s.tier === undefined) s.tier = -1;
  if (now > s.tier) {
    s.tier = now;
    const t = TIERS[now];
    pushLog('Nouveau rang', s.airline.name + ' est désormais une ' + t.name.toLowerCase() +
            '. ' + t.desc, 'good');
    G.emit('tier', {index: now, name: t.name, desc: t.desc});
  }
}

function checkVictory() {
  const s = G.s;
  if (s.won || s.dead || DIFF().sandbox) return;
  if (G.goals().every(g => g.done)) {
    s.won = true;
    G.emit('victory', {value: G.companyValue(), share: G.marketShare()});
  }
}

/* ========================================================================= */
/*                            HORLOGE PRINCIPALE                             */
/* ========================================================================= */
const DAYS_IN_MONTH = [31,28,31,30,31,30,31,31,30,31,30,31];
G.acc = 0;
G.step = function (dtSeconds, speed) {
  const s = G.s;
  if (!s || s.dead) return;
  // mode créatif : la caisse est renflouée en continu, rien n'est jamais trop cher
  if (DIFF().sandbox && s.cash < DIFF().cash) s.cash = DIFF().cash;
  // animation des avions
  const frac = dtSeconds * speed / BAL.DAY_SECONDS;
  s.fleet.forEach(ac => {
    if (ac.status !== 'flying' || !ac.routeId) return;
    const r = s.routes.find(x => x.id === ac.routeId);
    if (!r) return;
    const t = AC_BY_ID[ac.type];
    let L = legsPerDay(t, r.dist);
    if (r.freqCap) L = Math.min(L, r.freqCap);
    ac.phase += frac * Math.max(1, L);
    while (ac.phase >= 1) { ac.phase -= 1; ac.dir *= -1; }
  });

  G.acc += frac;
  let guard = 0;
  while (G.acc >= 1 && guard++ < 40) {
    G.acc -= 1;
    advanceDay();
  }
};
function advanceDay() {
  const s = G.s;
  simulateDay();
  checkTier();
  s.day++;
  s.d++;
  const dim = DAYS_IN_MONTH[s.m] + ((s.m === 1 && s.y % 4 === 0) ? 1 : 0);
  if (s.d > dim) {
    s.d = 1;
    monthEnd();
    s.m++;
    if (s.m > 11) { s.m = 0; s.y++; s.rivals.forEach(r => r.revYear = 0); }
    G.emit('month');
  }
  G.emit('day');
}

/* ------------------------------ sauvegarde ------------------------------- */
const SAVE_KEY = 'skyline.save.v1';
G.save = function () {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(G.s));
    return true;
  } catch (e) { return false; }
};
G.hasSave = function () {
  try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
};
/* Une partie sauvegardée par une version antérieure n'a pas les champs ajoutés
   depuis. On les complète au chargement plutôt que de refuser la sauvegarde :
   une campagne de plusieurs heures ne doit pas se perdre à chaque évolution. */
function migrate(s) {
  s.programs = s.programs || {};
  s.diff = DIFFICULTIES[s.diff] ? s.diff : 'facile';   // parties d'avant les niveaux
  s.profitStreak = s.profitStreak || 0;
  s.yearProfit = s.yearProfit || 0;
  s.slots    = s.slots    || {};
  s.hubs     = s.hubs     || [s.home];
  s.loans    = s.loans    || [];
  s.events   = s.events   || [];
  s.log      = s.log      || [];
  s.history  = s.history  || [];
  s.totals   = s.totals   || {pax: 0, flights: 0};
  s.today    = s.today    || {rev: 0, cost: 0, pax: 0};
  s.negDays  = s.negDays  || 0;
  s.mods = Object.assign({fuel:1, demand:1, region:null, regionMult:1, closed:null,
                          hotCity:null, hotMult:1, acPrice:1, fees:1}, s.mods || {});

  (s.fleet || []).forEach(ac => {
    ac.mods    = ac.mods    || [];
    ac.modPaid = ac.modPaid || 0;
    if (typeof ac.phase !== 'number') ac.phase = Math.random();
    if (typeof ac.dir   !== 'number') ac.dir = 1;
  });

  (s.routes || []).forEach(r => {
    r.ac = r.ac || [];
    r.last = Object.assign({pax:0, rev:0, cost:0, profit:0, lf:0, seats:0, share:0, cargo:0,
                            connect:0, spare:0, unmet:0, cancel:0, legs:0, hours:0,
                            fixed:0, varCost:0}, r.last || {});
  });

  // le mois en cours et l'historique doivent porter le grand livre détaillé
  const m = newMonth();
  s.month = Object.assign(m, s.month || {});
  s.month.led = Object.assign(newLedger(), s.month.led || {});
  s.history.forEach(h => {
    h.led = Object.assign(newLedger(), h.led || {});
    ['ask','rpk','ftk','hours','flights','cancels','routes'].forEach(k => h[k] = h[k] || 0);
  });
  return s;
}

G.load = function () {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (!s || s.version !== 1) return false;
    G.s = migrate(s);
    G.demandCache.clear();
    rebuildRivalIndex();
    return true;
  } catch (e) { return false; }
};
G.wipe = function () { localStorage.removeItem(SAVE_KEY); };
