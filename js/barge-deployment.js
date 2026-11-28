const BASE_RADIUS = 5;
const MIN_BARGE_DISTANCE = 14;
const PLAYER_OFFSETS = [
  [0, 0],
  [0.7, 0],
  [-0.7, 0],
  [0, 0.7],
  [0, -0.7],
  [0.5, 0.5],
  [-0.5, 0.5],
  [0.5, -0.5]
];

export function clampBargeCount(value) {
  const count = Math.round(Number(value) || 1);
  return Math.max(1, Math.min(3, count));
}

function seededRandom(seed) {
  let state = (Number(seed) >>> 0) || 1;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function isFlatSite(map, cx, cy, radius = BASE_RADIUS) {
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);

  if (
    x0 - radius < 1 ||
    y0 - radius < 1 ||
    x0 + radius >= map.w - 1 ||
    y0 + radius >= map.h - 1
  ) {
    return false;
  }

  const floorHeight = map.gz(x0 + 0.5, y0 + 0.5);

  for (let y = y0 - radius; y <= y0 + radius; y++) {
    for (let x = x0 - radius; x <= x0 + radius; x++) {
      if (map.isSolid(x, y)) return false;
      if (map.gz(x + 0.5, y + 0.5) !== floorHeight) return false;
    }
  }

  return true;
}

function collectCandidateSites(map) {
  const sites = [];

  // Aproveita as áreas planas que o mapgen já reservou.
  for (const base of map.bases || []) {
    const x = base.barge.x;
    const y = base.barge.y;

    if (isFlatSite(map, x, y)) {
      sites.push({ x, y });
    }
  }

  // Procura áreas planas adicionais para permitir até três barcaças.
  for (let y = BASE_RADIUS + 1; y < map.h - BASE_RADIUS - 1; y += 2) {
    for (let x = BASE_RADIUS + 1; x < map.w - BASE_RADIUS - 1; x += 2) {
      if (isFlatSite(map, x + 0.5, y + 0.5)) {
        sites.push({ x: x + 0.5, y: y + 0.5 });
      }
    }
  }

  return sites;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function selectSites(map, requestedCount, seed) {
  const count = clampBargeCount(requestedCount);
  const candidates = collectCandidateSites(map);
  const random = seededRandom(seed);
  const selected = [];

  if (!candidates.length) {
    throw new Error("Não foi encontrada uma área plana para posicionar a barcaça.");
  }

  // Escolhe um ponto inicial de forma determinística para que todos
  // os clientes do multiplayer obtenham o mesmo posicionamento.
  selected.push(candidates[Math.floor(random() * candidates.length)]);

  while (selected.length < count) {
    let best = null;
    let bestDistance = -1;

    for (const candidate of candidates) {
      if (selected.some(site => distance(site, candidate) < MIN_BARGE_DISTANCE)) {
        continue;
      }

      const nearestSelected = Math.min(
        ...selected.map(site => distance(site, candidate))
      );

      if (nearestSelected > bestDistance) {
        best = candidate;
        bestDistance = nearestSelected;
      }
    }

    if (!best) {
      throw new Error(
        `O mapa não tem áreas planas separadas suficientes para ${count} barcaças.`
      );
    }

    selected.push(best);
  }

  return selected;
}

/**
 * Cria os pontos de barcaça e atribui cada jogador a uma delas.
 * Os jogadores começam como pilotos dentro da barcaça; o mecha ainda
 * não está liberado.
 */
export function createBargeDeployment(map, requestedCount, roster, seed) {
  const sites = selectSites(map, requestedCount, seed);
  const barges = sites.map((site, index) => ({
    id: index,
    x: site.x,
    y: site.y,
    hp: 500,
    maxHp: 500,
    size: 2,
    cd: 0
  }));

  const players = roster.map((player, index) => {
    const base = index % barges.length;
    const barge = barges[base];
    const [ox, oy] = PLAYER_OFFSETS[index % PLAYER_OFFSETS.length];

    return {
      id: player.id,
      base,
      startX: barge.x + ox,
      startY: barge.y + oy,
      mechReleased: false
    };
  });

  return { barges, players };
}

/**
 * Libera o mecha do jogador escolhido para fora da barcaça.
 * Chame esta função quando o jogador acionar o comando de lançamento
 * enquanto estiver dentro da barcaça.
 */
export function releaseMech(player, barge, playerIndex = 0) {
  if (!player || !barge || player.mechReleased) return false;

  const angle = (playerIndex % 8) * (Math.PI / 4);
  const radius = barge.size / 2 + 1.5;

  player.x = barge.x + Math.cos(angle) * radius;
  player.y = barge.y + Math.sin(angle) * radius;
  player.mode = "mecha";
  player.mechReleased = true;

  return true;
}
