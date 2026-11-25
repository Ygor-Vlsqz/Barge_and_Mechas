export async function loadBase() {
  const r = await fetch(encodeURI("./Basic Start.json"));
  if (!r.ok) throw new Error("Basic Start.json não encontrado");
  return r.json();
}

// RNG com seed: todos os jogadores geram o mesmo mapa
function rng(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function analyze(base) {
  const cells = [], spawns = [];
  let barge = null, maxX = 0, maxY = 0;
  base.layers.forEach((L, z) => L.forEach((row, y) => row.forEach((c, x) => {
    if (!c) return;
    const s = c.size || 1;
    maxX = Math.max(maxX, x + s); maxY = Math.max(maxY, y + s);
    if (c.base === "mech_Watcher") spawns.push({ x: x + s / 2, y: y + s / 2, s });
    else if (c.base === "spawn_barge") barge = { x: x + s / 2, y: y + s / 2 };
    else if (!c.isSpawn) cells.push({ x, y, z, c });
  })));
  return { cells, spawns, barge: barge || { x: maxX / 2, y: maxY / 2 }, bw: maxX, bh: maxY };
}

export function generateMap(base, players, seed) {
  const R = rng(seed), A = analyze(base), two = players > 4;
  const w = two ? 100 : 60, h = 60, LC = Math.max(5, base.layers.length);
  const layers = Array.from({ length: LC }, () => Array.from({ length: h }, () => Array(w).fill(null)));
  const reserved = new Set(), K = (x, y) => x + "," + y;
  const centers = two ? [[25, 30], [75, 30]] : [[30, 30]];

  const bases = centers.map(([cx, cy]) => {
    const ox = cx - Math.floor(A.bw / 2), oy = cy - Math.floor(A.bh / 2);
    A.cells.forEach(({ x, y, z, c }) => {
      layers[z][oy + y][ox + x] = { base: c.base, dir: c.dir || "S" };
      reserved.add(K(ox + x, oy + y));
    });
    const foot = (fx, fy, s) => { for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) reserved.add(K(Math.floor(fx) + dx, Math.floor(fy) + dy)); };
    const spawns = A.spawns.map(s => { foot(ox + s.x - s.s / 2, oy + s.y - s.s / 2, s.s); return { x: ox + s.x, y: oy + s.y }; });
    const bx = ox + A.barge.x, by = oy + A.barge.y;
    foot(bx - 3, by - 3, 6); // espaço para a barcaça crescer
    return { cx, cy, spawns, barge: { x: bx, y: by } };
  });

  const nearBase = (x, y, r) => bases.some(b => Math.hypot(x - b.cx, y - b.cy) < r);
  const D = ["N", "E", "S", "W"];

  // Lagos
  for (let i = 0; i < (two ? 10 : 6); i++) {
    const lx = 4 + R() * (w - 8), ly = 4 + R() * (h - 8), r = 2 + R() * 3;
    if (nearBase(lx, ly, 14)) continue;
    for (let y = Math.floor(ly - r); y <= ly + r; y++)
      for (let x = Math.floor(lx - r); x <= lx + r; x++)
        if (x >= 0 && y >= 0 && x < w && y < h && Math.hypot(x - lx, y - ly) < r)
          layers[0][y][x] = { base: "grass_water", dir: "S" };
  }

  // Preenche só o que não é da base
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (reserved.has(K(x, y))) continue;
    if (!layers[0][y][x]) layers[0][y][x] = { base: "grass_block", dir: "S" };
    if (layers[0][y][x].base !== "grass_block" || nearBase(x, y, 8)) continue;
    const r = R();
    if (r < 0.03) layers[1][y][x] = { base: "rocks", dir: D[R() * 4 | 0] };
    else if (r < 0.045) layers[1][y][x] = { base: "fence_wood", dir: D[R() * 4 | 0] };
    else if (r < 0.05) {
      layers[1][y][x] = { base: "building_center", dir: "S" };
      layers[2][y][x] = { base: "roof_slantCornerBeige", dir: D[R() * 4 | 0] };
    }
  }

  const solid = new Set(), upper = [];
  layers.forEach((L, z) => L.forEach((row, y) => row.forEach((c, x) => {
    if (!c) return;
    if (z === 0) { if (/^grass_(water|river(?!Bridge))/.test(c.base)) solid.add(K(x, y)); }
    else { upper.push({ x, y, z, c }); if (!/stairs|slope/.test(c.base)) solid.add(K(x, y)); }
  })));

  return { w, h, layers, solid, upper, bases };
}
