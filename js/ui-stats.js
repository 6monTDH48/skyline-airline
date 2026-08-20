/* =========================================================================
   ui-stats.js — panneau « Statistiques » (compte de résultat détaillé,
   indicateurs unitaires, trafic) et fiche statistique d'un aéroport.
   ========================================================================= */

/* agrège plusieurs mois d'historique en un seul grand livre */
function sumLedgers(hist) {
  const l = newLedger();
  hist.forEach(h => { if (h.led) Object.keys(h.led).forEach(k => l[k] = (l[k] || 0) + h.led[k]); });
  return l;
}
function sumField(hist, f) { return hist.reduce((t, h) => t + (h[f] || 0), 0); }

/* barre horizontale proportionnelle */
function barRow(label, value, total, color, sub) {
  const w = total > 0 ? Math.max(0.4, value / total * 100) : 0;
  return '<div class="lrow"><div class="lrow-t"><span>' + label + '</span>' +
    '<span class="lrow-v">' + money(value) + (total > 0 ? ' <i>' + (value / total * 100).toFixed(1) + '%</i>' : '') +
    '</span></div><div class="lbar"><i style="width:' + w + '%;background:' + color + '"></i></div>' +
    (sub ? '<div class="lrow-s">' + sub + '</div>' : '') + '</div>';
}

UI.statsPeriod = 'month';

UI.stats = function () {
  const s = G.s;
  const hist = s.history;
  const per = this.statsPeriod;
  let led, rev, cost, pax, ask, rpk, ftk, hours, flights, cancels, label, months;

  if (per === 'month' || !hist.length) {
    led = s.month.led; rev = s.month.rev; cost = s.month.cost; pax = s.month.pax;
    ask = s.month.ask; rpk = s.month.rpk; ftk = s.month.ftk;
    hours = s.month.hours; flights = s.month.flights; cancels = s.month.cancels;
    label = MONTHS[s.m] + ' ' + s.y + ' (en cours, jour ' + s.d + ')';
    months = 1;
  } else {
    const n = per === 'year' ? 12 : hist.length;
    const h = hist.slice(-n);
    months = h.length;
    led = sumLedgers(h);
    rev = sumField(h, 'rev'); cost = sumField(h, 'cost'); pax = sumField(h, 'pax');
    ask = sumField(h, 'ask'); rpk = sumField(h, 'rpk'); ftk = sumField(h, 'ftk');
    hours = sumField(h, 'hours'); flights = sumField(h, 'flights'); cancels = sumField(h, 'cancels');
    label = months + ' mois — ' + MONTHS[h[0].m].slice(0, 4) + '. ' + h[0].y + ' → ' +
            MONTHS[h[h.length - 1].m].slice(0, 4) + '. ' + h[h.length - 1].y;
  }

  const profit = rev - cost;
  const revTotal = REV_LINES.reduce((t, r) => t + (led[r[0]] || 0), 0) || 1;

  let h = '<div class="segbar">' +
    ['month:Mois en cours', 'year:12 mois', 'all:Tout'].map(o => {
      const k = o.split(':')[0];
      return '<button class="' + (per === k ? 'on' : '') + '" data-a="statper" data-v="' + k + '">' +
             o.split(':')[1] + '</button>';
    }).join('') + '</div>' +
    '<div class="mini" style="margin:-2px 0 12px">' + label + '</div>';

  /* ---------------- synthèse ---------------- */
  h += '<div class="card big"><div class="grid3">' +
    '<div class="stat">Recettes<b>' + money(rev) + '</b></div>' +
    '<div class="stat">Charges<b>' + money(cost) + '</b></div>' +
    '<div class="stat">Résultat<b class="' + (profit >= 0 ? 'pos' : 'neg') + '">' + moneySigned(profit) + '</b></div>' +
    '</div><div class="grid3" style="margin-top:9px">' +
    '<div class="stat">Marge nette<b class="' + (profit >= 0 ? 'pos' : 'neg') + '">' +
      (rev > 0 ? (profit / rev * 100).toFixed(1) + ' %' : '—') + '</b></div>' +
    '<div class="stat">Passagers<b>' + num(pax) + '</b></div>' +
    '<div class="stat">Fret<b>' + num(ftk / 1e3) + ' kt·km</b></div>' +
    '</div></div>';

  /* ---------------- recettes ---------------- */
  h += '<h4 class="sec">Recettes</h4><div class="card">';
  REV_LINES.forEach(r => {
    if ((led[r[0]] || 0) > 0) h += barRow(r[1], led[r[0]], revTotal, r[2]);
  });
  h += '<div class="ltot"><span>Total des recettes</span><b>' + money(revTotal) + '</b></div></div>';

  /* ---------------- charges ---------------- */
  const costTotal = COST_GROUPS.reduce((t, g) =>
    t + g.lines.reduce((u, l) => u + (led[l[0]] || 0), 0), 0) || 1;
  h += '<h4 class="sec">Charges d’exploitation</h4>';
  COST_GROUPS.forEach(g => {
    const sub = g.lines.reduce((t, l) => t + (led[l[0]] || 0), 0);
    if (sub <= 0) return;
    h += '<div class="card"><div class="row" style="margin-bottom:8px">' +
      '<b>' + g.label + '</b><span class="lrow-v">' + money(sub) +
      ' <i>' + (sub / costTotal * 100).toFixed(0) + '%</i></span></div>';
    g.lines.forEach(l => {
      if ((led[l[0]] || 0) > 0) h += barRow(l[1], led[l[0]], costTotal, g.color);
    });
    h += '</div>';
  });
  h += '<div class="ltot big"><span>Total des charges</span><b>' + money(costTotal) + '</b></div>';

  /* ------------ fixe contre variable ------------ */
  const passive = ['crewFix','maintFix','insurance','parking','training','admin','overhaul',
                   'hq','marketing','slots','interest'].reduce((t, k) => t + (led[k] || 0), 0);
  const variable = costTotal - passive;
  h += '<h4 class="sec">Structure des coûts</h4><div class="card">' +
    '<div class="splitbar"><i style="width:' + (variable / costTotal * 100) + '%"></i>' +
    '<u style="width:' + (passive / costTotal * 100) + '%"></u></div>' +
    '<div class="row mini" style="margin-top:7px">' +
    '<span><span class="dot" style="background:var(--red)"></span>Variables ' + money(variable) +
    ' (' + pct(variable / costTotal) + ')</span>' +
    '<span><span class="dot" style="background:var(--gold)"></span>Passives ' + money(passive) +
    ' (' + pct(passive / costTotal) + ')</span></div>' +
    '<div class="mini" style="margin-top:8px">Les charges passives courent que vos avions volent ou non : ' +
    'salaires des équipages, maintenance programmée, assurance, stationnement, formation, siège. ' +
    'Un appareil immobilisé coûte en moyenne <b>' +
    money(s.fleet.length ? s.fleet.reduce((t, a) => t + G.aircraftFixedTotal(a), 0) / s.fleet.length : 0) +
    '</b> par mois sans rien rapporter.</div></div>';

  /* ---------------- indicateurs unitaires ---------------- */
  const paxRev = led.revEco + led.revBiz + led.revFirst + led.revConnect;
  h += '<h4 class="sec">Indicateurs unitaires</h4><div class="card"><div class="grid2">' +
    '<div class="stat">Recette au siège-km (RSKO)<b>' + (ask > 0 ? (rev / ask * 100).toFixed(2) + ' c€' : '—') + '</b></div>' +
    '<div class="stat">Coût au siège-km (CSKO)<b>' + (ask > 0 ? (cost / ask * 100).toFixed(2) + ' c€' : '—') + '</b></div>' +
    '<div class="stat">Recette unitaire passager<b>' + (rpk > 0 ? (paxRev / rpk * 100).toFixed(2) + ' c€/pkt' : '—') + '</b></div>' +
    '<div class="stat">Coefficient de remplissage<b>' + (ask > 0 ? pct(rpk / ask, 1) : '—') + '</b></div>' +
    '<div class="stat">Recette moyenne par vol<b>' + (flights > 0 ? money(rev / flights) : '—') + '</b></div>' +
    '<div class="stat">Coût moyen par vol<b>' + (flights > 0 ? money(cost / flights) : '—') + '</b></div>' +
    '<div class="stat">Recette par passager<b>' + (pax > 0 ? Math.round(paxRev / pax) + ' €' : '—') + '</b></div>' +
    '<div class="stat">Coût du carburant / vol<b>' + (flights > 0 ? money(led.fuel / flights) : '—') + '</b></div>' +
    '</div></div>';

  /* ---------------- trafic et flotte ---------------- */
  const util = s.fleet.length && months ? hours / s.fleet.length / (months * 30.4) : 0;
  h += '<h4 class="sec">Trafic et exploitation</h4><div class="card"><div class="grid2">' +
    '<div class="stat">Vols réalisés<b>' + num(flights) + '</b></div>' +
    '<div class="stat">Vols annulés<b class="' + (cancels > 0 ? 'neg' : '') + '">' + num(cancels) + '</b></div>' +
    '<div class="stat">Heures de vol<b>' + num(hours) + ' h</b></div>' +
    '<div class="stat">Utilisation moyenne<b>' + util.toFixed(1) + ' h/jour</b></div>' +
    '<div class="stat">Sièges-km offerts<b>' + num(ask / 1e6) + ' M</b></div>' +
    '<div class="stat">Passagers-km<b>' + num(rpk / 1e6) + ' M</b></div>' +
    '<div class="stat">Appareils au sol<b>' + s.fleet.filter(a => !a.routeId).length + ' / ' + s.fleet.length + '</b></div>' +
    '<div class="stat">Appareils immobilisés<b>' + s.fleet.filter(a => a.status === 'maint' || a.status === 'aog').length + '</b></div>' +
    '</div></div>';

  /* ---------------- historique ---------------- */
  if (hist.length > 1) {
    const hh = hist.slice(-24);
    const max = Math.max(...hh.map(x => Math.max(x.rev, x.cost)), 1);
    const W = 300, H = 96, bw = W / hh.length;
    h += '<h4 class="sec">Recettes et charges mensuelles</h4><div class="card">' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:' + H + 'px">';
    hh.forEach((x, i) => {
      const rh = x.rev / max * (H - 14), ch = x.cost / max * (H - 14);
      h += '<rect x="' + (i * bw + 1) + '" y="' + (H - 10 - rh) + '" width="' + (bw / 2 - 1) +
           '" height="' + Math.max(0.6, rh) + '" style="fill:var(--green)" rx="1"/>' +
           '<rect x="' + (i * bw + bw / 2) + '" y="' + (H - 10 - ch) + '" width="' + (bw / 2 - 1) +
           '" height="' + Math.max(0.6, ch) + '" style="fill:var(--red)" rx="1"/>';
    });
    h += '<line x1="0" y1="' + (H - 10) + '" x2="' + W + '" y2="' + (H - 10) + '" style="stroke:var(--line)"/></svg>' +
      '<div class="row mini"><span><span class="dot" style="background:var(--green)"></span>Recettes ' +
      '<span class="dot" style="background:var(--red);margin-left:8px"></span>Charges</span>' +
      '<span>' + MONTHS[hh[hh.length - 1].m].slice(0, 4) + '. ' + hh[hh.length - 1].y + '</span></div></div>';
  }

  /* ---------------- meilleures et pires lignes ---------------- */
  if (s.routes.length) {
    const sorted = s.routes.slice().sort((a, b) => b.last.profit - a.last.profit);
    h += '<h4 class="sec">Contribution des lignes (par jour)</h4><table class="t">' +
      '<tr><th>Ligne</th><th>Recettes</th><th>Charges</th><th>Résultat</th></tr>';
    sorted.slice(0, 5).concat(sorted.length > 8 ? sorted.slice(-3) : []).forEach(r => {
      h += '<tr data-a="route" data-v="' + r.id + '" data-hover="' + r.id + '" style="cursor:pointer"' +
        ' title="' + CITY_BY_CODE[r.a].name + ' ↔ ' + CITY_BY_CODE[r.b].name + '"><td>' +
        CITY_BY_CODE[r.a].name + ' ↔ ' + CITY_BY_CODE[r.b].name + '</td>' +
        '<td>' + money(r.last.rev) + '</td><td>' + money(r.last.cost) + '</td>' +
        '<td class="' + (r.last.profit >= 0 ? 'pos' : 'neg') + '">' + moneySigned(r.last.profit) + '</td></tr>';
    });
    h += '</table>';
  }
  return h;
};

/* ======================= bloc statistique d'un aéroport ==================== */
UI.airportBlock = function (code) {
  const st = G.airportStats(code), c = CITY_BY_CODE[code];
  const s = G.s;
  const cap = st.total || 1;
  const wMine = st.used / cap * 100, wIdle = (st.owned - st.used) / cap * 100,
        wRiv = st.rivalSlots / cap * 100;

  let h = '<h4 class="sec">Statistiques de l’escale</h4>';
  h += '<div class="card"><div class="grid3">' +
    '<div class="stat">Mouvements/j<b>' + num(st.legs) + '</b></div>' +
    '<div class="stat">Passagers/j<b>' + num(st.pax) + '</b></div>' +
    '<div class="stat">Remplissage<b>' + (st.seats ? pct(st.lf) : '—') + '</b></div>' +
    '</div><div class="grid3" style="margin-top:8px">' +
    '<div class="stat">Fret/j<b>' + num(st.cargo) + ' t</b></div>' +
    '<div class="stat">Correspondances<b>' + num(st.connect) + '</b></div>' +
    '<div class="stat">Heures de vol/j<b>' + st.hours.toFixed(1) + '</b></div>' +
    '</div></div>';

  h += '<div class="card"><div class="grid3">' +
    '<div class="stat">Recettes attribuées/j<b>' + money(st.rev) + '</b></div>' +
    '<div class="stat">Charges/j<b>' + money(st.cost) + '</b></div>' +
    '<div class="stat">Résultat/j<b class="' + (st.rev - st.cost >= 0 ? 'pos' : 'neg') + '">' +
      moneySigned(st.rev - st.cost) + '</b></div></div>' +
    '<div class="mini" style="margin-top:8px">Redevances versées à cet aéroport : <b>' +
    money(st.fees) + '</b> par jour' + (s.hubs.indexOf(code) >= 0 ? ' (tarif hub)' : '') + '.</div></div>';

  h += '<div class="card"><div class="row"><span class="mini">Occupation des créneaux</span>' +
    '<span class="mini">' + st.total + ' au total</span></div>' +
    '<div class="splitbar tri" style="margin-top:6px">' +
    '<i style="width:' + wMine + '%"></i><u style="width:' + wIdle + '%"></u>' +
    '<em style="width:' + wRiv + '%"></em></div>' +
    '<div class="row mini" style="margin-top:6px;flex-wrap:wrap;gap:10px">' +
    '<span><span class="dot" style="background:var(--st-ok)"></span>Vous, utilisés ' + st.used + '</span>' +
    '<span><span class="dot" style="background:var(--st-low)"></span>Vous, libres ' + (st.owned - st.used) + '</span>' +
    '<span><span class="dot" style="background:var(--st-rival)"></span>Concurrents ' + st.rivalSlots + '</span>' +
    '<span><span class="dot" style="background:var(--track2)"></span>Disponibles ' + st.free + '</span>' +
    '</div></div>';

  h += '<div class="card"><div class="row"><span class="mini">Votre part du marché de l’escale</span>' +
    '<b>' + pct(st.share, 1) + '</b></div>' +
    '<div class="bar" style="margin-top:5px"><i style="width:' + Math.min(100, st.share * 300) + '%"></i></div>' +
    '<div class="mini" style="margin-top:6px">Marché total estimé au départ et à l’arrivée : <b>' +
    num(st.market) + ' passagers/jour</b>, toutes compagnies confondues.</div></div>';

  if (st.rivals.length) {
    h += '<table class="t"><tr><th>Compagnie</th><th>Lignes</th><th>Vols/j</th></tr>';
    st.rivals.forEach(x => {
      h += '<tr><td><span class="dot" style="background:' + x.rv.color + '"></span>' + x.rv.name +
        '</td><td>' + x.routes + '</td><td>' + x.freq + '</td></tr>';
    });
    h += '</table>';
  }
  return h;
};
