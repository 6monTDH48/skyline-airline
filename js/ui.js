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
    this.el('dock').classList.remove('open');
    this.el('hud').classList.remove('shift');
    this.el('opts').classList.remove('shift');
    this.el('legend').classList.remove('hide');
    document.querySelectorAll('#toolbar button[data-panel]').forEach(b => b.classList.remove('on'));
    Map2D.selCity = null; Map2D.selRoute = null;
  },
  refresh() { if (this.panel) this.render(); this.topbar(); },

  panelName(v) {
    const names = {network:'Réseau', fleet:'Flotte', market:'Constructeurs',
                   finance:'Finances', stats:'Statistiques', rivals:'Concurrence',
                   goals:'Objectifs', help:'Comment jouer'};
    if (v.panel === 'city')  return CITY_BY_CODE[v.ctx] ? CITY_BY_CODE[v.ctx].name : 'la ville';
    if (v.panel === 'route') {
      const r = G.s.routes.find(x => x.id === v.ctx);
      return r ? CITY_BY_CODE[r.a].name + ' ↔ ' + CITY_BY_CODE[r.b].name : 'la ligne';
    }
    return names[v.panel] || 'la vue précédente';
  },

  render() {
    const b = this.el('dockbody');
    let title = '', html = '';
    switch (this.panel) {
      case 'city':    { const r = this.city(this.ctx);    title = r[0]; html = r[1]; break; }
      case 'route':   { const r = this.route(this.ctx);   title = r[0]; html = r[1]; break; }
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

    h += '<h4 class="sec">Créneaux aéroportuaires</h4>';
    h += '<div class="card">' +
         '<div class="mini">Un créneau est nécessaire par appareil et par escale. ' +
         'Vous en détenez <b>' + owned + '</b>, dont <b>' + (owned - used) + '</b> de libre' +
         ((owned - used) > 1 ? 's' : '') + '.</div>' +
         '<div class="row" style="margin-top:10px">' +
         '<div class="mini">Prochain créneau : <b>' + money(cost) + '</b></div>' +
         '<button class="btn sm" data-a="buyslot" data-v="' + code + '"' +
         (free <= 0 || s.cash < cost ? ' disabled' : '') + '>Acheter</button></div>' +
         (free <= 0 ? '<div class="mini" style="margin-top:6px;color:#a63a2b">Aéroport saturé : plus aucun créneau à vendre.</div>' : '') +
         '</div>';

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

    h += '<button class="btn" style="width:100%;margin-top:6px" data-a="link" data-v="' + code + '">Ouvrir une ligne depuis ' + c.name + '</button>';

    h += '<h4 class="sec">Marchés les plus porteurs</h4><table class="t"><tr><th>Destination</th><th>Pax/j</th><th>Distance</th><th></th></tr>';
    dests.forEach(x => {
      const ex = G.findRoute(code, x.c.code);
      h += '<tr><td>' + x.c.name + '</td><td>' + num(x.d.total) + '</td><td>' + num(x.d.dist) + ' km</td>' +
           '<td style="text-align:right">' + (ex
             ? '<span class="tag ok">ouverte</span>'
             : '<button class="btn sm gh" data-a="mkroute" data-v="' + code + ':' + x.c.code + '">ouvrir</button>') +
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

    let h = '';
    h += '<div class="card"><div class="ttl">' + ca.name + ' ↔ ' + cb.name + '</div>' +
         '<div class="sub">' + num(r.dist) + ' km · demande estimée ' + num(dem.total) + ' pax/jour</div>' +
         '<div class="grid3" style="margin-top:10px">' +
         '<div class="stat">Passagers/j<b>' + num(r.last.pax) + '</b></div>' +
         '<div class="stat">Remplissage<b>' + pct(r.last.lf) + '</b></div>' +
         '<div class="stat">Part de marché<b>' + pct(r.last.share) + '</b></div></div>' +
         '<div class="grid3" style="margin-top:8px">' +
         '<div class="stat">Recettes/j<b>' + money(r.last.rev) + '</b></div>' +
         '<div class="stat">Coûts/j<b>' + money(r.last.cost) + '</b></div>' +
         '<div class="stat">Résultat/j<b class="' + (r.last.profit >= 0 ? 'pos' : 'neg') + '">' +
         moneySigned(r.last.profit) + '</b></div></div>';
    const stR = G.routeState(r), metaR = G.ROUTE_STATES[stR];
    if (metaR.hint)
      h += '<div class="mini flag ' + (metaR.tag === 'bad' ? 'bad' : 'warn') + '" style="margin-top:9px">' +
           '<b>Ligne ' + metaR.label + '.</b> ' + metaR.hint +
           (stR === 'saturee' && r.last.unmet > 1 ? ' Environ <b>' + num(r.last.unmet) +
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
         '<div class="mini" style="margin-top:7px" id="fareHigh">Affaires ' + Math.round(fare * BAL.CLASS_MULT.biz) +
         ' € · Première ' + Math.round(fare * BAL.CLASS_MULT.first) + ' €</div></div>';

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
      h += '<div class="card"><div class="row"><div><div class="ttl">' + t.name + ' <span class="mini">' + ac.reg + '</span></div>' +
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
        '<button class="btn" style="width:100%;margin-top:9px" data-a="slot" data-v="' + miss + '"' +
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
         '</div><div class="mini" style="margin-top:9px">Astuce : cliquez une ville sur la carte, puis « Ouvrir une ligne » et cliquez la ville de destination.</div></div>';

    if (!s.routes.length) return h + '<div class="empty">Votre réseau est vide.<br>Commencez par votre hub : ' +
      CITY_BY_CODE[s.home].name + '.</div>';

    const sorted = s.routes.slice().sort((a, b) => b.last.profit - a.last.profit);
    const nSat = s.routes.filter(r => G.routeState(r) === 'saturee').length;
    h += '<h4 class="sec">Lignes par rentabilité</h4>';
    if (nSat) h += '<div class="mini flag bad" style="margin-bottom:8px">' + nSat +
      (nSat > 1 ? ' lignes saturées refusent' : ' ligne saturée refuse') +
      ' des passagers faute de sièges. Elles apparaissent en rouge sur la carte.</div>';
    h += '<table class="t"><tr><th>Ligne</th><th>Rempl.</th><th>Pax/j</th><th>Résultat/j</th></tr>';
    sorted.forEach(r => {
      const st = G.routeState(r), meta = G.ROUTE_STATES[st];
      h += '<tr data-a="route" data-v="' + r.id + '" data-hover="' + r.id + '" style="cursor:pointer"' +
           ' title="' + CITY_BY_CODE[r.a].name + ' (' + r.a + ') ↔ ' + CITY_BY_CODE[r.b].name +
           ' (' + r.b + ') · ' + num(r.dist) + ' km' + (meta.hint ? ' · ' + meta.hint : '') + '">' +
           '<td><b>' + CITY_BY_CODE[r.a].name + '</b> ↔ <b>' + CITY_BY_CODE[r.b].name + '</b>' +
           (meta.label ? ' <span class="tag ' + meta.tag + '">' + meta.label + '</span>' : '') +
           '<div class="mini">' + r.a + ' ↔ ' + r.b + ' · ' + num(r.dist) + ' km</div></td>' +
           '<td>' + pct(r.last.lf) + '</td><td>' + num(r.last.pax) + '</td>' +
           '<td class="' + (r.last.profit >= 0 ? 'pos' : 'neg') + '">' + moneySigned(r.last.profit) + '</td></tr>';
    });
    h += '</table>';

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

  /* =============================== FLOTTE =============================== */
  fleet() {
    const s = G.s;
    let h = '';

    // --- programmes de compagnie ---
    const progs = s.programs || (s.programs = {});
    const bought = PROGRAMS.filter(p => progs[p.id]).length;
    h += '<h4 class="sec">Programmes de compagnie (' + bought + '/' + PROGRAMS.length + ')</h4>';
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

    if (!s.fleet.length) {
      h += '<h4 class="sec">Flotte</h4><div class="empty">Aucun appareil.<br>' +
           'Rendez-vous chez les constructeurs.</div>';
      return h;
    }
    h += '<h4 class="sec">Flotte (' + s.fleet.length + ')</h4>';
    const val = s.fleet.reduce((t, a) => t + acValue(a), 0);
    h += '<div class="card"><div class="grid3">' +
      '<div class="stat">Appareils<b>' + s.fleet.length + '</b></div>' +
      '<div class="stat">Valeur<b>' + money(val) + '</b></div>' +
      '<div class="stat">Au sol<b>' + s.fleet.filter(a => !a.routeId).length + '</b></div></div></div>';

    const order = {aog:0, maint:1, idle:2, flying:3};
    s.fleet.slice().sort((a, b) => (order[a.status] - order[b.status]) || a.id - b.id).forEach(ac => {
      const t = AC_BY_ID[ac.type];
      const r = ac.routeId ? s.routes.find(x => x.id === ac.routeId) : null;
      const wearPct = Math.min(100, ac.wear * 100);
      const wearCol = ac.wear > 0.8 ? '#a63a2b' : (ac.wear > BAL.MAINT_THRESHOLD ? '#a67c1a' : '#3d7a4e');
      let badge = '<span class="tag ok">en ligne</span>';
      if (ac.status === 'idle') badge = '<span class="tag warn">au sol</span>';
      if (ac.status === 'maint') badge = '<span class="tag">révision ' + ac.maintLeft + ' j</span>';
      if (ac.status === 'aog') badge = '<span class="tag bad">immobilisé</span>';

      h += '<div class="card"><div class="row"><div><div class="ttl">' + t.name + ' ' + badge + '</div>' +
        '<div class="sub">' + ac.reg + ' · ' + (ac.ageM < 12 ? ac.ageM + ' mois' : (ac.ageM / 12).toFixed(1) + ' ans') +
        ' · valeur ' + money(acValue(ac)) + '</div></div></div>';

      // améliorations installables sur cet appareil
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

      h += '<div class="minitab" style="margin-top:8px"><span>Charges passives ' +
        '<b>' + money(G.aircraftFixedTotal(ac)) + '/mois</b></span>' +
        '<span>' + (r ? 'Ligne ' + r.a + '↔' + r.b : 'Sans affectation') + '</span></div>';

      h += '<div class="row mini" style="margin-top:8px"><span>Usure</span><span style="color:' + wearCol + '">' +
        wearPct.toFixed(0) + ' %</span></div><div class="bar"><i style="width:' + wearPct +
        '%;background:' + wearCol + '"></i></div>';

      if (t.seats) {
        const sp = seatsOf(t, ac.cabin);
        h += '<label class="lb">Configuration cabine — ' + sp.eco + ' éco / ' + sp.biz + ' aff. / ' + sp.first + ' pre.</label>' +
          '<select onchange="UI.setCabin(' + ac.id + ',this.value)">' +
          CABIN_ORDER.map(k => '<option value="' + k + '"' + (ac.cabin === k ? ' selected' : '') + '>' +
            CABINS[k].label + ' — ' + CABINS[k].desc + '</option>').join('') + '</select>';
      } else {
        h += '<div class="mini" style="margin-top:6px">Avion tout-cargo · ' + t.cargo + ' tonnes</div>';
      }

      h += '<label class="lb">Affectation</label><select onchange="UI.setRoute(' + ac.id + ',this.value)">' +
        '<option value="">— au sol —</option>' +
        s.routes.filter(x => AC_BY_ID[ac.type].range >= x.dist).map(x =>
          '<option value="' + x.id + '"' + (ac.routeId === x.id ? ' selected' : '') + '>' +
          x.a + ' ↔ ' + x.b + ' (' + num(x.dist) + ' km)</option>').join('') + '</select>';

      h += '<div class="row" style="margin-top:9px;gap:6px">' +
        '<button class="btn sm gh" data-a="maint" data-v="' + ac.id + '">Révision (' +
        money(Math.round(t.price * BAL.MAINT_COST_RATIO * Math.max(0.35, ac.wear))) + ')</button>' +
        '<button class="btn sm warn" data-a="sell" data-v="' + ac.id + '">Vendre ' +
        money(acValue(ac) * 0.88) + '</button></div>';
      h += '</div>';
    });
    return h;
  },

  /* ============================ CONSTRUCTEURS =========================== */
  market() {
    const s = G.s;
    let h = '';
    if (s.mods.acPrice < 1)
      h += '<div class="card" style="border-color:#a67c1a"><b>Salon aéronautique</b><div class="mini">Remise de ' +
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
             '" fill="' + (x.profit >= 0 ? '#3d7a4e' : '#a63a2b') + '" rx="1.5"/>';
      });
      h += '<line x1="0" y1="45" x2="300" y2="45" stroke="#cbbfa8"/></svg>' +
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
    rows.push({n: s.airline.name, c: '#1f4e79', pax: mine, rep: s.rep,
      rt: s.routes.length, hub: s.home, me: true, style: 'Votre compagnie'});
    rows.sort((a, b) => b.pax - a.pax);
    const tot = rows.reduce((t, r) => t + r.pax, 0) || 1;

    let h = '<table class="t"><tr><th>#</th><th>Compagnie</th><th>Pax/j</th><th>Part</th><th>Rép.</th></tr>';
    rows.forEach((r, i) => {
      h += '<tr' + (r.me ? ' style="background:#eef5fb;font-weight:600"' : '') + '><td>' + (i + 1) + '</td>' +
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
    let h = '<div class="card big"><div class="ttl">Objectif final</div>' +
      '<div class="mini" style="margin-top:4px">Atteindre <b>1 Md€</b> de valeur d’entreprise <i>et</i> devenir la première compagnie mondiale en trafic.</div>' +
      '<label class="lb">Valeur — ' + money(val) + ' / 1,00 Md€</label>' +
      '<div class="bar"><i style="width:' + Math.min(100, val / BAL.GOAL_VALUE * 100) + '%"></i></div>' +
      '<label class="lb">Leadership mondial — ' + pct(share, 1) + ' de part de marché</label>' +
      '<div class="bar"><i style="width:' + Math.min(100, share * 400) + '%;background:' +
      (leader ? '#3d7a4e' : '#a67c1a') + '"></i></div>' +
      '<div class="mini" style="margin-top:6px">' + (leader ? 'Vous êtes en tête du classement.'
        : 'Le leader actuel transporte ' + num(Math.max(...s.rivals.map(r => r.paxDay))) + ' pax/jour.') + '</div></div>';

    h += '<h4 class="sec">Jalons</h4>';
    const miles = [
      ['Ouvrir 5 lignes', s.routes.length >= 5, s.routes.length + '/5'],
      ['Posséder 10 appareils', s.fleet.length >= 10, s.fleet.length + '/10'],
      ['Exploiter 2 hubs', s.hubs.length >= 2, s.hubs.length + '/2'],
      ['Desservir 4 continents', new Set(s.routes.flatMap(r => [CITY_BY_CODE[r.a].region, CITY_BY_CODE[r.b].region])).size >= 4,
        new Set(s.routes.flatMap(r => [CITY_BY_CODE[r.a].region, CITY_BY_CODE[r.b].region])).size + '/4'],
      ['Réputation ≥ 80', s.rep >= 80, Math.round(s.rep) + '/80'],
      ['1 M de passagers transportés', s.totals.pax >= 1e6, num(s.totals.pax / 1e3) + ' k/1 000 k']
    ];
    miles.forEach(m => {
      h += '<div class="row" style="padding:6px 0;border-bottom:1px solid #efe7d6">' +
        '<span>' + '<span class="chk' + (m[1] ? ' on' : '') + '"></span>' + m[0] + '</span><span class="mini">' + m[2] + '</span></div>';
    });

    if (s.events.length) {
      h += '<h4 class="sec">Événements en cours</h4>';
      s.events.forEach(e => {
        const def = EVENT_DEFS.find(d => d.id === e.id);
        h += '<div class="card" style="border-left:3px solid #a67c1a"><div class="ttl">' + e.label + '</div>' +
          '<div class="sub">' + (def ? def.text : '') + '</div>' +
          '<div class="mini" style="margin-top:5px">Encore ' + e.left + ' jour(s)</div></div>';
      });
    }

    h += '<h4 class="sec">Journal de bord</h4>';
    s.log.slice(0, 40).forEach(l => {
      h += '<div style="padding:6px 0;border-bottom:1px solid #efe7d6"><div style="font-weight:600;font-size:12.5px">' +
        l.t + '</div><div class="mini">' + l.x + '</div></div>';
    });
    return h;
  },

  /* ================================ AIDE ================================ */
  help() {
    return '' +
    '<h4 class="sec">Principe</h4><div class="mini">Vous dirigez une compagnie aérienne mondiale. ' +
    'Achetez des créneaux dans les aéroports, ouvrez des lignes, affectez des avions, fixez vos tarifs, ' +
    'et devenez la première compagnie du monde.</div>' +
    '<h4 class="sec">Boucle de jeu</h4><div class="mini">' +
    '<b>1.</b> Cliquez une ville → achetez un <b>créneau</b> (il en faut un par avion et par escale).<br>' +
    '<b>2.</b> « Ouvrir une ligne » puis cliquez la ville de destination.<br>' +
    '<b>3.</b> Achetez un avion chez les <b>constructeurs</b> et affectez-le à la ligne.<br>' +
    '<b>4.</b> Ajustez le <b>tarif</b> : trop cher, vos concurrents raflent la mise ; trop bas, vous perdez de l’argent.<br>' +
    '<b>5.</b> Les résultats tombent chaque fin de mois.</div>' +
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
    '<h4 class="sec">Couleur des lignes</h4><div class="mini">Sur la carte, une ligne ' +
    '<b style="color:#c8322a">rouge</b> est <b>saturée</b> : les avions partent pleins et vous refusez ' +
    'des passagers, il faut ajouter un appareil ou monter le tarif. Une ligne ' +
    '<b style="color:#7a5a9c">violette</b> est déficitaire, une ligne ' +
    '<b style="color:#6f9bc0">bleu pâle</b> vole trop vide. Les lignes saines restent bleu foncé. ' +
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
    '<h4 class="sec">Faillite</h4><div class="mini">Une trésorerie négative pendant ' + BAL.BANKRUPT_DAYS +
    ' jours consécutifs met fin à la partie. Empruntez avant qu’il ne soit trop tard, ou vendez des avions.</div>' +
    '<h4 class="sec">Raccourcis</h4><div class="mini"><b>Espace</b> pause · <b>1-4</b> vitesse · <b>Échap</b> fermer · ' +
    '<b>molette</b> zoom · <b>glisser</b> déplacer la carte<br>La <b>flèche</b> en haut du volet revient à la vue précédente ; <b>Échap</b> fait de même, puis referme le volet.</div>';
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
  modal(html) {
    this.el('mbox').innerHTML = html;
    this.el('modal').classList.add('open');
  },
  closeModal() { this.el('modal').classList.remove('open'); },

  /* =============================== topbar =============================== */
  topbar() {
    const s = G.s; if (!s) return;
    this.el('brandName').textContent = s.airline.name;
    this.el('kCash').innerHTML = '<span class="' + (s.cash < 0 ? 'neg' : '') + '">' + money(s.cash) + '</span>';
    const p = s.month.rev - s.month.cost;
    this.el('kProfit').innerHTML = '<span class="' + (p >= 0 ? 'pos' : 'neg') + '">' + moneySigned(p) + '</span>';
    const flying = s.fleet.filter(a => a.status === 'flying').length;
    this.el('kFleet').innerHTML = s.fleet.length + ' <small>(' + flying + ' en ligne)</small>';
    this.el('kRep').textContent = Math.round(s.rep);
    this.el('bRep').style.width = s.rep + '%';
    this.el('bRep').style.background = s.rep >= 75 ? '#3d7a4e' : (s.rep >= 55 ? '#2f6fa8' : '#a63a2b');
    this.el('kShare').textContent = pct(G.marketShare(), 1);
    const v = G.companyValue();
    this.el('kValue').textContent = money(v);
    this.el('bValue').style.width = Math.min(100, v / BAL.GOAL_VALUE * 100) + '%';
    const hh = Math.floor(Math.max(0, Math.min(0.999, G.acc)) * 24);
    this.el('date').innerHTML = s.d + ' ' + MONTHS[s.m] + ' ' + s.y +
      ' <span class="hh">' + (hh < 10 ? '0' : '') + hh + ' h</span>';
  }
};
