// "Serveur" dans le navigateur : toute la logique metier de l'ERP, donnees gardees dans IndexedDB.
// Meme API que l'ancien serveur HTTP : request(methode, 'vehicles/id/...', corps) -> objet JSON ou Error.
// Rien ne sort de l'appareil ; plusieurs onglets restent synchro via BroadcastChannel.
import { seed } from './data/seed.js';
import { MODELS } from './data/catalog.js';
import { lookup as plateLookup, normalize as normPlate } from './data/plate.js';

const DB_NAME = 'auto-self-garage', DB_VERSION = 1;
const STATUTS = ['attente', 'diagnostic', 'en_cours', 'attente_pieces', 'termine', 'rendu'];
const ORDER_STATUTS = ['commandee', 'arrivee', 'posee', 'annulee'];
const LEVELS = ['ok', 'bas', 'vide'];
const COLLECTIONS = {
  clients: { prefix: 'cli', fields: ['nom', 'prenom', 'tel', 'email', 'adresse', 'notes'] },
  vehicles: { prefix: 'veh', fields: ['clientId', 'plaque', 'marque', 'modele', 'annee', 'type', 'couleur', 'km', 'vin', 'energie',
    'model3d', 'modelFlip', 'placeId', 'statut', 'motif', 'notes', 'entree', 'sortiePrevue', 'sortie', 'interventions', 'mecanoId', 'paiement'] },
  orders: { prefix: 'cmd', fields: ['libelle', 'ref', 'fournisseur', 'qte', 'prix', 'vehicleId', 'statut', 'note', 'attendueLe', 'paye'] },
  mechanics: { prefix: 'mec', fields: ['prenom', 'nom', 'tel', 'specialite', 'couleur', 'planning', 'absent', 'actif'] },
  stock: { prefix: 'stk', fields: ['libelle', 'ref', 'categorie', 'qte', 'seuil', 'emplacement', 'prix', 'photo'] },
};

let idb = null, db = null, site = null, spotIds = new Set(), rev = 0;
const now = () => new Date().toISOString();
const newId = (p) => `${p}_${crypto.getRandomValues(new Uint32Array(1))[0].toString(16).padStart(8, '0')}`;
const clone = (x) => structuredClone(x);
class HttpError extends Error { constructor(code, msg, extra) { super(msg); this.code = code; Object.assign(this, extra); } }
const fail = (code, msg, extra) => { throw new HttpError(code, msg, extra); };

// ---------- IndexedDB ----------
function openIdb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => { for (const s of ['kv', 'blobs']) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
const tx = (store, mode, fn) => new Promise((resolve, reject) => {
  const t = idb.transaction(store, mode), req = fn(t.objectStore(store));
  t.oncomplete = () => resolve(req && req.result);
  t.onerror = () => reject(t.error);
});
const idbGet = (s, k) => tx(s, 'readonly', (o) => o.get(k));
const idbPut = (s, k, v) => tx(s, 'readwrite', (o) => o.put(v, k));

let saveTimer = null, saving = Promise.resolve();
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 120);
}
function flush() { clearTimeout(saveTimer); saveTimer = null; saving = saving.then(() => idbPut('kv', 'db', db)).catch((e) => console.error('sauvegarde', e)); return saving; }
addEventListener('pagehide', () => { if (saveTimer) flush(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && saveTimer) flush(); });

// ---------- fichiers (photos, modeles .glb) : blobs dans IndexedDB, servis en object URL ----------
const urls = new Map();
export const assetUrl = (ref) => (ref && ref.startsWith('idb:') ? urls.get(ref) || '' : ref || '');
async function loadBlobs() {
  await tx('blobs', 'readonly', (o) => {
    const c = o.openCursor();
    c.onsuccess = () => { const cur = c.result; if (cur) { urls.set(cur.key, URL.createObjectURL(cur.value)); cur.continue(); } };
    return null;
  });
}
async function putBlob(kind, name, blob) {
  const ref = `idb:${kind}-${newId('f').slice(2)}`;
  await idbPut('blobs', ref, blob);
  urls.set(ref, URL.createObjectURL(blob));
  db.assets.push({ ref, kind, name, size: blob.size, at: now() });
  return ref;
}
// photo prise au telephone : on reduit a 640 px max et on recompresse en JPEG (~50-100 ko)
async function shrinkImage(file, max = 640) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.82));
}

// ---------- synchro entre onglets ----------
const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
const chan = 'BroadcastChannel' in self ? new BroadcastChannel('auto-self-garage') : null;
function broadcast(what) {
  rev++;
  for (const fn of listeners) fn({ rev, what });
  save();
  if (chan) setTimeout(() => saving.then(() => chan.postMessage({ what })), 140);
}
if (chan) chan.onmessage = async (e) => { db = await idbGet('kv', 'db'); rev++; for (const fn of listeners) fn({ rev, what: e.data.what }); };

// ---------- demarrage ----------
function migrate(d) {
  const s = seed();
  for (const k of ['clients', 'vehicles', 'orders', 'mechanics', 'consumables', 'config', 'stock', 'tarifs']) if (!d[k]) d[k] = s[k];
  d.assets ||= [];
  // places disparues du plan : on recase les voitures dans l'allee puis devant Ocaburo
  const taken = new Set(d.vehicles.filter((v) => v.statut !== 'rendu' && spotIds.has(v.placeId)).map((v) => v.placeId));
  const free = site.spots.filter((x) => x.kind === 'parking' && !taken.has(x.id)).map((x) => x.id);
  for (const v of d.vehicles) if (v.placeId && !spotIds.has(v.placeId)) v.placeId = v.statut === 'rendu' ? null : free.shift() || null;
  return d;
}
export async function init(siteJson) {
  site = siteJson; spotIds = new Set(site.spots.map((x) => x.id));
  idb = await openIdb();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); // evite que le navigateur efface la partie
  db = (await idbGet('kv', 'db')) || null;
  const fresh = !db;
  db = migrate(db || { ...seed(), createdAt: now() });
  await loadBlobs();
  await flush();
  return { fresh };
}

// ---------- regles metier ----------
function clean(kind, body, prev = {}) {
  const out = { ...prev };
  for (const f of COLLECTIONS[kind].fields) if (f in body) out[f] = body[f];
  if (kind === 'vehicles') {
    if (out.plaque) out.plaque = (normPlate(out.plaque) || {}).plaque || String(out.plaque).toUpperCase().trim();
    if (out.statut && !STATUTS.includes(out.statut)) fail(400, 'statut inconnu : ' + out.statut);
    if (out.statut === 'rendu') out.placeId = null;
    if (out.placeId) {
      if (!spotIds.has(out.placeId)) fail(400, 'place inconnue : ' + out.placeId);
      const busy = db.vehicles.find((v) => v.placeId === out.placeId && v.id !== prev.id && v.statut !== 'rendu');
      if (busy) fail(409, `place ${out.placeId} déjà occupée par ${busy.plaque}`);
    }
    if (!Array.isArray(out.interventions)) out.interventions = [];
    if (!Array.isArray(out.journal)) out.journal = [];
    if (!Array.isArray(out.visites)) out.visites = [];
    if (out.statut === 'rendu' && prev.statut && prev.statut !== 'rendu') {
      // fin d'un passage : on l'archive sur la fiche (la plaque garde toute son histoire)
      const debut = prev.entree || '';
      out.visites.push({ entree: debut, sortie: out.sortie || now().slice(0, 10), motif: out.motif || '', km: out.km || '',
        clientId: out.clientId || '', mecanoId: out.mecanoId || '', interventions: out.interventions,
        total: out.interventions.reduce((a, l) => a + (Number(l.montant) || 0), 0),
        pieces: db.orders.filter((o) => o.vehicleId === prev.id && (o.history || []).some((h) => h.statut === 'posee' && h.at.slice(0, 10) >= debut)).map((o) => o.libelle),
        paiement: out.paiement || { statut: 'non_paye' } });
      out.interventions = []; out.mecanoId = '';
    } else if (out.statut === 'rendu' && 'paiement' in body && out.visites.length) out.visites[out.visites.length - 1].paiement = out.paiement;
  }
  if (kind === 'orders') {
    out.statut = out.statut || 'commandee';
    if (!ORDER_STATUTS.includes(out.statut)) fail(400, 'statut de commande inconnu');
    if (out.statut === 'posee' && !out.vehicleId) fail(400, 'indique le véhicule sur lequel la pièce est posée');
    out.history = Array.isArray(prev.history) ? prev.history : [];
    if (out.statut !== prev.statut) out.history.push({ at: now(), statut: out.statut, vehicleId: out.vehicleId || null, note: body.note || '' });
    if ('paye' in body && body.paye !== prev.paye) out.history.push({ at: now(), statut: out.statut, vehicleId: out.vehicleId || null, note: body.paye ? 'fournisseur payé' : 'paiement fournisseur annulé' });
    // piece pour le stock atelier qui arrive : on l'ajoute a l'inventaire de la reserve
    if (out.statut === 'arrivee' && prev.statut !== 'arrivee' && !out.vehicleId) {
      const it = db.stock.find((x) => x.libelle.toLowerCase() === String(out.libelle).toLowerCase());
      if (it) { it.qte = (Number(it.qte) || 0) + (Number(out.qte) || 1); it.updatedAt = now(); }
      else db.stock.push({ id: newId('stk'), createdAt: now(), libelle: out.libelle, ref: out.ref || '', categorie: 'Pièces', qte: Number(out.qte) || 1, seuil: 0, emplacement: '', prix: out.prix || '' });
    }
  }
  if (kind === 'mechanics' && !out.planning) out.planning = {};
  return out;
}

// ---------- routes ----------
export async function request(method, url, body) {
  const u = new URL(url, 'http://x/');
  const [kind, id, sub] = u.pathname.split('/').filter(Boolean);
  const q = u.searchParams;
  if (method === 'GET' && kind === 'state') {
    return clone({ rev, clients: db.clients, vehicles: db.vehicles, orders: db.orders, mechanics: db.mechanics, consumables: db.consumables,
      config: db.config, stock: db.stock, statuts: STATUTS, tarifs: db.tarifs });
  }
  if (method === 'GET' && kind === 'catalog') return MODELS;
  if (method === 'GET' && kind === 'plate') return plateLookup(decodeURIComponent(id || ''), db);

  if (kind === 'consumables' && (method === 'PUT' || method === 'PATCH')) {
    const item = db.consumables.items.find((c) => c.key === id);
    if (!item) fail(404, 'consommable inconnu');
    if (!LEVELS.includes(body.level)) fail(400, 'niveau : ok, bas ou vide');
    item.level = body.level; item.at = now();
    db.consumables.history.push({ at: item.at, key: id, level: body.level });
    db.consumables.history = db.consumables.history.slice(-300);
    broadcast('consumables'); return clone(item);
  }
  if (kind === 'config' && method === 'PUT') { Object.assign(db.config, body); broadcast('config'); return clone(db.config); }
  if (kind === 'vehicles' && sub === 'journal' && method === 'POST') {
    const v = db.vehicles.find((x) => x.id === id); if (!v) fail(404, 'introuvable');
    if (!String(body.text || '').trim()) fail(400, 'commentaire vide');
    (v.journal ||= []).push({ at: now(), text: String(body.text).trim().slice(0, 500) });
    broadcast('vehicles'); return clone(v);
  }
  if (kind === 'vehicles' && sub === 'move' && method === 'POST') {
    // deplacement (glisser-deposer) : si la place est prise, les deux vehicules echangent leurs places
    const v = db.vehicles.find((x) => x.id === id); if (!v) fail(404, 'introuvable');
    const placeId = body.placeId;
    if (placeId && !spotIds.has(placeId)) fail(400, 'place inconnue');
    const other = placeId && db.vehicles.find((x) => x.placeId === placeId && x.id !== id && x.statut !== 'rendu');
    if (other) { other.placeId = v.placeId || null; other.updatedAt = now(); }
    v.placeId = placeId || null; v.updatedAt = now();
    broadcast('vehicles'); return { moved: v.id, swapped: other ? other.id : null };
  }
  if (kind === 'stock' && sub === 'use' && method === 'POST') { // pose d'une piece du stock sur un vehicule
    const it = db.stock.find((x) => x.id === id), v = db.vehicles.find((x) => x.id === body.vehicleId);
    if (!it || !v) fail(404, 'article ou véhicule introuvable');
    const n = Math.max(1, Number(body.qte) || 1);
    if ((Number(it.qte) || 0) < n) fail(409, `plus que ${it.qte} « ${it.libelle} » en réserve`);
    it.qte = Number(it.qte) - n; it.updatedAt = now();
    (it.history ||= []).push({ at: now(), delta: -n, vehicleId: v.id, plaque: v.plaque });
    (v.interventions ||= []).push({ libelle: `Pièce : ${it.libelle}${n > 1 ? ` × ${n}` : ''}`, montant: (Number(it.prix) || 0) * n, fait: false, stockId: it.id });
    (v.journal ||= []).push({ at: now(), text: `📦 ${it.libelle}${n > 1 ? ` × ${n}` : ''} sorti de la réserve pour cette voiture` });
    v.updatedAt = now(); broadcast('stock');
    return clone({ stock: it, vehicle: v });
  }
  if (kind === 'photos' && method === 'POST') {
    if (!(body instanceof Blob) || !/^image\//.test(body.type || 'image/')) fail(400, 'image attendue');
    const ref = await putBlob('photo', q.get('name') || 'photo', await shrinkImage(body));
    save(); return { url: ref };
  }
  if (kind === 'models') {
    if (method === 'GET') return db.assets.filter((a) => a.kind === 'model').map((a) => ({ url: a.ref, name: a.name, size: a.size }));
    let blob = body;
    if (method === 'POST' && id === 'import') {
      if (!/^https?:\/\//i.test(body.url || '')) fail(400, 'URL http(s) attendue');
      const r = await fetch(body.url).catch(() => fail(502, 'téléchargement impossible (le site doit autoriser le partage, CORS)'));
      if (!r.ok) fail(502, `téléchargement : HTTP ${r.status}`);
      blob = await r.blob();
    }
    if (method === 'POST') {
      if (!(blob instanceof Blob)) fail(400, 'fichier attendu');
      if (blob.size > 80e6) fail(413, 'modèle trop lourd (> 80 Mo)');
      if (await blob.slice(0, 4).text() !== 'glTF') fail(400, 'ce fichier n’est pas un .glb (glTF binaire)');
      const ref = await putBlob('model', q.get('name') || (body.url || 'modele').split('/').pop(), new Blob([blob], { type: 'model/gltf-binary' }));
      save(); return { url: ref, size: blob.size };
    }
  }

  const col = COLLECTIONS[kind];
  if (!col) fail(404, 'route inconnue');
  const list = db[kind];
  if (method === 'GET') return clone(id ? list.find((x) => x.id === id) || null : list);
  if (method === 'POST' && !id) {
    if (kind === 'vehicles' && body.plaque) { // une plaque deja connue : on rouvre sa fiche au lieu d'en creer une nouvelle
      const pl = (normPlate(body.plaque) || {}).plaque || String(body.plaque).toUpperCase().trim();
      const ex = list.find((v) => v.plaque === pl);
      if (ex && ex.statut !== 'rendu') fail(409, `${pl} est déjà au garage (${ex.placeId || 'sans place'})`, { id: ex.id });
      if (ex) {
        const given = Object.fromEntries(Object.entries(body).filter(([k, v]) => v !== '' && v != null && k !== 'journal'));
        const upd = clean(kind, { ...given, statut: 'attente', entree: now().slice(0, 10), sortie: '', interventions: [], paiement: { statut: 'non_paye' } }, ex);
        upd.retours = (ex.retours || 0) + 1; upd.updatedAt = now();
        const txt = typeof body.journal === 'string' ? body.journal.trim() : '';
        upd.journal.push({ at: now(), text: `🔁 Retour au garage${txt ? ' — ' + txt : ''}` });
        list[list.indexOf(ex)] = upd; broadcast(kind);
        return clone({ ...upd, retour: true });
      }
    }
    const item = { id: newId(col.prefix), createdAt: now(), ...clean(kind, body) };
    if (kind === 'vehicles') {
      item.statut = item.statut || 'attente'; item.entree = item.entree || now().slice(0, 10);
      if (typeof body.journal === 'string' && body.journal.trim()) item.journal = [{ at: now(), text: body.journal.trim() }];
    }
    list.push(item); broadcast(kind);
    return clone(item);
  }
  const idx = list.findIndex((x) => x.id === id);
  if (idx < 0) fail(404, 'introuvable');
  if (method === 'PUT' || method === 'PATCH') {
    list[idx] = { ...clean(kind, body, list[idx]), updatedAt: now() };
    broadcast(kind); return clone(list[idx]);
  }
  if (method === 'DELETE') {
    if (kind === 'clients' && db.vehicles.some((v) => v.clientId === id)) fail(409, 'ce client a encore des véhicules');
    list.splice(idx, 1); broadcast(kind);
    return { ok: true };
  }
  fail(405, 'méthode non permise');
}

// ---------- partie : nouvelle / export / import ----------
export async function newGame() {
  await tx('blobs', 'readwrite', (o) => o.clear());
  for (const u of urls.values()) URL.revokeObjectURL(u);
  urls.clear();
  db = migrate({ ...seed(), createdAt: now() });
  broadcast('reset'); await flush();
}
const blobToDataUrl = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
export async function exportGame() {
  const blobs = {};
  for (const a of db.assets) { const b = await idbGet('blobs', a.ref); if (b) blobs[a.ref] = await blobToDataUrl(b); }
  return new Blob([JSON.stringify({ app: 'auto-self-garage', version: 1, at: now(), db, blobs })], { type: 'application/json' });
}
export async function importGame(file) {
  const j = JSON.parse(await file.text());
  if (j.app !== 'auto-self-garage' || !j.db) fail(400, 'ce fichier n’est pas une sauvegarde du garage');
  await tx('blobs', 'readwrite', (o) => o.clear());
  urls.clear();
  for (const [ref, dataUrl] of Object.entries(j.blobs || {})) { const b = await (await fetch(dataUrl)).blob(); await idbPut('blobs', ref, b); urls.set(ref, URL.createObjectURL(b)); }
  db = migrate(j.db);
  broadcast('reset'); await flush();
}
export const storageInfo = async () => (navigator.storage && navigator.storage.estimate ? navigator.storage.estimate() : null);
