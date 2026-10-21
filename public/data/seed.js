// Jeu de donnees de demarrage (clients et mecanos fictifs) + grille tarifaire relevee sur les annuaires (allogarage.fr).
const HORAIRES = [['08:30', '12:30'], ['14:00', '18:45']]; // horaires d'ouverture du garage
const semaine = (jours, slots = HORAIRES) => Object.fromEntries(['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'].map((j) => [j, jours.includes(j) ? slots : []]));

export function seed() {
  const clients = [
    { id: 'cli_demo01', nom: 'Le Goff', prenom: 'Yann', tel: '06 12 34 56 78', email: '', adresse: 'Saint-Herblain', notes: 'Habitué du libre-service' },
    { id: 'cli_demo02', nom: 'Moreau', prenom: 'Claire', tel: '06 98 76 54 32', email: '', adresse: 'Couëron', notes: '' },
    { id: 'cli_demo03', nom: 'Batiloire', prenom: 'SARL', tel: '02 40 00 00 00', email: '', adresse: 'Orvault', notes: 'Flotte utilitaires' },
    { id: 'cli_demo04', nom: 'Nguyen', prenom: 'Minh', tel: '07 11 22 33 44', email: '', adresse: 'Nantes', notes: '' },
    { id: 'cli_demo05', nom: 'Rivière', prenom: 'Paul', tel: '06 55 44 33 22', email: '', adresse: 'Indre', notes: 'Rappeler avant 18h' },
  ];
  const d = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const v = (id, clientId, plaque, marque, modele, type, couleur, placeId, statut, interventions = [], extra = {}) =>
    ({ id, clientId, plaque, marque, modele, annee: '', type, couleur, km: '', vin: '', model3d: '', placeId, statut,
      motif: '', notes: '', entree: d(-2), sortiePrevue: d(2), interventions, journal: [], mecanoId: '', ...extra });
  const vehicles = [
    v('veh_demo01', 'cli_demo01', 'GA-123-BC', 'Renault', 'Clio IV', 'citadine', '#c0392b', 'P1', 'en_cours',
      [{ libelle: 'Location pont + servante 2 h', montant: 55, fait: false }], { motif: 'Vidange en libre-service' }),
    v('veh_demo02', 'cli_demo02', 'FD-456-KL', 'Peugeot', '508', 'berline', '#1f3a5f', 'P2', 'diagnostic',
      [{ libelle: 'Disques + plaquettes AV', montant: 65, fait: false }, { libelle: 'Main-d’œuvre T1 (1 h)', montant: 49.5, fait: false }],
      { motif: 'Bruit au freinage', mecanoId: 'mec_demo01' }),
    v('veh_demo03', 'cli_demo03', 'EZ-789-QR', 'Renault', 'Master', 'fourgon', '#f2f2f2', 'E2', 'attente_pieces',
      [{ libelle: 'Amortisseurs Mac Pherson (paire)', montant: 85, fait: false }], { motif: 'Amortisseurs AV HS', mecanoId: 'mec_demo02' }),
    v('veh_demo04', 'cli_demo03', 'FK-321-AA', 'Renault', 'Kangoo', 'utilitaire', '#e8e8e8', 'O2', 'attente', [], { motif: 'Révision' }),
    v('veh_demo05', 'cli_demo04', 'GH-654-ZT', 'Peugeot', '3008', 'suv', '#2d2d2d', 'O4', 'termine',
      [{ libelle: 'Montage 4 pneus jante alu', montant: 68, fait: true }], { motif: 'Pneus été' }),
    v('veh_demo06', 'cli_demo05', 'DB-987-MN', 'Volkswagen', 'Golf SW', 'break', '#9aa3ad', 'A1', 'en_cours',
      [{ libelle: 'Silencieux d’échappement', montant: 30, fait: false }], { motif: 'Échappement percé', mecanoId: 'mec_demo03' }),
    v('veh_demo07', 'cli_demo04', 'AB-111-CD', 'Iveco', 'Daily caisse', 'camion', '#ffffff', 'F2', 'attente'),
    v('veh_demo08', 'cli_demo02', 'GE-202-PR', 'Toyota', 'Yaris', 'citadine', '#f1c40f', 'E4', 'termine', [], { motif: 'Batterie' }),
  ];
  const now = new Date().toISOString();
  const orders = [
    { id: 'cmd_demo01', libelle: 'Amortisseurs AV (paire)', ref: '', fournisseur: 'Distributeur pièces', qte: 2, prix: 96, vehicleId: 'veh_demo03',
      statut: 'commandee', note: '', attendueLe: d(1), createdAt: now, history: [{ at: now, statut: 'commandee', vehicleId: 'veh_demo03', note: '' }] },
    { id: 'cmd_demo02', libelle: 'Disques + plaquettes AV', ref: '', fournisseur: 'Distributeur pièces', qte: 1, prix: 78, vehicleId: 'veh_demo02',
      statut: 'arrivee', note: '', attendueLe: d(0), createdAt: now, history: [{ at: now, statut: 'commandee', vehicleId: 'veh_demo02', note: '' }, { at: now, statut: 'arrivee', vehicleId: 'veh_demo02', note: '' }] },
    { id: 'cmd_demo03', libelle: 'Huile 5W30 (bidon 5 L)', ref: '', fournisseur: 'Distributeur pièces', qte: 6, prix: 32, vehicleId: '',
      statut: 'arrivee', note: 'Stock atelier', attendueLe: '', createdAt: now, history: [{ at: now, statut: 'arrivee', vehicleId: null, note: '' }] },
  ];
  const mechanics = [
    { id: 'mec_demo01', prenom: 'Karim', nom: '', tel: '', specialite: 'Freinage, trains roulants', couleur: '#1f4e8c', planning: semaine(['lun', 'mar', 'mer', 'jeu', 'ven']), absent: false, actif: true },
    { id: 'mec_demo02', prenom: 'Julien', nom: '', tel: '', specialite: 'Diagnostic, électricité', couleur: '#2f5d3a', planning: semaine(['lun', 'mar', 'jeu', 'ven']), absent: false, actif: true },
    { id: 'mec_demo03', prenom: 'Sam', nom: '', tel: '', specialite: 'Pneus, échappement', couleur: '#8a3b12', planning: semaine(['mar', 'mer', 'jeu', 'ven', 'sam'], [['08:30', '12:30']]), absent: false, actif: true },
  ];
  const consumables = { items: [
    { key: 'cafe', label: 'Café', icon: '☕', level: 'ok', at: now },
    { key: 'savon', label: 'Savon d’atelier', icon: '🧼', level: 'bas', at: now },
    { key: 'pq', label: 'Papier toilette', icon: '🧻', level: 'ok', at: now },
  ], history: [] };
  const config = { crmUrl: '' };
  const s = (id, libelle, categorie, qte, seuil, emplacement, prix = '') => ({ id: 'stk_demo' + id, libelle, ref: '', categorie, qte, seuil, emplacement, prix, createdAt: now });
  const stock = [
    s('01', 'Huile 5W30 (bidon 5 L)', 'Huiles', 14, 6, 'Étagère du fond', 32), s('02', 'Huile 5W40 (bidon 5 L)', 'Huiles', 5, 6, 'Étagère du fond', 29),
    s('03', 'Huile 10W40 (bidon 5 L)', 'Huiles', 8, 4, 'Étagère du fond', 24), s('04', 'Filtre à huile (universel)', 'Filtres', 12, 5, 'Réserve A2', 8),
    s('05', 'Filtre à air', 'Filtres', 3, 4, 'Réserve A2', 14), s('06', 'Liquide de refroidissement 5 L', 'Liquides', 6, 3, 'Réserve A1', 18),
    s('07', 'Lave-glace 5 L', 'Liquides', 10, 4, 'Réserve A1', 6), s('08', 'Liquide de frein DOT4 1 L', 'Liquides', 2, 3, 'Réserve A1', 11),
    s('09', 'Ampoule H7', 'Électricité', 20, 6, 'Réserve B1', 5), s('10', 'Balais essuie-glace (paire)', 'Accessoires', 4, 2, 'Réserve B1', 19),
    s('11', 'Pneu 205/55 R16', 'Pneus', 8, 4, 'Rack pneus', 72), s('12', 'Pneu 195/65 R15', 'Pneus', 2, 4, 'Rack pneus', 61),
  ];
  const tarifs = [
    { groupe: 'Location pont + servante', items: [['30 min', 15], ['1 h', 28.5], ['2 h', 55], ['3 h', 75], ['4 h', 90]] },
    { groupe: 'Montage pneus (unité)', items: [['Jante tôle', 15], ['Jante alu', 17], ['Jante alu > 17"', 20], ['Run flat', 20]] },
    { groupe: 'Forfaits montage pièces', items: [['Plaquettes AV', 31], ['Plaquettes AR (dès)', 35], ['Disques + plaquettes (dès)', 65],
      ['Rotule de direction', 35], ['Rotule de suspension', 40], ['Roulement AV (dès)', 60], ['Amortisseurs Mac Pherson (paire)', 85], ['Silencieux d’échappement', 30]] },
    { groupe: 'Main-d’œuvre (1 h)', items: [['T1', 49.5], ['T2', 55]] },
  ];
  return { clients, vehicles, orders, mechanics, consumables, config, stock, tarifs };
}
