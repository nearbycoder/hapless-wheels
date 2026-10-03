// Gamepad support via the standard Gamepad API mapping (Xbox / PlayStation /
// Switch Pro and most generic pads in browsers that report "standard").
//
//   RT / Left stick up / D-pad up     accelerate
//   LT / Left stick down / D-pad down reverse
//   Left stick / D-pad left-right     lean
//   A (Cross)  / RB                   primary ability
//   X (Square) / LB                   secondary ability
//   Y (Triangle)                      eject
//   Start                             pause
//   Back / Select                     restart level
//   B (Circle)                        back (menus)

const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const STICK = 0.4;
const TRIGGER = 0.2;
const EDGES = ['a', 'b', 'x', 'y', 'start', 'back', 'up', 'down', 'left', 'right'];

export class Gamepads {
  constructor() {
    this.prev = {};
    this.held = { up: false, down: false, left: false, right: false, primary: false, secondary: false };
    this.pressed = {};
    this.connected = false;
    this.repeatAt = {};
    this.onConnect = null;
    window.addEventListener('gamepadconnected', (e) => {
      this.connected = true;
      this.onConnect?.(e.gamepad, true);
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      this.connected = this.list().length > 0;
      this.onConnect?.(e.gamepad, false);
    });
  }

  list() {
    if (!navigator.getGamepads) return [];
    return [...navigator.getGamepads()].filter((p) => p && p.connected);
  }

  // Call once per frame. Merges every connected pad.
  poll(now = performance.now()) {
    const pads = this.list();
    const cur = { a: false, b: false, x: false, y: false, start: false, back: false, up: false, down: false, left: false, right: false };
    const held = { up: false, down: false, left: false, right: false, primary: false, secondary: false };
    let anyInput = false;
    for (const p of pads) {
      const btn = (i) => !!(p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.5));
      const val = (i) => (p.buttons[i] ? p.buttons[i].value : 0);
      const lx = p.axes[0] || 0, ly = p.axes[1] || 0;
      const sUp = ly < -STICK, sDown = ly > STICK, sLeft = lx < -STICK, sRight = lx > STICK;
      cur.a ||= btn(B.A);
      cur.b ||= btn(B.B);
      cur.x ||= btn(B.X);
      cur.y ||= btn(B.Y);
      cur.start ||= btn(B.START);
      cur.back ||= btn(B.BACK);
      cur.up ||= btn(B.UP) || sUp;
      cur.down ||= btn(B.DOWN) || sDown;
      cur.left ||= btn(B.LEFT) || sLeft;
      cur.right ||= btn(B.RIGHT) || sRight;
      held.up ||= val(B.RT) > TRIGGER || btn(B.UP) || sUp;
      held.down ||= val(B.LT) > TRIGGER || btn(B.DOWN) || sDown;
      held.left ||= btn(B.LEFT) || sLeft;
      held.right ||= btn(B.RIGHT) || sRight;
      held.primary ||= btn(B.A) || btn(B.RB);
      held.secondary ||= btn(B.X) || btn(B.LB);
      if (p.buttons.some((b) => b.pressed) || Math.abs(lx) > STICK || Math.abs(ly) > STICK) anyInput = true;
    }
    // edge detection, with auto-repeat on directions for menu navigation
    this.pressed = {};
    for (const k of EDGES) {
      if (cur[k] && !this.prev[k]) {
        this.pressed[k] = true;
        this.repeatAt[k] = now + 420;
      } else if (cur[k] && ['up', 'down', 'left', 'right'].includes(k) && now >= (this.repeatAt[k] || Infinity)) {
        this.pressed[k] = true;
        this.repeatAt[k] = now + 140;
      }
    }
    this.prev = cur;
    this.held = held;
    this.connected = pads.length > 0;
    this.anyInput = anyInput;
    return this;
  }

  rumble(strong = 0.6, weak = 0.6, ms = 200) {
    for (const p of this.list()) {
      const act = p.vibrationActuator;
      if (act && act.playEffect) {
        act.playEffect('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) }).catch(() => {});
      }
    }
  }
}
