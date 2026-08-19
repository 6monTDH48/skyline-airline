/* =========================================================================
   render.js — rendu de la carte.

   Trois projections interchangeables, fond de carte Natural Earth 1:10 m
   (côtes, frontières, lacs), terminateur jour/nuit, orthodromies animées,
   traînées de condensation, et placement des étiquettes sans chevauchement.

   Repères : les coordonnées géographiques (lon, lat) sont projetées en
   « unités monde », puis transformées à l'écran par la caméra {x, y, z}.
   Les couches statiques sont projetées une fois et gardées en cache, le fond
   de carte lui-même est peint dans un calque hors écran.
   ========================================================================= */

/* ------------------------------- projections ----------------------------- */
/* Chaque projection convertit (lon, lat) en unités monde et sait revenir en
   arrière. `tile` indique si le monde se répète horizontalement : c'est vrai
   pour les projections cylindriques, faux pour Robinson dont la carte est un
   objet fini. `maxLat` borne les latitudes représentables. */
const PROJECTIONS = {
  plate: {
    name: 'Plate carrée',
    note: 'La projection la plus simple : longitude et latitude deviennent x et y. ' +
          'Les distances est-ouest sont très étirées près des pôles.',
    tile: true, maxLat: 84,
    fwd(lon, lat) { return [lon, lat]; },
    inv(x, y) { return [x, y]; }
  },

  mercator: {
    name: 'Mercator',
    note: 'Celle des cartes en ligne : les formes locales et les angles sont justes, ' +
          'mais les hautes latitudes sont démesurément agrandies.',
    tile: true, maxLat: 82,
    fwd(lon, lat) {
      const p = Math.max(-82, Math.min(82, lat)) * Math.PI / 180;
      return [lon, 180 / Math.PI * Math.log(Math.tan(Math.PI / 4 + p / 2))];
    },
    inv(x, y) {
      return [x, 180 / Math.PI * (2 * Math.atan(Math.exp(y * Math.PI / 180)) - Math.PI / 2)];
    }
  },

  robinson: {
    name: 'Robinson',
    note: 'La projection des atlas : ni les surfaces ni les angles ne sont exacts, ' +
          'mais l’ensemble « a l’air juste ». La carte prend la forme d’un globe aplati.',
    tile: false, maxLat: 90,
    /* Tables officielles, par pas de 5° de latitude. A comprime les longitudes,
       B donne l'écartement des parallèles. */
    A: [1.0000, 0.9986, 0.9954, 0.9900, 0.9822, 0.9730, 0.9600, 0.9427, 0.9216,
        0.8962, 0.8679, 0.8350, 0.7986, 0.7597, 0.7186, 0.6732, 0.6213, 0.5722, 0.5322],
    B: [0.0000, 0.0620, 0.1240, 0.1860, 0.2480, 0.3100, 0.3720, 0.4340, 0.4958,
        0.5571, 0.6176, 0.6769, 0.7346, 0.7903, 0.8435, 0.8936, 0.9394, 0.9761, 1.0000],
    YSCALE: 91.3,                       // pour un rapport hauteur/largeur de 0,507
    interp(tab, alat) {
      const i = Math.min(17, Math.floor(alat / 5));
      const f = (alat - i * 5) / 5;
      return tab[i] + (tab[i + 1] - tab[i]) * f;
    },
    fwd(lon, lat) {
      const a = Math.min(90, Math.abs(lat));
      return [lon * this.interp(this.A, a),
              Math.sign(lat) * this.interp(this.B, a) * this.YSCALE];
    },
    inv(x, y) {
      const ty = Math.min(1, Math.abs(y) / this.YSCALE);
      let lo = 0, hi = 90;                 // B est croissante : dichotomie
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (this.interp(this.B, mid) < ty) lo = mid; else hi = mid;
      }
      const alat = (lo + hi) / 2;
      return [x / this.interp(this.A, alat), Math.sign(y) * alat];
    }
  }
};

const Map2D = {
  cv: null, ctx: null, w: 0, h: 0, dpr: 1,
  cam:  {x: 10, y: 22, z: 4},          // centre en unités monde, zoom en px/unité
  camT: {x: 10, y: 22, z: 4},
  hoverCity: null, selCity: null, linkFrom: null, selRoute: null, hoverRoute: null,
  time: 0, grain: null, traffic: {}, trafficAt: -1,
  /* marge du calque de fond, en pixels CSS de chaque côté */
  BG_PAD: 180,
  bgLayer: null, bgCam: null, bgKey: '', camPrev: null, camMoving: false,
  labelBoxes: [],

  /* réglages d'affichage, conservés d'une partie à l'autre */
  opts: {night: true, rivals: true, trails: true, labels: true, grain: true,
         halos: true, dark: false, borders: true, lakes: true, proj: 'robinson'},

  /* --------------------------------- palettes -------------------------- */
  PAL: {
    clair: {
      bg:'#e7e0d0',
      sea1:'#d9eaf2', sea2:'#c5dbe6', sea3:'#aecad9',
      land1:'#f5ecd6', land2:'#e5d5b2',
      shadow:'rgba(92,108,120,.16)',
      coastHalo:'rgba(255,252,244,.7)', coast:'rgba(142,120,84,.9)',
      border:'rgba(150,128,96,.55)', lake:'#c2dae6', lakeEdge:'rgba(120,150,168,.7)',
      grat:'rgba(110,145,162,.20)', gratTxt:'rgba(70,100,118,.45)',
      equator:'rgba(90,125,142,.42)', tropic:'rgba(140,120,80,.30)',
      frame:'rgba(120,100,70,.55)',
      night:'28,42,76', dawn:'rgba(236,164,84,.55)', dawnGlow:'rgba(232,150,66,.7)',
      routeOk:'#1f4e79', routeIdle:'#93a2aa',
      routeSat:'#c8322a', routeDef:'#7a5a9c', routeLow:'#6f9bc0',
      flowOk:'#7fc4f5', flowSat:'#ffc6b4', flowDef:'#d8bff0', flowLow:'#cfe6f7',
      selGlow:'rgba(166,124,26,.85)', selLine:'rgba(198,152,42,.55)',
      trail:'255,255,255', plane:'#12324f', planeShadow:'rgba(20,40,60,.45)',
      haloHub:'rgba(198,152,42,.34)', halo:'rgba(47,111,168,.28)', haloOut:'rgba(47,111,168,0)',
      ringSel:'rgba(166,124,26,.85)', ringHov:'rgba(31,78,121,.55)', ringHub:'rgba(166,124,26,.9)',
      dot:'#8496a0', dotOwn:'#1f4e79', dotHub:'#b5871c',
      dotEdge:'rgba(255,255,255,.92)', dotGloss:'rgba(255,255,255,.6)',
      dotShadow:'rgba(40,50,60,.4)',
      label:'#4a4235', labelOwn:'#1c3f60', labelHub:'#7a5a10', labelHalo:'rgba(248,244,234,.92)',
      link:'rgba(166,124,26,.9)', linkRing:'rgba(166,124,26,.7)',
      grain:0.38, vignette:'rgba(60,45,20,', vignetteA:0.12,
      scale:'rgba(70,60,40,.55)', scaleTxt:'rgba(70,60,40,.75)'
    },
    sombre: {
      bg:'#080d12',
      sea1:'#101d28', sea2:'#0c1720', sea3:'#081119',
      land1:'#26333d', land2:'#1c2730',
      shadow:'rgba(0,0,0,.45)',
      coastHalo:'rgba(120,170,200,.13)', coast:'rgba(128,168,192,.72)',
      border:'rgba(120,160,185,.36)', lake:'#12222e', lakeEdge:'rgba(110,150,175,.55)',
      grat:'rgba(130,175,205,.11)', gratTxt:'rgba(150,185,205,.38)',
      equator:'rgba(140,180,205,.28)', tropic:'rgba(190,170,110,.20)',
      frame:'rgba(140,175,200,.45)',
      night:'2,6,14', dawn:'rgba(240,175,95,.45)', dawnGlow:'rgba(235,160,70,.55)',
      routeOk:'#4f9ad6', routeIdle:'#54636e',
      routeSat:'#e8524a', routeDef:'#a284d0', routeLow:'#3f6f92',
      flowOk:'#b6e2ff', flowSat:'#ffd0c4', flowDef:'#e0cbff', flowLow:'#9fc6e2',
      selGlow:'rgba(224,180,70,.9)', selLine:'rgba(224,180,70,.5)',
      trail:'200,225,245', plane:'#cfe2f0', planeShadow:'rgba(0,0,0,.55)',
      haloHub:'rgba(224,180,70,.30)', halo:'rgba(90,160,215,.26)', haloOut:'rgba(90,160,215,0)',
      ringSel:'rgba(224,180,70,.85)', ringHov:'rgba(140,190,230,.55)', ringHub:'rgba(224,180,70,.85)',
      dot:'#6d7d89', dotOwn:'#4f9ad6', dotHub:'#e0b13c',
      dotEdge:'rgba(18,26,34,.9)', dotGloss:'rgba(255,255,255,.35)',
      dotShadow:'rgba(0,0,0,.55)',
      label:'#9fb0bc', labelOwn:'#a9d2ef', labelHub:'#e6c273', labelHalo:'rgba(10,17,24,.9)',
      link:'rgba(224,180,70,.9)', linkRing:'rgba(224,180,70,.7)',
      grain:0.16, vignette:'rgba(0,0,0,', vignetteA:0.4,
      scale:'rgba(170,195,212,.5)', scaleTxt:'rgba(170,195,212,.7)'
    }
  },
  pal() { return this.PAL[this.opts.dark ? 'sombre' : 'clair']; },
  P() { return PROJECTIONS[this.opts.proj] || PROJECTIONS.plate; },

  loadOpts() {
    try {
      const o = JSON.parse(localStorage.getItem('skyline.opts') || '{}');
      Object.keys(this.opts).forEach(k => {
        if (typeof this.opts[k] === 'boolean' && typeof o[k] === 'boolean') this.opts[k] = o[k];
      });
      if (PROJECTIONS[o.proj]) this.opts.proj = o.proj;
    } catch (e) {}
  },
  saveOpts() {
    try { localStorage.setItem('skyline.opts', JSON.stringify(this.opts)); } catch (e) {}
  },

  init(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.loadOpts();
    this.makeGrain();
    this.resize();
    this.fit();
  },

  /* --------------------- texture papier (générée une fois) --------------- */
  makeGrain() {
    const n = 128, c = document.createElement('canvas');
    c.width = c.height = n;
    const g = c.getContext('2d'), img = g.createImageData(n, n);
    for (let i = 0; i < n * n; i++) {
      const v = 120 + Math.random() * 135;
      img.data[i*4] = v; img.data[i*4+1] = v; img.data[i*4+2] = v;
      img.data[i*4+3] = 12 + Math.random() * 16;
    }
    g.putImageData(img, 0, 0);
    this.grainCanvas = c;
  },

  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, this.cv.clientWidth);
    this.h = Math.max(1, this.cv.clientHeight);
    this.cv.width = Math.round(this.w * this.dpr);
    this.cv.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.grain = this.ctx.createPattern(this.grainCanvas, 'repeat');
    this.landKey = '';
  },

  /* ------------------------- conversions de repère ----------------------- */
  proj(lon, lat) { return this.P().fwd(lon, lat); },
  unproj(x, y)   { return this.P().inv(x, y); },

  pxw(wx, wy) {                                   // unités monde → écran
    return [(wx - this.cam.x) * this.cam.z + this.w / 2,
            (this.cam.y - wy) * this.cam.z + this.h / 2 + 20];
  },
  px(lon, lat) { const p = this.P().fwd(lon, lat); return this.pxw(p[0], p[1]); },
  world(sx, sy) {                                 // écran → unités monde
    return [(sx - this.w / 2) / this.cam.z + this.cam.x,
            this.cam.y - (sy - this.h / 2 - 20) / this.cam.z];
  },
  geo(sx, sy) { const w = this.world(sx, sy); return this.P().inv(w[0], w[1]); },

  /* décalages de tuilage, en degrés de longitude */
  tiles() { return this.P().tile ? [0, -360, 360] : [0]; },

  /* étendue de la carte en unités monde */
  worldBox() {
    const P = this.P();
    const c = P.fwd(180, 0), t = P.fwd(0, P.maxLat);
    return {x: Math.abs(c[0]), y: Math.abs(t[1])};
  },

  /* Cadrage initial : tout le monde habité, de l'Antarctique au Grand Nord. */
  fit() {
    const P = this.P(), b = this.worldBox();
    const yS = P.fwd(0, -Math.min(62, P.maxLat))[1], yN = P.fwd(0, Math.min(80, P.maxLat))[1];
    this.camT.z = Math.min(this.w / (b.x * 2.04), (this.h - 80) / (yN - yS));
    this.camT.x = P.fwd(10, 0)[0];
    this.camT.y = (yN + yS) / 2;
  },
  minZoom() {
    const b = this.worldBox();
    return Math.min(this.w / (b.x * 2.15), (this.h - 70) / (b.y * 1.95));
  },
  syncTarget() { this.camT.x = this.cam.x; this.camT.y = this.cam.y; this.camT.z = this.cam.z; },

  clampCam() {
    const b = this.worldBox(), tile = this.P().tile;
    [this.cam, this.camT].forEach(c => {
      c.z = Math.max(this.minZoom() * 0.95, Math.min(60, c.z));
      const halfY = (this.h / 2) / c.z;
      c.y = Math.max(-b.y - halfY * 0.25, Math.min(b.y + halfY * 0.25, c.y));
      const lim = tile ? b.x * 1.6 : b.x + (this.w / 2) / c.z * 0.6;
      c.x = Math.max(-lim, Math.min(lim, c.x));
    });
  },
  ease(dt) {
    const k = Math.min(1, dt * 7);
    this.cam.x += (this.camT.x - this.cam.x) * k;
    this.cam.y += (this.camT.y - this.cam.y) * k;
    this.cam.z += (this.camT.z - this.cam.z) * k;
  },

  setProjection(id) {
    if (!PROJECTIONS[id] || id === this.opts.proj) return;
    const centre = this.geo(this.w / 2, this.h / 2);      // on garde le point visé
    const before = this.worldBox();
    const ratio = this.cam.z * before.x;
    this.opts.proj = id;
    this.layers = null; this.bgKey = ''; this.gcWorld.clear();
    const after = this.worldBox();
    this.cam.z = this.camT.z = ratio / after.x;
    const p = this.P().fwd(centre[0], centre[1]);
    this.cam.x = this.camT.x = p[0];
    this.cam.y = this.camT.y = p[1];
    this.clampCam();
    this.saveOpts();
  },

  /* ------------------------------ interaction ---------------------------- */
  cityAt(sx, sy) {
    let best = null, bd = 15 * 15;
    for (const c of CITIES) {
      for (const off of this.tiles()) {
        const p = this.px(c.lon + off, c.lat);
        if (p[0] < -30 || p[0] > this.w + 30) continue;
        const d = (p[0] - sx) ** 2 + (p[1] - sy) ** 2;
        if (d < bd) { bd = d; best = c; }
      }
    }
    return best;
  },

  refreshTraffic() {
    if (!G.s || G.s.day === this.trafficAt) return;
    this.trafficAt = G.s.day;
    const t = {};
    G.s.routes.forEach(r => {
      t[r.a] = (t[r.a] || 0) + r.last.pax;
      t[r.b] = (t[r.b] || 0) + r.last.pax;
    });
    this.traffic = t;
  },

  /* =================== couches statiques, projetées une fois ============== */
  /* Projeter 97 000 points à chaque image serait ruineux : on le fait une fois
     par projection, avec une version allégée pour la vue monde. */
  buildLayers() {
    if (this.layers && this.layers.proj === this.opts.proj) return this.layers;
    const P = this.P();
    const prep = (rings, closed, step) => {
      const full = [], low = [], bb = [];
      rings.forEach(src => {
        const n = src.length / 2;
        const f = new Float32Array(n * 2);
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (let i = 0; i < n; i++) {
          const p = P.fwd(src[i*2], src[i*2+1]);
          f[i*2] = p[0]; f[i*2+1] = p[1];
          if (p[0] < x0) x0 = p[0];
          if (p[0] > x1) x1 = p[0];
          if (p[1] < y0) y0 = p[1];
          if (p[1] > y1) y1 = p[1];
        }
        full.push(f); bb.push([x0, y0, x1, y1]);
        if ((x1 - x0) < 0.8 && (y1 - y0) < 0.8) { low.push(null); return; }
        const m = [];
        for (let i = 0; i < n - 1; i += step) { m.push(f[i*2], f[i*2+1]); }
        if (closed) m.push(f[0], f[1]); else m.push(f[(n-1)*2], f[(n-1)*2+1]);
        low.push(m.length >= 6 ? Float32Array.from(m) : null);
      });
      return {full, low, bb, closed};
    };
    this.layers = {
      proj: this.opts.proj,
      land:    prep(LANDMASSES, true, 4),
      borders: prep(typeof BORDERS !== 'undefined' ? BORDERS : [], false, 4),
      lakes:   prep(typeof LAKES !== 'undefined' ? LAKES : [], true, 3)
    };
    return this.layers;
  },

  /* ================================ dessin =============================== */
  draw(dt) {
    const s = G.s;
    if (this.cv.clientWidth > 0 && this.cv.clientWidth !== this.w) this.resize();
    if (this.w < 2 || this.h < 2 || this.cv.width < 2) return;
    this.time += dt;
    this.ease(dt);
    this.clampCam();
    const pv = this.camPrev;
    this.camMoving = !pv || pv.x !== this.cam.x || pv.y !== this.cam.y || pv.z !== this.cam.z;
    this.camPrev = {x: this.cam.x, y: this.cam.y, z: this.cam.z};
    this.refreshTraffic();

    this.drawSea();
    this.drawBackground();
    if (this.opts.night) this.drawNight();
    if (s) {
      if (this.opts.rivals) this.drawRivalRoutes();
      this.drawRoutes();
      this.drawAircraft();
      this.drawCities();
      this.drawLink();
    }
    if (this.opts.grain) this.drawGrain();
    this.drawVignette();
    this.drawScale();
  },

  /* contour de la carte : rectangle pour les projections cylindriques,
     silhouette bombée pour Robinson */
  spherePath(ctx, off) {
    const P = this.P(), b = this.worldBox();
    ctx.beginPath();
    if (P.tile) {
      const a = this.pxw(-b.x + off, b.y), c = this.pxw(b.x + off, -b.y);
      ctx.rect(a[0], a[1], c[0] - a[0], c[1] - a[1]);
      return;
    }
    const step = 3;
    let first = true;
    for (let lat = -90; lat <= 90; lat += step) {
      const p = this.px(-180 + off, lat);
      if (first) { ctx.moveTo(p[0], p[1]); first = false; } else ctx.lineTo(p[0], p[1]);
    }
    for (let lon = -180; lon <= 180; lon += step) {
      const p = this.px(lon + off, 90); ctx.lineTo(p[0], p[1]);
    }
    for (let lat = 90; lat >= -90; lat -= step) {
      const p = this.px(180 + off, lat); ctx.lineTo(p[0], p[1]);
    }
    for (let lon = 180; lon >= -180; lon -= step) {
      const p = this.px(lon + off, -90); ctx.lineTo(p[0], p[1]);
    }
    ctx.closePath();
  },

  drawSea() {
    const ctx = this.ctx, P = this.pal();
    ctx.fillStyle = P.bg;
    ctx.fillRect(0, 0, this.w, this.h);
    const g = ctx.createLinearGradient(0, 0, this.w * 0.35, this.h);
    g.addColorStop(0, P.sea1);
    g.addColorStop(0.45, P.sea2);
    g.addColorStop(1, P.sea3);
    ctx.fillStyle = g;
    this.tiles().forEach(off => { this.spherePath(ctx, off); ctx.fill(); });
  },

  drawGraticule() {
    const ctx = this.ctx, P = this.pal(), z = this.cam.z;
    const step = z > 14 ? 5 : (z > 7 ? 10 : 20);
    ctx.lineWidth = 1;
    ctx.font = '9px "Segoe UI",system-ui,sans-serif';
    ctx.textBaseline = 'top';
    ctx.strokeStyle = P.grat;

    const maxLat = Math.min(88, this.P().maxLat);
    this.tiles().forEach(off => {
      ctx.beginPath();
      for (let lon = -180; lon <= 180; lon += step) {
        let first = true;
        for (let lat = -maxLat; lat <= maxLat; lat += 5) {
          const p = this.px(lon + off, lat);
          if (first) { ctx.moveTo(p[0], p[1]); first = false; } else ctx.lineTo(p[0], p[1]);
        }
      }
      for (let lat = -80; lat <= 80; lat += step) {
        let first = true;
        for (let lon = -180; lon <= 180; lon += 5) {
          const p = this.px(lon + off, lat);
          if (first) { ctx.moveTo(p[0], p[1]); first = false; } else ctx.lineTo(p[0], p[1]);
        }
      }
      ctx.stroke();
    });

    ctx.setLineDash([5, 6]);
    [[0, P.equator], [23.44, P.tropic], [-23.44, P.tropic]].forEach(([lat, col]) => {
      ctx.strokeStyle = col;
      this.tiles().forEach(off => {
        ctx.beginPath();
        let first = true;
        for (let lon = -180; lon <= 180; lon += 5) {
          const p = this.px(lon + off, lat);
          if (first) { ctx.moveTo(p[0], p[1]); first = false; } else ctx.lineTo(p[0], p[1]);
        }
        ctx.stroke();
      });
    });
    ctx.setLineDash([]);
  },

  /* étiquettes de latitude : elles suivent le bord de l'écran, donc elles sont
     peintes en direct et non dans le calque de fond */
  drawGratLabels() {
    const ctx = this.ctx, P = this.pal(), z = this.cam.z;
    const step = z > 14 ? 5 : (z > 7 ? 10 : 20);
    ctx.font = '9px "Segoe UI",system-ui,sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillStyle = P.gratTxt;
    for (let lat = -60; lat <= 80; lat += step * (z > 7 ? 1 : 2)) {
      const p = this.px(this.geo(6, this.h / 2)[0], lat);
      if (p[1] < 66 || p[1] > this.h - 26) continue;
      ctx.fillText(Math.abs(lat) + '°' + (lat === 0 ? '' : (lat > 0 ? 'N' : 'S')), 4, p[1] + 2);
    }
  },

  /* ------------------------------ fond de carte -------------------------- */
  /* Le graticule et les terres ne dépendent que de la caméra : on les peint
     dans un calque hors écran plus grand que la vue (marge BG_PAD tout autour).
     Tant que le déplacement reste dans cette marge, il suffit de recoller
     l'image décalée ; le fond n'est repeint qu'aux débordements et au repos. */
  bgStateKey() {
    return this.opts.proj + '|' + (this.opts.dark ? 'nuit' : 'jour') +
           '|' + (this.opts.borders ? 'f' : '') + (this.opts.lakes ? 'l' : '') +
           '|' + Math.round(this.w) + 'x' + Math.round(this.h) + '@' + this.dpr;
  },

  /* placement du calque à l'écran ; null s'il ne couvre plus la vue */
  bgFit() {
    const b = this.bgCam, z = this.cam.z;
    const W2 = this.w + 2 * this.BG_PAD, H2 = this.h + 2 * this.BG_PAD;
    const s = z / b.z;
    const dx = (b.x - this.cam.x) * z + this.w / 2 - s * W2 / 2;
    const dy = (this.cam.y - b.y) * z + this.h / 2 + 20 - s * (H2 / 2 + 20);
    if (dx > 0.5 || dy > 0.5 ||
        dx + s * W2 < this.w - 0.5 || dy + s * H2 < this.h - 0.5) return null;
    // nette seulement si l'image retombe pile à sa place d'origine
    const sharp = s === 1 && Math.abs(dx + this.BG_PAD) < 0.01 && Math.abs(dy + this.BG_PAD) < 0.01;
    return {dx, dy, dw: s * W2, dh: s * H2, sharp};
  },

  paintBackground() {
    const W2 = this.w + 2 * this.BG_PAD, H2 = this.h + 2 * this.BG_PAD;
    if (!this.bgLayer) this.bgLayer = document.createElement('canvas');
    const pw = Math.round(W2 * this.dpr), ph = Math.round(H2 * this.dpr);
    if (this.bgLayer.width !== pw || this.bgLayer.height !== ph) {
      this.bgLayer.width = pw; this.bgLayer.height = ph;
    }
    const bc = this.bgLayer.getContext('2d');
    bc.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    bc.clearRect(0, 0, W2, H2);
    const keep = this.ctx, kw = this.w, kh = this.h;
    this.ctx = bc; this.w = W2; this.h = H2;      // la vue élargie devient l'écran
    this.drawGraticule();
    this.paintLand();
    this.ctx = keep; this.w = kw; this.h = kh;
    this.bgCam = {x: this.cam.x, y: this.cam.y, z: this.cam.z};
    this.bgKey = this.bgStateKey();
  },

  drawBackground() {
    const key = this.bgStateKey();
    let fit = (this.bgLayer && this.bgCam && this.bgKey === key) ? this.bgFit() : null;
    // au repos, on repeint une fois pour retrouver un fond parfaitement net
    if (fit && !fit.sharp && !this.camMoving) fit = null;
    if (!fit) {
      this.paintBackground();
      fit = this.bgFit() ||
            {dx: -this.BG_PAD, dy: -this.BG_PAD, dw: this.w + 2 * this.BG_PAD, dh: this.h + 2 * this.BG_PAD};
    }
    this.ctx.drawImage(this.bgLayer, fit.dx, fit.dy, fit.dw, fit.dh);
    this.drawGratLabels();
  },

  /* trace les anneaux visibles d'une couche, en un chemin borné */
  tracePaths(layer, off, coarse, fill, stroke) {
    const ctx = this.ctx, z = this.cam.z;
    const ox = (off ? this.P().fwd(off, 0)[0] - this.P().fwd(0, 0)[0] : 0);
    const tx = (ox - this.cam.x) * z + this.w / 2;
    const ty = this.cam.y * z + this.h / 2 + 20;
    const m = 2 / z;
    const vx0 = this.cam.x - ox - (this.w / 2) / z - m, vx1 = this.cam.x - ox + (this.w / 2) / z + m;
    const vy0 = this.cam.y - (this.h / 2 + 20) / z - m, vy1 = this.cam.y + (this.h / 2) / z + m;

    let n = 0;
    ctx.beginPath();
    for (let i = 0; i < layer.full.length; i++) {
      const b = layer.bb[i];
      if (b[0] > vx1 || b[2] < vx0 || b[1] > vy1 || b[3] < vy0) continue;
      const p = coarse ? (layer.low[i] || layer.full[i]) : layer.full[i];
      const len = p.length;
      ctx.moveTo(p[0] * z + tx, ty - p[1] * z);
      for (let k = 2; k < len; k += 2) ctx.lineTo(p[k] * z + tx, ty - p[k+1] * z);
      if (layer.closed) ctx.closePath();
      n += len;
      if (n > 14000) {
        if (fill) ctx.fill();
        if (stroke) ctx.stroke();
        ctx.beginPath(); n = 0;
      }
    }
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  },

  paintLand() {
    const ctx = this.ctx, P = this.pal(), L = this.buildLayers();
    const coarse = this.cam.z < 9;

    this.tiles().forEach(off => {
      // masses continentales
      const g = ctx.createLinearGradient(0, 0, 0, this.h);
      g.addColorStop(0, P.land1);
      g.addColorStop(1, P.land2);
      if (!coarse) {
        ctx.save();
        ctx.translate(1.5, 3);
        ctx.fillStyle = P.shadow;
        this.tracePaths(L.land, off, coarse, true, false);
        ctx.restore();
      }
      ctx.fillStyle = g;
      this.tracePaths(L.land, off, coarse, true, false);

      // lacs et mers intérieures, peints par-dessus la terre
      if (this.opts.lakes && this.cam.z > 2.2) {
        ctx.fillStyle = P.lake;
        this.tracePaths(L.lakes, off, coarse, true, false);
        if (!coarse) {
          ctx.strokeStyle = P.lakeEdge; ctx.lineWidth = 0.7;
          this.tracePaths(L.lakes, off, coarse, false, true);
        }
      }

      // frontières intérieures
      if (this.opts.borders && this.cam.z > 2.6) {
        ctx.strokeStyle = P.border;
        ctx.lineWidth = this.cam.z > 12 ? 0.9 : 0.6;
        ctx.setLineDash(this.cam.z > 10 ? [4, 3] : []);
        this.tracePaths(L.borders, off, coarse, false, true);
        ctx.setLineDash([]);
      }

      // trait de côte
      ctx.lineJoin = 'round';
      if (!coarse) {
        ctx.strokeStyle = P.coastHalo; ctx.lineWidth = 2.4;
        this.tracePaths(L.land, off, coarse, false, true);
      }
      ctx.strokeStyle = P.coast; ctx.lineWidth = 0.9;
      this.tracePaths(L.land, off, coarse, false, true);
    });

    // liseré du cadre de la carte
    ctx.strokeStyle = P.frame; ctx.lineWidth = 1.2;
    this.tiles().forEach(off => { this.spherePath(ctx, off); ctx.stroke(); });
  },

  /* --------------------------- terminateur jour/nuit --------------------- */
  drawNight() {
    if (!G.s) return;
    const ctx = this.ctx, rad = Math.PI / 180, P = this.pal();
    const fade = 1 - Math.max(0, Math.min(1, (this.cam.z - 6.5) / 5));
    if (fade <= 0.01) return;

    const doy = G.s.m * 30.4 + G.s.d;
    let decl = 23.44 * Math.sin(2 * Math.PI * (doy - 81) / 365);
    if (Math.abs(decl) < 1.2) decl = decl >= 0 ? 1.2 : -1.2;
    const sunLon = 180 - 360 * Math.max(0, Math.min(1, G.acc));
    const darkPole = decl > 0 ? -90 : 90;
    const sign = decl > 0 ? -1 : 1;
    const maxLat = this.P().maxLat;

    const band = (shift, off) => {
      const pts = [];
      for (let lon = -180; lon <= 180; lon += 3) {
        let latT = Math.atan(-Math.cos((lon - sunLon) * rad) / Math.tan(decl * rad)) / rad;
        latT = Math.max(-maxLat, Math.min(maxLat, latT + shift * sign));
        pts.push(this.px(lon + off, latT));
      }
      return pts;
    };

    ctx.save();
    this.tiles().forEach(off => {
      const BANDS = [];
      for (let i = 0; i < 7; i++) BANDS.push([Math.pow(i / 6, 1.5) * 30, 0.025 * fade]);
      BANDS.forEach(([shift, alpha]) => {
        const pts = band(shift, off);
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        // on referme le long du méridien de bord jusqu'au pôle nocturne
        for (let lat = darkPole > 0 ? maxLat : -maxLat;
             darkPole > 0 ? lat <= maxLat : lat >= -maxLat;
             lat += darkPole > 0 ? 5 : -5) {
          const p = this.px(180 + off, lat); ctx.lineTo(p[0], p[1]);
          if (Math.abs(lat) >= maxLat) break;
        }
        for (let lon = 180; lon >= -180; lon -= 6) {
          const p = this.px(lon + off, darkPole > 0 ? maxLat : -maxLat);
          ctx.lineTo(p[0], p[1]);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(' + P.night + ',' + alpha + ')';
        ctx.fill();
      });
      ctx.globalAlpha = fade;
      const pts = band(0, off);
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.shadowColor = P.dawnGlow; ctx.shadowBlur = 9;
      ctx.strokeStyle = P.dawn; ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    });
    ctx.restore();
  },

  /* -------------------------------- lignes ------------------------------- */
  gcCache: new Map(),
  gc(ca, cb) {
    const key = ca.code + cb.code;
    let v = this.gcCache.get(key);
    if (v) return v;
    const R = Math.PI / 180;
    const la1 = ca.lat * R, lo1 = ca.lon * R, la2 = cb.lat * R;
    let lo2 = cb.lon * R;
    if (lo2 - lo1 > Math.PI) lo2 -= 2 * Math.PI;
    if (lo2 - lo1 < -Math.PI) lo2 += 2 * Math.PI;
    const d = 2 * Math.asin(Math.sqrt(
      Math.sin((la2 - la1) / 2) ** 2 +
      Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2));
    const n = Math.max(2, Math.min(64, Math.round(d / (Math.PI / 120))));
    v = [];
    if (d < 1e-9) v = [ca.lon, ca.lat, cb.lon, cb.lat];
    else {
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const f = i / n;
        const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
        const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
        const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
        const z = A * Math.sin(la1) + B * Math.sin(la2);
        let lon = Math.atan2(y, x) / R;
        const lat = Math.atan2(z, Math.hypot(x, y)) / R;
        if (prev !== null) {
          while (lon - prev > 180) lon -= 360;
          while (lon - prev < -180) lon += 360;
        }
        prev = lon;
        v.push(lon, lat);
      }
    }
    v.key = key;
    this.gcCache.set(key, v);
    return v;
  },

  /* Version projetée en unités monde, découpée aux bords de carte, gardée en
     cache par projection : reprojeter des centaines de lignes à chaque image
     coûtait bien plus cher que de les tracer. */
  gcWorld: new Map(),
  gcw(pts) {
    const k = pts.key + '|' + this.opts.proj;
    let v = this.gcWorld.get(k);
    if (v) return v;
    const P = this.P();
    const segs = this.pieces(pts, 0).map(seg => {
      const f = new Float32Array(seg.length);
      for (let i = 0; i < seg.length; i += 2) {
        const q = P.fwd(seg[i], seg[i + 1]);
        f[i] = q[0]; f[i + 1] = q[1];
      }
      return f;
    });
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    segs.forEach(f => {
      for (let i = 0; i < f.length; i += 2) {
        if (f[i] < x0) x0 = f[i];
        if (f[i] > x1) x1 = f[i];
        if (f[i+1] < y0) y0 = f[i+1];
        if (f[i+1] > y1) y1 = f[i+1];
      }
    });
    v = {segs, bb: [x0, y0, x1, y1]};
    this.gcWorld.set(k, v);
    return v;
  },

  /* décalage d'une tuile, en unités monde */
  tileOff(off) {
    return off ? this.P().fwd(off, 0)[0] - this.P().fwd(0, 0)[0] : 0;
  },

  /* Sur une projection non répétée, une trajectoire qui franchit
     l'antiméridien doit être coupée en deux morceaux, sinon elle traverse
     toute la carte à l'horizontale. */
  pieces(pts, off) {
    if (this.P().tile) return [pts];
    const out = [];
    let cur = [];
    let prevN = null;
    for (let i = 0; i < pts.length; i += 2) {
      let lon = pts[i] + off;
      lon = ((lon + 180) % 360 + 360) % 360 - 180;
      if (prevN !== null && Math.abs(lon - prevN) > 180) {
        if (cur.length >= 4) out.push(cur);
        cur = [];
      }
      cur.push(lon, pts[i + 1]);
      prevN = lon;
    }
    if (cur.length >= 4) out.push(cur);
    return out;
  },

  gcVisible(pts, off) {
    const b = this.gcw(pts).bb, z = this.cam.z, ox = this.tileOff(off), m = 90 / z;
    const vx0 = this.cam.x - ox - (this.w / 2) / z - m;
    const vx1 = this.cam.x - ox + (this.w / 2) / z + m;
    const vy0 = this.cam.y - (this.h / 2 - 20) / z - m;
    const vy1 = this.cam.y + (this.h / 2 + 20) / z + m;
    return !(b[0] > vx1 || b[2] < vx0 || b[1] > vy1 || b[3] < vy0);
  },

  strokeGC(pts, off, wid, color, dash, dashOff) {
    const ctx = this.ctx, z = this.cam.z;
    const tx = (this.tileOff(off) - this.cam.x) * z + this.w / 2;
    const ty = this.cam.y * z + this.h / 2 + 20;
    ctx.strokeStyle = color; ctx.lineWidth = wid; ctx.lineCap = 'round';
    if (dash) { ctx.setLineDash(dash); ctx.lineDashOffset = dashOff || 0; }
    this.gcw(pts).segs.forEach(f => {
      ctx.beginPath();
      ctx.moveTo(f[0] * z + tx, ty - f[1] * z);
      for (let i = 2; i < f.length; i += 2) ctx.lineTo(f[i] * z + tx, ty - f[i+1] * z);
      ctx.stroke();
    });
    if (dash) { ctx.setLineDash([]); ctx.lineDashOffset = 0; }
  },

  gcAt(pts, t, off) {
    const n = pts.length / 2 - 1;
    const f = Math.max(0, Math.min(0.9999, t)) * n;
    const i = Math.floor(f), r = f - i;
    const ax = pts[i*2], ay = pts[i*2+1], bx = pts[i*2+2], by = pts[i*2+3];
    const lon = ax + (bx - ax) * r, lat = ay + (by - ay) * r;
    const p = this.px(lon + off, lat);
    const q = this.px(bx + off, by);
    return [p[0], p[1], Math.atan2(q[1] - p[1], q[0] - p[0])];
  },

  drawRivalRoutes() {
    const ctx = this.ctx;
    ctx.globalAlpha = 0.22;
    G.s.rivals.forEach(rv => rv.routes.forEach(rt => {
      const pts = this.gc(CITY_BY_CODE[rt.a], CITY_BY_CODE[rt.b]);
      for (const off of this.tiles()) {
        if (!this.gcVisible(pts, off)) continue;
        this.strokeGC(pts, off, 0.8 + rt.freq * 0.09, rv.color);
      }
    }));
    ctx.globalAlpha = 1;
  },

  drawRoutes() {
    const s = G.s, ctx = this.ctx, P = this.pal();
    const dash = -this.time * 26;
    s.routes.forEach(r => {
      const pts = this.gc(CITY_BY_CODE[r.a], CITY_BY_CODE[r.b]);
      const sel = this.selRoute === r.id || this.hoverRoute === r.id;
      const active = r.last.legs > 0;
      const st = G.routeState(r);
      const full = st === 'saturee' || st === 'pleine';
      const w = 1.7 + Math.min(5.5, r.ac.length * 0.95);
      const col = !active ? P.routeIdle
        : (full ? P.routeSat
        : (st === 'deficitaire' ? P.routeDef
        : (st === 'creuse' ? P.routeLow : P.routeOk)));
      const flow = full ? P.flowSat
        : (st === 'deficitaire' ? P.flowDef
        : (st === 'creuse' ? P.flowLow : P.flowOk));

      for (const off of this.tiles()) {
        if (!this.gcVisible(pts, off)) continue;
        if (sel) {
          ctx.save();
          ctx.shadowColor = P.selGlow; ctx.shadowBlur = 14;
          this.strokeGC(pts, off, w + 2.5, P.selLine);
          ctx.restore();
        }
        if (!active) { this.strokeGC(pts, off, w, col, [5, 6]); continue; }
        if (st === 'saturee') {
          ctx.save();
          ctx.globalAlpha = 0.25 + 0.18 * (0.5 + 0.5 * Math.sin(this.time * 2.6));
          this.strokeGC(pts, off, w + 5, P.routeSat);
          ctx.restore();
        }
        ctx.globalAlpha = 0.4;
        this.strokeGC(pts, off, w + 1.6, col);
        ctx.globalAlpha = 1;
        this.strokeGC(pts, off, w * 0.55, col);
        ctx.globalAlpha = 0.75;
        this.strokeGC(pts, off, w * 0.55, flow, [3, 16], dash);
        ctx.globalAlpha = 1;
      }
    });
  },

  drawAircraft() {
    const s = G.s, ctx = this.ctx, P = this.pal();
    const scale = Math.max(0.75, Math.min(1.7, this.cam.z / 4));
    s.fleet.forEach(ac => {
      if (ac.status !== 'flying' || !ac.routeId) return;
      const r = s.routes.find(x => x.id === ac.routeId);
      if (!r || r.last.legs === 0) return;
      const pts = this.gc(CITY_BY_CODE[r.a], CITY_BY_CODE[r.b]);
      const t = ac.dir > 0 ? ac.phase : 1 - ac.phase;

      for (const off of this.tiles()) {
        if (!this.gcVisible(pts, off)) continue;
        const pa = this.gcAt(pts, t, off);
        if (pa[0] < -30 || pa[0] > this.w + 30) continue;

        const back = ac.dir > 0 ? -1 : 1;
        ctx.lineCap = 'round';
        for (let i = 0; this.opts.trails && i < 7; i++) {
          const t0 = t + back * 0.014 * i, t1 = t + back * 0.014 * (i + 1);
          if (t0 < 0 || t0 > 1 || t1 < 0 || t1 > 1) break;
          const q0 = this.gcAt(pts, t0, off), q1 = this.gcAt(pts, t1, off);
          if (Math.abs(q1[0] - q0[0]) > this.w * 0.5) break;   // saut de bord de carte
          ctx.strokeStyle = 'rgba(' + P.trail + ',' + (0.5 - i * 0.07) + ')';
          ctx.lineWidth = (3.4 - i * 0.4) * scale * 0.6;
          ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.stroke();
        }

        const ang = ac.dir > 0 ? pa[2] : pa[2] + Math.PI;
        ctx.save();
        ctx.translate(pa[0], pa[1]); ctx.rotate(ang); ctx.scale(scale, scale);
        ctx.shadowColor = P.planeShadow; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1.5;
        ctx.fillStyle = P.plane;
        ctx.beginPath();
        ctx.moveTo(7, 0);
        ctx.lineTo(1.5, 1.6); ctx.lineTo(-2.5, 4.6); ctx.lineTo(-3.6, 4.6);
        ctx.lineTo(-1.6, 1.5); ctx.lineTo(-4.6, 1.5); ctx.lineTo(-6, 3); ctx.lineTo(-6.8, 3);
        ctx.lineTo(-6, 0);
        ctx.lineTo(-6.8, -3); ctx.lineTo(-6, -3); ctx.lineTo(-4.6, -1.5); ctx.lineTo(-1.6, -1.5);
        ctx.lineTo(-3.6, -4.6); ctx.lineTo(-2.5, -4.6); ctx.lineTo(1.5, -1.6);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    });
  },

  /* --------------------------------- villes ------------------------------ */
  drawCities() {
    const s = G.s, ctx = this.ctx, P = this.pal(), z = this.cam.z;
    ctx.textBaseline = 'middle';
    const maxTraffic = Math.max(300, ...Object.values(this.traffic));

    // 1. on rassemble les villes visibles, avec leur importance
    const vis = [];
    CITIES.forEach(c => {
      for (const off of this.tiles()) {
        const p = this.px(c.lon + off, c.lat);
        if (p[0] < -60 || p[0] > this.w + 60 || p[1] < -20 || p[1] > this.h + 20) continue;
        const isHub = s.hubs.indexOf(c.code) >= 0;
        const owned = (s.slots[c.code] || 0) > 0;
        const hov = this.hoverCity === c.code, sel = this.selCity === c.code;
        const traf = this.traffic[c.code] || 0;
        const prio = (sel || hov ? 1000 : 0) + (isHub ? 500 : 0) + (owned ? 250 : 0) +
                     Math.min(200, traf / 20) + c.size * 100;
        vis.push({c, p, isHub, owned, hov, sel, traf, prio});
      }
    });
    vis.sort((a, b) => b.prio - a.prio);

    // 2. halos, anneaux puis pastilles ; les pastilles sont regroupées par
    //    couleur pour n'avoir que trois remplissages au lieu de cent cinquante
    vis.forEach(v => { v.rad = 2.4 + v.c.size * 4.2 + (v.isHub ? 1.8 : 0); });

    if (this.opts.halos) {
      vis.forEach(v => {
        if (!v.traf) return;
        const p = v.p, rr = v.rad + 6 + 22 * Math.sqrt(v.traf / maxTraffic);
        const g = ctx.createRadialGradient(p[0], p[1], v.rad * 0.5, p[0], p[1], rr);
        g.addColorStop(0, v.isHub ? P.haloHub : P.halo);
        g.addColorStop(1, P.haloOut);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p[0], p[1], rr, 0, 7); ctx.fill();
      });
    }

    ctx.lineWidth = 1.6;
    vis.forEach(v => {
      if (!(v.sel || v.hov)) return;
      const pr = v.rad + 8 + (v.hov ? 2 * Math.sin(this.time * 5) : 0);
      ctx.beginPath(); ctx.arc(v.p[0], v.p[1], pr, 0, 7);
      ctx.strokeStyle = v.sel ? P.ringSel : P.ringHov;
      ctx.stroke();
    });

    const spin = this.time * 0.35;
    vis.forEach(v => {
      if (!v.isHub) return;
      ctx.save();
      ctx.translate(v.p[0], v.p[1]); ctx.rotate(spin);
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(0, 0, v.rad + 5.5, 0, 7);
      ctx.strokeStyle = P.ringHub; ctx.lineWidth = 1.7; ctx.stroke();
      ctx.restore();
    });

    const groups = [[P.dot, v => !v.isHub && !v.owned],
                    [P.dotOwn, v => !v.isHub && v.owned],
                    [P.dotHub, v => v.isHub]];
    groups.forEach(([col, keep]) => {
      const list = vis.filter(keep);
      if (!list.length) return;
      ctx.beginPath();
      list.forEach(v => { ctx.moveTo(v.p[0] + v.rad, v.p[1]); ctx.arc(v.p[0], v.p[1], v.rad, 0, 7); });
      ctx.save();
      ctx.shadowColor = P.dotShadow; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;
      ctx.fillStyle = col; ctx.fill();
      ctx.restore();
      ctx.strokeStyle = P.dotEdge; ctx.lineWidth = 1.4; ctx.stroke();
    });

    ctx.fillStyle = P.dotGloss;
    ctx.beginPath();
    vis.forEach(v => {
      if (!v.isHub) return;
      const gx = v.p[0] - v.rad * 0.28, gy = v.p[1] - v.rad * 0.28, gr = v.rad * 0.3;
      ctx.moveTo(gx + gr, gy); ctx.arc(gx, gy, gr, 0, 7);
    });
    ctx.fill();

    // 3. étiquettes : on place par ordre d'importance, en évitant les collisions
    if (!this.opts.labels) return;
    const boxes = [];
    const hit = (b) => {
      for (let i = 0; i < boxes.length; i++) {
        const o = boxes[i];
        if (b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]) return true;
      }
      return false;
    };
    const minSize = z > 12 ? 0 : (z > 7 ? 0.20 : (z > 4 ? 0.30 : 0.42));

    vis.forEach(v => {
      const {c, p, isHub, owned, hov, sel} = v;
      if (!(c.size >= minSize || hov || sel || owned)) return;
      const fs = c.size > 0.7 ? 12 : (c.size > 0.34 ? 11 : 10);
      ctx.font = (c.size > 0.7 || isHub ? '600 ' : '') + fs + 'px "Segoe UI",system-ui,sans-serif';
      const wTxt = this.textW(ctx, c.name), hTxt = fs + 2;
      const r = v.rad + 5;
      // quatre positions candidates, la droite d'abord
      const cand = [
        [p[0] + r, p[1], 'left'],
        [p[0] - r - wTxt, p[1], 'left'],
        [p[0] - wTxt / 2, p[1] - r - hTxt * 0.55, 'left'],
        [p[0] - wTxt / 2, p[1] + r + hTxt * 0.55, 'left']
      ];
      let placed = null;
      for (const [bx, by] of cand) {
        const box = [bx - 1, by - hTxt / 2, bx + wTxt + 1, by + hTxt / 2];
        if (box[2] < 0 || box[0] > this.w || box[3] < 60 || box[1] > this.h - 18) continue;
        if (!hit(box)) { placed = [bx, by, box]; break; }
      }
      if (!placed) return;                       // rien de libre : on n'affiche pas
      boxes.push(placed[2]);
      ctx.lineWidth = 3.4; ctx.strokeStyle = P.labelHalo; ctx.lineJoin = 'round';
      ctx.strokeText(c.name, placed[0], placed[1]);
      ctx.fillStyle = isHub ? P.labelHub : (owned ? P.labelOwn : P.label);
      ctx.fillText(c.name, placed[0], placed[1]);
    });
    this.labelBoxes = boxes;
  },

  /* measureText est étonnamment coûteux : les noms ne changent pas, on retient */
  textWCache: new Map(),
  textW(ctx, txt) {
    const k = ctx.font + '|' + txt;
    let v = this.textWCache.get(k);
    if (v === undefined) { v = ctx.measureText(txt).width; this.textWCache.set(k, v); }
    return v;
  },

  drawLink() {
    if (!this.linkFrom || !this.mouse) return;
    const ctx = this.ctx, P = this.pal();
    const ca = CITY_BY_CODE[this.linkFrom];
    const p1 = this.px(ca.lon, ca.lat), m = this.mouse;
    ctx.strokeStyle = P.link; ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]); ctx.lineDashOffset = -this.time * 22;
    ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(m[0], m[1]); ctx.stroke();
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
    const rr = 9 + 2.5 * Math.sin(this.time * 6);
    ctx.beginPath(); ctx.arc(m[0], m[1], rr, 0, 7);
    ctx.strokeStyle = P.linkRing; ctx.lineWidth = 1.5; ctx.stroke();
  },

  drawGrain() {
    if (!this.grain) return;
    const ctx = this.ctx;
    ctx.globalAlpha = this.pal().grain;
    ctx.fillStyle = this.grain;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.globalAlpha = 1;
  },

  drawVignette() {
    const ctx = this.ctx, P = this.pal();
    const g = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.42,
                                       this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.78);
    g.addColorStop(0, P.vignette + '0)');
    g.addColorStop(1, P.vignette + P.vignetteA + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
  },

  drawScale() {
    const ctx = this.ctx, P = this.pal();
    // échelle mesurée sur la carte : vraie quelle que soit la projection
    const a = this.geo(this.w / 2 - 50, this.h / 2), b = this.geo(this.w / 2 + 50, this.h / 2);
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
    const hav = Math.sin(dLat/2)**2 + Math.cos(a[1]*rad) * Math.cos(b[1]*rad) * Math.sin(dLon/2)**2;
    const kmPer100 = 2 * R * Math.asin(Math.min(1, Math.sqrt(hav)));
    if (!isFinite(kmPer100) || kmPer100 <= 0) return;

    let km = kmPer100 * 1.1;
    const pow = Math.pow(10, Math.floor(Math.log10(Math.max(1, km))));
    km = Math.max(1, Math.round(km / pow) * pow);
    const w = km / kmPer100 * 100;
    if (!isFinite(w) || w < 10 || w > this.w * 0.6) return;
    const x = this.w / 2 - w / 2, y = this.h - 22;
    ctx.strokeStyle = P.scale; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y - 4); ctx.lineTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y - 4);
    ctx.stroke();
    ctx.font = '10px "Segoe UI",system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = P.scaleTxt;
    ctx.fillText(num(km) + ' km', x + w / 2, y - 5);
    ctx.textAlign = 'left';
  },

  /* -------------------------------- caméra ------------------------------- */
  focus(code, z) {
    const c = CITY_BY_CODE[code];
    const p = this.P().fwd(c.lon, c.lat);
    this.camT.x = p[0]; this.camT.y = p[1];
    if (z) this.camT.z = z;
  },
  frame(codeA, codeB) {
    const a = CITY_BY_CODE[codeA], b = CITY_BY_CODE[codeB];
    let lonB = b.lon;
    if (lonB - a.lon > 180) lonB -= 360;
    if (lonB - a.lon < -180) lonB += 360;
    const pa = this.P().fwd(a.lon, a.lat), pb = this.P().fwd(lonB, b.lat);
    this.camT.x = (pa[0] + pb[0]) / 2;
    this.camT.y = (pa[1] + pb[1]) / 2;
    const dx = Math.abs(pb[0] - pa[0]) + 14, dy = Math.abs(pb[1] - pa[1]) + 12;
    this.camT.z = Math.min(this.w / dx, (this.h - 90) / dy, 20);
  }
};
