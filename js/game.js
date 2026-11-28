import { Net } from "./net.js";
import { pollGamepad } from "./gamepad.js";
import { loadBase, generateMap } from "./mapgen.js";

// ===================== CONFIGURAÇÃO =====================
ISO.WATER = metrics.waterOffsetY ?? ISO.WATER;

const DEV_CODE = "09041994";
const SAVE_KEY = "mbarge_iso_v1";
const COLORS = ["#38bdf8", "#f43f5e", "#22c55e", "#eab308", "#a855f7", "#f97316", "#14b8a6", "#ec4899"];
const PMAX = 60, MW = 1.6, PW = 0.5;
const EDGES = ["toggle", "pickup", "drop", "special1"];

const MECHS = {
  Juggler: {
    sprite: "sprites/actors/Juggler.png",
    hp: 220, speed: 4.6, damage: 20, rate: 0.11
  },
  Roamer: {
    sprite: "sprites/actors/Roamer.png",
    hp: 200, speed: 6.2, damage: 18, rate: 0.22
  },
  Skipper: {
    sprite: "sprites/actors/Skipper.png",
    hp: 210, speed: 4.8, damage: 22, rate: 0.22
  },
  Watcher: {
    sprite: "sprites/actors/Watcher.png",
    hp: 240, speed: 4.2, damage: 20, rate: 0.22
  }
};

const UPG = [
  { id: "dmg", name: "Calibre de Plasma", desc: "+15% dano", max: 6, cost: 20, w: 3 },
  { id: "rof", name: "Capacitor Rápido", desc: "+12% cadência", max: 5, cost: 20, w: 3 },
  { id: "hull", name: "Chapas de Titânio", desc: "+40 HP do mecha", max: 6, cost: 22, w: 3 },
  { id: "speed", name: "Propulsores", desc: "+8% velocidade", max: 5, cost: 18, w: 3 },
  { id: "barge", name: "Anteparas", desc: "+100 HP da barcaça", max: 6, cost: 25, w: 3 },
  { id: "regen", name: "Nanorreparo", desc: "Mecha regenera HP", max: 4, cost: 30, w: 2 },
  { id: "turret", name: "Torreta da Barcaça", desc: "Barcaça atira sozinha", max: 4, cost: 35, w: 2 },
  { id: "multi", name: "Canhão Múltiplo", desc: "+1 projétil", max: 3, cost: 40, w: 2 },
  { id: "magnet", name: "Ímã de Sucata", desc: "Barcaça coleta carcaças", max: 5, cost: 30, w: 1, parts: 2 },
  { id: "jump", name: "Saltadores Hidráulicos", desc: "Pulo adicional", max: 3, cost: 30, w: 1, parts: 3 }
];

const cv = document.getElementById("game");
if (!cv) throw new Error('Não encontrei <canvas id="game"> no HTML.');
const ctx = cv.getContext("2d");
const $ = id => document.getElementById(id);

let BASE = null, MAP = null, G = null, VIEW = null, ended = false;

const S = {
  myId: "host",
  online: false,
  isHost: true,
  code: null,
  roster: [],
  device: "pc",
  inputMode: "keyboard",
  selectedMech: "Watcher",
  paused: false,
  dev: {
    on: false,
    freeze: false,
    god: false,
    oneshot: false,
    nums: false,
    hitbox: false,
    fps: false
  }
};

const cam = { x: 30, y: 30 };
let zoom = 0.45, fps = 60;
let vault;

try {
  vault = JSON.parse(localStorage.getItem(SAVE_KEY) || '{"mat":0,"diag":0}');
} catch {
  vault = { mat: 0, diag: 0 };
}
const saveVault = () => localStorage.setItem(SAVE_KEY, JSON.stringify(vault));

// ===================== IMAGENS =====================
const IMG = new Map();

function img(file) {
  if (!IMG.has(file)) {
    const image = new Image();
    image.src = encodeURI(file);
    IMG.set(file, image);
  }

  const image = IMG.get(file);
  return image.complete && image.naturalWidth ? image : null;
}

// ===================== CÂMERA ISO =====================
function w2s(x, y, z = 0) {
  return {
    x: ((x - y) - (cam.x - cam.y)) * ISO.W / 2 * zoom + cv.width / 2,
    y: ((x + y) - (cam.x + cam.y)) * ISO.H / 2 * zoom
      - z * ISO.Z * zoom + cv.height / 2
  };
}

const ws = (x, y, z = 0) => w2s(x, y, z + MAP.gz(x, y));
const dk = (x, y) => Math.floor(x) + Math.floor(y) + 1
  + (MAP.gz(x, y) + 0.5) * 0.01;

function s2w(sx, sy) {
  const a = (sx - cv.width / 2) / (ISO.W / 2 * zoom) + (cam.x - cam.y);
  const b = (sy - cv.height / 2) / (ISO.H / 2 * zoom) + (cam.x + cam.y);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

function screenDirToWorld(sx, sy) {
  const magnitude = Math.min(1, Math.hypot(sx, sy));
  if (magnitude < 0.05) return { x: 0, y: 0 };

  const a = sx / (ISO.W / 2);
  const b = sy / (ISO.H / 2);
  const x = (a + b) / 2;
  const y = (b - a) / 2;
  const length = Math.hypot(x, y) || 1;

  return { x: x / length * magnitude, y: y / length * magnitude };
}

// ===================== INTERFACE =====================
function buildUI() {
  document.body.insertAdjacentHTML("beforeend", `
<div id="lobby" class="ov"><div class="box">
  <h1>MECHA <b>BARGE</b></h1>
  <div>Cofre: <b id="v-mat"></b> Mat • <b id="v-diag"></b> Diag</div>
  <input id="in-name" placeholder="Seu nome" maxlength="12">

  <label for="sel-dev">Plataforma</label>
  <select id="sel-dev">
    <option value="auto">Dispositivo: Auto</option>
    <option value="pc">💻 PC</option>
    <option value="mobile">📱 Celular</option>
  </select>

  <label for="sel-input">Controle para esta guia</label>
  <select id="sel-input">
    <option value="keyboard">⌨️ Teclado</option>
    <option value="gamepad">🎮 Joystick</option>
  </select>

  <label for="sel-mech">Mecha</label>
  <select id="sel-mech">
    <option value="Watcher">Watcher</option>
    <option value="Juggler">Juggler</option>
    <option value="Roamer">Roamer</option>
    <option value="Skipper">Skipper</option>
  </select>

  <div class="row">
    <button id="b-solo">Jogar Solo</button>
    <button id="b-host">Criar Sala</button>
  </div>
  <div class="row">
    <input id="in-code" maxlength="4" placeholder="CÓDIGO">
    <button id="b-join">Entrar</button>
  </div>
  <div id="room"></div>
  <button id="b-start" class="hide">🚀 Iniciar Expedição</button>
  <label><input type="checkbox" id="chk-dev"> Mostrar opções Dev/Debug</label>
</div></div>

<div id="hud" class="hide">
  <span id="h-wave"></span>
  <span id="h-loot"></span>
  <span id="h-me"></span>
</div>
<div id="prompt" class="hide"></div>
<div id="log"></div>

<div id="vote" class="ov hide"><div class="box">
  <h2>Pausa entre ondas</h2>
  <p id="vote-info"></p>
  <div class="row">
    <button id="b-stay">✅ Ficar (Y / B3)</button>
    <button id="b-leave">🚀 Extrair (N / B2)</button>
  </div>
</div></div>

<div id="term" class="ov hide"><div class="box wide">
  <h2>Terminal da Barcaça</h2>
  <p id="term-info"></p>
  <div id="term-list" class="grid"></div>
  <div class="row">
    <button id="b-repair">🔧 Reparar +80 (20 Mat)</button>
    <button id="b-term-close">Fechar</button>
  </div>
</div></div>

<div id="pause" class="ov hide"><div class="box">
  <h2>Pausa</h2>
  <button id="b-resume">Continuar</button>
  <button id="b-quit">Sair da partida</button>
</div></div>

<div id="end" class="ov hide"><div class="box">
  <h2 id="end-t"></h2>
  <p id="end-d"></p>
  <button onclick="location.reload()">Voltar ao lobby</button>
</div></div>

<div id="devp" class="hide"></div>

<div id="mob" class="hide">
  <div id="joy"><div id="joy-k"></div></div>
  <button class="mb" data-a="fire">FIRE</button>
  <button class="mb" data-a="toggle">EVA</button>
  <button class="mb" data-a="pickup">USE</button>
  <button class="mb" data-a="special1">ESP. 1</button>
  <button class="mb" data-a="special2">ESP. 2</button>
  <button class="mb" data-a="drop">SOLTAR</button>
</div>`);

  $("v-mat").textContent = vault.mat;
  $("v-diag").textContent = vault.diag;
  $("in-name").value = localStorage.getItem("mbarge_name") || "";
  $("sel-mech").value = S.selectedMech;

  $("sel-input").onchange = e => S.inputMode = e.target.value;
  $("sel-mech").onchange = e => {
    S.selectedMech = e.target.value;
    if (S.online && !S.isHost) sendMechChoice();
  };

  $("b-solo").onclick = () => {
    readLobbySelection();
    S.online = false;
    S.isHost = true;
    S.roster = [{ id: "host", name: myName(), mechType: S.selectedMech }];
    startAsHost();
  };

  $("b-host").onclick = () => {
    readLobbySelection();
    S.online = true;
    S.isHost = true;
    S.code = genCode();
    S.roster = [{ id: "host", name: myName(), mechType: S.selectedMech }];
    Net.host(S.code);
    $("b-start").classList.remove("hide");
    renderRoom();
  };

  $("b-join").onclick = () => {
    readLobbySelection();
    S.online = true;
    S.isHost = false;
    S.code = $("in-code").value.trim().toUpperCase();

    if (S.code.length !== 4) return alert("Código inválido");

    Net.join(S.code, myName());
    $("room").textContent = "Conectando...";
    setTimeout(sendMechChoice, 600);
  };

  $("b-start").onclick = startAsHost;

  $("chk-dev").onchange = e => {
    if (!e.target.checked) {
      S.dev.on = false;
      $("devp").classList.add("hide");
      return;
    }

    if (prompt("Código de acesso Dev:") !== DEV_CODE) {
      e.target.checked = false;
      return alert("Código inválido");
    }

    S.dev.on = true;
    buildDev();
  };

  $("b-stay").onclick = () => vote("stay");
  $("b-leave").onclick = () => vote("leave");
  $("b-repair").onclick = () => act({ t: "repair" });
  $("b-term-close").onclick = () => $("term").classList.add("hide");
  $("term-list").onclick = e => {
    const upgrade = e.target.dataset?.buy;
    if (upgrade) act({ t: "buy", u: upgrade });
  };

  $("b-resume").onclick = togglePause;
  $("b-quit").onclick = () => {
    $("pause").classList.add("hide");

    if (S.isHost) {
      hostEnd();
    } else {
      Net.peer?.destroy();
      showEnd("Você saiu", "Saiu no meio da onda: loot perdido.");
    }
  };
}

function readLobbySelection() {
  localStorage.setItem("mbarge_name", myName());

  const device = $("sel-dev")?.value || "auto";
  S.device = device === "auto"
    ? (matchMedia("(pointer:coarse)").matches ? "mobile" : "pc")
    : device;

  S.inputMode = $("sel-input")?.value || "keyboard";
  S.selectedMech = $("sel-mech")?.value || "Watcher";
}

function sendMechChoice() {
  try {
    Net.send({ t: "mechSelect", mechType: S.selectedMech });
  } catch (error) {
    console.warn("A escolha do mecha ainda não pôde ser enviada.", error);
  }
}

const myName = () => ($("in-name").value.trim() || "Piloto").slice(0, 12);

function genCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 4 }, () => chars[Math.random() * chars.length | 0]).join("");
}

function renderRoom() {
  $("room").innerHTML =
    (S.code ? `Sala: <b style="color:#fbbf24;font-size:18px">${S.code}</b> (${S.roster.length}/8)<br>` : "")
    + S.roster.map((player, index) =>
      `<div style="color:${COLORS[index]}">● ${player.name} — ${player.mechType || "Watcher"}${index === 0 ? " (host)" : ""}</div>`
    ).join("");
}

function log(message, color = "#cbd5e1") {
  const item = document.createElement("div");
  item.textContent = message;
  item.style.color = color;
  $("log").appendChild(item);
  setTimeout(() => item.remove(), 5000);
}

function say(message, color) {
  log(message, color);
  if (S.online && S.isHost) Net.broadcast({ t: "log", m: message, c: color });
}

function showEnd(title, description) {
  ended = true;
  $("end-t").textContent = title;
  $("end-d").textContent = description;
  $("end").classList.remove("hide");
}

function extracted(share) {
  vault.mat += share.mat;
  vault.diag += share.diag;
  saveVault();
  showEnd("🚀 Extração concluída!", `+${share.mat} Mat • +${share.diag} Diag • Ondas: ${VIEW?.wave || 0}`);
}

function togglePause() {
  if (!$("term").classList.contains("hide")) {
    $("term").classList.add("hide");
    return;
  }

  if (!MAP || ended) return;
  S.paused = $("pause").classList.toggle("hide") === false;
}

function toggleTerminal() {
  $("term").classList.toggle("hide");
  renderTerminal();
}

function act(message) {
  if (S.isHost) hostEvent({ ...message, id: S.myId });
  else Net.send(message);
}

function vote(choice) {
  if (VIEW?.phase === "vote" && !VIEW.votes[S.myId]) {
    act({ t: "vote", c: choice });
  }
}

// ===================== REDE =====================
Net.onEvent = data => S.isHost ? hostEvent(data) : clientEvent(data);

Net.onInput = (id, data) => {
  const player = G?.players.find(item => item.id === id);
  if (!player) return;

  const old = player.input || {};
  player.input = { ...data };

  for (const key of EDGES) {
    player.input[key] = !!(data[key] || old[key]);
  }
};

Net.onState = data => {
  VIEW = data;
};

function syncRoster() {
  Net.broadcast({ t: "roster", roster: S.roster });
  renderRoom();
}

function hostEvent(data) {
  switch (data.t) {
    case "error":
      alert("Erro de rede: " + data.msg);
      break;

    case "hello": {
      if (G) return Net.sendTo(data.id, { t: "busy" });
      if (S.roster.length >= 8) return Net.sendTo(data.id, { t: "full" });

      S.roster.push({
        id: data.id,
        name: (data.name || "Piloto").slice(0, 12),
        mechType: "Watcher"
      });

      syncRoster();
      break;
    }

    case "mechSelect": {
      const player = S.roster.find(item => item.id === data.id);
      const type = MECHS[data.mechType] ? data.mechType : "Watcher";

      if (player) player.mechType = type;

      const gamePlayer = G?.players.find(item => item.id === data.id);
      if (gamePlayer) gamePlayer.mechType = type;

      if (!G) syncRoster();
      break;
    }

    case "leave": {
      S.roster = S.roster.filter(item => item.id !== data.id);
      const player = G?.players.find(item => item.id === data.id);

      if (player) {
        dropTow(player);
        G.players = G.players.filter(item => item !== player);
        say(`${player.name} saiu da partida`, "#fbbf24");
      }

      if (!G) syncRoster();
      break;
    }

    case "vote":
      handleVote(data.id, data.c);
      break;

    case "buy":
      if (G) buy(data.u);
      break;

    case "repair": {
      if (!G || G.loot.mat < 20) break;

      const player = G.players.find(item => item.id === data.id);
      const barge = G.barges[player?.base || 0];

      if (!barge) break;

      G.loot.mat -= 20;
      barge.hp = Math.min(barge.maxHp, barge.hp + 80);
      break;
    }

    case "dev":
      devAction(data);
      break;

    case "devflag":
      if (data.k in S.dev) S.dev[data.k] = data.v;
      break;
  }
}

function clientEvent(data) {
  switch (data.t) {
    case "roster":
      S.roster = data.roster;
      renderRoom();
      break;

    case "start":
      S.myId = Net.myId;
      beginGame(data.seed, data.roster);
      break;

    case "log":
      log(data.m, data.c);
      break;

    case "hostEnding":
      log("⚠️ O host vai encerrar a partida em 5s! Seu loot será salvo.", "#fbbf24");
      break;

    case "extracted":
      extracted(data);
      Net.peer?.destroy();
      break;

    case "end":
      showEnd(data.title, data.desc);
      break;

    case "hostLeft":
      if (!ended) showEnd("📡 Conexão perdida", "O host saiu da partida.");
      break;

    case "full":
    case "busy":
      alert("Sala cheia ou partida já em andamento.");
      break;

    case "error":
      alert("Erro de rede: " + data.msg);
      break;
  }
}

// ===================== INÍCIO DA PARTIDA =====================
function startAsHost() {
  const seed = Math.random() * 1e9 | 0;
  Net.broadcast({ t: "start", seed, roster: S.roster });
  beginGame(seed, S.roster);
}

function beginGame(seed, roster) {
  MAP = generateMap(BASE, roster.length, seed);
  $("lobby").classList.add("hide");
  $("hud").classList.remove("hide");

  if (S.device === "mobile") setupMobile();

  const localIndex = Math.max(0, roster.findIndex(item => item.id === S.myId));
  const baseIndex = Math.floor(localIndex / 4) % MAP.bases.length;
  const spawn = MAP.bases[baseIndex].spawns[localIndex % 4];

  cam.x = spawn.x;
  cam.y = spawn.y;

  log(`🗺️ Bioma: ${MAP.biomeName}`, "#7dd3fc");

  if (S.isHost) {
    G = newGame(roster);
    VIEW = pack();
  }
}

function newGame(roster) {
  const game = {
    wave: 0,
    phase: "prep",
    timer: 5,
    toSpawn: 0,
    spawnT: 0,
    votes: {},
    loot: { mat: 15, diag: 0 },
    lvl: {},
    parts: {},
    enemies: [],
    shots: [],
    carcasses: [],
    pickups: [],
    blocks: [],
    mines: [],
    fx: [],
    nid: 1,
    _t: []
  };

  game.barges = MAP.bases.map(base => ({
    x: base.barge.x,
    y: base.barge.y,
    hp: 500,
    maxHp: 500,
    size: 2,
    cd: 0
  }));

  game.players = roster.map((entry, index) => {
    const baseIndex = Math.floor(index / 4) % MAP.bases.length;
    const spawn = MAP.bases[baseIndex].spawns[index % 4] || MAP.bases[baseIndex].spawns[0];
    const mechType = MECHS[entry.mechType] ? entry.mechType : "Watcher";
    const baseStats = MECHS[mechType];

    return {
      id: entry.id,
      name: entry.name,
      color: COLORS[index],
      base: baseIndex,
      mechType,
      mode: "mecha",
      x: spawn.x,
      y: spawn.y,
      z: 0,
      vz: 0,
      ang: -Math.PI / 2,
      aim: 0,
      hp: baseStats.hp,
      maxHp: baseStats.hp,
      wreck: 0,
      respawn: 0,
      pilot: { x: spawn.x, y: spawn.y, hp: PMAX, ang: 0 },
      cd: 0,
      specialCd: 0,
      special2Cd: 0,
      tow: [],
      captured: null,
      dash: 0,
      input: {}
    };
  });

  return game;
}

// ===================== CONTROLES =====================
const keys = {};
const mouse = { x: 0, y: 0, down: false, t: 0 };
const edges = { toggle: 0, pickup: 0, drop: 0, special1: 0 };
const joy = { id: null, ox: 0, oy: 0, dx: 0, dy: 0 };
let mobFire = false;
let mobSpecial2 = false;

addEventListener("keydown", event => {
  if (typeof event.key !== "string") return;
  if (event.target?.tagName === "INPUT" || event.target?.tagName === "SELECT") return;

  const key = event.key.toLowerCase();

  if (!keys[key]) {
    if (key === "f") edges.toggle = 1;
    if (key === "e") edges.pickup = 1;
    if (key === "q") edges.drop = 1;
    if (key === " ") edges.special1 = 1;
    if (key === "escape") togglePause();
    if (key === "y") vote("stay");
    if (key === "n") vote("leave");
    if (key === "+" || key === "=") zoom = Math.min(1.2, zoom * 1.1);
    if (key === "-") zoom = Math.max(0.18, zoom * 0.9);
  }

  keys[key] = true;
  if (key === " ") event.preventDefault();
});

addEventListener("keyup", event => {
  if (typeof event.key !== "string") return;
  keys[event.key.toLowerCase()] = false;
});

cv.addEventListener("mousemove", event => {
  mouse.x = event.clientX;
  mouse.y = event.clientY;
  mouse.t = performance.now();
});

cv.addEventListener("mousedown", event => {
  if (event.button === 0) mouse.down = true;
  mouse.t = performance.now();
});

addEventListener("mouseup", () => mouse.down = false);
cv.addEventListener("contextmenu", event => event.preventDefault());

cv.addEventListener("wheel", event => {
  event.preventDefault();
  zoom = Math.min(1.2, Math.max(0.18, zoom * (event.deltaY < 0 ? 1.1 : 0.9)));
}, { passive: false });

function setupMobile() {
  $("mob").classList.remove("hide");

  const joystick = $("joy");
  const knob = $("joy-k");
  const radius = 50;

  joystick.onpointerdown = event => {
    joy.id = event.pointerId;
    joy.ox = event.clientX;
    joy.oy = event.clientY;
    joystick.setPointerCapture(event.pointerId);

    const rect = joystick.getBoundingClientRect();
    knob.style.display = "block";
    knob.style.left = `${event.clientX - rect.left}px`;
    knob.style.top = `${event.clientY - rect.top}px`;
  };

  joystick.onpointermove = event => {
    if (event.pointerId !== joy.id) return;

    let dx = event.clientX - joy.ox;
    let dy = event.clientY - joy.oy;
    const magnitude = Math.hypot(dx, dy);

    if (magnitude > radius) {
      dx *= radius / magnitude;
      dy *= radius / magnitude;
    }

    joy.dx = dx / radius;
    joy.dy = dy / radius;

    const rect = joystick.getBoundingClientRect();
    knob.style.left = `${joy.ox - rect.left + dx}px`;
    knob.style.top = `${joy.oy - rect.top + dy}px`;
  };

  joystick.onpointerup = joystick.onpointercancel = event => {
    if (event.pointerId !== joy.id) return;
    joy.id = null;
    joy.dx = 0;
    joy.dy = 0;
    knob.style.display = "none";
  };

  document.querySelectorAll(".mb").forEach(button => {
    const action = button.dataset.a;

    button.onpointerdown = event => {
      event.preventDefault();

      if (action === "fire") mobFire = true;
      else if (action === "special2") mobSpecial2 = true;
      else edges[action] = 1;
    };

    button.onpointerup = button.onpointerleave = button.onpointercancel = () => {
      if (action === "fire") mobFire = false;
      if (action === "special2") mobSpecial2 = false;
    };
  });
}

const myP = () => VIEW?.players.find(player => player.id === S.myId);
const actorV = player => player.mode === "mecha" ? player : player.pilot;

function readInput() {
  const gamepad = S.inputMode === "gamepad" ? pollGamepad() : null;

  if (gamepad) {
    if (gamepad.toggleSuit) edges.toggle = 1;
    if (gamepad.special) edges.special1 = 1;
    if (gamepad.special2) mobSpecial2 = true;
    else mobSpecial2 = false;

    if (gamepad.pickup) {
      if (VIEW?.phase === "vote") vote("stay");
      else edges.pickup = 1;
    }

    if (gamepad.drop) {
      if (VIEW?.phase === "vote") vote("leave");
      else edges.drop = 1;
    }

    if (gamepad.pause) togglePause();
    if (gamepad.select) toggleTerminal();
  }

  const sx =
    (keys.d || keys.arrowright ? 1 : 0)
    - (keys.a || keys.arrowleft ? 1 : 0)
    + joy.dx + (gamepad?.moveX || 0);

  const sy =
    (keys.s || keys.arrowdown ? 1 : 0)
    - (keys.w || keys.arrowup ? 1 : 0)
    + joy.dy + (gamepad?.moveY || 0);

  const movement = screenDirToWorld(sx, sy);
  const me = myP();

  let ax = null, ay = null;

  if (me && S.device === "pc" && performance.now() - mouse.t < 3000) {
    const actor = actorV(me);
    const target = s2w(mouse.x, mouse.y);
    ax = target.x - actor.x;
    ay = target.y - actor.y;
  }

  if (edges.pickup && me && VIEW) {
    const actor = actorV(me);
    const barge = VIEW.barges[me.base];
    const nearBarge = barge
      && Math.abs(actor.x - barge.x) < barge.size / 2 + 1.6
      && Math.abs(actor.y - barge.y) < barge.size / 2 + 1.6;
    const nearCarcass = VIEW.carcasses.some(carcass =>
      Math.hypot(carcass.x - actor.x, carcass.y - actor.y) < 2
    );

    if (nearBarge && !nearCarcass && !me.tow?.length) {
      edges.pickup = 0;
      toggleTerminal();
    }
  }

  let targetX = null, targetY = null;
  if (me && ax != null) {
    const actor = actorV(me);
    targetX = actor.x + ax;
    targetY = actor.y + ay;
  }

  return {
    mx: movement.x,
    my: movement.y,
    ax,
    ay,
    targetX,
    targetY,
    fire: !!((mouse.down && S.device === "pc") || mobFire || gamepad?.fire),
    toggle: !!edges.toggle,
    pickup: !!edges.pickup,
    drop: !!edges.drop,
    special1: !!edges.special1,
    special2: !!(mobSpecial2 || keys.r || gamepad?.special2)
  };
}

const clearEdges = () => {
  for (const key of Object.keys(edges)) edges[key] = 0;
};

// ===================== SIMULAÇÃO DO HOST =====================
const L = id => G.lvl[id] || 0;

function stats(player) {
  const mech = MECHS[player.mechType] || MECHS.Watcher;

  return {
    dmg: mech.damage * (1 + 0.15 * L("dmg")),
    rof: mech.rate / (1 + 0.12 * L("rof")),
    hp: mech.hp + 40 * L("hull"),
    spd: mech.speed * (1 + 0.08 * L("speed")),
    shots: 1 + L("multi")
  };
}

function blocked(x, y, width, air, fromHeight, ignoreHeight = false) {
  const half = width / 2;

  if (x - half < 0.2 || y - half < 0.2 || x + half > MAP.w - 0.2 || y + half > MAP.h - 0.2) {
    return true;
  }

  if (!air) {
    for (let gx = Math.floor(x - half); gx <= Math.floor(x + half); gx++) {
      for (let gy = Math.floor(y - half); gy <= Math.floor(y + half); gy++) {
        if (MAP.isSolid(gx, gy)) return true;

        if (!ignoreHeight && fromHeight != null
          && Math.abs(MAP.gz(gx + 0.5, gy + 0.5) - fromHeight) > 0.6) {
          return true;
        }
      }
    }
  }

  for (const block of G.blocks) {
    if (block.hp > 0 && Math.abs(x - block.x) < half + 0.5
      && Math.abs(y - block.y) < half + 0.5) {
      return true;
    }
  }

  for (const barge of G.barges) {
    const size = barge.size / 2;

    if (x + half > barge.x - size && x - half < barge.x + size
      && y + half > barge.y - size && y - half < barge.y + size) {
      return true;
    }
  }

  return false;
}

function move(object, dx, dy, width, air, ignoreHeight = false) {
  const fromHeight = air || ignoreHeight ? null : MAP.gz(object.x, object.y);

  if (!blocked(object.x + dx, object.y, width, air, fromHeight, ignoreHeight)) {
    object.x += dx;
  }

  if (!blocked(object.x, object.y + dy, width, air, fromHeight, ignoreHeight)) {
    object.y += dy;
  }
}

function fixPos(object, width) {
  if (!blocked(object.x, object.y, width, false, null)) return;

  for (let radius = 0.5; radius < 8; radius += 0.5) {
    for (let angle = 0; angle < 6.28; angle += 0.5) {
      const x = object.x + Math.cos(angle) * radius;
      const y = object.y + Math.sin(angle) * radius;

      if (!blocked(x, y, width, false, null)) {
        object.x = x;
        object.y = y;
        return;
      }
    }
  }
}

function pushOut(object, barge) {
  const half = barge.size / 2 + 0.8;
  const dx = object.x - barge.x;
  const dy = object.y - barge.y;

  if (Math.abs(dx) >= half || Math.abs(dy) >= half) return;

  if (Math.abs(dx) > Math.abs(dy)) {
    object.x = barge.x + Math.sign(dx || 1) * half;
  } else {
    object.y = barge.y + Math.sign(dy || 1) * half;
  }
}

const nearBarge = (actor, extra) =>
  G.barges.find(barge =>
    Math.abs(actor.x - barge.x) < barge.size / 2 + extra
    && Math.abs(actor.y - barge.y) < barge.size / 2 + extra
  );

function nearestEnemy(actor, radius) {
  let best = null;
  let bestDistance = radius;

  for (const enemy of G.enemies) {
    if (enemy.capturedBy) continue;

    const distance = Math.hypot(enemy.x - actor.x, enemy.y - actor.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = enemy;
    }
  }

  return best;
}

function towIds(player) {
  if (Array.isArray(player.tow)) return player.tow;
  if (player.tow == null) return [];
  return [player.tow];
}

function dropTow(player) {
  for (const id of towIds(player)) {
    const carcass = G.carcasses.find(item => item.id === id);
    if (carcass) carcass.by = null;
  }
  player.tow = [];
}

function fx(x, y, text, color) {
  G.fx.push({ x, y, txt: text, c: color, t: 0.8 });
}

function damageEnemy(enemy, amount, color = "#fde047") {
  if (!enemy || enemy.hp <= 0) return;

  const damage = S.dev.oneshot ? enemy.hp : amount;
  enemy.hp -= damage;
  fx(enemy.x, enemy.y, Math.round(damage), color);
}

function damageEnemiesInRadius(x, y, radius, amount) {
  for (const enemy of G.enemies) {
    if (enemy.capturedBy) continue;

    if (Math.hypot(enemy.x - x, enemy.y - y) <= radius) {
      damageEnemy(enemy, amount);
    }
  }
}

function pushEnemiesFrom(x, y, radius, force, damage = 0) {
  for (const enemy of G.enemies) {
    if (enemy.capturedBy) continue;

    const dx = enemy.x - x;
    const dy = enemy.y - y;
    const distance = Math.hypot(dx, dy) || 0.01;

    if (distance > radius) continue;

    if (damage > 0) damageEnemy(enemy, damage);

    const amount = force * (1 - distance / radius);
    enemy.x += dx / distance * amount;
    enemy.y += dy / distance * amount;
  }
}

function update(dt) {
  G._t = [];

  for (const player of G.players) {
    if (player.respawn > 0) continue;

    if (player.mode === "mecha") {
      G._t.push({ x: player.x, y: player.y, r: 0.8, k: "mecha", p: player });
    } else {
      G._t.push({ x: player.pilot.x, y: player.pilot.y, r: 0.3, k: "pilot", p: player });
    }
  }

  for (const barge of G.barges) {
    G._t.push({ x: barge.x, y: barge.y, r: barge.size / 2, k: "barge", ref: barge });
  }

  updateBarges(dt);

  for (const player of G.players) {
    updatePlayer(player, dt);
  }

  if (!S.dev.freeze) {
    for (const enemy of G.enemies) updateEnemy(enemy, dt);
  }

  updateShots(dt);
  updateMines(dt);
  updateLoot(dt);
  updateWaves(dt);

  G.blocks = G.blocks.filter(block => block.hp > 0 && (block.life -= dt) > 0);
  G.fx = G.fx.filter(effect => (effect.t -= dt) > 0);
}

function updatePlayer(player, dt) {
  const input = player.input || {};
  const st = stats(player);
  const mechType = MECHS[player.mechType] ? player.mechType : "Watcher";
  const isMecha = player.mode === "mecha";
  const actor = isMecha ? player : player.pilot;
  const width = isMecha ? MW : PW;

  player.maxHp = st.hp;

  if (player.wreck > 0 && (player.wreck -= dt) <= 0) {
    player.wreck = 0;
    player.hp = Math.round(player.maxHp * 0.4);
    say(`🔧 Mecha de ${player.name} reiniciado`);
  }

  if (player.respawn > 0) {
    if ((player.respawn -= dt) <= 0) respawnPilot(player);
    for (const key of EDGES) input[key] = 0;
    return;
  }

  if (input.toggle) {
    if (player.mode === "mecha") {
      player.mode = "pilot";
      Object.assign(player.pilot, { x: player.x, y: player.y + 1.2 });
      fixPos(player.pilot, PW);
      dropTow(player);
    } else if (player.wreck <= 0
      && Math.hypot(player.pilot.x - player.x, player.pilot.y - player.y) < 2.2) {
      player.mode = "mecha";
    }
  }

  const inMecha = player.mode === "mecha";
  const activeActor = inMecha ? player : player.pilot;
  const actorWidth = inMecha ? MW : PW;
  const ignoreHeight = inMecha && mechType === "Juggler";

  // Habilidades especiais do mecha.
  if (inMecha && input.special1 && player.specialCd <= 0) {
    useSpecial1(player, input);
  }

  if (inMecha && input.special2 && player.special2Cd <= 0) {
    useSpecial2(player, input);
  }

  if (inMecha && input.special2 && mechType === "Juggler") {
    jugglerRepel(player, input, dt);
  }

  // Pulo da melhoria para mechas que não usam a habilidade 1 para outro ataque.
  if (inMecha && input.special1 && L("jump") && player.z <= 0
    && !["Skipper", "Roamer", "Juggler", "Watcher"].includes(mechType)) {
    player.vz = 5 + L("jump") * 0.8;
  }

  if (player.dash > 0) {
    player.dash -= dt;
    const dashSpeed = 12;
    move(player, Math.cos(player.dashAngle) * dashSpeed * dt,
      Math.sin(player.dashAngle) * dashSpeed * dt, MW, true);
  }

  if (player.z > 0 || player.vz) {
    player.vz -= 18 * dt;
    player.z += player.vz * dt;

    if (player.z <= 0) {
      if (blocked(player.x, player.y, MW, false, null)) {
        player.z = 0.05;
        player.vz = 3;
      } else {
        player.z = 0;
        player.vz = 0;

        if (player.skipperLanding) {
          damageEnemiesInRadius(player.x, player.y, 2.8, st.dmg * 2.5);
          player.skipperLanding = false;
          fx(player.x, player.y, "IMPACTO", "#67e8f9");
        }
      }
    }
  }

  const isFlying = inMecha && (mechType === "Roamer" || player.z > 0.15);
  let speed = (inMecha ? st.spd : 3.2) * (towIds(player).length ? 0.75 : 1);

  if (inMecha && mechType === "Roamer" && Math.hypot(input.mx || 0, input.my || 0) > 0.05) {
    const desired = Math.atan2(input.my, input.mx);
    const turn = Math.abs(Math.atan2(Math.sin(desired - player.ang), Math.cos(desired - player.ang)));
    speed *= Math.max(0.35, 1 - turn / Math.PI * 0.65);
  }

  if (Math.hypot(input.mx || 0, input.my || 0) > 0.05 && player.dash <= 0) {
    move(activeActor, input.mx * speed * dt, input.my * speed * dt,
      actorWidth, isFlying, ignoreHeight);
    activeActor.ang = Math.atan2(input.my, input.mx);

    if (inMecha) player.ang = activeActor.ang;
  }

  if (mechType === "Roamer" && player.captured) {
    const captured = G.enemies.find(enemy => enemy.id === player.captured);

    if (captured) {
      captured.x = player.x + Math.cos(player.aim) * 1.5;
      captured.y = player.y + Math.sin(player.aim) * 1.5;
    } else {
      player.captured = null;
    }
  }

  const auto = nearestEnemy(activeActor, 10);

  player.aim = input.ax != null && (input.ax || input.ay)
    ? Math.atan2(input.ay, input.ax)
    : auto
      ? Math.atan2(auto.y - activeActor.y, auto.x - activeActor.x)
      : (activeActor.ang || 0);

  if (inMecha && L("regen") && player.hp > 0) {
    player.hp = Math.min(player.maxHp, player.hp + 1.5 * L("regen") * dt);
  }

  // Juggler: cada carcaça rebocada reduz em 25% a velocidade de tiro.
  const carcassCount = towIds(player).length;
  const jugglerRateFactor = mechType === "Juggler"
    ? Math.max(0, 1 - carcassCount * 0.25)
    : 1;

  player.cd -= dt;

  if (input.fire && player.cd <= 0 && jugglerRateFactor > 0) {
    const count = inMecha ? st.shots : 1;

    for (let index = 0; index < count; index++) {
      const angle = player.aim + (index - (count - 1) / 2) * 0.12;
      G.shots.push({
        x: activeActor.x + Math.cos(angle) * 0.8,
        y: activeActor.y + Math.sin(angle) * 0.8,
        vx: Math.cos(angle) * 16,
        vy: Math.sin(angle) * 16,
        dmg: inMecha ? st.dmg : 6,
        f: "p",
        life: 0.9,
        ignoreTerrain: mechType === "Skipper" && inMecha
      });
    }

    player.cd = inMecha ? st.rof / (jugglerRateFactor || 1) : 0.35;
  }

  // Rebocar carcaças; o Juggler pode levar até quatro.
  if (input.pickup && inMecha) {
    const limit = mechType === "Juggler" ? 4 : 1;
    const ids = towIds(player);

    if (ids.length < limit) {
      const carcass = G.carcasses.find(item =>
        !item.by && Math.hypot(item.x - activeActor.x, item.y - activeActor.y) < 2
      );

      if (carcass) {
        carcass.by = player.id;
        ids.push(carcass.id);
        player.tow = ids;
      }
    }
  }

  if (input.drop) dropTow(player);

  const ids = towIds(player);

  ids.forEach((id, index) => {
    const carcass = G.carcasses.find(item => item.id === id);
    if (!carcass) {
      ids.splice(index, 1);
      return;
    }

    const angle = activeActor.ang || player.aim;
    const distance = 1.3 + index * 0.55;
    const targetX = activeActor.x - Math.cos(angle) * distance;
    const targetY = activeActor.y - Math.sin(angle) * distance;
    const blend = Math.min(1, 8 * dt);

    carcass.x += (targetX - carcass.x) * blend;
    carcass.y += (targetY - carcass.y) * blend;
  });

  player.tow = ids;

  if (!inMecha) {
    const barge = nearBarge(activeActor, 1.2);
    if (barge) barge.hp = Math.min(barge.maxHp, barge.hp + 12 * dt);
  }

  for (const key of EDGES) input[key] = 0;
}

function useSpecial1(player, input) {
  const type = player.mechType;
  const st = stats(player);

  if (type === "Juggler") {
    const target = getTargetPoint(player, input);
    G.blocks.push({
      id: G.nid++,
      x: target.x,
      y: target.y,
      hp: 3,
      life: 20
    });
    player.specialCd = 5;
    fx(target.x, target.y, "BLOCO", "#a3e635");
    return;
  }

  if (type === "Roamer") {
    player.dash = 0.45;
    player.dashAngle = player.aim;
    player.specialCd = 5;
    pushEnemiesFrom(player.x + Math.cos(player.aim) * 2,
      player.y + Math.sin(player.aim) * 2, 3.5, 2.2, st.dmg * 1.5);
    fx(player.x, player.y, "RASANTE", "#38bdf8");
    return;
  }

  if (type === "Skipper") {
    if (player.z <= 0) {
      player.vz = 8;
      player.skipperLanding = true;
      player.specialCd = 4;
    }
    return;
  }

  if (type === "Watcher") {
    const direction = player.aim;
    G.shots.push({
      x: player.x,
      y: player.y,
      vx: Math.cos(direction) * 9,
      vy: Math.sin(direction) * 9,
      f: "bomb",
      dmg: st.dmg * 1.2,
      life: 1.2
    });
    player.specialCd = 7;
  }
}

function useSpecial2(player, input) {
  const type = player.mechType;
  const st = stats(player);

  if (type === "Juggler") {
    player.special2Cd = 0.25;
    jugglerAttract(player, input);
    return;
  }

  if (type === "Roamer") {
    if (player.captured) {
      const enemy = G.enemies.find(item => item.id === player.captured);

      if (enemy) {
        enemy.capturedBy = null;
        enemy.x = player.x + Math.cos(player.aim) * 1.2;
        enemy.y = player.y + Math.sin(player.aim) * 1.2;
        enemy.vx = Math.cos(player.aim) * 12;
        enemy.vy = Math.sin(player.aim) * 12;
        enemy.hp -= st.dmg * 2;
      }

      player.captured = null;
      player.special2Cd = 4;
      return;
    }

    const enemy = nearestEnemy(player, 2.2);

    if (enemy) {
      player.captured = enemy.id;
      enemy.capturedBy = player.id;
      enemy.vx = 0;
      enemy.vy = 0;
      player.special2Cd = 1;
      fx(enemy.x, enemy.y, "CAPTURADO", "#7dd3fc");
    }

    return;
  }

  if (type === "Skipper") {
    G.shots.push({
      x: player.x + Math.cos(player.aim) * 0.8,
      y: player.y + Math.sin(player.aim) * 0.8,
      vx: Math.cos(player.aim) * 24,
      vy: Math.sin(player.aim) * 24,
      f: "p",
      dmg: st.dmg * 5,
      life: 1.2,
      ignoreTerrain: true,
      pierce: 3
    });
    player.special2Cd = 8;
    return;
  }

  if (type === "Watcher") {
    damageEnemiesInRadius(player.x, player.y, 3.2, st.dmg * 1.5);
    player.hp = Math.min(player.maxHp, player.hp + 55);
    player.special2Cd = 10;
    fx(player.x, player.y, "CALOR + REPARO", "#fb923c");
  }
}

function getTargetPoint(player, input) {
  if (input.targetX != null && input.targetY != null) {
    return { x: input.targetX, y: input.targetY };
  }

  return {
    x: player.x + Math.cos(player.aim) * 5,
    y: player.y + Math.sin(player.aim) * 5
  };
}

function jugglerAttract(player, input) {
  const target = getTargetPoint(player, input);

  for (const enemy of G.enemies) {
    if (enemy.capturedBy) continue;

    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (distance < 9) {
      enemy.x += dx / distance * 0.35;
      enemy.y += dy / distance * 0.35;
    }
  }
}

function jugglerRepel(player, input, dt) {
  const target = getTargetPoint(player, input);

  for (const enemy of G.enemies) {
    if (enemy.capturedBy) continue;

    const dx = enemy.x - target.x;
    const dy = enemy.y - target.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (distance < 9) {
      enemy.x += dx / distance * 5 * dt;
      enemy.y += dy / distance * 5 * dt;
    }
  }
}

function respawnPilot(player) {
  const barge = G.barges[player.base];

  Object.assign(player.pilot, {
    x: barge.x,
    y: barge.y + barge.size / 2 + 0.6,
    hp: PMAX
  });

  fixPos(player.pilot, PW);
  player.mode = "pilot";
  player.respawn = 0;
}

function hurt(target, amount) {
  if (target.k !== "barge" && S.dev.god) return;

  fx(target.x, target.y, Math.round(amount), "#fca5a5");

  if (target.k === "barge") {
    target.ref.hp -= amount;
    if (target.ref.hp <= 0) gameOver();
    return;
  }

  const player = target.p;

  if (target.k === "mecha") {
    player.hp -= amount;

    if (player.hp <= 0) {
      player.hp = 0;
      player.wreck = 12;
      player.mode = "pilot";
      dropTow(player);
      Object.assign(player.pilot, { x: player.x, y: player.y + 1.2 });
      fixPos(player.pilot, PW);
      say(`💥 Mecha de ${player.name} destruído! Reinicia em 12s`, "#f87171");
    }
  } else {
    player.pilot.hp -= amount;

    if (player.pilot.hp <= 0) {
      player.respawn = 8;
      say(`☠️ ${player.name} caiu. Renasce na barcaça em 8s`, "#f87171");
    }
  }
}

function updateBarges(dt) {
  G.barges.forEach((barge, index) => {
    const players = G.players.filter(player => player.base === index);
    barge.size = Math.min(5, 2 + Math.floor(players.length / 2));
    barge.maxHp = 500 + 100 * L("barge");

    if (L("turret") && (barge.cd -= dt) <= 0) {
      const enemy = nearestEnemy(barge, 8);

      if (enemy) {
        const angle = Math.atan2(enemy.y - barge.y, enemy.x - barge.x);
        G.shots.push({
          x: barge.x, y: barge.y,
          vx: Math.cos(angle) * 14,
          vy: Math.sin(angle) * 14,
          dmg: 8 * L("turret"),
          f: "p",
          life: 0.8
        });
        barge.cd = 0.7;
      }
    }

    for (const player of G.players) {
      pushOut(player, barge);
      pushOut(player.pilot, barge);
    }
  });
}

// ===================== INIMIGOS EXISTENTES DO JOGO =====================
function spawnEnemy() {
  const barge = G.barges[Math.random() * G.barges.length | 0];

  for (let attempt = 0; attempt < 20; attempt++) {
    const angle = Math.random() * 6.283;
    const distance = 18 + Math.random() * 8;
    const x = Math.max(1.5, Math.min(MAP.w - 1.5, barge.x + Math.cos(angle) * distance));
    const y = Math.max(1.5, Math.min(MAP.h - 1.5, barge.y + Math.sin(angle) * distance));

    if (blocked(x, y, 1, false, MAP.gz(barge.x, barge.y))) continue;

    const scale = 1 + (G.wave - 1) * 0.22;
    const side = Math.random() < 0.5 ? 1 : -1;
    const gunner = Math.random() < Math.min(0.45, 0.15 + G.wave * 0.05);
    const id = G.nid++;

    G.enemies.push(gunner
      ? {
          id, type: "gunner", x, y, w: 1,
          hp: 70 * scale, maxHp: 70 * scale,
          spd: 1.8, range: 6.5, dmg: 8 * scale,
          cd: 1, side, vx: 0, vy: 0
        }
      : {
          id, type: "crawler", x, y, w: 0.8,
          hp: 42 * scale, maxHp: 42 * scale,
          spd: 2.8 + Math.min(1, G.wave * 0.08),
          range: 0.4, dmg: 10 * scale,
          cd: 0.5, side, vx: 0, vy: 0
        });

    return;
  }
}

function updateEnemy(enemy, dt) {
  if (enemy.capturedBy) return;

  if (enemy.vx || enemy.vy) {
    move(enemy, enemy.vx * dt, enemy.vy * dt, enemy.w, false);
    enemy.vx *= Math.max(0, 1 - dt * 2);
    enemy.vy *= Math.max(0, 1 - dt * 2);
  }

  let target = null;
  let bestDistance = 1e9;

  for (const candidate of G._t) {
    const distance = Math.hypot(candidate.x - enemy.x, candidate.y - enemy.y) - candidate.r;

    if (distance < bestDistance) {
      bestDistance = distance;
      target = candidate;
    }
  }

  if (!target) return;

  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  const distance = Math.hypot(dx, dy) || 1;

  enemy.ang = Math.atan2(dy, dx);
  enemy.cd -= dt;

  if (bestDistance > enemy.range) {
    const oldX = enemy.x, oldY = enemy.y;
    const step = enemy.spd * dt;

    move(enemy, dx / distance * step, dy / distance * step, enemy.w, false);

    if (Math.abs(enemy.x - oldX) + Math.abs(enemy.y - oldY) < 1e-4) {
      move(enemy, -dy / distance * step * enemy.side,
        dx / distance * step * enemy.side, enemy.w, false);
    }
  } else if (enemy.cd <= 0) {
    if (enemy.type === "gunner") {
      G.shots.push({
        x: enemy.x, y: enemy.y,
        vx: dx / distance * 9,
        vy: dy / distance * 9,
        dmg: enemy.dmg,
        f: "e",
        life: 1.2
      });
      enemy.cd = 1.6;
    } else {
      hurt(target, enemy.dmg);
      enemy.cd = 0.9;
    }
  }
}

function updateShots(dt) {
  G.shots = G.shots.filter(shot => {
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;

    if ((shot.life -= dt) <= 0) return false;

    if (!shot.ignoreTerrain && MAP.isSolid(Math.floor(shot.x), Math.floor(shot.y))) {
      if (shot.f === "bomb") splitBomb(shot);
      return false;
    }

    if (shot.f === "bomb") {
      const enemy = G.enemies.find(item =>
        !item.capturedBy && Math.hypot(item.x - shot.x, item.y - shot.y) < item.w / 2 + 0.3
      );

      if (enemy) {
        splitBomb(shot);
        return false;
      }

      return true;
    }

    if (shot.f === "p") {
      const block = G.blocks.find(item =>
        item.hp > 0 && Math.hypot(item.x - shot.x, item.y - shot.y) < 0.8
      );

      if (block) {
        block.hp -= 1;
        return false;
      }

      const enemy = G.enemies.find(item =>
        !item.capturedBy && Math.hypot(item.x - shot.x, item.y - shot.y) < item.w / 2 + 0.25
      );

      if (enemy) {
        damageEnemy(enemy, shot.dmg);

        if (shot.pierce > 0) {
          shot.pierce--;
          return true;
        }

        return false;
      }
    } else if (shot.f === "e") {
      const target = G._t.find(item => Math.hypot(item.x - shot.x, item.y - shot.y) < item.r + 0.2);

      if (target) {
        hurt(target, shot.dmg);
        return false;
      }
    }

    return true;
  });

  G.enemies = G.enemies.filter(enemy => {
    if (enemy.hp > 0) return true;

    G.carcasses.push({ id: G.nid++, x: enemy.x, y: enemy.y, by: null });

    if (Math.random() < 0.07) {
      G.pickups.push({ id: G.nid++, x: enemy.x + 0.4, y: enemy.y });
    }

    for (const player of G.players) {
      if (player.captured === enemy.id) player.captured = null;
    }

    return false;
  });
}

function splitBomb(bomb) {
  const offsets = [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]];

  for (const [dx, dy] of offsets) {
    G.mines.push({
      x: bomb.x + dx,
      y: bomb.y + dy,
      dmg: bomb.dmg,
      radius: 1.4,
      life: 12,
      armed: 0.4
    });
  }

  fx(bomb.x, bomb.y, "MINAS", "#fb923c");
}

function updateMines(dt) {
  for (let index = G.mines.length - 1; index >= 0; index--) {
    const mine = G.mines[index];
    mine.life -= dt;
    mine.armed -= dt;

    if (mine.life <= 0) {
      G.mines.splice(index, 1);
      continue;
    }

    if (mine.armed <= 0) {
      const enemy = G.enemies.find(item =>
        !item.capturedBy && Math.hypot(item.x - mine.x, item.y - mine.y) < mine.radius
      );

      if (enemy) {
        damageEnemiesInRadius(mine.x, mine.y, mine.radius, mine.dmg);
        G.mines.splice(index, 1);
      }
    }
  }
}

// ===================== CARCAÇAS, DROPS E UPGRADES =====================
function updateLoot(dt) {
  G.pickups = G.pickups.filter(pickup => {
    const collected = G.players.some(player => {
      const actor = player.mode === "mecha" ? player : player.pilot;

      return player.respawn <= 0
        && Math.hypot(actor.x - pickup.x, actor.y - pickup.y) < 1.1;
    });

    if (collected) {
      G.loot.diag++;
      onBlueprint();
    }

    return !collected;
  });

  const magnetRadius = L("magnet") ? 1.5 + L("magnet") * 1.5 : 0;

  G.carcasses = G.carcasses.filter(carcass => {
    for (const barge of G.barges) {
      const distance = Math.hypot(carcass.x - barge.x, carcass.y - barge.y) || 0.01;
      const edge = barge.size / 2;

      if (distance < edge + (carcass.by ? 1.4 : 0.9)) {
        G.loot.mat += 10;

        for (const player of G.players) {
          const ids = towIds(player);
          player.tow = ids.filter(id => id !== carcass.id);
        }

        say("📦 Carcaça processada +10 Mat", "#6ee7b7");
        return false;
      }

      if (!carcass.by && magnetRadius && distance < edge + magnetRadius) {
        carcass.x += (barge.x - carcass.x) / distance * 3 * dt;
        carcass.y += (barge.y - carcass.y) / distance * 3 * dt;
      }
    }

    return true;
  });
}

function onBlueprint() {
  const pool = UPG.filter(upgrade => !G.lvl[upgrade.id]);

  if (!pool.length) {
    G.loot.mat += 25;
    say("📘 Diagrama convertido em 25 Mat");
    return;
  }

  let roll = Math.random() * pool.reduce((sum, upgrade) => sum + upgrade.w, 0);
  const upgrade = pool.find(item => (roll -= item.w) < 0) || pool[0];

  if (upgrade.parts) {
    G.parts[upgrade.id] = (G.parts[upgrade.id] || 0) + 1;

    if (G.parts[upgrade.id] >= upgrade.parts) {
      G.lvl[upgrade.id] = 1;
      say(`⭐ ${upgrade.name} desbloqueado!`, "#c084fc");
    } else {
      say(`🧩 Parte de ${upgrade.name} (${G.parts[upgrade.id]}/${upgrade.parts})`, "#c084fc");
    }
  } else {
    G.lvl[upgrade.id] = 1;
    say(`📘 ${upgrade.name} desbloqueado!`, "#c084fc");
  }
}

function buy(id) {
  const upgrade = UPG.find(item => item.id === id);
  const level = G.lvl[id] || 0;

  if (!upgrade || !level || level >= upgrade.max || G.loot.mat < upgrade.cost * level) return;

  G.loot.mat -= upgrade.cost * level;
  G.lvl[id] = level + 1;

  if (id === "hull") G.players.forEach(player => player.hp += 40);
  if (id === "barge") G.barges.forEach(barge => barge.hp += 100);

  say(`⬆️ ${upgrade.name} Nv.${level + 1}`, "#7dd3fc");
}

// ===================== ONDAS E VOTAÇÃO =====================
function startWave(number) {
  G.wave = number;
  G.phase = "combat";
  G.spawnT = 1;
  G.toSpawn = Math.round((5 + number * 3) * (0.6 + 0.4 * G.players.length));
  say(`⚠️ Onda ${number} iniciada!`, "#fbbf24");
}

function updateWaves(dt) {
  if (G.phase === "prep") {
    if ((G.timer -= dt) <= 0) startWave(G.wave + 1);
  } else if (G.phase === "combat") {
    if (G.toSpawn > 0 && (G.spawnT -= dt) <= 0) {
      spawnEnemy();
      G.toSpawn--;
      G.spawnT = Math.max(0.25, 1.1 - G.wave * 0.05);
    }

    if (G.toSpawn === 0 && !G.enemies.length) {
      if (G.wave % 3 === 0) {
        G.phase = "vote";
        G.timer = 45;
        G.votes = {};
        say("🗳️ Pausa longa: votem para ficar ou extrair", "#fbbf24");
      } else {
        G.phase = "prep";
        G.timer = 6;
        say(`✅ Onda ${G.wave} limpa`, "#6ee7b7");
      }
    }
  } else if (G.phase === "vote" && (G.timer -= dt) <= 0) {
    endVote();
  }
}

function handleVote(id, choice) {
  if (!G || G.phase !== "vote") return;

  if (choice === "leave") {
    if (id === S.myId) return hostEnd();

    const player = G.players.find(item => item.id === id);
    if (!player) return;

    const count = G.players.length;
    const share = {
      mat: Math.floor(G.loot.mat / count),
      diag: Math.floor(G.loot.diag / count)
    };

    G.loot.mat -= share.mat;
    G.loot.diag -= share.diag;
    dropTow(player);
    G.players = G.players.filter(item => item !== player);

    Net.sendTo(id, { t: "extracted", ...share });
    say(`🚀 ${player.name} extraiu com ${share.mat} Mat`, "#fbbf24");
  } else {
    G.votes[id] = "stay";
  }

  if (G.players.every(player => G.votes[player.id])) endVote();
}

function endVote() {
  G.phase = "prep";
  G.timer = 4;
  say("Todos ficaram. Próxima onda!", "#7dd3fc");
}

function hostEnd() {
  if (!G || G.ending) return;

  G.ending = true;
  say("⚠️ O host está encerrando a partida. Fim em 5s, o loot será dividido.", "#fbbf24");
  Net.broadcast({ t: "hostEnding" });

  setTimeout(() => {
    const count = G.players.length || 1;
    const share = {
      mat: Math.floor(G.loot.mat / count),
      diag: Math.floor(G.loot.diag / count)
    };

    G.players.forEach(player => {
      if (player.id !== S.myId) Net.sendTo(player.id, { t: "extracted", ...share });
    });

    G.over = true;
    extracted(share);
  }, S.online ? 5000 : 0);
}

function gameOver() {
  if (G.over) return;

  G.over = true;
  const message = {
    t: "end",
    title: "💀 Barcaça destruída",
    desc: `Loot perdido. Ondas: ${G.wave}`
  };

  Net.broadcast(message);
  showEnd(message.title, message.desc);
}

// ===================== FERRAMENTAS DEV =====================
function buildDev() {
  const panel = $("devp");
  panel.classList.remove("hide");
  panel.innerHTML = "<b style='color:#fbbf24'>🛠️ DEV</b>";

  [
    ["freeze", "Pausar mobs", 1],
    ["god", "Invencível", 1],
    ["oneshot", "One-shot kill", 1],
    ["nums", "Números de dano"],
    ["hitbox", "Mostrar hitboxes"],
    ["fps", "FPS / entidades"]
  ].forEach(([key, label, net]) => {
    const item = document.createElement("label");
    item.innerHTML = `<input type="checkbox"> ${label}`;
    item.firstChild.onchange = event => {
      S.dev[key] = event.target.checked;
      if (net && !S.isHost) Net.send({ t: "devflag", k: key, v: event.target.checked });
    };
    panel.appendChild(item);
  });

  [
    ["spawn5", "Spawnar 5 mobs"],
    ["heal", "Curar barcaça"],
    ["healme", "Curar meu mecha"],
    ["mat", "+100 Mat"],
    ["diag", "+1 Diagrama"],
    ["kill", "Matar todos"],
    ["skip", "Pular onda"],
    ["vote", "Forçar votação"],
    ["unlock", "Liberar todos upgrades"],
    ["tp", "Teleporte p/ mouse"]
  ].forEach(([action, label]) => {
    const button = document.createElement("button");
    button.textContent = label;
    button.onclick = () => {
      const point = s2w(mouse.x, mouse.y);
      act({ t: "dev", a: action, x: point.x, y: point.y });
    };
    panel.appendChild(button);
  });
}

function devAction(data) {
  if (!G) return;

  const player = G.players.find(item => item.id === data.id);
  const actions = {
    spawn5: () => { for (let i = 0; i < 5; i++) spawnEnemy(); },
    heal: () => G.barges.forEach(barge => barge.hp = barge.maxHp),
    healme: () => {
      if (player) {
        player.hp = player.maxHp;
        player.wreck = 0;
        player.pilot.hp = PMAX;
      }
    },
    mat: () => G.loot.mat += 100,
    diag: () => { G.loot.diag++; onBlueprint(); },
    kill: () => G.enemies.forEach(enemy => enemy.hp = 0),
    skip: () => { G.enemies = []; G.toSpawn = 0; },
    vote: () => {
      G.wave = Math.max(3, Math.ceil(G.wave / 3) * 3);
      G.phase = "combat";
      G.enemies = [];
      G.toSpawn = 0;
    },
    unlock: () => UPG.forEach(upgrade => G.lvl[upgrade.id] = Math.max(1, G.lvl[upgrade.id] || 0)),
    tp: () => {
      if (player) {
        const actor = player.mode === "mecha" ? player : player.pilot;
        actor.x = data.x;
        actor.y = data.y;
      }
    }
  };

  actions[data.a]?.();
}

// ===================== SINCRONIZAÇÃO =====================
const r2 = number => Math.round(number * 100) / 100;

function pack() {
  return {
    t: "state",
    wave: G.wave,
    phase: G.phase,
    timer: G.timer,
    left: G.toSpawn + G.enemies.length,
    loot: G.loot,
    lvl: G.lvl,
    parts: G.parts,
    votes: G.votes,

    players: G.players.map(player => ({
      id: player.id,
      name: player.name,
      color: player.color,
      base: player.base,
      mechType: player.mechType,
      mode: player.mode,
      x: r2(player.x),
      y: r2(player.y),
      z: r2(player.z),
      aim: r2(player.aim),
      hp: Math.round(player.hp),
      maxHp: player.maxHp,
      wreck: player.wreck,
      respawn: player.respawn,
      specialCd: player.specialCd,
      special2Cd: player.special2Cd,
      captured: player.captured,
      pilot: {
        x: r2(player.pilot.x),
        y: r2(player.pilot.y),
        hp: Math.round(player.pilot.hp)
      },
      tow: towIds(player)
    })),

    enemies: G.enemies.map(enemy => ({
      id: enemy.id,
      type: enemy.type,
      x: r2(enemy.x),
      y: r2(enemy.y),
      w: enemy.w,
      hp: enemy.hp,
      maxHp: enemy.maxHp,
      capturedBy: enemy.capturedBy
    })),

    shots: G.shots.map(shot => ({
      x: r2(shot.x),
      y: r2(shot.y),
      f: shot.f
    })),

    carcasses: G.carcasses.map(carcass => ({
      id: carcass.id,
      x: r2(carcass.x),
      y: r2(carcass.y)
    })),

    pickups: G.pickups.map(pickup => ({ x: pickup.x, y: pickup.y })),
    blocks: G.blocks.map(block => ({ x: block.x, y: block.y, hp: block.hp })),
    mines: G.mines.map(mine => ({ x: mine.x, y: mine.y, life: mine.life })),

    barges: G.barges.map(barge => ({
      x: barge.x,
      y: barge.y,
      hp: Math.round(barge.hp),
      maxHp: barge.maxHp,
      size: barge.size
    })),

    fx: G.fx
  };
}

// ===================== DESENHO =====================
function diamond(x, y, width, height, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x, y - height / 2);
  ctx.lineTo(x + width / 2, y);
  ctx.lineTo(x, y + height / 2);
  ctx.lineTo(x - width / 2, y);
  ctx.closePath();

  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }

  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function ell(x, y, radius, fill, z = 0) {
  const point = ws(x, y, z);
  ctx.beginPath();
  ctx.ellipse(
    point.x,
    point.y,
    radius * ISO.W / 2 * zoom * 1.41,
    radius * ISO.H / 2 * zoom * 1.41,
    0, 0, 6.29
  );
  ctx.fillStyle = fill;
  ctx.fill();
}

function bar(x, y, fraction, color) {
  ctx.fillStyle = "#0008";
  ctx.fillRect(x - 20, y, 40, 5);
  ctx.fillStyle = color;
  ctx.fillRect(x - 20, y, 40 * Math.max(0, Math.min(1, fraction)), 5);
}

const offscreen = point =>
  point.x < -300 || point.x > cv.width + 300
  || point.y < -400 || point.y > cv.height + 400;

const TILE_VARIANTS = new Map();
const SINGLE_ANGLE = new Set(["crate-medium", "crate-small", "crate-wide"]);
const OBJ_TILES = /^(block|column|crate|ladder|switch|arrowWall)/;

function tilePath(t) {
  const folder = OBJ_TILES.test(t.base) ? "sprites/objects/" : "sprites/tiles/";
  return folder + (SINGLE_ANGLE.has(t.base) ? `${t.base}.png` : `${t.base}_${t.dir}.png`);
}

// Cache no tamanho original (sem zoom), criado uma única vez por sprite/camada
function getTileVariant(path, layer, image) {
  const key = path + "|" + layer;
  let c = TILE_VARIANTS.get(key);
  if (c) return c;
  if (layer === 0) { TILE_VARIANTS.set(key, image); return image; }
  c = document.createElement("canvas");
  c.width = image.naturalWidth;
  c.height = image.naturalHeight;
  const tc = c.getContext("2d");
  tc.filter = `hue-rotate(${-Math.min(48, layer * 12)}deg) saturate(1.15)`;
  tc.drawImage(image, 0, 0);
  TILE_VARIANTS.set(key, c);
  return c;
}

function drawTile(tile, gx, gy, z, alpha) {
  const point = w2s(gx + 0.5, gy + 0.5, z);
  if (offscreen(point)) return;

  const path = tilePath(tile);
  const image = img(path);
  const h = ISO.H * zoom;
  const layer = Math.max(0, Number(z) || 0);
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = alpha;

  if (image) {
    const v = getTileVariant(path, layer, image);
    const dw = image.naturalWidth * zoom;
    const dh = image.naturalHeight * zoom;
    const extra = tile.base === "water_center" ? ISO.WATER : 0;
    ctx.drawImage(v, point.x - dw / 2, point.y + h / 2 + (ISO.OFF + extra) * zoom - dh, dw, dh);
  } else {
    diamond(point.x, point.y, ISO.W * zoom, h, layer > 0 ? "#8a7545" : "#2f5d3a", "#0003");
  }
  ctx.globalAlpha = prev;
}


function drawBarge(barge) {
  const point = ws(barge.x, barge.y);

  diamond(
    point.x, point.y,
    ISO.W * zoom * barge.size,
    ISO.H * zoom * barge.size,
    "#f59e0b55",
    "#f59e0b"
  );

  ctx.fillStyle = "#fff";
  ctx.font = `bold ${Math.max(10, 16 * zoom * 2)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("BARCAÇA", point.x, point.y + 4);
  bar(point.x, point.y + 12, barge.hp / barge.maxHp, "#38bdf8");
}

function drawMech(player) {
  const point = ws(player.x, player.y, player.z);
  const size = 256 * zoom;
  const type = MECHS[player.mechType] ? player.mechType : "Watcher";

  ell(player.x, player.y, 0.85, player.color + "44");

  ctx.globalAlpha = player.wreck > 0 ? 0.4 : 1;
  const image = img(MECHS[type].sprite);

  if (image) {
    ctx.drawImage(image, point.x - size / 2, point.y - size * 0.75, size, size);
  } else {
    diamond(point.x, point.y - size * 0.25, size * 0.6, size * 0.5, player.color, "#fff");
  }

  ctx.globalAlpha = 1;

  const target = ws(
    player.x + Math.cos(player.aim) * 1.3,
    player.y + Math.sin(player.aim) * 1.3,
    player.z + 0.3
  );

  ctx.strokeStyle = player.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(point.x, point.y - ISO.Z * zoom * 0.3);
  ctx.lineTo(target.x, target.y);
  ctx.stroke();
  ctx.lineWidth = 1;

  ctx.fillStyle = player.color;
  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${player.name} • ${type}`, point.x, point.y - size * 0.8);
  bar(point.x, point.y - size * 0.78, player.hp / player.maxHp, "#22c55e");
}

function drawPilot(player) {
  if (player.respawn > 0) return;

  ell(player.pilot.x, player.pilot.y, 0.25, "#fbbf24");
  const point = ws(player.pilot.x, player.pilot.y, 0.3);

  ctx.beginPath();
  ctx.arc(point.x, point.y, 7, 0, 6.29);
  ctx.fillStyle = player.color;
  ctx.fill();
  bar(point.x, point.y - 18, player.pilot.hp / PMAX, "#fbbf24");
}

function render() {
  ctx.fillStyle = "#0a0f1a";
  ctx.fillRect(0, 0, cv.width, cv.height);

  if (!MAP || !VIEW) return;

  const me = myP();
  const actor = me && actorV(me);

  if (actor) {
    cam.x += (actor.x - cam.x) * 0.12;
    cam.y += (actor.y - cam.y) * 0.12;
  }

  const kx = ISO.W / 2 * zoom;
  const ky = ISO.H / 2 * zoom;
  const cameraSum = cam.x + cam.y;
  const cameraDiff = cam.x - cam.y;
  const sumMin = Math.floor(cameraSum - cv.height / 2 / ky) - 3;
  const sumMax = Math.ceil(cameraSum + cv.height / 2 / ky) + 12;
  const diffMin = Math.floor(cameraDiff - cv.width / 2 / kx) - 3;
  const diffMax = Math.ceil(cameraDiff + cv.width / 2 / kx) + 3;

  const visible = (x, y) => {
    const sum = x + y;
    const diff = x - y;
    return sum >= sumMin && sum <= sumMax && diff >= diffMin && diff <= diffMax;
  };

  for (let sum = Math.max(0, sumMin); sum <= Math.min(MAP.w + MAP.h - 2, sumMax); sum++) {
    const xMin = Math.max(0, sum - MAP.h + 1, Math.ceil((sum + diffMin) / 2));
    const xMax = Math.min(MAP.w - 1, sum, Math.floor((sum + diffMax) / 2));

    for (let x = xMin; x <= xMax; x++) {
      const tile = MAP.layers[0][sum - x][x];
      if (tile) drawTile(tile, x, sum - x, 0, 1);
    }
  }

  const list = [];
  const actorSum = actor ? actor.x + actor.y : 0;
  const actorDiff = actor ? actor.x - actor.y : 0;

  for (const tile of MAP.upper) {
    if (!visible(tile.x, tile.y)) continue;

    const fade = actor
      && tile.d > actorSum + 0.5
      && tile.d - actorSum < 4
      && Math.abs((tile.x - tile.y) - actorDiff) < 2.5;

    list.push([tile.d, () => drawTile(tile.c, tile.x, tile.y, tile.z, fade ? 0.35 : 1)]);
  }

  VIEW.barges.forEach(barge => list.push([dk(barge.x, barge.y), () => drawBarge(barge)]));

  VIEW.carcasses.forEach(carcass =>
    list.push([dk(carcass.x, carcass.y), () => ell(carcass.x, carcass.y, 0.4, "#94a3b8")])
  );

  VIEW.pickups.forEach(pickup =>
    list.push([dk(pickup.x, pickup.y), () => ell(pickup.x, pickup.y, 0.3, "#c084fc")])
  );

  VIEW.blocks?.forEach(block =>
    list.push([dk(block.x, block.y), () => ell(block.x, block.y, 0.55, "#84cc16")])
  );

  VIEW.mines?.forEach(mine =>
    list.push([dk(mine.x, mine.y), () => ell(mine.x, mine.y, 0.25, "#fb923c")])
  );

  VIEW.enemies.forEach(enemy => list.push([dk(enemy.x, enemy.y), () => {
    ell(enemy.x, enemy.y, enemy.w / 2, enemy.type === "gunner" ? "#a855f7" : "#ef4444");
    const point = ws(enemy.x, enemy.y, 0.5);
    bar(point.x, point.y - 14, enemy.hp / enemy.maxHp, "#f87171");

    if (enemy.capturedBy) {
      ctx.fillStyle = "#7dd3fc";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("CAPTURADO", point.x, point.y - 20);
    }
  }]));

  VIEW.players.forEach(player => {
    list.push([dk(player.x, player.y), () => drawMech(player)]);
    if (player.mode === "pilot") {
      list.push([dk(player.pilot.x, player.pilot.y), () => drawPilot(player)]);
    }
  });

  VIEW.shots.forEach(shot => list.push([dk(shot.x, shot.y), () => {
    const point = ws(shot.x, shot.y, 0.35);
    ctx.beginPath();
    ctx.arc(point.x, point.y, shot.f === "bomb" ? 7 : 4, 0, 6.29);
    ctx.fillStyle = shot.f === "e" ? "#f472b6" : shot.f === "bomb" ? "#fb923c" : "#fde047";
    ctx.fill();
  }]));

  list.sort((a, b) => a[0] - b[0]).forEach(item => item[1]());

  if (S.dev.hitbox) {
    VIEW.players.forEach(player => {
      const active = actorV(player);
      const width = player.mode === "mecha" ? MW : PW;
      const point = ws(active.x, active.y);
      diamond(point.x, point.y, ISO.W * zoom * width, ISO.H * zoom * width, null, "#0f0");
    });

    VIEW.enemies.forEach(enemy => {
      const point = ws(enemy.x, enemy.y);
      diamond(point.x, point.y, ISO.W * zoom * enemy.w, ISO.H * zoom * enemy.w, null, "#f00");
    });
  }

  if (S.dev.nums) {
    VIEW.fx.forEach(effect => {
      const point = ws(effect.x, effect.y, 1 + (0.8 - effect.t));
      ctx.fillStyle = effect.c;
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(effect.txt, point.x, point.y);
    });
  }

  if (S.dev.fps) {
    ctx.fillStyle = "#0f0";
    ctx.font = "12px monospace";
    ctx.textAlign = "left";
    ctx.fillText(
      `FPS ${fps | 0} | inimigos ${VIEW.enemies.length} | tiros ${VIEW.shots.length} | mapa ${MAP.w}x${MAP.h} | ${MAP.biomeName}`,
      10, cv.height - 10
    );
  }
}

// ===================== HUD =====================
let hudT = 0;

function updateHUD(dt) {
  if ((hudT -= dt) > 0) return;
  hudT = 0.15;

  const view = VIEW;
  if (!view) return;

  const phaseText = {
    prep: `próxima em ${Math.ceil(view.timer)}s`,
    combat: `inimigos: ${view.left}`,
    vote: `votação ${Math.ceil(view.timer)}s`
  }[view.phase];

  $("h-wave").textContent = `Onda ${view.wave} • ${phaseText}`;
  $("h-loot").textContent = `📦 ${view.loot.mat} Mat • 📘 ${view.loot.diag} Diag`;

  const me = myP();

  if (me) {
    const barge = view.barges[me.base];
    const mechName = me.mechType || "Watcher";

    $("h-me").textContent = me.respawn > 0
      ? `Renascendo em ${Math.ceil(me.respawn)}s`
      : `${mechName} ${me.hp}/${me.maxHp} • Traje ${me.pilot.hp}/${PMAX} • Barcaça ${barge.hp}/${barge.maxHp}`;

    const active = actorV(me);
    let promptText = "";

    if (me.mode === "pilot" && Math.hypot(me.x - active.x, me.y - active.y) < 2.2 && !me.wreck) {
      promptText = "[F] Entrar no mecha";
    } else if (towIds(me).length) {
      promptText = "[Q] Soltar carcaça(s)";
    } else if (me.mode === "mecha" && view.carcasses.some(item =>
      Math.hypot(item.x - active.x, item.y - active.y) < 2
    )) {
      promptText = "[E] Rebocar carcaça";
    } else if (
      Math.abs(active.x - barge.x) < barge.size / 2 + 1.6
      && Math.abs(active.y - barge.y) < barge.size / 2 + 1.6
    ) {
      promptText = "[E] Terminal da barcaça";
    }

    $("prompt").textContent = promptText;
    $("prompt").classList.toggle("hide", !promptText);
  }

  const showVote = view.phase === "vote" && !view.votes[S.myId] && !ended;
  $("vote").classList.toggle("hide", !showVote);

  if (showVote) {
    $("vote-info").textContent =
      `Ondas sobrevividas: ${view.wave}. Quem extrair leva sua parte do loot. Tempo: ${Math.ceil(view.timer)}s`
      + (S.isHost ? " — Você é o host: se extrair, a partida acaba para todos." : "");
  }

  if (!$("term").classList.contains("hide")) renderTerminal();
}

function renderTerminal() {
  const view = VIEW;
  if (!view) return;

  $("term-info").textContent =
    `Materiais: ${view.loot.mat} • Diagramas coletados: ${view.loot.diag}`;

  $("term-list").innerHTML = UPG.map(upgrade => {
    const level = view.lvl[upgrade.id] || 0;
    const parts = view.parts[upgrade.id] || 0;

    if (!level) {
      return `<div class="card">🔒 <b>${upgrade.name}</b><br>${
        upgrade.parts ? `Raro: partes ${parts}/${upgrade.parts}` : "Encontre um diagrama"
      }</div>`;
    }

    return `<div class="card"><b>${upgrade.name}</b> Nv.${level}/${upgrade.max}<br>${upgrade.desc}<br>${
      level < upgrade.max
        ? `<button data-buy="${upgrade.id}" ${view.loot.mat < upgrade.cost * level ? "disabled" : ""}>${upgrade.cost * level} Mat</button>`
        : "MÁX"
    }</div>`;
  }).join("");
}

// ===================== LOOP E INICIALIZAÇÃO =====================
let last = performance.now();
let sendT = 0;
let broadcastT = 0;

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fps = fps * 0.95 + (1 / Math.max(dt, 0.001)) * 0.05;

  if (MAP && !ended) {
    const input = readInput();

    if (S.isHost && G) {
      const me = G.players.find(player => player.id === S.myId);

      if (me) {
        const old = me.input || {};
        me.input = { ...input };

        for (const key of EDGES) {
          me.input[key] = !!(input[key] || old[key]);
        }
      }

      clearEdges();

      if (!(S.paused && !S.online) && !G.over) update(dt);

      VIEW = pack();

      if (S.online && (broadcastT += dt) > 0.05) {
        broadcastT = 0;
        Net.broadcast(VIEW);
      }
    } else if (!S.isHost && (sendT += dt) > 0.033) {
      sendT = 0;
      Net.sendInput(input);
      clearEdges();
    }
  }

  if (MAP) {
    render();
    updateHUD(dt);
  }

  requestAnimationFrame(frame);
}

function resize() {
  cv.width = innerWidth;
  cv.height = innerHeight;
  zoom = Math.max(0.25, Math.min(0.6, Math.min(cv.width, cv.height) / 1500));
}

addEventListener("resize", resize);

(async function boot() {
  resize();
  buildUI();

  try {
    BASE = await loadBase();

    const metrics = BASE.isoMetrics || {};
    ISO.W = metrics.ISO_W ?? ISO.W;
    ISO.H = metrics.ISO_H ?? ISO.H;
    ISO.Z = metrics.LAYER_STEP_Y ?? ISO.Z;
    ISO.OFF = metrics.spriteOffsetY ?? ISO.OFF;
  } catch (error) {
    alert(error.message);
  }

  requestAnimationFrame(frame);
})();
