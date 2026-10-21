// Personnages low-poly : mecanos (combinaison a leur couleur) et client qui attend a la porte.
// Repere local : +x = devant, y = haut. Animation simple : marche (bras/jambes en balancier) ou travail (bras tendus).
import * as THREE from 'three';

const skin = new THREE.MeshStandardMaterial({ color: '#e0b48f', roughness: 0.8 });
const dark = new THREE.MeshStandardMaterial({ color: '#26262b', roughness: 0.9 });
const mats = new Map();
const mat = (c) => { if (!mats.has(c)) mats.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 })); return mats.get(c); };

export function makePerson({ couleur = '#1f4e8c', pantalon = null, casquette = true } = {}) {
  const g = new THREE.Group(), body = mat(couleur), legsM = mat(pantalon || couleur);
  const part = (geo, m, x, y, z, parent = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  part(new THREE.CapsuleGeometry(0.2, 0.42, 4, 10), body, 0, 1.18, 0);                 // torse
  part(new THREE.SphereGeometry(0.15, 14, 10), skin, 0, 1.68, 0);                        // tete
  if (casquette) { part(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 14), body, 0, 1.79, 0); part(new THREE.BoxGeometry(0.16, 0.02, 0.2), body, 0.14, 1.76, 0); }
  const limb = (len, r, m, x, y, z) => { const piv = new THREE.Group(); piv.position.set(x, y, z); g.add(piv); part(new THREE.CapsuleGeometry(r, len, 3, 8), m, 0, -len / 2 - r, 0, piv); return piv; };
  const legs = [limb(0.62, 0.085, legsM, 0, 0.85, 0.1), limb(0.62, 0.085, legsM, 0, 0.85, -0.1)];
  const arms = [limb(0.46, 0.065, body, 0, 1.42, 0.27), limb(0.46, 0.065, body, 0, 1.42, -0.27)];
  for (const l of legs) part(new THREE.BoxGeometry(0.26, 0.08, 0.12), dark, 0.05, -0.8, 0, l); // chaussures
  g.userData.rig = { legs, arms, phase: Math.random() * 6 };
  return g;
}

export function animatePerson(p, dt, mode) {
  const r = p.userData.rig; r.phase += dt * (mode === 'walk' ? 7 : 2);
  const s = Math.sin(r.phase);
  if (mode === 'walk') {
    r.legs[0].rotation.z = s * 0.55; r.legs[1].rotation.z = -s * 0.55;
    r.arms[0].rotation.z = -s * 0.5; r.arms[1].rotation.z = s * 0.5;
  } else if (mode === 'work') {
    r.legs[0].rotation.z = r.legs[1].rotation.z = 0;
    r.arms[0].rotation.z = 1.25 + s * 0.15; r.arms[1].rotation.z = 1.1 - s * 0.15;
  } else { // attente
    r.legs[0].rotation.z = r.legs[1].rotation.z = 0;
    r.arms[0].rotation.z = 0.1 + s * 0.04; r.arms[1].rotation.z = -0.1 - s * 0.04;
  }
}

// Marcheur : suit une liste de points, puis s'arrete un moment (travail) et demande une nouvelle destination.
export class Walker {
  constructor(person, pos, pickTarget) {
    this.p = person; this.path = []; this.wait = 1 + Math.random() * 3; this.pick = pickTarget; this.mode = 'idle';
    person.position.copy(pos);
  }
  update(dt) {
    if (this.path.length) {
      const t = this.path[0], d = t.clone().sub(this.p.position); // y garde : escalier
      const l = d.length(), step = 1.3 * dt;
      if (l < 0.05) { this.path.shift(); if (!this.path.length) { this.wait = 4 + Math.random() * 8; this.mode = 'work'; if (this.face != null) this.p.rotation.y = this.face; } }
      else {
        this.p.position.addScaledVector(d, Math.min(1, step / l));
        const yaw = Math.atan2(-d.z, d.x); let dy = yaw - this.p.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        this.p.rotation.y += dy * Math.min(1, dt * 8); this.mode = 'walk';
      }
    } else if ((this.wait -= dt) <= 0) {
      const next = this.pick(this.p.position);
      if (next) { this.path = next.path; this.face = next.face; } else this.wait = 2;
    }
    animatePerson(this.p, dt, this.mode);
  }
}
