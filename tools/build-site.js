// Construit public/site.json a partir de data/osm.json (extrait OpenStreetMap / cadastre DGI).
// Repere local en metres, origine = point "derriere Ocaburo" (47.2294964, -1.6369791) :
//   e = est, n = nord. Le monde three.js utilise x = e, z = -n, y = haut.
// Le garage est decrit dans son propre repere (u, v) aligne sur le batiment :
//   u : perpendiculaire a la facade SO, 0 = mur NO (mur en tole), 21 = mur SE (porte)
//   v : le long du batiment, 0 = facade SO (cote Ocaburo), croissant vers le NE
// Usage : node tools/build-site.js
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const osm = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'osm.json'), 'utf8'));

const LAT0 = 47.2294964, LON0 = -1.6369791;
const KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KY = 111320;
const nodes = new Map();
for (const e of osm.elements) if (e.type === 'node') nodes.set(e.id, e);
const toEN = (n) => [(n.lon - LON0) * KX, (n.lat - LAT0) * KY];
const r2 = (x) => Math.round(x * 100) / 100;
const wayPts = (w) => w.nodes.map((id) => nodes.get(id)).filter(Boolean).map(toEN);
const RANGE = 230;
const near = (pts) => pts.some(([e, n]) => Math.abs(e) < RANGE && Math.abs(n) < RANGE);

// ---------- repere du garage (batiment cadastre 135099758 + 135099283) ----------
// coins mesures : O = angle ouest de la facade SO, B = angle sud, N = angle est (fond NE)
const O = [13.2, 29.2], B = [32.2, 20.0], NE = [53.1, 63.4];
const len = (a) => Math.hypot(a[0], a[1]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const U = (() => { const d = sub(B, O); const l = len(d); return [d[0] / l, d[1] / l]; })(); // vers le SE
const V = [-U[1], U[0]].map((x) => x * (U[0] * (NE[1] - B[1]) - U[1] * (NE[0] - B[0]) > 0 ? 1 : -1)); // vers le NE
const BUILDING_W = r2(len(sub(B, O)));             // ~21 m (largeur, axe u)
const BUILDING_L = r2(Math.abs((NE[0] - B[0]) * V[0] + (NE[1] - B[1]) * V[1])); // ~48 m (longueur, axe v)
const uvToEN = (u, v) => [O[0] + u * U[0] + v * V[0], O[1] + u * U[1] + v * V[1]];
const enToUV = ([e, n]) => { const d = sub([e, n], O); return [d[0] * U[0] + d[1] * U[1], d[0] * V[0] + d[1] * V[1]]; };
// cap (rotation autour de y, monde three.js) d'un vehicule dont l'avant pointe vers +v / +u
const yawOf = (dir) => Math.atan2(dir[1], dir[0]); // en (e,n) ; en three.js : rotation.y = yaw (x=e, z=-n)

// ---------- plan interieur (croquis de Benjamin, proportions relevees sur le dessin) ----------
// Le croquis : bas = mur SE de l'entree (porte, mur en tole avec le poster du Mans), haut = fond (mur NO, ponts).
// En entrant : bureau + WC a gauche (cote facade SO), reserve a droite (vers le NE).
// fx, fy : fractions du croquis (0..1, gauche->droite, haut->bas).
const GARAGE_LEN = 23; // longueur de l'atelier le long de v (le reste du batiment = voisin)
const fromSketch = (fx, fy) => [BUILDING_W * fy, GARAGE_LEN * fx]; // -> (u, v)
const shiftU = (r, d) => ({ ...r, u0: r2(r.u0 + d), u1: r2(r.u1 + d) });
const rectFromSketch = (x0, x1, y0, y1) => {
  const [ua, va] = fromSketch(x0, y0), [ub, vb] = fromSketch(x1, y1);
  return { u0: r2(Math.min(ua, ub)), u1: r2(Math.max(ua, ub)), v0: r2(Math.min(va, vb)), v1: r2(Math.max(va, vb)) };
};
const interior = {
  len: GARAGE_LEN,
  lifts: [
    { id: 'P1', name: 'Pont 1', ...rectFromSketch(0.063, 0.378, 0.05, 0.19) },
    { id: 'P2', name: 'Pont 2', ...rectFromSketch(0.67, 0.926, 0.074, 0.18) },
    { id: 'P3', name: 'Pont 3', ...rectFromSketch(0.68, 0.917, 0.28, 0.43) },
  ],
  // bureau + WC decales de 1.4 m vers le fond pour laisser l'escalier contre le mur d'entree
  office: shiftU(rectFromSketch(0.0, 0.19, 0.58, 0.87), -1.4),
  toilets: shiftU(rectFromSketch(0.0, 0.18, 0.87, 1.0), -1.4),
  // escalier droit le long du mur d'entree : pied cote allee (v = 5.6), arrivee au palier (v = 1.0)
  stairs: { u0: 19.75, u1: 20.95, vFoot: 5.6, vTop: 1.0 },
  // etage (mezzanine) au-dessus du bureau et des WC : salle de pause
  mezz: { u0: 10.84, u1: BUILDING_W, v0: 0, v1: 4.4, h: 2.9 },
  stock: rectFromSketch(0.69, 1.0, 0.51, 1.0),
  door: { v0: 7.4, v1: 12.6 },        // porte sectionnelle sur le mur SE (u = W), entre bureau et reserve
  sideDoor: { u0: 15.0, u1: 16.0 },   // porte pieton facade SO (v = 0) : entree clients dans le bureau
  poster: { v: 14.2 },                 // mur en tole de l'entree (cote interieur), poster 24h du Mans
};

// ---------- places (ERP) ----------
const spots = [];
const addSpot = (id, label, zone, kind, u, v, dirUV) => {
  const [e, n] = uvToEN(u, v);
  const d = [dirUV[0] * U[0] + dirUV[1] * V[0], dirUV[0] * U[1] + dirUV[1] * V[1]];
  spots.push({ id, label, zone, kind, x: r2(e), z: r2(-n), yaw: r2(yawOf(d)) });
};
for (const l of interior.lifts) addSpot(l.id, l.name, 'Atelier', 'pont', (l.u0 + l.u1) / 2, (l.v0 + l.v1) / 2, [0, 1]);
addSpot('A1', 'Aire atelier', 'Atelier', 'atelier', 7.6, 11.0, [-1, 0]);   // au fond de l'allee, nez vers l'etabli
addSpot('A2', 'Aire atelier 2', 'Atelier', 'atelier', 8.0, 5.8, [0, -1]);  // derriere le mur du poste pneus

// Allee SE : file le long du mur porte (on laisse degagees la porte de l'atelier et celle du voisin, v 30-34.5)
const alley = [[0.4, 5.6], [14.2, 19.8], [20.2, 25.8], [35.0, 40.6], [41.0, 46.6]];
alley.forEach(([v0, v1], i) => addSpot(`E${i + 1}`, `Allée ${i + 1}`, 'Allée atelier', 'parking', BUILDING_W + 1.4, (v0 + v1) / 2, [0, 1]));
// cote Ocaburo : file le long de sa facade SE (u ~ 20.5), avant la facade du garage
[[-25.6, -20.0], [-19.6, -14.0], [-13.6, -8.0]].forEach(([v0, v1], i) => addSpot(`E${alley.length + i + 1}`, `Allée ${alley.length + i + 1}`, 'Allée atelier', 'parking', BUILDING_W + 1.4, (v0 + v1) / 2, [0, 1]));
// file d'en face (cote PUM) : tout le long de l'allee, sauf face a la porte de l'atelier pour pouvoir manoeuvrer
{
  let k = 0;
  for (let v = -25.6; v + 5.6 <= 46.6; v += 6.0) {
    if (v + 5.6 > 5.0 && v < 15.0) continue; // devant la porte (v 7.4-12.6)
    k++; addSpot(`F${k}`, `Allée face ${k}`, 'Allée atelier', 'parking', BUILDING_W + 7.2, v + 2.8, [0, -1]);
  }
}

// Parking devant Ocaburo : la rangee marquee le long de sa facade SO (bords releves sur le polygone OSM 1468427821), nez vers Ocaburo
{
  const out0 = [-2.5, -1.0], out1 = [16.4, -10.1], in0 = [-0.3, 3.4]; // bord exterieur (allee) et bord cote Ocaburo
  const along = sub(out1, out0), L = len(along), d = [along[0] / L, along[1] / L];
  const nIn = (() => { const w = sub(in0, out0); const k = w[0] * d[0] + w[1] * d[1]; const p = [w[0] - k * d[0], w[1] - k * d[1]]; const l = len(p); return [p[0] / l, p[1] / l, l]; })();
  const n = Math.floor(L / 2.5);
  for (let k = 0; k < n; k++) {
    const t = (L - n * 2.5) / 2 + 1.25 + k * 2.5;
    const e = out0[0] + d[0] * t + nIn[0] * nIn[2] / 2, nn = out0[1] + d[1] * t + nIn[1] * nIn[2] / 2;
    spots.push({ id: `O${k + 1}`, label: `Ocaburo ${k + 1}`, zone: 'Parking Ocaburo', kind: 'parking', x: r2(e), z: r2(-nn), yaw: r2(yawOf([nIn[0], nIn[1]])) });
  }
}

// ---------- decor OSM ----------
const NAMES = {
  135098971: { name: 'PUM', sub: 'Matériaux de construction', h: 8, roof: '#3d5a86' },
  135099559: { name: 'Ocaburo', sub: 'Mobilier de bureau', h: 6.5, roof: '#7d8796' },
  135098537: { name: 'Blanchet Dhuismes', sub: 'Magasin de meubles', h: 6, roof: '#9a5a3c' },
  135098709: { name: 'Bowl Center', sub: 'Bowling', h: 9, roof: '#8f8f8f' },
  1469233992: { name: '', h: 13, roof: '#a7a39a' },
};
const SKIP = new Set([135099758, 135099283]); // le batiment du garage est modelise a part
const buildings = [], parkings = [], roads = [], hedges = [], fences = [];
const ROAD_W = { trunk: 7.5, trunk_link: 4.5, tertiary: 7, residential: 6, service: 4.5, footway: 2, path: 1.2 };
for (const e of osm.elements) {
  if (e.type !== 'way' || !e.tags) continue;
  const pts = wayPts(e);
  if (pts.length < 2 || !near(pts)) continue;
  const xz = pts.map(([x, n]) => [r2(x), r2(-n)]);
  const t = e.tags;
  if (t.building && !SKIP.has(e.id)) {
    const meta = NAMES[e.id] || {};
    const levels = Number(t['building:levels']) || 0;
    buildings.push({ id: e.id, pts: xz, h: meta.h || (levels ? levels * 3.3 : (t.wall === 'no' ? 3.5 : 6.5)),
      roof: meta.roof || null, open: t.wall === 'no', name: meta.name || t.name || '', sub: meta.sub || '' });
  } else if (t.amenity === 'parking' || t.amenity === 'building_yard') {
    parkings.push({ id: e.id, pts: xz, private: t.access === 'private', yard: t.amenity === 'building_yard' });
  } else if (t.highway && ROAD_W[t.highway]) {
    roads.push({ id: e.id, pts: xz, w: ROAD_W[t.highway], kind: t.highway, name: t.name || '' });
  } else if (t.barrier === 'hedge') hedges.push({ pts: xz });
  else if (t.barrier === 'fence') fences.push({ pts: xz });
}
const pois = [];
for (const e of osm.elements) {
  if (e.type !== 'node' || !e.tags || !e.tags.name) continue;
  const [x, n] = toEN(e);
  if (Math.abs(x) > RANGE || Math.abs(n) > RANGE) continue;
  pois.push({ name: e.tags.name, kind: e.tags.shop || e.tags.amenity || e.tags.leisure || e.tags.highway || '', x: r2(x), z: r2(-n) });
}

const site = {
  source: 'OpenStreetMap contributors (ODbL) / cadastre DGI — extrait du ' + new Date().toISOString().slice(0, 10),
  origin: { lat: LAT0, lon: LON0 },
  garage: {
    name: 'Auto Self Garage — SARL RCA',
    address: 'Rue du Moulin de la Rousselière, 44800 Saint-Herblain (derrière Ocaburo)',
    O: [r2(O[0]), r2(-O[1])], U: [U[0], -U[1]], V: [V[0], -V[1]], // vecteurs en monde (x, z)
    width: BUILDING_W, length: BUILDING_L, height: 6.2, ridge: 8.0, // toit a deux pans, faitage dans la longueur
    entrance: { u: BUILDING_W + 3.2, v: 10.0 }, // ou attend le client qui arrive
    interior,
  },
  spots, buildings, parkings, roads, hedges, fences, pois,
};
const out = path.join(ROOT, 'public', 'site.json');
fs.writeFileSync(out, JSON.stringify(site));
console.log(`site.json : ${buildings.length} batiments, ${parkings.length} parkings, ${roads.length} voies, ${spots.length} places`);
console.log('garage', BUILDING_W, 'x', BUILDING_L, 'm ; interieur', JSON.stringify(interior.lifts));
console.log('places :', spots.map((s) => s.id).join(' '));
