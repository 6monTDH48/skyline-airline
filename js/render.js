/* =========================================================================
   render.js — rendu de la carte : atlas clair, terminateur jour/nuit,
   lignes animées, traînées de condensation, halos de trafic.
   ========================================================================= */

const Map2D = {
  cv: null, ctx: null, w: 0, h: 0, dpr: 1,
  cam:  {lon: 10, lat: 22, z: 4},
  camT: {lon: 10, lat: 22, z: 4},
  hoverCity: null, selCity: null, linkFrom: null, selRoute: null, hoverRoute: null,
  time: 0, grain: null, traffic: {}, trafficAt: -1,

  /* réglages d'affichage, conservés d'une partie à l'autre */
  opts: {night: true, rivals: true, trails: true, labels: true, grain: true,
         halos: true, dark: false},

  /* Deux palettes : atlas de jour sur papier clair, atlas de nuit sur fond
     encre. Tout le rendu passe par ici, rien n'est écrit en dur plus bas. */
  PAL: {
    clair: {
      sea1:'#d9eaf2', sea2:'#c5dbe6', sea3:'#aecad9',
      land1:'#f5ecd6', land2:'#e5d5b2',
      shadow:'rgba(92,108,120,.16)',
      coastHalo:'rgba(255,252,244,.7)', coast:'rgba(142,120,84,.9)',
      grat:'rgba(110,145,162,.20)', gratTxt:'rgba(70,100,118,.45)',
      equator:'rgba(90,125,142,.42)', tropic:'rgba(140,120,80,.30)',
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
      sea1:'#101d28', sea2:'#0c1720', sea3:'#081119',
      land1:'#26333d', land2:'#1c2730',
      shadow:'rgba(0,0,0,.45)',
      coastHalo:'rgba(120,170,200,.13)', coast:'rgba(128,168,192,.72)',
      grat:'rgba(130,175,205,.11)', gratTxt:'rgba(150,185,205,.38)',
      equator:'rgba(140,180,205,.28)', tropic:'rgba(190,170,110,.20)',
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
  loadOpts() {
    try {
      const o = JSON.parse(localStorage.getItem('skyline.opts') || '{}');
      Object.keys(this.opts).forEach(k => { if (typeof o[k] === 'boolean') this.opts[k] = o[k]; });
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
    // un onglet encore sans mise en page donne des dimensions nulles :
    // on garde un minimum pour ne jamais manipuler de canevas vide
    this.w = Math.max(1, this.cv.clientWidth);
    this.h = Math.max(1, this.cv.clientHeight);
    this.cv.width = Math.round(this.w * this.dpr);
    this.cv.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.grain = this.ctx.createPattern(this.grainCanvas, 'repeat');
  },

  fit() {
    this.camT.z = Math.min(this.w / 360, (this.h - 70) / 150);
    this.camT.lon = 10; this.camT.lat = 22;
  },
  minZoom() { return Math.min(this.w / 380, (this.h - 70) / 160); },
  syncTarget() { this.camT.lon = this.cam.lon; this.camT.lat = this.cam.lat; this.camT.z = this.cam.z; },

  px(lon, lat) {
    return [(lon - this.cam.lon) * this.cam.z + this.w / 2,
            (this.cam.lat - lat) * this.cam.z + this.h / 2 + 20];
  },
  geo(x, y) {
    return [(x - this.w / 2) / this.cam.z + this.cam.lon,
            this.cam.lat - (y - this.h / 2 - 20) / this.cam.z];
  },
  clampCam() {
    [this.cam, this.camT].forEach(c => {
      c.z = Math.max(this.minZoom() * 0.95, Math.min(46, c.z));
      const halfLat = (this.h / 2) / c.z;
      c.lat = Math.max(-58 + halfLat * 0.3, Math.min(80 - halfLat * 0.3, c.lat));
      c.lon = Math.max(-260, Math.min(280, c.lon));
    });
  },
  ease(dt) {
    const k = Math.min(1, dt * 7);
    this.cam.lon += (this.camT.lon - this.cam.lon) * k;
    this.cam.lat += (this.camT.lat - this.cam.lat) * k;
    this.cam.z   += (this.camT.z   - this.cam.z)   * k;
  },

  /* ------------------------------ interaction ---------------------------- */
  cityAt(x, y) {
    let best = null, bd = 15 * 15;
    for (const c of CITIES) {
      for (const off of [0, -360, 360]) {
        const p = this.px(c.lon + off, c.lat);
        if (p[0] < -30 || p[0] > this.w + 30) continue;
        const d = (p[0] - x) ** 2 + (p[1] - y) ** 2;
        if (d < bd) { bd = d; best = c; }
      }
    }
    return best;
  },
  offsets() { return [0, -360, 360]; },

  /* trafic par ville, pour dimensionner les halos */
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

  /* ================================ dessin =============================== */
  draw(dt) {
    const ctx = this.ctx, s = G.s;
    if (this.cv.clientWidth > 0 && this.cv.clientWidth !== this.w) this.resize();
    if (this.w < 2 || this.h < 2 || this.cv.width < 2) return;   // pas encore de place à l'écran
    this.time += dt;
    this.ease(dt);
    this.clampCam();
    this.refreshTraffic();

    this.drawSea();
    this.drawGraticule();
    this.drawLand();
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

  drawSea() {
    const ctx = this.ctx;
    const P = this.pal();
    const g = ctx.createLinearGradient(0, 0, this.w * 0.35, this.h);
    g.addColorStop(0, P.sea1);
    g.addColorStop(0.45, P.sea2);
    g.addColorStop(1, P.sea3);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
  },

  drawGraticule() {
    const ctx = this.ctx, z = this.cam.z, P = this.pal();
    const step = z > 14 ? 5 : (z > 7 ? 10 : 20);
    ctx.lineWidth = 1;
    ctx.font = '9px "Segoe UI",system-ui,sans-serif';
    ctx.textBaseline = 'top';

    ctx.strokeStyle = P.grat;
    ctx.beginPath();
    for (let lon = -360; lon <= 360; lon += step) {
      const p = this.px(lon, 0);
      if (p[0] < -5 || p[0] > this.w + 5) continue;
      ctx.moveTo(p[0], 0); ctx.lineTo(p[0], this.h);
    }
    for (let lat = -80; lat <= 80; lat += step) {
      const p = this.px(0, lat);
      if (p[1] < -5 || p[1] > this.h + 5) continue;
      ctx.moveTo(0, p[1]); ctx.lineTo(this.w, p[1]);
    }
    ctx.stroke();

    // repères chiffrés
    ctx.fillStyle = P.gratTxt;
    for (let lat = -60; lat <= 80; lat += step * (z > 7 ? 1 : 2)) {
      const p = this.px(0, lat);
      if (p[1] < 66 || p[1] > this.h - 26) continue;
      ctx.fillText(Math.abs(lat) + '°' + (lat === 0 ? '' : (lat > 0 ? 'N' : 'S')), 4, p[1] + 2);
    }

    // tropiques et équateur
    ctx.setLineDash([5, 6]);
    [[0, P.equator], [23.44, P.tropic], [-23.44, P.tropic]]
      .forEach(([lat, col]) => {
        const p = this.px(0, lat);
        if (p[1] < 0 || p[1] > this.h) return;
        ctx.strokeStyle = col; ctx.beginPath();
        ctx.moveTo(0, p[1]); ctx.lineTo(this.w, p[1]); ctx.stroke();
      });
    ctx.setLineDash([]);
  },

  /* Version allégée du trait de côte pour la vue monde : un point sur trois,
     et on écarte les îles trop petites pour être vues. */
  /* Aire algébrique d'un anneau : son signe donne le sens de parcours. Deux
     anneaux de sens opposés réunis dans un même chemin s'annulent (règle de
     remplissage « non-zero ») et creusent des trous dans les continents. */
  ringArea(p) {
    let a = 0;
    for (let i = 0; i < p.length; i += 2) {
      const j = (i + 2) % p.length;
      a += p[i] * p[j + 1] - p[j] * p[i + 1];
    }
    return a / 2;
  },
  orient(p) {
    if (this.ringArea(p) >= 0) return p;
    const out = new Array(p.length);
    for (let i = 0, k = p.length - 2; i < p.length; i += 2, k -= 2) {
      out[i] = p[k]; out[i + 1] = p[k + 1];
    }
    return out;
  },

  landLow() {
    if (this._low) return this._low;
    this._low = [];
    this._lowBB = [];
    const bb = this.landBounds();
    for (let i = 0; i < LANDMASSES.length; i++) {
      const b = bb[i];
      if ((b[2] - b[0]) < 1.1 && (b[3] - b[1]) < 1.1) continue;
      const src = LANDMASSES[i], out = [];
      for (let j = 0; j < src.length - 1; j += 6) { out.push(src[j], src[j + 1]); }
      out.push(src[0], src[1]);
      // la décimation peut retourner le sens d'un petit anneau : on le rétablit
      if (out.length >= 8) { this._low.push(this.orient(out)); this._lowBB.push(b); }
    }
    return this._low;
  },

  /* boîtes englobantes, calculées une fois, pour écarter les anneaux hors champ */
  landBounds() {
    if (this._lb) return this._lb;
    this._lb = LANDMASSES.map(p => {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let i = 0; i < p.length; i += 2) {
        if (p[i] < x0) x0 = p[i];
        if (p[i] > x1) x1 = p[i];
        if (p[i+1] < y0) y0 = p[i+1];
        if (p[i+1] > y1) y1 = p[i+1];
      }
      return [x0, y0, x1, y1];
    });
    return this._lb;
  },

  /* Le fond de carte ne change qu'au déplacement de la caméra : on le peint
     dans un calque hors écran et on se contente de le recopier ensuite. */
  drawLand() {
    const key = this.cam.lon.toFixed(3) + '|' + this.cam.lat.toFixed(3) + '|' +
                this.cam.z.toFixed(4) + '|' + this.cv.width + 'x' + this.cv.height +
                '|' + (this.opts.dark ? 'nuit' : 'jour');
    if (this.landKey !== key) {
      if (!this.landLayer) this.landLayer = document.createElement('canvas');
      if (this.landLayer.width !== this.cv.width || this.landLayer.height !== this.cv.height) {
        this.landLayer.width = Math.max(1, this.cv.width);
        this.landLayer.height = Math.max(1, this.cv.height);
      }
      const lc = this.landLayer.getContext('2d');
      lc.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      lc.clearRect(0, 0, this.w, this.h);
      const keep = this.ctx;
      this.ctx = lc;
      this.paintLand();
      this.ctx = keep;
      this.landKey = key;
    }
    this.ctx.drawImage(this.landLayer, 0, 0, this.w, this.h);
  },

  paintLand() {
    const ctx = this.ctx, P = this.pal();
    // Le trait allégé garde un point sur trois, soit une tolérance d'environ
    // 0,15° : indiscernable tant qu'un degré tient dans un pixel ou deux.
    const coarse = this.cam.z < 10;
    const rings = coarse ? this.landLow() : LANDMASSES;
    const bb = coarse ? (this.landLow(), this._lowBB) : this.landBounds();
    const tl = this.geo(0, 0), br = this.geo(this.w, this.h);
    const view = [tl[0], br[1], br[0], tl[1]];              // lonMin, latMin, lonMax, latMax
    const m = 1.5;

    for (const off of this.offsets()) {
      const vis = [];
      for (let i = 0; i < rings.length; i++) {
        const b = bb[i];
        if (b[0] + off > view[2] + m || b[2] + off < view[0] - m ||
            b[1] > view[3] + m || b[3] < view[1] - m) continue;
        vis.push(rings[i]);
      }
      if (!vis.length) continue;

      // ombre portée : simple décalage, sans flou. Inutile en vue monde,
      // où le décalage de 3 px se confond avec le trait de côte.
      if (!coarse) {
        ctx.save();
        ctx.translate(1.5, 3);
        ctx.fillStyle = P.shadow;
        this.landPaths(vis, off, true, false);
        ctx.restore();
      }

      const g = ctx.createLinearGradient(0, 0, 0, this.h);
      g.addColorStop(0, P.land1);
      g.addColorStop(1, P.land2);
      ctx.fillStyle = g;
      this.landPaths(vis, off, true, false);

      ctx.lineJoin = 'round';
      if (!coarse) {
        ctx.strokeStyle = P.coastHalo; ctx.lineWidth = 2.4;
        this.landPaths(vis, off, false, true);
      }
      ctx.strokeStyle = P.coast; ctx.lineWidth = 0.9;
      this.landPaths(vis, off, false, true);
    }
  },
  landPaths(rings, off, fill, stroke) {
    const ctx = this.ctx, z = this.cam.z;
    const ox = (off - this.cam.lon) * z + this.w / 2;
    const oy = this.cam.lat * z + this.h / 2 + 20;
    const trace = poly => {
      ctx.moveTo(poly[0] * z + ox, oy - poly[1] * z);
      for (let i = 2; i < poly.length; i += 2)
        ctx.lineTo(poly[i] * z + ox, oy - poly[i+1] * z);
      ctx.closePath();
    };

    // Les anneaux sont tous orientés dans le même sens à la génération : on
    // peut donc les réunir dans un seul chemin sans que la règle « non-zero »
    // ne les annule entre eux. On borne tout de même la taille du chemin.
    let n = 0;
    ctx.beginPath();
    for (const poly of rings) {
      trace(poly);
      n += poly.length;
      if (n > 12000) {
        if (fill) ctx.fill();
        if (stroke) ctx.stroke();
        ctx.beginPath(); n = 0;
      }
    }
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  },

  /* --------------------------- terminateur jour/nuit --------------------- */
  drawNight() {
    if (!G.s) return;
    const ctx = this.ctx, rad = Math.PI / 180, P = this.pal();
    const doy = G.s.m * 30.4 + G.s.d;
    const frac = Math.max(0, Math.min(1, G.acc));          // fraction du jour écoulée
    let decl = 23.44 * Math.sin(2 * Math.PI * (doy - 81) / 365);
    if (Math.abs(decl) < 1.2) decl = decl >= 0 ? 1.2 : -1.2;
    const sunLon = 180 - 360 * frac;
    const darkPole = decl > 0 ? -90 : 90;

    const sign = decl > 0 ? -1 : 1;          // sens du décalage vers le pôle nocturne
    // on referme la zone d'ombre bien au-delà du cadre : sinon le pôle projeté
    // laisse une arête horizontale en travers de la carte
    const edgeY = darkPole > 0 ? -4000 : this.h + 4000;
    const band = (shift) => {
      const pts = [];
      for (let lon = -560; lon <= 560; lon += 4) {
        const latT = Math.atan(-Math.cos((lon - sunLon) * rad) / Math.tan(decl * rad)) / rad;
        pts.push(this.px(lon, latT + shift * sign));
      }
      return pts;
    };

    // l'ombre ne se lit qu'à l'échelle du globe : on l'estompe en zoom rapproché
    const fade = 1 - Math.max(0, Math.min(1, (this.cam.z - 6.5) / 5));
    if (fade <= 0.01) return;

    ctx.save();
    // dégradé crépusculaire : bandes emboîtées, du crépuscule à la nuit noire
    const BANDS = [];
    for (let i = 0; i < 7; i++) BANDS.push([Math.pow(i / 6, 1.5) * 30, 0.025 * fade]);
    BANDS.forEach(([shift, alpha]) => {
      const pts = band(shift);
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.lineTo(pts[pts.length - 1][0], edgeY);
      ctx.lineTo(pts[0][0], edgeY);
      ctx.closePath();
      ctx.fillStyle = 'rgba(' + P.night + ',' + alpha + ')';
      ctx.fill();
    });
    // liseré de l'aube
    ctx.globalAlpha = fade;
    const pts = band(0);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.shadowColor = P.dawnGlow; ctx.shadowBlur = 9;
    ctx.strokeStyle = P.dawn;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
  },

  /* -------------------------------- lignes ------------------------------- */
  /* Orthodromie : le vrai chemin le plus court, échantillonné puis mis en cache.
     Les longitudes sont « déroulées » pour ne pas sauter d'un bord à l'autre. */
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
    const n = Math.max(2, Math.min(48, Math.round(d / (Math.PI / 90))));
    v = [];
    if (d < 1e-9) {
      v = [ca.lon, ca.lat, cb.lon, cb.lat];
    } else {
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const f = i / n;
        const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
        const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
        const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
        const z = A * Math.sin(la1) + B * Math.sin(la2);
        let lon = Math.atan2(y, x) / R;
        const lat = Math.atan2(z, Math.hypot(x, y)) / R;
        if (prev !== null) {                       // déroulage
          while (lon - prev > 180) lon -= 360;
          while (lon - prev < -180) lon += 360;
        }
        prev = lon;
        v.push(lon, lat);
      }
    }
    this.gcCache.set(key, v);
    return v;
  },
  gcCache: new Map(),

  /* bornes écran de la trajectoire, pour l'écartement hors champ */
  gcVisible(pts, off) {
    let x0 = 1e9, x1 = -1e9;
    for (let i = 0; i < pts.length; i += 2) {
      if (pts[i] < x0) x0 = pts[i];
      if (pts[i] > x1) x1 = pts[i];
    }
    const z = this.cam.z, ox = (off - this.cam.lon) * z + this.w / 2;
    return !(x1 * z + ox < -90 || x0 * z + ox > this.w + 90);
  },
  pathGC(pts, off) {
    const ctx = this.ctx, z = this.cam.z;
    const ox = (off - this.cam.lon) * z + this.w / 2;
    const oy = this.cam.lat * z + this.h / 2 + 20;
    ctx.beginPath();
    ctx.moveTo(pts[0] * z + ox, oy - pts[1] * z);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] * z + ox, oy - pts[i + 1] * z);
  },
  strokeGC(pts, off, wid, color, dash, dashOff) {
    const ctx = this.ctx;
    ctx.strokeStyle = color; ctx.lineWidth = wid; ctx.lineCap = 'round';
    if (dash) { ctx.setLineDash(dash); ctx.lineDashOffset = dashOff || 0; }
    this.pathGC(pts, off);
    ctx.stroke();
    if (dash) { ctx.setLineDash([]); ctx.lineDashOffset = 0; }
  },
  /* position et cap le long de la trajectoire, t dans [0,1] */
  gcAt(pts, t, off) {
    const n = pts.length / 2 - 1;
    const f = Math.max(0, Math.min(0.9999, t)) * n;
    const i = Math.floor(f), r = f - i;
    const ax = pts[i * 2], ay = pts[i * 2 + 1];
    const bx = pts[i * 2 + 2], by = pts[i * 2 + 3];
    const lon = ax + (bx - ax) * r, lat = ay + (by - ay) * r;
    const z = this.cam.z;
    const ox = (off - this.cam.lon) * z + this.w / 2;
    const oy = this.cam.lat * z + this.h / 2 + 20;
    return [lon * z + ox, oy - lat * z,
            Math.atan2(-(by - ay) * z, (bx - ax) * z)];
  },

  drawRivalRoutes() {
    const ctx = this.ctx;
    ctx.globalAlpha = 0.24;
    G.s.rivals.forEach(rv => rv.routes.forEach(rt => {
      const pts = this.gc(CITY_BY_CODE[rt.a], CITY_BY_CODE[rt.b]);
      for (const off of this.offsets()) {
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
      const w = 1.7 + Math.min(5.5, r.ac.length * 0.95);
      const st = G.routeState(r);
      const col = !active ? P.routeIdle
        : (st === 'saturee' ? P.routeSat
        : (st === 'deficitaire' ? P.routeDef
        : (st === 'creuse' ? P.routeLow : P.routeOk)));
      const flow = st === 'saturee' ? P.flowSat
        : (st === 'deficitaire' ? P.flowDef
        : (st === 'creuse' ? P.flowLow : P.flowOk));

      for (const off of this.offsets()) {
        if (!this.gcVisible(pts, off)) continue;
        if (sel) {
          ctx.save();
          ctx.shadowColor = P.selGlow; ctx.shadowBlur = 14;
          this.strokeGC(pts, off, w + 2.5, P.selLine);
          ctx.restore();
        }
        if (!active) { this.strokeGC(pts, off, w, col, [5, 6]); continue; }
        if (st === 'saturee') {              // halo pulsé : la ligne déborde
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

      for (const off of this.offsets()) {
        if (!this.gcVisible(pts, off)) continue;
        const pa = this.gcAt(pts, t, off);
        const p = pa;
        if (p[0] < -30 || p[0] > this.w + 30) continue;

        // traînée de condensation
        const back = ac.dir > 0 ? -1 : 1;
        ctx.lineCap = 'round';
        for (let i = 0; this.opts.trails && i < 7; i++) {
          const t0 = t + back * 0.014 * i, t1 = t + back * 0.014 * (i + 1);
          if (t0 < 0 || t0 > 1 || t1 < 0 || t1 > 1) break;
          const q0 = this.gcAt(pts, t0, off), q1 = this.gcAt(pts, t1, off);
          ctx.strokeStyle = 'rgba(' + P.trail + ',' + (0.5 - i * 0.07) + ')';
          ctx.lineWidth = (3.4 - i * 0.4) * scale * 0.6;
          ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.stroke();
        }

        const ang = ac.dir > 0 ? pa[2] : pa[2] + Math.PI;
        ctx.save();
        ctx.translate(p[0], p[1]); ctx.rotate(ang); ctx.scale(scale, scale);
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

  drawCities() {
    const s = G.s, ctx = this.ctx, P = this.pal();
    const z = this.cam.z;
    const labelMin = z > 9 ? 0 : (z > 5.5 ? 0.36 : 0.55);
    ctx.textBaseline = 'middle';
    const maxTraffic = Math.max(300, ...Object.values(this.traffic));

    CITIES.forEach(c => {
      for (const off of this.offsets()) {
        const p = this.px(c.lon + off, c.lat);
        if (p[0] < -50 || p[0] > this.w + 50 || p[1] < -20 || p[1] > this.h + 20) continue;
        const isHub = s.hubs.indexOf(c.code) >= 0;
        const owned = (s.slots[c.code] || 0) > 0;
        const hov = this.hoverCity === c.code, sel = this.selCity === c.code;
        const rad = 2.6 + c.size * 4.2 + (isHub ? 1.8 : 0);
        const traf = this.traffic[c.code] || 0;

        // halo de trafic
        if (traf > 0 && this.opts.halos) {
          const rr = rad + 6 + 22 * Math.sqrt(traf / maxTraffic);
          const g = ctx.createRadialGradient(p[0], p[1], rad * 0.5, p[0], p[1], rr);
          g.addColorStop(0, isHub ? P.haloHub : P.halo);
          g.addColorStop(1, P.haloOut);
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(p[0], p[1], rr, 0, 7); ctx.fill();
        }
        if (sel || hov) {
          const pr = rad + 8 + (hov ? 2 * Math.sin(this.time * 5) : 0);
          ctx.beginPath(); ctx.arc(p[0], p[1], pr, 0, 7);
          ctx.strokeStyle = sel ? P.ringSel : P.ringHov;
          ctx.lineWidth = 1.6; ctx.stroke();
        }
        if (isHub) {
          ctx.save();
          ctx.translate(p[0], p[1]); ctx.rotate(this.time * 0.35);
          ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.arc(0, 0, rad + 5.5, 0, 7);
          ctx.strokeStyle = P.ringHub; ctx.lineWidth = 1.7; ctx.stroke();
          ctx.restore();
        }

        ctx.save();
        ctx.shadowColor = P.dotShadow; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;
        ctx.beginPath(); ctx.arc(p[0], p[1], rad, 0, 7);
        ctx.fillStyle = isHub ? P.dotHub : (owned ? P.dotOwn : P.dot);
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = P.dotEdge; ctx.lineWidth = 1.4; ctx.stroke();
        if (isHub) {
          ctx.beginPath(); ctx.arc(p[0] - rad * 0.28, p[1] - rad * 0.28, rad * 0.3, 0, 7);
          ctx.fillStyle = P.dotGloss; ctx.fill();
        }

        if (this.opts.labels && (c.size >= labelMin || hov || sel || owned)) {
          const fs = c.size > 0.7 ? 12 : 11;
          ctx.font = (c.size > 0.7 || isHub ? '600 ' : '') + fs + 'px "Segoe UI",system-ui,sans-serif';
          const tx = p[0] + rad + 6, ty = p[1] - 0.5;
          ctx.lineWidth = 3.4; ctx.strokeStyle = P.labelHalo;
          ctx.lineJoin = 'round';
          ctx.strokeText(c.name, tx, ty);
          ctx.fillStyle = isHub ? P.labelHub : (owned ? P.labelOwn : P.label);
          ctx.fillText(c.name, tx, ty);
        }
      }
    });
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
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.42,
                                       this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.78);
    const P = this.pal();
    g.addColorStop(0, P.vignette + '0)');
    g.addColorStop(1, P.vignette + P.vignetteA + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
  },

  drawScale() {
    const ctx = this.ctx;
    const kmPerDeg = 111.32 * Math.cos(this.cam.lat * Math.PI / 180);
    const targetPx = 110;
    let km = targetPx / this.cam.z * kmPerDeg;
    const pow = Math.pow(10, Math.floor(Math.log10(Math.max(1, km))));
    km = Math.max(1, Math.round(km / pow) * pow);
    const w = km / kmPerDeg * this.cam.z;
    const x = this.w / 2 - w / 2, y = this.h - 22;
    ctx.strokeStyle = this.pal().scale; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y - 4); ctx.lineTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y - 4);
    ctx.stroke();
    ctx.font = '10px "Segoe UI",system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = this.pal().scaleTxt;
    ctx.fillText(num(km) + ' km', x + w / 2, y - 5);
    ctx.textAlign = 'left';
  },

  /* -------------------------------- caméra ------------------------------- */
  focus(code, z) {
    const c = CITY_BY_CODE[code];
    this.camT.lon = c.lon; this.camT.lat = c.lat;
    if (z) this.camT.z = z;
  },
  frame(codeA, codeB) {
    const a = CITY_BY_CODE[codeA], b = CITY_BY_CODE[codeB];
    let lonB = b.lon;
    if (lonB - a.lon > 180) lonB -= 360;
    if (lonB - a.lon < -180) lonB += 360;
    this.camT.lon = (a.lon + lonB) / 2;
    this.camT.lat = (a.lat + b.lat) / 2;
    const dl = Math.abs(lonB - a.lon) + 14, dt = Math.abs(b.lat - a.lat) + 12;
    this.camT.z = Math.min(this.w / dl, (this.h - 90) / dt, 20);
  }
};


