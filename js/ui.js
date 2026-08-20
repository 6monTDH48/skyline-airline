/* =========================================================================
   ui.js — panneaux, fiches, modales
   ========================================================================= */

/* Résumé chiffré de l'effet d'une amélioration, pour l'infobulle. */
function modEffect(m) {
  const out = [];
  if (m.fuel) out.push(pct(-m.fuel) + ' de carburant');
  if (m.wear) out.push(pct(-m.wear) + ' d’usure');
  if (m.maint) out.push('+' + pct(m.maint) + ' de maintenance');
  if (m.fare) out.push('+' + pct(m.fare) + ' de tolérance tarifaire');
  if (m.rep)  out.push('+' + m.rep.toFixed(1) + ' de réputation');
  return out.join(', ');
}

const UI = {
  panel: null, ctx: null, dirty: true,

  el(id) { return document.getElementById(id); },

  /* ------------------------------- dock ---------------------------------- */
  /* Historique de navigation : ouvrir une fiche depuis un panneau empile la vue
     précédente, la flèche du bandeau y revient. Les boutons de la barre d'outils
     repartent de zéro, ce sont des points d'entrée. */
  hist: [],

  open(panel, arg, opts) {
    const root = opts && opts.root;
    const back = opts && opts.back;
    if (!back) {
      if (root) this.hist = [];
      else if (this.panel && !(this.panel === panel && this.ctx === arg)) {
        this.hist.push({panel: this.panel, ctx: this.ctx});
        if (this.hist.length > 30) this.hist.shift();
      }
    }
    this.panel = panel; this.ctx = arg;
    this.el('dock').classList.add('open');
    this.el('hud').classList.add('shift');
    this.el('opts').classList.add('shift');
    this.el('legend').classList.add('hide');
    document.querySelectorAll('#toolbar button[data-panel]').forEach(b =>
      b.classList.toggle('on', b.dataset.panel === panel));
    this.render();
  },

  /* Revient à la vue précédente. Renvoie false s'il n'y a rien à dépiler. */
  back() {
    const prev = this.hist.pop();
    if (!prev) return false;
    if (prev.panel === 'city')  Map2D.selCity = prev.ctx;
    if (prev.panel === 'route') Map2D.selRoute = prev.ctx;
    this.open(prev.panel, prev.ctx, {back: true});
    return true;
  },

  close() {
    this.panel = null;
    this.hist = [];
    this.selClear();
    this.el('dock').classList.remove('open');
    this.el('hud').classList.remove('shift');
    this.el('opts').classList.remove('shift');
    this.el('legend').classList.remove('hide');
    document.querySelectorAll('#toolbar button[data-panel]').forEach(b => b.classList.remove('on'));
    Map2D.selCity = null; Map2D.selRoute = null;
  },
  refresh() { if (this.panel) this.render(); this.topbar(); },

  panelName(v) {
    const names = {alerts:'Alertes', log:'le journal', newroute:'l’assistant de ligne', network:'Réseau', fleet:'Flotte', market:'Constructeurs',
                   finance:'Finances', stats:'Statistiques', rivals:'Concurrence',
                   goals:'Objectifs', help:'Comment jouer'};
    if (v.panel === 'city')  return CITY_BY_CODE[v.ctx] ? CITY_BY_CODE[v.ctx].name : 'la ville';
    if (v.panel === 'aircraft') {
      const a = G.s.fleet.find(x => x.id === v.ctx);
      return a ? a.reg : 'l’appareil';
    }
    if (v.panel === 'route') {
      const r = G.s.routes.find(x => x.id === v.ctx);
      return r ? CITY_BY_CODE[r.a].name + ' ↔ ' + CITY_BY_CODE[r.b].name : 'la ligne';
    }
    return names[v.panel] || 'la vue précédente';
  },

  render() {
    const b = this.el('dockbody');
    if (G.s) this.selPrune();
    let title = '', html = '';
    switch (this.panel) {
      case 'city':    { const r = this.city(this.ctx);    title = r[0]; html = r[1]; break; }
      case 'route':   { const r = this.route(this.ctx);   title = r[0]; html = r[1]; break; }
      case 'aircraft':{ const r = this.aircraft(this.ctx); title = r[0]; html = r[1]; break; }
      case 'alerts':  title = 'Alertes';       html = this.alerts(); break;
      case 'log':     title = 'Journal de bord'; html = this.log(); break;
      case 'newroute':title = 'Ouvrir une ligne'; html = this.newroute(); break;
      case 'network': title = 'Réseau';        html = this.network(); break;
      case 'fleet':   title = 'Flotte';        html = this.fleet(); break;
      case 'market':  title = 'Constructeurs'; html = this.market(); break;
      case 'finance': title = 'Finances';      html = this.finance(); break;
      case 'stats':   title = 'Statistiques';  html = this.stats(); break;
      case 'rivals':  title = 'Concurrence';   html = this.rivals(); break;
      case 'goals':   title = 'Objectifs & actualité'; html = this.goals(); break;
      case 'help':    title = 'Comment jouer'; html = this.help(); break;
      default: return;
    }
    this.el('docktitle').textContent = title;

    // flèche de retour : visible seulement s'il y a une vue précédente
    const bk = this.el('dockback'), prev = this.hist[this.hist.length - 1];
    if (prev) {
      bk.classList.add('on');
      bk.title = 'Retour à ' + this.panelName(prev);
    } else bk.classList.remove('on');

    const keep = b.scrollTop;
    b.innerHTML = html;
    b.scrollTop = keep;
  },

  /* =============================== ALERTES =============================== */
  /* Ce qui appelle une décision, du plus urgent au plus accessoire, avec le
     bouton qui règle chaque point sans avoir à chercher où il se trouve. */
  alerts() {
    const list = G.alerts(true);
    let h = '';
    if (!list.length)
      return '<div class="empty">Rien ne réclame votre attention.<br>' +
             'Vos lignes tournent, votre flotte vole, vos comptes tiennent.</div>';

    const nBad = list.filter(a => a.sev === 'bad').length;
    const nWarn = list.filter(a => a.sev === 'warn').length;
    h += '<div class="card big"><div class="row"><div class="ttl">' + list.length +
         ' point' + (list.length > 1 ? 's' : '') + ' à traiter</div>' +
         (nBad ? '<span class="tag bad">' + nBad + ' urgent' + (nBad > 1 ? 's' : '') + '</span>'
               : (nWarn ? '<span class="tag warn">' + nWarn + ' à surveiller</span>'
                        : '<span class="tag ok">rien d’urgent</span>')) + '</div>' +
         '<div class="mini" style="margin-top:4px">Classés du plus urgent au plus accessoire. ' +
         'Chaque bouton vous emmène là où l’action se règle.</div></div>';

    list.forEach(a => {
      h += '<div class="alert ' + a.sev + '">' +
           '<div class="ttl">' + a.title + '</div>' +
           '<div class="mini" style="margin-top:3px">' + a.text + '</div>';
      if (a.action)
        h += '<div class="row" style="margin-top:8px;justify-content:flex-end">' +
             '<button class="btn sm" data-a="' + a.action.a + '" data-v="' + a.action.v + '">' +
             a.action.label + '</button></div>';
      h += '</div>';
    });
    return h;
  },

  /* Pastilles de la barre d'outils : un compteur sur chaque panneau concerné,
     de la couleur de l'alerte la plus grave qu'il porte. */
  badges() {
    if (!G.s) return;
    const list = G.alerts(false), by = {};
    list.forEach(a => {
      const b = by[a.panel] || (by[a.panel] = {n: 0, sev: 'info'});
      b.n++;
      if (a.sev === 'bad' || (a.sev === 'warn' && b.sev === 'info')) b.sev = a.sev;
    });
    document.querySelectorAll('#toolbar button[data-panel]').forEach(btn => {
      const p = btn.dataset.panel;
      const b = p === 'alerts'
        ? (list.length ? {n: list.length, sev: list[0].sev} : null)
        : by[p];
      let dot = btn.querySelector('.badge');
      if (!b) { if (dot) dot.remove(); return; }
      if (!dot) {
        dot = document.createElement('i');
        dot.className = 'badge';
        btn.appendChild(dot);
      }
      dot.textContent = b.n;
      dot.dataset.sev = b.sev;
    });
  },

  /* ========================== OUVRIR UNE LIGNE =========================== */
  /* L'assistant tient dans une seule vue : les deux escales, ce que pèse la
     liaison, l'appareil à y mettre — classé par retour sur investissement —
     et le devis complet. Un seul bouton achète les créneaux, l'avion, ouvre la
     ligne, l'affecte et la règle. */
  wiz: null,

  /* Ouvre l'assistant. `from`/`to` peuvent être nuls : on les choisit dedans. */
  newRoute(from, to) {
    const w = this.wiz && this.wiz.keep ? this.wiz : {count: 1, typeId: null, cargo: false, sort: 'payback'};
    w.keep = false;
    if (from !== undefined) w.from = from;
    if (to !== undefined) w.to = to;
    if (!w.from && G.s) w.from = G.s.home;
    this.wiz = w;
    this.open('newroute', undefined, {root: true});
  },

  wizSet(k, v) {
    if (!this.wiz) return;
    if (k === 'count') this.wiz.count = Math.max(1, Math.min(8, parseInt(v, 10) || 1));
    else if (k === 'type') this.wiz.typeId = v;
    else if (k === 'cargo') this.wiz.cargo = !this.wiz.cargo;
    else if (k === 'sort') this.wiz.sort = this.wiz.sort === 'payback' ? 'profit' : 'payback';
    else if (k === 'swap') { const t = this.wiz.from; this.wiz.from = this.wiz.to; this.wiz.to = t; }
    this.render();
  },

  newroute() {
    const s = G.s, w = this.wiz || (this.wiz = {count: 1, from: s.home, sort: 'payback'});
    const cityBtn = (role, code) =>
      '<button class="pick' + (code ? '' : ' empty') + '" data-a="wizpick" data-v="' + role + '">' +
      '<span class="pk">' + (role === 'from' ? 'Départ' : 'Destination') + '</span>' +
      '<b>' + (code ? CITY_BY_CODE[code].name : 'à choisir') + '</b>' +
      '<span class="mini">' + (code ? code + ' · ' + CITY_BY_CODE[code].country
                                    : 'cliquez une ville sur la carte') + '</span></button>';

    let h = '<div class="wizpair">' + cityBtn('from', w.from) +
            '<button class="swap" data-a="wizset" data-v="swap" title="Intervertir">⇄</button>' +
            cityBtn('to', w.to) + '</div>';

    if (!w.to)
      return h + '<div class="empty">Choisissez la destination : cliquez une ville sur la carte, ' +
        'ou servez-vous de la recherche (touche <b>/</b>).</div>' +
        this.wizSuggest(w.from);

    // le classement ne dépend que de la paire et du nombre : on l'établit
    // d'abord, il fournit l'appareil par défaut que le devis chiffrera
    const rank = G.rankAircraft(w.from, w.to, w.count)
      .filter(x => w.cargo ? true : x.kind === 'pax');
    if (w.sort === 'profit') rank.sort((x, y) => y.profit - x.profit);
    if (!w.typeId && rank.length) w.typeId = rank[0].type.id;
    if (w.typeId && !rank.some(x => x.type.id === w.typeId) && rank.length)
      w.typeId = rank[0].type.id;

    const plan = G.planRoute(w.from, w.to, {typeId: w.typeId, count: w.count});
    if (plan.why)
      return h + '<div class="mini flag bad" style="margin-top:10px">' + plan.why + '</div>' +
        (plan.route ? '<button class="btn" style="width:100%;margin-top:10px" data-a="route" data-v="' +
          plan.route.id + '">Ouvrir la fiche de la ligne existante</button>' : '');

    // --- ce que pèse la liaison
    const dem = plan.dem;
    h += '<div class="card"><div class="grid3">' +
         '<div class="stat">Distance<b>' + num(plan.dist) + ' km</b></div>' +
         '<div class="stat">Demande<b>' + num(dem.total) + ' pax/j</b></div>' +
         '<div class="stat">Concurrents<b>' + plan.rivals.length + '</b></div></div>';
    if (plan.rivals.length)
      h += '<div class="mini" style="margin-top:8px">' + plan.rivals.map(x =>
        '<span class="dot" style="background:' + x.r.color + '"></span>' + x.r.name +
        ' <b>' + x.rt.freq + ' vols/j</b>').join(' · ') + '</div>';
    else
      h += '<div class="mini" style="margin-top:8px">Aucune compagnie n’exploite cette liaison : ' +
           'vous n’aurez que la concurrence de fond à partager.</div>';
    plan.notes.forEach(n => h += '<div class="mini flag warn" style="margin-top:7px">' + n + '</div>');
    h += '</div>';

    // --- appareil
    h += '<h4 class="sec">Appareil</h4>';
    if (!rank.length) {
      h += '<div class="empty">Aucun appareil du catalogue ne tient les ' + num(plan.dist) +
           ' km d’une traite.</div>';
      const relays = G.relayCities(w.from, w.to);
      if (relays.length) {
        h += '<div class="mini" style="margin:2px 0 8px">Coupez le trajet en deux : ouvrez d’abord ' +
             'un tronçon vers une escale intermédiaire, puis le second. Un hub sur cette escale ' +
             'fera correspondre les deux.</div>';
        relays.forEach(x => {
          h += '<div class="row" style="padding:5px 0;border-bottom:1px solid var(--line2)">' +
               '<span><b>' + x.city.name + '</b>' +
               (x.hub ? ' <span class="tag hub">votre hub</span>'
                      : (x.owned ? ' <span class="tag ok">créneaux détenus</span>' : '')) +
               '<div class="mini">' + num(x.d1) + ' km puis ' + num(x.d2) + ' km · ' +
               (x.detour > 1.004 ? '+' + pct(x.detour - 1, 1) + ' de trajet'
                                 : 'presque sans détour') + '</div></span>' +
               '<button class="btn sm gh" data-a="wizpair" data-v="' + w.from + ':' + x.city.code +
               '">premier tronçon</button></div>';
        });
      }
    }
    else {
      h += '<div class="row" style="margin-bottom:7px"><span class="mini">Classés par ' +
           (w.sort === 'payback' ? '<b>retour sur investissement</b>' : '<b>résultat quotidien</b>') +
           ', pour ' + w.count + ' appareil' + (w.count > 1 ? 's' : '') + ' bien réglé' +
           (w.count > 1 ? 's' : '') + '.</span>' +
           '<button class="btn sm gh" data-a="wizset" data-v="sort" style="flex:none">Trier</button></div>';
      rank.slice(0, 7).forEach(x => {
        const own = s.fleet.filter(a => a.type === x.type.id && !a.routeId && a.status !== 'maint').length;
        h += '<button class="acopt' + (x.type.id === w.typeId ? ' on' : '') +
             '" data-a="wiztype" data-v="' + x.type.id + '">' +
             '<div class="row"><b>' + x.type.name + '</b>' +
             '<span class="' + (x.profit >= 0 ? 'pos' : 'neg') + '"><b>' + moneySigned(x.profit) + '</b>/j</span></div>' +
             '<div class="mini">' + (x.type.seats ? x.type.seats + ' sièges' : x.type.cargo + ' t de fret') +
             ' · ' + money(x.price) + ' · ' + x.freq + ' vol' + (x.freq > 1 ? 's' : '') + '/j' +
             (x.type.seats ? ' · remplissage ' + pct(x.lf) : '') +
             ' · retour en ' + (x.payback ? Math.round(x.payback) + ' jours' : 'jamais') +
             (own ? ' · <b>' + own + ' libre' + (own > 1 ? 's' : '') + ' en flotte</b>' : '') +
             '</div></button>';
      });
      h += '<label class="optline"><input type="checkbox"' + (w.cargo ? ' checked' : '') +
           ' data-a="wizset" data-v="cargo"> Inclure les avions tout-cargo</label>';
    }

    // --- nombre d'appareils
    h += '<h4 class="sec">Nombre d’appareils</h4><div class="card">' +
         '<div class="row"><span class="mini">Chacun ajoute ses rotations, et occupe un créneau à chaque escale.</span>' +
         '<b id="wizN">' + w.count + '</b></div>' +
         '<input type="range" min="1" max="8" value="' + w.count + '"' +
         ' oninput="UI.el(\'wizN\').textContent=this.value"' +
         ' onchange="UI.wizSet(\'count\',this.value)">' +
         '</div>';

    // --- devis
    h += '<h4 class="sec">Devis</h4><div class="card">';
    plan.slots.forEach(o => {
      h += '<div class="row" style="padding:3px 0"><span class="mini">Créneaux à ' + o.city.name +
           (o.spare ? ' <span class="tag ok">' + o.spare + ' déjà libre' + (o.spare > 1 ? 's' : '') + '</span>' : '') +
           '</span><b>' + (o.need ? o.need + ' × ' + money(o.unit) : '—') + '</b></div>';
    });
    h += '<div class="row" style="padding:3px 0"><span class="mini">' +
         (plan.buy ? plan.buy + ' × ' + (plan.type ? plan.type.name : 'appareil') : 'Appareils') +
         (plan.reuse.length ? ' <span class="tag ok">' + plan.reuse.length + ' repris en flotte</span>' : '') +
         '</span><b>' + (plan.acCost ? money(plan.acCost) : '—') + '</b></div>' +
         '<hr class="sp" style="margin:8px 0">' +
         '<div class="row"><b>Total à engager</b><b style="font-size:15px">' + money(plan.total) + '</b></div>' +
         '<div class="row" style="margin-top:3px"><span class="mini">Trésorerie après</span>' +
         '<span class="mini ' + (plan.cashAfter < 0 ? 'neg' : '') + '"><b>' + money(plan.cashAfter) + '</b></span></div>';
    h += '</div>';

    // --- projection
    if (plan.proj) {
      const p = plan.proj;
      h += '<div class="card big" style="margin-top:9px"><div class="ttl">Une fois en service</div>' +
           '<div class="grid3" style="margin-top:8px">' +
           '<div class="stat">Résultat/j<b class="' + (p.profit >= 0 ? 'pos' : 'neg') + '">' +
           moneySigned(p.profit) + '</b></div>' +
           '<div class="stat">Passagers/j<b>' + num(p.pax) + '</b></div>' +
           '<div class="stat">Remplissage<b>' + pct(p.lf) + '</b></div></div>' +
           '<div class="mini" style="margin-top:8px">Tarif conseillé <b>' + plan.fare + ' €</b> en éco (' +
           Math.round(p.priceMult * 100) + ' % du prix de référence), <b>' + p.freq + ' vol' +
           (p.freq > 1 ? 's' : '') + '</b> par jour et par appareil — appliqués à l’ouverture. ' +
           'Charges passives, marketing et redevances de créneaux déduits.' +
           (p.payback ? ' Investissement remboursé en <b>' + Math.round(p.payback) + ' jours</b>.' : '') +
           '</div></div>';
    }

    if (plan.blocking.length)
      plan.blocking.forEach(b => h += '<div class="mini flag bad" style="margin-top:8px">' + b + '</div>');
    // une escale saturée n'est pas une impasse : la fiche de la ville porte les
    // trois portes de sortie, autant y mener d'un clic
    plan.slots.filter(o => o.need > o.forSale).forEach(o =>
      h += '<button class="btn gh sm" style="width:100%;margin-top:6px" data-a="city" data-v="' +
           o.code + '">Voir les autres voies à ' + o.city.name +
           (o.offFree ? ' — ' + o.offFree + ' horaires creux dès ' + money(o.offCost) : '') +
           '</button>');

    h += '<button class="btn" style="width:100%;margin-top:11px" data-a="wizgo"' +
         (plan.ok ? '' : ' disabled') + '>' +
         (plan.ok ? 'Ouvrir la ligne — ' + money(plan.total) : 'Devis incomplet') + '</button>';
    return h;
  },

  /* Sans destination choisie, on propose les liaisons les plus porteuses au
     départ de la ville sélectionnée : c'est le point de départ le plus utile. */
  wizSuggest(from) {
    if (!from) return '';
    const dests = CITIES.filter(x => x.code !== from).map(x => {
      const d = baseDemand(from, x.code);
      return d && !G.findRoute(from, x.code) ? {c: x, d: d} : null;
    }).filter(Boolean).sort((a, b) => b.d.total - a.d.total).slice(0, 8);
    if (!dests.length) return '';
    let h = '<h4 class="sec">Marchés les plus porteurs au départ de ' + CITY_BY_CODE[from].name + '</h4>' +
            '<table class="t"><tr><th>Destination</th><th>Pax/j</th><th>Distance</th><th></th></tr>';
    dests.forEach(x => {
      h += '<tr><td>' + x.c.name + '</td><td>' + num(x.d.total) + '</td><td>' + num(x.d.dist) + ' km</td>' +
           '<td style="text-align:right"><button class="btn sm gh" data-a="wizto" data-v="' +
           x.c.code + '">choisir</button></td></tr>';
    });
    return h + '</table>';
  },

  /* ============================ BILAN MENSUEL ============================ */
  /* L'écran de clôture : ce qui a changé depuis le mois dernier, les lignes qui
     ont porté le résultat et celles qui l'ont plombé, ce qu'ont fait les
     concurrents. Il met la partie en pause le temps qu'on le lise. */
  lastReport: null,

  report(rep) {
    this.lastReport = rep;
    const d = (v, fmt) => v === null || v === undefined ? ''
      : '<i class="dl ' + (v >= 0 ? 'pos' : 'neg') + '">' + (v > 0 ? '+' : '') + fmt(v) + '</i>';
    const tile = (label, value, delta) =>
      '<div class="rtile"><span>' + label + '</span><b>' + value + '</b>' + (delta || '') + '</div>';

    const good = rep.profit >= 0;
    let h = '<div class="mh"><h2>' + rep.month + '</h2><p>' +
      (good ? 'Le mois se solde par un bénéfice de <b>' + money(rep.profit) + '</b>.'
            : 'Le mois se solde par une perte de <b>' + money(-rep.profit) + '</b>.') +
      (rep.streak ? ' ' + rep.streak + ' exercice' + (rep.streak > 1 ? 's' : '') +
        ' bénéficiaire' + (rep.streak > 1 ? 's' : '') + ' d’affilée.' : '') +
      '</p></div><div class="mb">';

    h += '<div class="rgrid">' +
      tile('Résultat', moneySigned(rep.profit), d(rep.dProfit, money)) +
      tile('Recettes', money(rep.rev), d(rep.dRev, money)) +
      tile('Coûts', money(rep.cost), d(rep.dCost, money)) +
      tile('Trésorerie', money(rep.cash), d(rep.dCash, money)) +
      tile('Passagers', num(rep.pax), d(rep.dPax, num)) +
      tile('Remplissage', pct(rep.lf), '') +
      tile('Valeur', money(rep.value), d(rep.dValue, money)) +
      tile('Réputation', Math.round(rep.rep), d(rep.dRep, v => v.toFixed(1))) +
      tile('Part de marché', pct(rep.share, 1), d(rep.dShare, v => pct(v, 1))) +
      '</div>';

    if (rep.best.length) {
      h += '<h4 class="sec">Ce qui a porté le mois</h4><table class="t">';
      rep.best.forEach(x => {
        h += '<tr><td><b>' + CITY_BY_CODE[x.r.a].name + '</b> ↔ <b>' + CITY_BY_CODE[x.r.b].name +
             '</b><div class="mini">' + num(x.pax) + ' passagers · remplissage ' + pct(x.lf) + '</div></td>' +
             '<td style="text-align:right" class="' + (x.profit >= 0 ? 'pos' : 'neg') + '"><b>' +
             moneySigned(x.profit) + '</b></td></tr>';
      });
      h += '</table>';
    }
    if (rep.worst.length) {
      h += '<h4 class="sec">Ce qui a coûté</h4><table class="t">';
      rep.worst.forEach(x => {
        const meta = G.ROUTE_STATES[x.state];
        h += '<tr><td><b>' + CITY_BY_CODE[x.r.a].name + '</b> ↔ <b>' + CITY_BY_CODE[x.r.b].name + '</b>' +
             (meta && meta.label ? ' <span class="tag ' + meta.tag + '">' + meta.label + '</span>' : '') +
             '<div class="mini">' + num(x.pax) + ' passagers · remplissage ' + pct(x.lf) + '</div></td>' +
             '<td style="text-align:right" class="neg"><b>' + moneySigned(x.profit) + '</b></td></tr>';
      });
      h += '</table>';
    }

    if (rep.events.length) {
      h += '<h4 class="sec">En cours</h4>';
      rep.events.forEach(e => h += '<div class="mini flag warn">' + e.label +
        ' — encore ' + e.left + ' jour' + (e.left > 1 ? 's' : '') + '.</div>');
    }
    if (rep.news.length) {
      h += '<h4 class="sec">Le mois en bref</h4>';
      rep.news.forEach(n => h += '<div class="mini" style="padding:3px 0"><b>' + n.t + '</b> — ' + n.x + '</div>');
    }

    h += '<h4 class="sec">Classement mondial</h4><table class="t">';
    const mine = rep.pax / Math.max(1, rep.days || 30);
    const all = rep.rivals.map(r => ({name: r.name, color: r.color, pax: r.pax, mine: false}))
      .concat([{name: G.s.airline.name, color: 'var(--st-ok)', pax: mine, mine: true}])
      .sort((a, b) => b.pax - a.pax);
    all.forEach((r, i) => {
      h += '<tr' + (r.mine ? ' style="background:var(--hover)"' : '') + '><td>' + (i + 1) + '</td>' +
           '<td><span class="dot" style="background:' + r.color + '"></span>' +
           (r.mine ? '<b>' + r.name + '</b>' : r.name) + '</td>' +
           '<td style="text-align:right">' + num(r.pax) + ' pax/j</td></tr>';
    });
    h += '</table>';

    // Ce bilan revient tous les mois : on doit pouvoir le couper d'ici, sans
    // aller chercher le réglage dans les options d'affichage.
    h += '</div><div class="mf">' +
      '<label class="optline" style="margin-right:auto" title="Réglable aussi dans Affichage → Déroulement">' +
      '<input type="checkbox" onchange="UI.reportOff(this.checked)"> Ne plus afficher ce bilan</label>' +
      '<button class="btn gh" onclick="UI.closeModal();UI.open(&quot;log&quot;,undefined,{root:true})">Voir le journal</button>' +
      '<button class="btn" onclick="UI.closeModal()">Reprendre</button></div>';
    this.modal(h, true);
  },

  /* Coupe — ou remet — le bilan mensuel, et retient le choix d'une partie à
     l'autre comme les autres réglages d'affichage. Les comptes du mois restent
     lisibles dans Statistiques et au journal. */
  reportOff(off) {
    Map2D.opts.report = !off;
    Map2D.saveOpts();
    if (window.syncOptBoxes) syncOptBoxes();
    if (off) this.toast('Bilan mensuel désactivé',
      'Les clôtures passeront désormais sans s’arrêter. Vous pouvez le remettre dans ' +
      'Affichage → Déroulement.', '');
  },

  /* ============================== JOURNAL =============================== */
  /* Le fil de la partie, daté et filtrable. On y revient pour comprendre ce
     qui s'est passé pendant qu'on regardait ailleurs. */
  logFilter: 'tout',

  log() {
    const s = G.s;
    const cats = ['tout', 'réseau', 'flotte', 'finances', 'concurrence', 'événement'];
    let h = '<div class="segbar">' + cats.map(c =>
      '<button class="' + (this.logFilter === c ? 'on' : '') + '" data-a="logfilter" data-v="' + c + '">' +
      c.charAt(0).toUpperCase() + c.slice(1) + '</button>').join('') + '</div>';

    const list = s.log.filter(l => this.logFilter === 'tout' || l.cat === this.logFilter);
    if (!list.length) return h + '<div class="empty">Rien sous cette rubrique pour l’instant.</div>';

    let lastDay = null;
    list.slice(0, 120).forEach(l => {
      const date = l.y === undefined ? null : l.d + ' ' + MONTHS[l.m] + ' ' + l.y;
      if (date && date !== lastDay) {
        h += '<div class="logday">' + date + '</div>';
        lastDay = date;
      }
      h += '<div class="logrow ' + (l.k || '') + '"><b>' + l.t + '</b><div class="mini">' + l.x + '</div></div>';
    });
    if (list.length > 120)
      h += '<div class="mini" style="margin-top:8px">…et ' + (list.length - 120) +
           ' entrée(s) plus anciennes, effacées au fil de la partie.</div>';
    return h;
  },

  /* ==================== SORTIR D'UN AÉROPORT SATURÉ ===================== */
  /* Les trois portes, dans l'ordre où un joueur les envisage : le moins cher
     d'abord, l'immédiat et hors de prix en dernier. Chacune dit ce qu'elle
     coûte et ce qu'elle enlève. */
  slotRelief(code) {
    const s = G.s, c = CITY_BY_CODE[code];
    const offFree = G.offPeakFree(code), offCost = G.offPeakCost(code);
    const offOwn = (s.slotsOff || {})[code] || 0;
    const share = G.offPeakShare(code);
    let h = '';

    // --- 1. horaires creux
    h += '<h4 class="sec">Horaires creux</h4><div class="card">' +
      '<div class="mini">Les premiers départs et les derniers retours ne se disputent pas : ' +
      'il en reste <b>' + offFree + '</b> ici, à moitié prix. Un vol à ces heures-là remplit ' +
      'moins bien — jusqu’à <b>' + pct(BAL.OFFPEAK_MALUS) + '</b> d’attractivité en moins si tous ' +
      'vos vols d’ici y passent. Vos bons créneaux servent d’abord : un horaire creux ne pénalise ' +
      'rien tant qu’aucun appareil de plus ne s’en sert.</div>';
    if (offOwn)
      h += '<div class="row mini" style="margin-top:8px"><span>Part de vos vols en heure creuse</span>' +
           '<b>' + pct(share) + '</b></div><div class="bar"><i style="width:' +
           Math.round(share * 100) + '%;background:var(--st-hub)"></i></div>';
    h += '<div class="row" style="margin-top:10px">' +
      '<div class="mini">Créneau creux : <b>' + money(offCost) + '</b></div>' +
      '<button class="btn sm" data-a="buyoffpeak" data-v="' + code + '"' +
      (offFree <= 0 || s.cash < offCost ? ' disabled' : '') + '>Acheter</button></div></div>';

    // --- 2. rachat à une compagnie installée
    const offers = G.slotOffers(code);
    h += '<h4 class="sec">Racheter à une compagnie</h4>';
    if (!offers.length) {
      h += '<div class="empty">Aucune compagnie installée ici n’a assez de créneaux pour en céder un.</div>';
    } else {
      h += '<div class="mini" style="margin-bottom:8px">Un créneau se rachète à prix d’or, et la ' +
           'compagnie qui le cède allège sa desserte d’autant. Les grandes plateformes ne se ' +
           'gagnent guère autrement.</div>';
      offers.forEach(o => {
        h += '<div class="card"><div class="row"><div>' +
          '<div class="ttl"><span class="dot" style="background:' + o.rival.color + '"></span>' +
          o.rival.name + '</div>' +
          '<div class="sub">' + o.slots + ' créneaux ici · céderait sur ' + o.other.name + '</div></div>' +
          '<b>' + money(o.price) + '</b></div>' +
          (o.ok ? '' : '<div class="mini flag bad" style="margin-top:7px">Ne traite qu’au-dessus de <b>' +
            o.minRep + '</b> de réputation ; la vôtre est de <b>' + Math.round(s.rep) + '</b>.</div>') +
          '<button class="btn" style="width:100%;margin-top:9px" data-a="buyfrom" data-v="' +
          code + '::' + o.rival.name + '"' + (!o.ok || s.cash < o.price ? ' disabled' : '') +
          '>Racheter un créneau — ' + money(o.price) + '</button></div>';
      });
    }

    // --- 3. agrandissement
    const w = G.worksAt(code);
    h += '<h4 class="sec">Agrandir l’aéroport</h4><div class="card">';
    if (w) {
      const tot = G.expandMonths(code);
      h += '<div class="mini">Chantier en cours : <b>' + w.add + ' créneaux</b> livrés dans <b>' +
        w.left + ' mois</b>.</div>' +
        '<div class="bar" style="margin-top:8px"><i style="width:' +
        Math.round((1 - w.left / Math.max(1, tot)) * 100) + '%;background:var(--green)"></i></div>' +
        '<div class="mini" style="margin-top:7px">Une part des créneaux livrés finira chez vos ' +
        'concurrents : ils sont sur les rangs eux aussi.</div>';
    } else {
      const ec = G.expandCost(code);
      h += '<div class="mini">Participer aux travaux — une piste, un terminal — porte la capacité ' +
        'de <b>' + G.slotsTotal(code) + '</b> à <b>' + (G.slotsTotal(code) + G.expandGain(code)) +
        '</b> créneaux. Le chantier dure <b>' + G.expandMonths(code) + ' mois</b>, et la place ' +
        'gagnée profitera aussi aux compagnies déjà là.</div>' +
        '<button class="btn" style="width:100%;margin-top:10px" data-a="expand" data-v="' + code + '"' +
        (s.cash < ec ? ' disabled' : '') + '>Financer les travaux — ' + money(ec) + '</button>';
    }
    h += '</div>';
    return h;
  },

  /* =============================== VILLE ================================= */
  city(code) {
    const s = G.s, c = CITY_BY_CODE[code];
    const owned = s.slots[code] || 0, used = slotsUsed(code), free = slotsFree(code);
    const isHub = s.hubs.indexOf(code) >= 0;
    const cost = slotCost(code);
    const myRoutes = s.routes.filter(r => r.a === code || r.b === code);

    // meilleures destinations non desservies
    const dests = CITIES.filter(x => x.code !== code).map(x => {
      const d = baseDemand(code, x.code);
      return d ? {c: x, d} : null;
    }).filter(Boolean).sort((a, b) => b.d.total - a.d.total).slice(0, 8);

    let h = '';
    h += '<div class="card"><div class="row"><div><div class="ttl">' + c.name +
         (isHub ? ' <span class="tag hub">Hub</span>' : '') + '</div>' +
         '<div class="sub">' + c.country + ' · ' + REGION_NAMES[c.region] + ' · ' + c.code + '</div></div>' +
         '<button class="btn sm gh" data-a="focus" data-v="' + code + '">Centrer</button></div>' +
         '<div class="grid3" style="margin-top:9px">' +
         '<div class="stat">Marché<b>' + Math.round(c.size * 100) + '</b></div>' +
         '<div class="stat">Affaires<b>' + Math.round(c.biz * 100) + '</b></div>' +
         '<div class="stat">Tourisme<b>' + Math.round(c.tour * 100) + '</b></div></div></div>';

    h += this.airportBlock(code);

    const needRep = G.slotMinRep(code);
    if (needRep) {
      const ok = s.rep >= needRep;
      h += '<div class="mini flag ' + (ok ? 'warn' : 'bad') + '" style="margin:10px 0 0">' +
        (ok ? 'Cet aéroport n’accorde ses créneaux qu’au-dessus de <b>' + needRep +
              '</b> de réputation. La vôtre suffit (' + Math.round(s.rep) + ').'
            : 'Cet aéroport réserve ses créneaux aux compagnies de réputation <b>' + needRep +
              '</b> ou plus. La vôtre est de <b>' + Math.round(s.rep) + '</b> : soignez vos ' +
              'cabines, vos hubs et votre ponctualité avant de revenir.') + '</div>';
    }

    h += '<h4 class="sec">Créneaux aéroportuaires</h4>';
    const offOwn = (s.slotsOff || {})[code] || 0;
    h += '<div class="card">' +
         '<div class="mini">Un créneau est nécessaire par appareil et par escale. ' +
         'Vous en détenez <b>' + owned + '</b>, dont <b>' + (owned - used) + '</b> de libre' +
         ((owned - used) > 1 ? 's' : '') +
         (offOwn ? ' — <b>' + offOwn + '</b> en heure creuse' : '') + '.</div>' +
         '<div class="row" style="margin-top:10px">' +
         '<div class="mini">Aux heures de pointe : <b>' + money(cost) + '</b>' +
         (free > 0 ? ' · ' + free + ' à vendre' : '') + '</div>' +
         '<button class="btn sm" data-a="buyslot" data-v="' + code + '"' +
         (free <= 0 || s.cash < cost ? ' disabled' : '') + '>Acheter</button></div>' +
         (free <= 0 ? '<div class="mini flag bad" style="margin-top:8px">Aéroport saturé aux heures ' +
           'de pointe : plus aucun créneau à vendre. Trois portes restent ouvertes ci-dessous.</div>' : '') +
         '</div>';

    h += this.slotRelief(code);

    h += '<h4 class="sec">Hub</h4>';
    if (isHub) {
      h += '<div class="card"><div class="mini">Cette ville est un hub : redevances réduites de ' +
           pct(1 - BAL.HUB_FEE_DISCOUNT) + ' et vos lignes s’alimentent mutuellement en correspondances.</div></div>';
    } else {
      const hc = G.hubCost(code);
      h += '<div class="card"><div class="mini">Transformer ' + c.name + ' en hub débloque les correspondances ' +
           'entre toutes vos lignes qui y passent, et réduit les redevances.</div>' +
           '<div class="row" style="margin-top:9px"><b>' + money(hc) + '</b>' +
           '<button class="btn sm" data-a="hub" data-v="' + code + '"' +
           (s.cash < hc || s.hubs.length >= BAL.MAX_HUBS ? ' disabled' : '') + '>Créer le hub (' +
           s.hubs.length + '/' + BAL.MAX_HUBS + ')</button></div></div>';
    }

    h += '<h4 class="sec">Vos lignes au départ d’ici (' + myRoutes.length + ')</h4>';
    if (!myRoutes.length) h += '<div class="empty">Aucune ligne.<br>Cliquez « Ouvrir une ligne » puis une autre ville.</div>';
    myRoutes.forEach(r => {
      const other = r.a === code ? r.b : r.a;
      h += '<div class="card" data-a="route" data-v="' + r.id + '" style="cursor:pointer">' +
           '<div class="row"><div class="ttl">→ ' + CITY_BY_CODE[other].name + '</div>' +
           '<span class="' + (r.last.profit >= 0 ? 'pos' : 'neg') + '"><b>' + moneySigned(r.last.profit) + '</b>/j</span></div>' +
           '<div class="sub">' + r.ac.length + ' avion(s) · remplissage ' + pct(r.last.lf) +
           ' · ' + num(r.last.pax) + ' pax/j</div></div>';
    });

    h += '<button class="btn" style="width:100%;margin-top:6px" data-a="newroute" data-v="' + code +
         '">Ouvrir une ligne depuis ' + c.name + '</button>' +
         '<button class="btn gh sm" style="width:100%;margin-top:5px" data-a="link" data-v="' + code +
         '">…ou désigner la destination sur la carte</button>';

    h += '<h4 class="sec">Marchés les plus porteurs</h4><table class="t"><tr><th>Destination</th><th>Pax/j</th><th>Distance</th><th></th></tr>';
    dests.forEach(x => {
      const ex = G.findRoute(code, x.c.code);
      h += '<tr><td>' + x.c.name + '</td><td>' + num(x.d.total) + '</td><td>' + num(x.d.dist) + ' km</td>' +
           '<td style="text-align:right">' + (ex
             ? '<span class="tag ok">ouverte</span>'
             : '<button class="btn sm gh" data-a="wizpair" data-v="' + code + ':' + x.c.code + '">ouvrir</button>') +
           '</td></tr>';
    });
    h += '</table>';

    return [c.name, h];
  },

  /* =============================== LIGNE ================================= */
  route(id) {
    const s = G.s, r = s.routes.find(x => x.id === id);
    if (!r) { this.open('network'); return ['Réseau', this.network()]; }
    Map2D.selRoute = id;
    const ca = CITY_BY_CODE[r.a], cb = CITY_BY_CODE[r.b];
    const dem = baseDemand(r.a, r.b);
    const fare = dem.price * r.priceMult;
    const rivals = RIVAL_IDX.get(pairKey(r.a, r.b)) || [];

    const state = G.routeState(r), sMeta = G.ROUTE_STATES[state], sCol = this.stColor(state);

    let h = '';
    h += '<div class="card" style="border-left:2px solid ' + sCol + '">' +
         '<div class="row"><div class="ttl">' + ca.name + ' ↔ ' + cb.name + '</div>' +
         (sMeta.label ? '<span class="tag ' + sMeta.tag + '">' + sMeta.label + '</span>' : '') + '</div>' +
         '<div class="sub"><span class="iata">' + r.a + '</span> ↔ <span class="iata">' + r.b +
         '</span> · ' + num(r.dist) + ' km · demande estimée ' + num(dem.total) + ' pax/jour</div>' +
         '<div class="grid3">' +
         '<div class="stat">Passagers/j<b>' + num(r.last.pax) + '</b></div>' +
         '<div class="stat">Remplissage<b>' + pct(r.last.lf) + '</b><div class="bar"><i style="width:' +
         Math.min(100, r.last.lf * 100).toFixed(0) + '%;background:' + sCol + '"></i></div></div>' +
         '<div class="stat">Part de marché<b>' + pct(r.last.share) + '</b><div class="bar"><i style="width:' +
         Math.min(100, r.last.share * 100).toFixed(0) + '%"></i></div></div></div>' +
         '<div class="grid3" style="margin-top:1px">' +
         '<div class="stat">Recettes/j<b>' + money(r.last.rev) + '</b></div>' +
         '<div class="stat">Coûts/j<b>' + money(r.last.cost) + '</b></div>' +
         '<div class="stat">Résultat/j<b class="' + (r.last.profit >= 0 ? 'pos' : 'neg') + '">' +
         moneySigned(r.last.profit) + '</b></div></div>';
    const adv = G.routeAdvice(r);
    if (adv)
      h += '<div class="advice ' + adv.kind + '"><div class="ah">Conseil</div>' +
           '<div class="at">' + adv.text + '</div>' +
           (adv.action ? '<button class="btn sm" data-a="' + adv.action.a + '" data-v="' +
              adv.action.v + '" style="margin-top:7px">' + adv.action.label + '</button>' : '') +
           '</div>';
    if (sMeta.hint)
      h += '<div class="mini flag ' + (sMeta.tag === 'bad' ? 'bad' : 'warn') + '" style="margin-top:9px">' +
           '<b>Ligne ' + sMeta.label + '.</b> ' + sMeta.hint +
           (state === 'saturee' && r.last.unmet > 1 ? ' Environ <b>' + num(r.last.unmet) +
             '</b> passagers par jour partent à la concurrence.' : '') + '</div>';
    if (r.last.legs > 0)
      h += '<div class="minitab" style="margin-top:9px">' +
        '<span>Coûts variables <b>' + money(r.last.varCost) + '</b></span>' +
        '<span>Charges passives <b>' + money(r.last.fixed) + '</b></span>' +
        '<span>Heures de vol <b>' + r.last.hours.toFixed(1) + ' h</b></span></div>';
    if (r.last.connect > 0.5)
      h += '<div class="mini" style="margin-top:8px">Correspondances : <b>' + num(r.last.connect) + '</b> passagers acheminés via votre hub.</div>';
    if (r.last.cancel > 0)
      h += '<div class="mini flag bad" style="margin-top:6px">' + r.last.cancel + ' vol(s) annulé(s) hier.</div>';
    if (r.last.legs > 0 && r.last.lf < 0.62)
      h += '<div class="mini flag warn" style="margin-top:6px">Remplissage faible : réduisez la fréquence, ' +
           'baissez le tarif, ou mettez un appareil plus petit.</div>';
    if (r.last.unmet > 30 && r.last.lf > 0.9)
      h += '<div class="mini flag warn" style="margin-top:6px">' + num(r.last.unmet) +
           ' passagers refusés faute de sièges : ajoutez de la capacité.</div>';
    h += '</div>';

    h += '<h4 class="sec">Tarification</h4><div class="card">' +
         '<div class="row"><span class="mini">Tarif éco aller simple</span><b id="fareEco">' + Math.round(fare) + ' €</b></div>' +
         '<input type="range" min="60" max="170" value="' + Math.round(r.priceMult * 100) +
         '" oninput="UI.setPrice(' + r.id + ',this.value)">' +
         '<div class="row mini"><span>bradé</span><span id="farePct">' + Math.round(r.priceMult * 100) +
         ' % du prix de référence</span><span>premium</span></div>' +
         '<div class="row" style="margin-top:7px"><span class="mini" id="fareHigh">Affaires ' +
         Math.round(fare * BAL.CLASS_MULT.biz) + ' € · Première ' +
         Math.round(fare * BAL.CLASS_MULT.first) + ' €</span>' +
         '<button class="btn sm gh" data-a="optprice" data-v="' + r.id + '" style="flex:none">Conseillé</button>' +
         '</div></div>';

    // fréquence
    let maxL = 0;
    r.ac.forEach(id => {
      const ac = s.fleet.find(a => a.id === id);
      if (ac) maxL = Math.max(maxL, legsPerDay(AC_BY_ID[ac.type], r.dist));
    });
    if (maxL > 1) {
      const cur = r.freqCap ? Math.min(r.freqCap, maxL) : maxL;
      h += '<h4 class="sec">Fréquence</h4><div class="card">' +
        '<div class="row"><span class="mini">Vols par jour et par appareil</span><b id="freqVal">' + cur + ' / ' + maxL + '</b></div>' +
        '<input type="range" min="1" max="' + maxL + '" value="' + cur +
        '" oninput="UI.setFreq(' + r.id + ',this.value,' + maxL + ')">' +
        '<div class="row" style="margin-top:7px"><span class="mini">Voler moins souvent réduit les coûts et ' +
        'remplit mieux les avions, mais vous rend moins attractif.</span>' +
        '<button class="btn sm gh" data-a="optfreq" data-v="' + r.id + '" style="flex:none">Conseillée</button></div></div>';
    }

    h += '<h4 class="sec">Appareils affectés (' + r.ac.length + ')</h4>';
    if (!r.ac.length) h += '<div class="empty">Aucun appareil : la ligne ne rapporte rien.</div>';
    else h += '<div class="mini" style="margin-bottom:8px">Vous pouvez en affecter autant que vous ' +
      'voulez : chacun ajoute ses rotations, donc de la fréquence et des parts de marché. ' +
      'Il faut un créneau libre à chaque escale par appareil.</div>';
    r.ac.forEach(acId => {
      const ac = s.fleet.find(a => a.id === acId); if (!ac) return;
      const t = AC_BY_ID[ac.type];
      const L = legsPerDay(t, r.dist);
      h += '<div class="card"><div class="row"><div><div class="ttl">' + t.name + ' <span class="iata">' + ac.reg + '</span></div>' +
           '<div class="sub">' + L + ' vols/jour · ' + (t.seats ? CABINS[ac.cabin].label + ' · ' + seatsOf(t, ac.cabin).total + ' sièges'
              : t.cargo + ' t de fret') + ' · usure ' + pct(ac.wear) + '</div></div>' +
           '<button class="btn sm gh" data-a="unassign" data-v="' + ac.id + '">Retirer</button></div></div>';
    });

    const avail = s.fleet.filter(a => !a.routeId && a.status !== 'maint' && AC_BY_ID[a.type].range >= r.dist);

    // les créneaux sont le blocage le plus fréquent : on le montre et on l'ouvre
    const freeA = slotsOwned(r.a) - slotsUsed(r.a), freeB = slotsOwned(r.b) - slotsUsed(r.b);
    if (avail.length && (freeA < 1 || freeB < 1)) {
      const miss = freeA < 1 ? r.a : r.b;
      const cost = slotCost(miss);
      h += '<h4 class="sec">Créneau manquant</h4>' +
        '<div class="card"><div class="mini">Vous avez des appareils libres, mais il ne reste plus ' +
        'de créneau à <b>' + CITY_BY_CODE[miss].name + '</b> ' +
        '(' + Math.max(0, freeA) + ' libre à ' + r.a + ', ' + Math.max(0, freeB) + ' à ' + r.b + '). ' +
        'Un appareil en occupe un à chaque escale.</div>' +
        '<button class="btn" style="width:100%;margin-top:9px" data-a="buyslot" data-v="' + miss + '"' +
        (slotsFree(miss) < 1 || s.cash < cost ? ' disabled' : '') + '>' +
        (slotsFree(miss) < 1 ? 'Aéroport saturé à ' + CITY_BY_CODE[miss].name
                             : 'Acheter un créneau à ' + CITY_BY_CODE[miss].name + ' — ' + money(cost)) +
        '</button></div>';
    }

    if (avail.length) {
      h += '<label class="lb">Affecter un appareil disponible (' + avail.length + ')</label>';
      avail.slice(0, 12).forEach(ac => {
        const t = AC_BY_ID[ac.type];
        h += '<div class="row" style="padding:5px 0;border-bottom:1px solid var(--line2)">' +
             '<span>' + t.name + ' <span class="mini">' + ac.reg + '</span></span>' +
             '<button class="btn sm" data-a="assign" data-v="' + ac.id + ':' + r.id + '">Affecter</button></div>';
      });
      if (avail.length > 12) h += '<div class="mini" style="margin-top:6px">…et ' + (avail.length - 12) +
        ' autres, visibles dans le panneau Flotte.</div>';
    } else {
      h += '<div class="mini" style="margin-top:8px">Aucun appareil libre avec l’autonomie requise (' +
           num(r.dist) + ' km). Achetez-en un dans « Constructeurs ».</div>';
    }

    if (rivals.length) {
      h += '<h4 class="sec">Concurrence sur cet axe</h4><table class="t"><tr><th>Compagnie</th><th>Vols/j</th><th>Tarif</th></tr>';
      rivals.forEach(x => {
        h += '<tr><td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' +
             x.r.color + ';margin-right:6px"></span>' + x.r.name + '</td><td>' + x.rt.freq + '</td><td>' +
             Math.round(dem.price * x.rt.price) + ' €</td></tr>';
      });
      h += '</table>';
    } else h += '<div class="mini" style="margin-top:12px">Vous êtes seul sur cette liaison.</div>';

    h += '<hr class="sp"><button class="btn warn sm" data-a="closeroute" data-v="' + r.id + '">Fermer la ligne</button>';
    return [ca.code + ' ↔ ' + cb.code, h];
  },

  /* =============================== RÉSEAU =============================== */
  network() {
    const s = G.s;
    let h = '';
    const tot = s.routes.reduce((t, r) => ({p: t.p + r.last.profit, x: t.x + r.last.pax}), {p:0, x:0});
    h += '<div class="card"><div class="grid3">' +
         '<div class="stat">Lignes<b>' + s.routes.length + '</b></div>' +
         '<div class="stat">Passagers/j<b>' + num(tot.x) + '</b></div>' +
         '<div class="stat">Résultat/j<b class="' + (tot.p >= 0 ? 'pos' : 'neg') + '">' + moneySigned(tot.p) + '</b></div>' +
         '</div><button class="btn" style="width:100%;margin-top:10px" data-a="newroute" data-v="">' +
         'Ouvrir une ligne</button>' +
         '<div class="mini" style="margin-top:7px">L’assistant chiffre les créneaux, l’appareil et le ' +
         'résultat attendu avant le moindre achat. Raccourci : <b>N</b>.</div></div>';

    if (!s.routes.length) return h + '<div class="empty">Votre réseau est vide.<br>Commencez par votre hub : ' +
      CITY_BY_CODE[s.home].name + '.</div>';

    const sorted = s.routes.slice().sort((a, b) => b.last.profit - a.last.profit);
    const nSat = s.routes.filter(r => G.routeState(r) === 'saturee').length;
    h += this.bulkBar('route', [
      {op: 'r-price', label: 'Tarif conseillé', hint: 'Chaque ligne prend le tarif qui maximise son résultat.'},
      {op: 'r-freq',  label: 'Fréquence conseillée', hint: 'Chaque ligne prend la fréquence qui maximise son résultat.'},
      {op: 'r-up',    label: 'Tarif +5 %', hint: 'Cinq points de plus sur le prix de référence.'},
      {op: 'r-down',  label: 'Tarif −5 %', hint: 'Cinq points de moins sur le prix de référence.'},
      {op: 'r-close', label: 'Fermer', hint: 'Ferme les lignes et libère leurs appareils.', warn: true}
    ]);
    h += '<h4 class="sec">Lignes par rentabilité</h4>';
    if (nSat) h += '<div class="mini flag bad" style="margin-bottom:8px">' + nSat +
      (nSat > 1 ? ' lignes saturées refusent' : ' ligne saturée refuse') +
      ' des passagers faute de sièges. Elles apparaissent en rouge sur la carte.</div>';
    h += this.viewBar();
    if (Map2D.opts.cards) {
      sorted.forEach(r => { h += this.routeCard(r); });
    } else {
      h += '<table class="t sel"><tr><th style="width:22px"><span class="cbx' +
           (this.sel.route.length === s.routes.length ? ' on' : '') +
           '" data-a="selallroute" data-v=""></span></th>' +
           '<th>Ligne</th><th style="width:78px">Rempl.</th><th>Pax/j</th><th>Résultat/j</th></tr>';
      sorted.forEach(r => {
        const st = G.routeState(r), meta = G.ROUTE_STATES[st];
        h += '<tr' + (this.sel.route.indexOf(r.id) >= 0 ? ' class="on"' : '') +
             ' data-hover="' + r.id + '"' +
             ' title="' + CITY_BY_CODE[r.a].name + ' (' + r.a + ') ↔ ' + CITY_BY_CODE[r.b].name +
             ' (' + r.b + ') · ' + num(r.dist) + ' km' + (meta.hint ? ' · ' + meta.hint : '') + '">' +
             '<td>' + this.selBox('route', r.id) + '</td>' +
             '<td data-a="route" data-v="' + r.id + '" style="cursor:pointer"><b>' +
             CITY_BY_CODE[r.a].name + '</b> ↔ <b>' + CITY_BY_CODE[r.b].name + '</b>' +
             (meta.label ? ' <span class="tag ' + meta.tag + '">' + meta.label + '</span>' : '') +
             '<div class="mini">' + r.a + ' ↔ ' + r.b + ' · ' + num(r.dist) + ' km</div></td>' +
             '<td>' + this.gaugeCell(pct(r.last.lf), r.last.lf, this.stColor(st)) + '</td>' +
             '<td>' + num(r.last.pax) + '</td>' +
             '<td class="' + (r.last.profit >= 0 ? 'pos' : 'neg') + '">' + moneySigned(r.last.profit) + '</td></tr>';
      });
      h += '</table>';
    }

    h += '<h4 class="sec">Hubs (' + s.hubs.length + '/' + BAL.MAX_HUBS + ')</h4>';
    s.hubs.forEach(c => {
      const n = s.routes.filter(r => r.a === c || r.b === c).length;
      h += '<div class="row" style="padding:5px 0"><span data-a="city" data-v="' + c + '" style="cursor:pointer"><b>' +
           CITY_BY_CODE[c].name + '</b></span><span class="mini">' + n + ' ligne(s)</span></div>';
    });

    h += '<h4 class="sec">Créneaux détenus</h4><table class="t"><tr><th>Aéroport</th><th>Détenus</th><th>Utilisés</th></tr>';
    Object.keys(s.slots).forEach(c => {
      h += '<tr data-a="city" data-v="' + c + '" style="cursor:pointer"><td>' + CITY_BY_CODE[c].name + '</td><td>' +
           s.slots[c] + '</td><td>' + slotsUsed(c) + '</td></tr>';
    });
    h += '</table>';
    return h;
  },

  /* ============================== SÉLECTION ============================== */
  /* Les tableaux de lignes et d'appareils se cochent, et la barre d'actions
     applique le même geste à toute la sélection. Elle vit hors du DOM : le
     volet se redessine sans arrêt, les cases doivent survivre. */
  sel: {route: [], ac: []},

  selToggle(kind, id) {
    const list = this.sel[kind], i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1); else list.push(id);
    this.render();
  },
  selAll(kind, ids) {
    const list = this.sel[kind];
    this.sel[kind] = list.length === ids.length ? [] : ids.slice();
    this.render();
  },
  selClear(kind) {
    if (kind) this.sel[kind] = [];
    else this.sel = {route: [], ac: []};
  },
  /* Les identifiants disparus (ligne fermée, appareil vendu) sortent d'eux-mêmes. */
  selPrune() {
    this.sel.route = this.sel.route.filter(id => G.s.routes.some(r => r.id === id));
    this.sel.ac = this.sel.ac.filter(id => G.s.fleet.some(a => a.id === id));
  },
  selBox(kind, id) {
    return '<span class="cbx' + (this.sel[kind].indexOf(id) >= 0 ? ' on' : '') +
           '" data-a="sel' + kind + '" data-v="' + id + '"></span>';
  },

  /* ============================ LISTES ================================== */
  /* Deux façons de lire une liste. Le tableau tient une quinzaine de lignes
     à l'écran et se trie ; les cartes n'en montrent que cinq mais donnent
     l'état d'un coup d'œil. Le choix est mémorisé avec les options d'affichage. */
  viewBar() {
    const c = Map2D.opts.cards;
    return '<div class="segbar">' +
      '<button class="' + (c ? '' : 'on') + '" data-a="listview" data-v="table">Tableau</button>' +
      '<button class="' + (c ? 'on' : '') + '" data-a="listview" data-v="cards">Cartes</button>' +
      '</div>';
  },

  /* La couleur d'un état, reprise de la palette de la carte : le trait qu'on
     voit sur l'atlas et la jauge qu'on lit dans le volet disent la même chose. */
  stColor(st) {
    return (st === 'saturee' || st === 'pleine') ? 'var(--st-sat)'
         : st === 'deficitaire' ? 'var(--st-def)'
         : st === 'creuse' ? 'var(--st-low)'
         : (st === 'clouee' || st === 'vide') ? 'var(--st-idle)' : 'var(--st-ok)';
  },

  /* Une valeur et sa jauge dans la même cellule : on lit le chiffre, on voit
     le niveau, sans que le tableau s'élargisse. */
  gaugeCell(txt, ratio, col) {
    return '<div class="cell-g"><div class="bar"><i style="width:' +
           Math.max(0, Math.min(100, ratio * 100)).toFixed(0) + '%;background:' + col +
           '"></i></div>' + txt + '</div>';
  },

  /* L'usure a trois régimes : neuve, à surveiller, à réviser d'urgence. */
  wearColor(w) {
    return w > 0.8 ? 'var(--red)' : (w > BAL.MAINT_THRESHOLD ? 'var(--gold)' : 'var(--green)');
  },

  acBadge(ac) {
    if (ac.status === 'idle')  return ' <span class="tag warn">au sol</span>';
    if (ac.status === 'maint') return ' <span class="tag">révision ' + ac.maintLeft + ' j</span>';
    if (ac.status === 'aog')   return ' <span class="tag bad">immobilisé</span>';
    return '';
  },

  acCard(ac) {
    const t = AC_BY_ID[ac.type];
    const r = ac.routeId ? G.s.routes.find(x => x.id === ac.routeId) : null;
    const col = this.wearColor(ac.wear);
    return '<div class="card" data-a="aircraft" data-v="' + ac.id +
      '" style="border-left:2px solid ' + col + '">' +
      '<div class="row"><div class="ttl"><span class="iata">' + ac.reg + '</span>' + t.name + '</div>' +
      this.acBadge(ac) + '</div>' +
      '<div class="sub">' + (ac.ageM < 12 ? ac.ageM + ' mois' : (ac.ageM / 12).toFixed(1) + ' ans') +
      ' · ' + (r ? r.a + ' ↔ ' + r.b : 'sans affectation') + '</div>' +
      '<div class="grid2">' +
      '<div class="stat">Usure<b style="color:' + col + '">' + pct(ac.wear) + '</b>' +
      '<div class="bar"><i style="width:' + Math.min(100, ac.wear * 100).toFixed(0) +
      '%;background:' + col + '"></i></div></div>' +
      '<div class="stat">Valeur<b>' + money(acValue(ac)) + '</b></div></div></div>';
  },

  routeCard(r) {
    const st = G.routeState(r), meta = G.ROUTE_STATES[st], col = this.stColor(st);
    return '<div class="card" data-a="route" data-v="' + r.id + '" data-hover="' + r.id +
      '" style="border-left:2px solid ' + col + '">' +
      '<div class="row"><div class="ttl">' + CITY_BY_CODE[r.a].name + ' ↔ ' + CITY_BY_CODE[r.b].name +
      '</div>' + (meta.label ? '<span class="tag ' + meta.tag + '">' + meta.label + '</span>' : '') +
      '</div>' +
      '<div class="sub"><span class="iata">' + r.a + '</span> ↔ <span class="iata">' + r.b +
      '</span> · ' + num(r.dist) + ' km · ' + r.ac.length + ' appareil' +
      (r.ac.length > 1 ? 's' : '') + '</div>' +
      '<div class="grid3">' +
      '<div class="stat">Remplissage<b>' + pct(r.last.lf) + '</b><div class="bar"><i style="width:' +
      Math.min(100, r.last.lf * 100).toFixed(0) + '%;background:' + col + '"></i></div></div>' +
      '<div class="stat">Passagers / j<b>' + num(r.last.pax) + '</b></div>' +
      '<div class="stat">Résultat / j<b class="' + (r.last.profit >= 0 ? 'pos' : 'neg') + '">' +
      moneySigned(r.last.profit) + '</b></div></div></div>';
  },

  /* Barre d'actions groupées, en tête du panneau, quand la sélection n'est pas
     vide. Chaque bouton dit ce qu'il va faire et sur combien d'éléments. */
  bulkBar(kind, actions) {
    const n = this.sel[kind].length;
    if (!n) return '';
    return '<div class="bulk"><div class="row"><b>' + n +
      (kind === 'route' ? ' ligne' : ' appareil') + (n > 1 ? 's' : '') + ' sélectionné' + (n > 1 ? 's' : '') +
      '</b><button class="btn sm gh" data-a="selclear" data-v="' + kind + '">Désélectionner</button></div>' +
      '<div class="bulkacts">' + actions.map(a =>
        '<button class="btn sm' + (a.warn ? ' warn' : ' gh') + '" data-a="bulk" data-v="' + a.op +
        '" title="' + a.hint + '">' + a.label + '</button>').join('') + '</div></div>';
  },

  /* =============================== FLOTTE =============================== */
  /* Une liste compacte : trente appareils doivent tenir sous les yeux, se
     cocher et se piloter en lot. Le détail d'un appareil — cabine, rétrofits,
     affectation — est sur sa fiche, à un clic. */
  fleet() {
    const s = G.s;
    let h = '';

    if (!s.fleet.length) {
      h += '<div class="empty">Aucun appareil.<br>Rendez-vous chez les constructeurs.</div>';
      return h + this.programs();
    }

    const val = s.fleet.reduce((t, a) => t + acValue(a), 0);
    const fixed = s.fleet.reduce((t, a) => t + G.aircraftFixedTotal(a), 0);
    h += '<div class="card"><div class="grid3">' +
      '<div class="stat">Appareils<b>' + s.fleet.length + '</b></div>' +
      '<div class="stat">Valeur<b>' + money(val) + '</b></div>' +
      '<div class="stat">Charges passives<b>' + money(fixed) + '/mois</b></div></div></div>';

    const order = {aog: 0, maint: 1, idle: 2, flying: 3};
    const list = s.fleet.slice().sort((a, b) => (order[a.status] - order[b.status]) || a.id - b.id);

    h += this.bulkBar('ac', [
      {op: 'ac-maint',   label: 'Envoyer en révision', hint: 'Chaque appareil part à l’atelier, si la trésorerie suit.'},
      {op: 'ac-unassign', label: 'Retirer de leur ligne', hint: 'Les appareils quittent leur ligne et restent au sol.'},
      {op: 'ac-sell',    label: 'Vendre', hint: 'Cession immédiate à 88 % de la valeur comptable.', warn: true}
    ]);

    h += '<h4 class="sec">Flotte (' + s.fleet.length + ')</h4>';
    h += this.viewBar();
    if (Map2D.opts.cards) {
      list.forEach(ac => { h += this.acCard(ac); });
    } else {
      h += '<table class="t sel"><tr><th style="width:22px">' +
           '<span class="cbx' + (this.sel.ac.length === list.length ? ' on' : '') +
           '" data-a="selallac" data-v=""></span></th>' +
           '<th>Appareil</th><th style="width:78px">Usure</th><th>Affectation</th></tr>';
      list.forEach(ac => {
        const t = AC_BY_ID[ac.type];
        const r = ac.routeId ? s.routes.find(x => x.id === ac.routeId) : null;
        h += '<tr' + (this.sel.ac.indexOf(ac.id) >= 0 ? ' class="on"' : '') + '>' +
             '<td>' + this.selBox('ac', ac.id) + '</td>' +
             '<td data-a="aircraft" data-v="' + ac.id + '" style="cursor:pointer">' +
             '<span class="iata">' + ac.reg + '</span>' + this.acBadge(ac) +
             '<div class="mini">' + t.name + ' · ' +
             (ac.ageM < 12 ? ac.ageM + ' mois' : (ac.ageM / 12).toFixed(1) + ' ans') + '</div></td>' +
             '<td>' + this.gaugeCell(pct(ac.wear), ac.wear, this.wearColor(ac.wear)) + '</td>' +
             '<td class="mini">' + (r ? r.a + ' ↔ ' + r.b : '—') + '</td></tr>';
      });
      h += '</table>';
    }
    h += '<div class="mini" style="margin-top:7px">Cliquez un appareil pour sa fiche : cabine, ' +
         'rétrofits, affectation, revente.</div>';
    return h + this.programs();
  },

  /* Les programmes de compagnie, communs à toute la flotte. */
  programs() {
    const s = G.s;
    const progs = s.programs || (s.programs = {});
    const bought = PROGRAMS.filter(p => progs[p.id]).length;
    let h = '<h4 class="sec">Programmes de compagnie (' + bought + '/' + PROGRAMS.length + ')</h4>';
    h += '<div class="mini" style="margin-bottom:8px">Investissements permanents qui s’appliquent ' +
         'à toute la flotte, présente et à venir.</div>';
    PROGRAMS.forEach(p => {
      const on = !!progs[p.id];
      h += '<div class="card' + (on ? ' sel' : '') + '"><div class="row">' +
        '<div style="flex:1"><div class="ttl">' + p.name +
        (on ? ' <span class="tag ok">en place</span>' : '') + '</div>' +
        '<div class="sub">' + p.desc + '</div></div></div>' +
        (on ? '' : '<button class="btn" style="width:100%;margin-top:9px" data-a="prog" data-v="' + p.id + '"' +
          (s.cash < p.cost ? ' disabled' : '') + '>Lancer — ' + money(p.cost) + '</button>') +
        '</div>';
    });
    return h;
  },

  /* ============================== APPAREIL =============================== */
  aircraft(id) {
    const s = G.s, ac = s.fleet.find(a => a.id === id);
    if (!ac) { this.open('fleet'); return ['Flotte', this.fleet()]; }
    const t = AC_BY_ID[ac.type];
    const r = ac.routeId ? s.routes.find(x => x.id === ac.routeId) : null;
    const wearPct = Math.min(100, ac.wear * 100);
    const wearCol = ac.wear > 0.8 ? 'var(--red)' : (ac.wear > BAL.MAINT_THRESHOLD ? 'var(--gold)' : 'var(--green)');
    let badge = '<span class="tag ok">en ligne</span>';
    if (ac.status === 'idle')  badge = '<span class="tag warn">au sol</span>';
    if (ac.status === 'maint') badge = '<span class="tag">révision ' + ac.maintLeft + ' j</span>';
    if (ac.status === 'aog')   badge = '<span class="tag bad">immobilisé</span>';

    let h = '<div class="card"><div class="ttl">' + t.name + ' ' + badge + '</div>' +
      '<div class="sub">' + ac.reg + ' · ' + t.cat + ' · ' +
      (ac.ageM < 12 ? ac.ageM + ' mois' : (ac.ageM / 12).toFixed(1) + ' ans') + '</div>' +
      '<div class="grid3" style="margin-top:9px">' +
      '<div class="stat">Valeur<b>' + money(acValue(ac)) + '</b></div>' +
      '<div class="stat">Autonomie<b>' + num(t.range) + ' km</b></div>' +
      '<div class="stat">' + (t.seats ? 'Sièges<b>' + t.seats + '</b>' : 'Fret<b>' + t.cargo + ' t</b>') + '</div>' +
      '</div></div>';

    // ce que l'appareil coûte, qu'il vole ou non
    const f = G.aircraftFixed(ac);
    h += '<div class="minitab"><span>Charges passives <b>' + money(G.aircraftFixedTotal(ac)) + '/mois</b></span>' +
      '<span>Équipages <b>' + money(f.crewFix) + '</b></span>' +
      '<span>Maintenance <b>' + money(f.maintFix) + '</b></span></div>';
    if (!r)
      h += '<div class="mini flag warn" style="margin-top:8px">Sans affectation : ces charges courent ' +
           'quand même, soit ' + money(G.aircraftFixedTotal(ac) / 30) + ' par jour perdus.</div>';

    h += '<div class="row mini" style="margin-top:10px"><span>Usure</span><span style="color:' + wearCol + '">' +
      wearPct.toFixed(0) + ' %</span></div><div class="bar"><i style="width:' + wearPct +
      '%;background:' + wearCol + '"></i></div>';
    if (ac.wear > BAL.MAINT_THRESHOLD)
      h += '<div class="mini flag ' + (ac.status === 'aog' ? 'bad' : 'warn') + '" style="margin-top:6px">' +
        (ac.status === 'aog'
          ? 'Cloué au sol : seule une révision le remet en vol.'
          : 'Au-delà de ' + pct(BAL.MAINT_THRESHOLD) + ', des vols commencent à être annulés.') + '</div>';

    h += '<h4 class="sec">Améliorations</h4>';
    const owned = ac.mods || [];
    h += '<div class="mods">';
    AC_MODS.forEach(m => {
      const has = owned.indexOf(m.id) >= 0;
      const cost = G.modCostFor(ac, m.id);
      h += '<button class="mod' + (has ? ' on' : '') + '"' +
        (has ? ' disabled' : ' data-a="mod" data-v="' + ac.id + ':' + m.id + '"') +
        ' title="' + m.desc + ' — ' + modEffect(m) + '">' +
        '<b>' + m.name + '</b><span>' + (has ? 'installé' : money(cost)) + '</span></button>';
    });
    h += '</div>';

    if (t.seats) {
      const sp = seatsOf(t, ac.cabin);
      h += '<label class="lb">Configuration cabine — ' + sp.eco + ' éco / ' + sp.biz + ' aff. / ' + sp.first + ' pre.</label>' +
        '<select onchange="UI.setCabin(' + ac.id + ',this.value)">' +
        CABIN_ORDER.map(k => '<option value="' + k + '"' + (ac.cabin === k ? ' selected' : '') + '>' +
          CABINS[k].label + ' — ' + CABINS[k].desc + '</option>').join('') + '</select>';
    } else {
      h += '<div class="mini" style="margin-top:8px">Avion tout-cargo · ' + t.cargo + ' tonnes</div>';
    }

    h += '<label class="lb">Affectation</label><select onchange="UI.setRoute(' + ac.id + ',this.value)">' +
      '<option value="">— au sol —</option>' +
      s.routes.filter(x => t.range >= x.dist).map(x =>
        '<option value="' + x.id + '"' + (ac.routeId === x.id ? ' selected' : '') + '>' +
        x.a + ' ↔ ' + x.b + ' (' + num(x.dist) + ' km)</option>').join('') + '</select>';
    if (r)
      h += '<button class="btn gh sm" style="width:100%;margin-top:6px" data-a="route" data-v="' + r.id +
           '">Voir la ligne ' + CITY_BY_CODE[r.a].name + ' ↔ ' + CITY_BY_CODE[r.b].name + '</button>';

    h += '<div class="row" style="margin-top:11px;gap:6px">' +
      '<button class="btn sm gh" data-a="maint" data-v="' + ac.id + '">Révision (' +
      money(G.maintCost(ac.id)) + ')</button>' +
      '<button class="btn sm warn" data-a="sell" data-v="' + ac.id + '">Vendre ' +
      money(acValue(ac) * 0.88) + '</button></div>';
    return [ac.reg, h];
  },

  /* ============================ CONSTRUCTEURS =========================== */
  market() {
    const s = G.s;
    let h = '';
    if (s.mods.acPrice < 1)
      h += '<div class="card" style="border-color:var(--gold)"><b>Salon aéronautique</b><div class="mini">Remise de ' +
           pct(1 - s.mods.acPrice) + ' sur tous les appareils.</div></div>';
    h += '<div class="mini" style="margin-bottom:10px">Trésorerie disponible : <b>' + money(s.cash) + '</b></div>';

    let cat = '';
    AIRCRAFT.forEach(t => {
      if (t.cat !== cat) { cat = t.cat; h += '<h4 class="sec">' + cat + '</h4>'; }
      const price = Math.round(t.price * s.mods.acPrice);
      h += '<div class="card"><div class="row"><div><div class="ttl">' + t.name + '</div>' +
        '<div class="sub">' + t.maker + '</div></div><b>' + money(price) + '</b></div>' +
        '<div class="grid3" style="margin-top:9px">' +
        (t.seats ? '<div class="stat">Sièges<b>' + t.seats + '</b></div>'
                 : '<div class="stat">Fret<b>' + t.cargo + ' t</b></div>') +
        '<div class="stat">Rayon<b>' + num(t.range) + ' km</b></div>' +
        '<div class="stat">Vitesse<b>' + t.speed + ' km/h</b></div></div>' +
        '<div class="row" style="margin-top:9px"><span class="mini">Coût horaire ≈ ' +
        money(t.crew + t.maint + t.fuel * t.speed * BAL.FUEL_BASE * s.mods.fuel) + '/h</span>' +
        '<button class="btn sm" data-a="buyac" data-v="' + t.id + '"' + (s.cash < price ? ' disabled' : '') +
        '>Commander</button></div></div>';
    });
    return h;
  },

  /* ============================== FINANCES ============================== */
  finance() {
    const s = G.s;
    const h6 = s.history.slice(-14);
    let h = '';
    const val = G.companyValue();
    h += '<div class="card"><div class="grid2">' +
      '<div class="stat">Trésorerie<b class="' + (s.cash < 0 ? 'neg' : '') + '">' + money(s.cash) + '</b></div>' +
      '<div class="stat">Valeur d’entreprise<b>' + money(val) + '</b></div>' +
      '<div class="stat">Dette<b>' + money(G.debtTotal()) + '</b></div>' +
      '<div class="stat">Actifs<b>' + money(G.assets()) + '</b></div></div></div>';

    h += '<h4 class="sec">Mois en cours</h4><div class="card"><div class="grid3">' +
      '<div class="stat">Recettes<b>' + money(s.month.rev) + '</b></div>' +
      '<div class="stat">Coûts<b>' + money(s.month.cost) + '</b></div>' +
      '<div class="stat">Résultat<b class="' + (s.month.rev - s.month.cost >= 0 ? 'pos' : 'neg') + '">' +
      moneySigned(s.month.rev - s.month.cost) + '</b></div></div>' +
      '<div class="mini" style="margin-top:8px">' + num(s.month.pax) + ' passagers · ' +
      num(s.month.cargo) + ' t de fret ce mois-ci</div></div>';

    if (h6.length) {
      const max = Math.max(...h6.map(x => Math.abs(x.profit)), 1);
      h += '<h4 class="sec">Résultat mensuel</h4><div class="card"><svg viewBox="0 0 300 90" style="width:100%;height:90px">';
      h6.forEach((x, i) => {
        const bw = 300 / h6.length, bh = Math.abs(x.profit) / max * 38;
        const y = x.profit >= 0 ? 45 - bh : 45;
        h += '<rect x="' + (i * bw + 1.5) + '" y="' + y + '" width="' + (bw - 3) + '" height="' + Math.max(1, bh) +
             '" style="fill:' + (x.profit >= 0 ? 'var(--green)' : 'var(--red)') + '" rx="1.5"/>';
      });
      h += '<line x1="0" y1="45" x2="300" y2="45" style="stroke:var(--line)"/></svg>' +
           '<div class="row mini"><span>' + MONTHS[h6[0].m] + ' ' + h6[0].y + '</span><span>' +
           MONTHS[h6[h6.length-1].m] + ' ' + h6[h6.length-1].y + '</span></div></div>';

      h += '<table class="t"><tr><th>Mois</th><th>Recettes</th><th>Résultat</th><th>Pax</th></tr>';
      h6.slice().reverse().slice(0, 10).forEach(x => {
        h += '<tr><td>' + MONTHS[x.m].slice(0, 4) + '. ' + x.y + '</td><td>' + money(x.rev) + '</td>' +
             '<td class="' + (x.profit >= 0 ? 'pos' : 'neg') + '">' + moneySigned(x.profit) + '</td>' +
             '<td>' + num(x.pax) + '</td></tr>';
      });
      h += '</table>';
    }

    h += '<h4 class="sec">Financement</h4>';
    const maxL = G.maxLoan();
    h += '<div class="card"><div class="mini">Capacité d’emprunt restante : <b>' + money(maxL) +
      '</b> · taux ' + pct(BAL.LOAN_RATE, 1) + ' sur ' + BAL.LOAN_MONTHS + ' mois</div>' +
      '<div class="row" style="margin-top:9px;gap:6px">' +
      '<input type="number" id="loanAmt" min="1" step="1" value="' + Math.max(1, Math.round(maxL / 2e6)) + '" style="width:90px">' +
      '<span class="mini">M€</span>' +
      '<button class="btn sm" data-a="loan" style="margin-left:auto"' + (maxL <= 0 ? ' disabled' : '') + '>Emprunter</button></div></div>';
    s.loans.forEach(l => {
      h += '<div class="card"><div class="row"><div><div class="ttl">' + money(l.principal) + ' empruntés</div>' +
        '<div class="sub">reste ' + money(l.remaining) + ' · ' + money(l.monthly) + '/mois · ' + l.months + ' mois</div></div>' +
        '<button class="btn sm gh" data-a="repay" data-v="' + l.id + '">Solder</button></div></div>';
    });

    const fleetFix = s.fleet.reduce((t, a) => t + G.aircraftFixedTotal(a), 0);
    const slotFix = Object.keys(s.slots).reduce((t, c) => t + s.slots[c], 0) * BAL.SLOT_UPKEEP;
    const mktFix = s.routes.length * BAL.MARKETING_ROUTE;
    const loanFix = s.loans.reduce((t, l) => t + l.monthly, 0);
    h += '<h4 class="sec">Charges incompressibles</h4><div class="card"><table class="t">' +
      '<tr><td>Flotte : équipages, maintenance, assurance…</td><td style="text-align:right">' + money(fleetFix) + '</td></tr>' +
      '<tr><td>Siège et direction</td><td style="text-align:right">' + money(BAL.MONTHLY_HQ) + '</td></tr>' +
      '<tr><td>Marketing (' + s.routes.length + ' lignes)</td><td style="text-align:right">' + money(mktFix) + '</td></tr>' +
      '<tr><td>Redevances de créneaux</td><td style="text-align:right">' + money(slotFix) + '</td></tr>' +
      '<tr><td>Échéances d’emprunt</td><td style="text-align:right">' + money(loanFix) + '</td></tr>' +
      '<tr><td><b>Total dû chaque mois</b></td><td style="text-align:right"><b>' +
      money(fleetFix + BAL.MONTHLY_HQ + mktFix + slotFix + loanFix) + '</b></td></tr></table>' +
      '<div class="mini" style="margin-top:8px">Ces charges tombent même si vos avions restent au sol. ' +
      'Le détail poste par poste est dans <b>Statistiques</b>.</div></div>';
    return h;
  },

  /* ============================= CONCURRENCE ============================ */
  rivals() {
    const s = G.s;
    const mine = s.routes.reduce((t, r) => t + r.last.pax, 0);
    const rows = s.rivals.map(r => ({n: r.name, c: r.color, pax: r.paxDay, rep: r.rep,
      rt: r.routes.length, hub: r.home, me: false, style: r.style}));
    rows.push({n: s.airline.name, c: 'var(--st-ok)', pax: mine, rep: s.rep,
      rt: s.routes.length, hub: s.home, me: true, style: 'Votre compagnie'});
    rows.sort((a, b) => b.pax - a.pax);
    const tot = rows.reduce((t, r) => t + r.pax, 0) || 1;

    let h = '<table class="t"><tr><th>#</th><th>Compagnie</th><th>Pax/j</th><th>Part</th><th>Rép.</th></tr>';
    rows.forEach((r, i) => {
      h += '<tr' + (r.me ? ' style="background:var(--hover);font-weight:600"' : '') + '><td>' + (i + 1) + '</td>' +
        '<td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + r.c +
        ';margin-right:6px"></span>' + r.n + '</td><td>' + num(r.pax) + '</td><td>' + pct(r.pax / tot) +
        '</td><td>' + Math.round(r.rep) + '</td></tr>';
    });
    h += '</table>';

    h += '<h4 class="sec">Profils</h4>';
    s.rivals.forEach(r => {
      h += '<div class="card"><div class="row"><div class="ttl"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' +
        r.color + '"></span>' + r.name + '</div><span class="mini">hub ' + r.home + '</span></div>' +
        '<div class="sub">' + r.style + '</div>' +
        '<div class="grid3" style="margin-top:8px"><div class="stat">Lignes<b>' + r.routes.length + '</b></div>' +
        '<div class="stat">Pax/j<b>' + num(r.paxDay) + '</b></div>' +
        '<div class="stat">Réputation<b>' + Math.round(r.rep) + '</b></div></div></div>';
    });
    return h;
  },

  /* ============================== OBJECTIFS ============================= */
  goals() {
    const s = G.s;
    const val = G.companyValue(), share = G.marketShare();
    const mine = s.routes.reduce((t, r) => t + r.last.pax, 0);
    const leader = s.rivals.every(r => r.paxDay <= mine);
    const D = G.DIFF(), goals = G.goals();
    const doneN = goals.filter(g => g.done).length;
    let h = '';
    if (D.sandbox) {
      h += '<div class="card big"><div class="row"><div class="ttl">Mode créatif</div>' +
        '<span class="tag ok">' + D.name + '</span></div>' +
        '<div class="mini" style="margin-top:4px">Partie libre : la trésorerie se remplit toute ' +
        'seule, les créneaux sont ouverts partout et il n’y a ni faillite ni victoire. ' +
        'Les jalons ci-dessous restent là pour se repérer.</div>' +
        '<div class="mini" style="margin-top:6px">Valeur d’entreprise ' + money(val) +
        ' · part de marché ' + pct(share, 1) +
        ' · ' + num(mine) + ' pax/jour' + (leader ? ' · première compagnie mondiale' : '') +
        '</div></div>';
      return h + this.milestones();
    }
    h += '<div class="card big"><div class="row"><div class="ttl">Objectif final</div>' +
      '<span class="tag ' + (doneN === goals.length ? 'ok' : '') + '">' + D.name + '</span></div>' +
      '<div class="mini" style="margin-top:4px">Les quatre conditions doivent être réunies ' +
      'en même temps. ' + doneN + ' sur ' + goals.length + ' atteinte' + (doneN > 1 ? 's' : '') + '.</div>';
    goals.forEach(g => {
      h += '<label class="lb" style="display:flex;align-items:center;gap:7px">' +
        '<span class="chk' + (g.done ? ' on' : '') + '"></span>' + g.label + '</label>' +
        '<div class="bar"><i style="width:' +
        Math.min(100, Math.max(0, g.now / Math.max(1e-9, g.target) * 100)) + '%;background:' +
        (g.done ? 'var(--green)' : 'var(--navy2)') + '"></i></div>' +
        '<div class="mini" style="margin:3px 0 2px">' + g.text + '</div>';
    });
    h += '</div>';

    return h + this.milestones();
  },

  /* Les paliers de compagnie : le rang atteint, le suivant en détail, et le
     reste en aperçu. C'est le cap intermédiaire entre la première ligne et la
     première place mondiale. */
  milestones() {
    const s = G.s;
    const T = G.tierNow();
    let h = '<h4 class="sec">Paliers de compagnie</h4>';

    h += '<div class="card"><div class="row"><div><div class="mini">Rang actuel</div>' +
         '<div class="ttl">' + (T.tier ? T.tier.name : 'Compagnie naissante') + '</div></div>' +
         '<span class="tag ' + (T.index >= 0 ? 'ok' : '') + '">' + (T.index + 1) + ' / ' +
         T.list.length + '</span></div>' +
         '<div class="mini" style="margin-top:3px">' +
         (T.tier ? T.tier.desc : 'Pas encore de ligne en service.') + '</div></div>';

    if (T.next) {
      h += '<div class="card big"><div class="mini">Palier suivant</div>' +
           '<div class="ttl">' + T.next.name + '</div>' +
           '<div class="mini" style="margin:2px 0 7px">' + T.next.desc + '</div>';
      T.next.reqs.forEach(r => {
        h += '<div class="row" style="padding:3px 0"><span class="mini">' +
             '<span class="chk' + (r.done ? ' on' : '') + '"></span>' + r.label + '</span>' +
             '<span class="mini"><b>' + num(r.now) + '</b> / ' + num(r.target) + '</span></div>' +
             '<div class="bar"><i style="width:' +
             Math.min(100, Math.max(0, r.now / Math.max(1, r.target) * 100)) + '%;background:' +
             (r.done ? 'var(--green)' : 'var(--gold)') + '"></i></div>';
      });
      h += '</div>';
    }

    const rest = T.list.filter((t, i) => i !== T.index && i !== T.index + 1);
    if (rest.length) {
      h += '<div style="margin-top:4px">';
      rest.forEach(t => {
        h += '<div class="row" style="padding:5px 0;border-bottom:1px solid var(--line2)">' +
             '<span class="mini"><span class="chk' + (t.done ? ' on' : '') + '"></span>' + t.name + '</span>' +
             '<span class="mini">' + t.reqs.filter(r => r.done).length + ' / ' + t.reqs.length + '</span></div>';
      });
      h += '</div>';
    }

    if (s.events.length) {
      h += '<h4 class="sec">Événements en cours</h4>';
      s.events.forEach(e => {
        const def = EVENT_DEFS.find(d => d.id === e.id);
        h += '<div class="card" style="border-left:2px solid var(--gold)"><div class="ttl">' + e.label + '</div>' +
          '<div class="sub">' + (def ? def.text : '') + '</div>' +
          '<div class="mini" style="margin-top:5px">Encore ' + e.left + ' jour(s)</div></div>';
      });
    }

    h += '<h4 class="sec">Journal de bord</h4>';
    s.log.slice(0, 12).forEach(l => {
      h += '<div style="padding:6px 0;border-bottom:1px solid var(--line2)"><div style="font-weight:600;font-size:12.5px">' +
        l.t + '</div><div class="mini">' + l.x + '</div></div>';
    });
    h += '<button class="btn gh sm" style="width:100%;margin-top:8px" data-a="panel" data-v="log">' +
         'Ouvrir le journal complet</button>';
    return h;
  },

  /* ================================ AIDE ================================ */
  help() {
    return '' +
    '<h4 class="sec">Principe</h4><div class="mini">Vous dirigez une compagnie aérienne mondiale. ' +
    'Achetez des créneaux dans les aéroports, ouvrez des lignes, affectez des avions, fixez vos tarifs, ' +
    'et devenez la première compagnie du monde.</div>' +
    '<h4 class="sec">Boucle de jeu</h4><div class="mini">' +
    '<b>1.</b> <b>Ouvrir une ligne</b> (touche <b>N</b>, ou depuis la fiche d’une ville) : l’assistant ' +
    'chiffre les créneaux, choisit l’appareil et projette le résultat.<br>' +
    '<b>2.</b> Un seul bouton achète tout, ouvre la ligne, affecte l’avion et la règle.<br>' +
    '<b>3.</b> Ajustez le <b>tarif</b> : trop cher, vos concurrents raflent la mise ; trop bas, vous perdez de l’argent.<br>' +
    '<b>4.</b> Les résultats tombent chaque fin de mois.</div>' +
    '<h4 class="sec">L’assistant de ligne</h4><div class="mini">Il tient dans une seule vue : les deux ' +
    'escales — au clavier, au clic sur la carte ou par la recherche —, la demande et les concurrents ' +
    'de la liaison, puis <b>les appareils du catalogue classés par retour sur investissement</b> pour ' +
    'cette distance précise, chacun avec le résultat quotidien qu’il dégagerait une fois bien réglé. ' +
    'Le devis détaille les créneaux à acheter (ceux que vous détenez déjà sont déduits), les appareils ' +
    'à commander (ceux qui dorment en flotte sont repris), le total et la trésorerie qui restera. ' +
    'Si la liaison dépasse l’autonomie de tout le catalogue, l’assistant propose les escales ' +
    'intermédiaires qui la coupent en deux vols.</div>' +
    '<h4 class="sec">Hubs & correspondances</h4><div class="mini">Un <b>hub</b> relie automatiquement vos lignes entre elles : ' +
    'un passager Madrid→Tokyo peut transiter par votre hub s’il n’existe pas de vol direct. Les sièges invendus se remplissent, ' +
    'la marge grimpe. Les redevances y sont aussi réduites. Maximum ' + BAL.MAX_HUBS + ' hubs.</div>' +
    '<h4 class="sec">Cabines</h4><div class="mini">Les classes affaires et première rapportent 3× et 6× plus par siège, mais ' +
    'occupent 2,4× et 4,6× plus de place. Elles ne se remplissent que sur les axes d’affaires (indice « Affaires » de la ville).</div>' +
    '<h4 class="sec">Usure</h4><div class="mini">Chaque heure de vol use l’appareil. Au-delà de ' + pct(BAL.MAINT_THRESHOLD) +
    ' d’usure les annulations commencent et la réputation chute ; à 100 % l’avion est cloué au sol. ' +
    'Une révision coûte cher et immobilise l’avion ' + G.maintDays() + ' jours.</div>' +
    '<h4 class="sec">Fret</h4><div class="mini">Tout avion de passagers transporte du fret en soute. Les avions <b>cargo</b> ' +
    'n’emportent aucun passager mais beaucoup de tonnage, et se moquent de votre réputation.</div>' +
    '<h4 class="sec">Charges passives</h4><div class="mini">Un avion coûte cher <i>même au sol</i> : salaires des équipages, ' +
    'maintenance programmée, assurance, stationnement, formation. Un appareil sans ligne perd de l’argent tous les jours. ' +
    'Le détail poste par poste, les recettes par classe et les ratios unitaires sont dans <b>Statistiques</b>.</div>' +
    '<h4 class="sec">Gagner la partie</h4><div class="mini">Quatre conditions doivent être ' +
    'réunies <i>en même temps</i> : la valeur d’entreprise, la première place mondiale en trafic, ' +
    'un réseau couvrant les sept régions du monde avec trois hubs, et plusieurs exercices ' +
    'bénéficiaires d’affilée. Le panneau <b>Objectifs</b> suit chacune d’elles et nomme les ' +
    'régions qui vous manquent. L’Océanie ne s’atteint qu’avec un hub en Asie ou au Moyen-Orient.</div>' +
    '<h4 class="sec">Réputation et créneaux</h4><div class="mini">En difficulté normale et ' +
    'difficile, les grandes plateformes n’accordent leurs créneaux qu’aux compagnies d’une ' +
    'certaine réputation — votre base fait exception. Pour monter : des cabines soignées, ' +
    'des avions récents et révisés, des hubs, et des tarifs raisonnables.</div>' +
    '<h4 class="sec">Couleur des lignes</h4><div class="mini">Sur la carte, une ligne ' +
    '<b style="color:var(--st-sat-i)">rouge</b> est <b>pleine</b> : les avions partent complets. Si elle ' +
    'bat lentement, elle est en plus <b>saturée</b> — elle renvoie beaucoup plus de monde ' +
    'qu’elle n’en transporte, un appareil de plus s’y paierait. Une ligne ' +
    '<b style="color:var(--st-def-i)">violette</b> est déficitaire, une ligne ' +
    '<b style="color:var(--st-low-i)">bleu pâle</b> vole trop vide. Les lignes saines gardent ' +
    'le bleu de la légende. ' +
    'Le panneau Réseau reprend ces états, et survoler une ligne du tableau la met en avant sur la carte.</div>' +
    '<h4 class="sec">Plusieurs avions sur une ligne</h4><div class="mini">Rien ne limite le nombre ' +
    'd’appareils affectés à une même liaison : chacun ajoute ses rotations, donc de la fréquence et ' +
    'des parts de marché. Il faut simplement un créneau libre à chaque escale, par appareil.</div>' +
    '<h4 class="sec">Améliorations</h4><div class="mini">Chaque appareil accepte six rétrofits : ' +
    'bouts d’aile et rétrofit moteurs pour la consommation, allègement cabine, ' +
    '<b>maintenance prédictive</b> qui ralentit l’usure de 30 %, rénovation de cabine et connectivité ' +
    'qui font accepter un tarif plus élevé. Le prix suit la taille de l’appareil.</div>' +
    '<h4 class="sec">Programmes de compagnie</h4><div class="mini">Quatre investissements permanents, ' +
    'valables pour toute la flotte : atelier de maintenance intégré (révisions moins chères et plus ' +
    'courtes), <b>planification automatique des révisions</b>, école de formation interne (salaires ' +
    'allégés) et couverture carburant (crises pétrolières amorties).</div>' +
    '<h4 class="sec">Fréquence</h4><div class="mini">Sur chaque ligne vous fixez le nombre de vols quotidiens par appareil. ' +
    'Voler plus souvent capte des parts de marché mais coûte davantage et vide les avions. Le bouton ' +
    '<b>Conseillée</b> calcule la fréquence qui maximise le résultat de la ligne.</div>' +
    '<h4 class="sec">Affichage</h4><div class="mini">L’engrenage en bas à droite de la carte ouvre les ' +
    'réglages : <b>mode sombre</b>, cycle jour / nuit, lignes des concurrents, traînées de condensation, ' +
    'halos de trafic, noms de villes, grain du papier. Vos choix sont conservés d’une partie à l’autre.</div>' +
    '<h4 class="sec">Paliers de compagnie</h4><div class="mini">Entre la première ligne et la ' +
    'première place mondiale, sept paliers nommés jalonnent la partie : compagnie locale, ' +
    'régionale, transporteur national, continentale, intercontinentale, grand réseau mondial, ' +
    'première compagnie mondiale. Ils ne rapportent rien : ils nomment où vous en êtes et disent ' +
    'ce qui manque pour le suivant. Le panneau <b>Objectifs</b> les détaille.</div>' +
    '<h4 class="sec">Faillite</h4><div class="mini">Une trésorerie négative pendant ' + BAL.BANKRUPT_DAYS +
    ' jours consécutifs met fin à la partie. Empruntez avant qu’il ne soit trop tard, ou vendez des avions.</div>' +
    '<h4 class="sec">Alertes et conseils</h4><div class="mini">Le panneau <b>Alertes</b>, en haut de la ' +
    'barre, rassemble tout ce qui appelle une décision — lignes saturées ou déficitaires, avions cloués ' +
    'au sol ou sans affectation, trésorerie tendue, réglages qui laissent de l’argent sur la table — ' +
    'du plus urgent au plus accessoire, chaque point avec le bouton qui le règle. Les pastilles de la ' +
    'barre d’outils indiquent d’où vient le problème. Chaque fiche de ligne porte en tête un ' +
    '<b>conseil</b> : le levier le plus rentable ici, chiffré.</div>' +
    '<button class="btn" style="width:100%;margin-bottom:4px" data-a="guide" data-v="">' +
    'Relancer la partie guidée</button>' +
    '<div class="mini" style="margin-bottom:4px">Huit étapes : ouvrir une ligne, lire ses comptes, ' +
    'savoir où regarder ensuite. Le guide suit ce que vous faites et ne bloque rien.</div>' +
    '<h4 class="sec">Quand un aéroport est saturé</h4><div class="mini">Une grande plateforme ' +
    'finit par n’avoir plus rien à vendre. Sa fiche ouvre alors trois portes, de la moins chère ' +
    'à la plus chère : les <b>horaires creux</b>, toujours disponibles à moitié prix, mais dont ' +
    'les vols attirent jusqu’à ' + pct(BAL.OFFPEAK_MALUS) + ' de passagers en moins — vos bons ' +
    'créneaux servent d’abord, un horaire creux ne coûte rien tant qu’aucun appareil de plus ne ' +
    's’en sert ; l’<b>agrandissement</b>, que vous financez et qui livre ses créneaux après des ' +
    'mois de travaux, concurrents compris ; et le <b>rachat</b> à une compagnie installée, ' +
    'immédiat, à plusieurs fois le prix normal, refusé si votre réputation est trop faible. ' +
    'La compagnie qui cède allège réellement sa desserte.</div>' +
    '<h4 class="sec">Agir sur plusieurs éléments</h4><div class="mini">Les tableaux du panneau ' +
    '<b>Réseau</b> et du panneau <b>Flotte</b> se cochent. Dès qu’une case est cochée, une barre ' +
    'd’actions apparaît en tête : tarif conseillé, fréquence conseillée, tarif ±5 % ou fermeture ' +
    'pour les lignes ; révision, retrait de ligne ou revente pour les appareils. La case du haut ' +
    'coche tout. Les gestes irréversibles demandent confirmation et annoncent leur montant. ' +
    'Une alerte qui vise plusieurs appareils les coche d’avance.</div>' +
    '<h4 class="sec">Le fil de la partie</h4><div class="mini">À chaque clôture, un <b>bilan mensuel</b> ' +
    'met la partie en pause : résultat et écart avec le mois précédent, lignes qui ont porté le mois et ' +
    'lignes qui ont coûté, événements en cours, classement mondial. Une nouvelle qui appelle une décision ' +
    '— crise, appareil cloué au sol, découvert — arrête aussi la partie. Les deux se règlent dans ' +
    '<b>Affichage → Déroulement</b> — ou, pour le bilan, d’une case dans sa propre fenêtre. ' +
    'Le <b>journal de bord</b> (touche <b>J</b>) garde tout le fil, ' +
    'daté et filtrable par rubrique.</div>' +
    '<h4 class="sec">Raccourcis</h4><div class="mini"><b>Espace</b> pause · <b>1-4</b> vitesse · <b>Échap</b> fermer · ' +
    '<b>molette</b> zoom · <b>glisser</b> déplacer la carte<br>' +
    '<b>N</b> ouvrir une ligne · <b>/</b> ou <b>G</b> chercher une ville, un code IATA ou une de vos lignes<br>' +
    '<b>A</b> alertes · <b>R</b> réseau · <b>F</b> flotte · <b>C</b> constructeurs · <b>E</b> finances · ' +
    '<b>S</b> statistiques · <b>K</b> concurrence · <b>O</b> objectifs · <b>J</b> journal · <b>H</b> aide<br>' +
    'La <b>flèche</b> en haut du volet revient à la vue précédente ; <b>Échap</b> fait de même, puis referme le volet.</div>';
  },

  /* ============================== actions =============================== */
  setPrice(id, v) {
    const r = G.s.routes.find(x => x.id === id);
    if (!r) return;
    r.priceMult = v / 100;
    const fare = baseDemand(r.a, r.b).price * r.priceMult;
    const a = this.el('fareEco'), b = this.el('farePct'), c = this.el('fareHigh');
    if (a) a.textContent = Math.round(fare) + ' €';
    if (b) b.textContent = Math.round(r.priceMult * 100) + ' % du prix de référence';
    if (c) c.textContent = 'Affaires ' + Math.round(fare * BAL.CLASS_MULT.biz) +
                           ' € · Première ' + Math.round(fare * BAL.CLASS_MULT.first) + ' €';
  },
  setFreq(id, v, maxL) {
    const r = G.s.routes.find(x => x.id === id);
    if (!r) return;
    v = parseInt(v, 10);
    r.freqCap = (v >= maxL) ? 0 : v;
    const e = this.el('freqVal');
    if (e) e.textContent = v + ' / ' + maxL;
  },
  setCabin(acId, v) {
    const ac = G.s.fleet.find(a => a.id === acId);
    if (ac) { ac.cabin = v; this.render(); }
  },
  setRoute(acId, v) {
    if (!v) { G.unassign(acId); }
    else {
      const r = G.assign(acId, parseInt(v, 10));
      if (!r.ok) this.toast('Impossible', r.why, 'bad');
    }
    this.render();
  },

  /* =============================== toasts =============================== */
  /* ============================== RECHERCHE ============================== */
  /* Barre d'accès rapide (touche « / ») : une ville par son nom, son code ou
     son pays, une de vos lignes par l'une de ses deux escales. Entrée ouvre
     le premier résultat et l'amène au centre de la carte. */
  found: [],

  search() {
    const box = this.el('find'), inp = this.el('findIn');
    box.classList.add('open');
    inp.value = ''; inp.focus();
    this.searchFilter('');
  },
  searchClose() {
    this.el('find').classList.remove('open');
    this.el('findIn').blur();
  },
  searchFilter(q) {
    const norm = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const n = norm(q.trim());
    const out = [];
    if (G.s) G.s.routes.forEach(r => {
      const ca = CITY_BY_CODE[r.a], cb = CITY_BY_CODE[r.b];
      const hay = norm(ca.name + ' ' + cb.name + ' ' + r.a + ' ' + r.b);
      if (!n || hay.indexOf(n) >= 0)
        out.push({kind: 'route', label: ca.name + ' ↔ ' + cb.name,
                  sub: 'votre ligne · ' + num(r.dist) + ' km · ' + pct(r.last.lf) + ' de remplissage',
                  a: 'route', v: r.id, focus: null});
    });
    CITIES.forEach(c => {
      const hay = norm(c.name + ' ' + c.code + ' ' + c.country);
      if (!n || hay.indexOf(n) >= 0) {
        const mine = G.s && (G.s.slots[c.code] || 0) > 0;
        out.push({kind: 'city', label: c.name,
                  sub: c.code + ' · ' + c.country + (mine ? ' · vous y avez des créneaux' : ''),
                  a: 'city', v: c.code, focus: c.code});
      }
    });
    this.found = out.slice(0, 9);
    this.el('findList').innerHTML = this.found.length
      ? this.found.map((r, i) =>
          '<div class="fr' + (i === 0 ? ' on' : '') + '" data-i="' + i + '">' +
          '<span class="fk">' + (r.kind === 'route' ? 'ligne' : 'ville') + '</span>' +
          '<span><b>' + r.label + '</b><span class="mini"> ' + r.sub + '</span></span></div>').join('')
      : '<div class="fr mini">Aucun résultat.</div>';
  },
  searchPick(i) {
    const r = this.found[i];
    if (!r) return;
    this.searchClose();
    if (r.focus) Map2D.focus(r.focus, Math.max(Map2D.cam.z, 8));
    act(r.a, r.v);
  },

  toast(title, text, kind) {
    const d = document.createElement('div');
    d.className = 'msg ' + (kind || '');
    d.innerHTML = '<div class="mt">' + title + '</div>' + (text ? '<div class="md">' + text + '</div>' : '');
    const t = this.el('ticker');
    t.appendChild(d);
    while (t.children.length > 5) t.removeChild(t.firstChild);
    setTimeout(() => { d.style.transition = 'opacity .5s'; d.style.opacity = '0';
      setTimeout(() => d.remove(), 500); }, 7000);
  },

  /* =============================== modale =============================== */
  /* `closable` : une fenêtre qu'on peut refermer d'un Échap ou d'un clic à
     côté — le bilan, une nouvelle. L'écran de départ et la fin de partie, eux,
     attendent un choix. */
  modalClosable: false,
  modal(html, closable) {
    this.modalClosable = !!closable;
    this.el('mbox').innerHTML = html;
    this.el('modal').classList.add('open');
  },
  closeModal() { this.el('modal').classList.remove('open'); },

  /* =============================== topbar =============================== */
  /* Chaque tuile porte une valeur et de quoi la lire immédiatement : une
     tendance, une jauge, ou la courbe des douze derniers mois. Le liseré de
     gauche dit d'un coup d'œil si le chiffre va bien — c'est ce qu'on voit
     sans regarder. */

  /* Couleur du liseré : 'ok', 'warn', 'bad' ou 'info'. */
  tile(id, kind) { const e = this.el(id); if (e) e.dataset.t = kind; },

  /* Une variation, avec sa flèche et son signe. */
  trend(v, txt) {
    if (!v) return '<i>·</i> ' + txt;
    return '<span class="' + (v > 0 ? 'pos' : 'neg') + '">' +
           (v > 0 ? '▲' : '▼') + ' ' + txt + '</span>';
  },

  /* Courbe des douze derniers résultats mensuels, tracée à la main dans le
     <svg> de la tuile. L'historique est mensuel (engine.js), donc douze points
     couvrent l'année écoulée. */
  spark(series) {
    const el = this.el('sProfit'), fb = this.el('dProfit');
    if (!el) return;
    /* Tant qu'il n'y a pas deux mois clos, il n'y a pas de courbe à tracer :
       la tuile le dit plutôt que de laisser un vide. */
    if (series.length < 2) {
      el.style.display = 'none';
      if (fb) fb.textContent = series.length ? 'un seul mois clos' : 'premier mois en cours';
      el.innerHTML = '';
      return;
    }
    el.style.display = '';
    if (fb) fb.textContent = '';
    const lo = Math.min(0, ...series), hi = Math.max(0, ...series);
    const span = (hi - lo) || 1;
    const pts = series.map((v, i) =>
      ((i / (series.length - 1)) * 100).toFixed(1) + ' ' +
      (14 - ((v - lo) / span) * 13).toFixed(1));
    const col = series[series.length - 1] >= 0 ? 'var(--green)' : 'var(--red)';
    const line = 'M' + pts.join(' L');
    el.innerHTML =
      '<path d="' + line + ' L100 15 L0 15 Z" style="fill:' + col + ';opacity:.15;stroke:none"/>' +
      '<path d="' + line + '" style="fill:none;stroke:' + col + ';stroke-width:1.4;' +
      'stroke-linejoin:round;stroke-linecap:round"/>';
  },

  topbar() {
    const s = G.s; if (!s) return;
    this.el('brandName').textContent = s.airline.name;
    const h = s.history || [];
    const last = h.length ? h[h.length - 1] : null;
    const prev = h.length > 1 ? h[h.length - 2] : null;

    this.el('kCash').innerHTML = '<span class="' + (s.cash < 0 ? 'neg' : '') + '">' + money(s.cash) + '</span>';
    this.tile('tCash', s.cash < 0 ? 'bad' : 'ok');
    const dCash = last && prev ? last.cash - prev.cash : 0;
    this.el('dCash').innerHTML = last && prev
      ? this.trend(dCash, money(Math.abs(dCash)) + ' sur le mois')
      : '<i>·</i> premier mois';

    const p = s.month.rev - s.month.cost;
    this.el('kProfit').innerHTML = '<span class="' + (p >= 0 ? 'pos' : 'neg') + '">' + moneySigned(p) + '</span>';
    this.tile('tProfit', p >= 0 ? 'ok' : 'bad');
    this.spark(h.slice(-12).map(x => x.profit));

    const flying = s.fleet.filter(a => a.status === 'flying').length;
    const maint  = s.fleet.filter(a => a.status === 'maint').length;
    this.el('kFleet').innerHTML = s.fleet.length + ' <small>appareils</small>';
    this.tile('tFleet', maint ? 'warn' : 'info');
    this.el('dFleet').textContent = flying + ' en ligne' + (maint ? ' · ' + maint + ' en visite' : '');

    this.el('kRep').innerHTML = Math.round(s.rep) + ' <small>/ 100</small>';
    this.tile('tRep', s.rep >= 70 ? 'ok' : (s.rep >= 50 ? 'warn' : 'bad'));
    this.el('bRep').style.width = s.rep + '%';
    this.el('bRep').style.background = s.rep >= 70 ? 'var(--green)'
                                     : (s.rep >= 50 ? 'var(--gold)' : 'var(--red)');

    this.el('kShare').textContent = pct(G.marketShare(), 1);
    this.tile('tShare', 'info');
    const dSh = last && prev ? (last.share - prev.share) * 100 : 0;
    this.el('dShare').innerHTML = last && prev
      ? this.trend(dSh, Math.abs(dSh).toFixed(1) + ' pt')
      : '<i>·</i> premier mois';

    const v = G.companyValue(), goal = G.DIFF().goal;
    this.el('kValue').innerHTML = money(v) + ' <small>/ ' + money(goal) + '</small>';
    this.tile('tValue', v >= goal ? 'ok' : 'info');
    this.el('bValue').style.width = Math.min(100, v / goal * 100) + '%';
    this.el('bValue').style.background = 'var(--green)';

    this.badges();
    const hh = Math.floor(Math.max(0, Math.min(0.999, G.acc)) * 24);
    this.el('date').innerHTML = s.d + ' ' + MONTHS[s.m] + ' ' + s.y +
      '<span class="hh">' + (hh < 10 ? '0' : '') + hh + ' h · jour ' + s.day + '</span>';
  }
};
