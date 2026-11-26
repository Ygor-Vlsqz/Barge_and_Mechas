import { R, nearBase } from "./utils.js";

/**
 * Carrega o mapa base (tiles de terreno, água, rios, pontes …)
 * Esta função substitui a anterior `loadBase`/`mapgen.js`.
 */
export async function loadBase() {
  const w = 100, h = 60;                     // tamanho do mapa (pode ser ajustado)
  const layers = [
    // camada 0 – solo/água
    Array.from({ length: h }, () => Array.from({ length: w }, () => null)),
    // camada 1 – objetos acima do solo (pontes, itens, etc.)
    Array.from({ length: h }, () => Array.from({ length: w }, () => null)),
    // camada 2 – overlay de terreno (montanhas, rochas, etc.)
    Array.from({ length: h }, () => Array.from({ length: w }, () => null))
  ];

  // -----------------------------------------------------------------
  // 1️⃣  Preenche todo o mapa com terra firme (grass_block)
  // -----------------------------------------------------------------
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      layers[0][y][x] = { base: "grass_block", dir: "S" };
    }
  }

  // -----------------------------------------------------------------
  // 2️⃣  Gera lagos (grass_water, concave, convex) – áreas de água sem fluxo
  // -----------------------------------------------------------------
  const lakeCount = 6;
  for (let i = 0; i < lakeCount; i++) {
    const lx = 4 + R() * (w - 8);
    const ly = 4 + R() * (h - 8);
    const r  = 2 + R() * 3;                     // raio entre 2 e 5 tiles
    if (nearBase(lx, ly, 14)) continue;        // evita lago perto das bases

    for (let y = Math.floor(ly - r); y <= ly + r; y++) {
      for (let x = Math.floor(lx - r); x <= lx + r; x++) {
        if (x < 0 || x >= w || y < 0 || y >= h) continue;
        if (Math.hypot(x - lx, y - ly) < r) {
          // Escolhe variação de água baseada na posição no lago
          let tile = "grass_water";
          if (x === Math.floor(lx - r) || x === Math.ceil(lx + r) ||
              y === Math.floor(ly - r) || y === Math.ceil(ly + r)) {
            // borda externa do lago: usa variante convexa
            tile = "grass_waterConvex";
          } else if (x === Math.floor(lx - r) + 1 || x === Math.ceil(lx + r) - 1 ||
                     y === Math.floor(ly - r) + 1 || y === Math.ceil(ly + r) - 1) {
            // próxima da borda: usa variante côncava
            tile = "grass_waterConcave";
          }
          layers[0][y][x] = { base: tile, dir: "S" };
        }
      }
    }
  }

  // -----------------------------------------------------------------
  // 3️⃣  Gera um rio contínuo (grass_river) entre dois pontos aleatórios
  // -----------------------------------------------------------------
  const riverPath = gerarCaminhoDeRio(w, h);
  const riverTiles = new Set();   // guarda coordenadas "x,y" que pertencem ao rio

  // coloca o rio propriamente dito
  for (const [x, y] of riverPath) {
    layers[0][y][x] = { base: "grass_river", dir: "S" };
    riverTiles.add(`${x},${y}`);
  }

  // -----------------------------------------------------------------
  // 4️⃣  Margens do rio – usa grass_waterRiver quando ao lado de água,
  //     caso contrário grass_riverBank
  // -----------------------------------------------------------------
  const dirs = [
    [ 0, -1], [ 0,  1],
    [-1,  0], [ 1,  0],
    [-1, -1], [ 1, -1],
    [-1,  1], [ 1,  1]
  ];

  for (const [rx, ry] of riverPath) {
    for (const [dx, dy] of dirs) {
      const nx = rx + dx, ny = ry + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const key = `${nx},${ny}`;
      if (riverTiles.has(key)) continue; // já é parte do rio

      const current = layers[0][ny][nx];
      if (current && current.base && current.base.startsWith("grass_water")) {
        // ao lado de lago, usamos margem de água que já inclui a transição
        layers[0][ny][nx] = { base: "grass_waterRiver", dir: "S" };
      } else if (!current || current.base === "grass_block") {
        layers[0][ny][nx] = { base: "grass_riverBank", dir: "S" };
      }
    }
  }

  // -----------------------------------------------------------------
  // 5️⃣  Pontes (grass_riverBridge) – inseridas aleatoriamente ao longo do rio
  // -----------------------------------------------------------------
  const bridgeCount = Math.max(1, Math.floor(riverPath.length / 30)); // aproximadamente 1 ponte a cada 30 tiles
  for (let i = 0; i < bridgeCount; i++) {
    const idx = Math.floor(R() * riverPath.length);
    const [bx, by] = riverPath[idx];
    // garante que a ponte substitua o tile do rio sem apagar a margem ao redor
    layers[0][by][bx] = { base: "grass_riverBridge", dir: "S" };
  }

  // -----------------------------------------------------------------
  // 5️⃣   Camada de objetos (layer 1) – exemplo de árvores e pedras
  // -----------------------------------------------------------------
  for (let i = 0; i < 20; i++) {
    const ox = Math.floor(R() * w);
    const oy = Math.floor(R() * h);
    // evita colocar objetos sobre água ou rios
    const baseTile = layers[0][oy][ox];
    if (baseTile && baseTile.base && baseTile.base.startsWith("grass_water")) continue;
    if (baseTile && baseTile.base && baseTile.base.startsWith("grass_river")) continue;
    layers[1][oy][ox] = { base: "tree_oak", dir: "S" };
  }

  // -----------------------------------------------------------------
  // 6️⃣  Ajusta bordas de água (concave/convex) para visual mais natural
  // -----------------------------------------------------------------
  ajustarBordasDeAgua(layers[0], w, h);

  // -----------------------------------------------------------------
  // 7️⃣  Gera montanhas em camada 2 (overlay)
  // -----------------------------------------------------------------
  gerarMontanhas(layers[2], layers[0], w, h);

  // -----------------------------------------------------------------
  // 8️⃣  Retorna o objeto completo de mapa (compatível com o resto do jogo)
  // -----------------------------------------------------------------
  return {
    w,
    h,
    layers,
    isoMetrics: { ISO_W: 220, ISO_H: 110, LAYER_STEP_Y: 114, spriteOffsetY: 118 }
  };
}

/**
 * Gera um caminho de rio contínuo entre duas bordas opostas do mapa.
 * Usa um algoritmo de “random walk” que garante conectividade.
 *
 * @param {number} w  largura do mapa
 * @param {number} h  altura do mapa
 * @returns {Array<[number, number]>} lista de coordenadas [x, y] do rio
 */
function gerarCaminhoDeRio(w, h) {
  // escolhe a borda de origem aleatoriamente (esquerda ou topo)
  const startSide = R() < 0.5 ? "left" : "top";
  const endSide   = startSide === "left" ? "right" : "bottom";

  let x, y;
  if (startSide === "left")   { x = 0;          y = Math.floor(R() * h); }
  else                         { x = Math.floor(R() * w); y = 0;      }

  const path = [[x, y]];
  const maxSteps = w * h;   // limite de segurança para evitar loops infinitos

  while (maxSteps--) {
    // determina direção aproximada para o lado oposto
    const dirs = [];

    if (endSide === "right")  dirs.push([1, 0]);   // tenta avançar para a direita
    if (endSide === "bottom") dirs.push([0, 1]);   // tenta avançar para baixo

    // adiciona movimentos diagonais para suavizar curvas
    if (endSide === "right")  dirs.push([1, 1], [1, -1]);
    if (endSide === "bottom") dirs.push([1, 1], [-1, 1]);

    // sempre permite pequenos passos laterais para evitar paredes
    dirs.push([0, -1], [-1, 0], [1, 0], [0, 1]);

    // escolhe aleatoriamente entre as direções válidas que mantêm o ponto dentro do mapa
    const valid = dirs.filter(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      return nx >= 0 && nx < w && ny >= 0 && ny < h;
    });

    const [dx, dy] = valid[Math.floor(R() * valid.length)];
    x += dx; y += dy;
    path.push([x, y]);

    // verifica se chegou na borda desejada
    if ((endSide === "right" && x === w - 1) ||
        (endSide === "bottom" && y === h - 1)) {
      break;
    }
  }

  // remove possíveis repetições consecutivas (caso o algoritmo “oscile”)
  const cleanPath = [];
  const seen = new Set();
  for (const pt of path) {
    const key = `${pt[0]},${pt[1]}`;
    if (!seen.has(key)) {
      cleanPath.push(pt);
      seen.add(key);
    }
  }

  return cleanPath;
}

/**
 * Função auxiliar de geração de número aleatório entre 0 e 1.
 */
function R() {
  return Math.random();
}
