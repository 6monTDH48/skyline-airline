/* =========================================================================
   data-world.js — les villes desservies. Le trait de côte est dans data-land.js.
   ========================================================================= */

/* -------------------------------------------------------------------------
   Villes. Champs :
   code  : code IATA
   size  : poids de marché (0.15 → 1.0)
   biz   : intensité affaires (0 → 1)     tour : intensité tourisme (0 → 1)
   slots : créneaux totaux de l'aéroport   fee : redevance de base (€/mouvement)
   ------------------------------------------------------------------------- */
const CITIES = [
  // ---- Europe ----
  {code:'LHR',name:'Londres',country:'Royaume-Uni',region:'EU',lat:51.47,lon:-0.45,size:1.00,biz:0.95,tour:0.80,slots:78,fee:2400},
  {code:'CDG',name:'Paris',country:'France',region:'EU',lat:49.01,lon:2.55,size:0.88,biz:0.85,tour:0.95,slots:74,fee:2100},
  {code:'FRA',name:'Francfort',country:'Allemagne',region:'EU',lat:50.03,lon:8.56,size:0.82,biz:0.92,tour:0.40,slots:70,fee:2050},
  {code:'AMS',name:'Amsterdam',country:'Pays-Bas',region:'EU',lat:52.31,lon:4.76,size:0.80,biz:0.82,tour:0.72,slots:68,fee:1950},
  {code:'MAD',name:'Madrid',country:'Espagne',region:'EU',lat:40.47,lon:-3.56,size:0.66,biz:0.68,tour:0.78,slots:62,fee:1550},
  {code:'BCN',name:'Barcelone',country:'Espagne',region:'EU',lat:41.30,lon:2.08,size:0.60,biz:0.55,tour:0.95,slots:56,fee:1450},
  {code:'FCO',name:'Rome',country:'Italie',region:'EU',lat:41.80,lon:12.25,size:0.62,biz:0.58,tour:0.92,slots:58,fee:1500},
  {code:'MXP',name:'Milan',country:'Italie',region:'EU',lat:45.63,lon:8.72,size:0.54,biz:0.80,tour:0.55,slots:52,fee:1500},
  {code:'MUC',name:'Munich',country:'Allemagne',region:'EU',lat:48.35,lon:11.79,size:0.60,biz:0.82,tour:0.55,slots:58,fee:1700},
  {code:'ZRH',name:'Zurich',country:'Suisse',region:'EU',lat:47.46,lon:8.55,size:0.46,biz:0.95,tour:0.50,slots:46,fee:2300},
  {code:'VIE',name:'Vienne',country:'Autriche',region:'EU',lat:48.11,lon:16.57,size:0.44,biz:0.72,tour:0.62,slots:46,fee:1500},
  {code:'CPH',name:'Copenhague',country:'Danemark',region:'EU',lat:55.62,lon:12.65,size:0.42,biz:0.75,tour:0.55,slots:44,fee:1600},
  {code:'ARN',name:'Stockholm',country:'Suède',region:'EU',lat:59.65,lon:17.92,size:0.38,biz:0.72,tour:0.45,slots:42,fee:1550},
  {code:'OSL',name:'Oslo',country:'Norvège',region:'EU',lat:60.19,lon:11.10,size:0.34,biz:0.70,tour:0.42,slots:40,fee:1700},
  {code:'HEL',name:'Helsinki',country:'Finlande',region:'EU',lat:60.32,lon:24.96,size:0.30,biz:0.65,tour:0.38,slots:38,fee:1450},
  {code:'WAW',name:'Varsovie',country:'Pologne',region:'EU',lat:52.17,lon:20.97,size:0.38,biz:0.58,tour:0.42,slots:42,fee:1150},
  {code:'SVO',name:'Moscou',country:'Russie',region:'EU',lat:55.97,lon:37.41,size:0.58,biz:0.68,tour:0.40,slots:56,fee:1250},
  {code:'IST',name:'Istanbul',country:'Turquie',region:'EU',lat:41.26,lon:28.74,size:0.80,biz:0.70,tour:0.82,slots:72,fee:1350},
  {code:'ATH',name:'Athènes',country:'Grèce',region:'EU',lat:37.94,lon:23.94,size:0.36,biz:0.42,tour:0.92,slots:40,fee:1250},
  {code:'LIS',name:'Lisbonne',country:'Portugal',region:'EU',lat:38.77,lon:-9.13,size:0.36,biz:0.48,tour:0.85,slots:40,fee:1250},
  {code:'DUB',name:'Dublin',country:'Irlande',region:'EU',lat:53.42,lon:-6.27,size:0.36,biz:0.62,tour:0.60,slots:42,fee:1300},

  // ---- Moyen-Orient & Afrique ----
  {code:'DXB',name:'Dubaï',country:'Émirats',region:'ME',lat:25.25,lon:55.36,size:0.90,biz:0.88,tour:0.85,slots:74,fee:1900},
  {code:'DOH',name:'Doha',country:'Qatar',region:'ME',lat:25.27,lon:51.61,size:0.56,biz:0.82,tour:0.52,slots:54,fee:1750},
  {code:'TLV',name:'Tel Aviv',country:'Israël',region:'ME',lat:32.01,lon:34.89,size:0.38,biz:0.72,tour:0.58,slots:40,fee:1600},
  {code:'CAI',name:'Le Caire',country:'Égypte',region:'AF',lat:30.11,lon:31.41,size:0.52,biz:0.48,tour:0.80,slots:48,fee:1050},
  {code:'CMN',name:'Casablanca',country:'Maroc',region:'AF',lat:33.37,lon:-7.59,size:0.32,biz:0.50,tour:0.62,slots:38,fee:950},
  {code:'LOS',name:'Lagos',country:'Nigeria',region:'AF',lat:6.58,lon:3.32,size:0.42,biz:0.55,tour:0.20,slots:36,fee:1100},
  {code:'ADD',name:'Addis-Abeba',country:'Éthiopie',region:'AF',lat:8.98,lon:38.80,size:0.32,biz:0.45,tour:0.30,slots:36,fee:900},
  {code:'NBO',name:'Nairobi',country:'Kenya',region:'AF',lat:-1.32,lon:36.93,size:0.30,biz:0.48,tour:0.62,slots:34,fee:1000},
  {code:'JNB',name:'Johannesburg',country:'Afrique du Sud',region:'AF',lat:-26.13,lon:28.24,size:0.46,biz:0.62,tour:0.45,slots:44,fee:1150},
  {code:'CPT',name:'Le Cap',country:'Afrique du Sud',region:'AF',lat:-33.97,lon:18.60,size:0.30,biz:0.38,tour:0.88,slots:34,fee:1050},

  // ---- Asie ----
  {code:'DEL',name:'Delhi',country:'Inde',region:'AS',lat:28.56,lon:77.10,size:0.82,biz:0.72,tour:0.55,slots:66,fee:1050},
  {code:'BOM',name:'Mumbai',country:'Inde',region:'AS',lat:19.09,lon:72.87,size:0.74,biz:0.78,tour:0.45,slots:58,fee:1100},
  {code:'BKK',name:'Bangkok',country:'Thaïlande',region:'AS',lat:13.69,lon:100.75,size:0.72,biz:0.58,tour:0.95,slots:62,fee:1150},
  {code:'SIN',name:'Singapour',country:'Singapour',region:'AS',lat:1.36,lon:103.99,size:0.76,biz:0.92,tour:0.72,slots:64,fee:1850},
  {code:'KUL',name:'Kuala Lumpur',country:'Malaisie',region:'AS',lat:2.75,lon:101.71,size:0.52,biz:0.62,tour:0.65,slots:50,fee:1150},
  {code:'HKG',name:'Hong Kong',country:'Hong Kong',region:'AS',lat:22.31,lon:113.91,size:0.76,biz:0.90,tour:0.65,slots:62,fee:1800},
  {code:'PVG',name:'Shanghai',country:'Chine',region:'AS',lat:31.14,lon:121.81,size:0.94,biz:0.88,tour:0.55,slots:76,fee:1400},
  {code:'PEK',name:'Pékin',country:'Chine',region:'AS',lat:40.08,lon:116.58,size:0.92,biz:0.85,tour:0.62,slots:74,fee:1400},
  {code:'CAN',name:'Canton',country:'Chine',region:'AS',lat:23.39,lon:113.30,size:0.72,biz:0.78,tour:0.40,slots:62,fee:1300},
  {code:'ICN',name:'Séoul',country:'Corée du Sud',region:'AS',lat:37.46,lon:126.44,size:0.72,biz:0.82,tour:0.60,slots:62,fee:1500},
  {code:'NRT',name:'Tokyo',country:'Japon',region:'AS',lat:35.76,lon:140.39,size:0.90,biz:0.92,tour:0.75,slots:70,fee:2200},
  {code:'TPE',name:'Taipei',country:'Taïwan',region:'AS',lat:25.08,lon:121.23,size:0.50,biz:0.72,tour:0.50,slots:48,fee:1400},
  {code:'MNL',name:'Manille',country:'Philippines',region:'AS',lat:14.51,lon:121.02,size:0.56,biz:0.52,tour:0.58,slots:48,fee:1050},
  {code:'CGK',name:'Jakarta',country:'Indonésie',region:'AS',lat:-6.13,lon:106.66,size:0.62,biz:0.58,tour:0.48,slots:54,fee:1050},
  {code:'SGN',name:'Hô Chi Minh',country:'Viêt Nam',region:'AS',lat:10.82,lon:106.66,size:0.44,biz:0.55,tour:0.62,slots:44,fee:950},

  // ---- Océanie ----
  {code:'SYD',name:'Sydney',country:'Australie',region:'OC',lat:-33.94,lon:151.18,size:0.60,biz:0.75,tour:0.80,slots:54,fee:1900},
  {code:'MEL',name:'Melbourne',country:'Australie',region:'OC',lat:-37.67,lon:144.84,size:0.48,biz:0.68,tour:0.58,slots:46,fee:1800},
  {code:'BNE',name:'Brisbane',country:'Australie',region:'OC',lat:-27.38,lon:153.12,size:0.32,biz:0.52,tour:0.65,slots:36,fee:1700},
  {code:'PER',name:'Perth',country:'Australie',region:'OC',lat:-31.94,lon:115.97,size:0.26,biz:0.55,tour:0.45,slots:32,fee:1750},
  {code:'AKL',name:'Auckland',country:'Nouvelle-Zélande',region:'OC',lat:-37.01,lon:174.79,size:0.30,biz:0.50,tour:0.75,slots:34,fee:1650},

  // ---- Amérique du Nord ----
  {code:'JFK',name:'New York',country:'États-Unis',region:'NA',lat:40.64,lon:-73.78,size:1.00,biz:0.98,tour:0.88,slots:76,fee:2500},
  {code:'LAX',name:'Los Angeles',country:'États-Unis',region:'NA',lat:33.94,lon:-118.41,size:0.88,biz:0.80,tour:0.85,slots:70,fee:2200},
  {code:'ORD',name:'Chicago',country:'États-Unis',region:'NA',lat:41.98,lon:-87.90,size:0.80,biz:0.85,tour:0.50,slots:74,fee:2000},
  {code:'ATL',name:'Atlanta',country:'États-Unis',region:'NA',lat:33.64,lon:-84.43,size:0.78,biz:0.78,tour:0.40,slots:78,fee:1750},
  {code:'DFW',name:'Dallas',country:'États-Unis',region:'NA',lat:32.90,lon:-97.04,size:0.70,biz:0.80,tour:0.35,slots:70,fee:1700},
  {code:'DEN',name:'Denver',country:'États-Unis',region:'NA',lat:39.86,lon:-104.67,size:0.58,biz:0.62,tour:0.55,slots:64,fee:1600},
  {code:'SFO',name:'San Francisco',country:'États-Unis',region:'NA',lat:37.62,lon:-122.38,size:0.62,biz:0.92,tour:0.70,slots:56,fee:2300},
  {code:'SEA',name:'Seattle',country:'États-Unis',region:'NA',lat:47.45,lon:-122.31,size:0.52,biz:0.72,tour:0.52,slots:50,fee:1900},
  {code:'MIA',name:'Miami',country:'États-Unis',region:'NA',lat:25.79,lon:-80.29,size:0.62,biz:0.62,tour:0.90,slots:56,fee:1850},
  {code:'BOS',name:'Boston',country:'États-Unis',region:'NA',lat:42.36,lon:-71.01,size:0.50,biz:0.82,tour:0.55,slots:48,fee:2000},
  {code:'YYZ',name:'Toronto',country:'Canada',region:'NA',lat:43.68,lon:-79.63,size:0.56,biz:0.72,tour:0.50,slots:54,fee:1700},
  {code:'YVR',name:'Vancouver',country:'Canada',region:'NA',lat:49.19,lon:-123.18,size:0.38,biz:0.58,tour:0.68,slots:42,fee:1650},
  {code:'MEX',name:'Mexico',country:'Mexique',region:'NA',lat:19.44,lon:-99.07,size:0.62,biz:0.62,tour:0.62,slots:52,fee:1200},
  {code:'CUN',name:'Cancún',country:'Mexique',region:'NA',lat:21.04,lon:-86.87,size:0.30,biz:0.18,tour:1.00,slots:36,fee:1050},

  // ---- Amérique du Sud ----
  {code:'GRU',name:'São Paulo',country:'Brésil',region:'SA',lat:-23.43,lon:-46.47,size:0.64,biz:0.78,tour:0.42,slots:56,fee:1350},
  {code:'GIG',name:'Rio de Janeiro',country:'Brésil',region:'SA',lat:-22.81,lon:-43.25,size:0.40,biz:0.48,tour:0.90,slots:42,fee:1300},
  {code:'EZE',name:'Buenos Aires',country:'Argentine',region:'SA',lat:-34.82,lon:-58.54,size:0.44,biz:0.60,tour:0.62,slots:44,fee:1200},
  {code:'SCL',name:'Santiago',country:'Chili',region:'SA',lat:-33.39,lon:-70.79,size:0.34,biz:0.58,tour:0.52,slots:38,fee:1200},
  {code:'LIM',name:'Lima',country:'Pérou',region:'SA',lat:-12.02,lon:-77.11,size:0.34,biz:0.48,tour:0.68,slots:38,fee:1150},
  {code:'BOG',name:'Bogotá',country:'Colombie',region:'SA',lat:4.70,lon:-74.15,size:0.38,biz:0.52,tour:0.45,slots:40,fee:1100}
];

const CITY_BY_CODE = {};
CITIES.forEach((c, i) => { c.idx = i; CITY_BY_CODE[c.code] = c; });

const REGION_NAMES = {
  EU:'Europe', NA:'Amérique du Nord', SA:'Amérique du Sud',
  AF:'Afrique', ME:'Moyen-Orient', AS:'Asie', OC:'Océanie'
};
