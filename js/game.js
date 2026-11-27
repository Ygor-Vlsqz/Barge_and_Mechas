import { Net } from "./net.js";
import { pollGamepad } from "./gamepad.js";
import { loadBase, generateMap } from "./mapgen.js";

// ===================== CONFIG =====================
const ISO = { W: 220, H: 110, Z: 114, OFF: 118 };
const DEV_CODE = "09041994";
const SAVE_KEY = "mbarge_iso_v1";
const COLORS = ["#38bdf8", "#f43f5e", "#22c55e", "#eab308", "#a855f7", "#f97316", "#14b8a6", "#ec4899"];
const PMAX = 60, MW = 1.6, PW = 0.5;
const EDGES = ["toggle", "special", "pickup", "drop"];

const UPG = [
  { id: "dmg", name: "Calibre de Plasma", desc: "+15% dano", max: 6, cost: 20, w: 3 },
  { id: "rof", name: "Capacitor Rápido", desc: "+12% cadência", max: 5, cost: 20, w: 3 },
  { id: "hull", name: "Chapas de Titânio", desc: "+40 HP do mecha", max: 6, cost: 22, w: 3 },
  { id: "speed", name: "Propulsores", desc: "+8% velocidade", max: 5, cost: 18, w: 3 },
  { id: "barge", name: "Anteparas", desc: "+100 HP da barcaça", max: 6, cost: 25, w: 3 },
  { id: "regen", name: "Nanorreparo", desc: "Mecha regenera HP", max: 4, cost: 30, w: 2 },
  { id: "turret", name: "Torreta da Barcaça", desc: "Barcaça atira sozinha", max: 4, cost: 35, w: 2 },
  { id: "multi", name: "Canhão Múltiplo", desc: "+1 projétil", max: 3, cost: 40, w: 2 },
  { id: "magnet", name: "Ímã de Sucata", desc: "Barcaça coleta sozinha (raio cresce)", max: 5, cost: 30, w: 1, parts: 2 },
  { id: "jump", name: "Saltadores Hidráulicos", desc: "Pula obstáculos (Espaço/B1)", max: 3, cost: 30, w: 1, parts: 3 }
];

// ===================== ESTADO =====================
const cv = document.getElementById("game"), ctx = cv.getContext("2d");
const $ = id => document.getElementById(id);
let BASE = null, MAP = null, G = null, VIEW = null, ended = false;
const S = { myId: "host", online: false, isHost: true, code: null, roster: [], device: "pc", paused: false,
  dev: { on: false, freeze: false, god: false, oneshot: false, nums: false, hitbox: false, fps: false } };
const cam = { x: 30, y: 30 };
let zoom = 0.45, fps = 60;
let vault = JSON.parse(localStorage.getItem(SAVE_KEY) || '{"mat":0,"diag":0}');
const saveVault = () => localStorage.setItem(SAVE_KEY, JSON.stringify(vault));

// ===================== IMAGENS =====================
const IMG = new Map();
function img(f) {
  if (!IMG.has(f)) { const i = new Image(); i.src = encodeURI(f); IMG.set(f, i); }
  const i = IMG.get(f);
  return i.complete && i.naturalWidth ? i : null;
}

// ===================== ISO =====================
function w2s(x, y, z = 0) {
  return {
    x: ((x - y) - (cam.x - cam.y)) * ISO.W / 2 * zoom + cv.width / 2,
    y: ((x + y) - (cam.x + cam.y)) * ISO.H / 2 * zoom - z * ISO.Z * zoom + cv.height / 2
  };
}
// Posição considerando a altura do terreno + profundidade de desenho
const ws = (x, y, z = 0) => w2s(x, y, z + MAP.gz(x, y));
const dk = (x, y) => Math.floor(x) + Math.floor(y) + 1 + (MAP.gz(x, y) + 0.5) * 0.01;

function s2w(sx, sy) {
  const a = (sx - cv.width / 2) / (ISO.W / 2 * zoom) + (cam.x - cam.y);
  const b = (sy - cv.height / 2) / (ISO.H / 2 * zoom) + (cam.x + cam.y);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}
function screenDirToWorld(sx, sy) {
  const m = Math.min(1, Math.hypot(sx, sy));
  if (m < 0.05) return { x: 0, y: 0 };
  const a = sx / (ISO.W / 2), b = sy / (ISO.H / 2);
  let x = (a + b) / 2, y = (b - a) / 2;
  const n = Math.hypot(x, y);
  return { x: x / n * m, y: y / n * m };
}

// ===================== UI =====================
function buildUI() {
  document.body.insertAdjacentHTML("beforeend", `
<div id="lobby" class="ov"><div class="box">
  <h1>MECHA <b>BARGE</b></h1>
  <div>Cofre: <b id="v-mat"></b> Mat • <b id="v-diag"></b> Diag</div>
  <input id="in-name" placeholder="Seu nome" maxlength="12">
  <select id="sel-dev"><option value="auto">Dispositivo: Auto</option><option value="pc">💻 PC (mouse/teclado/controle)</option><option value="mobile">📱 Celular</option></select>
  <div class="row"><button id="b-solo">Jogar Solo</button><button id="b-host">Criar Sala</button></div>
  <div class="row"><input id="in-code" maxlength="4" placeholder="CÓDIGO"><button id="b-join">Entrar</button></div>
  <div id="room"></div>
  <button id="b-start" class="hide">🚀 Iniciar Expedição</button>
  <label><input type="checkbox" id="chk-dev"> Mostrar opções Dev/Debug</label>
</div></div>
<div id="hud" class="hide"><span id="h-wave"></span><span id="h-loot"></span><span id="h-me"></span></div>
<div id="prompt" class="hide"></div>
<div id="log"></div>
<div id="vote" class="ov hide"><div class="box"><h2>Pausa entre ondas</h2><p id="vote-info"></p>
  <div class="row"><button id="b-stay">✅ Ficar (Y / B3)</button><button id="b-leave">🚀 Extrair (N / B2)</button></div></div></div>
<div id="term" class="ov hide"><div class="box wide"><h2>Terminal da Barcaça</h2><p id="term-info"></p>
  <div id="term-list" class="grid"></div>
  <div class="row"><button id="b-repair">🔧 Reparar +80 (20 Mat)</button><button id="b-term-close">Fechar</button></div></div></div>
<div id="pause" class="ov hide"><div class="box"><h2>Pausa</h2>
  <button id="b-resume">Continuar</button><button id="b-quit">Sair da partida</button></div></div>
<div id="end" class="ov hide"><div class="box"><h2 id="end-t"></h2><p id="end-d"></p>
  <button onclick="location.reload()">Voltar ao lobby</button></div></div>
<div id="devp" class="hide"></div>
<div id="mob" class="hide"><div id="joy"><div id="joy-k"></div></div>
  <button class="mb" data-a="fire">FIRE</button><button class="mb" data-a="toggle">EVA</button>
  <button class="mb" data-a="pickup">USE</button><button class="mb" data-a="special">PULO</button>
  <button class="mb" data-a="drop">SOLTAR</button></div>`);

  $("v-mat").textContent = vault.mat; $("v-diag").textContent = vault.diag;
  $("in-name").value = localStorage.getItem("mbarge_name") || "";

  $("b-solo").onclick = () => { setupLobby(); S.roster = [{ id: "host", name: myName() }]; startAsHost(); };
  $("b-host").onclick = () => {
    setupLobby(); S.online = true; S.code = genCode();
    S.roster = [{ id: "host", name: myName() }];
    Net.host(S.code); $("b-start").classList.remove("hide"); renderRoom();
  };
  $("b-join").onclick = () => {
    setupLobby(); S.online = true; S.isHost = false;
    S.code = $("in-code").value.trim().toUpperCase();
    if (S.code.length !== 4) return alert("Código inválido");
    Net.join(S.code, myName()); $("room").textContent = "Conectando...";
  };
  $("b-start").onclick = startAsHost;
  $("chk-dev").onchange = e => {
    if (!e.target.checked) { S.dev.on = false; $("devp").classList.add("hide"); return; }
    if (prompt("Código de acesso Dev:") !== DEV_CODE) { e.target.checked = false; return alert("Código inválido"); }
    S.dev.on = true; buildDev();
  };
  $("b-stay").onclick = () => vote("stay");
  $("b-leave").onclick = () => vote("leave");
  $("b-repair").onclick = () => act({ t: "repair" });
  $("b-term-close").onclick = () => $("term").classList.add("hide");
  $("term-list").onclick = e => { const u = e.target.dataset?.buy; if (u) act({ t: "buy", u }); };
  $("b-resume").onclick = togglePause;
  $("b-quit").onclick = () => {
    $("pause").classList.add("hide");
    if (S.isHost) hostEnd();
    else { Net.peer?.destroy(); showEnd("Você saiu", "Saiu no meio da onda: loot perdido."); }
  };
}

function setupLobby() {
  localStorage.setItem("mbarge_name", myName());
  const d = $("sel-dev").value;
  S.device = d === "auto" ? (matchMedia("(pointer:coarse)").matches ? "mobile" : "pc") : d;
}
const myName = () => ($("in-name").value.trim() || "Piloto").slice(0, 12);
function genCode() { const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; return Array.from({ length: 4 }, () => c[Math.random() * c.length | 0]).join(""); }
function renderRoom() {
  $("room").innerHTML = (S.code ? `Sala: <b style="color:#fbbf24;font-size:18px">${S.code}</b> (${S.roster.length}/8)<br>` : "") +
    S.roster.map((r, i) => `<div style="color:${COLORS[i]}">● ${r.name}${i === 0 ? " (host)" : ""}${i === 4 ? " — Base B" : ""}</div>`).join("");
}
function log(m, c = "#cbd5e1") {
  const d = document.createElement("div"); d.textContent = m; d.style.color = c;
  $("log").appendChild(d); setTimeout(() => d.remove(), 5000);
}
function say(m, c) { log(m, c); if (S.online && S.isHost) Net.broadcast({ t: "log", m, c }); }
function showEnd(t, d) { ended = true; $("end-t").textContent = t; $("end-d").textContent = d; $("end").classList.remove("hide"); }
function extracted(sh) {
  vault.mat += sh.mat; vault.diag += sh.diag; saveVault();
  showEnd("🚀 Extração concluída!", `+${sh.mat} Mat • +${sh.diag} Diag • Ondas: ${VIEW?.wave || 0}`);
}
function togglePause() {
  if (!$("term").classList.contains("hide")) return $("term").classList.add("hide");
  if (!MAP || ended) return;
  S.paused = $("pause").classList.toggle("hide") === false;
}
function toggleTerminal() { $("term").classList.toggle("hide"); renderTerminal(); }
function act(m) { if (S.isHost) hostEvent({ ...m, id: S.myId }); else Net.send(m); }
function vote(c) { if (VIEW?.phase === "vote" && !VIEW.votes[S.myId]) act({ t: "vote", c }); }

// ===================== REDE =====================
Net.onEvent = d => S.isHost ? hostEvent(d) : clientEvent(d);
Net.onInput = (id, d) => {
  const p = G?.players.find(p => p.id === id); if (!p) return;
  const old = p.input || {};
  p.input = d; EDGES.forEach(k => p.input[k] = d[k] || old[k]);
};
Net.onState = d => { VIEW = d; };

function syncRoster() { Net.broadcast({ t: "roster", roster: S.roster }); renderRoom(); }

function hostEvent(d) {
  switch (d.t) {
    case "error": alert("Erro de rede: " + d.msg + (d.msg === "unavailable-id" ? " (código em uso, crie outra sala)" : "")); break;
    case "hello":
      if (G) return Net.sendTo(d.id, { t: "busy" });
      if (S.roster.length >= 8) return Net.sendTo(d.id, { t: "full" });
      S.roster.push({ id: d.id, name: (d.name || "Piloto").slice(0, 12) }); syncRoster(); break;
    case "leave": {
      S.roster = S.roster.filter(r => r.id !== d.id);
      const p = G?.players.find(p => p.id === d.id);
      if (p) { dropTow(p); G.players = G.players.filter(q => q !== p); say(`${p.name} saiu da partida`, "#fbbf24"); }
      if (!G) syncRoster(); break;
    }
    case "vote": handleVote(d.id, d.c); break;
    case "buy": if (G) buy(d.u); break;
    case "repair": {
      if (!G || G.loot.mat < 20) break;
      const p = G.players.find(p => p.id === d.id), b = G.barges[p?.base || 0];
      G.loot.mat -= 20; b.hp = Math.min(b.maxHp, b.hp + 80); break;
    }
    case "dev": devAction(d); break;
    case "devflag": S.dev[d.k] = d.v; break;
  }
}

function clientEvent(d) {
  switch (d.t) {
    case "roster": S.roster = d.roster; renderRoom(); break;
    case "start": S.myId = Net.myId; beginGame(d.seed, d.roster); break;
    case "log": log(d.m, d.c); break;
    case "hostEnding": log("⚠️ O host vai encerrar a partida em 5s! Seu loot será salvo.", "#fbbf24"); break;
    case "extracted": extracted(d); Net.peer?.destroy(); break;
    case "end": showEnd(d.title, d.desc); break;
    case "hostLeft": if (!ended) showEnd("📡 Conexão perdida", "O host saiu da partida."); break;
    case "full": case "busy": alert("Sala cheia ou partida já em andamento."); break;
    case "error": alert("Erro de rede: " + d.msg); break;
  }
}

// ===================== INÍCIO =====================
function startAsHost() {
  const seed = Math.random() * 1e9 | 0;
  Net.broadcast({ t: "start", seed, roster: S.roster });
  beginGame(seed, S.roster);
}

function beginGame(seed, roster) {
  MAP = generateMap(BASE, roster.length, seed);
  $("lobby").classList.add("hide"); $("hud").classList.remove("hide");
  if (S.device === "mobile") setupMobile();
  const i = Math.max(0, roster.findIndex(r => r.id === S.myId));
  const bi = Math.floor(i / 4) % MAP.bases.length, s = MAP.bases[bi].spawns[i % 4];
  cam.x = s.x; cam.y = s.y;
  log(`🗺️ Bioma: ${MAP.biomeName}`, "#7dd3fc");
  if (S.isHost) { G = newGame(roster); VIEW = pack(); }
}

function newGame(roster) {
  const g = { wave: 0, phase: "prep", timer: 5, toSpawn: 0, spawnT: 0, votes: {}, loot: { mat: 15, diag: 0 },
    lvl: {}, parts: {}, enemies: [], shots: [], carcasses: [], pickups: [], fx: [], nid: 1, _t: [] };
  g.barges = MAP.bases.map(b => ({ x: b.barge.x, y: b.barge.y, hp: 500, maxHp: 500, size: 2, cd: 0 }));
  g.players = roster.map((r, i) => {
    const bi = Math.floor(i / 4) % MAP.bases.length;
    const s = MAP.bases[bi].spawns[i % 4] || MAP.bases[bi].spawns[0];
    return { id: r.id, name: r.name, color: COLORS[i], base: bi, mode: "mecha", x: s.x, y: s.y, z: 0, vz: 0,
      ang: -Math.PI / 2, aim: 0, hp: 220, maxHp: 220, wreck: 0, respawn: 0,
      pilot: { x: s.x, y: s.y, hp: PMAX, ang: 0 }, cd: 0, tow: null, input: {} };
  });
  return g;
}

// ===================== INPUT =====================
const keys = {}, mouse = { x: 0, y: 0, down: false, t: 0 };
const edges = { toggle: 0, special: 0, pickup: 0, drop: 0 };
const joy = { id: null, ox: 0, oy: 0, dx: 0, dy: 0 };
let mobFire = false;

addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT") return;
  const k = e.key.toLowerCase();
  if (!keys[k]) {
    if (k === "f") edges.toggle = 1;
    if (k === "e") edges.pickup = 1;
    if (k === "q") edges.drop = 1;
    if (k === " ") edges.special = 1;
    if (k === "escape") togglePause();
    if (k === "y") vote("stay");
    if (k === "n") vote("leave");
    if (k === "+" || k === "=") zoom = Math.min(1.2, zoom * 1.1);
    if (k === "-") zoom = Math.max(0.18, zoom * 0.9);
  }
  keys[k] = true;
  if (k === " ") e.preventDefault();
});
addEventListener("keyup", e => keys[e.key.toLowerCase()] = false);
cv.addEventListener("mousemove", e => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.t = performance.now(); });
cv.addEventListener("mousedown", e => { if (e.button === 0) mouse.down = true; mouse.t = performance.now(); });
addEventListener("mouseup", () => mouse.down = false);
cv.addEventListener("contextmenu", e => e.preventDefault());
cv.addEventListener("wheel", e => { e.preventDefault(); zoom = Math.min(1.2, Math.max(0.18, zoom * (e.deltaY < 0 ? 1.1 : 0.9))); }, { passive: false });

function setupMobile() {
  $("mob").classList.remove("hide");
  const z = $("joy"), k = $("joy-k"), R = 50;
  z.onpointerdown = e => {
    joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; z.setPointerCapture(e.pointerId);
    const r = z.getBoundingClientRect(); k.style.display = "block";
    k.style.left = (e.clientX - r.left) + "px"; k.style.top = (e.clientY - r.top) + "px";
  };
  z.onpointermove = e => {
    if (e.pointerId !== joy.id) return;
    let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const m = Math.hypot(dx, dy);
    if (m > R) { dx *= R / m; dy *= R / m; }
    joy.dx = dx / R; joy.dy = dy / R;
    const r = z.getBoundingClientRect();
    k.style.left = (joy.ox - r.left + dx) + "px"; k.style.top = (joy.oy - r.top + dy) + "px";
  };
  z.onpointerup = z.onpointercancel = e => { if (e.pointerId !== joy.id) return; joy.id = null; joy.dx = joy.dy = 0; k.style.display = "none"; };
  document.querySelectorAll(".mb").forEach(b => {
    const a = b.dataset.a;
    b.onpointerdown = e => { e.preventDefault(); if (a === "fire") mobFire = true; else edges[a] = 1; };
    b.onpointerup = b.onpointerleave = b.onpointercancel = () => { if (a === "fire") mobFire = false; };
  });
}

const myP = () => VIEW?.players.find(p => p.id === S.myId);
const actorV = p => p.mode === "mecha" ? p : p.pilot;

function readInput() {
  const g = pollGamepad();
  if (g) {
    if (g.toggleSuit) edges.toggle = 1; if (g.special) edges.special = 1;
    if (g.pickup) { if (VIEW?.phase === "vote") vote("stay"); else edges.pickup = 1; }
    if (g.drop) { if (VIEW?.phase === "vote") vote("leave"); else edges.drop = 1; }
    if (g.pause) togglePause(); if (g.select) toggleTerminal();
  }
  const sx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0) + joy.dx + (g?.moveX || 0);
  const sy = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0) + joy.dy + (g?.moveY || 0);
  const w = screenDirToWorld(sx, sy);

  const me = myP(); let ax = null, ay = null;
  if (me && S.device === "pc" && performance.now() - mouse.t < 3000) {
    const a = actorV(me), m = s2w(mouse.x, mouse.y); ax = m.x - a.x; ay = m.y - a.y;
  }

  if (edges.pickup && me && VIEW) {
    const a = actorV(me), b = VIEW.barges[me.base];
    const nearB = Math.abs(a.x - b.x) < b.size / 2 + 1.6 && Math.abs(a.y - b.y) < b.size / 2 + 1.6;
    const nearC = VIEW.carcasses.some(c => Math.hypot(c.x - a.x, c.y - a.y) < 2);
    if (nearB && !nearC && !me.tow) { edges.pickup = 0; toggleTerminal(); }
  }
  return { mx: w.x, my: w.y, ax, ay, fire: !!((mouse.down && S.device === "pc") || mobFire || g?.fire), ...edges };
}
const clearEdges = () => EDGES.forEach(k => edges[k] = 0);

// ===================== SIMULAÇÃO (HOST) =====================
const L = id => G.lvl[id] || 0;
const stats = () => ({ dmg: 20 * (1 + 0.15 * L("dmg")), rof: 0.22 / (1 + 0.12 * L("rof")), hp: 220 + 40 * L("hull"),
  spd: 4.6 * (1 + 0.08 * L("speed")), shots: 1 + L("multi") });

function blocked(x, y, w, air, fromH) {
  const h = w / 2;
  if (x - h < 0.2 || y - h < 0.2 || x + h > MAP.w - 0.2 || y + h > MAP.h - 0.2) return true;
  if (!air) for (let gx = Math.floor(x - h); gx <= Math.floor(x + h); gx++)
    for (let gy = Math.floor(y - h); gy <= Math.floor(y + h); gy++) {
      if (MAP.isSolid(gx, gy)) return true;
      if (fromH != null && Math.abs(MAP.gz(gx + 0.5, gy + 0.5) - fromH) > 0.6) return true;
    }
  for (const b of G.barges) { const s = b.size / 2; if (x + h > b.x - s && x - h < b.x + s && y + h > b.y - s && y - h < b.y + s) return true; }
  return false;
}
function move(o, dx, dy, w, air) {
  const fh = air ? null : MAP.gz(o.x, o.y);
  if (!blocked(o.x + dx, o.y, w, air, fh)) o.x += dx;
  if (!blocked(o.x, o.y + dy, w, air, fh)) o.y += dy;
}
function fixPos(o, w) {
  if (!blocked(o.x, o.y, w, false)) return;
  for (let r = 0.5; r < 8; r += 0.5) for (let a = 0; a < 6.28; a += 0.5) {
    const x = o.x + Math.cos(a) * r, y = o.y + Math.sin(a) * r;
    if (!blocked(x, y, w, false)) { o.x = x; o.y = y; return; }
  }
}
function pushOut(o, b) {
  const h = b.size / 2 + 0.8, dx = o.x - b.x, dy = o.y - b.y;
  if (Math.abs(dx) >= h || Math.abs(dy) >= h) return;
  if (Math.abs(dx) > Math.abs(dy)) o.x = b.x + Math.sign(dx || 1) * h; else o.y = b.y + Math.sign(dy || 1) * h;
}
const nearBarge = (a, e) => G.barges.find(b => Math.abs(a.x - b.x) < b.size / 2 + e && Math.abs(a.y - b.y) < b.size / 2 + e);
function nearestEnemy(a, r) { let best = null, bd = r; for (const e of G.enemies) { const d = Math.hypot(e.x - a.x, e.y - a.y); if (d < bd) { bd = d; best = e; } } return best; }
function dropTow(p) { const c = G.carcasses.find(c => c.id === p.tow); if (c) c.by = null; p.tow = null; }
function fx(x, y, txt, c) { G.fx.push({ x, y, txt, c, t: 0.8 }); }

function update(dt) {
  G._t = [];
  G.players.forEach(p => {
    if (p.respawn > 0) return;
    if (p.mode === "mecha") G._t.push({ x: p.x, y: p.y, r: 0.8, k: "mecha", p });
    else G._t.push({ x: p.pilot.x, y: p.pilot.y, r: 0.3, k: "pilot", p });
  });
  G.barges.forEach(b => G._t.push({ x: b.x, y: b.y, r: b.size / 2, k: "barge", ref: b }));

  updateBarges(dt);
  G.players.forEach(p => updatePlayer(p, dt));
  if (!S.dev.freeze) G.enemies.forEach(e => updateEnemy(e, dt));
  updateShots(dt); updateLoot(dt); updateWaves(dt);
  G.fx = G.fx.filter(f => (f.t -= dt) > 0);
}

function updatePlayer(p, dt) {
  const i = p.input || {}, st = stats();
  p.maxHp = st.hp;
  if (p.wreck > 0 && (p.wreck -= dt) <= 0) { p.wreck = 0; p.hp = Math.round(p.maxHp * 0.4); say(`🔧 Mecha de ${p.name} reiniciado`); }
  if (p.respawn > 0) { if ((p.respawn -= dt) <= 0) respawnPilot(p); EDGES.forEach(k => i[k] = 0); return; }

  if (i.toggle) {
    if (p.mode === "mecha") { p.mode = "pilot"; Object.assign(p.pilot, { x: p.x, y: p.y + 1.2 }); fixPos(p.pilot, PW); dropTow(p); }
    else if (p.wreck <= 0 && Math.hypot(p.pilot.x - p.x, p.pilot.y - p.y) < 2.2) p.mode = "mecha";
  }
  const inM = p.mode === "mecha", a = inM ? p : p.pilot, w = inM ? MW : PW;

  if (inM && i.special && L("jump") && p.z <= 0) p.vz = 5 + L("jump") * 0.8;
  if (p.z > 0 || p.vz) {
    p.vz -= 18 * dt; p.z += p.vz * dt;
    if (p.z <= 0) { if (blocked(p.x, p.y, MW, false)) { p.z = 0.05; p.vz = 3; } else { p.z = 0; p.vz = 0; } }
  }
  const air = inM && p.z > 0.15;
  const spd = (inM ? st.spd : 3.2) * (p.tow ? 0.75 : 1);
  if (Math.hypot(i.mx || 0, i.my || 0) > 0.05) { move(a, i.mx * spd * dt, i.my * spd * dt, w, air); a.ang = Math.atan2(i.my, i.mx); }

  const auto = nearestEnemy(a, 10);
  p.aim = (i.ax != null && (i.ax || i.ay)) ? Math.atan2(i.ay, i.ax) : auto ? Math.atan2(auto.y - a.y, auto.x - a.x) : (a.ang || 0);

  if (inM && L("regen") && p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + 1.5 * L("regen") * dt);

  p.cd -= dt;
  if (i.fire && p.cd <= 0) {
    const n = inM ? st.shots : 1;
    for (let k = 0; k < n; k++) {
      const an = p.aim + (k - (n - 1) / 2) * 0.12;
      G.shots.push({ x: a.x + Math.cos(an) * 0.8, y: a.y + Math.sin(an) * 0.8, vx: Math.cos(an) * 16, vy: Math.sin(an) * 16,
        dmg: inM ? st.dmg : 6, f: "p", life: 0.9 });
    }
    p.cd = inM ? st.rof : 0.35;
  }

  if (i.pickup && inM && !p.tow) {
    const c = G.carcasses.find(c => !c.by && Math.hypot(c.x - a.x, c.y - a.y) < 2);
    if (c) { c.by = p.id; p.tow = c.id; }
  }
  if (i.drop) dropTow(p);
  if (p.tow) {
    const c = G.carcasses.find(c => c.id === p.tow);
    if (!c) p.tow = null;
    else { const k = Math.min(1, 8 * dt); c.x += (a.x - Math.cos(a.ang) * 1.5 - c.x) * k; c.y += (a.y - Math.sin(a.ang) * 1.5 - c.y) * k; }
  }
  if (!inM) { const b = nearBarge(a, 1.2); if (b) b.hp = Math.min(b.maxHp, b.hp + 12 * dt); }

  EDGES.forEach(k => i[k] = 0);
}

function respawnPilot(p) {
  const b = G.barges[p.base];
  Object.assign(p.pilot, { x: b.x, y: b.y + b.size / 2 + 0.6, hp: PMAX });
  fixPos(p.pilot, PW); p.mode = "pilot"; p.respawn = 0;
}

function hurt(t, amt) {
  if (t.k !== "barge" && S.dev.god) return;
  fx(t.x, t.y, Math.round(amt), "#fca5a5");
  if (t.k === "barge") { t.ref.hp -= amt; if (t.ref.hp <= 0) gameOver(); return; }
  const p = t.p;
  if (t.k === "mecha") {
    p.hp -= amt;
    if (p.hp <= 0) {
      p.hp = 0; p.wreck = 12; p.mode = "pilot"; dropTow(p);
      Object.assign(p.pilot, { x: p.x, y: p.y + 1.2 }); fixPos(p.pilot, PW);
      say(`💥 Mecha de ${p.name} destruído! Reinicia em 12s`, "#f87171");
    }
  } else {
    p.pilot.hp -= amt;
    if (p.pilot.hp <= 0) { p.respawn = 8; say(`☠️ ${p.name} caiu. Renasce na barcaça em 8s`, "#f87171"); }
  }
}

function updateBarges(dt) {
  G.barges.forEach((b, bi) => {
    const n = G.players.filter(p => p.base === bi).length;
    b.size = Math.min(5, 2 + Math.floor(n / 2));
    b.maxHp = 500 + 100 * L("barge");
    if (L("turret") && (b.cd -= dt) <= 0) {
      const e = nearestEnemy(b, 8);
      if (e) {
        const an = Math.atan2(e.y - b.y, e.x - b.x);
        G.shots.push({ x: b.x, y: b.y, vx: Math.cos(an) * 14, vy: Math.sin(an) * 14, dmg: 8 * L("turret"), f: "p", life: 0.8 });
        b.cd = 0.7;
      }
    }
    G.players.forEach(p => { pushOut(p, b); pushOut(p.pilot, b); });
  });
}

function spawnEnemy() {
  const b = G.barges[Math.random() * G.barges.length | 0];
  for (let k = 0; k < 20; k++) {
    const an = Math.random() * 6.283, d = 18 + Math.random() * 8;
    const x = Math.max(1.5, Math.min(MAP.w - 1.5, b.x + Math.cos(an) * d));
    const y = Math.max(1.5, Math.min(MAP.h - 1.5, b.y + Math.sin(an) * d));
    if (blocked(x, y, 1, false, MAP.gz(b.x, b.y))) continue;
    const sc = 1 + (G.wave - 1) * 0.22, side = Math.random() < 0.5 ? 1 : -1;
    const gun = Math.random() < Math.min(0.45, 0.15 + G.wave * 0.05);
    G.enemies.push(gun
      ? { type: "gunner", x, y, w: 1, hp: 70 * sc, maxHp: 70 * sc, spd: 1.8, range: 6.5, dmg: 8 * sc, cd: 1, side }
      : { type: "crawler", x, y, w: 0.8, hp: 42 * sc, maxHp: 42 * sc, spd: 2.8 + Math.min(1, G.wave * 0.08), range: 0.4, dmg: 10 * sc, cd: 0.5, side });
    return;
  }
}

function updateEnemy(e, dt) {
  let t = null, bd = 1e9;
  for (const c of G._t) { const d = Math.hypot(c.x - e.x, c.y - e.y) - c.r; if (d < bd) { bd = d; t = c; } }
  if (!t) return;
  const dx = t.x - e.x, dy = t.y - e.y, d = Math.hypot(dx, dy) || 1;
  e.ang = Math.atan2(dy, dx); e.cd -= dt;
  if (bd > e.range) {
    const ox = e.x, oy = e.y, s = e.spd * dt;
    move(e, dx / d * s, dy / d * s, e.w, false);
    if (Math.abs(e.x - ox) + Math.abs(e.y - oy) < 1e-4) move(e, -dy / d * s * e.side, dx / d * s * e.side, e.w, false);
  } else if (e.cd <= 0) {
    if (e.type === "gunner") { G.shots.push({ x: e.x, y: e.y, vx: dx / d * 9, vy: dy / d * 9, dmg: e.dmg, f: "e", life: 1.2 }); e.cd = 1.6; }
    else { hurt(t, e.dmg); e.cd = 0.9; }
  }
}

function updateShots(dt) {
  G.shots = G.shots.filter(s => {
    s.x += s.vx * dt; s.y += s.vy * dt;
    if ((s.life -= dt) <= 0 || MAP.isSolid(Math.floor(s.x), Math.floor(s.y))) return false;
    if (s.f === "p") {
      const e = G.enemies.find(e => Math.hypot(e.x - s.x, e.y - s.y) < e.w / 2 + 0.25);
      if (e) { const d = S.dev.oneshot ? e.hp : s.dmg; e.hp -= d; fx(e.x, e.y, Math.round(d), "#fde047"); return false; }
    } else {
      const t = G._t.find(t => Math.hypot(t.x - s.x, t.y - s.y) < t.r + 0.2);
      if (t) { hurt(t, s.dmg); return false; }
    }
    return true;
  });
  G.enemies = G.enemies.filter(e => {
    if (e.hp > 0) return true;
    G.carcasses.push({ id: G.nid++, x: e.x, y: e.y, by: null });
    if (Math.random() < 0.07) G.pickups.push({ id: G.nid++, x: e.x + 0.4, y: e.y });
    return false;
  });
}

function updateLoot(dt) {
  G.pickups = G.pickups.filter(k => {
    const hit = G.players.some(p => { const a = p.mode === "mecha" ? p : p.pilot; return p.respawn <= 0 && Math.hypot(a.x - k.x, a.y - k.y) < 1.1; });
    if (hit) { G.loot.diag++; onBlueprint(); }
    return !hit;
  });
  const mr = L("magnet") ? 1.5 + L("magnet") * 1.5 : 0;
  G.carcasses = G.carcasses.filter(c => {
    for (const b of G.barges) {
      const d = Math.hypot(c.x - b.x, c.y - b.y) || 0.01, edge = b.size / 2;
      if (d < edge + (c.by ? 1.4 : 0.9)) {
        G.loot.mat += 10;
        const t = G.players.find(p => p.tow === c.id); if (t) t.tow = null;
        say("📦 Carcaça processada +10 Mat", "#6ee7b7");
        return false;
      }
      if (!c.by && mr && d < edge + mr) { c.x += (b.x - c.x) / d * 3 * dt; c.y += (b.y - c.y) / d * 3 * dt; }
    }
    return true;
  });
}

function onBlueprint() {
  const pool = UPG.filter(u => !G.lvl[u.id]);
  if (!pool.length) { G.loot.mat += 25; return say("📘 Diagrama convertido em 25 Mat"); }
  let r = Math.random() * pool.reduce((s, u) => s + u.w, 0);
  const u = pool.find(u => (r -= u.w) < 0) || pool[0];
  if (u.parts) {
    G.parts[u.id] = (G.parts[u.id] || 0) + 1;
    if (G.parts[u.id] >= u.parts) { G.lvl[u.id] = 1; say(`⭐ ${u.name} desbloqueado!`, "#c084fc"); }
    else say(`🧩 Parte de ${u.name} (${G.parts[u.id]}/${u.parts})`, "#c084fc");
  } else { G.lvl[u.id] = 1; say(`📘 ${u.name} desbloqueado!`, "#c084fc"); }
}

function buy(id) {
  const u = UPG.find(x => x.id === id), l = G.lvl[id] || 0;
  if (!u || !l || l >= u.max || G.loot.mat < u.cost * l) return;
  G.loot.mat -= u.cost * l; G.lvl[id] = l + 1;
  if (id === "hull") G.players.forEach(p => p.hp += 40);
  if (id === "barge") G.barges.forEach(b => b.hp += 100);
  say(`⬆️ ${u.name} Nv.${l + 1}`, "#7dd3fc");
}

// ===================== WAVES / VOTAÇÃO =====================
function startWave(n) {
  G.wave = n; G.phase = "combat"; G.spawnT = 1;
  G.toSpawn = Math.round((5 + n * 3) * (0.6 + 0.4 * G.players.length));
  say(`⚠️ Onda ${n} iniciada!`, "#fbbf24");
}
function updateWaves(dt) {
  if (G.phase === "prep") { if ((G.timer -= dt) <= 0) startWave(G.wave + 1); }
  else if (G.phase === "combat") {
    if (G.toSpawn > 0 && (G.spawnT -= dt) <= 0) { spawnEnemy(); G.toSpawn--; G.spawnT = Math.max(0.25, 1.1 - G.wave * 0.05); }
    if (G.toSpawn === 0 && !G.enemies.length) {
      if (G.wave % 3 === 0) { G.phase = "vote"; G.timer = 45; G.votes = {}; say("🗳️ Pausa longa: votem para ficar ou extrair", "#fbbf24"); }
      else { G.phase = "prep"; G.timer = 6; say(`✅ Onda ${G.wave} limpa`, "#6ee7b7"); }
    }
  } else if (G.phase === "vote") { if ((G.timer -= dt) <= 0) endVote(); }
}
function handleVote(id, c) {
  if (!G || G.phase !== "vote") return;
  if (c === "leave") {
    if (id === S.myId) return hostEnd();
    const p = G.players.find(p => p.id === id); if (!p) return;
    const n = G.players.length, sh = { mat: Math.floor(G.loot.mat / n), diag: Math.floor(G.loot.diag / n) };
    G.loot.mat -= sh.mat; G.loot.diag -= sh.diag;
    dropTow(p); G.players = G.players.filter(q => q !== p);
    Net.sendTo(id, { t: "extracted", ...sh });
    say(`🚀 ${p.name} extraiu com ${sh.mat} Mat`, "#fbbf24");
  } else G.votes[id] = "stay";
  if (G.players.every(p => G.votes[p.id])) endVote();
}
function endVote() { G.phase = "prep"; G.timer = 4; say("Todos ficaram. Próxima onda!", "#7dd3fc"); }

function hostEnd() {
  if (!G || G.ending) return;
  G.ending = true;
  say("⚠️ O host está encerrando a partida. Fim em 5s, o loot será dividido.", "#fbbf24");
  Net.broadcast({ t: "hostEnding" });
  setTimeout(() => {
    const n = G.players.length || 1, sh = { mat: Math.floor(G.loot.mat / n), diag: Math.floor(G.loot.diag / n) };
    G.players.forEach(p => p.id !== S.myId && Net.sendTo(p.id, { t: "extracted", ...sh }));
    G.over = true; extracted(sh);
  }, S.online ? 5000 : 0);
}
function gameOver() {
  if (G.over) return; G.over = true;
  const m = { t: "end", title: "💀 Barcaça destruída", desc: `Loot perdido. Ondas: ${G.wave}` };
  Net.broadcast(m); showEnd(m.title, m.desc);
}

// ===================== DEV =====================
function buildDev() {
  const p = $("devp"); p.classList.remove("hide");
  p.innerHTML = "<b style='color:#fbbf24'>🛠️ DEV</b>";
  [["freeze", "Pausar mobs", 1], ["god", "Invencível", 1], ["oneshot", "One-shot kill", 1],
   ["nums", "Números de dano"], ["hitbox", "Mostrar hitboxes"], ["fps", "FPS / entidades"]].forEach(([k, l, net]) => {
    const lb = document.createElement("label");
    lb.innerHTML = `<input type="checkbox"> ${l}`;
    lb.firstChild.onchange = e => { S.dev[k] = e.target.checked; if (net && !S.isHost) Net.send({ t: "devflag", k, v: e.target.checked }); };
    p.appendChild(lb);
  });
  [["spawn5", "Spawnar 5 mobs"], ["heal", "Curar barcaça"], ["healme", "Curar meu mecha"], ["mat", "+100 Mat"],
   ["diag", "+1 Diagrama"], ["kill", "Matar todos"], ["skip", "Pular onda"], ["vote", "Forçar votação"],
   ["unlock", "Liberar todos upgrades"], ["tp", "Teleporte p/ mouse"]].forEach(([a, l]) => {
    const b = document.createElement("button"); b.textContent = l;
    b.onclick = () => { const m = s2w(mouse.x, mouse.y); act({ t: "dev", a, x: m.x, y: m.y }); };
    p.appendChild(b);
  });
}
function devAction(d) {
  if (!G) return;
  const p = G.players.find(p => p.id === d.id);
  const A = {
    spawn5: () => { for (let i = 0; i < 5; i++) spawnEnemy(); },
    heal: () => G.barges.forEach(b => b.hp = b.maxHp),
    healme: () => { if (p) { p.hp = p.maxHp; p.wreck = 0; p.pilot.hp = PMAX; } },
    mat: () => G.loot.mat += 100,
    diag: () => { G.loot.diag++; onBlueprint(); },
    kill: () => G.enemies.forEach(e => e.hp = 0),
    skip: () => { G.enemies = []; G.toSpawn = 0; },
    vote: () => { G.wave = Math.max(3, Math.ceil(G.wave / 3) * 3); G.phase = "combat"; G.enemies = []; G.toSpawn = 0; },
    unlock: () => UPG.forEach(u => G.lvl[u.id] = Math.max(1, G.lvl[u.id] || 0)),
    tp: () => { if (p) { const o = p.mode === "mecha" ? p : p.pilot; o.x = d.x; o.y = d.y; } }
  };
  A[d.a]?.();
}

// ===================== SNAPSHOT =====================
const r2 = n => Math.round(n * 100) / 100;
function pack() {
  return {
    t: "state", wave: G.wave, phase: G.phase, timer: G.timer, left: G.toSpawn + G.enemies.length,
    loot: G.loot, lvl: G.lvl, parts: G.parts, votes: G.votes,
    players: G.players.map(p => ({ id: p.id, name: p.name, color: p.color, base: p.base, mode: p.mode,
      x: r2(p.x), y: r2(p.y), z: r2(p.z), aim: r2(p.aim), hp: Math.round(p.hp), maxHp: p.maxHp, wreck: p.wreck, respawn: p.respawn,
      pilot: { x: r2(p.pilot.x), y: r2(p.pilot.y), hp: Math.round(p.pilot.hp) }, tow: p.tow })),
    enemies: G.enemies.map(e => ({ type: e.type, x: r2(e.x), y: r2(e.y), w: e.w, hp: e.hp, maxHp: e.maxHp })),
    shots: G.shots.map(s => ({ x: r2(s.x), y: r2(s.y), f: s.f })),
    carcasses: G.carcasses.map(c => ({ id: c.id, x: r2(c.x), y: r2(c.y) })),
    pickups: G.pickups.map(k => ({ x: k.x, y: k.y })),
    barges: G.barges.map(b => ({ x: b.x, y: b.y, hp: Math.round(b.hp), maxHp: b.maxHp, size: b.size })),
    fx: G.fx
  };
}

// ===================== RENDER =====================
function diamond(x, y, w, h, fill, stroke) {
  ctx.beginPath(); ctx.moveTo(x, y - h / 2); ctx.lineTo(x + w / 2, y); ctx.lineTo(x, y + h / 2); ctx.lineTo(x - w / 2, y); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}
function ell(x, y, r, fill, z = 0) {
  const p = ws(x, y, z);
  ctx.beginPath(); ctx.ellipse(p.x, p.y, r * ISO.W / 2 * zoom * 1.41, r * ISO.H / 2 * zoom * 1.41, 0, 0, 6.29);
  ctx.fillStyle = fill; ctx.fill();
}
function bar(x, y, f, c) {
  ctx.fillStyle = "#0008"; ctx.fillRect(x - 20, y, 40, 5);
  ctx.fillStyle = c; ctx.fillRect(x - 20, y, 40 * Math.max(0, Math.min(1, f)), 5);
}
const offscreen = p => p.x < -300 || p.x > cv.width + 300 || p.y < -400 || p.y > cv.height + 400;

function drawTile(c, gx, gy, z, alpha) {
  const p = w2s(gx + 0.5, gy + 0.5, z);
  if (offscreen(p)) return;

  const im = img(`sprites/tiles/${c.base}_${c.dir}.png`);
  const h = ISO.H * zoom;

  // Ajuste estes valores para controlar a intensidade do amarelado.
  const HUE_POR_CAMADA = 12;
  const HUE_MAXIMO = 48;
  const camada = Math.max(0, Number(z) || 0);
  const hue = -Math.min(HUE_MAXIMO, camada * HUE_POR_CAMADA);

  const alphaAnterior = ctx.globalAlpha;
  const filtroAnterior = ctx.filter;

  ctx.globalAlpha = alpha;
  ctx.filter = hue !== 0 ? `hue-rotate(${hue}deg) saturate(1.15)` : "none";

  if (im) {
    const dw = 256 * zoom;
    const dh = 352 * zoom;
    ctx.drawImage(
      im,
      p.x - dw / 2,
      p.y + h / 2 + ISO.OFF * zoom - dh,
      dw,
      dh
    );
  } else {
    diamond(
      p.x,
      p.y,
      ISO.W * zoom,
      h,
      camada > 0 ? "#8a7545" : "#2f5d3a",
      "#0003"
    );
  }

  ctx.globalAlpha = alphaAnterior;
  ctx.filter = filtroAnterior;
}

function drawBarge(b) {
  const p = ws(b.x, b.y);
  diamond(p.x, p.y, ISO.W * zoom * b.size, ISO.H * zoom * b.size, "#f59e0b55", "#f59e0b");
  ctx.fillStyle = "#fff"; ctx.font = `bold ${Math.max(10, 16 * zoom * 2)}px sans-serif`; ctx.textAlign = "center";
  ctx.fillText("BARCAÇA", p.x, p.y + 4); bar(p.x, p.y + 12, b.hp / b.maxHp, "#38bdf8");
}
function drawMech(p) {
  const s = ws(p.x, p.y, p.z), sz = 256 * zoom;
  ell(p.x, p.y, 0.85, p.color + "44");
  ctx.globalAlpha = p.wreck > 0 ? 0.4 : 1;
  const im = img("sprites/actors/Watcher.png");

  if (im) ctx.drawImage(im, s.x - sz / 2, s.y - sz * 0.75, sz, sz);
  else diamond(s.x, s.y - sz * 0.25, sz * 0.6, sz * 0.5, p.color, "#fff");
  ctx.globalAlpha = 1;
  const t = ws(p.x + Math.cos(p.aim) * 1.3, p.y + Math.sin(p.aim) * 1.3, p.z + 0.3);
  ctx.strokeStyle = p.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(s.x, s.y - ISO.Z * zoom * 0.3); ctx.lineTo(t.x, t.y); ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = p.color; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
  ctx.fillText(p.name + (p.wreck > 0 ? " ✖" : ""), s.x, s.y - sz * 0.8);
  bar(s.x, s.y - sz * 0.78, p.hp / p.maxHp, "#22c55e");
}
function drawPilot(p) {
  if (p.respawn > 0) return;
  ell(p.pilot.x, p.pilot.y, 0.25, "#fbbf24");
  const s = ws(p.pilot.x, p.pilot.y, 0.3);
  ctx.beginPath(); ctx.arc(s.x, s.y, 7, 0, 6.29); ctx.fillStyle = p.color; ctx.fill();
  bar(s.x, s.y - 18, p.pilot.hp / PMAX, "#fbbf24");
}

function render() {
  ctx.fillStyle = "#0a0f1a"; ctx.fillRect(0, 0, cv.width, cv.height);
  if (!MAP || !VIEW) return;
  const me = myP(), ma = me && actorV(me);
  if (ma) { cam.x += (ma.x - cam.x) * 0.12; cam.y += (ma.y - cam.y) * 0.12; }

  // Área visível
  const kx = ISO.W / 2 * zoom, ky = ISO.H / 2 * zoom, cs = cam.x + cam.y, cdf = cam.x - cam.y;
  const s0 = Math.floor(cs - cv.height / 2 / ky) - 3, s1 = Math.ceil(cs + cv.height / 2 / ky) + 12;
  const d0 = Math.floor(cdf - cv.width / 2 / kx) - 3, d1 = Math.ceil(cdf + cv.width / 2 / kx) + 3;
  const vis = (x, y) => { const s = x + y, d = x - y; return s >= s0 && s <= s1 && d >= d0 && d <= d1; };

  // Chão (camada 0), só o visível
  for (let sum = Math.max(0, s0); sum <= Math.min(MAP.w + MAP.h - 2, s1); sum++) {
    const xa = Math.max(0, sum - MAP.h + 1, Math.ceil((sum + d0) / 2));
    const xb = Math.min(MAP.w - 1, sum, Math.floor((sum + d1) / 2));
    for (let x = xa; x <= xb; x++) { const c = MAP.layers[0][sum - x][x]; if (c) drawTile(c, x, sum - x, 0, 1); }
  }

  const list = [];
  const md = ma ? ma.x + ma.y : 0, mc = ma ? ma.x - ma.y : 0;
  for (const t of MAP.upper) {
    if (!vis(t.x, t.y)) continue;
    const fade = ma && t.d > md + 0.5 && t.d - md < 4 && Math.abs((t.x - t.y) - mc) < 2.5;
    list.push([t.d, () => drawTile(t.c, t.x, t.y, t.z, fade ? 0.35 : 1)]);
  }
  VIEW.barges.forEach(b => list.push([dk(b.x, b.y), () => drawBarge(b)]));
  VIEW.carcasses.forEach(c => list.push([dk(c.x, c.y), () => ell(c.x, c.y, 0.4, "#94a3b8")]));
  VIEW.pickups.forEach(k => list.push([dk(k.x, k.y), () => ell(k.x, k.y, 0.3 + Math.sin(performance.now() / 150) * 0.05, "#c084fc")]));
  VIEW.enemies.forEach(e => list.push([dk(e.x, e.y), () => {
    ell(e.x, e.y, e.w / 2, e.type === "gunner" ? "#a855f7" : "#ef4444");
    const s = ws(e.x, e.y, 0.5); bar(s.x, s.y - 14, e.hp / e.maxHp, "#f87171");
  }]));
  VIEW.players.forEach(p => {
    list.push([dk(p.x, p.y), () => drawMech(p)]);
    if (p.mode === "pilot") list.push([dk(p.pilot.x, p.pilot.y), () => drawPilot(p)]);
  });
  VIEW.shots.forEach(s => list.push([dk(s.x, s.y), () => {
    const p = ws(s.x, s.y, 0.35); ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, 6.29);
    ctx.fillStyle = s.f === "p" ? "#fde047" : "#f472b6"; ctx.fill();
  }]));
  list.sort((a, b) => a[0] - b[0]).forEach(e => e[1]());

  if (S.dev.hitbox) {
    VIEW.players.forEach(p => { const a = actorV(p), w = p.mode === "mecha" ? MW : PW, s = ws(a.x, a.y); diamond(s.x, s.y, ISO.W * zoom * w, ISO.H * zoom * w, null, "#0f0"); });
    VIEW.enemies.forEach(e => { const s = ws(e.x, e.y); diamond(s.x, s.y, ISO.W * zoom * e.w, ISO.H * zoom * e.w, null, "#f00"); });
  }
  if (S.dev.nums) VIEW.fx.forEach(f => {
    const s = ws(f.x, f.y, 1 + (0.8 - f.t)); ctx.fillStyle = f.c; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center"; ctx.fillText(f.txt, s.x, s.y);
  });
  if (S.dev.fps) {
    ctx.fillStyle = "#0f0"; ctx.font = "12px monospace"; ctx.textAlign = "left";
    ctx.fillText(`FPS ${fps | 0} | inimigos ${VIEW.enemies.length} | tiros ${VIEW.shots.length} | mapa ${MAP.w}x${MAP.h} | ${MAP.biomeName}`, 10, cv.height - 10);
  }
}

// ===================== HUD =====================
let hudT = 0;
function updateHUD(dt) {
  if ((hudT -= dt) > 0) return; hudT = 0.15;
  const v = VIEW; if (!v) return;
  const ph = { prep: `próxima em ${Math.ceil(v.timer)}s`, combat: `inimigos: ${v.left}`, vote: `votação ${Math.ceil(v.timer)}s` }[v.phase];
  $("h-wave").textContent = `Onda ${v.wave} • ${ph}`;
  $("h-loot").textContent = `📦 ${v.loot.mat} Mat • 📘 ${v.loot.diag} Diag`;
  const me = myP();
  if (me) {
    const b = v.barges[me.base];
    $("h-me").textContent = me.respawn > 0 ? `Renascendo em ${Math.ceil(me.respawn)}s`
      : `Mecha ${me.hp}/${me.maxHp} • Traje ${me.pilot.hp}/${PMAX} • Barcaça ${b.hp}/${b.maxHp}`;
    const a = actorV(me); let t = "";
    if (me.mode === "pilot" && Math.hypot(me.x - a.x, me.y - a.y) < 2.2 && !me.wreck) t = "[F / B0] Entrar no mecha";
    else if (me.tow) t = "[Q / B2] Soltar carcaça (leve até a barcaça)";
    else if (me.mode === "mecha" && v.carcasses.some(c => Math.hypot(c.x - a.x, c.y - a.y) < 2)) t = "[E / B3] Rebocar carcaça";
    else if (Math.abs(a.x - b.x) < b.size / 2 + 1.6 && Math.abs(a.y - b.y) < b.size / 2 + 1.6) t = "[E / B3] Terminal da barcaça" + (me.mode === "pilot" ? " • reparando..." : "");
    $("prompt").textContent = t; $("prompt").classList.toggle("hide", !t);
  }
  const showVote = v.phase === "vote" && !v.votes[S.myId] && !ended;
  $("vote").classList.toggle("hide", !showVote);
  if (showVote) $("vote-info").textContent = `Ondas sobrevividas: ${v.wave}. Quem extrair leva sua parte do loot. Tempo: ${Math.ceil(v.timer)}s` +
    (S.isHost ? " — Você é o host: se extrair, a partida acaba para todos." : "");
  if (!$("term").classList.contains("hide")) renderTerminal();
}
function renderTerminal() {
  const v = VIEW; if (!v) return;
  $("term-info").textContent = `Materiais: ${v.loot.mat} • Diagramas coletados: ${v.loot.diag}`;
  $("term-list").innerHTML = UPG.map(u => {
    const l = v.lvl[u.id] || 0, pt = v.parts[u.id] || 0;
    if (!l) return `<div class="card">🔒 <b>${u.name}</b><br>${u.parts ? `Raro: partes ${pt}/${u.parts}` : "Encontre um diagrama"}</div>`;
    return `<div class="card"><b>${u.name}</b> Nv.${l}/${u.max}<br>${u.desc}<br>${l < u.max ? `<button data-buy="${u.id}" ${v.loot.mat < u.cost * l ? "disabled" : ""}>${u.cost * l} Mat</button>` : "MÁX"}</div>`;
  }).join("");
}

// ===================== LOOP =====================
let last = performance.now(), sendT = 0, bcT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; fps = fps * 0.95 + (1 / Math.max(dt, 0.001)) * 0.05;
  if (MAP && !ended) {
    const inp = readInput();
    if (S.isHost && G) {
      const me = G.players.find(p => p.id === S.myId);
      if (me) { const old = me.input || {}; me.input = inp; EDGES.forEach(k => me.input[k] = inp[k] || old[k]); }
      clearEdges();
      if (!(S.paused && !S.online) && !G.over) update(dt);
      VIEW = pack();
      if (S.online && (bcT += dt) > 0.05) { bcT = 0; Net.broadcast(VIEW); }
    } else if (!S.isHost && (sendT += dt) > 0.033) { sendT = 0; Net.sendInput(inp); clearEdges(); }
  }
  if (MAP) { render(); updateHUD(dt); }
  requestAnimationFrame(frame);
}

function resize() {
  cv.width = innerWidth; cv.height = innerHeight;
  zoom = Math.max(0.25, Math.min(0.6, Math.min(cv.width, cv.height) / 1500));
}
addEventListener("resize", resize);

// ===================== BOOT =====================
(async function boot() {
  resize(); buildUI();
  try {
    BASE = await loadBase();
    const m = BASE.isoMetrics || {};
    ISO.W = m.ISO_W ?? ISO.W; ISO.H = m.ISO_H ?? ISO.H; ISO.Z = m.LAYER_STEP_Y ?? ISO.Z; ISO.OFF = m.spriteOffsetY ?? ISO.OFF;
  } catch (e) { alert(e.message); }
  requestAnimationFrame(frame);
})();
