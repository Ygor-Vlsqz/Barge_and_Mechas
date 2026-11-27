/* mapgen.js — gerador procedural: biomas, níveis, paredões, rampas, lagos, rios e cavernas */
(function (root) {
  'use strict';

  const MAX_LAYERS = 5, MAX_H = MAX_LAYERS - 1;
  // 0:+gx(↘) 1:+gy(↙) 2:-gx(↖) 3:-gy(↗)
  const OFF = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const opp = d => (d + 2) & 3, bit = d => 1 << d;

  // ===== Tabelas validadas no editor =====
  const DIR4 = ['N', 'E', 'S', 'W']; // End: lado conectado | Slope: lado que desce
  const RIVER_BY_MASK = {
    5: ['grass_river', 'N'], 10: ['grass_river', 'E'],
    3: ['grass_riverBend', 'N'], 6: ['grass_riverBend', 'E'], 12: ['grass_riverBend', 'S'], 9: ['grass_riverBend', 'W'],
    11: ['grass_riverSplit', 'N'], 7: ['grass_riverSplit', 'E'], 14: ['grass_riverSplit', 'S'], 13: ['grass_riverSplit', 'W'],
    15: ['grass_riverCrossing', 'N'],
    1: ['grass_riverEnd', 'N'], 2: ['grass_riverEnd', 'E'], 4: ['grass_riverEnd', 'S'], 8: ['grass_riverEnd', 'W'],
  };
  const WATER_EDGE  = { 3: 'N', 0: 'E', 1: 'S', 2: 'W' };  // lado da terra
  const WATER_RIVER = { 3: 'E', 0: 'S', 1: 'W', 2: 'N' };  // lado por onde o rio entra
  const CONCAVE = { 12: 'N', 9: 'E', 3: 'S', 6: 'W' };     // terra em 2 lados ortogonais
  const CONVEX  = { '-1,-1': 'N', '1,-1': 'E', '1,1': 'S', '-1,1': 'W' }; // terra só na diagonal

  // ===== Biomas =====
  // levels: níveis possíveis do terreno | clamp: true = só rampas, false = permite paredões
  const BIOMES = {
    planicie_lagos:     { nome: 'Planície de Lagos',    levels: [0,0,0,0,1],     scale: .035, clamp: true,  slope: .9,  lakes: 7,  lakeR: [3,7], rivers: 2, trib: .3, bridge: .10, caves: 0, pal: 'grass' },
    colinas_rios:       { nome: 'Colinas e Rios',       levels: [0,0,1,1,2,3],   scale: .05,  clamp: true,  slope: .8,  lakes: 2,  lakeR: [3,5], rivers: 5, trib: .6, bridge: .12, caves: 0, pal: 'grass' },
    pedregal:           { nome: 'Pedregal e Paredões',  levels: [0,1,1,2,3,3,4], scale: .07,  clamp: false, slope: .25, lakes: 1,  lakeR: [2,4], rivers: 1, trib: .2, bridge: .05, caves: 2, pal: 'rock'  },
    canions_rios:       { nome: 'Cânions e Rios',       levels: [0,0,0,2,3,3],   scale: .045, clamp: false, slope: .15, lakes: 1,  lakeR: [3,5], rivers: 5, trib: .5, bridge: .15, caves: 1, pal: 'sand'  },
    montanhas_cavernas: { nome: 'Montanhas e Cavernas', levels: [0,0,1,2,3,4,4], scale: .04,  clamp: true,  slope: .6,  lakes: 1,  lakeR: [2,4], rivers: 2, trib: .3, bridge: .05, caves: 6, pal: 'rock'  },
    pantano:            { nome: 'Pântano',              levels: [0],             scale: .06,  clamp: true,  slope: 0,   lakes: 14, lakeR: [2,4], rivers: 8, trib: .8, bridge: .20, caves: 0, pal: 'dirt'  },
    planalto:           { nome: 'Planaltos',            levels: [0,0,2,2,2,3],   scale: .03,  clamp: false, slope: .5,  lakes: 4,  lakeR: [3,6], rivers: 3, trib: .4, bridge: .10, caves: 2, pal: 'grass' },
  };

  // Lista de candidatos: usa o 1º que existir em availableTiles; o último é o fallback
  const PALETTES = {
    grass: { top: ['grass_block'], fill: ['dirt_block', 'grass_block'], slope: ['grass_slope'], cave: ['dirt_center', 'grass_center'] },
    rock:  { top: ['stone_block', 'grass_block'], fill: ['stone_block', 'grass_block'], slope: ['stone_slope', 'grass_slope'], cave: ['stone_center', 'grass_center'] },
    sand:  { top: ['sand_block', 'grass_block'], fill: ['sand_block', 'dirt_block', 'grass_block'], slope: ['sand_slope', 'grass_slope'], cave: ['sand_center', 'grass_center'] },
    dirt:  { top: ['dirt_block', 'grass_block'], fill: ['dirt_block', 'grass_block'], slope: ['dirt_slope', 'grass_slope'], cave: ['dirt_center', 'grass_center'] },
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function makeNoise(rng) {
    const g = new Float32Array(256 * 256);
    for (let i = 0; i < g.length; i++) g[i] = rng();
    const v = (x, y) => g[((y & 255) << 8) + (x & 255)];
    const s = t => t * t * (3 - 2 * t);
    const n = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = s(x - xi), yf = s(y - yi);
      const a = v(xi, yi), b = v(xi + 1, yi), c = v(xi, yi + 1), d = v(xi + 1, yi + 1);
      return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
    };
    return (x, y) => {
      let t = 0, amp = 1, f = 1, sum = 0;
      for (let o = 0; o < 4; o++) { t += n(x * f, y * f) * amp; sum += amp; amp *= .5; f *= 2; }
      return t / sum;
    };
  }

  function generate(opts = {}) {
    const players = Math.max(1, opts.players | 0 || 1);
    const seed = (opts.seed ?? Math.floor(Math.random() * 2 ** 31)) >>> 0;
    const rng = mulberry32(seed);
    const R = (a, b) => a + Math.floor(rng() * (b - a + 1));
    const keys = Object.keys(BIOMES);
    const biome = BIOMES[opts.biome] ? opts.biome : keys[Math.floor(rng() * keys.length)];
    const B = BIOMES[biome];

    // Tamanho: mínimo 20 + 20*jogadores; um dos eixos pode ser até 50% maior
    const base = 20 + 20 * players;
    let W = base, H = base;
    const ext = Math.round(base * rng() * .5);
    if (rng() < .5) W += ext; else H += ext;
    if (opts.width) W = Math.max(base, opts.width | 0);
    if (opts.height) H = Math.max(base, opts.height | 0);

    const N = W * H, AREA_K = N / 2500;
    const idx = (x, y) => y * W + x;
    const inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
    const okCell = (x, y) => x > 0 && y > 0 && x < W - 1 && y < H - 1;

    const hgt = new Int8Array(N), lake = new Uint8Array(N), riv = new Uint8Array(N);
    const rslope = new Uint8Array(N), bridge = new Uint8Array(N), reserved = new Uint8Array(N);
    const slope = new Int8Array(N).fill(-1), cave = new Int8Array(N).fill(-1);
    const mouth = new Map();
    const noise = makeNoise(rng);

    // ---------- 1. Relevo ----------
    const raw = new Float32Array(N); let mn = 1, mx = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = noise(x * B.scale, y * B.scale); raw[idx(x, y)] = v;
      if (v < mn) mn = v; if (v > mx) mx = v;
    }
    const L = B.levels;
    for (let i = 0; i < N; i++) {
      const t = (raw[i] - mn) / (mx - mn || 1);
      hgt[i] = Math.min(MAX_H, L[Math.min(L.length - 1, Math.floor(t * L.length))]);
    }
    // remove pilares e buracos isolados
    for (let p = 0; p < 3; p++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = idx(x, y), cnt = {}; let same = 0;
      for (const [ox, oy] of OFF) {
        if (!inB(x + ox, y + oy)) continue;
        const hh = hgt[idx(x + ox, y + oy)];
        if (hh === hgt[c]) same++;
        cnt[hh] = (cnt[hh] || 0) + 1;
      }
      if (same < 2) { let best = hgt[c], bc = -1; for (const k in cnt) if (cnt[k] > bc) { bc = cnt[k]; best = +k; } hgt[c] = best; }
    }
    // biomas suaves: diferença máx. 1 entre vizinhos
    if (B.clamp) {
      let ch = true;
      while (ch) {
        ch = false;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (const [ox, oy] of OFF) {
          if (!inB(x + ox, y + oy)) continue;
          const c = idx(x, y), n = idx(x + ox, y + oy);
          if (hgt[c] > hgt[n] + 1) { hgt[c] = hgt[n] + 1; ch = true; }
        }
      }
    }

    // ---------- 2. Cavernas (chão em f, vazio em f+1, teto em f+2..h) ----------
    function tunnel(x, y, d, f) {
      const cells = [], len = R(8, 24);
      for (let s = 0; s < len; s++) {
        if (!okCell(x, y)) break;
        const c = idx(x, y);
        if (hgt[c] < f + 2) break;
        if (cave[c] < 0) { cave[c] = f; cells.push(c); }
        if (rng() < .35) { // alarga o túnel
          const p = (d + (rng() < .5 ? 1 : 3)) & 3, px = x + OFF[p][0], py = y + OFF[p][1];
          if (okCell(px, py) && hgt[idx(px, py)] >= f + 2 && cave[idx(px, py)] < 0) { cave[idx(px, py)] = f; cells.push(idx(px, py)); }
        }
        if (rng() < .2) d = (d + (rng() < .5 ? 1 : 3)) & 3;
        x += OFF[d][0]; y += OFF[d][1];
      }
      if (cells.length < 4) { cells.forEach(c => cave[c] = -1); return false; }
      return true;
    }
    const nCaves = Math.round(B.caves * AREA_K);
    for (let t = 0, made = 0; t < nCaves * 40 && made < nCaves; t++) {
      const x = R(2, W - 3), y = R(2, H - 3), e = idx(x, y);
      if (cave[e] >= 0 || reserved[e]) continue;
      const f = hgt[e], d = R(0, 3), m = idx(x + OFF[d][0], y + OFF[d][1]);
      if (hgt[m] < f + 2 || cave[m] >= 0) continue;
      if (tunnel(x + OFF[d][0], y + OFF[d][1], d, f)) { reserved[e] = 1; made++; }
    }

    // ---------- 3. Lagos ----------
    const isL = (x, y) => inB(x, y) && lake[idx(x, y)] === 1;
    function lakeTile(x, y) {
      let m = 0;
      for (let d = 0; d < 4; d++) if (!isL(x + OFF[d][0], y + OFF[d][1])) m |= bit(d);
      const dl = [];
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) if (!isL(x + sx, y + sy)) dl.push([sx, sy]);
      if (m === 0) {
        if (!dl.length) return ['water_center', 'N'];
        if (dl.length === 1) return ['grass_waterConvex', CONVEX[dl[0].join(',')]];
        return null;
      }
      if ((m & (m - 1)) === 0) { // borda simples
        const d = Math.log2(m) | 0, [lx, ly] = OFF[d];
        for (const [sx, sy] of dl) if (lx !== 0 ? sx !== lx : sy !== ly) return null;
        return ['grass_water', WATER_EDGE[d], d];
      }
      if (CONCAVE[m]) { // canto externo
        let cx = 0, cy = 0;
        for (let d = 0; d < 4; d++) if (m & bit(d)) { cx += OFF[d][0]; cy += OFF[d][1]; }
        for (const [sx, sy] of dl) if (sx === -cx && sy === -cy) return null;
        return ['grass_waterConcave', CONCAVE[m]];
      }
      return null;
    }
    function cleanLakes() {
      let ch = true;
      while (ch) {
        ch = false;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const c = idx(x, y);
          if (lake[c] && !lakeTile(x, y)) { lake[c] = 0; ch = true; }
        }
      }
    }
    const nLakes = B.lakes ? Math.max(1, Math.round(B.lakes * AREA_K)) : 0;
    for (let k = 0; k < nLakes; k++) for (let t = 0; t < 30; t++) {
      const r = R(B.lakeR[0], B.lakeR[1]), cx = R(r + 2, W - r - 3), cy = R(r + 2, H - r - 3);
      const c0 = idx(cx, cy);
      if (lake[c0] || cave[c0] >= 0) continue;
      const lh = hgt[c0], rx = r * (.7 + rng() * .6), ry = r * (.7 + rng() * .6), o = rng() * 100;
      let cnt = 0;
      for (let y = cy - r - 1; y <= cy + r + 1; y++) for (let x = cx - r - 1; x <= cx + r + 1; x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy > .75 + .5 * noise(x * .25 + o, y * .25)) continue;
        if (!okCell(x, y)) continue;
        const c = idx(x, y);
        if (hgt[c] !== lh || cave[c] >= 0) continue;
        let ok = true;
        for (let j = -1; j <= 1 && ok; j++) for (let i = -1; i <= 1; i++) {
          if (!inB(x + i, y + j)) continue;
          const n = idx(x + i, y + j);
          if (hgt[n] < lh || cave[n] >= 0) { ok = false; break; }
        }
        if (ok) { lake[c] = 1; cnt++; }
      }
      if (cnt >= 4) break;
    }
    cleanLakes();

    // ---------- 4. Rios (traçados de trás pra frente: da foz até a nascente) ----------
    function freeFor(n, from) {
      if (lake[n] || riv[n] || cave[n] >= 0 || reserved[n]) return false;
      const x = n % W, y = (n / W) | 0;
      for (const [ox, oy] of OFF) {
        if (!inB(x + ox, y + oy)) continue;
        const m = idx(x + ox, y + oy);
        if (m !== from && (riv[m] || lake[m])) return false;
      }
      return true;
    }
    function walk(s, fromDir, heading, minLen) {
      const path = [s]; riv[s] |= bit(fromDir);
      let cur = s, from = fromDir;
      const len = R(minLen, minLen * 4);
      for (let step = 0; step < len; step++) {
        const cx = cur % W, cy = (cur / W) | 0;
        const perp = [(heading + 1) & 3, (heading + 3) & 3];
        if (rng() < .5) perp.reverse();
        const cand = rng() < .7 ? [heading, ...perp] : [...perp, heading];
        let moved = false;
        for (const d of cand) {
          if (d === from) continue;
          const nx = cx + OFF[d][0], ny = cy + OFF[d][1];
          if (!okCell(nx, ny)) continue;
          const n = idx(nx, ny);
          if (!freeFor(n, cur)) continue;
          const dh = hgt[n] - hgt[cur];
          if (dh === 1) { // rampa de rio: precisa ser reta e não pode emendar em outra rampa
            const prev = path[path.length - 2];
            if (from !== opp(d) || path.length < 2 || rslope[prev] || hgt[n] > MAX_H) continue;
            rslope[cur] = from + 1;
          } else if (dh !== 0) continue;
          riv[cur] |= bit(d); riv[n] |= bit(opp(d));
          from = opp(d); heading = d; cur = n; path.push(n); moved = true;
          break;
        }
        if (!moved) break;
      }
      if (path.length < minLen) { path.forEach(p => { riv[p] = 0; rslope[p] = 0; }); return null; }
      return path;
    }
    function branch(path) {
      if (path.length < 6) return;
      for (let t = 0; t < 10; t++) {
        const c = path[R(2, path.length - 3)];
        if (rslope[c] || (riv[c] !== 5 && riv[c] !== 10)) continue;
        const d = riv[c] === 5 ? (rng() < .5 ? 1 : 3) : (rng() < .5 ? 0 : 2);
        const x = c % W + OFF[d][0], y = ((c / W) | 0) + OFF[d][1];
        if (!okCell(x, y)) continue;
        const n = idx(x, y);
        if (!freeFor(n, c) || hgt[n] !== hgt[c]) continue;
        riv[c] |= bit(d);
        if (walk(n, opp(d), d, 5)) return;
        riv[c] &= ~bit(d);
      }
    }
    const lakeEdges = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!lake[idx(x, y)]) continue;
      const t = lakeTile(x, y);
      if (t && t[0] === 'grass_water') lakeEdges.push({ x, y, d: t[2] });
    }
    const nRiv = Math.round(B.rivers * AREA_K);
    for (let k = 0, t = 0; k < nRiv && t < nRiv * 30; t++) {
      let path = null;
      if (lakeEdges.length && rng() < .6) {
        const e = lakeEdges[R(0, lakeEdges.length - 1)], c = idx(e.x, e.y);
        const sx = e.x + OFF[e.d][0], sy = e.y + OFF[e.d][1];
        if (!okCell(sx, sy) || mouth.has(c)) continue;
        const s = idx(sx, sy);
        if (!freeFor(s, c) || hgt[s] !== hgt[c]) continue;
        path = walk(s, opp(e.d), e.d, 6);
        if (path) mouth.set(c, e.d);
      } else { // rio que sai pela borda do mapa
        const side = R(0, 3);
        const [x, y] = [[0, R(2, H - 3)], [R(2, W - 3), 0], [W - 1, R(2, H - 3)], [R(2, W - 3), H - 1]][side];
        const s = idx(x, y);
        if (!freeFor(s, -1)) continue;
        path = walk(s, opp(side), side, 8);
      }
      if (path) { if (rng() < B.trib) branch(path); k++; }
    }
    for (let c = 0; c < N; c++)
      if ((riv[c] === 5 || riv[c] === 10) && !rslope[c] && rng() < B.bridge) bridge[c] = 1;

    // ---------- 5. Rampas de terreno ----------
    if (B.slope > 0) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = idx(x, y);
      if (lake[c] || riv[c] || cave[c] >= 0 || reserved[c]) continue;
      let up = -1, higher = 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + OFF[d][0], ny = y + OFF[d][1];
        if (!inB(nx, ny)) continue;
        const n = idx(nx, ny);
        if (hgt[n] > hgt[c]) {
          higher++;
          if (hgt[n] === hgt[c] + 1 && !lake[n] && !riv[n] && cave[n] < 0) up = d;
        }
      }
      if (higher === 1 && up >= 0 && rng() < B.slope) slope[c] = opp(up);
    }

    // ---------- 6. Monta as camadas ----------
    const P = PALETTES[B.pal];
    const avail = opts.availableTiles ? new Set(opts.availableTiles) : null;
    const pick = l => { if (avail) for (const t of l) if (avail.has(t)) return t; return l[l.length - 1]; };
    const T = { top: pick(P.top), fill: pick(P.fill), slope: pick(P.slope), cave: pick(P.cave) };
    const layers = Array.from({ length: MAX_LAYERS }, () => Array.from({ length: H }, () => Array(W).fill(null)));
    const put = (z, x, y, base, dir = 'S') => { if (z < MAX_LAYERS) layers[z][y][x] = { base, dir }; };

    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = idx(x, y), h = hgt[c];
      if (cave[c] >= 0) {
        const f = cave[c];
        for (let z = 0; z < f; z++) put(z, x, y, T.fill);
        put(f, x, y, T.cave);
        for (let z = f + 2; z < h; z++) put(z, x, y, T.fill);
        put(h, x, y, T.top);
        continue;
      }
      for (let z = 0; z < h; z++) put(z, x, y, T.fill);
      if (lake[c]) {
        const t = mouth.has(c) ? ['grass_waterRiver', WATER_RIVER[mouth.get(c)]] : lakeTile(x, y);
        put(h, x, y, t[0], t[1]);
      } else if (rslope[c]) {
        put(h, x, y, T.top);
        put(h + 1, x, y, 'grass_riverSlope', DIR4[rslope[c] - 1]);
      } else if (riv[c]) {
        let [b, d] = RIVER_BY_MASK[riv[c]];
        if (bridge[c]) b = 'grass_riverBridge';
        else if (b === 'grass_riverEnd' && rng() < .4) b = 'grass_riverEndSquare';
        put(h, x, y, b, d);
      } else if (slope[c] >= 0) {
        put(h, x, y, T.top);
        put(h + 1, x, y, T.slope, DIR4[slope[c]]);
      } else put(h, x, y, T.top);
    }

    return {
      version: 1, gridSize: Math.max(W, H), gridW: W, gridH: H, maxLayers: MAX_LAYERS,
      biome, biomeName: B.nome, seed, players, layers,
    };
  }

  const api = { generate, BIOMES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MapGen = api;
})(typeof window !== 'undefined' ? window : globalThis);

// ===================== FORMATO DO JOGO (ES module) =====================
const MG = globalThis.MapGen;
const isWater = b => /water|river/i.test(b) && !/Bridge/i.test(b);
const isSlope = b => /slope/i.test(b) && !/river/i.test(b);

export async function loadBase(url = "base.json") {
  try { const r = await fetch(url); if (r.ok) return await r.json(); } catch {}
  return {};
}

export function generateMap(base, players, seed, biome) {
  const t = base?.tiles, avail = Array.isArray(t) ? t : t ? Object.keys(t) : undefined;
  const m = MG.generate({ players, seed, biome, availableTiles: avail });
  const W = m.gridW, H = m.gridH, Ls = m.layers, NL = Ls.length;
  const ground = new Float32Array(W * H), solid = new Uint8Array(W * H), upper = [];

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    for (let z = 1; z < NL; z++) { const c = Ls[z][y][x]; if (c) upper.push({ x, y, z, c, d: x + y + 1 + z * 0.01 }); }
    let top = null, g = 0;
    for (let z = 0; z < NL; z++) { // chão = 1º tile com vazio acima (cavernas/rampas)
      const c = Ls[z][y][x];
      if (c && !(z + 1 < NL && Ls[z + 1][y][x])) { top = c; g = isSlope(c.base) ? z - 0.5 : z; break; }
    }
    ground[y * W + x] = g;
    if (!top || isWater(top.base)) solid[y * W + x] = 1;
  }
  upper.sort((a, b) => a.d - b.d); // ordenado uma vez só

  const inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const isSolid = (x, y) => !inB(x, y) || solid[y * W + x] === 1;
  const gz = (x, y) => { const ix = Math.floor(x), iy = Math.floor(y); return inB(ix, iy) ? ground[iy * W + ix] : 0; };

  // Bases: área plana 11x11 sem água, o mais longe possível umas das outras
  let s = (m.seed >>> 0) || 1;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const R = 5, cand = [];
  for (let cy = R + 1; cy < H - R - 1; cy += 2) for (let cx = R + 1; cx < W - R - 1; cx += 2) {
    const h0 = ground[cy * W + cx]; let ok = true;
    for (let y = cy - R; y <= cy + R && ok; y++) for (let x = cx - R; x <= cx + R; x++)
      if (solid[y * W + x] || ground[y * W + x] !== h0) { ok = false; break; }
    if (ok) cand.push([cx, cy]);
  }
  if (!cand.length) cand.push([W >> 1, H >> 1]);
  const nb = Math.max(1, Math.ceil(players / 4)), picked = [cand[Math.floor(rnd() * cand.length)]];
  while (picked.length < nb) {
    let best = cand[0], bd = -1;
    for (const c of cand) {
      const d = Math.min(...picked.map(p => Math.hypot(p[0] - c[0], p[1] - c[1])));
      if (d > bd) { bd = d; best = c; }
    }
    picked.push(best);
  }
  const bases = picked.map(([cx, cy]) => {
    for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) if (inB(x, y)) solid[y * W + x] = 0;
    const bx = cx + 0.5, by = cy + 0.5;
    return { barge: { x: bx, y: by }, spawns: [[4, 0], [-4, 0], [0, 4], [0, -4]].map(([dx, dy]) => ({ x: bx + dx, y: by + dy })) };
  });

  return { w: W, h: H, layers: Ls, upper, solid, ground, isSolid, gz, bases, biome: m.biome, biomeName: m.biomeName, seed: m.seed };
}
