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

// Liberados por diagrama (aleatório). Raros precisam de várias partes.
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

  // E/USE perto da barcaça sem carcaça por perto: abre o terminal localmente
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

function blocked(x, y, w, air) {
  const h = w / 2;
  if (x - h < 0.2 || y - h < 0.2 || x + h > MAP.w - 0.2 || y + h > MAP.h - 0.2) return true;
  if (!air) for (let gx = Math.floor(x - h); gx <= Math.floor(x + h); gx++)
    for (let gy = Math.floor(y - h); gy <= Math.floor(y + h); gy++)
      if (MAP.solid.has(gx + "," + gy)) return true;
  for (const b of G.barges) { const s = b.size / 2; if (x + h > b.x - s && x - h < b.x + s && y + h > b.y - s && y - h < b.y + s) return true; }
  return false;
}
function move(o, dx, dy, w, air) {
  if (!blocked(o.x + dx, o.y, w, air)) o.x += dx;
  if (!blocked(o.x, o.y + dy, w, air)) o.y += dy;
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

  // Pulo
  if (inM && i.special && L("jump") && p.z <= 0) p.vz = 5 + L("jump") * 0.8;
  if (p.z > 0 || p.vz) {
