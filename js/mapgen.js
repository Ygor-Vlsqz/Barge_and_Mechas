import { R, nearBase } from "./utils.js";

// Ajuste os nomes caso seus sprites sejam diferentes
const T = {
  ground: "grass_block",
  water: "grass_water",          // borda reta (lado com terra)
  waterFull: "water",            // água interna (troque se não existir)
  convex: "grass_waterConvex",   // canto externo
  concave: "grass_waterConcave", // canto interno
  river: "grass_river",
  bend: "grass_riverBend",
  bridge: "grass_riverBridge",
  waterRiver: "grass_waterRiver",
  mountain: "grass_block"        // bloco empilhado nas montanhas
};

const DIRS = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
const MAX_LEVELS = 4;

export async function loadBase() {
  const w = 100, h = 60;
  const layers = Array.from({ length: MAX_LEVELS }, () =>
    Array.from({ length: h }, () => Array(w).fill(null))
  );
  const inside = (x, y) => x >= 0 && x < w && y >= 0 && y < h;

  // 1. Máscara de água (lagos)
  const water = Array.from({ length: h }, () => Array(w).fill(false));
  for (let i = 0; i < 6; i++) {
    const lx = 6 + R() * (w - 12), ly = 6 + R() * (h - 12), r = 2.5 + R() * 3;
    if (nearBase(lx, ly, 14)) continue;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (Math.hypot(x - lx, y - ly) < r) water[y][x] = true;
  }

  // 2. Rio (só passos ortogonais, para os tiles encaixarem)
  const river = gerarRio(w, h);
  const riverSet = new Set(river.map(([x, y]) => `${x},${y}`));
  const isRiver = (x, y) => riverSet.has(`${x},${y}`);
  const isWater = (x, y) => inside(x, y) && water[y][x];

  // 3. Chão + autotile da água
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      layers[0][y][x] = water[y][x] && !isRiver(x, y)
        ? autotileAgua(x, y, isWater)
        : { base: T.ground, dir: "S" };
    }
  }

  // 4. Tiles do rio
  river.forEach(([x, y], i) => {
    if (water[y][x]) return; // dentro do lago o rio some
    const prev = river[i - 1], next = river[i + 1];
    const touchesLake = Object.values(DIRS).some(([dx, dy]) => isWater(x + dx, y + dy));
    layers[0][y][x] = touchesLake
      ? { base: T.waterRiver, dir: dirTo([x, y], prev || next) }
      : tileRio([x, y], prev, next);
  });

  // 5. Pontes apenas em trechos retos
  const retos = river.filter(([x, y]) => layers[0][y][x]?.base === T.river);
  for (let i = 0; i < Math.max(1, Math.floor(retos.length / 30)); i++) {
    const [bx, by] = retos[Math.floor(R() * retos.length)];
    layers[0][by][bx] = { ...layers[0][by][bx], base: T.bridge };
  }

  // 6. Montanhas com níveis sobrepostos
  gerarMontanhas(layers, w, h, (x, y) => water[y][x] || isRiver(x, y));

  return {
    w, h, layers,
    isoMetrics: { ISO_W: 220, ISO_H: 110, LAYER_STEP_Y: 114, spriteOffsetY: 118 }
  };
}

function autotileAgua(x, y, isWater) {
  const land = d => !isWater(x + DIRS[d][0], y + DIRS[d][1]);
  const n = land("N"), e = land("E"), s = land("S"), wv = land("W");

  // canto externo: duas laterais vizinhas com terra
  if (n && e) return { base: T.convex, dir: "N" };
  if (e && s) return { base: T.convex, dir: "E" };
  if (s && wv) return { base: T.convex, dir: "S" };
  if (wv && n) return { base: T.convex, dir: "W" };
  // borda reta
  if (n) return { base: T.water, dir: "N" };
  if (e) return { base: T.water, dir: "E" };
  if (s) return { base: T.water, dir: "S" };
  if (wv) return { base: T.water, dir: "W" };
  // canto interno: só a diagonal tem terra
  if (!isWater(x + 1, y - 1)) return { base: T.concave, dir: "N" };
  if (!isWater(x + 1, y + 1)) return { base: T.concave, dir: "E" };
  if (!isWater(x - 1, y + 1)) return { base: T.concave, dir: "S" };
  if (!isWater(x - 1, y - 1)) return { base: T.concave, dir: "W" };
  return { base: T.waterFull, dir: "S" };
}

function dirTo([x, y], p) {
  if (!p) return "S";
  const dx = p[0] - x, dy = p[1] - y;
  return dx > 0 ? "E" : dx < 0 ? "W" : dy < 0 ? "N" : "S";
}

function tileRio(c, prev, next) {
  const a = dirTo(c, prev), b = dirTo(c, next);
  const vert = d => d === "N" || d === "S";
  if (!prev || !next || vert(a) === vert(b)) {
    return { base: T.river, dir: vert(a) ? "N" : "E" };
  }
  const key = [a, b].sort().join("");
  const bendDir = { EN: "N", ES: "E", SW: "S", NW: "W" }[key];
  return { base: T.bend, dir: bendDir };
}

function gerarRio(w, h) {
  const horizontal = R() < 0.5;
  let x = horizontal ? 0 : Math.floor(w * (0.2 + R() * 0.6));
  let y = horizontal ? Math.floor(h * (0.2 + R() * 0.6)) : 0;
  const path = [[x, y]];
  let lastSide = 0;

  while (horizontal ? x < w - 1 : y < h - 1) {
    if (R() < 0.3) {
      // desvio lateral, evitando ir e voltar em seguida
      const side = lastSide || (R() < 0.5 ? -1 : 1);
      const nx = horizontal ? x : x + side;
      const ny = horizontal ? y + side : y;
      if (nx > 1 && nx < w - 2 && ny > 1 && ny < h - 2) {
        x = nx; y = ny; lastSide = side;
        path.push([x, y]);
        continue;
      }
    }
    lastSide = 0;
    horizontal ? x++ : y++;
    path.push([x, y]);
  }
  return path;
}

function gerarMontanhas(layers, w, h, bloqueado) {
  const height = Array.from({ length: h }, () => Array(w).fill(0));

  for (let i = 0; i < 5; i++) {
    const cx = R() * w, cy = R() * h, r = 4 + R() * 5;
    const peak = 1 + Math.floor(R() * (MAX_LEVELS - 1));
    if (nearBase(cx, cy, 16)) continue;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d < r) height[y][x] = Math.max(height[y][x], Math.ceil(peak * (1 - d / r)));
      }
  }

  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (bloqueado(x, y) || nearBase(x, y, 6)) continue;
      for (let L = 1; L <= height[y][x] && L < MAX_LEVELS; L++) {
        layers[L][y][x] = { base: T.mountain, dir: "S" };
      }
    }
}
