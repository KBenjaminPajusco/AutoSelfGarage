// Cel-shading : materiaux toon (3 paliers de lumiere) + contours noirs en post-traitement
// (detection de bords sur les normales et la profondeur, comme un trait d'encre).
import * as THREE from 'three';

const gradient = (() => {
  const t = new THREE.DataTexture(new Uint8Array([115, 115, 115, 255, 185, 185, 185, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
  return t;
})();
const cache = new WeakMap();
export function toonMaterial(m) {
  if (!m || m.isMeshToonMaterial || m.isMeshBasicMaterial || m.isShaderMaterial) return m;
  if (cache.has(m)) return cache.get(m);
  const t = new THREE.MeshToonMaterial({ color: m.color, map: m.map || null, gradientMap: gradient, transparent: m.transparent, opacity: m.opacity,
    side: m.side, emissive: m.emissive || new THREE.Color(0), emissiveIntensity: m.emissiveIntensity ?? 1, depthWrite: m.depthWrite });
  t.name = m.name;
  cache.set(m, t);
  return t;
}
// Remplace les materiaux standard d'un objet (et de ses enfants) par leur equivalent toon.
export function toonify(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map(toonMaterial) : toonMaterial(o.material);
  });
}

// ---------- contours ----------
// passe 1 : scene normale ; passe 2 : normales (vue) + profondeur lineaire ; passe 3 : composition avec les bords.
// Les objets sur la couche 1 seulement (zones de clic, vitres, halo de selection) ne recoivent pas de contour.
export const NO_OUTLINE = 1;
const normalMat = new THREE.ShaderMaterial({
  vertexShader: `
    #include <common>
    #include <logdepthbuf_pars_vertex>
    varying vec3 vN; varying float vZ;
    void main() {
      #include <beginnormal_vertex>
      #include <defaultnormal_vertex>
      #include <begin_vertex>
      #include <project_vertex>
      #include <logdepthbuf_vertex>
      vN = normalize(transformedNormal); vZ = -mvPosition.z;
    }`,
  fragmentShader: `
    #include <logdepthbuf_pars_fragment>
    varying vec3 vN; varying float vZ;
    void main() {
      #include <logdepthbuf_fragment>
      gl_FragColor = vec4(normalize(vN) * 0.5 + 0.5, vZ);
    }`,
});
const composeMat = new THREE.ShaderMaterial({
  uniforms: { tColor: { value: null }, tNormal: { value: null }, texel: { value: new THREE.Vector2() }, ink: { value: new THREE.Color('#1c1a22') } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
  fragmentShader: `
    uniform sampler2D tColor, tNormal; uniform vec2 texel; uniform vec3 ink; varying vec2 vUv;
    #include <common>
    void main() {
      vec4 c = texture2D(tColor, vUv);
      vec4 n0 = texture2D(tNormal, vUv);
      float edge = 0.;
      for (int i = 0; i < 4; i++) {
        vec2 o = i == 0 ? vec2(texel.x, 0.) : i == 1 ? vec2(-texel.x, 0.) : i == 2 ? vec2(0., texel.y) : vec2(0., -texel.y);
        vec4 n = texture2D(tNormal, vUv + o);
        float z0 = n0.a > 0. ? n0.a : 1e4, z = n.a > 0. ? n.a : 1e4;
        float dz = abs(z - z0) / min(z, z0);
        float dn = 1. - dot(n.rgb * 2. - 1., n0.rgb * 2. - 1.);
        edge = max(edge, max(step(0.035, dz), step(0.28, dn) * step(z0, 220.)));
      }
      float fade = 1. - smoothstep(150., 420., n0.a > 0. ? n0.a : 1e4);
      gl_FragColor = vec4(c.rgb, 1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      gl_FragColor.rgb = mix(gl_FragColor.rgb, ink, edge * mix(0.35, 0.9, fade));
    }`,
  depthTest: false, depthWrite: false,
});

export class OutlineRenderer {
  constructor(renderer, { samples = 4 } = {}) {
    this.r = renderer;
    const opts = { type: THREE.HalfFloatType, samples };
    this.color = new THREE.WebGLRenderTarget(1, 1, { ...opts, colorSpace: THREE.LinearSRGBColorSpace });
    this.normal = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), composeMat);
    this.quadScene = new THREE.Scene(); this.quadScene.add(this.quad);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.enabled = true;
  }
  setSize(w, h) {
    const pr = this.r.getPixelRatio();
    this.color.setSize(w * pr, h * pr); this.normal.setSize(w * pr, h * pr);
    composeMat.uniforms.texel.value.set(1 / (w * pr), 1 / (h * pr));
  }
  render(scene, camera) {
    const r = this.r;
    if (!this.enabled) { r.setRenderTarget(null); return r.render(scene, camera); }
    camera.layers.enableAll();
    r.setRenderTarget(this.color); r.render(scene, camera);
    const bg = scene.background, fog = scene.fog;
    scene.background = null; scene.fog = null; scene.overrideMaterial = normalMat;
    camera.layers.set(0);
    r.setClearColor(0x000000, 0); r.setRenderTarget(this.normal); r.clear(); r.render(scene, camera);
    scene.overrideMaterial = null; scene.background = bg; scene.fog = fog; camera.layers.enableAll();
    composeMat.uniforms.tColor.value = this.color.texture; composeMat.uniforms.tNormal.value = this.normal.texture;
    r.setRenderTarget(null); r.render(this.quadScene, this.quadCam);
  }
}
