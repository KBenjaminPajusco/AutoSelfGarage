// Performance : fusion des objets fixes (un seul maillage par materiau) et niveau de qualite selon l'appareil.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';

// ?q=low|high dans l'URL, ou le choix memorise, sinon : telephone / tablette = basse qualite
export const QUALITY = (() => {
  const q = new URLSearchParams(location.search).get('q');
  let saved = null; try { saved = localStorage.getItem('garage.quality'); } catch {}
  const pick = q || saved;
  if (pick === 'low' || pick === 'high') return pick;
  return matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 820 ? 'low' : 'high';
})();
export const LOW = QUALITY === 'low';
export function setQuality(q) { try { localStorage.setItem('garage.quality', q); } catch {} location.reload(); }

// Fusionne tous les maillages fixes sous `root` (sauf les sous-arbres pour lesquels keep(obj) est vrai)
// en un maillage par (materiau, couche, ombres). Renvoie le nombre de maillages avant / apres.
export function mergeStatic(root, keep = () => false) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map(), victims = [];
  const walk = (o) => {
    if (o !== root && keep(o)) return;
    if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && !Array.isArray(o.material) && o.visible) {
      const key = `${o.material.uuid}|${o.layers.mask}|${o.castShadow}|${o.receiveShadow}|${o.renderOrder}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, b = { mat: o.material, layers: o.layers.mask, cast: o.castShadow, recv: o.receiveShadow, order: o.renderOrder, geos: [], src: [] });
      b.geos.push(normalizeGeometry(o.geometry, new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)));
      b.src.push(o);
    }
    for (const c of [...o.children]) walk(c);
  };
  walk(root);
  let before = 0, after = 0;
  for (const b of buckets.values()) {
    before += b.src.length;
    if (b.src.length < 2) continue; // rien a gagner
    const geo = mergeGeometries(b.geos, false);
    if (!geo) continue;
    const m = new THREE.Mesh(geo, b.mat);
    m.layers.mask = b.layers; m.castShadow = b.cast; m.receiveShadow = b.recv; m.renderOrder = b.order;
    m.userData.merged = b.src.length;
    root.add(m); after++;
    victims.push(...b.src);
  }
  for (const o of victims) o.parent && o.parent.remove(o);
  return { before, after: before - victims.length + after };
}

// meme jeu d'attributs pour tout le monde (position, normal, uv), indexe, sans groupes, transforme dans le repere du parent
function normalizeGeometry(src, matrix) {
  let g = src.clone();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.index) { const n = g.attributes.position.count, idx = new (n > 65535 ? Uint32Array : Uint16Array)(n); for (let i = 0; i < n; i++) idx[i] = i; g.setIndex(new THREE.BufferAttribute(idx, 1)); }
  g.clearGroups(); g.morphAttributes = {};
  g.applyMatrix4(matrix);
  return g;
}
