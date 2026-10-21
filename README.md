# Auto Self Garage — ERP 3D

Gestionnaire clients / véhicules / places / commandes / mécanos pour Auto Self Garage (SARL RCA, rue du Moulin de la Rousselière, Saint-Herblain), avec le site reconstruit en 3D (cel-shading).

```
npm start          # http://garage.localhost:4180 (simple serveur de fichiers)
npm run site       # régénère public/site.json depuis data/osm.json
```

**Sans serveur** : `public/` est un site statique. Toute la logique est dans `public/store.js`, et les données (partie, photos, modèles .glb) sont gardées dans le navigateur, dans IndexedDB. L'appli marche hors ligne grâce au service worker et s'installe sur l'écran d'accueil du téléphone. N'importe quel hébergement statique convient (GitHub Pages, Netlify…). Pour l'ouvrir depuis un téléphone du même réseau : `GARAGE_HOST=0.0.0.0 npm start`, puis http://IP-du-PC:4180. Attention, sans HTTPS le service worker ne s'active que sur localhost.

**Partie** : au premier lancement, une partie de base est chargée (clients, voitures, mécanos, commandes, stock ; voir `public/data/seed.js`). Le bouton ⚙ permet d'exporter ou d'importer la partie en fichier JSON, ou de lancer une nouvelle partie. `data/ancienne-base.json` contient les données de l'ancienne version avec serveur, à importer si besoin.

## Utilisation

- **Nouvelle arrivée** : clic sur le client qui attend devant la porte, ou bouton du dock. Le formulaire avance question par question : plaque, marque et modèle, gabarit et couleur, client (recherche, ou création sur place), renseignement, puis place.
- **Plaque** : il n'existe pas d'API SIV publique gratuite. On remplit donc hors ligne : le format, l'historique du garage (véhicule déjà venu, avec son client) et l'année estimée d'après la série SIV. 
- **Mémoire des plaques** : une plaque garde une seule fiche. Rendre la voiture archive le passage (motif, travaux, total, pièces, paiement). Une nouvelle arrivée avec la même plaque rouvre la fiche et rappelle tout l’historique.
- **Paiement** : non payé, acompte ou payé, avec le mode de paiement. L’indicateur 💶 liste ce qui reste à encaisser. Les commandes fournisseur ont aussi leur statut payé ou non.
- **Réserve** (clic sur la réserve dans la 3D, ou 🗄) : inventaire en cases façon jeu vidéo. Chaque article a une icône procédurale ou une photo, et un seuil d’alerte. « Poser sur une voiture » sort la pièce du stock et l’ajoute aux interventions de la voiture choisie dans la 3D.
- **Places** : l’allée (deux files) et le parking devant Ocaburo. Il n’y a pas de parking arrière.
- **Performance** : objets fixes fusionnés, rendu à la demande, qualité basse automatique sur téléphone (bouton Qualité, ou ?q=low / ?q=high dans l’adresse).
- **Glisser-déposer** les voitures dans la 3D. Une place occupée déclenche un échange.
- **Fiche véhicule** (clic sur une voiture) : statut, mécano, place, journal de commentaires courts, interventions (grille tarifaire), pièces commandées, modèle 3D `.glb`.
- **Commandes** : commandée → arrivée (en réserve) → posée sur un véhicule, avec l'historique de chaque pièce.
- **Mécanos** : planning par jour. Les présents à l'heure courante se baladent dans l'atelier. Le bouton 🕒 simule une heure de journée.
- **Indicateurs** : voitures prêtes, pièces arrivées, mécanos au travail, café / savon / papier toilette (un clic change le niveau), places occupées.
- **CRM** : l'adresse du CRM du bureau se règle dans 🖥 CRM. L'écran du bureau dans la 3D l'ouvre aussi.

## Contenu

- `tools/build-site.js` : OpenStreetMap / cadastre vers repère local. Contient le plan intérieur (croquis), l'escalier, la mezzanine et les places.
- `public/store.js` : la logique métier (l'ancien serveur) et la persistance IndexedDB. `public/data/` : partie de base, recherche par plaque, catalogue des modèles.
- `public/sw.js`, `manifest.json` : hors ligne et installation. `server.js` : simple serveur de fichiers pour le développement.
- `public/world.js` : la scène. `public/cars.js` : les véhicules. `public/people.js` : les personnages. `public/toon.js` : le cel-shading et les contours.
- `public/app.js` : l'interface (modales et formulaires progressifs).

## Repères

Le garage est la partie SO (21 × 23 m) du bâtiment cadastré (21 × 48 m, toit à deux pans, NeoNett au fond). L'entrée se fait côté SE, sur l'allée. En entrant, à gauche : le bureau et les WC, avec l'escalier vers la salle de pause à l'étage, puis le demi-mur avec la machine à pneus. À droite : la réserve. Au fond : les 3 ponts, l'établi et la rangée de bidons d'huile.
