// Vehicules proceduraux : une silhouette laterale extrudee + vitrages en decalque + roues dans des passages.
// Repere local : +x = avant, y = haut, z = lateral ; origine au sol, au centre du vehicule.
// Modeles 3D reels : loadModel(url) charge un .glb, le recale (avant = +x, au sol) et l'echelle a la longueur du type.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/GLTFLoader.js';

// L longueur, W largeur, r rayon de roue, wf/wr position des essieux, top = profil superieur de l'avant vers l'arriere,
// win = vitres laterales, pillars = montants (x), ws = pare-brise [bas, haut], rw = lunette [haut, bas], taper = rentree du pavillon
export const TYPES = {
  citadine: { label: 'Citadine', L: 4.05, W: 1.75, r: 0.31, wf: 1.225, wr: -1.365, taper: 0.84,
    top: [[2.025, 0.38], [2.03, 0.62], [1.95, 0.78], [1.05, 0.92], [0.25, 1.43], [-1.35, 1.41], [-1.86, 1.05], [-2.0, 0.95], [-2.025, 0.55], [-2.0, 0.34]],
    win: [[0.98, 0.97], [0.29, 1.37], [-1.3, 1.36], [-1.76, 1.02]], pillars: [-0.22],
    ws: [[1.05, 0.93], [0.27, 1.40]], rw: [[-1.38, 1.39], [-1.85, 1.06]], hl: 0.68, tl: 0.88 },
  berline: { label: 'Berline', L: 4.75, W: 1.83, r: 0.33, wf: 1.475, wr: -1.315, taper: 0.84,
    top: [[2.375, 0.40], [2.38, 0.66], [2.3, 0.8], [1.3, 0.92], [0.35, 1.44], [-0.9, 1.44], [-1.75, 1.0], [-2.3, 0.98], [-2.375, 0.85], [-2.37, 0.42]],
    win: [[1.24, 0.96], [0.37, 1.39], [-0.88, 1.39], [-1.6, 1.0]], pillars: [-0.08],
    ws: [[1.3, 0.93], [0.36, 1.42]], rw: [[-0.92, 1.42], [-1.72, 1.01]], hl: 0.72, tl: 0.86 },
  break: { label: 'Break', L: 4.6, W: 1.8, r: 0.32, wf: 1.42, wr: -1.26, taper: 0.86,
    top: [[2.3, 0.40], [2.31, 0.66], [2.22, 0.8], [1.25, 0.93], [0.35, 1.47], [-2.0, 1.45], [-2.28, 1.0], [-2.3, 0.42]],
    win: [[1.19, 0.97], [0.37, 1.42], [-1.95, 1.41], [-2.16, 1.0]], pillars: [-0.12, -1.42],
    ws: [[1.25, 0.94], [0.36, 1.45]], rw: [[-2.02, 1.43], [-2.27, 1.03]], hl: 0.72, tl: 0.9 },
  suv: { label: 'SUV', L: 4.45, W: 1.84, r: 0.37, wf: 1.325, wr: -1.355, taper: 0.86,
    top: [[2.225, 0.45], [2.23, 0.78], [2.15, 0.95], [1.25, 1.08], [0.4, 1.63], [-1.65, 1.61], [-2.15, 1.15], [-2.225, 1.05], [-2.22, 0.48]],
    win: [[1.19, 1.12], [0.42, 1.58], [-1.6, 1.57], [-2.0, 1.14]], pillars: [-0.25],
    ws: [[1.25, 1.09], [0.41, 1.61]], rw: [[-1.67, 1.59], [-2.12, 1.17]], hl: 0.86, tl: 1.02 },
  utilitaire: { label: 'Utilitaire léger', L: 4.3, W: 1.83, r: 0.32, wf: 1.3, wr: -1.4, taper: 0.93,
    top: [[2.15, 0.42], [2.16, 0.7], [2.05, 0.9], [1.3, 1.05], [0.55, 1.81], [-2.1, 1.83], [-2.15, 1.7], [-2.15, 0.44]],
    win: [[1.24, 1.09], [0.57, 1.76], [-0.02, 1.76], [-0.02, 1.09]], pillars: [],
    ws: [[1.3, 1.06], [0.56, 1.8]], rw: null, hl: 0.8, tl: 1.0 },
  fourgon: { label: 'Fourgon', L: 5.55, W: 2.07, r: 0.36, wf: 1.825, wr: -1.855, taper: 0.97,
    top: [[2.775, 0.48], [2.78, 0.85], [2.6, 1.05], [1.9, 1.25], [1.15, 2.3], [0.9, 2.5], [-2.75, 2.5], [-2.775, 2.4], [-2.775, 0.5]],
    win: [[1.84, 1.3], [1.17, 2.2], [0.56, 2.2], [0.56, 1.3]], pillars: [],
    ws: [[1.9, 1.26], [1.16, 2.28]], rw: null, hl: 0.95, tl: 1.0 },
  camion: { label: 'Petit camion (caisse)', L: 6.6, W: 2.2, r: 0.38, wf: 2.3, wr: -1.5, taper: 1,
    top: [[3.3, 0.5], [3.31, 0.9], [3.1, 1.1], [2.55, 1.3], [2.0, 2.35], [1.15, 2.45], [1.05, 2.45], [0.95, 3.25], [-3.3, 3.25], [-3.3, 0.78]],
    win: [[2.49, 1.35], [2.02, 2.25], [1.32, 2.3], [1.32, 1.35]], pillars: [],
    ws: [[2.55, 1.31], [2.01, 2.33]], rw: null, hl: 1.0, tl: 1.0 },
};
export const typeOf = (t) => TYPES[t] || TYPES.citadine;

const BOTTOM = 0.3;
const geoCache = new Map();
const matCache = new Map();
const glassTex = (() => { // degrade ciel + deux reflets en biais
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#bcd8ee'); g.addColorStop(1, '#45688a'); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  x.fillStyle = 'rgba(255,255,255,0.55)'; x.beginPath(); x.moveTo(20, 128); x.lineTo(48, 128); x.lineTo(108, 0); x.lineTo(80, 0); x.fill();
  x.fillStyle = 'rgba(255,255,255,0.3)'; x.beginPath(); x.moveTo(58, 128); x.lineTo(66, 128); x.lineTo(126, 0); x.lineTo(118, 0); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
})();
const glassMat = new THREE.MeshStandardMaterial({ map: glassTex, roughness: 0.1, metalness: 0.2, side: THREE.DoubleSide });
const sideGlassMat = glassMat.clone(); sideGlassMat.map = glassTex.clone(); sideGlassMat.map.repeat.set(0.8, 1.6);
const frameMat = new THREE.MeshStandardMaterial({ color: 0x15141a, roughness: 0.6, side: THREE.DoubleSide });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
const tireMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
const rimMat = new THREE.MeshStandardMaterial({ color: 0xbfc4c9, roughness: 0.3, metalness: 0.9 });
const headMat = new THREE.MeshStandardMaterial({ color: 0xfafaf0, emissive: 0x666655, roughness: 0.2 });
const tailMat = new THREE.MeshStandardMaterial({ color: 0xb01010, emissive: 0x400000, roughness: 0.3 });

export function paint(hex) {
  const key = String(hex || '#888888').toLowerCase();
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshPhysicalMaterial({ color: key, roughness: 0.32, metalness: 0.45, clearcoat: 1, clearcoatRoughness: 0.08 }));
  return matCache.get(key);
}

// rentree de caisse au-dessus de la ceinture : z *= f(y)
const taperFn = (t) => {
  const belt = t.ws[0][1], roof = Math.max(...t.top.map((p) => p[1]));
  return (y) => (y <= belt ? 1 : 1 - (1 - t.taper) * Math.min(1, (y - belt) / (roof - belt)));
};

function profileShape(t) {
  const pts = [];
  const ra = t.r + 0.05;
  pts.push([-t.L / 2 + 0.06, BOTTOM]);
  for (const wx of [t.wr, t.wf]) {
    pts.push([wx - ra, BOTTOM]);
    for (let i = 1; i < 12; i++) {
      const a = Math.PI - (i / 12) * Math.PI;
      pts.push([wx + ra * Math.cos(a), Math.max(BOTTOM, t.r + ra * Math.sin(a))]);
    }
    pts.push([wx + ra, BOTTOM]);
  }
  pts.push([t.L / 2 - 0.06, BOTTOM]);
  for (const p of t.top) pts.push(p);
  return new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
}

function bodyGeometry(t) {
  const bev = 0.06;
  const g = new THREE.ExtrudeGeometry(profileShape(t), { depth: t.W - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: 0.04, bevelSegments: 3, curveSegments: 4 });
  g.translate(0, 0, -(t.W / 2 - bev));
  const f = taperFn(t), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) * f(p.getY(i)));
  g.computeVertexNormals();
  return g;
}

// vitres laterales (des deux cotes) decoupees par les montants
function sideGlass(t, inflate = 0, offset = 0.012) {
  const f = taperFn(t), geos = [];
  const [a, b, c, d] = t.win; // bas-avant, haut-avant, haut-arriere, bas-arriere
  const cuts = [a[0], ...t.pillars, d[0]].sort((x, y) => y - x);
  const lerpTop = (x) => { // ligne haute (b->c) et biseaux (a->b, c->d)
    if (x >= b[0]) return a[1] + (b[1] - a[1]) * (a[0] - x) / (a[0] - b[0]);
    if (x <= c[0]) return c[0] === d[0] ? c[1] : d[1] + (c[1] - d[1]) * (x - d[0]) / (c[0] - d[0] || 1);
    return b[1] + (c[1] - b[1]) * (b[0] - x) / (b[0] - c[0]);
  };
  const lerpBot = (x) => a[1] + (d[1] - a[1]) * (a[0] - x) / (a[0] - d[0]);
  for (let i = 0; i < cuts.length - 1; i++) {
    const x0 = cuts[i] - (i ? 0.05 : 0), x1 = cuts[i + 1] + (i < cuts.length - 2 ? 0.05 : 0);
    const xs = [x0]; for (const k of [b[0], c[0]]) if (k < x0 && k > x1) xs.push(k); xs.push(x1);
    const outline = [...xs.map((x) => [x, lerpBot(x)]), ...xs.slice().reverse().map((x) => [x, lerpTop(x)])];
    const cx = outline.reduce((a, p) => a + p[0], 0) / outline.length, cy = outline.reduce((a, p) => a + p[1], 0) / outline.length;
    const grown = outline.map(([x, y]) => { const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy) || 1; return [x + dx / l * inflate, y + dy / l * inflate]; });
    const sg = new THREE.ShapeGeometry(new THREE.Shape(grown.map(([x, y]) => new THREE.Vector2(x, y))));
    for (const side of [1, -1]) {
      const g = sg.clone(), p = g.attributes.position;
      for (let k = 0; k < p.count; k++) p.setZ(k, side * (t.W / 2 + offset) * f(p.getY(k)));
      if (side < 0) g.index.array.reverse();
      g.computeVertexNormals();
      geos.push(g);
    }
  }
  return geos;
}

// pare-brise / lunette : quadrilatere incline qui suit la rentree
function slopeGlass(t, [s0, s1], back, inflate = 0, offset = 0.016) {
  const f = taperFn(t), hw = t.W / 2 - 0.1 + inflate, n = -1; // decalage vers l'exterieur
  const sl = Math.hypot(s1[0] - s0[0], s1[1] - s0[1]), ex = [(s1[0] - s0[0]) / sl * inflate, (s1[1] - s0[1]) / sl * inflate];
  const p0 = [s0[0] - ex[0], s0[1] - ex[1]], p1 = [s1[0] + ex[0], s1[1] + ex[1]];
  const off = (p) => { const dx = p1[0] - p0[0], dy = p1[1] - p0[1], l = Math.hypot(dx, dy); return [p[0] - dy / l * offset * n, p[1] + dx / l * offset * n]; };
  const q0 = off(p0), q1 = off(p1);
  const v = [q0[0], q0[1], -hw * f(q0[1]), q0[0], q0[1], hw * f(q0[1]), q1[0], q1[1], hw * f(q1[1]), q1[0], q1[1], -hw * f(q1[1])];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex(back ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return g;
}

function parts(type) {
  if (geoCache.has(type)) return geoCache.get(type);
  const t = typeOf(type);
  const out = {
    body: bodyGeometry(t),
    side: sideGlass(t), front: [slopeGlass(t, t.ws, false), ...(t.rw ? [slopeGlass(t, t.rw, true)] : [])],
    frames: [...sideGlass(t, 0.05, 0.005), slopeGlass(t, t.ws, false, 0.06, 0.008), ...(t.rw ? [slopeGlass(t, t.rw, true, 0.06, 0.008)] : [])],
    tire: new THREE.CylinderGeometry(t.r, t.r, 0.23, 24).rotateX(Math.PI / 2),
    rim: new THREE.CylinderGeometry(t.r * 0.62, t.r * 0.62, 0.245, 16).rotateX(Math.PI / 2),
  };
  geoCache.set(type, out);
  return out;
}

const plateTex = new Map();
function plateTexture(text) {
  const key = text || '—';
  if (plateTex.has(key)) return plateTex.get(key);
  const c = document.createElement('canvas'); c.width = 256; c.height = 56;
  const x = c.getContext('2d');
  x.fillStyle = '#f7f7f2'; x.fillRect(0, 0, 256, 56);
  x.fillStyle = '#1f3c9e'; x.fillRect(0, 0, 24, 56); x.fillRect(232, 0, 24, 56);
  x.fillStyle = '#fff'; x.font = 'bold 13px sans-serif'; x.fillText('F', 7, 48);
  x.fillStyle = '#e2b400'; x.font = 'bold 11px sans-serif'; x.fillText('44', 236, 48);
  x.fillStyle = '#111'; x.font = 'bold 34px "Arial Narrow", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(key, 128, 30);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  plateTex.set(key, tex);
  return tex;
}

// Construit un vehicule. opts : { type, couleur, plaque }
export function makeVehicle({ type = 'citadine', couleur = '#888888', plaque = '' } = {}) {
  const t = typeOf(type), P = parts(type);
  const g = new THREE.Group();
  g.name = 'vehicle';
  const body = new THREE.Mesh(P.body, paint(couleur));
  body.castShadow = true; body.receiveShadow = true; body.userData.paint = true;
  g.add(body);
  for (const gg of P.frames) g.add(new THREE.Mesh(gg, frameMat));
  for (const gg of P.side) g.add(new THREE.Mesh(gg, sideGlassMat));
  for (const gg of P.front) g.add(new THREE.Mesh(gg, glassMat));
  // joints de portes, poignees, bas de caisse et boucliers : casse l'aplat de la carrosserie
  const belt = t.win[0][1], ra = t.r + 0.05;
  const archTop = (x) => { for (const wx of [t.wf, t.wr]) if (Math.abs(x - wx) < ra) return t.r + Math.sqrt(ra * ra - (x - wx) ** 2) + 0.04; return BOTTOM + 0.08; };
  const seams = [t.win[0][0] + 0.02, ...t.pillars, ...(t.pillars.length ? [] : [t.win[3][0]])];
  for (const x of seams) for (const s of [1, -1]) {
    const y0 = archTop(x), y1 = belt - 0.02; if (y1 - y0 < 0.1) continue;
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.022, y1 - y0, 0.012), frameMat); seam.position.set(x, (y0 + y1) / 2, s * (t.W / 2 + 0.004)); g.add(seam);
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.03), frameMat); h.position.set(x - 0.22, belt - 0.12, s * (t.W / 2 + 0.01)); g.add(h);
  }
  const skirtL = (t.wf - ra) - (t.wr + ra) - 0.06;
  for (const s of [1, -1]) { const sk = new THREE.Mesh(new THREE.BoxGeometry(skirtL, 0.1, 0.03), frameMat); sk.position.set((t.wf + t.wr) / 2, BOTTOM + 0.05, s * (t.W / 2 - 0.005)); g.add(sk); }
  for (const wx of [t.wf, t.wr]) for (const s of [1, -1]) {
    const tire = new THREE.Mesh(P.tire, tireMat); tire.position.set(wx, t.r, s * (t.W / 2 - 0.16)); tire.castShadow = true;
    const rim = new THREE.Mesh(P.rim, rimMat); rim.position.copy(tire.position);
    g.add(tire, rim);
  }
  const front = t.top[0][0], rear = t.top[t.top.length - 1][0];
  for (const s of [1, -1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.32), headMat); hl.position.set(front + 0.01, t.hl, s * t.W * 0.33);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.3), tailMat); tl.position.set(rear - 0.03, t.tl, s * t.W * 0.36);
    const mir = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.2), paint(couleur)); mir.position.set(t.ws[0][0] - 0.12, t.ws[0][1] + 0.08, s * (t.W / 2 + 0.08));
    g.add(hl, tl, mir);
  }
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, t.W * 0.42), darkMat); grille.position.set(front + 0.005, t.hl - 0.12, 0); g.add(grille);
  const plateMat = new THREE.MeshStandardMaterial({ map: plateTexture(plaque), roughness: 0.5 });
  const pg = new THREE.PlaneGeometry(0.52, 0.11);
  const pf = new THREE.Mesh(pg, plateMat); pf.position.set(front + 0.045, 0.44, 0); pf.rotation.y = Math.PI / 2;
  const pr = new THREE.Mesh(pg, plateMat); pr.position.set(rear - 0.07, Math.min(0.62, t.tl - 0.2), 0); pr.rotation.y = -Math.PI / 2;
  g.add(pf, pr);
  g.userData.dims = { L: t.L, W: t.W, H: Math.max(...t.top.map((p) => p[1])) };
  return g;
}

export function setPaint(group, hex) {
  group.traverse((o) => { if (o.isMesh && o.userData.paint) o.material = paint(hex); });
}

// ---------- modeles .glb ----------
const loader = new GLTFLoader();
const glbCache = new Map();
export function loadModel(url) {
  if (!glbCache.has(url)) glbCache.set(url, loader.loadAsync(url).then((gltf) => gltf.scene));
  return glbCache.get(url);
}
// Recalage automatique : axe le plus long -> x, posé au sol, centré, mis à la longueur du type.
// Si la peinture est repérable (nom de matériau "paint", "body", "carrosserie"…), on applique la couleur.
export async function makeModelVehicle(url, { type, couleur, flip = false } = {}) {
  const src = await loadModel(url);
  const inner = src.clone(true);
  const box = new THREE.Box3().setFromObject(inner), size = box.getSize(new THREE.Vector3());
  if (size.z > size.x) inner.rotation.y = Math.PI / 2;
  if (flip) inner.rotation.y += Math.PI;
  const holder = new THREE.Group(); holder.add(inner);
  const b2 = new THREE.Box3().setFromObject(holder), s2 = b2.getSize(new THREE.Vector3()), c2 = b2.getCenter(new THREE.Vector3());
  const k = typeOf(type).L / Math.max(s2.x, 1e-6);
  holder.scale.setScalar(k);
  holder.position.set(-c2.x * k, -b2.min.y * k, -c2.z * k);
  const g = new THREE.Group(); g.name = 'vehicle'; g.add(holder);
  inner.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const n = ((o.material && o.material.name) || '') + ' ' + o.name;
    if (couleur && /paint|body|carros|carpaint|exterior|coque/i.test(n)) { o.material = o.material.clone(); o.material.color.set(couleur); }
  });
  const s3 = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
  g.userData.dims = { L: s3.x, W: s3.z, H: s3.y };
  g.userData.glb = true;
  return g;
}
