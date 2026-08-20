/* =========================================================================
   main.js — démarrage, boucle de rendu, entrées clavier/souris, actions
   ========================================================================= */

let SPEED = 1, LAST_SPEED = 1;
let uiAcc = 0, autosaveAcc = 0;

/* ============================== démarrage ================================ */
/* Potentiel d'une base : somme de la demande de ses 10 meilleures liaisons.
   Sert à afficher un niveau de difficulté sur l'écran de départ. */
function basePotential(code) {
  return CITIES.filter(c => c.code !== code)
    .map(c => { const d = baseDemand(code, c.code); return d ? d.total : 0; })
    .sort((a, b) => b - a).slice(0, 10).reduce((t, x) => t + x, 0);
}

function startScreen() {
  const pot = {};
  CITIES.forEach(c => pot[c.code] = basePotential(c.code));
  const vals = Object.values(pot).slice().sort((a, b) => b - a);
  const hi = vals[Math.floor(vals.length * 0.30)], lo = vals[Math.floor(vals.length * 0.70)];
  const level = c => pot[c] >= hi ? 'facile' : (pot[c] >= lo ? 'modérée' : 'difficile');

  const opts = CITIES.slice().sort((a, b) =>
    a.region === b.region ? b.size - a.size : a.region.localeCompare(b.region))
    .map(c => '<option value="' + c.code + '"' + (c.code === 'CDG' ? ' selected' : '') + '>' +
      c.name + ' (' + c.code + ') — ' + REGION_NAMES[c.region] +
      ' · partie ' + level(c.code) + '</option>').join('');

  UI.modal(
    '<div class="mh"><h2>Skyline</h2><p>Vous prenez la tête d’une jeune compagnie aérienne. ' +
    'Deux A320, 151 aéroports dans le monde, et cinq concurrents déjà installés. ' +
    'Il faudra de la valeur, du trafic, un réseau sur tous les continents et des comptes ' +
    'durablement dans le vert.</p></div><div class="mb">' +
    '<label class="lb">Nom de votre compagnie</label>' +
    '<input type="text" id="inName" maxlength="24" value="Skyline Airways">' +
    '<label class="lb">Base principale (elle devient votre premier hub)</label>' +
    '<select id="inHome">' + opts + '</select>' +
    '<label class="lb">Difficulté</label>' +
    '<div class="diffs" id="inDiff">' + DIFF_ORDER.map((id, i) =>
      '<button data-diff="' + id + '"' + (id === 'normal' ? ' class="on"' : '') + '>' +
      DIFFICULTIES[id].name + '</button>').join('') + '</div>' +
    '<div class="mini" id="diffNote" style="margin-top:6px;min-height:44px"></div>' +
    '<div class="mini" style="margin-top:10px">La difficulté indiquée dépend de la demande accessible ' +
    'autour de la base. Rien ne vous empêche ensuite d’acheter des créneaux à l’autre bout du monde : ' +
    'le choix de départ change le début de partie, pas le plafond.</div>' +
    (G.hasSave() ? '<hr class="sp"><button class="choice" id="btnLoad"><b>Reprendre la partie sauvegardée</b>' +
      '<div class="mini">Charge votre dernière sauvegarde locale.</div></button>' : '') +
    '</div><div class="mf"><button class="btn" id="btnStart">Décoller</button></div>');

  let chosen = 'normal';
  const diffBox = document.getElementById('inDiff'), diffNote = document.getElementById('diffNote');
  const paintDiff = () => {
    diffBox.querySelectorAll('button').forEach(b =>
      b.classList.toggle('on', b.dataset.diff === chosen));
    const D = DIFFICULTIES[chosen];
    diffNote.innerHTML = D.desc + '<br>' + (D.sandbox
      ? '<b>Trésorerie illimitée</b> · aucun objectif, aucune faillite'
      : '<b>' + money(D.cash) + '</b> au départ · objectif <b>' + money(D.goal) + '</b>');
  };
  diffBox.querySelectorAll('button').forEach(b =>
    b.onclick = () => { chosen = b.dataset.diff; paintDiff(); });
  paintDiff();

  document.getElementById('btnStart').onclick = () => {
    const name = document.getElementById('inName').value.trim() || 'Skyline Airways';
    const home = document.getElementById('inHome').value;
    G.newGame(name, home, chosen);
    UI.closeModal();
    Map2D.focus(home, 7);
    UI.topbar();
    SPEED = 1; setSpeed(1);
    GUIDE.offer();
  };
  const bl = document.getElementById('btnLoad');
  if (bl) bl.onclick = () => {
    if (G.load()) { UI.closeModal(); Map2D.focus(G.s.home, 6); UI.topbar(); setSpeed(0); GUIDE.render(); }
    else UI.toast('Sauvegarde illisible', 'Impossible de charger la partie.', 'bad');
  };
}

/* ================================= thème ================================= */
function applyTheme() {
  document.documentElement.classList.toggle('dark', !!Map2D.opts.dark);
  Map2D.bgKey = '';                       // le fond de carte doit être repeint
}

/* ================================ vitesse ================================ */
function setSpeed(v) {
  SPEED = v;
  if (v > 0) LAST_SPEED = v;
  document.querySelectorAll('.speeds button').forEach(b =>
    b.classList.toggle('on', +b.dataset.sp === v));
}

/* ============================ boucle de rendu ============================ */
let lastT = performance.now();
function loop(t) {
  const dt = Math.min(0.12, (t - lastT) / 1000);
  lastT = t;
  if (G.s && !G.s.dead) G.step(dt, SPEED);
  Map2D.draw(dt);

  if (typeof GUIDE !== 'undefined' && G.s) GUIDE.check();

  uiAcc += dt;
  if (uiAcc > 0.9) {
    uiAcc = 0;
    if (G.s) {
      UI.topbar();
      const ae = document.activeElement;
      const busy = ae && (ae.tagName === 'INPUT' || ae.tagName === 'SELECT');
      if (UI.panel && !busy) UI.render();
    }
  }
  if (G.s && SPEED > 0) {
    autosaveAcc += dt;
    if (autosaveAcc > 90) { autosaveAcc = 0; G.save(); }
  }
  requestAnimationFrame(loop);
}

/* ============================== interactions ============================= */
function initInput() {
  const cv = document.getElementById('map');
  let down = false, moved = 0, lx = 0, ly = 0;

  cv.addEventListener('mousedown', e => {
    down = true; moved = 0; lx = e.clientX; ly = e.clientY;
    cv.classList.add('dragging');
  });
  window.addEventListener('mouseup', e => {
    cv.classList.remove('dragging');
    if (!down) return;
    down = false;
    if (moved < 5) handleClick(e);
  });
  window.addEventListener('mousemove', e => {
    const r = cv.getBoundingClientRect();
    Map2D.mouse = [e.clientX - r.left, e.clientY - r.top];
    if (down) {
      const dx = e.clientX - lx, dy = e.clientY - ly;
      moved += Math.abs(dx) + Math.abs(dy);
      Map2D.cam.x -= dx / Map2D.cam.z;
      Map2D.cam.y += dy / Map2D.cam.z;
      Map2D.syncTarget();
      lx = e.clientX; ly = e.clientY;
    } else {
      hover(e);
    }
  });
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const before = Map2D.world(mx, my);
    Map2D.cam.z *= e.deltaY < 0 ? 1.18 : 1 / 1.18;
    Map2D.clampCam();
    const after = Map2D.world(mx, my);
    Map2D.cam.x += before[0] - after[0];
    Map2D.cam.y += before[1] - after[1];
    Map2D.syncTarget();
  }, {passive:false});

  function hover(e) {
    const r = document.getElementById('map').getBoundingClientRect();
    const c = Map2D.cityAt(e.clientX - r.left, e.clientY - r.top);
    Map2D.hoverCity = c ? c.code : null;
    const tip = document.getElementById('tip');
    if (c && G.s) {
      const free = slotsFree(c.code), own = G.s.slots[c.code] || 0;
      tip.innerHTML = '<b>' + c.name + '</b> · ' + c.country +
        '<br>Marché ' + Math.round(c.size * 100) + ' · créneaux ' + own + ' à vous, ' + free + ' libres' +
        (Map2D.wizPick
          ? '<br>Cliquez pour en faire la ville de ' + (Map2D.wizPick === 'from' ? 'départ' : 'destination')
          : (Map2D.linkFrom && Map2D.linkFrom !== c.code
            ? '<br>Cliquez pour relier depuis ' + CITY_BY_CODE[Map2D.linkFrom].name : ''));
      tip.style.display = 'block';
      tip.style.left = (e.clientX + 14) + 'px';
      tip.style.top = (e.clientY + 14) + 'px';
    } else tip.style.display = 'none';
  }

  function handleClick(e) {
    if (!G.s) return;
    const r = document.getElementById('map').getBoundingClientRect();
    const c = Map2D.cityAt(e.clientX - r.left, e.clientY - r.top);
    if (!c) { if (Map2D.linkFrom || Map2D.wizPick) cancelLink(); return; }
    // choix d'une escale demandé par l'assistant
    if (Map2D.wizPick) {
      const role = Map2D.wizPick;
      cancelLink();
      UI.wiz.keep = true;
      UI.newRoute(role === 'from' ? c.code : undefined, role === 'to' ? c.code : undefined);
      if (UI.wiz.from && UI.wiz.to) Map2D.frame(UI.wiz.from, UI.wiz.to);
      return;
    }
    // « ouvrir une ligne depuis X » puis clic sur la destination : l'assistant
    // reprend la paire et chiffre tout avant le moindre achat
    if (Map2D.linkFrom && Map2D.linkFrom !== c.code) {
      const from = Map2D.linkFrom;
      cancelLink();
      UI.newRoute(from, c.code);
      Map2D.frame(from, c.code);
      return;
    }
    Map2D.selCity = c.code;
    UI.open('city', c.code);
  }

  /* ---- actions déléguées dans le dock ---- */
  document.getElementById('dockbody').addEventListener('click', e => {
    const el = e.target.closest('[data-a]');
    if (!el) return;
    const a = el.dataset.a, v = el.dataset.v;
    act(a, v);
  });
  // survol d'une ligne dans un tableau : on la met en avant sur la carte
  const dock = document.getElementById('dockbody');
  dock.addEventListener('mouseover', e => {
    const el = e.target.closest('[data-hover]');
    Map2D.hoverRoute = el ? parseInt(el.dataset.hover, 10) : null;
  });
  dock.addEventListener('mouseleave', () => { Map2D.hoverRoute = null; });

  document.getElementById('dockclose').onclick = () => UI.close();
  document.querySelectorAll('#toolbar button[data-panel]').forEach(b =>
    b.onclick = () => {
      if (UI.panel === b.dataset.panel) UI.close();
      else UI.open(b.dataset.panel, undefined, {root: true});
    });
  document.getElementById('dockback').onclick = () => UI.back();
  document.getElementById('btnSave').onclick = () => {
    const ok = G.save();
    UI.toast(ok ? 'Partie sauvegardée' : 'Échec de la sauvegarde',
             ok ? 'Vous pourrez la reprendre au prochain lancement.' : '', ok ? 'good' : 'bad');
  };
  document.querySelectorAll('.speeds button').forEach(b =>
    b.onclick = () => setSpeed(+b.dataset.sp));
  // options d'affichage
  const optPanel = document.getElementById('opts'), optBtn = document.getElementById('optBtn');
  // un réglage peut aussi être changé ailleurs qu'ici — le bilan mensuel se
  // coupe depuis sa propre fenêtre : les cases doivent suivre
  window.syncOptBoxes = () => document.querySelectorAll('#opts input[data-opt]')
    .forEach(cb => { cb.checked = Map2D.opts[cb.dataset.opt]; });
  document.querySelectorAll('#opts input[data-opt]').forEach(cb => {
    cb.checked = Map2D.opts[cb.dataset.opt];
    cb.onchange = () => {
      Map2D.opts[cb.dataset.opt] = cb.checked;
      Map2D.saveOpts();
      if (cb.dataset.opt === 'dark') applyTheme();
    };
  });
  applyTheme();
  // choix de la projection
  const projBox = document.getElementById('projs'), projNote = document.getElementById('projNote');
  const paintProj = () => {
    projBox.innerHTML = Object.keys(PROJECTIONS).map(id =>
      '<button data-proj="' + id + '"' + (Map2D.opts.proj === id ? ' class="on"' : '') + '>' +
      PROJECTIONS[id].name + '</button>').join('');
    projNote.textContent = PROJECTIONS[Map2D.opts.proj].note;
    projBox.querySelectorAll('button').forEach(b => b.onclick = () => {
      Map2D.setProjection(b.dataset.proj);
      paintProj();
    });
  };
  paintProj();

  optBtn.onclick = () => {
    const open = optPanel.classList.toggle('open');
    optBtn.classList.toggle('on', open);
  };
  document.addEventListener('mousedown', e => {
    if (optPanel.classList.contains('open') &&
        !optPanel.contains(e.target) && !optBtn.contains(e.target)) {
      optPanel.classList.remove('open');
      optBtn.classList.remove('on');
    }
  });

  document.getElementById('zIn').onclick = () => { Map2D.camT.z *= 1.4; };
  document.getElementById('zOut').onclick = () => { Map2D.camT.z /= 1.4; };
  document.getElementById('zFit').onclick = () => Map2D.fit();

  // barre de recherche rapide
  const findIn = document.getElementById('findIn'), findList = document.getElementById('findList');
  let findSel = 0;
  const paintSel = () => findList.querySelectorAll('.fr').forEach((el, i) =>
    el.classList.toggle('on', i === findSel));
  findIn.addEventListener('input', () => { findSel = 0; UI.searchFilter(findIn.value); });
  findIn.addEventListener('keydown', e => {
    if (e.key === 'Escape') { UI.searchClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); findSel = Math.min(UI.found.length - 1, findSel + 1); paintSel(); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); findSel = Math.max(0, findSel - 1); paintSel(); }
    if (e.key === 'Enter')     { e.preventDefault(); UI.searchPick(findSel); }
  });
  findList.addEventListener('click', e => {
    const el = e.target.closest('.fr[data-i]');
    if (el) UI.searchPick(parseInt(el.dataset.i, 10));
  });
  document.addEventListener('mousedown', e => {
    const box = document.getElementById('find');
    if (box.classList.contains('open') && !box.contains(e.target)) UI.searchClose();
  });

  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space') { e.preventDefault(); setSpeed(SPEED > 0 ? 0 : LAST_SPEED); }
    if (e.key === '1') setSpeed(1);
    if (e.key === '2') setSpeed(2);
    if (e.key === '3') setSpeed(4);
    if (e.key === '4') setSpeed(8);
    if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.altKey && !e.metaKey) UI.newRoute();
    const keys = {a:'alerts', r:'network', f:'fleet', c:'market', j:'log',
                  e:'finance', s:'stats', k:'rivals', o:'goals', h:'help'};
    const p = keys[e.key.toLowerCase()];
    if (p && !e.ctrlKey && !e.altKey && !e.metaKey) {
      if (UI.panel === p) UI.close(); else UI.open(p, undefined, {root: true});
    }
    if (e.key === '/' || (e.key.toLowerCase() === 'g' && !e.ctrlKey)) { e.preventDefault(); UI.search(); }
    if (e.key === 'Escape') {
      if (Map2D.linkFrom || Map2D.wizPick) cancelLink();
      else if (document.getElementById('modal').classList.contains('open')) {
        if (UI.modalClosable) UI.closeModal();      // sinon la modale attend un choix
      }
      else if (!UI.back()) UI.close();
    }
  });
  window.addEventListener('resize', () => Map2D.resize());
}

function cancelLink() {
  Map2D.linkFrom = null;
  Map2D.wizPick = null;
  document.getElementById('map').classList.remove('linking');
}

/* ============================ actions du dock ============================ */
function act(a, v) {
  const s = G.s;
  switch (a) {
    case 'focus':   Map2D.focus(v, Math.max(Map2D.cam.z, 8)); break;
    case 'city':    Map2D.selCity = v; UI.open('city', v); break;
    case 'route':   UI.open('route', parseInt(v, 10)); break;
    case 'buyoffpeak': {
      const r = G.buyOffPeak(v);
      if (!r.ok) UI.toast('Impossible', r.why, 'bad'); else UI.render();
      break;
    }
    case 'buyfrom': {
      const p = v.split('::');
      const r = G.buySlotFrom(p[0], p[1]);
      if (!r.ok) UI.toast('Négociation rompue', r.why, 'bad'); else UI.render();
      break;
    }
    case 'expand': {
      const r = G.expandAirport(v);
      if (!r.ok) UI.toast('Impossible', r.why, 'bad'); else UI.render();
      break;
    }
    case 'buyslot': {
      const r = G.buySlot(v);
      if (!r.ok) UI.toast('Impossible', r.why, 'bad'); else UI.render();
      break;
    }
    case 'hub': {
      const r = G.makeHub(v);
      if (!r.ok) UI.toast('Impossible', r.why, 'bad'); else UI.render();
      break;
    }
    case 'link':
      Map2D.linkFrom = v;
      document.getElementById('map').classList.add('linking');
      UI.toast('Nouvelle ligne', 'Cliquez la ville de destination sur la carte (Échap pour annuler).');
      break;
    case 'mkroute': {
      const p = v.split(':');
      const r = G.createRoute(p[0], p[1]);
      if (!r.ok) UI.toast('Impossible', r.why, 'bad');
      else { UI.open('route', r.route.id); Map2D.frame(p[0], p[1]); }
      break;
    }
    case 'closeroute':
      G.closeRoute(parseInt(v, 10));
      UI.open('network');
      break;
    case 'assign': {
      const p = v.split(':');
      const r = G.assign(parseInt(p[0], 10), parseInt(p[1], 10));
      if (!r.ok) UI.toast('Impossible', r.why, 'bad');
      UI.render();
      break;
    }
    case 'panel':   UI.open(v, undefined, {root: true}); break;
    case 'guide':   UI.close(); GUIDE.start(); break;
    case 'logfilter': UI.logFilter = v; UI.render(); break;
    case 'newroute': UI.newRoute(v || undefined, v ? null : undefined); break;
    case 'wizset':  UI.wizSet(v); break;
    case 'wiztype': UI.wizSet('type', v); break;
    case 'wizto':   UI.wiz.to = v; UI.render(); Map2D.frame(UI.wiz.from, v); break;
    case 'wizpair': { const p = v.split(':'); UI.newRoute(p[0], p[1]); Map2D.frame(p[0], p[1]); break; }
    case 'wizpick': {
      // on repasse en mode « cliquez une ville » ; le clic revient à l'assistant
      Map2D.linkFrom = null;
      Map2D.wizPick = v;
      document.getElementById('map').classList.add('linking');
      UI.toast('Choisissez une ville', 'Cliquez la ville de ' +
        (v === 'from' ? 'départ' : 'destination') + ' sur la carte (Échap pour annuler).');
      break;
    }
    case 'wizgo': {
      const w = UI.wiz;
      const plan = G.planRoute(w.from, w.to, {typeId: w.typeId, count: w.count});
      const r = G.openRoute(plan);
      if (!r.ok) UI.toast('Impossible', r.why, 'bad');
      else {
        Map2D.frame(w.from, w.to);
        UI.wiz = {count: 1, from: w.from, typeId: null, cargo: w.cargo, sort: w.sort};
        UI.open('route', r.route.id, {root: true});
      }
      break;
    }
    case 'optprice': {
      const r = G.s.routes.find(x => x.id === parseInt(v, 10));
      if (r) {
        const m = G.suggestPrice(r);
        if (m) {
          r.priceMult = m / 100;
          UI.toast('Tarif ajusté', m + ' % du prix de référence, soit ' +
            Math.round(baseDemand(r.a, r.b).price * r.priceMult) + ' € en éco.');
        }
        UI.render();
      }
      break;
    }
    case 'aircraft': UI.open('aircraft', parseInt(v, 10)); break;
    case 'selroute': UI.selToggle('route', parseInt(v, 10)); break;
    case 'selac':    UI.selToggle('ac', parseInt(v, 10)); break;
    case 'selallroute': UI.selAll('route', G.s.routes.map(r => r.id)); break;
    case 'selallac':    UI.selAll('ac', G.s.fleet.map(a => a.id)); break;
    case 'selclear': UI.selClear(v); UI.render(); break;
    // une alerte qui vise plusieurs appareils les coche d'avance : la barre
    // d'actions groupées est alors à un clic du geste à faire
    case 'fleetsel':
      UI.selClear();
      UI.sel.ac = v.split(',').map(x => parseInt(x, 10));
      UI.open('fleet', undefined, {root: true});
      break;
    case 'bulk':    bulk(v); break;
    case 'statper': UI.statsPeriod = v; UI.render(); break;
    case 'mod': {
      const [acId, modId] = v.split(':');
      const r = G.buyMod(parseInt(acId, 10), modId);
      if (!r.ok) UI.toast('Impossible', r.why, 'bad');
      UI.render();
      break;
    }
    case 'prog': {
      const r = G.buyProgram(v);
      if (!r.ok) UI.toast('Impossible', r.why, 'bad');
      UI.render();
      break;
    }
    case 'unassign': G.unassign(parseInt(v, 10)); UI.render(); break;
    case 'optfreq': {
      const r = G.s.routes.find(x => x.id === parseInt(v, 10));
      if (r) {
        r.freqCap = G.suggestFreq(r);
        UI.toast('Fréquence ajustée', r.freqCap
          ? r.freqCap + ' vol(s) par jour et par appareil.'
          : 'Fréquence maximale : la demande absorbe toute la capacité.');
        UI.render();
      }
      break;
    }
    case 'maint': {
      const r = G.sendMaint(parseInt(v, 10));
      if (!r.ok) UI.toast('Impossible', r.why, 'bad');
      UI.render();
      break;
    }
    case 'sell': G.sellAircraft(parseInt(v, 10)); UI.render(); break;
    case 'buyac': {
      const r = G.buyAircraft(v);
      if (!r.ok) UI.toast('Impossible', r.why, 'bad');
      UI.render();
      break;
    }
    case 'loan': {
      const amt = (parseFloat(document.getElementById('loanAmt').value) || 0) * 1e6;
      const r = G.takeLoan(amt);
      if (!r.ok) UI.toast('Impossible', r.why, 'bad');
      UI.render();
      break;
    }
    case 'repay': {
      const r = G.repayLoan(parseInt(v, 10));
      if (!r.ok) UI.toast('Impossible', r.why, 'bad');
      UI.render();
      break;
    }
    case 'restart': G.wipe(); location.reload(); break;
    case 'continue': UI.closeModal(); break;
  }
}

/* ========================== actions groupées ============================= */
/* Le même geste appliqué à toute une sélection. On compte ce qui a réellement
   abouti — une révision peut manquer de trésorerie, une ligne peut n'avoir
   aucun appareil — et on le dit, plutôt que de laisser croire que tout est
   passé. Les opérations qui détruisent demandent confirmation. */
function bulk(op) {
  const s = G.s;
  const routes = UI.sel.route.map(id => s.routes.find(r => r.id === id)).filter(Boolean);
  const acs = UI.sel.ac.map(id => s.fleet.find(a => a.id === id)).filter(Boolean);
  let done = 0, skipped = 0, why = '';

  const say = (title, text) => { UI.toast(title, text, done ? 'good' : 'bad'); UI.render(); };

  switch (op) {
    case 'r-price':
      routes.forEach(r => {
        const m = G.suggestPrice(r);
        if (m) { r.priceMult = m / 100; done++; } else skipped++;
      });
      return say('Tarifs ajustés', done + ' ligne(s) au tarif conseillé' +
        (skipped ? ', ' + skipped + ' sans appareil en état de voler.' : '.'));

    case 'r-freq':
      routes.forEach(r => {
        const f = G.suggestFreq(r);
        if (r.ac.length) { r.freqCap = f; done++; } else skipped++;
      });
      return say('Fréquences ajustées', done + ' ligne(s) à la fréquence conseillée' +
        (skipped ? ', ' + skipped + ' sans appareil.' : '.'));

    case 'r-up':
    case 'r-down': {
      const d = op === 'r-up' ? 0.05 : -0.05;
      routes.forEach(r => {
        const v = Math.max(0.60, Math.min(1.70, r.priceMult + d));
        if (v !== r.priceMult) { r.priceMult = v; done++; } else skipped++;
      });
      return say('Tarifs modifiés', done + ' ligne(s) ' + (d > 0 ? 'augmentées' : 'baissées') +
        ' de 5 points' + (skipped ? ', ' + skipped + ' déjà au bout de la plage.' : '.'));
    }

    case 'r-close':
      return confirmBulk('Fermer ' + routes.length + ' ligne(s) ?',
        'Leurs appareils reviennent au sol, et les créneaux restent à vous. ' +
        'Les lignes, elles, sont perdues : il faudra les rouvrir.',
        () => {
          routes.forEach(r => { G.closeRoute(r.id); done++; });
          UI.selClear('route');
          say('Lignes fermées', done + ' ligne(s) fermée(s).');
        });

    case 'ac-maint':
      acs.forEach(a => {
        const r = G.sendMaint(a.id);
        if (r.ok) done++; else { skipped++; why = r.why; }
      });
      return say('Appareils en révision', done + ' appareil(s) à l’atelier' +
        (skipped ? ', ' + skipped + ' non — ' + why : '.'));

    case 'ac-unassign':
      acs.forEach(a => { if (a.routeId) { G.unassign(a.id); done++; } else skipped++; });
      return say('Appareils retirés', done + ' appareil(s) retiré(s) de leur ligne' +
        (skipped ? ', ' + skipped + ' étaient déjà au sol.' : '.'));

    case 'ac-sell': {
      const total = acs.reduce((t, a) => t + acValue(a) * 0.88, 0);
      return confirmBulk('Vendre ' + acs.length + ' appareil(s) ?',
        'Vous en tirez ' + money(total) + ', et ils quittent définitivement la flotte. ' +
        'Les lignes qu’ils desservaient se retrouveront sans avion.',
        () => {
          acs.forEach(a => { G.sellAircraft(a.id); done++; });
          UI.selClear('ac');
          say('Appareils vendus', done + ' appareil(s) cédé(s) pour ' + money(total) + '.');
        });
    }
  }
}

/* Une confirmation pour les gestes qu'on ne rattrape pas. */
function confirmBulk(title, text, go) {
  window.bulkGo = go;
  UI.modal('<div class="mh"><h2>' + title + '</h2><p>' + text + '</p></div>' +
    '<div class="mf"><button class="btn gh" onclick="UI.closeModal()">Annuler</button>' +
    '<button class="btn warn" onclick="UI.closeModal();bulkGo()">Confirmer</button></div>', true);
}

/* =============================== événements ============================== */
G.on('log', l => UI.toast(l.t, l.x, l.k));

/* Une nouvelle qui appelle une décision arrête la partie, si le joueur l'a
   demandé ; sinon on se contente de ralentir pour qu'elle soit lisible. */
function attention(title, text, kind) {
  if (Map2D.opts.pauseEvt) {
    setSpeed(0);
    UI.modal('<div class="mh"><h2>' + title + '</h2><p>' + text + '</p></div>' +
      '<div class="mb"><div class="mini">La partie est en pause. Vous pouvez consulter vos panneaux ' +
      'avant de reprendre : le volet reste accessible une fois cette fenêtre fermée.</div></div>' +
      '<div class="mf"><button class="btn gh" onclick="UI.closeModal();UI.open(&quot;alerts&quot;,undefined,{root:true})">' +
      'Voir les alertes</button>' +
      '<button class="btn" onclick="UI.closeModal();setSpeed(LAST_SPEED)">Reprendre</button></div>', true);
  } else if (SPEED > 2) setSpeed(2);
}
G.on('event', e => attention(e.title, e.text + ' L’effet dure ' + e.days + ' jours.', 'evt'));
G.on('attention', l => attention(l.t, l.x, l.k));
G.on('report', rep => {
  if (!Map2D.opts.report) return;
  setSpeed(0);
  UI.report(rep);
});
G.on('victory', d => {
  setSpeed(0);
  UI.modal('<div class="mh"><h2>Vous avez gagné</h2><p>' + G.s.airline.name +
    ' est désormais la première compagnie aérienne mondiale.</p></div><div class="mb">' +
    '<div class="grid2"><div class="stat">Valeur d’entreprise<b>' + money(d.value) + '</b></div>' +
    '<div class="stat">Part de marché<b>' + pct(d.share, 1) + '</b></div>' +
    '<div class="stat">Flotte<b>' + G.s.fleet.length + ' appareils</b></div>' +
    '<div class="stat">Passagers transportés<b>' + num(G.s.totals.pax) + '</b></div></div>' +
    '<div class="mini" style="margin-top:12px">La partie continue en mode libre : agrandissez votre empire ' +
    'autant que vous le souhaitez.</div></div>' +
    '<div class="mf"><button class="btn" data-a="continue" onclick="UI.closeModal()">Continuer à jouer</button></div>');
});
G.on('gameover', () => {
  setSpeed(0);
  UI.modal('<div class="mh"><h2>Dépôt de bilan</h2><p>Après ' + BAL.BANKRUPT_DAYS +
    ' jours de trésorerie négative, ' + G.s.airline.name + ' est placée en liquidation.</p></div>' +
    '<div class="mb"><div class="grid2">' +
    '<div class="stat">Durée<b>' + Math.floor(G.s.day / 365) + ' ans ' + Math.floor(G.s.day % 365 / 30) + ' mois</b></div>' +
    '<div class="stat">Lignes ouvertes<b>' + G.s.routes.length + '</b></div>' +
    '<div class="stat">Flotte<b>' + G.s.fleet.length + '</b></div>' +
    '<div class="stat">Passagers<b>' + num(G.s.totals.pax) + '</b></div></div></div>' +
    '<div class="mf"><button class="btn" onclick="act(\'restart\')">Rejouer</button></div>');
});
G.on('tier', t => {
  UI.toast('Nouveau rang', t.name + ' — ' + t.desc, 'good');
});
G.on('month', () => {
  const d = document.getElementById('date');
  d.classList.add('pulse');
  setTimeout(() => d.classList.remove('pulse'), 650);
});

/* ================================= boot ================================== */
window.addEventListener('DOMContentLoaded', () => {
  Map2D.init(document.getElementById('map'));
  initInput();
  requestAnimationFrame(loop);
  startScreen();
});
