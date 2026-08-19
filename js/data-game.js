/* =========================================================================
   data-game.js — constantes d'équilibrage, catalogue d'avions,
   compagnies concurrentes, événements aléatoires.
   ========================================================================= */

const BAL = {
  DAY_SECONDS: 6,            // durée réelle d'un jour de jeu à la vitesse ×1
  START_CASH: 150e6,
  START_YEAR: 2025,

  FUEL_BASE: 0.80,           // €/kg de kérosène
  UTIL_HOURS: 15,            // heures exploitables par jour et par avion

  PRICE_A: 55, PRICE_B: 0.086,        // tarif éco de référence = A + B × distance
  CLASS_MULT:  {eco:1, biz:3.1, first:6.4},   // multiplicateur tarifaire
  CLASS_SPACE: {eco:1, biz:2.4, first:4.6},   // encombrement d'un siège

  DEMAND_K: 1600,              // échelle de la demande quotidienne
  DEMAND_HALF: 2700,         // distance (km) de demi-atténuation
  MIN_DISTANCE: 280,         // en dessous, le train/la route gagnent

  CARGO_A: 0.90, CARGO_B: 0.00016,    // €/kg = A + B × distance
  CARGO_K: 320,                       // échelle de la demande de fret (t/jour)

  /* --- coûts variables, par vol --- */
  ATC_KM: 0.55,                       // €/km × poids : redevances de navigation aérienne
  GROUND_LEG: 750,                    // €/vol × poids : assistance en escale
  /* --- coûts variables, par passager --- */
  CATERING_A: 6, CATERING_B: 0.0006,  // €/passager : restauration et service à bord
  DISTRIB_RATE: 0.062,                // % des recettes billets : distribution, commissions
  /* --- charges passives, par appareil et par mois --- */
  INSURANCE_M: 0.0005,                // assurance : part de la valeur de l'appareil
  PARK_M: 22e3,                       // stationnement, hangar, redevances de garage
  TRAIN_M: 14e3,                      // formation et maintien des qualifications
  ADMIN_M: 18e3,                      // informatique, administration, sûreté
  /* --- charges de structure, par mois --- */
  MARKETING_ROUTE: 26e3,              // marketing et distribution, par ligne ouverte

  SLOT_BASE: 900e3, SLOT_SIZE: 4.2e6, // coût d'un créneau
  SLOT_UPKEEP: 14e3,                  // €/mois par créneau
  HUB_BASE: 14e6, HUB_SIZE: 42e6,     // coût de création d'un hub
  MAX_HUBS: 4,
  HUB_FEE_DISCOUNT: 0.55,             // redevances à votre hub
  CONNECT_RATE: 0.42,                 // part de la demande indirecte captable

  MONTHLY_HQ: 260e3,

  LOAN_RATE: 0.068, LOAN_MONTHS: 60,
  DEBT_RATIO: 0.75,                   // dette max = ratio × actifs
  BANKRUPT_DAYS: 45,

  MAINT_THRESHOLD: 0.55,              // au-delà : retards et annulations
  MAINT_GROUND: 1.0,                  // au-delà : avion cloué au sol
  MAINT_DAYS: 4,
  MAINT_COST_RATIO: 0.035,            // × prix catalogue × usure

  DEPRECIATION: 0.0045,               // valeur perdue par mois
  REP_START: 68
};

const CABINS = {
  charter:  {label:'Charter',   eco:1.00, biz:0.00, first:0.00, rep:-3, desc:'Tout éco, remplissage maximal'},
  standard: {label:'Standard',  eco:0.86, biz:0.12, first:0.02, rep:0,  desc:'Équilibré, convient partout'},
  affaires: {label:'Affaires',  eco:0.70, biz:0.24, first:0.06, rep:3,  desc:'Rentable sur les axes d’affaires'},
  prestige: {label:'Prestige',  eco:0.55, biz:0.32, first:0.13, rep:6,  desc:'Long-courrier premium'}
};
const CABIN_ORDER = ['charter','standard','affaires','prestige'];

/* -------------------------------------------------------------------------
   Catalogue d'avions. `seats` = capacité en sièges éco-équivalents.
   Prix exprimés en € (tarifs nets négociés, ~1/3 du prix catalogue).
   ------------------------------------------------------------------------- */
const AIRCRAFT = [
  {id:'atr72', name:'ATR 72-600', maker:'ATR', cat:'Turbopropulseur',
   seats:72, range:1500, speed:510, price:9.0e6, fuel:0.62, crew:620, maint:300,
   feeW:0.5, turn:0.50, belly:0.8, cargo:0, wear:0.00030},
  {id:'e175', name:'Embraer E175', maker:'Embraer', cat:'Régional',
   seats:88, range:3900, speed:830, price:16.5e6, fuel:1.35, crew:760, maint:430,
   feeW:0.7, turn:0.55, belly:1.1, cargo:0, wear:0.00028},
  {id:'a220', name:'Airbus A220-300', maker:'Airbus', cat:'Court-courrier',
   seats:145, range:6300, speed:830, price:30e6, fuel:1.85, crew:960, maint:600,
   feeW:0.85, turn:0.60, belly:2, cargo:0, wear:0.00024},
  {id:'a320', name:'Airbus A320neo', maker:'Airbus', cat:'Moyen-courrier',
   seats:180, range:6300, speed:833, price:34e6, fuel:2.30, crew:1150, maint:760,
   feeW:1.00, turn:0.65, belly:2.5, cargo:0, wear:0.00024},
  {id:'b737', name:'Boeing 737 MAX 8', maker:'Boeing', cat:'Moyen-courrier',
   seats:178, range:6500, speed:840, price:35e6, fuel:2.35, crew:1150, maint:780,
   feeW:1.00, turn:0.65, belly:2.5, cargo:0, wear:0.00024},
  {id:'a321', name:'Airbus A321neo', maker:'Airbus', cat:'Moyen-courrier',
   seats:220, range:7400, speed:833, price:41e6, fuel:2.60, crew:1260, maint:850,
   feeW:1.15, turn:0.70, belly:3, cargo:0, wear:0.00023},
  {id:'b789', name:'Boeing 787-9', maker:'Boeing', cat:'Long-courrier',
   seats:290, range:14000, speed:900, price:84e6, fuel:5.40, crew:2300, maint:1700,
   feeW:1.80, turn:1.10, belly:12, cargo:0, wear:0.00019},
  {id:'a339', name:'Airbus A330-900', maker:'Airbus', cat:'Long-courrier',
   seats:300, range:13300, speed:900, price:82e6, fuel:5.70, crew:2350, maint:1750,
   feeW:1.85, turn:1.10, belly:11, cargo:0, wear:0.00020},
  {id:'a35k', name:'Airbus A350-1000', maker:'Airbus', cat:'Long-courrier',
   seats:370, range:16000, speed:910, price:110e6, fuel:6.60, crew:2700, maint:2000,
   feeW:2.10, turn:1.20, belly:14, cargo:0, wear:0.00018},
  {id:'b77w', name:'Boeing 777-300ER', maker:'Boeing', cat:'Long-courrier',
   seats:396, range:13600, speed:900, price:105e6, fuel:7.60, crew:2900, maint:2200,
   feeW:2.30, turn:1.25, belly:15, cargo:0, wear:0.00021},
  {id:'a380', name:'Airbus A380-800', maker:'Airbus', cat:'Très gros porteur',
   seats:550, range:15000, speed:900, price:140e6, fuel:9.80, crew:3800, maint:3000,
   feeW:3.00, turn:1.50, belly:16, cargo:0, wear:0.00022},

  {id:'at7f', name:'ATR 72-600F', maker:'ATR', cat:'Cargo',
   seats:0, range:1400, speed:500, price:7.5e6, fuel:0.60, crew:520, maint:280,
   feeW:0.5, turn:0.80, belly:0, cargo:9, wear:0.00030},
  {id:'b738f', name:'Boeing 737-800BCF', maker:'Boeing', cat:'Cargo',
   seats:0, range:3800, speed:830, price:21e6, fuel:2.20, crew:900, maint:700,
   feeW:1.00, turn:1.00, belly:0, cargo:23, wear:0.00027},
  {id:'b763f', name:'Boeing 767-300F', maker:'Boeing', cat:'Cargo',
   seats:0, range:6000, speed:860, price:55e6, fuel:4.60, crew:1700, maint:1400,
   feeW:1.70, turn:1.30, belly:0, cargo:52, wear:0.00023},
  {id:'b77f', name:'Boeing 777F', maker:'Boeing', cat:'Cargo',
   seats:0, range:9200, speed:890, price:120e6, fuel:7.20, crew:2600, maint:2100,
   feeW:2.30, turn:1.50, belly:0, cargo:102, wear:0.00020}
];
/* Décomposition des coûts d'équipage et de maintenance en une part fixe
   (payée même au sol : salaires, visites programmées) et une part horaire. */
AIRCRAFT.forEach(t => {
  t.crewFix  = Math.round(t.crew  * 200);   // salaires mensuels des équipages
  t.crewH    = Math.round(t.crew  * 0.52);  // primes et heures de vol
  t.maintFix = Math.round(t.maint * 105);   // maintenance programmée, provisions
  t.maintH   = Math.round(t.maint * 0.74);  // maintenance en ligne
});

const AC_BY_ID = {};
AIRCRAFT.forEach(a => AC_BY_ID[a.id] = a);

/* ------------------------------- concurrents ------------------------------ */
const RIVAL_DEFS = [
  {name:'Aurora Atlantic', short:'AUR', color:'#b0553f', home:'JFK', regions:['NA','EU','SA'],
   cash:900e6, rep:74, priceMult:1.06, aggro:1.00, style:'Réseau transatlantique premium'},
  {name:'Meridian Airways', short:'MRD', color:'#7a5aa0', home:'FRA', regions:['EU','AS','AF'],
   cash:850e6, rep:76, priceMult:1.10, aggro:0.92, style:'Alliance européenne historique'},
  {name:'Zephyr Pacific', short:'ZPH', color:'#2e7d6f', home:'SIN', regions:['AS','OC','ME'],
   cash:800e6, rep:79, priceMult:1.08, aggro:1.05, style:'Hub asiatique, service haut de gamme'},
  {name:'Sahara Wings', short:'SHW', color:'#b8862c', home:'DXB', regions:['ME','AF','AS','EU'],
   cash:1100e6, rep:72, priceMult:0.98, aggro:1.18, style:'Expansion agressive depuis le Golfe'},
  {name:'Volare Express', short:'VLR', color:'#4a7fb5', home:'BCN', regions:['EU','AF'],
   cash:520e6, rep:58, priceMult:0.78, aggro:1.25, style:'Low-cost, tarifs cassés'}
];

/* ------------------------------- événements ------------------------------- */
const EVENT_DEFS = [
  {id:'fuel', title:'Flambée du kérosène',
   text:'Une tension géopolitique fait bondir le baril. Le carburant coûte 45 % plus cher.',
   days:110, apply:s => s.mods.fuel = 1.45},
  {id:'fuelDown', title:'Détente sur le pétrole',
   text:'Les cours du brut s’effondrent : le carburant coûte 25 % de moins.',
   days:90, apply:s => s.mods.fuel = 0.75},
  {id:'recession', title:'Récession mondiale',
   text:'Le trafic affaires s’effondre, la demande recule de 22 % partout.',
   days:150, apply:s => s.mods.demand = 0.78},
  {id:'boom', title:'Reprise économique',
   text:'Les carnets de réservation explosent : +20 % de demande mondiale.',
   days:120, apply:s => s.mods.demand = 1.20},
  {id:'strike', title:'Grève des contrôleurs aériens', regional:true,
   text:'Le trafic est fortement perturbé dans la région concernée.',
   days:18, apply:(s,r) => { s.mods.region = r; s.mods.regionMult = 0.55; }},
  {id:'storm', title:'Tempête majeure', cityBound:true,
   text:'L’aéroport est fermé, tous les vols qui y touchent sont annulés.',
   days:3, apply:(s,r,c) => s.mods.closed = c},
  {id:'tourism', title:'Destination virale', cityBound:true,
   text:'La ville devient la destination du moment : demande locale doublée.',
   days:75, apply:(s,r,c) => { s.mods.hotCity = c; s.mods.hotMult = 2.0; }},
  {id:'airshow', title:'Salon aéronautique',
   text:'Les constructeurs bradent leurs stocks : −18 % sur les avions neufs.',
   days:35, apply:s => s.mods.acPrice = 0.82},
  {id:'taxes', title:'Nouvelle écotaxe',
   text:'Les redevances aéroportuaires augmentent de 30 % pendant un an.',
   days:330, apply:s => s.mods.fees = 1.30}
];

/* ------------------------------- utilitaires ------------------------------ */
const MONTHS = ['janvier','février','mars','avril','mai','juin',
                'juillet','août','septembre','octobre','novembre','décembre'];

function money(v, dec) {
  const a = Math.abs(v), sign = v < 0 ? '−' : '';
  if (a >= 1e9) return sign + (a/1e9).toFixed(dec === undefined ? 2 : dec) + ' Md€';
  if (a >= 1e6) return sign + (a/1e6).toFixed(a >= 100e6 ? 0 : 1) + ' M€';
  if (a >= 1e3) return sign + Math.round(a/1e3) + ' k€';
  return sign + Math.round(a) + ' €';
}
function moneySigned(v) { return (v > 0 ? '+' : '') + money(v); }
function num(v) { return Math.round(v).toLocaleString('fr-FR'); }
function pct(v, d) { return (v*100).toFixed(d === undefined ? 0 : d) + ' %'; }

/* ------------------- nomenclature des postes comptables ------------------ */
const REV_LINES = [
  ['revEco',     'Billets économie',        '#2f6fa8'],
  ['revBiz',     'Billets affaires',        '#1f4e79'],
  ['revFirst',   'Billets première',        '#0f2f4d'],
  ['revConnect', 'Correspondances',         '#5b8fc4'],
  ['revCargo',   'Fret',                    '#a67c1a']
];
const COST_GROUPS = [
  {label:'Exploitation des vols', color:'#a63a2b', lines:[
    ['fuel',     'Carburant'],
    ['crewH',    'Heures de vol équipages'],
    ['maintH',   'Maintenance en ligne'],
    ['atc',      'Navigation aérienne'],
    ['landing',  'Redevances d’atterrissage'],
    ['ground',   'Assistance en escale']
  ]},
  {label:'Service aux passagers', color:'#c2703a', lines:[
    ['catering', 'Restauration et service'],
    ['distrib',  'Distribution et commissions']
  ]},
  {label:'Charges de flotte (passives)', color:'#8a6a3a', lines:[
    ['crewFix',   'Salaires des équipages'],
    ['maintFix',  'Maintenance programmée'],
    ['insurance', 'Assurance'],
    ['parking',   'Stationnement et hangar'],
    ['training',  'Formation et qualifications'],
    ['admin',     'Informatique et administration'],
    ['overhaul',  'Grandes visites']
  ]},
  {label:'Structure et financement', color:'#6a5a8a', lines:[
    ['hq',        'Siège et direction'],
    ['marketing', 'Marketing'],
    ['slots',     'Redevances de créneaux'],
    ['interest',  'Échéances d’emprunt']
  ]}
];
const LEDGER_KEYS = ['fuel','crewH','maintH','atc','landing','ground','catering','distrib',
  'crewFix','maintFix','insurance','parking','training','admin','overhaul',
  'hq','marketing','slots','interest'];

/* =========================================================================
   Améliorations d'appareil (rétrofits) et programmes de compagnie.
   Les gains chiffrés sont calqués sur les ordres de grandeur du secteur.
   ========================================================================= */
const AC_MODS = [
  {id:'winglets', name:'Dispositifs de bout d’aile',
   desc:'Ailettes en bout de voilure : moins de traînée induite, surtout sur les longues étapes.',
   rate:0.030, fuel:-0.040},
  {id:'engine',   name:'Rétrofit moteurs',
   desc:'Aubes redessinées et lavage à l’eau programmé. Gain de consommation, entretien un peu plus lourd.',
   rate:0.055, fuel:-0.035, maint:0.06},
  {id:'sensors',  name:'Maintenance prédictive',
   desc:'Capteurs embarqués et suivi des paramètres moteur : l’usure se creuse nettement moins vite.',
   rate:0.030, wear:-0.30},
  {id:'light',    name:'Allègement cabine',
   desc:'Sièges et galleys allégés, peinture fine. Quelques centaines de kilos en moins à chaque vol.',
   rate:0.022, fuel:-0.018, wear:-0.05},
  {id:'cabin',    name:'Rénovation de cabine',
   desc:'Sièges neufs, éclairage d’ambiance, coffres agrandis. Les passagers acceptent un tarif plus élevé.',
   rate:0.050, rep:2.6, fare:0.055},
  {id:'wifi',     name:'Connectivité à bord',
   desc:'Antenne satellite et divertissement en vol. Très apprécié sur les liaisons d’affaires.',
   rate:0.020, rep:1.5, fare:0.030}
];
const MOD_BY_ID = {};
AC_MODS.forEach(m => MOD_BY_ID[m.id] = m);
/* Le coût d'un rétrofit suit le prix de l'appareil : un gros-porteur coûte
   plus cher à modifier qu'un régional. */
function modCost(type, mod) { return Math.round(type.price * mod.rate); }

const PROGRAMS = [
  {id:'mro',   name:'Atelier de maintenance intégré', cost:145e6,
   desc:'Vos propres hangars et vos propres mécaniciens : les grandes visites coûtent 25 % de moins ' +
        'et immobilisent l’appareil trois jours de moins.'},
  {id:'auto',  name:'Planification automatique des révisions', cost:38e6,
   desc:'Un appareil qui dépasse le seuil d’usure part en révision de lui-même, dès que la trésorerie ' +
        'le permet, et retrouve sa ligne au retour. Fini les immobilisations subies.'},
  {id:'school',name:'École de formation interne', cost:98e6,
   desc:'Vous formez vos équipages au lieu de les débaucher : 15 % sur les salaires et la totalité ' +
        'du budget formation en moins, chaque mois, sur toute la flotte.'},
  {id:'hedge', name:'Couverture carburant', cost:76e6,
   desc:'Achats à terme de kérosène : les crises pétrolières ne vous frappent plus qu’à moitié.'}
];
const PROGRAM_BY_ID = {};
PROGRAMS.forEach(p => PROGRAM_BY_ID[p.id] = p);

/* =========================================================================
   Niveaux de difficulté. Chaque réglage agit sur le départ, la rareté des
   créneaux, l'agressivité des concurrents et les conditions de victoire.
   ========================================================================= */
const DIFFICULTIES = {
  facile: {
    id:'facile', name:'Facile', cash:150e6,
    slotPrice:1.0, slotCap:1.00, aggro:0.65, repGate:0, goal:1e9, profitYears:2, minRep:52,
    desc:'Trésorerie confortable, aéroports peu disputés, concurrents placides. ' +
         'Le milliard d’euros se joue en quelques années.'
  },
  normal: {
    id:'normal', name:'Normal', cash:130e6,
    slotPrice:1.18, slotCap:0.86, aggro:1.0, repGate:0.92, goal:3e9, profitYears:3, minRep:56,
    desc:'Les grands aéroports saturent et coûtent cher, les concurrents ripostent ' +
         'quand vous les attaquez, et les portes des hubs internationaux ne s’ouvrent ' +
         'qu’aux compagnies réputées.'
  },
  difficile: {
    id:'difficile', name:'Difficile', cash:105e6,
    slotPrice:1.42, slotCap:0.72, aggro:1.5, repGate:1.05, goal:8e9, profitYears:3, minRep:62,
    desc:'Départ à l’étroit, créneaux rares et chers, concurrents qui cassent les prix ' +
         'sur vos meilleures lignes. Dix milliards d’euros, la première place mondiale, ' +
         'un réseau sur tous les continents et des comptes durablement dans le vert.'
  },
  creatif: {
    id:'creatif', name:'Créatif', sandbox:true, cash:5e9,
    slotPrice:1.0, slotCap:1.00, aggro:0.5, repGate:0, goal:5e9, profitYears:1, minRep:0,
    desc:'Bac à sable : trésorerie inépuisable, créneaux ouverts partout, ' +
         'aucune faillite et aucun objectif. Pour essayer librement toutes les fonctions du jeu.'
  }
};
const DIFF_ORDER = ['facile', 'normal', 'difficile', 'creatif'];
const REGION_ALL = ['EU', 'ME', 'AF', 'AS', 'OC', 'NA', 'SA'];
