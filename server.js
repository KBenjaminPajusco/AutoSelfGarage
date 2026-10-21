// Serveur de fichiers statiques pour developper en local. L'appli n'a plus besoin de serveur :
// les donnees vivent dans le navigateur (IndexedDB). N'importe quel hebergement statique convient aussi.
// http://garage.localhost:4180 — GARAGE_HOST=0.0.0.0 pour l'ouvrir depuis un telephone du meme reseau.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.GARAGE_PORT || 4180);
const HOST = process.env.GARAGE_HOST || '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.glb': 'model/gltf-binary', '.ico': 'image/x-icon' };

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, p));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('introuvable'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}).listen(PORT, HOST, () => console.log(`Auto Self Garage sur http://garage.localhost:${PORT}${HOST === '0.0.0.0' ? ' (ouvert au reseau local)' : ''}`));
