const P = "sprites/actors/enemies/";
const cache = {};
const img = s => cache[s] ??= Object.assign(new Image(), { src: P + s });

const MAX_MULTIPLIER = 10;

// Atributos base: velocidade e alcance em tiles; cd é o intervalo entre ataques.
export const TYPES = {
  pink:   { hp: 30,  spd: 4.2, dmg: 6,  range: 0.9, cd: 0.6, drop: 1, ai: swarm },
  red:    { hp: 260, spd: 1.4, dmg: 35, range: 6,   cd: 3.0, drop: 5, ai: tank, aoe: 2 },
  blue:   { hp: 80,  spd: 4.8, dmg: 12, range: 1.0, cd: 0.5, drop: 3, ai: hitRun },
  green:  { hp: 160, spd: 2.6, dmg: 18, range: 1.1, cd: 0.9, drop: 5, ai: passive },
  orange: { hp: 70,  spd: 3.0, dmg: 10, range: 7,   cd: 1.4, drop: 3, ai: ranged },
};

const ELITE = { hp: 1.8, dmg: 1.5, drop: 2 };

export const enemies = [];
export const corpses = [];
export const shots = [];

function randomMultiplier() {
  return 1 + Math.floor(Math.random() * MAX_MULTIPLIER);
}

function makeStats(base, multiplier, elite) {
  const eliteScale = elite ? ELITE : { hp: 1, dmg: 1, drop: 1 };

  return {
    ...base,
    hp: base.hp * multiplier * eliteScale.hp,
    spd: base.spd * multiplier,
    dmg: base.dmg * multiplier * eliteScale.dmg,
    range: base.range * multiplier,

    // Multiplicador maior significa ataques mais frequentes.
    cd: base.cd / multiplier,

    drop: base.drop * multiplier * eliteScale.drop,

    // Escala também o raio da explosão, se o inimigo tiver esse atributo.
    ...(base.aoe != null ? { aoe: base.aoe * multiplier } : {})
  };
}

export function spawn(type, x, y, elite = false) {
  const base = TYPES[type];
  if (!base) throw new Error(`Tipo de inimigo desconhecido: ${type}`);

  const multiplier = randomMultiplier();
  const stats = makeStats(base, multiplier, elite);

  const e = {
    type,
    x,
    y,
    vx: 0,
    vy: 0,
    elite,

    // Usado internamente para os atributos. Não é exibido pelo desenho.
    _multiplier: multiplier,
    T: stats,

    hp: stats.hp,
    max: stats.hp,
    dmg: stats.dmg,
    drop: stats.drop,

    cd: 0,
    state: "idle",
    t: 0,
    target: null,
    face: -1
  };

  enemies.push(e);
  return e;
}

export function spawnPinkGroup(x, y, n = 6, elite = false) {
  for (let i = 0; i < n; i++) {
    spawn(
      "pink",
      x + Math.random() * 2 - 1,
      y + Math.random() * 2 - 1,
      elite
    );
  }
}

// Chamar quando um jogador acertar o inimigo.
export function hurt(e, amount, attacker) {
  e.hp -= amount;
  e.provoked = attacker;

  if (e.type === "blue" && e.state === "attack") {
    e.state = "flee";
    e.t = 2;
  }
}

// ---------- utilitários ----------
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const nearest = (e, list) =>
  list.reduce((best, p) =>
    !best || dist(e, p) < dist(e, best) ? p : best, null);

function moveTo(e, target, speed, away = false) {
  const dx = target.x - e.x;
  const dy = target.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const direction = away ? -1 : 1;

  e.vx = (dx / d) * speed * direction;
  e.vy = (dy / d) * speed * direction;
}

function melee(e, p, W) {
  if (dist(e, p) <= e.T.range && e.cd <= 0) {
    W.damagePlayer(p, e.dmg);
    e.cd = e.T.cd;
  }
}

function shoot(e, p, extra = {}) {
  if (e.cd > 0) return;

  const d = dist(e, p) || 1;

  shots.push({
    x: e.x,
    y: e.y,
    vx: (p.x - e.x) / d * 7,
    vy: (p.y - e.y) / d * 7,
    dmg: e.dmg,
    life: 1.5,
    ...extra
  });

  e.cd = e.T.cd;
}

// ---------- comportamentos ----------
function swarm(e, W) {
  const p = nearest(e, W.players);
  if (!p) return;

  moveTo(e, p, e.T.spd);

  for (const other of enemies) {
    if (other !== e && other.type === "pink" && dist(e, other) < 0.6) {
      e.vx += (e.x - other.x) * 3;
      e.vy += (e.y - other.y) * 3;
    }
  }

  melee(e, p, W);
}

function tank(e, W) {
  const p = nearest(e, W.players);
  if (!p) return;

  if (dist(e, p) > e.T.range * 0.8) {
    moveTo(e, p, e.T.spd);
  } else {
    e.vx = 0;
    e.vy = 0;
  }

  if (dist(e, p) <= e.T.range) {
    shoot(e, p, { aoe: e.T.aoe, slow: true });
  }
}

function hitRun(e, W) {
  const p = nearest(e, W.players);
  if (!p) return;

  if (e.state === "flee") {
    moveTo(e, p, e.T.spd, true);
    if ((e.t -= W.dt) <= 0) e.state = "attack";
    return;
  }

  e.state = "attack";
  moveTo(e, p, e.T.spd);

  if (dist(e, p) <= e.T.range && e.cd <= 0) {
    W.damagePlayer(p, e.dmg);
    e.cd = e.T.cd;
    e.state = "flee";
    e.t = 1.5 + Math.random();
  }
}

function passive(e, W) {
  if (e.state === "gone") {
    e.vx *= 1.02;
    e.vy *= 1.02;
    return;
  }

  if (e.hp < e.max * 0.3 && e.provoked) {
    e.state = "gone";
    moveTo(e, e.provoked, e.T.spd * 1.4, true);
    return;
  }

  if (e.provoked) {
    moveTo(e, e.provoked, e.T.spd);
    melee(e, e.provoked, W);
    return;
  }

  const corpse = nearest(e, corpses);

  if (corpse && dist(e, corpse) < 8) {
    if (dist(e, corpse) < 0.5) {
      e.vx = 0;
      e.vy = 0;
      corpse.food -= W.dt;
      e.hp = Math.min(e.max, e.hp + 15 * W.dt);
    } else {
      moveTo(e, corpse, e.T.spd * 0.7);
    }
    return;
  }

  if ((e.t -= W.dt) <= 0) {
    const angle = Math.random() * Math.PI * 2;
    e.vx = Math.cos(angle) * 0.8;
    e.vy = Math.sin(angle) * 0.8;
    e.t = 2 + Math.random() * 2;
  }
}

function ranged(e, W) {
  const p = nearest(e, W.players);
  if (!p) return;

  if (e.hp < e.max * 0.35) {
    moveTo(e, p, e.T.spd * 1.5);
    melee(e, p, W);
    return;
  }

  const d = dist(e, p);
  const ideal = e.T.range * 0.8;

  if (d > e.T.range) {
    moveTo(e, p, e.T.spd);
  } else if (d < ideal - 1) {
    moveTo(e, p, e.T.spd, true);
  } else {
    e.vx = 0;
    e.vy = 0;
  }

  if (d <= e.T.range) shoot(e, p);
}

// ---------- atualização ----------
export function update(dt, W) {
  W.dt = dt;

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];

    e.cd -= dt;
    e.T.ai(e, W);

    e.x += e.vx * dt;
    e.y += e.vy * dt;

    if (Math.abs(e.vx) > 0.05) {
      e.face = e.vx > 0 ? 1 : -1;
    }

    if (e.hp <= 0) {
      W.spawnDrop(e.x, e.y, e.drop);

      corpses.push({
        x: e.x,
        y: e.y,
        type: e.type,
        elite: e.elite,
        food: 4,
        life: 30
      });

      enemies.splice(i, 1);
    } else if (
      e.state === "gone" &&
      W.players.length > 0 &&
      Math.min(...W.players.map(p => dist(e, p))) > 25
    ) {
      enemies.splice(i, 1);
    }
  }

  for (let i = corpses.length - 1; i >= 0; i--) {
    const corpse = corpses[i];

    if ((corpse.life -= dt) <= 0 || corpse.food <= 0) {
      corpses.splice(i, 1);
    }
  }

  for (let i = shots.length - 1; i >= 0; i--) {
    const shot = shots[i];

    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    shot.life -= dt;

    const hit = W.players.find(p => dist(shot, p) < 0.6);

    if (hit || shot.life <= 0) {
      if (shot.aoe) {
        W.players.forEach(p => {
          if (dist(shot, p) <= shot.aoe) W.damagePlayer(p, shot.dmg);
        });
      } else if (hit) {
        W.damagePlayer(hit, shot.dmg);
      }

      shots.splice(i, 1);
    }
  }
}

// ---------- desenho ----------
function sprite(ctx, file, sx, sy, zoom, flip, alpha = 1) {
  const image = img(file);
  if (!image.complete || !image.naturalWidth) return;

  const w = image.naturalWidth * zoom;
  const h = image.naturalHeight * zoom;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(sx, sy);

  if (flip) ctx.scale(-1, 1);

  ctx.drawImage(image, -w / 2, -h / 2, w, h);
  ctx.restore();
}

export function draw(ctx, toScreen, zoom) {
  for (const corpse of corpses) {
    const { x, y } = toScreen(corpse.x, corpse.y);

    sprite(
      ctx,
      `fish_${corpse.type}_skeleton${corpse.elite ? "_outline" : ""}.png`,
      x,
      y,
      zoom,
      false,
      Math.min(1, corpse.life / 3)
    );
  }

  for (const e of enemies) {
    const { x, y } = toScreen(e.x, e.y);

    // O multiplicador não é mostrado no sprite, no texto nem na barra de vida.
    sprite(
      ctx,
      `fish_${e.type}${e.elite ? "_outline" : ""}.png`,
      x,
      y,
      zoom,
      e.face > 0
    );

    if (e.hp < e.max) {
      ctx.fillStyle = "#000a";
      ctx.fillRect(x - 16 * zoom, y - 26 * zoom, 32 * zoom, 4 * zoom);

      ctx.fillStyle = "#e33";
      ctx.fillRect(
        x - 16 * zoom,
        y - 26 * zoom,
        32 * zoom * e.hp / e.max,
        4 * zoom
      );
    }
  }

  ctx.fillStyle = "#ff8a2a";

  for (const shot of shots) {
    const { x, y } = toScreen(shot.x, shot.y);

    ctx.beginPath();
    ctx.arc(x, y, (shot.aoe ? 6 : 3) * zoom, 0, Math.PI * 2);
    ctx.fill();
  }
}
