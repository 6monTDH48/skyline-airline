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
    UI.topbar(); UI.open('help');
    SPEED = 1; setSpeed(1);
  };
  const bl = document.getElementById('btnLoad');
  if (bl) bl.onclick = () => {
    if (G.load()) { UI.closeModal(); Map2D.focus(G.s.home, 6); UI.topbar(); setSpeed(0); }
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
        (Map2D.linkFrom && Map2D.linkFrom !== c.code
          ? '<br>Cliquez pour relier depuis ' + CITY_BY_CODE[Map2D.linkFrom].name : '');
      tip.style.display = 'block';
      tip.style.left = (e.clientX + 14) + 'px';
      tip.style.top = (e.clientY + 14) + 'px';
    } else tip.style.display = 'none';
  }

  function handleClick(e) {
    if (!G.s) return;
    const r = document.getElementById('map').getBoundingClientRect();
    const c = Map2D.cityAt(e.clientX - r.left, e.clientY - r.top);
    if (!c) { if (Map2D.linkFrom) cancelLink(); return; }
    if (Map2D.linkFrom && Map2D.linkFrom !== c.code) {
      const from = Map2D.linkFrom;
      cancelLink();
      const res = G.createRoute(from, c.code);
      if (!res.ok) UI.toast('Impossible', res.why, 'bad');
      else { UI.open('route', res.route.id); Map2D.frame(from, c.code); }
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

  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space') { e.preventDefault(); setSpeed(SPEED > 0 ? 0 : LAST_SPEED); }
    if (e.key === '1') setSpeed(1);
    if (e.key === '2') setSpeed(2);
    if (e.key === '3') setSpeed(4);
    if (e.key === '4') setSpeed(8);
    if (e.key === 'Escape') {
      if (Map2D.linkFrom) cancelLink();
      else if (document.getElementById('modal').classList.contains('open')) { /* modale bloquante */ }
      else if (!UI.back()) UI.close();
    }
  });
  window.addEventListener('resize', () => Map2D.resize());
}

function cancelLink() {
  Map2D.linkFrom = null;
  document.getElementById('map').classList.remove('linking');
}

/* ============================ actions du dock ============================ */
function act(a, v) {
  const s = G.s;
  switch (a) {
    case 'focus':   Map2D.focus(v, Math.max(Map2D.cam.z, 8)); break;
    case 'city':    Map2D.selCity = v; UI.open('city', v); break;
    case 'route':   UI.open('route', parseInt(v, 10)); break;
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

/* =============================== événements ============================== */
G.on('log', l => UI.toast(l.t, l.x, l.k));
G.on('event', e => { if (SPEED > 2) setSpeed(2); });
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
