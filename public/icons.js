// Icones procedurales des articles de la reserve (style inventaire de jeu video).
// La forme vient du type d'article (deduit du libelle / de la categorie), la couleur d'un hash du libelle.
const cache = new Map();
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

export function kindOf(item) {
  const t = `${item.libelle} ${item.categorie}`.toLowerCase();
  if (/filtre/.test(t)) return 'filter';
  if (/huile|oil/.test(t)) return 'jug';
  if (/pneu|jante/.test(t)) return 'tire';
  if (/ampoule|led|fusible|batterie|électr|electr/.test(t)) return /batterie/.test(t) ? 'battery' : 'bulb';
  if (/balai|essuie/.test(t)) return 'wiper';
  if (/plaquette|disque|frein(?! dot)|amortisseur|rotule|roulement/.test(t) && !/liquide/.test(t)) return 'disc';
  if (/liquide|lave|dot|refroid|additif|spray|graisse/.test(t)) return 'bottle';
  return 'box';
}

export function itemIcon(item, size = 96) {
  const kind = kindOf(item), key = `${kind}|${item.libelle}|${size}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'), s = size / 96, h = hash(item.libelle);
  const hue = h % 360, col = `hsl(${hue} 70% 50%)`, dark = `hsl(${hue} 70% 30%)`, light = `hsl(${hue} 80% 70%)`;
  x.scale(s, s); x.lineJoin = 'round'; x.lineCap = 'round';
  const ink = (w = 3) => { x.lineWidth = w; x.strokeStyle = '#121417'; x.stroke(); };
  const grad = (y0, y1, a, b) => { const g = x.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; };
  const shine = (px, py, w, hh) => { x.fillStyle = '#ffffff55'; x.beginPath(); x.ellipse(px, py, w, hh, -0.4, 0, 7); x.fill(); };
  x.save();
  if (kind === 'jug') { // bidon d'huile avec poignee et etiquette (viscosite)
    x.beginPath(); x.moveTo(22, 30); x.lineTo(58, 30); x.lineTo(74, 44); x.lineTo(74, 84); x.quadraticCurveTo(74, 88, 70, 88); x.lineTo(26, 88); x.quadraticCurveTo(22, 88, 22, 84); x.closePath();
    x.fillStyle = grad(30, 88, light, dark); x.fill(); ink();
    x.beginPath(); x.roundRect(28, 12, 14, 18, 3); x.fillStyle = '#2a2a2a'; x.fill(); ink(2.5);
    x.beginPath(); x.moveTo(48, 30); x.quadraticCurveTo(52, 14, 68, 22); x.lineTo(64, 30); ink(4);
    x.fillStyle = '#f4f1e6'; x.beginPath(); x.roundRect(30, 50, 36, 26, 3); x.fill(); ink(2);
    const m = (item.libelle.match(/\d+W\d+/i) || [''])[0];
    x.fillStyle = '#121417'; x.font = 'bold 12px Arial'; x.textAlign = 'center'; x.fillText(m || 'OIL', 48, 67);
    shine(32, 40, 5, 9);
  } else if (kind === 'filter') {
    x.beginPath(); x.roundRect(24, 26, 48, 60, 8); x.fillStyle = grad(26, 86, light, dark); x.fill(); ink();
    for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(30 + i * 7.5, 34); x.lineTo(30 + i * 7.5, 78); x.strokeStyle = '#00000040'; x.lineWidth = 2; x.stroke(); }
    x.beginPath(); x.ellipse(48, 24, 20, 7, 0, 0, 7); x.fillStyle = '#c9ced4'; x.fill(); ink(2.5);
    x.beginPath(); x.ellipse(48, 24, 7, 3, 0, 0, 7); x.fillStyle = '#3a3f45'; x.fill();
    shine(32, 46, 4, 12);
  } else if (kind === 'tire') {
    x.beginPath(); x.arc(48, 50, 36, 0, 7); x.fillStyle = '#26282b'; x.fill(); ink();
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; x.beginPath(); x.moveTo(48 + Math.cos(a) * 30, 50 + Math.sin(a) * 30); x.lineTo(48 + Math.cos(a) * 35, 50 + Math.sin(a) * 35); x.strokeStyle = '#4a4e53'; x.lineWidth = 3; x.stroke(); }
    x.beginPath(); x.arc(48, 50, 19, 0, 7); x.fillStyle = grad(30, 70, '#e6e9ec', '#8a9097'); x.fill(); ink(2.5);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; x.beginPath(); x.arc(48 + Math.cos(a) * 10, 50 + Math.sin(a) * 10, 2.5, 0, 7); x.fillStyle = '#3a3f45'; x.fill(); }
    x.beginPath(); x.arc(48, 50, 4, 0, 7); x.fillStyle = col; x.fill();
  } else if (kind === 'bottle') {
    x.beginPath(); x.moveTo(36, 32); x.lineTo(36, 22); x.lineTo(60, 22); x.lineTo(60, 32); x.quadraticCurveTo(72, 38, 72, 50); x.lineTo(72, 84); x.quadraticCurveTo(72, 88, 68, 88); x.lineTo(28, 88); x.quadraticCurveTo(24, 88, 24, 84); x.lineTo(24, 50); x.quadraticCurveTo(24, 38, 36, 32); x.closePath();
    x.fillStyle = grad(22, 88, light, col); x.fill(); ink();
    x.beginPath(); x.roundRect(38, 10, 20, 13, 3); x.fillStyle = dark; x.fill(); ink(2.5);
    x.fillStyle = '#00000030'; x.fillRect(26, 62, 44, 24);
    x.fillStyle = '#ffffffcc'; x.beginPath(); x.moveTo(48, 52); x.quadraticCurveTo(56, 64, 48, 70); x.quadraticCurveTo(40, 64, 48, 52); x.fill();
    shine(32, 50, 4, 12);
  } else if (kind === 'bulb') {
    x.beginPath(); x.arc(48, 40, 24, Math.PI * 0.8, Math.PI * 2.2); x.lineTo(58, 70); x.lineTo(38, 70); x.closePath();
    x.fillStyle = grad(16, 70, '#fff8c4', '#f2c200'); x.fill(); ink();
    x.beginPath(); x.roundRect(37, 70, 22, 16, 3); x.fillStyle = '#b0b6bc'; x.fill(); ink(2.5);
    for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(37, 74 + i * 4); x.lineTo(59, 74 + i * 4); x.strokeStyle = '#6d747b'; x.lineWidth = 1.5; x.stroke(); }
    x.beginPath(); x.moveTo(42, 50); x.lineTo(46, 40); x.lineTo(50, 50); x.lineTo(54, 40); x.strokeStyle = '#d98200'; x.lineWidth = 2.5; x.stroke();
    shine(38, 30, 5, 8);
  } else if (kind === 'battery') {
    x.beginPath(); x.roundRect(16, 32, 64, 50, 5); x.fillStyle = grad(32, 82, '#4b5158', '#24282d'); x.fill(); ink();
    x.fillStyle = col; x.fillRect(16, 32, 64, 12); x.beginPath(); x.rect(16, 32, 64, 12); ink(2);
    for (const [bx, cc] of [[28, '#e53935'], [62, '#1e88e5']]) { x.beginPath(); x.roundRect(bx - 6, 22, 12, 10, 2); x.fillStyle = cc; x.fill(); ink(2.5); }
    x.fillStyle = '#fff'; x.font = 'bold 18px Arial'; x.textAlign = 'center'; x.fillText('+    −', 48, 68);
  } else if (kind === 'wiper') {
    x.translate(48, 50); x.rotate(-0.6);
    x.beginPath(); x.roundRect(-38, -4, 76, 8, 3); x.fillStyle = '#2a2d31'; x.fill(); ink(2.5);
    x.beginPath(); x.roundRect(-34, 4, 68, 5, 2); x.fillStyle = '#111'; x.fill();
    x.beginPath(); x.moveTo(0, -4); x.lineTo(6, -30); x.lineTo(12, -30); ink(4);
    x.beginPath(); x.arc(9, -30, 5, 0, 7); x.fillStyle = col; x.fill(); ink(2);
  } else if (kind === 'disc') {
    x.beginPath(); x.arc(48, 50, 34, 0, 7); x.fillStyle = grad(16, 84, '#e4e7ea', '#868d94'); x.fill(); ink();
    x.beginPath(); x.arc(48, 50, 14, 0, 7); x.fillStyle = '#5d646c'; x.fill(); ink(2.5);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; x.beginPath(); x.arc(48 + Math.cos(a) * 24, 50 + Math.sin(a) * 24, 2, 0, 7); x.fillStyle = '#5d646c'; x.fill(); }
    x.beginPath(); x.moveTo(62, 18); x.quadraticCurveTo(86, 30, 86, 52); x.lineTo(76, 52); x.quadraticCurveTo(76, 34, 58, 26); x.closePath(); x.fillStyle = col; x.fill(); ink(2.5); // etrier
  } else { // carton
    x.beginPath(); x.moveTo(18, 36); x.lineTo(48, 22); x.lineTo(78, 36); x.lineTo(78, 72); x.lineTo(48, 86); x.lineTo(18, 72); x.closePath();
    x.fillStyle = '#c49a6c'; x.fill(); ink();
    x.beginPath(); x.moveTo(18, 36); x.lineTo(48, 50); x.lineTo(78, 36); x.moveTo(48, 50); x.lineTo(48, 86); ink(2.5);
    x.beginPath(); x.moveTo(48, 50); x.lineTo(78, 36); x.lineTo(78, 72); x.lineTo(48, 86); x.closePath(); x.fillStyle = '#00000022'; x.fill();
    x.fillStyle = col; x.fillRect(26, 52, 14, 10);
  }
  x.restore();
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}
