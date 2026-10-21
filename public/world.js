// Monde 3D : site (OpenStreetMap), batiment du garage + interieur (croquis), places, vehicules, mecanos.
// Repere monde : x = est, z = -nord, y = haut (metres). Le garage a son repere (u, v) : voir tools/build-site.js.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';
import { makeVehicle, makeModelVehicle, typeOf } from './cars.js';
import { toonify, OutlineRenderer, NO_OUTLINE } from './toon.js';
import { makePerson, animatePerson, Walker } from './people.js';
import { LOW, mergeStatic } from './perf.js';
import { assetUrl } from './store.js';

export const STATUT_COLORS = { attente: '#8a94a6', diagnostic: '#3b82f6', en_cours: '#f59e0b', attente_pieces: '#a855f7', termine: '#22c55e', rendu: '#475569' };
const LEVEL_COLORS = { ok: '#22c55e', bas: '#f59e0b', vide: '#ef4444' };

// ---------- textures procedurales ----------
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
const noise = (x, w, h, base, amp, n = 9000, size = 2) => {
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const v = (Math.random() - 0.5) * amp;
    x.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    x.fillRect(Math.random() * w, Math.random() * h, size, size);
  }
};
const TEX = {
  concrete: () => canvasTex(512, 512, (x, w, h) => {
    noise(x, w, h, '#9a9890', 0.08, 9000);
    for (let i = 0; i < 14; i++) { // taches d'huile
      const g = x.createRadialGradient(0, 0, 0, 0, 0, 30 + Math.random() * 50);
      g.addColorStop(0, 'rgba(40,35,30,0.22)'); g.addColorStop(1, 'rgba(40,35,30,0)');
      x.save(); x.translate(Math.random() * w, Math.random() * h); x.scale(1, 0.6 + Math.random()); x.fillStyle = g; x.beginPath(); x.arc(0, 0, 80, 0, 7); x.fill(); x.restore();
    }
    x.strokeStyle = 'rgba(0,0,0,0.18)'; x.lineWidth = 2; x.strokeRect(0, 0, w, h);
  }, [5, 5]),
  asphalt: () => canvasTex(512, 512, (x, w, h) => noise(x, w, h, '#7a7d81', 0.08, 12000, 2), [60, 60]),
  grass: () => canvasTex(256, 256, (x, w, h) => noise(x, w, h, '#6a8a45', 0.12, 4000, 3), [200, 200]),
  tole: () => canvasTex(256, 256, (x, w, h) => { // bardage nervure (vertical), bleu-gris-vert fonce
    x.fillStyle = '#4e6462'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i += 16) {
      const g = x.createLinearGradient(i, 0, i + 16, 0);
      g.addColorStop(0, '#5a716f'); g.addColorStop(0.45, '#485c5b'); g.addColorStop(0.55, '#3f5251'); g.addColorStop(1, '#576d6b');
      x.fillStyle = g; x.fillRect(i, 0, 16, h);
    }
    x.fillStyle = 'rgba(30,25,20,0.18)'; x.fillRect(0, h - 26, w, 26);
  }, [1, 1]),
  roof: (color) => canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = color; x.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i += 8) { x.fillStyle = i % 16 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.10)'; x.fillRect(i, 0, 4, h); }
  }, [8, 8]),
  poster: () => canvasTex(512, 720, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#f6a623'); g.addColorStop(0.45, '#d9481a'); g.addColorStop(1, '#1b1f4a');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,240,200,0.85)'; x.beginPath(); x.arc(w * 0.7, h * 0.28, 70, 0, 7); x.fill();
    x.fillStyle = '#f4f1e8'; // proto d'endurance stylise
    x.beginPath(); x.moveTo(40, 470); x.bezierCurveTo(120, 400, 250, 395, 330, 410); x.lineTo(470, 440); x.lineTo(480, 478); x.lineTo(40, 490); x.closePath(); x.fill();
    x.fillStyle = '#1b1f4a'; x.beginPath(); x.arc(130, 488, 34, 0, 7); x.arc(390, 488, 34, 0, 7); x.fill();
    x.fillStyle = '#d9481a'; x.fillRect(200, 430, 46, 40); x.fillStyle = '#fff'; x.font = 'bold 34px Arial'; x.fillText('22', 203, 462);
    x.fillStyle = '#fff'; x.textAlign = 'center';
    x.font = 'bold 92px "Arial Black", Impact, sans-serif'; x.fillText('24 H', w / 2, 140);
    x.font = 'bold 58px Impact, sans-serif'; x.fillText('DU MANS', w / 2, 210);
    x.font = '26px Georgia, serif'; x.fillText('Grand Prix d’Endurance', w / 2, 600);
    x.font = 'bold 30px Arial'; x.fillText('JUIN', w / 2, 650);
    x.strokeStyle = '#fff'; x.lineWidth = 8; x.strokeRect(14, 14, w - 28, h - 28);
  }),
  sign: (text, sub) => canvasTex(1024, 192, (x, w, h) => {
    x.fillStyle = '#b3141b'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#fff'; x.fillRect(0, h - 16, w, 6);
    x.font = 'bold 104px "Arial Black", Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, 82, w - 60);
    x.font = 'bold 34px Arial'; x.fillText(sub, w / 2, 160, w - 60);
  }),
  screen: () => canvasTex(256, 160, (x, w, h) => { // ecran du PC du bureau (CRM)
    x.fillStyle = '#10243e'; x.fillRect(0, 0, w, h); x.fillStyle = '#2e6fd8'; x.fillRect(0, 0, w, 22);
    x.fillStyle = '#fff'; x.font = 'bold 14px Arial'; x.fillText('CRM', 8, 16);
    x.fillStyle = '#8fb3e8'; for (let i = 0; i < 6; i++) x.fillRect(10, 34 + i * 20, 120 + Math.random() * 100, 8);
  }),
};

// ---------- utilitaires geometrie ----------
const matCache = new Map();
const M = (color, o = {}) => { const k = color + JSON.stringify(o); if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o })); return matCache.get(k); };
function ribbon(pts, w, y) { // polyligne -> bande
  const pos = [], idx = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    pos.push(p[0] - dz * w / 2, y, p[1] + dx * w / 2, p[0] + dz * w / 2, y, p[1] - dx * w / 2);
    if (i) { const k = i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0); // normales vers le haut
  const uv = []; for (let i = 0; i < pos.length / 3; i++) uv.push(pos[i * 3] / 4, pos[i * 3 + 2] / 4);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
function flatPoly(pts, y) { // polygone xz -> plaque horizontale
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ShapeGeometry(s); g.rotateX(-Math.PI / 2); g.translate(0, y, 0);
  const uv = g.attributes.uv, p = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 4, p.getZ(i) / 4);
  return g;
}
function hull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function rectLines(L, W, t = 0.1) { // contour de place (repere local de la place : x = longueur)
  const parts = [[L, t, 0, W / 2], [L, t, 0, -W / 2], [t, W, -L / 2, 0], [t, W, L / 2, 0]];
  return mergeGeometries(parts.map(([a, b, x, z]) => new THREE.PlaneGeometry(a, b).rotateX(-Math.PI / 2).translate(x, 0, z)));
}
const noOutline = (o) => { o.layers.set(NO_OUTLINE); return o; };

// ---------- reseau de circulation des mecanos (repere u, v, y) ----------
// Une allee centrale de la porte au fond (v = 9) et des branches vers les postes de travail.
const NAV = {
  D: [18.8, 9], S2: [15.8, 9], S3: [13.07, 9], S4: [10.0, 9], S5: [6.5, 9], S6: [4.85, 9], S7: [2.2, 9],
  OF: [15.8, 5.0], ST: [20.35, 6.2], STT: [20.35, 1.05, 2.9], LND: [20.35, 0.6, 2.9], PR: [18.6, 0.6, 2.9], PRC: [17.0, 1.25, 2.9], PRT: [14.2, 2.6, 2.9],
  RS: [13.07, 15.0], RSI: [13.07, 17.8], TI: [12.3, 6.4], P1S: [5.0, 5.0], P1U: [2.5, 5.0], P23A: [4.85, 14.0], P23B: [4.85, 18.4], P2U: [2.7, 18.4],
  P3E: [10.05, 14.6], P3F: [10.05, 18.4], P3U: [7.5, 18.4], WB: [1.6, 10.8], OIL: [1.35, 13.2], A1S: [7.6, 12.7], A2S: [6.5, 6.0],
};
const NAV_EDGES = 'D-S2 S2-S3 S3-S4 S4-S5 S5-S6 S6-S7 S2-OF D-ST ST-STT STT-LND LND-PR PR-PRC PRC-PRT S3-RS RS-RSI S3-TI S6-P1S P1S-P1U S6-P23A P23A-P23B P23B-P2U '
  + 'S4-P3E P3E-P3F P3F-P3U S7-WB S7-OIL P23A-A1S A1S-P3E S5-A2S';
// postes ou l'on travaille sur la voiture d'une place, et ce qu'on regarde
const SPOT_WORK = { P1: ['P1U', 'P1S'], P2: ['P2U', 'P23B'], P3: ['P3U', 'P3F'], A1: ['A1S'], A2: ['A2S'] };
const IDLE_POIS = [['WB', 0], ['OIL', 0], ['TI', -Math.PI / 2], ['RSI', Math.PI / 2], ['OF', -Math.PI / 2], ['PRC', -Math.PI / 2], ['PRT', 0], ['P1S', Math.PI], ['P3E', Math.PI / 2]];

export class World {
  constructor(canvas, labelsEl) {
    this.canvas = canvas; this.labelsEl = labelsEl;
    this.handlers = {};
    this.vehicles = new Map(); // id -> { group, key, spotId, label }
    this.spots = new Map();    // id -> { def, hit, tag }
    this.lifts = new Map();    // P1.. -> { car, y, target }
    this.mechanics = new Map(); // id -> { walker, label }
    this.labels = [];
    this.selected = null; this.moveMode = null; this.roofMode = 'auto'; this.drag = null;
    this.clock = new THREE.Clock();

    // telephone : pas d'antialias (les contours font le travail), resolution 1x, ombres plus legeres
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW, logarithmicDepthBuffer: !LOW, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1 : 1.5));
    r.shadowMap.enabled = true; r.shadowMap.type = LOW ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.NeutralToneMapping; r.toneMappingExposure = 1.0;
    this.outline = new OutlineRenderer(r, { samples: LOW ? 0 : 4 });
    // contours : il faut pouvoir rendre dans une texture en virgule flottante (sinon on s'en passe)
    if (!r.extensions.has('EXT_color_buffer_float') && !r.extensions.has('EXT_color_buffer_half_float')) this.outline.enabled = false;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#9fc4e8');
    this.scene.fog = new THREE.Fog('#9fc4e8', 260, 700);
    this.camera = new THREE.PerspectiveCamera(45, 1, LOW ? 0.6 : 0.3, LOW ? 1200 : 2000);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true; this.controls.maxPolarAngle = Math.PI * 0.49; this.controls.minDistance = 3; this.controls.maxDistance = 420;
    this.controls.screenSpacePanning = false;
    this.dirty = true; this.lastRender = 0;
    this.controls.addEventListener('change', () => { this.dirty = true; });
    this.scene.add(new THREE.HemisphereLight('#eef6ff', '#6b6a55', 1.3));
    const sun = this.sun = new THREE.DirectionalLight('#fff3dc', 2.2);
    sun.castShadow = true; sun.shadow.mapSize.setScalar(LOW ? 1024 : 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
    Object.assign(sun.shadow.camera, { left: -95, right: 95, top: 95, bottom: -95, near: 1, far: 400 });
    this.scene.add(sun, sun.target);
    this.raycaster = new THREE.Raycaster(); this.raycaster.layers.enableAll();
    this.pointer = new THREE.Vector2();
    this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.bindPointer();
    addEventListener('resize', () => this.resize()); this.resize();
  }
  on(ev, fn) { this.handlers[ev] = fn; }
  emit(ev, ...a) { this.handlers[ev] && this.handlers[ev](...a); }

  resize() {
    this.dirty = true;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h;
    this.camera.fov = w < h ? 62 : 45; // telephone en portrait : champ plus large
    this.camera.updateProjectionMatrix();
    this.outline.setSize(w, h);
  }

  // ======================= SITE =======================
  build(site) {
    this.site = site;
    const g = site.garage;
    this.gU = new THREE.Vector3(g.U[0], 0, g.U[1]); this.gV = new THREE.Vector3(g.V[0], 0, g.V[1]);
    this.gO = new THREE.Vector3(g.O[0], 0, g.O[1]);
    this.uv = (u, v, y = 0) => this.gO.clone().addScaledVector(this.gU, u).addScaledVector(this.gV, v).setY(y);
    this.interiorCenter = this.uv(g.width / 2, g.interior.len / 2, 0);
    this.sun.position.copy(this.interiorCenter).add(new THREE.Vector3(-70, 120, 60));
    this.sun.target.position.copy(this.interiorCenter);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshStandardMaterial({ map: TEX.grass(), roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.scene.add(ground);
    this.buildLot(site); this.buildRoads(site); this.buildBuildings(site); this.buildVegetation(site);
    this.buildGarage(g); this.buildSpots(site); this.buildVisitor(g);
    toonify(this.scene);
    const moving = new Set([...this.lifts.values()].map((l) => l.car));
    const a = mergeStatic(this.garage, (o) => o === this.roofGarage || moving.has(o) || o.userData.crm || o.userData.stock);
    const b = mergeStatic(this.roofGarage);
    const c = mergeStatic(this.scene, (o) => o === this.garage || o === this.visitor);
    console.info(`[perf] maillages fusionnes : atelier ${a.before}→${a.after}, toit ${b.before}→${b.after}, site ${c.before}→${c.after}`);
    this.view('site', true);
    this.loop();
  }

  buildLot(site) {
    const c = this.interiorCenter, pts = [];
    const take = (arr) => { for (const e of arr) for (const p of e.pts) if (Math.hypot(p[0] - c.x, p[1] - c.z) < 105) pts.push(p); };
    take(site.parkings); take(site.buildings); take(site.roads.filter((r) => r.kind === 'service'));
    for (const [u, v] of [[-8, -8], [30, -8], [30, 55], [-8, 55]]) { const p = this.uv(u, v); pts.push([p.x, p.z]); }
    const asphaltMat = new THREE.MeshStandardMaterial({ map: TEX.asphalt(), roughness: 0.95 });
    asphaltMat.map.repeat.set(0.25, 0.25);
    const lot = new THREE.Mesh(flatPoly(hull(pts), 0.04), asphaltMat); lot.receiveShadow = true; this.scene.add(lot);
    const pkMat = new THREE.MeshStandardMaterial({ map: asphaltMat.map, color: '#d8d8d8', roughness: 0.95 });
    for (const p of site.parkings) {
      if (p.pts.length < 3) continue;
      const m = new THREE.Mesh(flatPoly(p.pts, 0.08), p.yard ? M('#9b9a8f') : pkMat); m.receiveShadow = true; this.scene.add(m);
    }
  }

  buildRoads(site) {
    const roadMat = new THREE.MeshStandardMaterial({ map: TEX.asphalt(), color: '#9a9a9a', roughness: 0.9 });
    roadMat.map.repeat.set(0.25, 0.25);
    const footMat = M('#b8b2a4');
    const geos = { road: [], foot: [] };
    for (const r of site.roads) (r.kind === 'footway' || r.kind === 'path' ? geos.foot : geos.road).push(ribbon(r.pts, r.w, r.kind === 'footway' || r.kind === 'path' ? 0.14 : 0.11));
    for (const [k, mat] of [['road', roadMat], ['foot', footMat]]) {
      if (!geos[k].length) continue;
      const m = new THREE.Mesh(mergeGeometries(geos[k]), mat); m.receiveShadow = true; this.scene.add(m);
    }
  }

  buildBuildings(site) {
    const wall = M('#d9d6cc'), wallOpen = M('#8e8e8e');
    for (const b of site.buildings) {
      if (b.pts.length < 3) continue;
      const shape = new THREE.Shape(b.pts.map(([x, z]) => new THREE.Vector2(x, -z)));
      const roofMat = new THREE.MeshStandardMaterial({ map: TEX.roof(b.roof || (b.open ? '#7a7f86' : '#9a9da2')), roughness: 0.7 });
      let mesh;
      if (b.open) { // auvent : toit seul
        const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.25, bevelEnabled: false }); geo.rotateX(-Math.PI / 2); geo.translate(0, b.h, 0);
        mesh = new THREE.Mesh(geo, [roofMat, wallOpen]);
        for (const p of b.pts) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, b.h, 0.2), wallOpen); post.position.set(p[0], b.h / 2, p[1]); this.scene.add(post); }
      } else {
        const geo = new THREE.ExtrudeGeometry(shape, { depth: b.h, bevelEnabled: false }); geo.rotateX(-Math.PI / 2);
        mesh = new THREE.Mesh(geo, [roofMat, wall]);
      }
      mesh.castShadow = mesh.receiveShadow = true; this.scene.add(mesh);
      if (b.name) {
        const c = b.pts.reduce((a, p) => [a[0] + p[0] / b.pts.length, a[1] + p[1] / b.pts.length], [0, 0]);
        this.addLabel(`<b>${b.name}</b>${b.sub ? `<small>${b.sub}</small>` : ''}`, new THREE.Vector3(c[0], b.h + 2, c[1]), 'bld', 320);
      }
    }
    const neo = site.pois.find((p) => p.name === 'NeoNett');
    if (neo) this.addLabel('<b>NeoNett</b><small>Nettoyage auto</small>', new THREE.Vector3(neo.x, 10, neo.z), 'bld', 320);
  }

  buildVegetation(site) {
    const pts = [];
    for (const h of site.hedges) for (let i = 1; i < h.pts.length; i++) {
      const [a, b] = [h.pts[i - 1], h.pts[i]], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let s = 0; s < l; s += 7) pts.push([a[0] + (b[0] - a[0]) * s / l + (Math.random() - 0.5) * 2, a[1] + (b[1] - a[1]) * s / l + (Math.random() - 0.5) * 2]);
    }
    // bosquets visibles sur la vue aerienne (cote ouest / nord-ouest et rond-point)
    for (let i = 0; i < 40; i++) { const p = this.uv(-48 - Math.random() * 25, -30 + Math.random() * 90); pts.push([p.x, p.z]); }
    const oca = site.buildings.find((b) => b.name === 'Ocaburo');
    if (oca) { const c = oca.pts.reduce((a, p) => [a[0] + p[0] / oca.pts.length, a[1] + p[1] / oca.pts.length], [0, 0]); for (let i = pts.length - 1; i >= 0; i--) if (Math.hypot(pts[i][0] - c[0], pts[i][1] - c[1]) < 32) pts.splice(i, 1); }
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.25, 2.6, 6), M('#5b4632'), pts.length);
    const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.6, 1), M('#4f8a36', { flatShading: true }), pts.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    pts.forEach(([x, z], i) => {
      const s = 0.7 + Math.random() * 0.8;
      m4.compose(new THREE.Vector3(x, 1.3 * s, z), q, new THREE.Vector3(s, s, s)); trunk.setMatrixAt(i, m4);
      m4.compose(new THREE.Vector3(x, 3.6 * s, z), q, new THREE.Vector3(s, s * 0.9, s)); crown.setMatrixAt(i, m4);
    });
    trunk.castShadow = crown.castShadow = true;
    this.scene.add(trunk, crown);
  }

  // ======================= GARAGE =======================
  buildGarage(g) {
    const I = g.interior, W = g.width, L = g.length, H = g.height, R = g.ridge;
    const grp = this.garage = new THREE.Group();
    grp.position.copy(this.gO);
    grp.rotation.y = Math.atan2(-g.U[1], g.U[0]);
    this.scene.add(grp);
    const box = (u0, u1, v0, v1, y0, y1, mat, parent = grp) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.01, u1 - u0), Math.max(0.01, y1 - y0), Math.max(0.01, v1 - v0)), mat);
      m.position.set((u0 + u1) / 2, (y0 + y1) / 2, -(v0 + v1) / 2); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
    };
    const at = (obj, u, y, v, rotY = 0, parent = grp) => { obj.position.set(u, y, -v); obj.rotation.y = rotY; parent.add(obj); return obj; };
    this.gBox = box; this.gAt = at;
    const T = 0.2;
    const tole = new THREE.MeshStandardMaterial({ map: TEX.tole(), roughness: 0.55, metalness: 0.2 });
    tole.map.repeat.set(6, 1);
    // pignon (pentagone) d'epaisseur T entre v0 et v0 + T, avec ouvertures eventuelles [u0, u1, hauteur]
    const gable = (v0, mat, holes = []) => {
      const s = new THREE.Shape([[0, 0], [W, 0], [W, H], [W / 2, R], [0, H]].map(([x, y]) => new THREE.Vector2(x, y)));
      for (const [a, b, h] of holes) s.holes.push(new THREE.Path([[a, 0.01], [b, 0.01], [b, h], [a, h]].map(([x, y]) => new THREE.Vector2(x, y))));
      const geo = new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: false });
      const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 4, uv.getY(i) / 6);
      const m = new THREE.Mesh(geo, mat); m.position.z = -(v0 + T); m.castShadow = m.receiveShadow = true; grp.add(m); return m;
    };
    // sol
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, I.len), new THREE.MeshStandardMaterial({ map: TEX.concrete(), roughness: 0.85 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(W / 2, 0.025, -I.len / 2); floor.receiveShadow = true; grp.add(floor);
    const floorN = new THREE.Mesh(new THREE.PlaneGeometry(W, L - I.len), M('#8d8b84')); floorN.rotation.x = -Math.PI / 2;
    floorN.position.set(W / 2, 0.02, -(I.len + L) / 2); grp.add(floorN);
    // murs (bardage) : longs pans jusqu'a l'egout, pignons jusqu'au faitage
    const D = I.door, SD = I.sideDoor, DH = 4.3;
    box(W - T, W, 0, D.v0, 0, H, tole); box(W - T, W, D.v1, L, 0, H, tole); box(W - T, W, D.v0, D.v1, DH, H, tole); // mur SE (entree)
    box(0, T, 0, L, 0, H, tole);                                                                                     // mur NO (fond)
    gable(0, tole, [[SD.u0, SD.u1, 2.15]]);                                                                          // facade SO
    gable(L - T, tole);                                                                                              // pignon NE
    gable(I.len - 0.1, M('#b7b4aa'));                                                                                // cloison avec le voisin
    // porte sectionnelle relevee + cadre
    const doorMat = M('#e8e6df', { roughness: 0.5, metalness: 0.4 });
    box(W - 0.6, W - 0.2, D.v0, D.v1, DH, DH + 0.55, doorMat);
    box(W - 0.25, W + 0.05, D.v0 - 0.12, D.v0, 0, DH, M('#333'));
    box(W - 0.25, W + 0.05, D.v1, D.v1 + 0.12, 0, DH, M('#333'));
    box(SD.u0, SD.u1, -0.02, 0.04, 0, 2.15, M('#2c4a6b'));   // porte clients (bureau)
    box(W - 0.02, W + 0.04, 30, 34.5, 0, 4, doorMat);         // porte du voisin
    // toit a deux pans, faitage dans la longueur (celui de l'atelier se masque pour voir dedans)
    const roofGray = new THREE.MeshStandardMaterial({ map: TEX.roof('#8e9297'), roughness: 0.7 });
    const roofBlue = new THREE.MeshStandardMaterial({ map: TEX.roof('#3e639e'), roughness: 0.6 });
    const sky = M('#dfe6ea', { roughness: 0.2 });
    const slopeLen = Math.hypot(W / 2, R - H) + 0.5, ang = Math.atan2(R - H, W / 2);
    const roof = (v0, v1, mat, parent, skylights) => {
      for (const side of [1, -1]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.2, v1 - v0), mat);
        p.position.set(W / 2 - side * (W / 4 + 0.12), (H + R) / 2 + 0.1, -(v0 + v1) / 2);
        p.rotation.z = side * ang; p.castShadow = p.receiveShadow = true; parent.add(p);
        if (skylights) for (let v = v0 + 2.5; v < v1 - 2; v += 5) {
          const s = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.05, 1.2), sky); s.position.set(-side * 1.2, 0.12, -((v + 0.6) - (v0 + v1) / 2)); p.add(s);
        }
      }
    };
    this.roofGarage = new THREE.Group(); grp.add(this.roofGarage);
    roof(-0.3, I.len, roofGray, this.roofGarage, true);
    roof(I.len, 34, roofGray, grp, true);
    roof(34, L + 0.3, roofBlue, grp, false);
    // enseignes
    const signSE = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.3), new THREE.MeshStandardMaterial({ map: TEX.sign('AUTO SELF GARAGE', 'MÉCANIQUE · LIBRE-SERVICE · PNEUS — RCA'), roughness: 0.5 }));
    at(signSE, W + 0.03, 5.2, (D.v0 + D.v1) / 2, Math.PI / 2);
    const signSO = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.6), signSE.material);
    at(signSO, W / 2, 5.3, -0.03, Math.PI);

    this.buildInterior(g);
    this.addLabel('<b>AUTO SELF GARAGE</b><small>SARL RCA · atelier</small>', this.uv(W / 2, I.len / 2, R + 3), 'garage', 500);
  }

  buildInterior(g) {
    const I = g.interior, W = g.width, box = this.gBox, at = this.gAt, grp = this.garage;
    const plaster = M('#efece4'), tile = M('#e9eef0'), wood = M('#a37446'), red = M('#c62828', { roughness: 0.4, metalness: 0.3 });
    const blue = M('#1f5fa8', { roughness: 0.45, metalness: 0.4 }), steel = M('#9aa0a6', { roughness: 0.35, metalness: 0.8 }), black = M('#222');
    const white = M('#ffffff', { roughness: 0.2 });
    const glass = new THREE.MeshStandardMaterial({ color: '#9fc3d6', transparent: true, opacity: 0.25, roughness: 0.05, depthWrite: false });
    // ---- ponts elevateurs 2 colonnes ----
    for (const l of I.lifts) {
      const lg = new THREE.Group(); grp.add(lg);
      const vm = (l.v0 + l.v1) / 2, um = (l.u0 + l.u1) / 2;
      for (const u of [l.u0 - 0.2, l.u1 + 0.2]) {
        box(u - 0.2, u + 0.2, vm - 0.25, vm + 0.25, 0, 3.9, blue, lg);
        box(u - 0.3, u + 0.3, vm - 0.35, vm + 0.35, 0, 0.08, black, lg);
      }
      box(l.u0 - 0.4, l.u1 + 0.4, vm - 0.15, vm + 0.15, 3.9, 4.15, blue, lg); // traverse haute
      const car = new THREE.Group(); lg.add(car);
      for (const u of [l.u0 - 0.2, l.u1 + 0.2]) {
        box(u - 0.26, u + 0.26, vm - 0.32, vm + 0.32, 0.1, 0.75, M('#ffb300'), car); // chariot
        const sgn = u < um ? 1 : -1;
        for (const dv of [-1.25, 1.25]) { // bras
          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 1), steel);
          const ue = um - sgn * 0.45, ve = vm + dv, us = u + sgn * 0.15;
          arm.scale.z = Math.hypot(ue - us, dv); arm.position.set((us + ue) / 2, 0.12, -(vm + ve) / 2);
          arm.rotation.y = Math.atan2(-(ve - vm), ue - us) - Math.PI / 2; arm.castShadow = true; car.add(arm);
          const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 10), black); pad.position.set(ue, 0.18, -ve); car.add(pad);
        }
      }
      this.addLabel(`<b>${l.name}</b>`, this.uv(um, vm, 4.6), 'zone', 60);
      this.lifts.set(l.id, { car, y: 0, target: 0 });
      const sv = new THREE.Group(); // servante d'outillage
      box(-0.38, 0.38, -0.23, 0.23, 0.12, 1.0, red, sv);
      for (let k = 0; k < 5; k++) box(-0.36, 0.36, -0.235, -0.225, 0.2 + k * 0.16, 0.24 + k * 0.16, steel, sv);
      box(-0.4, 0.4, -0.25, 0.25, 1.0, 1.04, black, sv);
      at(sv, l.u0 > W / 2 ? l.u0 - 1.0 : l.u1 + 1.0, 0, l.v0 + 0.6);
    }
    // ---- bureau (a gauche en entrant, contre la facade SO) ----
    const O = I.office, wallH = 2.75, t = 0.12, SDo = I.sideDoor;
    box(O.u0, O.u0 + t, 0.2, O.v1, 0, 0.9, plaster); box(O.u0, O.u0 + t, 0.2, O.v1, 2.2, wallH, plaster);          // vitre sur l'atelier
    noOutline(box(O.u0 + 0.02, O.u0 + 0.04, 0.2, O.v1, 0.9, 2.2, glass));
    const odu = O.u1 - 1.6;                                                                                          // porte cote entree
    box(O.u0, odu, O.v1 - t, O.v1, 0, wallH, plaster); box(odu + 0.9, O.u1, O.v1 - t, O.v1, 0, wallH, plaster); box(odu, odu + 0.9, O.v1 - t, O.v1, 2.1, wallH, plaster);
    box(SDo.u0 - 0.6, SDo.u1 + 0.6, 1.1, 1.8, 0, 1.05, M('#5b4c3e'));                                                // comptoir face a la porte clients
    box(SDo.u0 - 0.7, SDo.u1 + 0.7, 1.0, 1.9, 1.05, 1.1, wood);
    const du = O.u0 + 0.5;
    box(du, du + 2, 2.7, 3.5, 0.72, 0.76, wood); for (const [a, b] of [[du + 0.05, 2.75], [du + 1.9, 2.75], [du + 0.05, 3.4], [du + 1.9, 3.4]]) box(a, a + 0.05, b, b + 0.05, 0, 0.72, black);
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.38, 0.04), [black, black, black, black, black, new THREE.MeshBasicMaterial({ map: TEX.screen() })]);
    at(screen, du + 1, 0.98, 3.28, Math.PI); screen.userData.crm = true; this.crmScreen = screen;
    box(du + 0.97, du + 1.03, 3.2, 3.3, 0.76, 0.8, black);
    const chair = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.08, 12), black); at(chair, du + 1, 0.48, 2.3);
    box(O.u1 - 0.5, O.u1 - 0.15, 2.4, 4.0, 0, 1.9, M('#7c8a99'));                                                  // armoire a classeurs
    this.addLabel('<b>Bureau</b><small>poste CRM</small>', this.uv((O.u0 + O.u1) / 2, (O.v0 + O.v1) / 2, 2.4), 'zone', 50);
    // ---- toilettes ----
    const Tt = I.toilets, tdu = Tt.u0 + 0.6;
    box(Tt.u0, Tt.u0 + t, 0.2, Tt.v1, 0, wallH, tile);
    box(Tt.u0, tdu, Tt.v1 - t, Tt.v1, 0, wallH, tile); box(tdu + 0.8, Tt.u1, Tt.v1 - t, Tt.v1, 0, wallH, tile); box(tdu, tdu + 0.8, Tt.v1 - t, Tt.v1, 2.1, wallH, tile);
    box(Tt.u1 - t, Tt.u1, 0.2, Tt.v1, 0, wallH, tile);
    box(tdu, tdu + 0.8, Tt.v1 - 0.09, Tt.v1 - 0.05, 0, 2.1, M('#5d6d7e'));
    const wc = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.42, 14), white); at(wc, Tt.u1 - 0.75, 0.21, 1.2);
    box(Tt.u1 - 0.45, Tt.u1 - 0.25, 0.95, 1.45, 0.42, 0.85, white);
    box(Tt.u0 + 0.3, Tt.u0 + 0.75, 0.25, 0.7, 0.8, 0.9, white);
    this.consLabels = {
      pq: this.addLabel('', this.uv(Tt.u1 - 0.75, 1.2, 2.3), 'cons', 70),
      savon: this.addLabel('', this.uv(Tt.u0 + 0.5, 0.5, 2.3), 'cons', 70),
    };
    // ---- escalier (le long du mur d'entree) + etage : salle de pause ----
    const Z = I.stairs, MZ = I.mezz, n = 16, rise = MZ.h / n, run = (Z.vFoot - Z.vTop) / n;
    for (let i = 0; i < n; i++) {
      const v1 = Z.vFoot - i * run, v0 = v1 - run, y = (i + 1) * rise;
      box(Z.u0, Z.u1, v0, v1, y - 0.06, y, M('#6d6d6d', { metalness: 0.5 }));
    }
    const strLen = Math.hypot(Z.vFoot - Z.vTop, MZ.h);
    for (const u of [Z.u0 - 0.03, Z.u1 + 0.03]) { // limons
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, strLen), M('#3d3d3d', { metalness: 0.5 }));
      s.position.set(u, MZ.h / 2, -(Z.vFoot + Z.vTop) / 2); s.rotation.x = -Math.atan2(MZ.h, Z.vFoot - Z.vTop); s.castShadow = true; grp.add(s);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, strLen), M('#f2c200'));
    rail.position.set(Z.u0 - 0.03, MZ.h / 2 + 1.0, -(Z.vFoot + Z.vTop) / 2); rail.rotation.x = -Math.atan2(MZ.h, Z.vFoot - Z.vTop); grp.add(rail);
    // plancher de la mezzanine (tremie au-dessus de l'escalier)
    box(MZ.u0, Z.u0, MZ.v0 + 0.2, MZ.v1, MZ.h - 0.15, MZ.h, M('#7a6a58'));
    box(Z.u0, MZ.u1 - 0.2, MZ.v0 + 0.2, Z.vTop, MZ.h - 0.15, MZ.h, M('#7a6a58'));
    box(MZ.u0, MZ.u1 - 0.2, MZ.v1 - 0.25, MZ.v1, MZ.h - 0.45, MZ.h - 0.15, M('#3d3d3d', { metalness: 0.5 })); // poutre de rive
    for (const u of [MZ.u0 + 0.1, (MZ.u0 + Z.u0) / 2]) box(u - 0.1, u + 0.1, MZ.v1 - 0.2, MZ.v1, 0, MZ.h - 0.45, M('#3d3d3d'));
    // salle de pause : murs avec grandes vitres sur l'atelier
    const y0 = MZ.h, y1 = MZ.h + 2.4, pr = { u0: MZ.u0, u1: Z.u0, v0: 0.2, v1: MZ.v1 };
    const wallWin = (u0, u1, v0, v1) => { box(u0, u1, v0, v1, y0, y0 + 1.0, plaster); noOutline(box(u0, u1, v0, v1, y0 + 1.0, y1 - 0.3, glass)); box(u0, u1, v0, v1, y1 - 0.3, y1, plaster); };
    wallWin(pr.u0, pr.u1, pr.v1 - t, pr.v1); wallWin(pr.u0, pr.u0 + t, pr.v0, pr.v1);
    box(pr.u1 - t, pr.u1, Z.vTop + 0.1, pr.v1, y0, y1, plaster); box(pr.u1 - t, pr.u1, pr.v0, 0.25, y0, y1, plaster); // ouverture sur le palier
    box(pr.u0, MZ.u1 - 0.2, pr.v0, pr.v1, y1, y1 + 0.06, plaster);
    box(Z.u0, MZ.u1 - 0.2, Z.vTop - 0.04, Z.vTop, y0, y0 + 1.0, M('#f2c200'));  // garde-corps du palier
    box(pr.u0 + 2.4, pr.u0 + 4.4, 1.6, 2.8, y0 + 0.72, y0 + 0.76, M('#d9cbb0')); box(pr.u0 + 3.35, pr.u0 + 3.45, 2.15, 2.25, y0, y0 + 0.72, black); // table
    for (const [a, b] of [[pr.u0 + 2.1, 2.2], [pr.u0 + 4.7, 2.2], [pr.u0 + 3.4, 1.2], [pr.u0 + 3.4, 3.2]]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.45, 12), M('#c0392b')); at(st, a, y0 + 0.23, b); }
    box(pr.u0 + 0.2, pr.u0 + 1.0, 0.6, 3.2, y0, y0 + 0.45, M('#35557a')); box(pr.u0 + 0.15, pr.u0 + 0.35, 0.6, 3.2, y0 + 0.45, y0 + 0.95, M('#35557a')); // canape
    box(pr.u1 - 3.6, pr.u1 - 0.4, 0.25, 0.85, y0, y0 + 0.9, M('#e8e2d6')); box(pr.u1 - 3.65, pr.u1 - 0.35, 0.2, 0.9, y0 + 0.9, y0 + 0.95, M('#5b4c3e')); // plan de travail
    const cafeU = pr.u1 - 2.4;
    box(cafeU - 0.18, cafeU + 0.18, 0.3, 0.7, y0 + 0.95, y0 + 1.4, M('#1f1f1f')); box(cafeU - 0.06, cafeU + 0.06, 0.66, 0.72, y0 + 1.25, y0 + 1.33, M('#c0c0c0')); // machine a cafe
    box(pr.u1 - 1.4, pr.u1 - 0.7, 0.3, 0.75, y0 + 0.95, y0 + 1.33, M('#d0d0d0')); // micro-ondes
    box(pr.u1 - 1.0, pr.u1 - 0.3, pr.v1 - 0.9, pr.v1 - 0.2, y0, y0 + 1.75, white); // frigo
    this.consLabels.cafe = this.addLabel('', this.uv(cafeU, 0.5, y0 + 1.9), 'cons', 70);
    this.addLabel('<b>Salle de pause</b><small>à l’étage</small>', this.uv((pr.u0 + pr.u1) / 2, 2.2, y1 + 0.6), 'zone', 60);
    // ---- reserve (a droite en entrant) ----
    const S = I.stock, rackO = M('#e8701a', { metalness: 0.4, roughness: 0.5 }), rackB = M('#2156a5', { metalness: 0.4, roughness: 0.5 });
    const sd0 = S.u0 + 1.4, sd1 = S.u0 + 3.2;
    box(S.u0 - t, S.u0, S.v0, S.v1, 0, 3.2, plaster);
    box(S.u0 - t, sd0, S.v0, S.v0 + t, 0, 3.2, plaster); box(sd1, S.u1 - 0.2, S.v0, S.v0 + t, 0, 3.2, plaster); box(sd0, sd1, S.v0, S.v0 + t, 2.4, 3.2, plaster);
    const cartons = [M('#c49a6c'), M('#b88a5a'), M('#d2aa7a')], tireMat = M('#151515', { roughness: 0.95 });
    const tireGeo = new THREE.TorusGeometry(0.28, 0.1, 8, 16);
    const racks = [0.2, 3.4, 4.4, 7.5, 8.5].map((x) => S.u0 + x);
    racks.forEach((u, ri) => {
      const tires = ri === racks.length - 1;
      const v0 = S.v0 + 0.6, v1 = S.v1 - 0.4, u1 = u + 0.9;
      for (const v of [v0, (v0 + v1) / 2, v1]) for (const uu of [u, u1 - 0.08]) box(uu, uu + 0.08, v - 0.04, v + 0.04, 0, 2.9, rackO);
      for (let k = 0; k < 4; k++) {
        const y = 0.15 + k * 0.85;
        box(u, u1, v0, v1, y, y + 0.06, rackB);
        if (k === 3 && tires) continue;
        for (let v = v0 + 0.15; v < v1 - 0.5; v += 0.62 + Math.random() * 0.2) {
          if (tires) { const tr = new THREE.Mesh(tireGeo, tireMat); tr.rotation.y = Math.PI / 2; at(tr, u + 0.45, y + 0.42, v + 0.3); tr.castShadow = true; }
          else if (Math.random() > 0.15) box(u + 0.08, u1 - 0.08 - Math.random() * 0.2, v, v + 0.45 + Math.random() * 0.1, y + 0.06, y + 0.3 + Math.random() * 0.35, cartons[k % 3]);
        }
      }
    });
    const stockHit = noOutline(box(S.u0, S.u1 - 0.2, S.v0, S.v1, 0, 3.2, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })));
    stockHit.castShadow = stockHit.receiveShadow = false; stockHit.userData.stock = true; this.stockHit = stockHit;
    this.stockLabel = this.addLabel('<b>Réserve</b>', this.uv((S.u0 + S.u1) / 2, (S.v0 + S.v1) / 2, 4), 'zone', 60);
    this.addLabel('<b>WC</b>', this.uv((Tt.u0 + Tt.u1) / 2, (Tt.v0 + Tt.v1) / 2, 2.0), 'zone', 40);
    // ---- mur dans le prolongement du bureau (1/3 de la longueur), jusque sous le toit : separe l'entree de l'atelier du fond ----
    const HW = { u: O.u0, v0: O.v1, v1: I.len / 3 };
    const hwTop = I.mezz.h + 2.46; // jusqu'en haut de la salle de pause
    box(HW.u - 0.06, HW.u + 0.06, HW.v0, HW.v1, 0, hwTop, plaster);
    // ---- poste pneus contre ce mur, cote bureau / entree : demonte-pneus + equilibreuse + pneus ----
    const dp = new THREE.Group();
    box(-0.45, 0.45, -0.35, 0.35, 0, 0.95, red, dp); const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.06, 20), steel); plate.position.y = 0.98; dp.add(plate);
    box(-0.08, 0.08, 0.2, 0.36, 0.95, 1.9, red, dp); box(-0.06, 0.06, -0.15, 0.3, 1.8, 1.9, red, dp);
    at(dp, HW.u + 0.6, 0, HW.v0 + 0.9);
    const eq = new THREE.Group();
    box(-0.4, 0.4, -0.3, 0.3, 0, 1.0, M('#dcdcdc'), eq); const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 8), steel); shaft.rotation.z = Math.PI / 2; shaft.position.set(0.55, 0.75, 0); eq.add(shaft);
    box(-0.3, 0.3, 0.05, 0.25, 1.0, 1.4, black, eq);
    at(eq, HW.u + 0.55, 0, HW.v0 + 2.3);
    for (let k = 0; k < 7; k++) { const tr = new THREE.Mesh(tireGeo, tireMat); tr.rotation.x = Math.PI / 2; at(tr, HW.u + 1.6 + (k % 2) * 0.75, 0.1 + Math.floor(k / 2) * 0.21, HW.v0 + 1.0).castShadow = true; }
    // ---- fond (mur NO) : etabli, etageres d'huile moteur, compresseur ----
    box(0.2, 0.95, 9.4, 12.2, 0.85, 0.92, wood); for (const v of [9.5, 12.0]) box(0.3, 0.85, v, v + 0.1, 0, 0.85, steel);
    box(0.2, 0.25, 9.4, 12.2, 1.2, 2.0, M('#5a6b4a')); // panneau a outils
    box(0.5, 0.75, 10.0, 10.25, 0.92, 1.1, M('#2e4d8a'));  // etau
    this.buildOilShelves(box);
    const comp = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.3, 16), M('#c62828', { metalness: 0.5, roughness: 0.4 }));
    comp.rotation.x = Math.PI / 2; at(comp, 0.7, 0.45, 14.75).castShadow = true;
    for (const [u, v, c] of [[9.6, 15.2, '#1565c0'], [10.2, 15.25, '#2e7d32']]) { const f = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.88, 14), M(c, { metalness: 0.4 })); at(f, u, 0.44, v).castShadow = true; }
    const ext = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.55, 10), red); at(ext, W - 0.35, 1.2, I.door.v0 - 0.4);
    // ---- poster du Mans (mur en tole de l'entree, cote interieur) ----
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.25), new THREE.MeshStandardMaterial({ map: TEX.poster(), roughness: 0.6 }));
    at(poster, W - 0.215, 2.6, I.poster.v, -Math.PI / 2);
    // ---- eclairage (reglettes), sauf au-dessus de la mezzanine ----
    const tube = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#f4f8ff', emissiveIntensity: 2 });
    for (let u = 4; u < W; u += 6) for (let v = 3; v < I.len - 1; v += 5) if (!(u > MZ.u0 - 0.5 && v < MZ.v1 + 0.8)) box(u - 0.08, u + 0.08, v - 0.8, v + 0.8, 5.2, 5.28, tube);
    // ---- marquage au sol : allee de circulation, de la porte au fond ----
    const yellow = M('#e8b923', { roughness: 0.6 });
    for (const v of [I.door.v0 - 0.1, I.door.v1 + 0.1]) box(4.5, W - 0.4, v - 0.05, v + 0.05, 0.03, 0.035, yellow);
  }

  // etageres pleines de bidons d'huile moteur, contre le mur du fond et au-dessus de l'etabli
  buildOilShelves(box) {
    const frame = M('#4a4f57', { metalness: 0.5 }), plank = M('#7b6a55');
    const jugs = [];
    const shelf = (u0, u1, v0, v1, levels, y0, dy) => {
      for (const v of [v0, v1 - 0.05]) for (const u of [u0, u1 - 0.05]) box(u, u + 0.05, v, v + 0.05, y0 > 0.5 ? y0 - 0.1 : 0, y0 + dy * levels, frame);
      for (let k = 0; k < levels; k++) {
        const y = y0 + k * dy; box(u0, u1, v0, v1, y - 0.03, y, plank);
        for (let v = v0 + 0.12; v < v1 - 0.12; v += 0.17) for (let u = u0 + 0.1; u < u1 - 0.08; u += 0.2) jugs.push([u, y, v]);
      }
    };
    shelf(0.2, 0.55, 0.4, this.site.garage.interior.len - 0.4, 2, 2.15, 0.42); // tout le long du mur du fond
    const brands = ['#d32f2f', '#1b5e20', '#0d47a1', '#f9a825', '#212121', '#e65100', '#6a1b9a', '#c0c0c0'];
    const body = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.28, 0.12), M('#ffffff', { roughness: 0.4 }), jugs.length);
    const cap = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.025, 0.025, 0.04, 8), M('#ffffff'), jugs.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), c = new THREE.Color();
    jugs.forEach(([u, y, v], i) => {
      m4.compose(new THREE.Vector3(u, y + 0.14, -v), q, one); body.setMatrixAt(i, m4);
      m4.compose(new THREE.Vector3(u + 0.03, y + 0.3, -v), q, one); cap.setMatrixAt(i, m4);
      // les bidons d'une meme marque sont ranges par paquets
      body.setColorAt(i, c.set(brands[(Math.floor(v * 1.6) + Math.floor(y * 3)) % brands.length]));
      cap.setColorAt(i, c.set(i % 3 ? '#222222' : '#e0e0e0'));
    });
    body.castShadow = true;
    this.garage.add(body, cap);
  }

  // client qui attend devant la porte : un clic ouvre l'accueil (nouvelle voiture / nouveau client)
  buildVisitor(g) {
    const p = this.visitor = makePerson({ couleur: '#c9a227', pantalon: '#2b3a55', casquette: false });
    p.position.copy(this.uv(g.entrance.u, g.entrance.v));
    p.rotation.y = Math.atan2(-this.gU.z, this.gU.x) + Math.PI; // face a la porte
    p.traverse((o) => { o.userData.visitor = true; });
    this.scene.add(p);
    this.visitorLabel = this.addLabel('<b>🙋 Un client attend</b><small>clic : nouvelle arrivée</small>', this.uv(g.entrance.u, g.entrance.v, 2.4), 'visitor', 140);
  }

  // ======================= PLACES =======================
  buildSpots(site) {
    const white = new THREE.MeshBasicMaterial({ color: '#f2f2ee' }), yellow = new THREE.MeshBasicMaterial({ color: '#f0c419' });
    const lineGeos = { white: [], yellow: [] };
    for (const s of site.spots) {
      const parallel = s.zone === 'Allée atelier';
      const [L, Wd] = s.kind === 'pont' ? [7, 3.3] : parallel ? [5.6, 2.2] : [5.0, 2.5];
      if (s.kind !== 'pont') {
        const g = rectLines(L, Wd, 0.1).rotateY(s.yaw).translate(s.x, s.kind === 'atelier' ? 0.05 : 0.16, s.z);
        (s.kind === 'atelier' ? lineGeos.yellow : lineGeos.white).push(g);
      }
      const hit = new THREE.Mesh(new THREE.PlaneGeometry(L - 0.2, Wd - 0.2).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: '#22c55e', transparent: true, opacity: 0.0, depthWrite: false }));
      hit.position.set(s.x, s.kind === 'parking' ? 0.19 : 0.07, s.z); hit.rotation.y = s.yaw; hit.userData.spotId = s.id; hit.renderOrder = 2;
      noOutline(hit); this.scene.add(hit);
      this.spots.set(s.id, { def: s, hit, tag: this.addLabel(s.id, new THREE.Vector3(s.x, 0.2, s.z), 'spot', 45) });
    }
    for (const [k, mat] of [['white', white], ['yellow', yellow]]) if (lineGeos[k].length) this.scene.add(noOutline(new THREE.Mesh(mergeGeometries(lineGeos[k]), mat)));
    const zones = {};
    for (const s of site.spots) (zones[s.zone] ||= []).push(s);
    for (const [z, list] of Object.entries(zones)) {
      if (z === 'Atelier') continue;
      const c = list.reduce((a, s) => a.add(new THREE.Vector3(s.x / list.length, 0, s.z / list.length)), new THREE.Vector3());
      this.addLabel(`<b>${z}</b><small>${list.length} places</small>`, c.setY(4), 'zone big', 200);
    }
  }

  // ======================= VEHICULES =======================
  setState(state) { this._q = (this._q || Promise.resolve()).then(() => this._setState(state)); return this._q; }
  async _setState(state) {
    this.dirty = true;
    this.state = state;
    const keep = new Set();
    for (const v of state.vehicles) {
      if (!v.placeId || !this.spots.has(v.placeId) || v.statut === 'rendu') continue;
      keep.add(v.id);
      const key = [v.type, v.couleur, v.plaque, v.model3d, v.modelFlip].join('|');
      let e = this.vehicles.get(v.id);
      if (!e || e.key !== key) {
        const old = e;
        let group;
        try { group = v.model3d && assetUrl(v.model3d) ? await makeModelVehicle(assetUrl(v.model3d), { type: v.type, couleur: v.couleur, flip: !!v.modelFlip }) : null; }
        catch (err) { console.warn('modele 3D', v.model3d, err); }
        group ||= makeVehicle(v);
        toonify(group); if (!v.model3d) mergeStatic(group);
        group.traverse((o) => { o.userData.vehicleId = v.id; });
        this.scene.add(group);
        e = { group, key, spotId: null, label: old ? old.label : this.addLabel('', new THREE.Vector3(), 'veh', 70) };
        if (old) { group.position.copy(old.group.position); group.rotation.y = old.group.rotation.y; e.spotId = old.spotId; this.scene.remove(old.group); }
        this.vehicles.set(v.id, e);
      }
      e.data = v;
      const s = this.spots.get(v.placeId).def;
      if (e.spotId !== v.placeId || e.dropped) {
        const to = new THREE.Vector3(s.x, 0, s.z);
        if (!e.spotId) { e.group.position.copy(to); e.group.rotation.y = s.yaw; }
        e.anim = { from: e.group.position.clone(), fromYaw: e.group.rotation.y, to, toYaw: s.yaw, t: e.spotId ? 0 : 1 };
        e.spotId = v.placeId; e.dropped = false;
      }
      const last = (v.journal || []).slice(-1)[0];
      e.label.el.innerHTML = `<span class="fr"><span class="eu"><i>★</i>F</span><span class="num">${v.plaque || '—'}</span><span class="dep"><i>✦</i>44</span></span>`
        + `<span class="st" style="background:${STATUT_COLORS[v.statut] || '#888'}">${v.statut === 'termine' ? '✔ prête' : ''}</span>`
        + (last ? `<em>${last.text.replace(/[<>&]/g, '')}</em>` : '');
      e.label.el.classList.toggle('sel', this.selected === v.id);
      e.label.el.classList.toggle('ready', v.statut === 'termine');
    }
    for (const [id, e] of this.vehicles) if (!keep.has(id)) { this.scene.remove(e.group); e.label.el.remove(); this.labels = this.labels.filter((l) => l !== e.label); this.vehicles.delete(id); }
    for (const [lid, lift] of this.lifts) { // ponts : leves si le vehicule dessus est en cours
      const v = state.vehicles.find((x) => x.placeId === lid && x.statut !== 'rendu');
      lift.target = v && v.statut === 'en_cours' ? 1.7 : 0;
    }
    for (const [id, sp] of this.spots) sp.occupied = state.vehicles.find((v) => v.placeId === id && v.statut !== 'rendu')?.id || null;
    // consommables et reserve
    for (const c of (state.consumables && state.consumables.items) || []) {
      const l = this.consLabels[c.key]; if (!l) continue;
      l.el.innerHTML = c.level === 'ok' ? '' : `<span style="background:${LEVEL_COLORS[c.level]}">${c.icon} ${c.label} : ${c.level}</span>`;
    }
    const arrived = (state.orders || []).filter((o) => o.statut === 'arrivee').length;
    const low = (state.stock || []).filter((s) => Number(s.qte) <= Number(s.seuil || 0)).length;
    this.stockLabel.el.innerHTML = `<b>Réserve</b><small>clic : inventaire${arrived ? ` · ${arrived} arrivée${arrived > 1 ? 's' : ''}` : ''}${low ? ` · ⚠ ${low} bas` : ''}</small>`;
    this.refreshSpots();
    this.updateSelectionRing();
  }

  refreshSpots() {
    this.dirty = true;
    const active = this.moveMode || (this.drag && this.drag.active && this.drag.id);
    for (const [, sp] of this.spots) {
      const m = sp.hit.material, mine = sp.occupied && sp.occupied === active;
      if (active) {
        const swap = sp.occupied && !mine && this.drag; // en glisser-deposer, une place prise = echange
        m.opacity = mine ? 0 : !sp.occupied ? 0.38 : swap ? 0.3 : 0;
        m.color.set(sp.hover ? '#ff7a00' : swap ? '#f59e0b' : '#22c55e');
      } else m.opacity = sp.hover && !sp.occupied ? 0.18 : 0;
      sp.tag.el.style.display = active && !mine && (!sp.occupied || this.drag) ? '' : 'none';
    }
  }

  select(id) {
    this.dirty = true;
    this.selected = id;
    for (const [vid, e] of this.vehicles) e.label.el.classList.toggle('sel', vid === id);
    this.updateSelectionRing();
  }
  updateSelectionRing() {
    if (!this.ring) {
      this.ring = noOutline(new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff7a00', transparent: true, opacity: 0.9, depthWrite: false })));
      this.ring.renderOrder = 3; this.scene.add(this.ring);
    }
    const e = this.selected && this.vehicles.get(this.selected);
    this.ring.visible = !!e;
    if (e) { const d = e.group.userData.dims; this.ring.scale.set(d.L * 0.62, 1, d.L * 0.62); }
  }

  setPickMode(label) { this.pickMode = label || null; this.canvas.classList.toggle('placing', !!label); for (const [, e] of this.vehicles) e.label.el.classList.toggle('target', !!label); this.dirty = true; }
  setMoveMode(vehicleId) { this.moveMode = vehicleId || null; this.canvas.classList.toggle('placing', !!vehicleId); this.refreshSpots(); }

  // ======================= MECANOS =======================
  // list : [{ id, prenom, couleur, spotId }] — les mecanos presents d'apres le planning
  setMechanics(list) {
    const ids = new Set(list.map((m) => m.id));
    for (const [id, m] of this.mechanics) if (!ids.has(id)) { this.scene.remove(m.walker.p); m.label.el.remove(); this.labels = this.labels.filter((l) => l !== m.label); this.mechanics.delete(id); }
    for (const def of list) {
      let m = this.mechanics.get(def.id);
      if (!m || m.couleur !== def.couleur) {
        if (m) { this.scene.remove(m.walker.p); m.label.el.remove(); }
        const p = makePerson({ couleur: def.couleur || '#1f4e8c' }); toonify(p);
        p.traverse((o) => { o.userData.mechanicId = def.id; });
        this.scene.add(p);
        const walker = new Walker(p, this.navPos('D'), (pos) => this.pickTask(def.id, pos));
        m = { walker, couleur: def.couleur, label: m ? m.label : this.addLabel('', new THREE.Vector3(), 'mec', 55) };
        this.mechanics.set(def.id, m);
      }
      m.def = def;
      m.label.el.innerHTML = `🔧 ${def.prenom}`;
    }
  }
  navPos(k) { const [u, v, y = 0] = NAV[k]; return this.uv(u, v, y); }
  navPath(from, to) { // Dijkstra sur le petit graphe de circulation
    if (!this.navAdj) {
      this.navAdj = {};
      for (const e of NAV_EDGES.split(' ')) { const [a, b] = e.split('-'); (this.navAdj[a] ||= []).push(b); (this.navAdj[b] ||= []).push(a); }
    }
    const dist = { [from]: 0 }, prev = {}, todo = new Set(Object.keys(NAV));
    while (todo.size) {
      let k = null; for (const x of todo) if (dist[x] != null && (k == null || dist[x] < dist[k])) k = x;
      if (k == null || k === to) break;
      todo.delete(k);
      for (const nb of this.navAdj[k] || []) {
        const d = dist[k] + this.navPos(k).distanceTo(this.navPos(nb));
        if (dist[nb] == null || d < dist[nb]) { dist[nb] = d; prev[nb] = k; }
      }
    }
    const path = []; for (let k = to; k; k = prev[k]) path.unshift(k);
    return path[0] === from ? path : [to];
  }
  nearestNav(pos) { let best = 'D', bd = Infinity; for (const k of Object.keys(NAV)) { const d = this.navPos(k).distanceTo(pos); if (d < bd) { bd = d; best = k; } } return best; }
  pickTask(id, pos) {
    const m = this.mechanics.get(id); if (!m) return null;
    let target, face;
    const work = m.def.spotId && SPOT_WORK[m.def.spotId];
    if (work && Math.random() < 0.65) {
      target = work[Math.floor(Math.random() * work.length)];
      const s = this.spots.get(m.def.spotId).def, tp = this.navPos(target);
      face = Math.atan2(-(s.z - tp.z), s.x - tp.x); // regarde la voiture
    } else {
      const [k, f] = IDLE_POIS[Math.floor(Math.random() * IDLE_POIS.length)];
      target = k; face = Math.atan2(-this.gU.z, this.gU.x) + f;
    }
    const keys = this.navPath(this.nearestNav(pos), target);
    return { path: keys.map((k) => this.navPos(k).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3))), face };
  }

  // ======================= CAMERA =======================
  focusVehicle(id) {
    const e = this.vehicles.get(id); if (!e) return;
    const p = e.group.position.clone(), s = this.spots.get(e.spotId);
    // dehors : on regarde depuis l'exterieur du batiment (sinon le mur masque la voiture)
    const dir = s && s.def.zone !== 'Atelier' ? p.clone().sub(this.interiorCenter).setY(0).normalize() : this.camera.position.clone().sub(this.controls.target).setY(0).normalize();
    this.fly(p.clone().add(new THREE.Vector3(0, 1, 0)), p.clone().addScaledVector(dir, 11).setY(8));
  }
  view(name, instant) {
    const c = this.interiorCenter, g = this.site.garage;
    if (name === 'site') { const k = this.camera.aspect < 1 ? 0.62 : 1; this.fly(c.clone().add(new THREE.Vector3(-8, 0, 4)), c.clone().add(new THREE.Vector3(85 * k, 95 * k, 80 * k)), instant); }
    if (name === 'atelier') this.fly(c.clone(), this.uv(g.width + 15, g.interior.len / 2 - 5, 24), instant);
    if (name === 'parking') { // parking devant Ocaburo + allee
      const os = [...this.spots.values()].filter((s) => s.def.zone === 'Parking Ocaburo').map((s) => s.def);
      const c = os.reduce((a, s) => a.add(new THREE.Vector3(s.x / os.length, 0, s.z / os.length)), new THREE.Vector3());
      this.fly(c, c.clone().add(this.gU.clone().multiplyScalar(14)).add(this.gV.clone().multiplyScalar(-22)).setY(22), instant);
    }
    if (name === 'dessus') this.fly(c.clone(), c.clone().add(new THREE.Vector3(0.1, 150, 0.1)), instant);
    if (name === 'pause') this.fly(this.uv(15, 2.2, 3.4), this.uv(13, 9.5, 8.5), instant);
  }
  fly(target, pos, instant) {
    if (instant) { this.controls.target.copy(target); this.camera.position.copy(pos); this.controls.update(); return; }
    this.flight = { t: 0, t0: this.controls.target.clone(), p0: this.camera.position.clone(), t1: target, p1: pos };
  }
  setRoof(mode) { this.roofMode = mode; this.dirty = true; }

  // ======================= ETIQUETTES =======================
  addLabel(html, pos, cls, maxDist) {
    const el = document.createElement('div'); el.className = 'lbl ' + cls; el.innerHTML = html;
    this.labelsEl.appendChild(el);
    const l = { el, pos, maxDist }; this.labels.push(l); return l;
  }
  updateLabels() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight, v = new THREE.Vector3();
    for (const [, e] of this.vehicles) e.label.pos.copy(e.group.position).setY(e.group.position.y + e.group.userData.dims.H + 0.5);
    for (const [, m] of this.mechanics) m.label.pos.copy(m.walker.p.position).setY(m.walker.p.position.y + 2.1);
    for (const l of this.labels) {
      v.copy(l.pos);
      const d = v.distanceTo(this.camera.position);
      v.project(this.camera);
      const hidden = v.z > 1 || d > l.maxDist || l.el.style.display === 'none' || !l.el.innerHTML;
      l.el.classList.toggle('off', hidden);
      if (!hidden) l.el.style.transform = `translate(-50%,-100%) translate(${(v.x * 0.5 + 0.5) * w}px,${(-v.y * 0.5 + 0.5) * h}px)`;
    }
  }

  // ======================= INTERACTION =======================
  bindPointer() {
    const ray = (ev) => {
      const r = this.canvas.getBoundingClientRect();
      this.pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera);
    };
    const pick = (ev) => {
      ray(ev);
      const objs = [...[...this.vehicles.values()].map((e) => e.group), ...[...this.mechanics.values()].map((m) => m.walker.p)];
      if (this.visitor) objs.push(this.visitor);
      if (this.crmScreen) objs.push(this.crmScreen);
      if (this.stockHit) objs.push(this.stockHit);
      const h = this.raycaster.intersectObjects(objs, true)[0];
      const hs = this.raycaster.intersectObjects([...this.spots.values()].map((s) => s.hit), false)[0];
      const u = h && h.object.userData;
      return { vehicleId: u && u.vehicleId, mechanicId: u && u.mechanicId, visitor: u && u.visitor, crm: u && u.crm, stock: u && u.stock, spotId: hs && hs.object.userData.spotId };
    };
    const nearestSpot = (p) => {
      let best = null, bd = 3.2;
      for (const [id, sp] of this.spots) { const d = Math.hypot(sp.def.x - p.x, sp.def.z - p.z); if (d < bd) { bd = d; best = id; } }
      return best;
    };
    // capture : on doit voir le clic avant OrbitControls pour pouvoir attraper une voiture
    this.canvas.addEventListener('pointerdown', (e) => {
      this.down = [e.clientX, e.clientY];
      if (e.button !== 0 || this.moveMode || this.pickMode) return;
      const p = pick(e);
      if (p.vehicleId) { this.drag = { id: p.vehicleId, start: [e.clientX, e.clientY], active: false }; this.controls.enabled = false; this.canvas.setPointerCapture(e.pointerId); }
    }, { capture: true });
    this.canvas.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (d) {
        if (!d.active && Math.hypot(e.clientX - d.start[0], e.clientY - d.start[1]) > 6) { d.active = true; this.canvas.classList.add('dragging'); }
        if (d.active) {
          ray(e);
          const hit = new THREE.Vector3();
          if (this.raycaster.ray.intersectPlane(this.ground, hit)) {
            const ve = this.vehicles.get(d.id);
            ve.anim = null; ve.group.position.set(hit.x, 0.5, hit.z); ve.dragging = true;
            const sid = nearestSpot(hit);
            for (const [id, sp] of this.spots) sp.hover = id === sid;
            d.spot = sid;
            if (sid) { const s = this.spots.get(sid).def; ve.group.rotation.y += (s.yaw - ve.group.rotation.y) * 0.25; }
            this.refreshSpots();
          }
        }
        return;
      }
      if (e.buttons) return;
      const p = pick(e);
      for (const [id, sp] of this.spots) sp.hover = id === p.spotId;
      this.hoverVehicle = p.vehicleId || null;
      this.canvas.style.cursor = p.vehicleId ? 'grab' : p.visitor || p.crm || p.stock || p.mechanicId || (p.spotId && !this.spots.get(p.spotId).occupied) ? 'pointer' : '';
      for (const [vid, ve] of this.vehicles) ve.label.el.classList.toggle('hov', vid === this.hoverVehicle);
      this.refreshSpots();
    });
    this.canvas.addEventListener('pointerup', (e) => {
      const d = this.drag;
      if (d) {
        this.drag = null; this.controls.enabled = true; this.canvas.classList.remove('dragging');
        const ve = this.vehicles.get(d.id);
        if (ve) ve.dragging = false;
        for (const [, sp] of this.spots) sp.hover = false;
        if (d.active) {
          if (d.spot && d.spot !== ve.spotId) { ve.dropped = true; this.emit('dropVehicle', d.id, d.spot); }
          else if (ve) { const s = this.spots.get(ve.spotId).def; ve.anim = { from: ve.group.position.clone(), fromYaw: ve.group.rotation.y, to: new THREE.Vector3(s.x, 0, s.z), toYaw: s.yaw, t: 0 }; }
          this.refreshSpots();
          return;
        }
        this.refreshSpots();
        return this.emit('pickVehicle', d.id);
      }
      if (!this.down || Math.hypot(e.clientX - this.down[0], e.clientY - this.down[1]) > 5) return;
      const p = pick(e);
      if (this.moveMode) { if (p.spotId && !this.spots.get(p.spotId).occupied) this.emit('placeSpot', this.moveMode, p.spotId); else this.emit('cancelMove'); return; }
      if (this.pickMode) { const id = p.vehicleId || (p.spotId && this.spots.get(p.spotId).occupied); return this.emit(id ? 'pickForPart' : 'cancelPick', id); }
      if (p.visitor) return this.emit('pickVisitor');
      if (p.crm) return this.emit('openCRM');
      if (p.stock) return this.emit('openStock');
      if (p.mechanicId) return this.emit('pickMechanic', p.mechanicId);
      if (p.vehicleId) return this.emit('pickVehicle', p.vehicleId);
      if (p.spotId && !this.spots.get(p.spotId).occupied) return this.emit('pickSpot', p.spotId);
      this.emit('pickNone');
    });
    this.canvas.addEventListener('dblclick', () => { if (this.selected) this.focusVehicle(this.selected); });
  }

  loop() {
    const tick = () => {
      requestAnimationFrame(tick);
      const dt = Math.min(0.05, this.clock.getDelta());
      if (this.flight) {
        const f = this.flight; f.t = Math.min(1, f.t + dt / 1.1); const k = f.t * f.t * (3 - 2 * f.t);
        this.controls.target.lerpVectors(f.t0, f.t1, k); this.camera.position.lerpVectors(f.p0, f.p1, k);
        if (f.t >= 1) this.flight = null;
      }
      this.controls.update();
      const near = this.camera.position.distanceTo(this.interiorCenter) < 48 && this.camera.position.y < 40;
      this.roofGarage.visible = this.roofMode === 'on' || (this.roofMode === 'auto' && !near);
      let busy = !!this.flight || !!(this.drag && this.drag.active) || this.mechanics.size > 0;
      for (const [, lift] of this.lifts) { if (Math.abs(lift.target - lift.y) > 0.002) busy = true; lift.y += (lift.target - lift.y) * Math.min(1, dt * 1.5); lift.car.position.y = lift.y; }
      for (const [, e] of this.vehicles) {
        if (e.dragging) continue;
        if (e.anim && e.anim.t < 1) {
          busy = true;
          const a = e.anim; a.t = Math.min(1, a.t + dt / 1.6); const k = a.t * a.t * (3 - 2 * a.t);
          e.group.position.lerpVectors(a.from, a.to, k);
          let dy = a.toYaw - a.fromYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          e.group.rotation.y = a.fromYaw + dy * k;
        }
        const lift = this.lifts.get(e.spotId);
        e.group.position.y = lift && (!e.anim || e.anim.t >= 1) ? lift.y : 0;
      }
      for (const [, m] of this.mechanics) m.walker.update(dt);
      if (this.visitor) animatePerson(this.visitor, dt, 'idle');
      if (this.ring && this.ring.visible) { const e = this.vehicles.get(this.selected); if (e) this.ring.position.set(e.group.position.x, e.group.position.y + 0.07, e.group.position.z); }
      // rendu a la demande : rien ne bouge -> on ne redessine pas (batterie du telephone), sinon 60 i/s
      const now = performance.now();
      if (!busy && !this.dirty && now - this.lastRender < 1000) return;
      this.dirty = false; this.lastRender = now;
      this.updateLabels();
      this.outline.render(this.scene, this.camera);
    };
    tick();
  }
}
export { typeOf };
