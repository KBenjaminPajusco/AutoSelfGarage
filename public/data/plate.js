// Recherche par plaque. Pas d'API SIV publique gratuite : on remplit au maximum hors ligne
//   1. format (SIV AA-123-AA ou ancien FNI 123 ABC 44) et normalisation
//   2. historique du garage (vehicule deja passe -> toutes ses infos + son client)
//   3. annee de premiere immatriculation estimee d'apres la serie SIV (les plaques sont attribuees dans l'ordre)

const SIV = /^([A-HJ-NP-TV-Z]{2})-?(\d{3})-?([A-HJ-NP-TV-Z]{2})$/;
const FNI = /^(\d{1,4})\s*-?([A-Z]{1,3})\s*-?(\d{2}|2A|2B|97\d)$/;
const LETTERS = 'ABCDEFGHJKLMNPQRSTVWXYZ'; // SIV : ni I, ni O, ni U
// debut de serie (2 premieres lettres) -> date approximative (releves publics de la progression des plaques)
const MILESTONES = [['AA', 2009.3], ['BA', 2011.0], ['CA', 2012.5], ['DA', 2014.3], ['EA', 2016.3], ['FA', 2018.8], ['GA', 2021.0], ['HA', 2023.8], ['JA', 2026.6]];
const idx = (p) => LETTERS.indexOf(p[0]) * LETTERS.length + LETTERS.indexOf(p[1]);

export function normalize(raw) {
  const s = String(raw || '').toUpperCase().replace(/[\s.]/g, '').replace(/[–—]/g, '-');
  const m = s.replace(/-/g, '').match(/^([A-Z]{2})(\d{3})([A-Z]{2})$/);
  if (m && SIV.test(m[0])) return { plaque: `${m[1]}-${m[2]}-${m[3]}`, format: 'SIV' };
  const f = String(raw || '').toUpperCase().trim().match(FNI);
  if (f) return { plaque: `${f[1]} ${f[2]} ${f[3]}`, format: 'FNI', departement: f[3] };
  return null;
}

export function estimateYear(plaque) {
  const p = plaque.slice(0, 2), i = idx(p);
  for (let k = 0; k < MILESTONES.length - 1; k++) {
    const [a, ya] = MILESTONES[k], [b, yb] = MILESTONES[k + 1];
    if (i >= idx(a) && i < idx(b)) return Math.floor(ya + (yb - ya) * (i - idx(a)) / (idx(b) - idx(a)));
  }
  return null;
}

export function lookup(raw, db) {
  const n = normalize(raw);
  if (!n) return { ok: false, error: 'format de plaque non reconnu (ex. AB-123-CD)' };
  const out = { ok: true, ...n, sources: [] };
  if (n.format === 'SIV') {
    const y = estimateYear(n.plaque);
    if (y) { out.annee = String(y); out.anneeEstimee = true; out.sources.push('série SIV'); }
  } else out.anneeAvant = 2009;
  const known = db.vehicles.filter((v) => v.plaque === n.plaque).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  if (known) {
    for (const k of ['marque', 'modele', 'type', 'couleur', 'annee', 'vin', 'km', 'clientId', 'model3d']) if (known[k]) out[k] = known[k];
    if (known.annee) out.anneeEstimee = false;
    const visits = known.visites || [];
    out.dejaVu = { id: known.id, statut: known.statut, entree: known.entree, placeId: known.placeId || null,
      passages: visits.length + (known.statut !== 'rendu' ? 1 : 0), dernier: visits[visits.length - 1] || null,
      depense: visits.reduce((a, v) => a + (Number(v.total) || 0), 0), notes: known.notes || '', journal: (known.journal || []).slice(-3) };
    out.sources.push('historique du garage');
  }
  return out;
}

