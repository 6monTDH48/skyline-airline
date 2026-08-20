/* =========================================================================
   guide.js — la partie guidée : huit étapes pour la première partie.

   Le guide ne joue pas à la place du joueur et ne bloque rien : il dit ce
   qu'il faut faire, montre où c'est, et passe à la suite dès que c'est fait.
   Il se refuse au démarrage, s'abandonne à tout moment, et se relance depuis
   le panneau d'aide.
   ========================================================================= */

const GUIDE = {
  /* Chaque étape : ce qu'on demande, pourquoi, où regarder, et la condition
     qui la fait tomber. `spot` est un sélecteur : l'élément est entouré tant
     que l'étape court. */
  steps: [
    {title: 'Votre réseau',
     text: 'Tout part de votre base, ' +
           '<b class="home"></b>. Ouvrez le panneau <b>Réseau</b> : il liste vos lignes, ' +
           'vos hubs et vos créneaux.',
     spot: '#toolbar button[data-panel="network"]',
     done: () => UI.panel === 'network'},

    {title: 'Ouvrir une ligne',
     text: 'Une ligne, c’est deux créneaux d’aéroport, un avion, un tarif et une fréquence. ' +
           'L’assistant s’occupe des quatre. Cliquez <b>Ouvrir une ligne</b> — ou tapez <b>N</b>, ' +
           'où que vous soyez.',
     spot: '#dockbody button[data-a="newroute"]',
     done: () => UI.panel === 'newroute'},

    {title: 'Choisir la destination',
     text: 'Le tableau propose les marchés les plus porteurs au départ de votre base. ' +
           'Prenez-en un — ou cliquez n’importe quelle ville sur la carte.',
     spot: '#dockbody table',
     done: () => UI.wiz && UI.wiz.to},

    {title: 'Lire le devis',
     text: 'L’assistant chiffre tout : les créneaux à acheter, l’appareil le plus rentable ' +
           'pour cette distance, le résultat attendu une fois la ligne réglée. ' +
           'Quand le total vous convient, ouvrez la ligne.',
     spot: '#dockbody button[data-a="wizgo"]',
     done: () => G.s.routes.length >= 1},

    {title: 'La fiche de ligne',
     text: 'Chaque ligne s’ouvre sur un <b>conseil</b> : le levier qui rapporte le plus ici, ' +
           'chiffré. En dessous, le tarif et la fréquence, les deux réglages qui font la ' +
           'différence entre une ligne qui gagne de l’argent et une qui en perd.',
     spot: '#dockbody .advice',
     done: () => UI.panel === 'route'},

    {title: 'Laisser voler',
     text: 'Le temps passe tout seul. Lancez la vitesse <b>×4</b> et laissez tourner jusqu’à ' +
           'la fin du mois : les comptes tombent à la clôture, et le bilan vous dira ce qui a ' +
           'marché.',
     spot: '.speeds',
     done: () => G.s.history.length >= 1},

    {title: 'Les alertes',
     text: 'Le panneau <b>Alertes</b> rassemble tout ce qui appelle une décision, du plus ' +
           'urgent au plus accessoire, avec le bouton qui règle chaque point. C’est le premier ' +
           'endroit où regarder quand vous ne savez pas quoi faire.',
     spot: '#toolbar button[data-panel="alerts"]',
     done: () => UI.panel === 'alerts'},

    {title: 'Où vous allez',
     text: 'Le panneau <b>Objectifs</b> donne les quatre conditions de la victoire, et les ' +
           'paliers de compagnie qui les jalonnent. Vous savez tout : la suite est à vous.',
     spot: '#toolbar button[data-panel="goals"]',
     done: () => UI.panel === 'goals'}
  ],

  /* ------------------------------ démarrage ------------------------------ */
  /* Proposé une fois par partie neuve. Le refus est définitif pour cette
     partie, mais le guide reste relançable depuis l'aide. */
  offer() {
    UI.modal(
      '<div class="mh"><h2>Première partie ?</h2><p>Huit étapes pour ouvrir votre première ligne, ' +
      'lire vos comptes et savoir où regarder ensuite. Rien n’est bloqué pendant ce temps : ' +
      'le guide suit ce que vous faites.</p></div>' +
      '<div class="mb"><div class="mini">Vous pouvez l’abandonner d’un clic, et le relancer ' +
      'à tout moment depuis le panneau <b>Aide</b>.</div></div>' +
      '<div class="mf"><button class="btn gh" onclick="UI.closeModal();GUIDE.decline()">Je connais, merci</button>' +
      '<button class="btn" onclick="UI.closeModal();GUIDE.start()">Guidez-moi</button></div>');
  },
  /* Refusé : on ouvre l'aide, qui dit la même chose en plus court. */
  decline() { G.s.guide = {step: -1}; UI.open('help', undefined, {root: true}); },

  start() {
    G.s.guide = {step: 0};
    this.render();
    if (SPEED > 1) setSpeed(1);
  },
  stop() {
    G.s.guide = {step: -1};
    this.render();
  },
  skip() {
    if (!this.active()) return;
    G.s.guide.step++;
    if (G.s.guide.step >= this.steps.length) this.finish();
    else this.render();
  },
  finish() {
    G.s.guide = {step: -1, done: true};
    this.render();
    UI.toast('Guide terminé', 'Vous avez tout ce qu’il faut. Bonne partie.', 'good');
  },

  active() { return !!(G.s && G.s.guide && G.s.guide.step >= 0 && G.s.guide.step < this.steps.length); },

  /* ------------------------------ boucle -------------------------------- */
  /* Appelé par la boucle de rendu : fait tomber l'étape dès qu'elle est
     remplie, et garde la surbrillance à jour — le volet se redessine sans
     cesse, la classe doit être reposée. */
  check() {
    if (!this.active()) { this.spotlight(); return; }
    const st = this.steps[G.s.guide.step];
    let ok = false;
    try { ok = !!st.done(); } catch (e) { ok = false; }
    if (ok) {
      G.s.guide.step++;
      if (G.s.guide.step >= this.steps.length) { this.finish(); return; }
      this.render();
    }
    this.spotlight();
  },

  spotlight() {
    document.querySelectorAll('.spot').forEach(e => e.classList.remove('spot'));
    if (!this.active()) return;
    const sel = this.steps[G.s.guide.step].spot;
    if (!sel) return;
    const t = document.querySelector(sel);
    if (t) t.classList.add('spot');
  },

  /* ------------------------------ affichage ------------------------------ */
  render() {
    const box = document.getElementById('guide');
    if (!box) return;
    if (!this.active()) {
      box.classList.remove('open');
      document.getElementById('ticker').classList.remove('up');
      this.spotlight();
      return;
    }
    const i = G.s.guide.step, st = this.steps[i];
    box.innerHTML =
      '<div class="ghd"><span class="gn">Étape ' + (i + 1) + ' sur ' + this.steps.length + '</span>' +
      '<button class="gx" onclick="GUIDE.stop()" title="Abandonner le guide">✕</button></div>' +
      '<div class="gt">' + st.title + '</div>' +
      '<div class="gd">' + st.text + '</div>' +
      '<div class="gbar"><i style="width:' + Math.round(i / this.steps.length * 100) + '%"></i></div>' +
      '<div class="gf"><button class="btn sm gh" onclick="GUIDE.skip()">Passer cette étape</button></div>';
    const home = box.querySelector('.home');
    if (home && G.s) home.textContent = CITY_BY_CODE[G.s.home].name;
    box.classList.add('open');
    document.getElementById('ticker').classList.add('up');
    this.spotlight();
  }
};
