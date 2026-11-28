const MAP = {
  toggleSuit: 0, special1: 1, drop: 2, pickup: 3, special2: 4, fire: 5,
  select: 8, start: 9, up: 12, down: 13, left: 14, right: 15, axisX: 0, axisY: 1
};
const DZ = 0.18, prev = new Map(); // estado por controle

export function pollGamepad(index = null) {
  const pads = [...(navigator.getGamepads?.() || [])].filter(g => g?.connected);
  const gp = index == null ? pads[0] : pads.find(g => g.index === index);
  if (!gp) { if (index != null) prev.delete(index); return null; }

  if (!prev.has(gp.index)) prev.set(gp.index, {});
  const st = prev.get(gp.index);
  const btn = i => { const b = gp.buttons[i]; return !!(b && (b.pressed || b.value > 0.5)); };
  const edge = i => { const p = btn(i), r = p && !st[i]; st[i] = p; return r; };

  let ax = gp.axes[MAP.axisX] || 0, ay = gp.axes[MAP.axisY] || 0;
  const m = Math.hypot(ax, ay);
  if (m < DZ) ax = ay = 0;
  else { const k = Math.min(1, (m - DZ) / (1 - DZ)) / m; ax *= k; ay *= k; }

  // O D-pad substitui o analógico quando estiver pressionado
  const dx = btn(MAP.right) - btn(MAP.left), dy = btn(MAP.down) - btn(MAP.up);
  if (dx || dy) { const n = Math.hypot(dx, dy); ax = dx / n; ay = dy / n; }

  const s1 = edge(MAP.special1), s2 = edge(MAP.special2);
  return {
    id: gp.index, moveX: ax, moveY: ay, fire: btn(MAP.fire),
    toggleSuit: edge(MAP.toggleSuit), special: s1, special2: btn(MAP.special2),
    drop: edge(MAP.drop), pickup: edge(MAP.pickup),
    pause: edge(MAP.start), select: edge(MAP.select)
  };
}

export const listGamepads = () =>
  [...(navigator.getGamepads?.() || [])].filter(g => g?.connected).map(g => g.index);

window.addEventListener('gamepaddisconnected', e => prev.delete(e.gamepad.index));
