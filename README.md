# Skyline — simulateur de compagnie aérienne

Jeu de gestion 2D en temps réel : vous dirigez une compagnie aérienne mondiale, de deux
avions à la première place du classement. Tout tient dans une page web, sans dépendance
ni installation.

<sub>Réalisé par une IA (Claude), à partir des choix de conception de l'auteur.</sub>

![Le réseau mondial en vue de jour](docs/carte-jour.jpg)

## Jouer

Téléchargez le dépôt et **double-cliquez `index.html`**. C'est tout : pas de serveur,
pas de `npm install`, aucune connexion réseau. Le jeu tourne dans n'importe quel
navigateur récent et sauvegarde la partie dans le navigateur.

## Le principe

Vous dirigez une compagnie aérienne mondiale. Deux A320, une carte du monde avec
**151 vrais aéroports**, et cinq concurrents déjà installés.

La victoire demande **quatre conditions réunies en même temps** :

| Condition | Détail |
|---|---|
| Valeur d'entreprise | 1, 3 ou 8 Md€ selon la difficulté |
| Première place mondiale | transporter plus de passagers que chaque concurrent |
| Réseau mondial | desservir les sept régions du monde et exploiter trois hubs |
| Rentabilité durable | deux ou trois exercices bénéficiaires d'affilée, avec une réputation tenue |

La troisième oblige à sortir d'Europe : l'Océanie n'est atteignable qu'avec un hub en Asie
ou au Moyen-Orient. La quatrième interdit de gagner en brûlant la caisse.

## Difficulté

Trois niveaux de partie, plus un mode créatif, choisis au démarrage à côté de la base :

| | Facile | Normal | Difficile |
|---|---|---|---|
| Trésorerie de départ | 150 M€ | 130 M€ | 105 M€ |
| Objectif de valeur | 1 Md€ | 3 Md€ | 8 Md€ |
| Créneaux disponibles | 100 % | 86 % | 72 % |
| Prix des créneaux | ×1 | ×1,2 | ×1,4 |
| Agressivité des concurrents | faible | normale | forte |
| Réputation exigée par les grands aéroports | aucune | oui | oui, plus haute |

En normal et en difficile, les grandes plateformes n'accordent leurs créneaux qu'aux
compagnies d'une certaine réputation : Heathrow et JFK se méritent. Votre base d'attache
fait exception. Les concurrents, eux, cassent les prix et montent en fréquence sur les
lignes où vous prenez l'ascendant.

Le **mode créatif** est un bac à sable : la trésorerie se remplit toute seule, les créneaux
sont ouverts partout sans condition de réputation, il n'y a ni faillite ni victoire. C'est
le mode à choisir pour essayer librement les appareils, les hubs, les programmes et les
tarifs sans surveiller les comptes.

## Prise en main

1. **Ouvrez une ligne** — touche `N`, bouton du panneau Réseau, ou depuis la fiche d'une ville.
2. L'**assistant** chiffre tout : créneaux à acheter, appareil conseillé, résultat attendu.
3. Un seul bouton achète les créneaux et l'avion, ouvre la ligne, l'affecte et la règle.
4. Ajustez ensuite le **tarif** et la **fréquence** dans la fiche de ligne.
5. Les comptes tombent en fin de mois.

## L'assistant de ligne

Ouvrir une ligne, c'est en réalité trois achats et deux réglages. L'assistant les rassemble
dans une seule vue, et ne dépense rien avant que vous ne validiez :

| Ce qu'il montre | Détail |
|---|---|
| Les deux escales | choisies au clic sur la carte, par la recherche, ou dans la liste des marchés porteurs |
| Ce que pèse la liaison | distance, demande quotidienne, compagnies déjà présentes et leurs fréquences |
| Quel avion y mettre | tout le catalogue capable de tenir la distance, **classé par retour sur investissement**, chacun avec le résultat quotidien qu'il dégagerait une fois bien réglé |
| Le devis | créneaux à acheter escale par escale (ceux que vous détenez déjà sont déduits), appareils à commander (ceux qui dorment en flotte sont repris), total et trésorerie restante |
| Le résultat attendu | résultat quotidien net, passagers, remplissage, tarif et fréquence qui seront appliqués, délai de remboursement |

Le classement suit le retour sur investissement plutôt que le résultat brut : un gros porteur
gagne toujours davantage en valeur absolue, mais immobilise un capital que la trésorerie n'a
pas. Sur Paris–Londres, un A220 se rembourse en 600 jours quand un 787 en demande 1 300.

Si la liaison dépasse l'autonomie de tout le catalogue — Paris–Sydney fait 16 944 km pour
16 000 km au mieux — l'assistant propose les escales qui la coupent en deux vols, en
préférant vos hubs et les aéroports où vous détenez déjà des créneaux.

Le flux à la carte reste disponible : « …ou désigner la destination sur la carte » depuis la
fiche d'une ville, puis un clic sur la ville d'arrivée ouvre l'assistant sur cette paire.

Raccourcis : `Espace` pause · `1` `2` `3` `4` vitesses ×1 ×2 ×4 ×8 · molette pour zoomer ·
glisser pour déplacer la carte. `/` ou `G` ouvre la **recherche rapide** : une ville par son
nom, son code IATA ou son pays, une de vos lignes par l'une de ses escales ; Entrée l'ouvre
et l'amène au centre de la carte. Une lettre par panneau : `A` alertes, `R` réseau,
`F` flotte, `C` constructeurs, `E` finances, `S` statistiques, `K` concurrence,
`O` objectifs, `J` journal, `H` aide, `N` ouvrir une ligne. La **flèche** en haut du volet revient à la vue précédente
(le panneau Réseau après avoir ouvert une ligne, par exemple) ; `Échap` fait de même, puis
referme le volet.

## Savoir quoi faire ensuite

Le panneau **Alertes**, en tête de la barre d'outils, rassemble tout ce qui appelle une
décision, du plus urgent au plus accessoire — trésorerie à découvert, appareils cloués au
sol ou sans affectation, lignes sans avion, saturées, déficitaires ou trop vides, créneaux
payés et jamais utilisés, réglages qui laissent de l'argent sur la table. Chaque point
porte le bouton qui le règle : réviser tel appareil, ouvrir telle fiche, appliquer le
tarif conseillé. Une pastille sur les boutons Réseau, Flotte et Finances indique d'où
vient le problème et sa gravité.

Chaque fiche de ligne s'ouvre sur un **conseil** : le levier le plus rentable ici, chiffré
par une simulation à blanc de la journée d'exploitation — « à 92 % du prix de référence,
le résultat gagnerait 14 k€ par jour ». Le bouton **Conseillé** applique le tarif optimal,
comme **Conseillée** le fait pour la fréquence.

## La partie guidée

Une nouvelle partie s'ouvre sur une proposition : **huit étapes** pour ouvrir sa première
ligne, lire ses comptes et savoir où regarder ensuite. Le guide ne joue pas à votre place et
ne bloque rien — il dit quoi faire, entoure l'élément à cliquer, et passe à la suite dès que
c'est fait. On le refuse d'un clic, on l'abandonne à tout moment, on le relance depuis le
panneau **Aide**. Une partie sauvegardée en cours de guide le reprend où il en était.

## Paliers de compagnie

Entre la première ligne et la première place mondiale il se passe des années. Sept paliers
nommés jalonnent le chemin :

| Palier | Ce qu'il demande |
|---|---|
| Compagnie locale | une ligne en service, un appareil en ligne |
| Compagnie régionale | 4 lignes, 4 appareils, réputation 60 |
| Transporteur national | 9 lignes, 2 hubs, 10 appareils |
| Compagnie continentale | 3 régions, 18 appareils, 400 M€ de valeur |
| Compagnie intercontinentale | 5 régions, 3 hubs, 28 appareils |
| Grand réseau mondial | les 7 régions, 1 Md€ de valeur, 25 000 passagers/jour |
| Première compagnie mondiale | plus aucun concurrent devant vous |

Ils ne rapportent rien : ils nomment où vous en êtes et disent ce qui manque pour le suivant,
condition par condition, dans le panneau **Objectifs**. Un palier franchi est annoncé et noté
au journal.

## Le fil de la partie

À chaque clôture, un **bilan mensuel** met la partie en pause : le résultat et son écart avec
le mois précédent, recettes, coûts, trésorerie, passagers, valeur, réputation et part de
marché ; les lignes qui ont porté le mois et celles qui ont coûté, avec leur cumul mensuel ;
les événements en cours ; les nouvelles marquantes ; et le classement mondial, vous compris.

Une nouvelle qui appelle une décision — crise du kérosène, appareil cloué au sol, découvert —
arrête également la partie et s'affiche en clair, avec un raccourci vers les alertes. Les deux
comportements se règlent dans **Affichage → Déroulement**, et le bilan se coupe aussi d'une
case dans sa propre fenêtre, au moment où il lasse ; sans eux, le jeu se contente de
ralentir à ×2 pour que la nouvelle reste lisible.

Le **journal de bord** (touche `J`) garde tout le fil de la partie, groupé par date de jeu et
filtrable par rubrique : réseau, flotte, finances, concurrence, événements.

## Les trois leviers qui comptent

| Levier | Effet mesuré en jeu |
|---|---|
| **Tarif** | À 75 % du prix de référence le remplissage passe de 40 à 53 % ; à 145 % il tombe à 27 % |
| **Fréquence** | Passer de 14 à 8 vols/jour sur Paris–Londres fait monter le remplissage de 40 à 62 % et le résultat de 28 à 45 k€/jour |
| **Choix de l'appareil** | Un A220 bien calibré rapporte 67 k€/jour sur Paris–Londres, un A320 surdimensionné seulement 25 k€ |
| **Nombre d'appareils** | Rien ne limite le nombre d'avions sur une même ligne : chacun ajoute ses rotations. Il faut un créneau libre à chaque escale, par appareil |

Les boutons **Conseillée** et **Conseillé** de la fiche de ligne calculent la fréquence et le
tarif qui maximisent le résultat, compte tenu de la demande, de la concurrence et de tous
les coûts.

## Ce que simule le jeu

| Système | Détail |
|---|---|
| Demande | Par paire de villes : population, indices affaires/tourisme, distance, proximité géographique, saison |
| Concurrence | 5 compagnies IA qui ouvrent des lignes, montent en fréquence et cassent les prix sur vos meilleures routes — plus une concurrence de fond sur chaque liaison |
| Parts de marché | Réparties selon fréquence, tarif et réputation de chaque opérateur |
| Créneaux | Ressource rare : les aéroports saturent, les concurrents les prennent aussi, et les plus grands exigent de la réputation |
| Hubs | Jusqu'à 4. Redevances réduites et **correspondances** : vos lignes se nourrissent entre elles |
| Cabines | Éco / affaires / première — 3× et 6× le tarif, mais 2,4× et 4,6× la place |
| Fret | En soute sur les avions de ligne, ou avions tout-cargo (part de marché fondée sur le tonnage offert) |
| Usure | Chaque heure de vol use l'appareil : annulations au-delà de 55 %, immobilisation à 100 % |
| Finances | Emprunts à 6,8 % sur 60 mois, dépréciation, faillite après 45 jours de découvert |
| Événements | Rares : crise du kérosène, récession, grève régionale, tempête, destination virale, salon aéronautique |

## Lire la carte d'un coup d'œil

Chaque ligne prend la couleur de son état, réévalué chaque jour :

| Couleur | État | Ce qu'il faut faire |
|---|---|---|
| Bleu foncé | saine | rien |
| **Rouge** (avec halo pulsé) | **saturée** — remplissage ≥ 95 %, ou ≥ 88 % avec des passagers refusés | ajouter un appareil, monter en fréquence ou augmenter le tarif |
| Violet | déficitaire | revoir le tarif, l'appareil ou fermer |
| Bleu pâle | trop vide — moins de 50 % de remplissage | baisser la fréquence ou le tarif, ou mettre un appareil plus petit |
| Gris pointillé | sans avion, ou appareils cloués au sol | affecter un appareil |

Le panneau **Réseau** affiche les lignes sous leur **nom complet** (« Paris ↔ Londres »),
avec le code IATA et la distance en dessous, une étiquette d'état et une alerte en tête
quand des lignes saturent. Survoler une ligne du tableau la met en avant sur la carte.

Les étiquettes et les jauges du volet reprennent **exactement les couleurs du tableau
ci-dessus** : une ligne saturée porte le même rouge dans le volet que sur la carte, une
déficitaire le même violet. On passe de l'une à l'autre sans traduire.

Chaque liste — les lignes comme la flotte — se lit au choix **en tableau**, dense et trié,
ou **en cartes**, plus lisibles mais trois fois moins nombreuses à l'écran. Le commutateur
est en tête de liste.

## Agir sur plusieurs éléments à la fois

Les tableaux du panneau **Réseau** et du panneau **Flotte** se cochent, et une barre d'actions
apparaît en tête dès qu'une case est cochée :

| Sur les lignes | Sur les appareils |
|---|---|
| tarif conseillé · fréquence conseillée | envoyer en révision |
| tarif +5 % · tarif −5 % | retirer de leur ligne |
| fermer | vendre |

La case du haut coche tout. Chaque action dit ensuite ce qui a réellement abouti — une révision
peut manquer de trésorerie, une ligne peut n'avoir aucun appareil — plutôt que de laisser croire
que tout est passé. Fermer et vendre demandent confirmation et annoncent le montant en jeu.

Une alerte qui vise plusieurs appareils — « 3 appareils usés », « 2 appareils sans ligne » — les
coche d'avance : le geste à faire est alors à un clic.

Le panneau **Flotte** est une liste compacte : immatriculation, état, usure, affectation. Le
détail d'un appareil — cabine, rétrofits, affectation, revente — s'ouvre sur sa fiche, à un clic
sur sa ligne.

## Quand un aéroport est saturé

Les grandes plateformes finissent par n'avoir plus un créneau à vendre. Ce n'est plus une
impasse : la fiche de l'escale ouvre trois portes, de la moins chère à la plus chère.

| Voie | Prix | Délai | Ce qu'elle coûte |
|---|---|---|---|
| **Horaires creux** | moitié prix | immédiat | jusqu'à 45 % d'attractivité en moins sur les vols qui s'en servent |
| **Agrandissement** | 55 M€ + 240 M€ × taille | 8 à 18 mois | les créneaux livrés profitent aussi aux concurrents |
| **Rachat à une compagnie** | 3,5× le prix normal et plus | immédiat | réputation exigée, et la compagnie qui cède allège sa desserte |

Les horaires creux sont une réserve que personne ne se dispute — 40 % de la capacité — parce que
personne n'en veut vraiment : un départ à six heures du matin remplit moins bien. **Vos bons
créneaux servent d'abord** : un horaire creux acheté d'avance ne pénalise rien tant qu'aucun
appareil supplémentaire ne s'en sert. À Heathrow, un créneau normal coûte environ 6 M€, un
horaire creux 3 M€, un rachat 26 M€, et l'agrandissement 348 M€ pour neuf créneaux en dix-huit
mois.

Le rachat n'est pas une écriture comptable : la compagnie qui cède réduit vraiment sa fréquence
sur sa liaison la moins chargée depuis cet aéroport, et abandonne la ligne si elle tombe trop bas.
C'est ainsi que se gagnent Heathrow ou JFK, comme dans la réalité.

L'assistant de ligne renvoie directement vers ces trois voies quand une escale bloque le devis.

## Améliorations et programmes

Chaque appareil accepte six **rétrofits**, dont le prix suit sa taille :

| Rétrofit | Effet |
|---|---|
| Dispositifs de bout d'aile | −4 % de carburant |
| Rétrofit moteurs | −3,5 % de carburant, +6 % de maintenance |
| Maintenance prédictive | **−30 % d'usure** |
| Allègement cabine | −1,8 % de carburant, −5 % d'usure |
| Rénovation de cabine | +2,6 de réputation, +5,5 % de tolérance tarifaire |
| Connectivité à bord | +1,5 de réputation, +3 % de tolérance tarifaire |

Et quatre **programmes de compagnie**, achetés une fois, valables pour toute la flotte
présente et à venir :

- **Atelier de maintenance intégré** — révisions 25 % moins chères et trois jours plus courtes.
- **Planification automatique des révisions** — tout appareil qui dépasse le seuil d'usure part
  de lui-même à l'atelier, les plus usés d'abord, dans la limite de la capacité des hangars
  (un sixième de la flotte à la fois), et retrouve sa ligne au retour.
- **École de formation interne** — 15 % sur les salaires des équipages et budget formation
  supprimé, chaque mois, sur toute la flotte.
- **Couverture carburant** — les crises pétrolières ne frappent plus qu'à moitié.

## Comptabilité

Chaque euro dépensé est ventilé dans le panneau **Statistiques**, en quatre familles :

- **Exploitation des vols** — carburant, heures de vol des équipages, maintenance en ligne,
  redevances de navigation aérienne, redevances d'atterrissage, assistance en escale.
- **Service aux passagers** — restauration et service à bord, distribution et commissions
  (un pourcentage des recettes billets).
- **Charges de flotte, dites passives** — salaires des équipages, maintenance programmée,
  assurance, stationnement et hangar, formation, informatique, grandes visites.
  **Elles courent que l'avion vole ou non** : un appareil laissé au sol perd de l'argent
  tous les jours, et ces charges sont imputées à la ligne sur laquelle il est affecté.
- **Structure et financement** — siège, marketing, redevances de créneaux, échéances d'emprunt.

Le panneau donne aussi les ratios du métier : recette et coût au siège-kilomètre, recette
unitaire passager, coefficient de remplissage, recette et coût moyens par vol, utilisation
quotidienne de la flotte, et la part respective des coûts variables et passifs.

## Statistiques d'escale

La fiche de chaque aéroport affiche vos mouvements, passagers, fret, correspondances et
heures de vol quotidiennes, le résultat qui y est attribué, les redevances versées,
l'occupation détaillée des créneaux (les vôtres utilisés, les vôtres libres, ceux des
concurrents, ceux encore à vendre), votre part du marché local et les compagnies présentes.

## Affichage

L'interface est un **centre de contrôle** : fond ardoise, typographie technique, chiffres
tabulaires, codes IATA et immatriculations en chasse fixe. Le bandeau du haut aligne six
tuiles — trésorerie, résultat du mois avec la courbe des douze derniers, flotte, réputation,
part de marché, valeur contre objectif. Chacune porte un liseré de couleur : c'est ce qu'on
voit du coin de l'œil, sans lire le chiffre.

L'engrenage en bas à droite de la carte ouvre les réglages : **thème sombre**,
**cycle jour / nuit**, lignes des concurrents, traînées de condensation, halos de trafic,
noms de villes, grain du papier, **listes en cartes plutôt qu'en tableau**. Les choix sont
conservés d'une partie à l'autre.

Décocher le thème sombre rend l'**atlas de papier** : mêmes panneaux, mêmes jauges, mais
palette crème et bleu marine, et la carte repasse en vue de jour.

Le volet de droite se **redimensionne** : attrapez son bord gauche et tirez. Les tableaux
denses respirent, et la largeur est mémorisée.

![La même carte en vue de nuit](docs/carte-nuit.jpg)

## La carte

Le fond de carte vient de **Natural Earth au 1:10 m** : 1 055 anneaux de trait de côte,
347 segments de frontières internationales, 197 lacs et mers intérieures. Les frontières
sont extraites en ne gardant que les arcs partagés par deux pays, ce qui les distingue
proprement des côtes.

Trois projections sont disponibles dans les options d'affichage :

- **Robinson**, celle des atlas : proportions crédibles, carte en forme de globe aplati ;
- **Mercator**, celle des cartes en ligne : formes locales exactes, pôles démesurés ;
- **Plate carrée**, la plus simple et la plus rapide.

Les étiquettes des 151 aéroports sont placées sans chevauchement : chaque nom cherche une
place libre autour de son point, par ordre d'importance — vos escales et les grands
marchés d'abord. Ce qui ne rentre pas n'est pas affiché.

## Fichiers

```
index.html          interface et styles
js/data-land.js     fond de carte (Natural Earth 1:10 m : côtes, frontières, lacs)
js/data-world.js    les 151 aéroports desservis
js/data-game.js     équilibrage, avions, rétrofits, programmes, concurrents, événements, plan comptable
js/engine.js        moteur de simulation (demande, exploitation, IA, finances)
js/render.js        rendu de la carte : projections, couches, étiquettes
js/ui.js            panneaux et fiches
js/ui-stats.js      panneau Statistiques et fiche statistique d'escale
js/guide.js         la partie guidée : huit étapes, surbrillance, progression
js/main.js          boucle de jeu, entrées, sauvegarde
```

La partie est sauvegardée dans le `localStorage` du navigateur (bouton **Sauvegarder**,
plus une sauvegarde automatique toutes les 90 secondes).

## Réglages

Toutes les constantes d'équilibrage sont regroupées dans `BAL`, en haut de
`js/data-game.js` : durée d'une journée, tarifs de référence, échelle de la demande,
coûts variables, charges passives par appareil, seuils d'usure, conditions de victoire.

## Sous le capot

Aucune bibliothèque, aucun outil de compilation : du HTML, du CSS et du JavaScript
lisibles directement. La carte est dessinée sur un `<canvas>` — projection plate,
orthodromies échantillonnées, terminateur jour/nuit calculé à partir de la déclinaison
solaire, fond de carte mis en cache et niveau de détail adapté au zoom.

Le moteur de simulation est séparé du rendu et de l'interface : il tourne aussi bien
sans navigateur, ce qui a servi à mesurer l'équilibrage sur des parties de huit ans.

## Crédits

Le fond de carte provient de [Natural Earth](https://www.naturalearthdata.com/)
(échelle 1:10 m, domaine public), simplifié par l'algorithme de Douglas-Peucker.
Les coordonnées des aéroports viennent d'[OurAirports](https://ourairports.com/)
(domaine public).

Les caractéristiques des appareils, les redevances et les postes de charges sont
inspirés des ordres de grandeur du transport aérien, arrondis pour rester jouables.
