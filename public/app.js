// Interface ERP : tout passe par une fenetre modale (pile de vues avec retour), la 3D reste plein ecran.
// Les formulaires de creation sont progressifs : chaque question apparait quand la precedente est remplie.
import { World, STATUT_COLORS } from './world.js';
import { TYPES } from './cars.js';
import { QUALITY, setQuality } from './perf.js';
import { itemIcon } from './icons.js';
import * as store from './store.js';

const STATUT_LABELS = { attente: 'En attente', diagnostic: 'Diagnostic', en_cours: 'En cours', attente_pieces: 'Attente pièces', termine: 'Prête', rendu: 'Rendue' };
const ORDER_LABELS = { commandee: 'Commandée', arrivee: 'Arrivée', posee: 'Posée', annulee: 'Annulée' };
const ORDER_COLORS = { commandee: '#3b82f6', arrivee: '#f59e0b', posee: '#22c55e', annulee: '#475569' };
const PAY_LABELS = { non_paye: 'Non payé', acompte: 'Acompte', paye: 'Payé' };
const PAY_MODES = ['CB', 'Espèces', 'Chèque', 'Virement'];
const LEVELS = ['ok', 'bas', 'vide'], LEVEL_COLORS = { ok: '#22c55e', bas: '#f59e0b', vide: '#ef4444' };
const COLORS = ['#f2f2f2', '#c8ccd0', '#9aa3ad', '#5b6168', '#2d2d2d', '#111111', '#c0392b', '#8e1b1b', '#1f3a5f', '#2e6fd8', '#6fb3e0', '#1e7d4a', '#f1c40f', '#e67e22', '#6d4c41', '#d8c7a8'];
const TENUES = ['#1f4e8c', '#2f5d3a', '#8a3b12', '#3a3a3a', '#6b1d1d', '#d35400', '#34495e', '#7d3c98'];
const DAYS = [['lun', 'Lundi'], ['mar', 'Mardi'], ['mer', 'Mercredi'], ['jeu', 'Jeudi'], ['ven', 'Vendredi'], ['sam', 'Samedi'], ['dim', 'Dimanche']];
const DAYK = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
const HORAIRES = [['08:30', '12:30'], ['14:00', '18:45']];
const APP_VERSION = '2026-10-21 · 5';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => (Number(n) || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const fmt = (iso) => iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
const fmtD = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '';
// plus de serveur : la logique et les donnees vivent dans le navigateur (store.js -> IndexedDB)
const api = (method, url, body) => store.request(method, url, body);

let site, catalog = [], state = { clients: [], vehicles: [], orders: [], mechanics: [], consumables: { items: [] }, config: {}, tarifs: [] };
let simClock = null; // null = heure reelle, sinon 'HH:MM' (pour voir l'atelier "en journee")

const world = new World($('#scene'), $('#labels'));
window.garage = { world }; // debug console

// ---------------- accesseurs ----------------
const client = (id) => state.clients.find((c) => c.id === id);
const vehicle = (id) => state.vehicles.find((v) => v.id === id);
const mechanic = (id) => state.mechanics.find((m) => m.id === id);
const clientName = (id) => { const c = client(id); return c ? `${c.prenom ? c.prenom + ' ' : ''}${c.nom}` : '—'; };
const spotDef = (id) => site.spots.find((s) => s.id === id);
const spotLabel = (id) => { const s = spotDef(id); return s ? `${s.id} · ${s.label}` : 'sans place'; };
const active = () => state.vehicles.filter((v) => v.statut !== 'rendu');
const freeSpots = (except) => { const busy = new Set(active().filter((v) => v.id !== except).map((v) => v.placeId)); return site.spots.filter((s) => !busy.has(s.id)); };
// montant du passage en cours (ou du dernier passage si la voiture est rendue) et reste a encaisser
const dueOf = (v) => {
  const lines = v.statut === 'rendu' ? ((v.visites || []).slice(-1)[0] || {}).interventions || [] : v.interventions || [];
  const total = lines.reduce((a, l) => a + (Number(l.montant) || 0), 0), p = v.paiement || {};
  return { total, reste: p.statut === 'paye' ? 0 : Math.max(0, total - (p.statut === 'acompte' ? Number(p.montant) || 0 : 0)), statut: p.statut || 'non_paye' };
};
const payTag = (v) => { const d = dueOf(v); if (!d.total && d.statut === 'non_paye') return ''; return d.statut === 'paye' ? '<span class="tag paid">💶 payé</span>' : d.statut === 'acompte' ? `<span class="tag part">💶 acompte · reste ${eur(d.reste)}</span>` : `<span class="tag due">💶 non payé · ${eur(d.total)}</span>`; };
const badge = (s) => `<span class="badge" style="background:${STATUT_COLORS[s]}">${STATUT_LABELS[s]}</span>`;
const obadge = (s) => `<span class="badge" style="background:${ORDER_COLORS[s]}">${ORDER_LABELS[s]}</span>`;
const nowHM = () => simClock || new Date().toTimeString().slice(0, 5);
const today = () => { const d = DAYK[new Date().getDay()]; return simClock && (d === 'dim' || d === 'sam') ? 'jeu' : d; };
const isPresent = (m) => m.actif !== false && !m.absent && ((m.planning || {})[today()] || []).some(([a, b]) => nowHM() >= a && nowHM() < b);
const planningText = (slots) => (slots || []).map(([a, b]) => `${a}-${b}`).join(', ');
const parsePlanning = (s) => String(s || '').split(/[,;]+/).map((x) => x.trim().match(/^(\d{1,2})[:h](\d{2})\s*-\s*(\d{1,2})[:h](\d{2})$/)).filter(Boolean)
  .map((m) => [`${m[1].padStart(2, '0')}:${m[2]}`, `${m[3].padStart(2, '0')}:${m[4]}`]);

// ---------------- modale (pile de vues) ----------------
const modal = $('#modal');
// tactile : le doigt qui ouvre la fenetre (clic dans la 3D) genere ensuite un clic au meme endroit,
// qui tomberait sur la fenetre fraichement ouverte (une case de l'inventaire, un bouton…) : on l'ignore
let openedAt = 0;
modal.addEventListener('click', (e) => { if (performance.now() - openedAt < 450) { e.stopPropagation(); e.preventDefault(); } }, true);
let stack = [];
function open(view, push = false) { if (!push) stack = []; stack.push(view); show(); }
function show() {
  const v = stack[stack.length - 1]; if (!v) return close();
  $('#m-title').innerHTML = v.title();
  $('#m-back').style.visibility = stack.length > 1 ? '' : 'hidden';
  const body = $('#m-body'); body.innerHTML = '';
  v.render(body);
  if (!modal.open) { modal.showModal(); openedAt = performance.now(); }
}
function back() { stack.pop(); stack.length ? show() : close(); }
function close() { stack = []; if (modal.open) modal.close(); world.select(null); }
$('#m-close').onclick = close; $('#m-back').onclick = back;
modal.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
let downOnBackdrop = false; // ne ferme que si le clic commence ET finit hors de la fenetre
modal.addEventListener('pointerdown', (e) => { downOnBackdrop = e.target === modal; });
modal.addEventListener('click', (e) => { if (e.target === modal && downOnBackdrop) close(); });
modal.addEventListener('input', () => { const v = stack[stack.length - 1]; if (v) v.dirty = true; });

const toast = (msg, ms) => { const t = $('#toast'); t.hidden = !msg; t.textContent = msg || ''; clearTimeout(toast.t); if (ms) toast.t = setTimeout(() => { t.hidden = true; }, ms); };
const errBox = (el) => (e) => { const b = $('.err', el); if (b) b.textContent = e.message || e; };

// ---------------- formulaire progressif ----------------
// steps : [{ id, label, html, done: () => bool, bind?: (stepEl) => void }]
let progressiveSeq = 0;
function progressive(container, steps) {
  // identifiants uniques : un formulaire peut en contenir un autre (creation du client dans l'arrivee)
  const uid = `p${++progressiveSeq}`;
  container.insertAdjacentHTML('beforeend', `<div class="steps">${steps.map((s, i) =>
    `<div class="step" data-step="${uid}-${s.id}"><label><span class="num">${i + 1}</span>${s.label}</label>${s.html}</div>`).join('')}</div>`);
  const el = (s) => $(`[data-step="${uid}-${s.id}"]`, container);
  steps.forEach((s) => s.bind && s.bind(el(s)));
  // focus = false quand on est encore en train de taper : la suite apparait, mais le curseur ne bouge pas
  const refresh = (focus = true) => {
    let openNext = true;
    for (const s of steps) {
      const e = el(s), wasHidden = e.hidden, d = !!s.done();
      e.hidden = !openNext; e.classList.toggle('done', d);
      if (wasHidden && !e.hidden) {
        // la question qui apparait doit etre visible (sur telephone le clavier cache le bas de l'ecran)
        const f = $('input:not([data-optional]), textarea, select', e);
        // jamais pendant qu'on est dans un champ (on ne vole pas le curseur)
        if (focus && f && !f.value) setTimeout(() => { const a = document.activeElement; if (!a || !a.matches('input, textarea, select')) f.focus({ preventScroll: true }); }, 30);
        setTimeout(() => e.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 120);
      }
      if (!d) openNext = false;
    }
  };
  // texte libre : la suite se deplie des la frappe, mais le curseur reste dans le champ ou l'on ecrit
  const isText = (t) => t.matches('textarea, input:not([type=checkbox]):not([type=radio]):not([type=color]):not([type=file]):not([type=date])');
  container.addEventListener('input', (e) => refresh(!isText(e.target)));
  container.addEventListener('change', (e) => refresh(!isText(e.target)));
  container.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.matches('input')) return;
    refresh();
    // Entree : on passe au champ de la question suivante
    const fields = $$('.step:not([hidden]) input:not([data-optional]):not([type=file]), .step:not([hidden]) textarea, .step:not([hidden]) select', container);
    const next = fields[fields.indexOf(e.target) + 1];
    if (next) { e.preventDefault(); setTimeout(() => next.focus(), 40); }
  });
  container.addEventListener('click', (e) => setTimeout(() => refresh(!isText(e.target))));
  refresh();
  setTimeout(() => { const f = $('.step:not([hidden]) input, .step:not([hidden]) textarea', container); if (f) f.focus(); }, 60);
  return refresh;
}

// ---------------- recherche / creation de client ----------------
// Cherche dans les clients existants ; sinon propose de le creer sur place (nom -> prenom -> telephone).
function clientPicker(el, getId, setId) {
  const draw = () => {
    const id = getId();
    if (id && client(id)) {
      const c = client(id);
      el.innerHTML = `<div class="info good row"><b style="flex:1">👤 ${esc(clientName(id))}</b><span class="hint">${esc(c.tel)}</span><button type="button" data-change>Changer</button></div>`;
      $('[data-change]', el).onclick = () => { setId(''); draw(); };
      return;
    }
    el.innerHTML = `<input data-q placeholder="Nom, prénom ou téléphone…" autocomplete="off"><div class="results" data-res></div><div data-new></div>`;
    const q = $('[data-q]', el), res = $('[data-res]', el);
    const search = () => {
      const s = q.value.trim().toLowerCase(), digits = s.replace(/\D/g, '');
      if (!s) { res.innerHTML = ''; return; }
      const hits = state.clients.filter((c) => `${c.nom} ${c.prenom}`.toLowerCase().includes(s) || (digits.length >= 3 && String(c.tel).replace(/\D/g, '').includes(digits))).slice(0, 8);
      res.innerHTML = hits.map((c) => `<button type="button" data-pick="${c.id}"><span>${esc(c.prenom)} ${esc(c.nom)}</span><small>${esc(c.tel)} · ${state.vehicles.filter((v) => v.clientId === c.id).map((v) => esc(v.plaque)).join(' ')}</small></button>`).join('')
        + `<button type="button" data-create><span>➕ Créer le client « ${esc(q.value.trim())} »</span><small>il n'existe pas encore</small></button>`;
      $$('[data-pick]', res).forEach((b) => b.onclick = () => { setId(b.dataset.pick); draw(); el.dispatchEvent(new Event('change', { bubbles: true })); });
      $('[data-create]', res).onclick = () => createInline(q.value.trim());
    };
    q.oninput = search;
    const createInline = (txt) => {
      res.innerHTML = ''; q.hidden = true;
      const parts = txt.split(/\s+/), d = { nom: /\d/.test(txt) ? '' : (parts[0] || ''), prenom: /\d/.test(txt) ? '' : parts.slice(1).join(' '), tel: /\d/.test(txt) ? txt : '', email: '', adresse: '' };
      const box = $('[data-new]', el); box.innerHTML = '<div class="info"></div>';
      const inner = $('.info', box);
      progressive(inner, [
        { id: 'nom', label: 'Nom (ou société)', html: `<input data-f="nom" value="${esc(d.nom)}">`, done: () => d.nom.trim(), bind: (s) => { $('input', s).oninput = (e) => { d.nom = e.target.value; }; } },
        { id: 'prenom', label: 'Prénom', html: `<input data-f="prenom" value="${esc(d.prenom)}" placeholder="facultatif pour une société">`, done: () => d.prenom.trim() || d.tel, bind: (s) => { $('input', s).oninput = (e) => { d.prenom = e.target.value; }; } },
        { id: 'tel', label: 'Téléphone', html: `<input data-f="tel" value="${esc(d.tel)}" inputmode="tel" enterkeyhint="done" placeholder="06 12 34 56 78">`, done: () => d.tel.replace(/\D/g, '').length >= 9,
          bind: (s) => { const i = $('input', s); i.oninput = (e) => { d.tel = e.target.value; }; i.onkeydown = (e) => { if (e.key === 'Enter' && d.tel.replace(/\D/g, '').length >= 9) $('[data-save]', box).click(); }; } },
        { id: 'go', label: 'Valider', html: `<div class="row"><button type="button" class="primary" data-save style="flex:1;padding:12px">✔ Créer ce client et continuer</button><button type="button" data-cancel>Annuler</button></div><input data-f="email" data-optional type="email" placeholder="e-mail (facultatif)" style="margin-top:6px"><div class="err"></div>`,
          done: () => false, bind: (s) => {
            $('input', s).oninput = (e) => { d.email = e.target.value; };
            $('[data-cancel]', s).onclick = () => draw();
            $('[data-save]', s).onclick = async () => {
              try { const c = await api('POST', 'clients', d); state.clients.push(c); setId(c.id); draw(); el.dispatchEvent(new Event('change', { bubbles: true })); }
              catch (e) { errBox(s)(e); }
            };
          } },
      ]);
    };
  };
  draw();
}

// ---------------- vues ----------------
const V = {};

// --- nouvelle arrivee : plaque -> modele -> gabarit/couleur -> client -> renseignement -> place ---
V.arrivee = (preset = {}) => {
  const firstFree = freeSpots().find((s) => s.zone === 'Allée atelier') || freeSpots().find((s) => s.zone === 'Parking Ocaburo') || freeSpots()[0];
  const d = { plaque: '', marque: '', modele: '', type: '', couleur: '', annee: '', vin: '', km: '', clientId: '', motif: '', placeId: firstFree ? firstFree.id : '', statut: 'attente', plateOk: false, ...preset };
  return {
    title: () => '➕ Nouvelle arrivée',
    render(body) {
      body.insertAdjacentHTML('beforeend', `<datalist id="dl-models">${catalog.map((m) => `<option value="${esc(m.marque)} ${esc(m.modele)}">`).join('')}</datalist>`);
      const refresh = progressive(body, [
        { id: 'plaque', label: 'Plaque d’immatriculation', done: () => d.plateOk,
          html: `<input data-plate placeholder="AB-123-CD" style="font:700 20px Consolas,monospace;text-transform:uppercase;letter-spacing:2px" value="${esc(d.plaque)}"><div data-info></div>`,
          bind: (s) => {
            const inp = $('[data-plate]', s), info = $('[data-info]', s);
            let t = null;
            const look = async () => {
              const r = await api('GET', 'plate/' + encodeURIComponent(inp.value));
              if (!r.ok) { d.plateOk = false; info.innerHTML = inp.value.length > 5 ? `<div class="hint">${esc(r.error)}</div>` : ''; return refresh(); }
              d.plaque = r.plaque; d.plateOk = true;
              for (const k of ['marque', 'modele', 'type', 'couleur', 'annee', 'vin', 'km', 'clientId', 'model3d', 'energie']) if (r[k] && !d[k]) d[k] = r[k];
              const lines = [`<b class="plaque">${esc(r.plaque)}</b> ${r.format === 'SIV' ? 'format SIV' : `ancien format FNI${r.departement ? ` (dépt ${esc(r.departement)})` : ''}`}`];
              const dv = r.dejaVu;
              if (dv && dv.statut !== 'rendu') {
                d.plateOk = false;
                info.innerHTML = `<div class="info" style="margin-top:6px">🚗 <b>${esc(r.plaque)}</b> est déjà au garage (${esc(dv.placeId || 'sans place')}, ${esc(STATUT_LABELS[dv.statut])}).
                  <div class="row" style="margin-top:6px"><button type="button" class="primary" data-openveh>Ouvrir sa fiche</button></div></div>`;
                $('[data-openveh]', info).onclick = () => open(V.vehicle(dv.id));
                return refresh();
              }
              if (dv) {
                lines.push(`🔁 <b>Revient au garage</b> : ${dv.passages} passage${dv.passages > 1 ? 's' : ''}${dv.depense ? ` · ${eur(dv.depense)} de travaux` : ''}. <b>${esc(r.marque)} ${esc(r.modele)}</b>${r.clientId ? `, client <b>${esc(clientName(r.clientId))}</b>` : ''}, tout est repris.`);
                if (dv.dernier) lines.push(`🗓 Dernier passage du ${fmtD(dv.dernier.entree)} au ${fmtD(dv.dernier.sortie)}${dv.dernier.motif ? ` : ${esc(dv.dernier.motif)}` : ''}${dv.dernier.km ? ` · ${esc(dv.dernier.km)} km` : ''}`);
                if (dv.notes) lines.push(`📝 ${esc(dv.notes)}`);
                for (const c of dv.journal) lines.push(`💬 <span class="hint">${fmtD(c.at)}</span> ${esc(c.text)}`);
              }
              if (r.annee) lines.push(`📅 Première immatriculation ${r.anneeEstimee ? `estimée vers <b>${esc(r.annee)}</b> (série ${esc(r.plaque.slice(0, 2))})` : `<b>${esc(r.annee)}</b>`}`);
              if (r.anneeAvant) lines.push('📅 Immatriculé avant 2009 (ancien système)');
              if (!r.dejaVu) lines.push('<span class="hint">Pas de base SIV publique : marque et modèle se complètent à l’étape suivante.</span>');
              info.innerHTML = `<div class="info ${r.dejaVu ? 'good' : ''}" style="margin-top:6px">${lines.join('<br>')}</div>`;
              // repercute sur les etapes deja dessinees
              const mm = $('[data-mm]', body); if (mm && !mm.value && (d.marque || d.modele)) mm.value = `${d.marque} ${d.modele}`.trim();
              drawLook(); drawClient(); refresh();
            };
            inp.oninput = () => { d.plateOk = false; clearTimeout(t); t = setTimeout(look, 250); };
            if (d.plaque) look();
          } },
        { id: 'modele', label: 'Marque et modèle', done: () => d.modele || d.marque,
          html: `<input data-mm list="dl-models" placeholder="ex. Renault Clio" autocomplete="off"><div class="hint" data-mmhint></div>`,
          bind: (s) => {
            const inp = $('[data-mm]', s);
            if (d.marque || d.modele) inp.value = `${d.marque} ${d.modele}`.trim();
            inp.oninput = () => {
              const v = inp.value.trim(), lv = v.toLowerCase();
              const m = catalog.find((x) => `${x.marque} ${x.modele}`.toLowerCase() === lv) || catalog.find((x) => x.modele.toLowerCase() === lv);
              if (m) { d.marque = m.marque; d.modele = m.modele; if (!d.typeTouched) d.type = m.type; $('[data-mmhint]', s).textContent = `→ gabarit ${TYPES[m.type].label}`; }
              else { const [a, ...b] = v.split(/\s+/); d.marque = a || ''; d.modele = b.join(' '); $('[data-mmhint]', s).textContent = ''; }
              drawLook();
            };
          } },
        { id: 'look', label: 'Gabarit 3D et couleur', done: () => d.type && d.couleur, html: '<div data-look></div>' },
        { id: 'client', label: 'Client', done: () => d.clientId, html: '<div data-client></div>' },
        { id: 'motif', label: 'Renseignement (motif, remarque)', done: () => d.motif.trim(),
          html: `<textarea data-motif placeholder="ex. bruit au freinage, vidange en libre-service, pneus à monter…">${esc(d.motif)}</textarea>`,
          bind: (s) => { $('textarea', s).oninput = (e) => { d.motif = e.target.value; }; } },
        { id: 'place', label: 'Où la garer', done: () => true,
          html: `<select data-place>${placeOptions(d.placeId)}</select><div class="hint">Tu pourras aussi la glisser-déposer dans la 3D.</div>`,
          bind: (s) => { $('select', s).onchange = (e) => { d.placeId = e.target.value; }; } },
        { id: 'go', label: 'Valider', done: () => false,
          html: '<div class="row"><button class="primary" data-go>Enregistrer l’arrivée</button></div><div class="err"></div>',
          bind: (s) => {
            $('[data-go]', s).onclick = async () => {
              try {
                const { plateOk, typeTouched, ...body } = d;
                const v = await api('POST', 'vehicles', { ...body, placeId: d.placeId || null, journal: d.motif });
                await refresh_();
                open(V.vehicle(v.id)); world.focusVehicle(v.id);
                toast(`${v.plaque} ${v.retour ? 'est de retour (fiche et historique repris)' : 'enregistrée'}${v.placeId ? ` → ${v.placeId}` : ''}`, 3000);
              } catch (e) { errBox(s)(e); }
            };
          } },
      ]);
      const drawLook = () => {
        const el = $('[data-look]', body); if (!el) return;
        el.innerHTML = `<div class="types">${Object.entries(TYPES).map(([k, t]) => `<button type="button" data-type="${k}" class="${d.type === k ? 'on' : ''}">${t.label}</button>`).join('')}</div>
          <div class="swatches" style="margin-top:8px">${COLORS.map((c) => `<span data-col="${c}" class="${d.couleur === c ? 'on' : ''}" style="background:${c}"></span>`).join('')}<input type="color" data-colpick value="${esc(d.couleur || '#888888')}"></div>`;
        $$('[data-type]', el).forEach((b) => b.onclick = () => { d.type = b.dataset.type; d.typeTouched = true; drawLook(); refresh(); });
        $$('[data-col]', el).forEach((b) => b.onclick = () => { d.couleur = b.dataset.col; drawLook(); refresh(); });
        $('[data-colpick]', el).oninput = (e) => { d.couleur = e.target.value; };
      };
      const drawClient = () => clientPicker($('[data-client]', body), () => d.clientId, (id) => { d.clientId = id; refresh(); });
      drawLook(); drawClient(); refresh();
    },
  };
};
const placeOptions = (sel, except) => {
  const byZone = {};
  for (const s of freeSpots(except)) (byZone[s.zone] ||= []).push(s);
  const cur = sel && !freeSpots(except).some((s) => s.id === sel) ? `<option value="${sel}" selected>${spotLabel(sel)}</option>` : '';
  return `<option value="">— sans place —</option>${cur}` + ['Allée atelier', 'Parking Ocaburo', 'Atelier'].filter((z) => byZone[z])
    .map((z) => `<optgroup label="${z}">${byZone[z].map((s) => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${s.id} · ${s.label}</option>`).join('')}</optgroup>`).join('');
};

// --- fiche vehicule ---
V.vehicle = (id, tab = 'fiche') => {
  const view = {
    tab, draft: null,
    title: () => { const v = vehicle(id); return v ? `<span class="plaque">${esc(v.plaque)}</span> ${esc(v.marque)} ${esc(v.modele)} ${badge(v.statut)}` : 'Véhicule'; },
    render(body) {
      const v = vehicle(id); if (!v) return back();
      world.select(id);
      const d = view.draft ||= structuredClone(v);
      const orders = state.orders.filter((o) => o.vehicleId === id);
      body.innerHTML = `<div class="tabs">${[['fiche', 'Fiche'], ['journal', `Journal<b>${(v.journal || []).length}</b>`], ['travaux', `Interventions<b>${(v.interventions || []).length}</b>`], ['pieces', `Pièces<b>${orders.length}</b>`], ['passages', `Historique<b>${(v.visites || []).length}</b>`], ['modele', 'Modèle 3D']]
        .map(([k, l]) => `<button data-tab="${k}" class="${view.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div><div data-pane></div><div class="err"></div>`;
      $$('[data-tab]', body).forEach((b) => b.onclick = () => { view.tab = b.dataset.tab; show(); });
      const pane = $('[data-pane]', body), err = errBox(body);
      const patch = async (o) => { try { await api('PATCH', 'vehicles/' + id, o); view.draft = null; await refresh_(); } catch (e) { err(e); } };

      if (view.tab === 'fiche') {
        const last = (v.journal || []).slice(-1)[0];
        pane.innerHTML = `
          <div class="chips">${Object.keys(STATUT_LABELS).map((s) => `<button data-st="${s}" class="${v.statut === s ? 'on' : ''}" style="border-left:4px solid ${STATUT_COLORS[s]}">${STATUT_LABELS[s]}</button>`).join('')}</div>
          <div class="pay"><b>💶 Paiement</b><div class="chips">${Object.entries(PAY_LABELS).map(([k, l]) => `<button data-pay="${k}" class="${(v.paiement || {}).statut === k || (!v.paiement && k === 'non_paye') ? 'on' : ''}">${l}</button>`).join('')}</div>
            <select data-paymode>${PAY_MODES.map((m) => `<option ${(v.paiement || {}).mode === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
            <input type="number" step="0.01" data-payamt placeholder="montant reçu" value="${esc((v.paiement || {}).montant ?? '')}">
            <span class="hint">total ${eur(dueOf(v).total)}${dueOf(v).reste && dueOf(v).statut !== 'non_paye' ? ` · reste ${eur(dueOf(v).reste)}` : ''}${(v.paiement || {}).at ? ` · ${fmt(v.paiement.at)}` : ''}</span></div>
          ${last ? `<div class="info" style="margin-top:10px">💬 ${esc(last.text)} <span class="hint">— ${fmt(last.at)}</span></div>` : ''}
          <div class="grid2" style="margin-top:12px">
            <label class="full">Client<div data-client></div></label>
            <label>Place<div class="row"><select data-place>${placeOptions(v.placeId, id)}</select><button data-3d title="Choisir dans la 3D">3D</button></div></label>
            <label>Mécano<select data-mec><option value="">—</option>${state.mechanics.map((m) => `<option value="${m.id}" ${v.mecanoId === m.id ? 'selected' : ''}>${esc(m.prenom)} ${isPresent(m) ? '· présent' : ''}</option>`).join('')}</select></label>
            <label>Marque<input data-f="marque" value="${esc(d.marque)}"></label>
            <label>Modèle<input data-f="modele" value="${esc(d.modele)}"></label>
            <label class="full">Gabarit 3D<div class="types">${Object.entries(TYPES).map(([k, t]) => `<button data-type="${k}" class="${d.type === k ? 'on' : ''}">${t.label}</button>`).join('')}</div></label>
            <label class="full">Couleur<div class="swatches">${COLORS.map((c) => `<span data-col="${c}" class="${d.couleur === c ? 'on' : ''}" style="background:${c}"></span>`).join('')}<input type="color" data-f="couleur" value="${esc(d.couleur)}"></div></label>
            <label>Année<input data-f="annee" value="${esc(d.annee)}"></label>
            <label>Kilométrage<input data-f="km" value="${esc(d.km)}" inputmode="numeric"></label>
            <label>Entrée<input type="date" data-f="entree" value="${esc(d.entree)}"></label>
            <label>Sortie prévue<input type="date" data-f="sortiePrevue" value="${esc(d.sortiePrevue)}"></label>
            <label class="full">Motif<input data-f="motif" value="${esc(d.motif)}"></label>
            <label class="full">VIN<input data-f="vin" value="${esc(d.vin)}" style="font-family:Consolas,monospace"></label>
            <label class="full">Notes<textarea data-f="notes">${esc(d.notes)}</textarea></label>
          </div>
          <div class="actions"><button class="primary" data-save>Enregistrer</button>
            ${v.statut !== 'rendu' ? '<button class="ok" data-rendre>Rendre au client</button>' : ''}
            <button class="ghost" data-focus>⌖ Voir dans la 3D</button>
            <button class="warn" data-del style="margin-left:auto">Supprimer</button></div>`;
        $$('[data-st]', pane).forEach((b) => b.onclick = () => patch({ statut: b.dataset.st }));
        const pay = (statut) => patch({ paiement: { statut, mode: $('[data-paymode]', pane).value, montant: statut === 'paye' ? ($('[data-payamt]', pane).value || dueOf(v).total) : $('[data-payamt]', pane).value, at: new Date().toISOString() } });
        $$('[data-pay]', pane).forEach((b) => b.onclick = () => pay(b.dataset.pay));
        $('[data-payamt]', pane).onchange = () => pay((v.paiement || {}).statut === 'paye' ? 'paye' : 'acompte');
        $('[data-paymode]', pane).onchange = () => v.paiement && pay(v.paiement.statut);
        clientPicker($('[data-client]', pane), () => v.clientId, (cid) => { if (cid && cid !== v.clientId) patch({ clientId: cid }); });
        $('[data-place]', pane).onchange = (e) => patch({ placeId: e.target.value || null });
        $('[data-3d]', pane).onclick = () => startPlacing(id);
        $('[data-mec]', pane).onchange = (e) => patch({ mecanoId: e.target.value });
        $$('[data-f]', pane).forEach((el) => el.oninput = () => { d[el.dataset.f] = el.value; });
        $$('[data-type]', pane).forEach((b) => b.onclick = () => { d.type = b.dataset.type; patch({ type: d.type }); });
        $$('[data-col]', pane).forEach((b) => b.onclick = () => { d.couleur = b.dataset.col; patch({ couleur: d.couleur }); });
        $('[data-save]', pane).onclick = () => { const { journal, interventions, ...rest } = d; patch(rest); };
        $('[data-rendre]', pane) && ($('[data-rendre]', pane).onclick = (e) => {
          if (dueOf(v).reste > 0 && e.target.dataset.confirm !== '1') { e.target.dataset.confirm = '1'; e.target.textContent = `Reste ${eur(dueOf(v).reste)} à payer — rendre quand même ?`; return; }
          patch({ statut: 'rendu', placeId: null, sortie: new Date().toISOString().slice(0, 10) });
        });
        $('[data-focus]', pane).onclick = () => { world.focusVehicle(id); close(); world.select(id); };
        $('[data-del]', pane).onclick = async (e) => {
          if (e.target.dataset.confirm !== '1') { e.target.dataset.confirm = '1'; e.target.textContent = 'Supprimer définitivement (historique perdu) ?'; return; }
          try { await api('DELETE', 'vehicles/' + id); await refresh_(); back(); } catch (x) { err(x); }
        };
      }

      if (view.tab === 'journal') {
        pane.innerHTML = `<div class="journal">${(v.journal || []).slice().reverse().map((c) => `<div class="c">${esc(c.text)}<small>${fmt(c.at)}</small></div>`).join('') || '<p class="hint">Aucun commentaire.</p>'}</div>
          <div class="row"><input data-txt placeholder="Un renseignement rapide : « client passe à 17h », « bruit côté gauche »…"><button class="primary" data-add>Ajouter</button></div>`;
        const add = async () => { const t = $('[data-txt]', pane).value.trim(); if (!t) return; try { await api('POST', `vehicles/${id}/journal`, { text: t }); view.dirty = false; await refresh_(); } catch (e) { err(e); } };
        $('[data-add]', pane).onclick = add;
        $('[data-txt]', pane).onkeydown = (e) => { if (e.key === 'Enter') add(); };
        setTimeout(() => $('[data-txt]', pane).focus(), 30);
      }

      if (view.tab === 'travaux') {
        const lines = d.interventions;
        const total = () => lines.reduce((a, l) => a + (Number(l.montant) || 0), 0);
        const tarifOpts = (state.tarifs || []).map((g) => `<optgroup label="${esc(g.groupe)}">${g.items.map(([l, p]) => `<option value="${esc(g.groupe.split(' (')[0] + ' — ' + l)}|${p}">${esc(l)} — ${eur(p)}</option>`).join('')}</optgroup>`).join('');
        pane.innerHTML = `<div class="lines">${lines.map((l, i) => `<div class="line"><input type="checkbox" data-li="${i}" data-k="fait" ${l.fait ? 'checked' : ''} title="Fait">
            <input data-li="${i}" data-k="libelle" value="${esc(l.libelle)}"><input type="number" step="0.5" data-li="${i}" data-k="montant" value="${esc(l.montant)}">
            <button data-del="${i}">✕</button></div>`).join('') || '<p class="hint">Aucune intervention.</p>'}</div>
          <div class="row" style="margin-top:8px"><select data-tarif><option value="">+ depuis la grille tarifaire…</option>${tarifOpts}</select><button data-line>+ ligne libre</button></div>
          <div class="total">Total ${eur(total())} TTC</div>
          <div class="actions"><button class="primary" data-save>Enregistrer les interventions</button></div>`;
        $$('[data-li]', pane).forEach((el) => el.oninput = () => { const l = lines[el.dataset.li]; l[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.dataset.k === 'montant' ? Number(el.value) : el.value; $('.total', pane).textContent = `Total ${eur(total())} TTC`; });
        $$('[data-del]', pane).forEach((b) => b.onclick = () => { lines.splice(+b.dataset.del, 1); show(); });
        $('[data-tarif]', pane).onchange = (e) => { if (!e.target.value) return; const [l, p] = e.target.value.split('|'); lines.push({ libelle: l, montant: Number(p), fait: false }); show(); };
        $('[data-line]', pane).onclick = () => { lines.push({ libelle: '', montant: 0, fait: false }); show(); };
        $('[data-save]', pane).onclick = () => patch({ interventions: lines });
      }

      if (view.tab === 'pieces') {
        pane.innerHTML = orders.map(orderCard).join('') || '<p class="hint">Aucune pièce commandée pour ce véhicule.</p>';
        pane.insertAdjacentHTML('beforeend', '<div class="actions"><button class="primary" data-cmd>+ Commander une pièce</button></div>');
        bindOrderCards(pane);
        $('[data-cmd]', pane).onclick = () => open(V.orderNew({ vehicleId: id }), true);
      }

      if (view.tab === 'passages') {
        const vis = (v.visites || []).slice().reverse();
        const cur = v.statut !== 'rendu' ? `<div class="order"><div class="top"><span class="t">En cours depuis le ${fmtD(v.entree)}</span>${badge(v.statut)}</div><div class="hint">${esc(v.motif || '')}</div></div>` : '';
        pane.innerHTML = `<p class="hint">${(v.visites || []).length + (v.statut !== 'rendu' ? 1 : 0)} passage(s) · ${eur((v.visites || []).reduce((a, x) => a + (Number(x.total) || 0), 0))} de travaux au total · fiche créée le ${fmtD(v.createdAt)}</p>`
          + cur + (vis.map((x) => `<div class="order"><div class="top"><span class="t">${fmtD(x.entree)} → ${fmtD(x.sortie)}</span><b>${eur(x.total)}</b></div>
            <div class="hint">${esc(x.motif || '—')}${x.km ? ' · ' + esc(x.km) + ' km' : ''}${x.clientId && x.clientId !== v.clientId ? ' · client : ' + esc(clientName(x.clientId)) : ''}${x.mecanoId && mechanic(x.mecanoId) ? ' · 🔧 ' + esc(mechanic(x.mecanoId).prenom) : ''}</div>
            ${(x.interventions || []).length ? `<div class="timeline">${x.interventions.map((l) => `<div>${l.fait ? '✔' : '○'} ${esc(l.libelle)} — ${eur(l.montant)}</div>`).join('')}</div>` : ''}
            ${(x.pieces || []).length ? `<div class="hint" style="margin-top:4px">📦 ${x.pieces.map(esc).join(', ')}</div>` : ''}</div>`).join('') || (cur ? '' : '<p class="hint">Aucun passage archivé.</p>'));
      }

      if (view.tab === 'modele') {
        pane.innerHTML = `<p class="hint">${v.model3d ? `Modèle importé : <b>${esc(((v.model3d || '').startsWith('idb:') ? 'enregistré sur cet appareil' : v.model3d.split('/').pop()))}</b>` : `Gabarit procédural « ${esc((TYPES[v.type] || {}).label)} » à la couleur choisie.`}<br>
          Pour le vrai modèle, dépose un <b>.glb</b> (Sketchfab, Poly Pizza, CGTrader…). Il est recalé tout seul : à l'échelle du gabarit, posé au sol, l'avant vers l'avant.</p>
          <div class="row"><input type="file" data-file accept=".glb"><button data-clear ${v.model3d ? '' : 'disabled'}>Retirer</button></div>
          <div class="row" style="margin-top:8px"><input data-url placeholder="ou URL directe d'un .glb"><button data-import>Importer</button></div>
          <div class="row" style="margin-top:8px"><select data-existing><option value="">… ou un modèle déjà importé</option></select>
            <label class="row" style="flex:0"><input type="checkbox" data-flip ${v.modelFlip ? 'checked' : ''}> retourner</label></div>`;
        $('[data-file]', pane).onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { const r = await api('POST', 'models?name=' + encodeURIComponent(f.name), f, true); patch({ model3d: r.url }); } catch (x) { err(x); } };
        $('[data-import]', pane).onclick = async () => { const u = $('[data-url]', pane).value.trim(); if (!u) return; try { const r = await api('POST', 'models/import', { url: u }); patch({ model3d: r.url }); } catch (x) { err(x); } };
        $('[data-clear]', pane).onclick = () => patch({ model3d: '' });
        $('[data-flip]', pane).onchange = (e) => patch({ modelFlip: e.target.checked });
        api('GET', 'models').then((list) => {
          const sel = $('[data-existing]', pane); if (!sel) return;
          sel.innerHTML += list.map((m) => `<option value="${esc(m.url)}" ${v.model3d === m.url ? 'selected' : ''}>${esc(m.name)} (${(m.size / 1e6).toFixed(1)} Mo)</option>`).join('');
          sel.onchange = () => sel.value && patch({ model3d: sel.value });
        }).catch(() => {});
      }
    },
  };
  return view;
};

// --- listes ---
const vehicleItem = (v) => `<div class="item" data-veh="${v.id}"><div class="sw" style="background:${esc(v.couleur)}"></div>
  <div><div class="t"><span class="plaque">${esc(v.plaque || '—')}</span> ${esc(v.marque)} ${esc(v.modele)}</div>
  <div class="s">${esc(clientName(v.clientId))}${v.motif ? ' · ' + esc(v.motif) : ''}${v.mecanoId && mechanic(v.mecanoId) ? ' · 🔧 ' + esc(mechanic(v.mecanoId).prenom) : ''}</div></div>
  <div style="text-align:right">${badge(v.statut)}<div class="place">${v.placeId || 'sans place'}</div>${payTag(v)}</div></div>`;
const bindVehicleItems = (el) => $$('[data-veh]', el).forEach((x) => x.onclick = () => open(V.vehicle(x.dataset.veh), true));

V.vehicles = () => {
  const view = { q: '', st: null,
    title: () => '🚗 Véhicules',
    render(body) {
      body.innerHTML = `<div class="row"><input data-q placeholder="Plaque, client, modèle, place…" value="${esc(view.q)}"><button class="primary" data-new>➕ Nouvelle arrivée</button></div>
        <div class="chips" style="margin-top:8px">${Object.keys(STATUT_LABELS).map((s) => `<button data-st="${s}" class="${view.st === s ? 'on' : ''}" style="border-left:4px solid ${STATUT_COLORS[s]}">${STATUT_LABELS[s]} ${state.vehicles.filter((v) => v.statut === s).length}</button>`).join('')}</div><div data-list></div>`;
      const draw = () => {
        const q = view.q.toLowerCase();
        const list = state.vehicles.filter((v) => (view.st ? v.statut === view.st : v.statut !== 'rendu'))
          .filter((v) => !q || [v.plaque, v.marque, v.modele, clientName(v.clientId), v.placeId, v.motif].some((s) => String(s || '').toLowerCase().includes(q)));
        const zones = {};
        for (const v of list) { const s = spotDef(v.placeId); (zones[v.statut === 'rendu' ? 'Rendues' : s ? s.zone : 'Sans place'] ||= []).push(v); }
        $('[data-list]', body).innerHTML = ['Atelier', 'Allée atelier', 'Parking Ocaburo', 'Sans place', 'Rendues'].filter((z) => zones[z])
          .map((z) => `<div class="group-title">${z} · ${zones[z].length}</div>${zones[z].map(vehicleItem).join('')}`).join('') || '<p class="hint">Aucun véhicule.</p>';
        bindVehicleItems(body);
      };
      $('[data-q]', body).oninput = (e) => { view.q = e.target.value; draw(); };
      $$('[data-st]', body).forEach((b) => b.onclick = () => { view.st = view.st === b.dataset.st ? null : b.dataset.st; show(); });
      $('[data-new]', body).onclick = () => open(V.arrivee(), true);
      draw();
    } };
  return view;
};

V.ready = () => ({
  title: () => '✔ Véhicules prêts',
  render(body) {
    const list = state.vehicles.filter((v) => v.statut === 'termine');
    body.innerHTML = list.map((v) => `<div class="item" data-veh="${v.id}"><div class="sw" style="background:${esc(v.couleur)}"></div>
      <div><div class="t"><span class="plaque">${esc(v.plaque)}</span> ${esc(v.marque)} ${esc(v.modele)}</div><div class="s">📞 ${esc(clientName(v.clientId))} · ${esc((client(v.clientId) || {}).tel || '')}</div></div>
      <div><button class="ok" data-rendre="${v.id}">Rendre</button><div class="place">${v.placeId || ''}</div></div></div>`).join('') || '<p class="hint">Aucun véhicule prêt pour l’instant.</p>';
    bindVehicleItems(body);
    $$('[data-rendre]', body).forEach((b) => b.onclick = async (e) => { e.stopPropagation(); await api('PATCH', 'vehicles/' + b.dataset.rendre, { statut: 'rendu', placeId: null, sortie: new Date().toISOString().slice(0, 10) }); await refresh_(); });
  },
});

// --- clients ---
V.clients = () => {
  const view = { q: '', title: () => '👤 Clients',
    render(body) {
      body.innerHTML = `<div class="row"><input data-q placeholder="Nom, prénom, téléphone…" value="${esc(view.q)}"><button class="primary" data-new>+ Client</button></div><div data-list style="margin-top:8px"></div>`;
      const draw = () => {
        const q = view.q.toLowerCase();
        $('[data-list]', body).innerHTML = state.clients.filter((c) => !q || [c.nom, c.prenom, c.tel, c.email].some((s) => String(s || '').toLowerCase().includes(q)))
          .sort((a, b) => a.nom.localeCompare(b.nom)).map((c) => `<div class="item" data-cli="${c.id}"><div class="sw" style="background:var(--panel2);display:grid;place-items:center;font-weight:700;border-color:var(--line)">${esc((c.nom || '?')[0])}</div>
            <div><div class="t">${esc(c.prenom)} ${esc(c.nom)}</div><div class="s">${esc(c.tel)}${c.adresse ? ' · ' + esc(c.adresse) : ''}</div></div>
            <div class="place">${state.vehicles.filter((v) => v.clientId === c.id && v.statut !== 'rendu').map((v) => esc(v.plaque)).join('<br>')}</div></div>`).join('') || '<p class="hint">Aucun client.</p>';
        $$('[data-cli]', body).forEach((x) => x.onclick = () => open(V.client(x.dataset.cli), true));
      };
      $('[data-q]', body).oninput = (e) => { view.q = e.target.value; draw(); };
      $('[data-new]', body).onclick = () => open(V.clientNew(), true);
      draw();
    } };
  return view;
};
V.clientNew = () => {
  const d = { nom: '', prenom: '', tel: '', email: '', adresse: '', notes: '' };
  const f = (k, ph = '') => `<input data-f="${k}" placeholder="${ph}">`;
  const b = (k) => (s) => { $('input', s).oninput = (e) => { d[k] = e.target.value; }; };
  return { title: () => '👤 Nouveau client', render(body) {
    progressive(body, [
      { id: 'nom', label: 'Nom (ou société)', html: f('nom'), done: () => d.nom.trim(), bind: b('nom') },
      { id: 'prenom', label: 'Prénom', html: f('prenom', 'facultatif pour une société'), done: () => d.prenom.trim() || d.tel, bind: b('prenom') },
      { id: 'tel', label: 'Téléphone', html: f('tel'), done: () => d.tel.replace(/\D/g, '').length >= 9, bind: b('tel') },
      { id: 'email', label: 'E-mail', html: f('email', 'facultatif'), done: () => true, bind: b('email') },
      { id: 'adresse', label: 'Ville / adresse', html: f('adresse', 'facultatif'), done: () => true, bind: b('adresse') },
      { id: 'go', label: 'Valider', done: () => false, html: '<button class="primary" data-go>Créer le client</button><div class="err"></div>',
        bind: (s) => { $('[data-go]', s).onclick = async () => { try { const c = await api('POST', 'clients', d); await refresh_(); stack.pop(); open(V.client(c.id), true); } catch (e) { errBox(s)(e); } }; } },
    ]);
  } };
};
V.client = (id) => {
  const view = { title: () => `👤 ${esc(clientName(id))}`, render(body) {
    const c = client(id); if (!c) return back();
    const d = structuredClone(c), vs = state.vehicles.filter((v) => v.clientId === id);
    body.innerHTML = `<div class="grid2">
      ${['nom', 'prenom', 'tel', 'email'].map((k) => `<label>${{ nom: 'Nom', prenom: 'Prénom', tel: 'Téléphone', email: 'E-mail' }[k]}<input data-f="${k}" value="${esc(d[k])}"></label>`).join('')}
      <label class="full">Adresse<input data-f="adresse" value="${esc(d.adresse)}"></label>
      <label class="full">Notes<textarea data-f="notes">${esc(d.notes)}</textarea></label></div>
      <div class="group-title">Véhicules (${vs.length})</div>${vs.map(vehicleItem).join('') || '<p class="hint">Aucun.</p>'}
      <div class="actions"><button class="primary" data-save>Enregistrer</button><button data-veh-new>➕ Arrivée d’un véhicule</button><button class="warn" data-del style="margin-left:auto">Supprimer</button></div><div class="err"></div>`;
    $$('[data-f]', body).forEach((el) => el.oninput = () => { d[el.dataset.f] = el.value; });
    bindVehicleItems(body);
    $('[data-save]', body).onclick = async () => { try { await api('PUT', 'clients/' + id, d); view.dirty = false; await refresh_(); toast('Client enregistré', 1500); } catch (e) { errBox(body)(e); } };
    $('[data-veh-new]', body).onclick = () => open(V.arrivee({ clientId: id }), true);
    $('[data-del]', body).onclick = async (e) => {
      if (e.target.dataset.confirm !== '1') { e.target.dataset.confirm = '1'; e.target.textContent = 'Confirmer la suppression'; return; }
      try { await api('DELETE', 'clients/' + id); await refresh_(); back(); } catch (x) { errBox(body)(x); }
    };
  } };
  return view;
};

// --- commandes de pieces (suivi : commandee -> arrivee -> posee, avec historique) ---
const orderCard = (o) => {
  const v = vehicle(o.vehicleId), last = (o.history || []).slice(-1)[0];
  const next = o.statut === 'commandee' ? `<button class="ok" data-arrive="${o.id}">📥 Arrivée</button>`
    : o.statut === 'arrivee' ? `${v ? `<button class="ok" data-posego="${o.id}">✔ Posée sur ${esc(v.plaque)}</button>` : ''}<button class="${v ? '' : 'ok'}" data-pose3d="${o.id}">🔧 ${v ? 'Autre voiture' : 'Poser sur une voiture'}</button>` : '';
  return `<div class="order"><div class="top"><span class="t">${esc(o.libelle)} ${o.qte > 1 ? `× ${esc(o.qte)}` : ''}</span>${obadge(o.statut)}
      ${v ? `<span class="plaque" data-veh="${v.id}" style="cursor:pointer">${esc(v.plaque)}</span>` : '<span class="hint">stock atelier</span>'}</div>
    <div class="row hint" style="margin-top:4px">${esc(o.fournisseur || '')}${o.ref ? ' · réf. ' + esc(o.ref) : ''}${o.prix ? ' · ' + eur(o.prix) : ''}${o.attendueLe && o.statut === 'commandee' ? ' · attendue le ' + fmtD(o.attendueLe) : ''}${last ? ' · ' + fmt(last.at) : ''}</div>
    <div class="row" style="margin-top:6px">${next}<button data-opaye="${o.id}" class="${o.paye ? 'ok' : ''}" title="Paiement du fournisseur">💶 ${o.paye ? 'Payée' : 'Non payée'}</button><button class="ghost" data-hist="${o.id}">Historique</button>${o.statut === 'commandee' ? `<button class="ghost" data-cancel="${o.id}">Annuler</button>` : ''}</div>
    <div class="timeline" data-tl="${o.id}" hidden>${(o.history || []).map((h) => `<div>${fmt(h.at)} — <b>${ORDER_LABELS[h.statut]}</b>${h.vehicleId && vehicle(h.vehicleId) ? ' · ' + esc(vehicle(h.vehicleId).plaque) : ''}${h.note ? ' · ' + esc(h.note) : ''}</div>`).join('')}</div></div>`;
};
function bindOrderCards(el) {
  const set = async (id, o) => { try { await api('PATCH', 'orders/' + id, o); await refresh_(); } catch (e) { errBox(el)(e); toast(e.message, 3000); } };
  $$('[data-arrive]', el).forEach((b) => b.onclick = () => set(b.dataset.arrive, { statut: 'arrivee' }));
  $$('[data-opaye]', el).forEach((b) => b.onclick = () => set(b.dataset.opaye, { paye: !state.orders.find((o) => o.id === b.dataset.opaye).paye }));
  $$('[data-posego]', el).forEach((b) => b.onclick = () => { const o = state.orders.find((x) => x.id === b.dataset.posego); set(o.id, { statut: 'posee', vehicleId: o.vehicleId }); });
  $$('[data-pose3d]', el).forEach((b) => b.onclick = async () => {
    const o = state.orders.find((x) => x.id === b.dataset.pose3d);
    const vid = await pick3D(`où poser « ${o.libelle} »`);
    if (vid) { try { await api('PATCH', 'orders/' + o.id, { statut: 'posee', vehicleId: vid }); await refresh_(); toast(`${o.libelle} posée sur ${vehicle(vid).plaque}`, 2500); } catch (e) { toast(e.message, 3000); } }
    reopen();
  });
  $$('[data-cancel]', el).forEach((b) => b.onclick = () => set(b.dataset.cancel, { statut: 'annulee' }));
  $$('[data-hist]', el).forEach((b) => b.onclick = () => { const t = $(`[data-tl="${b.dataset.hist}"]`, el); t.hidden = !t.hidden; });
  $$('.order [data-veh]', el).forEach((x) => x.onclick = () => open(V.vehicle(x.dataset.veh, 'pieces'), true));
}
V.orders = (tab = 'commandee') => {
  const view = { tab, title: () => '📦 Commandes de pièces',
    render(body) {
      const tabs = [['commandee', 'Commandées'], ['arrivee', 'Arrivées (en réserve)'], ['posee', 'Posées'], ['all', 'Historique']];
      const n = (s) => state.orders.filter((o) => o.statut === s).length;
      body.innerHTML = `<div class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${view.tab === k ? 'on' : ''}">${l}${k !== 'all' ? `<b>${n(k)}</b>` : ''}</button>`).join('')}</div><div data-list></div>
        <div class="actions"><button class="primary" data-new>+ Nouvelle commande</button></div><div class="err"></div>`;
      $$('[data-tab]', body).forEach((b) => b.onclick = () => { view.tab = b.dataset.tab; show(); });
      const lastAt = (o) => ((o.history || []).slice(-1)[0] || {}).at || o.createdAt || '';
      const list = state.orders.filter((o) => view.tab === 'all' || o.statut === view.tab).sort((a, b) => lastAt(b).localeCompare(lastAt(a)));
      $('[data-list]', body).innerHTML = list.map(orderCard).join('') || '<p class="hint">Rien ici.</p>';
      if (view.tab === 'all') $$('[data-tl]', body).forEach((t) => { t.hidden = false; });
      bindOrderCards(body);
      $('[data-new]', body).onclick = () => open(V.orderNew(), true);
    } };
  return view;
};
V.orderNew = (preset = {}) => {
  const d = { libelle: '', vehicleId: '', fournisseur: '', ref: '', qte: 1, prix: '', attendueLe: '', statut: 'commandee', forStock: false, ...preset };
  const fournisseurs = [...new Set(state.orders.map((o) => o.fournisseur).filter(Boolean))];
  return { title: () => '📦 Nouvelle commande', render(body) {
    body.insertAdjacentHTML('beforeend', `<datalist id="dl-four">${fournisseurs.map((f) => `<option value="${esc(f)}">`).join('')}</datalist>`);
    progressive(body, [
      { id: 'lib', label: 'Pièce', html: `<input data-f placeholder="ex. kit distribution, plaquettes AV, filtre à huile…" value="${esc(d.libelle)}">`, done: () => d.libelle.trim(), bind: (s) => { $('input', s).oninput = (e) => { d.libelle = e.target.value; }; } },
      { id: 'veh', label: 'Pour quel véhicule ?', done: () => d.vehicleId || d.forStock,
        html: (() => { const v = vehicle(d.vehicleId); return (v ? `<div class="info good row"><span class="plaque">${esc(v.plaque)}</span><b style="flex:1">${esc(v.marque)} ${esc(v.modele)}</b><span class="hint">${esc(clientName(v.clientId))}</span></div>`
            : d.forStock ? '<div class="info good">🗄 Pour le stock de l’atelier</div>' : '')
          + `<div class="row" style="margin-top:6px"><button type="button" class="${d.vehicleId || d.forStock ? '' : 'primary'}" data-pick3d>🚗 ${v ? 'Changer de voiture' : 'Choisir la voiture dans le garage'}</button><button type="button" data-forstock>🗄 Stock atelier</button></div>`; })(),
        bind: (s) => {
          $('[data-pick3d]', s).onclick = async () => { const vid = await pick3D('pour cette commande'); if (vid) { d.vehicleId = vid; d.forStock = false; } reopen(); };
          $('[data-forstock]', s).onclick = () => { d.forStock = true; d.vehicleId = ''; show(); };
        } },
      { id: 'four', label: 'Fournisseur', html: `<input list="dl-four" placeholder="ex. distributeur, concession…" value="${esc(d.fournisseur)}">`, done: () => d.fournisseur.trim(), bind: (s) => { $('input', s).oninput = (e) => { d.fournisseur = e.target.value; }; } },
      { id: 'qte', label: 'Quantité, prix et référence', done: () => Number(d.qte) > 0,
        html: `<div class="row"><input type="number" min="1" value="${esc(d.qte)}" data-q style="max-width:90px"><input type="number" step="0.01" placeholder="prix € (facultatif)" data-p value="${esc(d.prix)}"><input placeholder="référence (facultatif)" data-r value="${esc(d.ref)}"></div>`,
        bind: (s) => { $('[data-q]', s).oninput = (e) => { d.qte = Number(e.target.value); }; $('[data-p]', s).oninput = (e) => { d.prix = e.target.value; }; $('[data-r]', s).oninput = (e) => { d.ref = e.target.value; }; } },
      { id: 'date', label: 'Arrivée prévue', html: `<input type="date" value="${esc(d.attendueLe)}">`, done: () => true, bind: (s) => { $('input', s).oninput = (e) => { d.attendueLe = e.target.value; }; } },
      { id: 'go', label: 'Valider', done: () => false, html: '<button class="primary" data-go>Passer la commande</button><div class="err"></div>',
        bind: (s) => { $('[data-go]', s).onclick = async () => {
          try {
            const { forStock, ...o } = d; await api('POST', 'orders', o);
            const v = vehicle(d.vehicleId);
            if (v && ['attente', 'diagnostic'].includes(v.statut)) await api('PATCH', 'vehicles/' + v.id, { statut: 'attente_pieces' });
            await refresh_(); back();
          } catch (e) { errBox(s)(e); }
        }; } },
    ]);
  } };
};

// --- mecanos ---
V.mechanics = () => ({
  title: () => '🔧 Mécanos',
  render(body) {
    const sim = simClock ? ` (simulation ${simClock})` : '';
    body.innerHTML = `<p class="hint">Présence calculée d'après le planning, ${DAYS.find(([k]) => k === today())[1].toLowerCase()} à ${nowHM()}${sim}. Les présents se baladent dans l’atelier.</p>`
      + state.mechanics.map((m) => {
        const vs = active().filter((v) => v.mecanoId === m.id);
        return `<div class="item" data-mec="${m.id}"><div class="sw" style="background:${esc(m.couleur)}"></div>
          <div><div class="t">${esc(m.prenom)} ${esc(m.nom)}</div><div class="s">${esc(m.specialite || '')}${vs.length ? ' · ' + vs.map((v) => esc(v.plaque)).join(', ') : ''}</div></div>
          <span class="presence ${isPresent(m) ? 'on' : 'off'}">${m.absent ? 'absent' : isPresent(m) ? 'au travail' : 'pas de créneau'}</span></div>`;
      }).join('') + '<div class="actions"><button class="primary" data-new>+ Mécano</button></div>';
    $$('[data-mec]', body).forEach((x) => x.onclick = () => open(V.mechanic(x.dataset.mec), true));
    $('[data-new]', body).onclick = () => open(V.mechanicNew(), true);
  },
});
V.mechanicNew = () => {
  const d = { prenom: '', nom: '', specialite: '', couleur: '', tel: '', planning: Object.fromEntries(DAYS.map(([k]) => [k, ['sam', 'dim'].includes(k) ? [] : HORAIRES])), absent: false, actif: true };
  return { title: () => '🔧 Nouveau mécano', render(body) {
    const refresh = progressive(body, [
      { id: 'prenom', label: 'Prénom', html: '<input>', done: () => d.prenom.trim(), bind: (s) => { $('input', s).oninput = (e) => { d.prenom = e.target.value; }; } },
      { id: 'spe', label: 'Spécialité', html: '<input placeholder="ex. freinage, diagnostic, pneus…">', done: () => d.specialite.trim(), bind: (s) => { $('input', s).oninput = (e) => { d.specialite = e.target.value; }; } },
      { id: 'tenue', label: 'Couleur de la combinaison', done: () => d.couleur, html: `<div class="swatches">${TENUES.map((c) => `<span data-c="${c}" style="background:${c}"></span>`).join('')}</div>`,
        bind: (s) => $$('[data-c]', s).forEach((x) => x.onclick = () => { d.couleur = x.dataset.c; $$('[data-c]', s).forEach((y) => y.classList.toggle('on', y === x)); refresh(); }) },
      { id: 'plan', label: 'Planning (horaires du garage par défaut)', done: () => true, html: planningTable(d.planning), bind: (s) => bindPlanning(s, d.planning) },
      { id: 'go', label: 'Valider', done: () => false, html: '<button class="primary" data-go>Ajouter le mécano</button><div class="err"></div>',
        bind: (s) => { $('[data-go]', s).onclick = async () => { try { await api('POST', 'mechanics', d); await refresh_(); back(); } catch (e) { errBox(s)(e); } }; } },
    ]);
  } };
};
const planningTable = (p) => `<table class="planning">${DAYS.map(([k, l]) => `<tr><th>${l.slice(0, 3)}</th><td><input data-day="${k}" value="${esc(planningText(p[k]))}" placeholder="repos"></td></tr>`).join('')}</table>
  <div class="hint">Format : 08:30-12:30, 14:00-18:45 — vide = repos.</div>`;
const bindPlanning = (el, p) => $$('[data-day]', el).forEach((i) => i.oninput = () => { p[i.dataset.day] = parsePlanning(i.value); });
V.mechanic = (id) => ({
  title: () => `🔧 ${esc((mechanic(id) || {}).prenom || '')}`,
  render(body) {
    const m = mechanic(id); if (!m) return back();
    const d = structuredClone(m);
    const vs = active().filter((v) => v.mecanoId === id);
    body.innerHTML = `<div class="grid2"><label>Prénom<input data-f="prenom" value="${esc(d.prenom)}"></label><label>Nom<input data-f="nom" value="${esc(d.nom)}"></label>
      <label>Spécialité<input data-f="specialite" value="${esc(d.specialite)}"></label><label>Téléphone<input data-f="tel" value="${esc(d.tel)}"></label>
      <label class="full">Combinaison<div class="swatches">${TENUES.map((c) => `<span data-c="${c}" class="${d.couleur === c ? 'on' : ''}" style="background:${c}"></span>`).join('')}</div></label>
      <label class="full"><span class="row"><input type="checkbox" data-abs ${d.absent ? 'checked' : ''}> Absent (congé, maladie) — ne vient pas malgré le planning</span></label></div>
      <div class="group-title">Planning</div>${planningTable(d.planning)}
      <div class="group-title">Véhicules confiés (${vs.length})</div>${vs.map(vehicleItem).join('') || '<p class="hint">Aucun — à choisir sur la fiche véhicule.</p>'}
      <div class="actions"><button class="primary" data-save>Enregistrer</button><button class="warn" data-del style="margin-left:auto">Supprimer</button></div><div class="err"></div>`;
    $$('[data-f]', body).forEach((el) => el.oninput = () => { d[el.dataset.f] = el.value; });
    $$('[data-c]', body).forEach((x) => x.onclick = () => { d.couleur = x.dataset.c; $$('[data-c]', body).forEach((y) => y.classList.toggle('on', y === x)); });
    $('[data-abs]', body).onchange = (e) => { d.absent = e.target.checked; };
    bindPlanning(body, d.planning); bindVehicleItems(body);
    $('[data-save]', body).onclick = async () => { try { await api('PUT', 'mechanics/' + id, d); await refresh_(); toast('Mécano enregistré', 1500); } catch (e) { errBox(body)(e); } };
    $('[data-del]', body).onclick = async (e) => {
      if (e.target.dataset.confirm !== '1') { e.target.dataset.confirm = '1'; e.target.textContent = 'Confirmer la suppression'; return; }
      try { await api('DELETE', 'mechanics/' + id); await refresh_(); back(); } catch (x) { errBox(body)(x); }
    };
  },
});

// --- reserve : inventaire facon jeu video (cases, icones procedurales ou photo) ---
const stockLevel = (s) => Number(s.qte) <= Number(s.seuil || 0) ? 'low' : Number(s.qte) <= Number(s.seuil || 0) * 1.5 + 1 ? 'mid' : 'ok';
const lv = (s) => 'lv-' + stockLevel(s); // classe CSS (pas 'ok' : deja pris par les boutons verts)
const slotImg = (s) => store.assetUrl(s.photo) || itemIcon(s);
async function uploadPhoto(file) {
  const r = await api('POST', 'photos?name=' + encodeURIComponent(file.name), file, true);
  return r.url;
}
// fiche d'un article : panneau a cote de la grille (ordinateur) ou fenetre a part (telephone)
const narrowScreen = () => matchMedia('(max-width: 760px)').matches;
const stockDetailHtml = (sel) => `<div class="inv-detail ${lv(sel)}">
  <div class="big"><img src="${slotImg(sel)}" class="${sel.photo ? 'photo' : ''}" alt=""></div>
  <div class="name">${esc(sel.libelle)}</div>
  <div class="meta">${esc(sel.categorie || 'Divers')} · ${esc(sel.emplacement || 'emplacement ?')}${sel.ref ? ' · réf. ' + esc(sel.ref) : ''}</div>
  <div class="bar"><i style="width:${Math.min(100, (Number(sel.qte) / Math.max(1, Number(sel.seuil || 1) * 3)) * 100)}%"></i></div>
  <div class="meta">${stockLevel(sel) === 'low' ? '⚠ sous le seuil, à recommander' : stockLevel(sel) === 'mid' ? 'stock juste' : 'stock ok'} · seuil ${esc(sel.seuil || 0)}${sel.prix ? ' · ' + eur(sel.prix) + ' /u' : ''}</div>
  <div class="qty big-qty"><button data-dq="-1">−</button><b>${esc(sel.qte)}</b><button data-dq="1">+</button></div>
  <div class="row" style="justify-content:center"><button class="primary" data-place ${Number(sel.qte) > 0 ? '' : 'disabled'}>🔧 Poser sur une voiture</button></div>
  <div class="row" style="justify-content:center"><label class="photo-btn"><input type="file" accept="image/*" capture="environment" data-photo hidden>📷 ${sel.photo ? 'Changer la photo' : 'Ajouter une photo'}</label>
    ${sel.photo ? '<button class="ghost" data-nophoto>Icône</button>' : ''}</div>
  <div class="row" style="justify-content:center"><button data-cmd>📦 Commander</button><button data-edit>Éditer le stock</button></div>
  ${(sel.history || []).length ? `<div class="timeline" style="text-align:left">${sel.history.slice(-4).reverse().map((h) => `<div>${fmt(h.at)} · ${h.delta} → ${esc(h.plaque || '')}</div>`).join('')}</div>` : ''}
</div>`;
function bindStockDetail(el, sel, err) {
  $$('[data-dq]', el).forEach((b) => b.onclick = async () => { await api('PATCH', 'stock/' + sel.id, { qte: Math.max(0, (Number(sel.qte) || 0) + Number(b.dataset.dq)) }); await refresh_(); });
  $('[data-photo]', el).onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { toast('Envoi de la photo…'); const url = await uploadPhoto(f); await api('PATCH', 'stock/' + sel.id, { photo: url }); toast('', 1); await refresh_(); } catch (x) { toast(''); err(x); } };
  $('[data-nophoto]', el) && ($('[data-nophoto]', el).onclick = async () => { await api('PATCH', 'stock/' + sel.id, { photo: '' }); await refresh_(); });
  $('[data-cmd]', el).onclick = () => open(V.orderNew({ libelle: sel.libelle, ref: sel.ref, forStock: true }), true);
  $('[data-edit]', el).onclick = () => open(V.stockItem(sel.id), true);
  $('[data-place]', el).onclick = () => startPartPlacing(sel);
}
V.stockDetail = (id) => ({
  title: () => `🗄 ${esc(((state.stock || []).find((s) => s.id === id) || {}).libelle || 'Article')}`,
  render(body) {
    const sel = (state.stock || []).find((s) => s.id === id); if (!sel) return back();
    body.innerHTML = stockDetailHtml(sel) + '<div class="err"></div>';
    bindStockDetail(body, sel, errBox(body));
  },
});
V.stock = (tab = 'inv') => {
  const view = { tab, q: '', cat: null, sel: null, title: () => '🗄 Réserve — inventaire',
    render(body) {
      const items = state.stock || [], reserved = state.orders.filter((o) => o.statut === 'arrivee' && o.vehicleId), incoming = state.orders.filter((o) => o.statut === 'commandee');
      const low = items.filter((s) => stockLevel(s) === 'low');
      const value = items.reduce((a, s) => a + (Number(s.qte) || 0) * (Number(s.prix) || 0), 0);
      body.innerHTML = `<div class="tabs">${[['inv', `Inventaire<b>${items.length}</b>`], ['low', `À recommander<b>${low.length}</b>`], ['res', `Réservées véhicules<b>${reserved.length}</b>`], ['in', `En commande<b>${incoming.length}</b>`]]
        .map(([k, l]) => `<button data-tab="${k}" class="${view.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div><div data-pane></div><div class="err"></div>`;
      $$('[data-tab]', body).forEach((b) => b.onclick = () => { view.tab = b.dataset.tab; show(); });
      const pane = $('[data-pane]', body);
      if (view.tab === 'inv' || view.tab === 'low') {
        const narrow = narrowScreen(); // telephone : la grille seule, la fiche s'ouvre dans une autre fenetre
        const cats = [...new Set(items.map((s) => s.categorie || 'Divers'))].sort();
        const list = (view.tab === 'low' ? low : items).filter((s) => (!view.cat || (s.categorie || 'Divers') === view.cat)
          && (!view.q || [s.libelle, s.categorie, s.ref, s.emplacement].some((x) => String(x || '').toLowerCase().includes(view.q.toLowerCase()))));
        const sel = narrow ? null : items.find((s) => s.id === view.sel) || list[0];
        pane.innerHTML = `<div class="row"><input data-q placeholder="Chercher un article…" value="${esc(view.q)}"><button class="primary" data-new>+ Article</button></div>
          <div class="chips" style="margin-top:8px"><button data-cat="" class="${!view.cat ? 'on' : ''}">Tout</button>${cats.map((c) => `<button data-cat="${esc(c)}" class="${view.cat === c ? 'on' : ''}">${esc(c)}</button>`).join('')}</div>
          <div class="inv-wrap ${narrow ? 'solo' : ''}">
            <div class="inv">${list.map((s) => `<button class="slot ${lv(s)} ${sel && sel.id === s.id ? 'sel' : ''}" data-slot="${s.id}" title="${esc(s.libelle)}">
              <img src="${slotImg(s)}" class="${s.photo ? 'photo' : ''}" alt=""><span class="q">${esc(s.qte)}</span>${s.photo ? '<span class="cam">📷</span>' : ''}${narrow ? `<span class="nm">${esc(s.libelle)}</span>` : ''}</button>`).join('')}
              ${Array.from({ length: Math.max(0, (narrow ? 8 : 12) - list.length) }, () => '<div class="slot empty"></div>').join('')}</div>
            ${sel ? stockDetailHtml(sel) : ''}
          </div>
          <p class="hint">Valeur du stock : <b>${eur(value)}</b> · ${low.length} article(s) sous le seuil.</p>`;
        $('[data-q]', pane).oninput = (e) => { view.q = e.target.value; const pos = e.target.selectionStart; show(); const i = $('[data-q]'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } };
        $$('[data-cat]', pane).forEach((b) => b.onclick = () => { view.cat = b.dataset.cat || null; show(); });
        $('[data-new]', pane).onclick = () => open(V.stockNew(), true);
        $$('[data-slot]', pane).forEach((b) => b.onclick = () => { if (narrow) open(V.stockDetail(b.dataset.slot), true); else { view.sel = b.dataset.slot; show(); } });
        if (sel) bindStockDetail($('.inv-detail', pane), sel, errBox(body));
      }
      if (view.tab === 'res') { pane.innerHTML = reserved.map(orderCard).join('') || '<p class="hint">Aucune pièce en attente de pose.</p>'; bindOrderCards(pane); }
      if (view.tab === 'in') { pane.innerHTML = incoming.map(orderCard).join('') || '<p class="hint">Aucune commande en cours.</p>'; bindOrderCards(pane); }
    } };
  return view;
};
V.stockNew = () => {
  const d = { libelle: '', categorie: '', qte: '', seuil: '', emplacement: '', prix: '', ref: '' };
  const cats = [...new Set((state.stock || []).map((s) => s.categorie).filter(Boolean))];
  const inp = (k, ph = '', type = 'text', list = '') => ({ html: `<input type="${type}" placeholder="${ph}" ${list ? `list="${list}"` : ''}>`, bind: (s) => { $('input', s).oninput = (e) => { d[k] = e.target.value; }; } });
  return { title: () => '🗄 Nouvel article', render(body) {
    body.insertAdjacentHTML('beforeend', `<datalist id="dl-cats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>`);
    progressive(body, [
      { id: 'lib', label: 'Article', ...inp('libelle', 'ex. Huile 5W30 (bidon 5 L)'), done: () => d.libelle.trim() },
      { id: 'cat', label: 'Catégorie', ...inp('categorie', 'Huiles, Filtres, Pneus…', 'text', 'dl-cats'), done: () => d.categorie.trim() },
      { id: 'qte', label: 'Quantité en stock', ...inp('qte', '0', 'number'), done: () => d.qte !== '' },
      { id: 'seuil', label: 'Seuil d’alerte (on recommande en dessous)', ...inp('seuil', '0', 'number'), done: () => d.seuil !== '' },
      { id: 'emp', label: 'Emplacement', ...inp('emplacement', 'ex. Réserve A2, étagère du fond'), done: () => true },
      { id: 'prix', label: 'Prix unitaire (facultatif)', ...inp('prix', '€', 'number'), done: () => true },
      { id: 'go', label: 'Valider', done: () => false, html: '<button class="primary" data-go>Ajouter à l’inventaire</button><div class="err"></div>',
        bind: (s) => { $('[data-go]', s).onclick = async () => { try { await api('POST', 'stock', { ...d, qte: Number(d.qte), seuil: Number(d.seuil) }); await refresh_(); back(); } catch (e) { errBox(s)(e); } }; } },
    ]);
  } };
};
V.stockItem = (id) => ({ title: () => '🗄 Article', render(body) {
  const s = (state.stock || []).find((x) => x.id === id); if (!s) return back();
  const d = structuredClone(s);
  body.innerHTML = `<div class="row" style="margin-bottom:10px"><img src="${slotImg(s)}" style="width:72px;height:72px;object-fit:cover;border-radius:6px;border:2px solid #111"><label class="photo-btn"><input type="file" accept="image/*" capture="environment" data-photo hidden>📷 Photo</label></div><div class="grid2">${[['libelle', 'Article', 'full'], ['categorie', 'Catégorie'], ['emplacement', 'Emplacement'], ['qte', 'Quantité'], ['seuil', 'Seuil d’alerte'], ['prix', 'Prix unitaire'], ['ref', 'Référence']]
    .map(([k, l, c]) => `<label class="${c || ''}">${l}<input data-f="${k}" value="${esc(d[k] ?? '')}"></label>`).join('')}</div>
    <div class="actions"><button class="primary" data-save>Enregistrer</button><button data-cmd>📦 Commander</button><button class="warn" data-del style="margin-left:auto">Supprimer</button></div><div class="err"></div>`;
  $('[data-f]', body).forEach((el) => el.oninput = () => { d[el.dataset.f] = el.value; });
  $('[data-photo]', body).onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { const url = await uploadPhoto(f); await api('PATCH', 'stock/' + id, { photo: url }); await refresh_(); } catch (x) { errBox(body)(x); } };
  $('[data-save]', body).onclick = async () => { try { await api('PUT', 'stock/' + id, { ...d, qte: Number(d.qte), seuil: Number(d.seuil) }); await refresh_(); back(); } catch (e) { errBox(body)(e); } };
  $('[data-cmd]', body).onclick = () => open(V.orderNew({ libelle: s.libelle, ref: s.ref, forStock: true }), true);
  $('[data-del]', body).onclick = async (e) => {
    if (e.target.dataset.confirm !== '1') { e.target.dataset.confirm = '1'; e.target.textContent = 'Confirmer la suppression'; return; }
    try { await api('DELETE', 'stock/' + id); await refresh_(); back(); } catch (x) { errBox(body)(x); }
  };
} });

// --- a encaisser ---
V.toCollect = () => ({ title: () => '💶 À encaisser', render(body) {
  const list = state.vehicles.filter((v) => ['termine', 'rendu'].includes(v.statut) && dueOf(v).reste > 0);
  const total = list.reduce((a, v) => a + dueOf(v).reste, 0);
  body.innerHTML = `<div class="info">Voitures <b>prêtes</b> ou <b>déjà rendues</b> dont les travaux ne sont pas encore payés par le client. Total restant : <b>${eur(total)}</b></div>`
    + (list.map((v) => {
      const d = dueOf(v), p = v.paiement || {}, lines = v.statut === 'rendu' ? ((v.visites || []).slice(-1)[0] || {}).interventions || [] : v.interventions || [];
      return `<div class="order"><div class="top"><span class="plaque">${esc(v.plaque)}</span><span class="t">${esc(v.marque)} ${esc(v.modele)}</span>${badge(v.statut)}</div>
        <div class="hint" style="margin:4px 0">👤 ${esc(clientName(v.clientId))} · 📞 ${esc((client(v.clientId) || {}).tel || '—')}</div>
        <div class="timeline">${lines.map((l) => `<div>${esc(l.libelle)} — ${eur(l.montant)}</div>`).join('')}
          <div><b>Total ${eur(d.total)}</b>${p.statut === 'acompte' ? ` · acompte reçu ${eur(p.montant)} · <b>reste ${eur(d.reste)}</b>` : ''}</div></div>
        <div class="row" style="margin-top:8px"><select data-mode="${v.id}" style="flex:0 1 120px">${PAY_MODES.map((m) => `<option ${p.mode === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
          <button class="ok" data-paid="${v.id}">Encaisser ${eur(d.reste)}</button><button class="ghost" data-open="${v.id}">Fiche</button></div></div>`;
    }).join('') || '<p class="hint">Tout est payé. 👍</p>');
  $$('[data-open]', body).forEach((b) => b.onclick = () => open(V.vehicle(b.dataset.open), true));
  $$('[data-paid]', body).forEach((b) => b.onclick = async () => {
    const v = vehicle(b.dataset.paid);
    await api('PATCH', 'vehicles/' + v.id, { paiement: { statut: 'paye', montant: dueOf(v).total, mode: $(`[data-mode="${v.id}"]`, body).value, at: new Date().toISOString() } });
    toast(`${v.plaque} encaissée`, 1800); await refresh_();
  });
} });

V.settings = () => ({ title: () => '⚙ Réglages & partie', render(body) {
  body.innerHTML = `<div class="group-title">Sauvegarde</div>
    <p class="hint">Tout est gardé sur cet appareil (IndexedDB du navigateur), même hors ligne. Pour changer d'appareil ou garder une copie : exporte la partie, puis importe-la ailleurs.</p>
    <p class="hint" data-usage></p>
    <div class="row"><button class="primary" data-export>⬇ Exporter la partie</button><label class="photo-btn"><input type="file" accept=".json,application/json" data-import hidden>⬆ Importer une partie</label></div>
    <div class="group-title">Nouvelle partie</div>
    <p class="hint">Repart de la partie de base : quelques clients, voitures, mécanos, commandes et le stock de la réserve.</p>
    <div class="row"><button class="warn" data-reset>↺ Nouvelle partie</button></div>
    <div class="group-title">Affichage</div>
    <div class="row"><button data-q="high" class="${QUALITY === 'high' ? 'primary' : ''}">Qualité haute</button><button data-q="low" class="${QUALITY === 'low' ? 'primary' : ''}">Qualité basse (téléphone)</button></div>
    <p class="hint" style="margin-top:14px">Version ${APP_VERSION}</p>
    <div class="err"></div>`;
  const err = errBox(body);
  store.storageInfo().then((s) => { if (s && $('[data-usage]', body)) $('[data-usage]', body).textContent = `Espace utilisé : ${(s.usage / 1e6).toFixed(1)} Mo sur ${(s.quota / 1e6).toFixed(0)} Mo disponibles.`; });
  $('[data-export]', body).onclick = async () => {
    const blob = await store.exportGame(), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `garage-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $('[data-import]', body).onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { await store.importGame(f); await refresh_(); toast('Partie importée', 2000); } catch (x) { err(x); } };
  $('[data-reset]', body).onclick = async (e) => {
    if (e.target.dataset.confirm !== '1') { e.target.dataset.confirm = '1'; e.target.textContent = 'Tout effacer et recommencer ?'; return; }
    await store.newGame(); await refresh_(); toast('Nouvelle partie', 2000);
  };
  $$('[data-q]', body).forEach((b) => b.onclick = () => setQuality(b.dataset.q));
} });

V.tarifs = () => ({ title: () => '💶 Tarifs', render(body) {
  body.innerHTML = (state.tarifs || []).map((g) => `<div class="group-title">${esc(g.groupe)}</div><table class="tarifs">${g.items.map(([l, p]) => `<tr><td>${esc(l)}</td><td>${eur(p)}</td></tr>`).join('')}</table>`).join('')
    + '<p class="hint" style="margin-top:14px">Grille relevée sur les annuaires en ligne (allogarage.fr), à vérifier avec le garage. Travaux spécifiques (distribution, embrayage, joint de culasse) : barèmes constructeurs en MO T2.</p>';
} });

V.spot = (sid) => ({ title: () => `🅿 ${esc(spotLabel(sid))}`, render(body) {
  const waiting = active().filter((v) => !v.placeId);
  body.innerHTML = `<p class="hint">${esc(spotDef(sid).zone)} — place libre.</p>
    ${waiting.length ? `<div class="group-title">Véhicules sans place</div>${waiting.map(vehicleItem).join('')}<p class="hint">Clique un véhicule pour le garer ici.</p>` : ''}
    <div class="actions"><button class="primary" data-new>➕ Nouvelle arrivée sur cette place</button></div>`;
  $$('[data-veh]', body).forEach((x) => x.onclick = async () => { await api('POST', `vehicles/${x.dataset.veh}/move`, { placeId: sid }); await refresh_(); close(); });
  $('[data-new]', body).onclick = () => open(V.arrivee({ placeId: sid }), true);
} });

// ---------------- indicateurs ----------------
function renderIndicators() {
  const ready = state.vehicles.filter((v) => v.statut === 'termine');
  const arrived = state.orders.filter((o) => o.statut === 'arrivee');
  const waitParts = arrived.filter((o) => vehicle(o.vehicleId) && vehicle(o.vehicleId).statut === 'attente_pieces');
  const pres = state.mechanics.filter(isPresent);
  const occ = active().filter((v) => v.placeId).length;
  const open_ = new Date().getDay() >= 1 && new Date().getDay() <= 5 && HORAIRES.some(([a, b]) => nowHM() >= a && nowHM() < b);
  // voyant : icone + valeur + legende (la legende reste lisible sur telephone)
  const pill = (cls, data, ic, val, cap, title = '') => `<button class="pill ${cls}" ${data} title="${esc(title || cap)}"><span class="ic">${ic}</span><span class="v">${val}</span><span class="c">${cap}</span></button>`;
  const due = state.vehicles.filter((v) => ['termine', 'rendu'].includes(v.statut) && dueOf(v).reste > 0), dueSum = due.reduce((s, v) => s + dueOf(v).reste, 0);
  const low = (state.stock || []).filter((s) => Number(s.qte) <= Number(s.seuil || 0)).length;
  const pills = [
    pill(ready.length ? 'alert' : '', 'data-i="ready"', '✔', ready.length, ready.length > 1 ? 'prêtes' : 'prête'),
    pill(due.length ? 'warn' : '', 'data-i="pay"', '💶', eur(dueSum).replace(',00', ''), due.length ? 'à encaisser' : 'tout payé', `Travaux terminés pas encore payés : ${due.length} voiture(s)`),
    pill(waitParts.length ? 'warn' : '', 'data-i="parts"', '📦', arrived.length, waitParts.length ? `arrivées · ${waitParts.length} à poser` : 'pièces arrivées'),
    pill(low ? 'bad' : '', 'data-i="stock"', '🗄', low, low ? 'à recommander' : 'stock ok'),
    pill(pres.length ? 'alert' : '', 'data-i="mecs"', '🔧', `${pres.length}/${state.mechanics.length}`, 'mécanos'),
    ...(state.consumables.items || []).map((c) => pill(c.level === 'vide' ? 'bad' : c.level === 'bas' ? 'warn' : '', `data-cons="${c.key}"`, c.icon, c.level === 'ok' ? 'ok' : c.level, ({ cafe: 'café', savon: 'savon', pq: 'papier WC' })[c.key] || c.label, `${c.label} : ${c.level} — clic pour changer`)),
    pill('', 'data-i="places"', '🅿', `${occ}/${site.spots.length}`, 'places'),
    pill('', 'data-i="clock"', '🕒', nowHM(), simClock ? 'heure simulée' : open_ ? 'ouvert' : 'fermé', 'Clic : simuler une heure de journée'),
  ];
  $('#indicators').innerHTML = pills.join('');
  $$('#indicators [data-i]').forEach((b) => b.onclick = () => {
    const k = b.dataset.i;
    if (k === 'ready') open(V.ready());
    if (k === 'parts') open(V.orders('arrivee'));
    if (k === 'mecs') open(V.mechanics());
    if (k === 'pay') open(V.toCollect());
    if (k === 'stock') open(V.stock(state.stock.some((s) => Number(s.qte) <= Number(s.seuil || 0)) ? 'low' : 'inv'));
    if (k === 'places') open(V.vehicles());
    if (k === 'clock') { const seq = [null, '10:00', '15:30']; simClock = seq[(seq.indexOf(simClock) + 1) % seq.length]; renderIndicators(); syncMechanics(); }
  });
  $$('#indicators [data-cons]').forEach((b) => b.onclick = async () => {
    const c = state.consumables.items.find((x) => x.key === b.dataset.cons);
    await api('PUT', 'consumables/' + c.key, { level: LEVELS[(LEVELS.indexOf(c.level) + 1) % LEVELS.length] }); await refresh_();
  });
}
function syncMechanics() {
  const inAtelier = (v) => { const s = spotDef(v.placeId); return s && s.zone === 'Atelier'; };
  world.setMechanics(state.mechanics.filter(isPresent).map((m) => {
    const v = active().find((x) => x.mecanoId === m.id && inAtelier(x));
    return { id: m.id, prenom: m.prenom, couleur: m.couleur, spotId: v ? v.placeId : null };
  }));
}

// ---------------- synchro ----------------
async function refresh_() {
  state = await api('GET', 'state');
  await world.setState(state);
  renderIndicators(); syncMechanics();
  const top = stack[stack.length - 1];
  if (modal.open && top && !top.dirty) show();
}

// ---------------- 3D -> interface ----------------
function startPlacing(id) {
  close(); world.select(id); world.setMoveMode(id);
  toast('Clique une place libre (en vert) — Échap pour annuler');
  if (world.camera.position.y < 25) world.view('site');
}
function stopPlacing() { world.setMoveMode(null); toast(''); }
// choisir une voiture dans le garage 3D : la fenetre se cache (sa pile est gardee), on clique la voiture,
// puis on revient la ou on etait. Renvoie l'id du vehicule, ou null si on annule.
let pickResolve = null;
function pick3D(what) {
  if (pickResolve) pickResolve(null);
  return new Promise((resolve) => {
    pickResolve = resolve;
    if (modal.open) modal.close();
    world.setPickMode(what);
    toast(`Clique la voiture ${what} — Échap pour annuler`);
  });
}
function endPick(id) { const r = pickResolve; pickResolve = null; world.setPickMode(null); toast(''); if (r) r(id || null); }
const reopen = () => { if (stack.length) show(); };
world.on('pickForPart', (vid) => endPick(vid));
world.on('cancelPick', () => endPick(null));
// poser une piece de la reserve sur une voiture
async function startPartPlacing(item) {
  const vid = await pick3D(`où poser « ${item.libelle} »`);
  if (!vid) return reopen();
  try { await api('POST', `stock/${item.id}/use`, { vehicleId: vid, qte: 1 }); await refresh_(); toast(`${item.libelle} → ${vehicle(vid).plaque} (stock : ${(state.stock.find((x) => x.id === item.id) || {}).qte})`, 3000); open(V.vehicle(vid, 'travaux')); }
  catch (e) { toast(e.message, 3000); reopen(); }
}
world.on('placeSpot', async (vid, spotId) => { stopPlacing(); try { await api('POST', `vehicles/${vid}/move`, { placeId: spotId }); await refresh_(); } catch (e) { toast(e.message, 3000); } });
world.on('cancelMove', stopPlacing);
world.on('dropVehicle', async (vid, spotId) => {
  try {
    const r = await api('POST', `vehicles/${vid}/move`, { placeId: spotId });
    await refresh_();
    toast(r.swapped ? `${vehicle(vid).plaque} ⇄ ${vehicle(r.swapped).plaque} : places échangées` : `${vehicle(vid).plaque} → ${spotId}`, 2200);
  } catch (e) { toast(e.message, 3000); await refresh_(); }
});
world.on('pickVehicle', (id) => open(V.vehicle(id)));
world.on('pickSpot', (id) => open(V.spot(id)));
world.on('pickVisitor', () => open(V.arrivee()));
world.on('pickMechanic', (id) => open(V.mechanic(id)));
world.on('openStock', () => open(V.stock()));
world.on('openOrders', () => open(V.orders('arrivee')));
world.on('pickNone', () => world.select(null));
addEventListener('keydown', (e) => { if (e.key === 'Escape' && world.moveMode) stopPlacing(); if (e.key === 'Escape' && world.pickMode) endPick(null); });

// ---------------- barres ----------------
$$('#views [data-view]').forEach((b) => b.onclick = () => { $$('#views [data-view]').forEach((x) => x.classList.toggle('on', x === b)); world.view(b.dataset.view); });
const ROOF = ['auto', 'on', 'off'], ROOF_L = { auto: 'Toit : auto', on: 'Toit : affiché', off: 'Toit : masqué' };
$('#btn-q').textContent = QUALITY === 'low' ? 'Qualité : basse' : 'Qualité : haute';
$('#btn-q').onclick = () => setQuality(QUALITY === 'low' ? 'high' : 'low');
$('#btn-roof').onclick = () => { const m = ROOF[(ROOF.indexOf(world.roofMode) + 1) % 3]; world.setRoof(m); $('#btn-roof').textContent = ROOF_L[m]; };
$$('#dock [data-open]').forEach((b) => b.onclick = () => {
  const k = b.dataset.open;
  open(({ arrivee: V.arrivee, vehicles: V.vehicles, clients: V.clients, stock: V.stock, orders: V.orders, mechanics: V.mechanics, tarifs: V.tarifs, settings: V.settings })[k]());
});

// ---------------- demarrage ----------------
site = await (await fetch('site.json')).json();
const { fresh } = await store.init(site);
catalog = await api('GET', 'catalog');
world.build(site);
await refresh_();
if (fresh) toast('Nouvelle partie : quelques clients, voitures et mécanos pour démarrer', 4000);
setInterval(() => { renderIndicators(); syncMechanics(); }, 30000);
let pending = null; // plusieurs changements d'affilee -> un seul rafraichissement
store.onChange(() => { if (!pending) pending = requestAnimationFrame(() => { pending = null; refresh_(); }); });
// hors ligne + installable (ecran d'accueil du telephone)
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false; // nouvelle version installee : on recharge une fois pour l'utiliser tout de suite
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloading) { reloading = true; location.reload(); } });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((r) => r.update()).catch(() => {});
}
