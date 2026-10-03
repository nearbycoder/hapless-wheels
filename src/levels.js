import { hills, curve, path } from './objects.js';

const PI = Math.PI;
const flat = (x0, x1, y) => [[x0, y], [x1, y]];
const pit = (x0, x1, y, depth) => [[x0, y], [x0, y - depth], [x1, y - depth], [x1, y]];

// A kicker ramp followed by a short row of hazards that every vehicle can clear
// at its normal top speed. Returns the x where it is safe to land.
function hop(b, x, y, kind = 'mines', count = 2) {
  b.ramp(x, y, 5.5, 1.8, 1, { curve: true, style: 'wood' });
  const start = x + 6.3;
  if (kind === 'spikes') {
    b.spikes(start + count / 2, y, count);
    return start + count + 2;
  }
  for (let i = 0; i < count; i++) b.mine(start + i * 1.5, y);
  return start + count * 1.5 + 2;
}

export const LEVELS = [
  // ---------------------------------------------------------------- 1
  {
    id: 'first-steps',
    name: 'First Steps',
    desc: 'Learn the ropes. Hills, hops, and your first spikes.',
    theme: 'meadow',
    difficulty: 1,
    par: 40,
    start: [0, 0],
    build(b) {
      b.ground(path(
        [[-30, 12], [-16, 12], [-15, 0]],
        flat(-15, 22, 0),
        hills(22, 62, 0, 1.0, 20, 1),
        flat(62, 128, 0),
        pit(128, 141, 0, 7),
        flat(141, 190, 0),
        [[190, 10], [200, 10]],
      ));
      b.sign(4, 0, '↑ ↓  DRIVE\n← →  LEAN');
      b.sign(14, 0, 'SPACE / SHIFT\nSPECIAL MOVES');
      b.sign(26, 0, 'Z  =  EJECT\nENTER = RETRY');
      b.decor('tree', 36, 0, -2.5, 1.2);
      b.decor('tree', 52, 0, -2.8, 0.9);
      b.sign(68, 0, 'HOP THE SPIKES!');
      hop(b, 72, 0, 'spikes', 2);
      b.sign(100, 0, 'BOOST PAD →');
      b.boost(108, 0, 0, 15, 3);
      b.ramp(119, 0, 9, 2.4, 1, { curve: true, style: 'wood' });
      b.spikes(134.5, -7, 12);
      b.checkpoint(146, 0);
      b.npc(186, 0);
      b.npc(188, 0);
      b.sign(164, 0, 'TOUCH THE STAR!');
      b.token(178, 1.6);
    },
  },

  // ---------------------------------------------------------------- 2
  {
    id: 'rolling-hills',
    name: 'Rolling Hills',
    desc: 'A rickety bridge, a loop-the-loop and a seesaw. What could go wrong?',
    theme: 'meadow',
    difficulty: 2,
    par: 55,
    start: [0, 0],
    build(b) {
      b.ground(path(
        [[-30, 10], [-14, 10], [-13, 0]],
        flat(-13, 10, 0),
        hills(10, 70, 0, 1.3, 26, 1),
        [[70, 0], [72, -16], [96, -16], [98, 0]],
        flat(98, 182, 0),
        curve(182, 0, 192, 4, 8),
        flat(192, 214, 4),
        [[214, 4], [215, 0]],
        flat(215, 250, 0),
        [[250, 12], [260, 12]],
      ));
      b.decor('tree', 20, b.groundAt(20), -2.6, 1.3);
      b.decor('tree', 48, b.groundAt(48), -3.0, 1.1);
      b.bridge(70, 0, 98, 0, { strength: 90000 });
      b.spikes(84, -16, 22);
      b.sign(104, 0, 'GO FAST!');
      b.boost(108, 0, 0, 20, 3.2);
      b.loop(126, 7, 7);
      b.checkpoint(140, 0);
      b.crate(146, 0, 1.1);
      b.crate(146, 1.1, 1.1);
      b.crate(147.2, 0, 1.1);
      b.crate(146.5, 2.2, 0.9);
      b.npc(150, 0);
      b.npc(152.5, 0);
      b.npc(155, 0);
      b.seesaw(168, 1.2, 8);
      b.ramp(208, 4, 6, 1.4, 1, { curve: true, style: 'wood' });
      b.spikes(220, 0, 5);
      b.token(240, 1.6);
    },
  },

  // ---------------------------------------------------------------- 3
  {
    id: 'skyscraper',
    name: 'Skyscraper Scramble',
    desc: 'Leap between rooftops and crash through office windows. Do not look down.',
    theme: 'city',
    difficulty: 3,
    par: 50,
    start: [0, 20],
    build(b) {
      b.ground([[-60, 0], [300, 0]], { top: 0x5a5a63 });
      // street extras
      for (const x of [34, 66, 105, 160, 200]) b.npc(x, 0);
      b.decor('lamp', 45, 0, -1.6);
      b.decor('lamp', 140, 0, -1.6);

      b.building(-14, 0, 44, 20);
      b.platform(-13.5, 22.5, 1, 5, 0, { style: 'metal' });
      b.sign(4, 20, 'DON\'T LOOK DOWN');
      b.boost(14, 20, 0, 15, 3);
      b.ramp(24, 20, 6, 1.2, 1, { curve: true, style: 'metal' });

      b.building(38, 0, 26, 19);
      b.boost(43, 19, 0, 15, 3);
      b.glass(48, 20.5, 0.25, 3);
      b.glass(55, 20.5, 0.25, 3);
      b.platform(51.5, 22.15, 7.5, 0.3, 0, { style: 'metal' });
      b.ramp(58, 19, 6, 1.0, 1, { curve: true, style: 'metal' });

      b.building(71, 0, 30, 15);
      b.checkpoint(76, 15);
      b.crate(82, 15, 1);
      b.crate(82, 16, 1);
      b.boost(88, 15, 0, 17, 3);
      b.ramp(95, 15, 6, 1.4, 1, { curve: true, style: 'metal' });

      b.building(113, 0, 22, 16);
      b.npc(119, 16);
      b.npc(122, 16);
      b.barrel(127, 16);
      // steel girders
      b.platform(139, 15.7, 6, 0.4, 0, { style: 'metal' });
      b.platform(148, 14.7, 6, 0.4, 0, { style: 'metal' });
      b.platform(157, 13.7, 6, 0.4, 0, { style: 'metal' });

      b.building(162, 0, 34, 12);
      b.glass(171, 13.5, 0.3, 3);
      b.glass(180, 13.5, 0.3, 3);
      b.platform(175.5, 15.2, 10, 0.4, 0, { style: 'metal' });
      b.ramp(190, 12, 6, 1.0, 1, { curve: true, style: 'metal' });

      b.building(205, 0, 28, 8);
      b.platform(232.5, 10, 1, 4, 0, { style: 'metal' });
      b.token(224, 9.6);
    },
  },

  // ---------------------------------------------------------------- 4
  {
    id: 'minefield',
    name: 'Mine Your Step',
    desc: 'The desert is full of surprises. Most of them explode.',
    theme: 'desert',
    difficulty: 3,
    par: 50,
    start: [0, 0],
    build(b) {
      b.ground(path(
        [[-30, 10], [-14, 10], [-13, 0]],
        flat(-13, 40, 0),
        hills(40, 64, 0, 0.6, 16, 1),
        flat(64, 100, 0),
        curve(100, 0, 112, 6, 8),
        flat(112, 134, 6),
        curve(134, 6, 146, 0, 8),
        flat(146, 232, 0),
        [[232, 12], [242, 12]],
      ));
      b.decor('cactus', 8, 0, -2.4, 1.2);
      b.sign(6, 0, 'MINEFIELD\nKEEP OUT');
      // cluster 1: hop it with the kicker
      hop(b, 28, 0, 'mines', 2);
      b.decor('cactus', 44, 0, -2.8, 1.4);
      b.barrel(52, b.groundAt(52));
      // cluster 2: with barrels for a chain reaction
      hop(b, 66, 0, 'mines', 3);
      b.barrel(84, 0);
      b.barrel(85, 0);
      b.checkpoint(90, 0);
      // mesa with a turret
      b.platform(126, 11.75, 1.6, 0.5, 0, { style: 'concrete' });
      b.harpoon(126, 12, { range: 22 });
      hop(b, 112.5, 6, 'mines', 1);
      b.npc(128, 6);
      // the big one
      b.boost(150, 0, 0, 17, 3);
      b.ramp(156, 0, 7, 2.2, 1, { curve: true, style: 'wood' });
      for (const x of [166, 169.5, 173, 176.5, 180]) b.mine(x, 0);
      b.checkpoint(192, 0);
      hop(b, 194, 0, 'mines', 2);
      b.barrel(206, 0);
      b.barrel(207, 0);
      b.npc(212, 0);
      b.decor('cactus', 214, 0, -2.5, 1.1);
      b.token(222, 1.6);
    },
  },

  // ---------------------------------------------------------------- 5
  {
    id: 'wrecking-yard',
    name: 'Wrecking Yard',
    desc: 'Swinging wrecking balls, backwards conveyors and buzzsaws. Timing is everything.',
    theme: 'factory',
    difficulty: 3,
    par: 55,
    start: [0, 0],
    build(b) {
      b.ground(path(
        [[-30, 12], [-12, 12], [-11, 0]],
        flat(-11, 160, 0),
        pit(160, 172, 0, 5),
        flat(172, 240, 0),
        [[240, 14], [250, 14]],
      ), { top: 0x8d9097 });
      b.platform(70, 13.5, 200, 1, 0, { style: 'metal' }); // ceiling beam
      b.sign(6, 0, 'HARD HAT\nAREA');
      b.wreckingBall(30, 13, 11, 1.0, 1.1);
      b.wreckingBall(50, 13, 11, 1.0, -0.9);
      b.wreckingBall(70, 13, 11, 1.1, 1.3);
      b.checkpoint(84, 0);
      b.conveyor(100, 0, 18, -3);
      b.crate(96, 0.2, 1);
      b.crate(104, 0.2, 1);
      b.barrel(116, 0);
      b.crate(124, 0, 1.2);
      b.crate(124, 1.2, 1.2);
      b.crate(125.3, 0, 1.2);
      b.saw(136, 2.2, 0.9, { path: [136, 0.4], period: 2.2 });
      b.saw(146, 2.6, 0.9, { path: [146, 0.4], period: 1.7 });
      b.ramp(152, 0, 7, 1.8, 1, { curve: true, style: 'metal' });
      b.spikes(166, -5, 11);
      b.wreckingBall(186, 13, 11, 1.0, 1.2);
      b.npc(196, 0);
      b.npc(199, 0);
      b.barrel(204, 0);
      b.saw(214, 0.2, 1.2, { mount: true });
      b.ramp(206, 0, 5, 1.6, 1, { curve: true, style: 'metal' });
      b.token(232, 1.6);
    },
  },

  // ---------------------------------------------------------------- 6
  {
    id: 'spike-canyon',
    name: 'Spike Canyon',
    desc: 'Mesas, rope bridges and pits lined with steel. Bring a spare body.',
    theme: 'desert',
    difficulty: 4,
    par: 60,
    start: [0, 0],
    build(b) {
      b.ground(path(
        [[-30, 10], [-12, 10], [-11, 0]],
        flat(-11, 20, 0),
        pit(20, 38, 0, 10),
        flat(38, 62, 0),
        [[62, 0], [62, -10], [74, -10], [74, -1]],
        flat(74, 92, -1),
        [[92, -1], [92, -12], [118, -12], [118, -1]],
        flat(118, 150, -1),
        curve(150, -1, 172, -12, 10),
        flat(172, 186, -12),
        curve(186, -12, 200, -4, 10),
        flat(200, 240, -4),
        [[240, 8], [250, 8]],
      ));
      b.bridge(20, 0, 38, 0, { strength: 70000 });
      b.spikes(29, -10, 17);
      b.decor('cactus', 50, 0, -2.6, 1.2);
      b.ramp(55, 0, 7, 1.8, 1, { curve: true, style: 'wood' });
      b.spikes(68, -10, 11);
      b.checkpoint(80, -1);
      // stepping-stone pillars over the pit
      b.platform(98.5, -7, 3, 12, 0, { style: 'concrete' });
      b.platform(105.5, -7, 3, 12, 0, { style: 'concrete' });
      b.platform(112.5, -7, 3, 12, 0, { style: 'concrete' });
      b.spikes(95.5, -12, 2.8);
      b.spikes(102, -12, 4);
      b.spikes(109, -12, 4);
      b.spikes(115.5, -12, 2.8);
      b.seesaw(128, 0.2, 8);
      b.npc(140, -1);
      b.spikeRow(160, -6.6, 168, -10.3);
      b.spikes(179, -12, 5);
      b.ramp(173, -12, 3, 0.9, 1, { curve: true, style: 'wood' });
      b.harpoon(210, -4, { range: 20 });
      b.decor('cactus', 220, -4, -2.4, 1.3);
      b.token(234, -2.4);
    },
  },

  // ---------------------------------------------------------------- 7
  {
    id: 'harpoon-alley',
    name: 'Harpoon Alley',
    desc: 'Automated harpoon turrets track your every move. Hide under the shelters.',
    theme: 'night',
    difficulty: 4,
    par: 50,
    start: [0, 0],
    build(b) {
      b.ground(path(
        [[-30, 10], [-12, 10], [-11, 0]],
        flat(-11, 60, 0),
        curve(60, 0, 70, 3, 6),
        flat(70, 92, 3),
        curve(92, 3, 102, 0, 6),
        flat(102, 230, 0),
        [[230, 12], [240, 12]],
      ), { top: 0x3f9a63 });
      const ledge = (x, y) => {
        b.platform(x, y - 0.25, 1.6, 0.5, 0, { style: 'concrete' });
        b.harpoon(x, y, { range: 26, rate: 2.4 });
      };
      const shelter = (x, w = 6) => b.platform(x, 3.4, w, 0.35, 0, { style: 'metal' });
      b.sign(5, 0, 'DANGER\nTURRETS');
      b.decor('lamp', 15, 0, -1.6);
      shelter(24);
      ledge(36, 7.5);
      shelter(44);
      hop(b, 47, 0, 'mines', 2);
      ledge(82, 9.5);
      b.platform(80, 6.6, 8, 0.35, 0, { style: 'metal' });
      b.checkpoint(108, 0);
      b.boost(114, 0, 0, 16, 3);
      b.glass(124, 1.5, 0.3, 3);
      ledge(132, 9);
      b.glass(140, 1.5, 0.3, 3);
      shelter(150, 8);
      ledge(160, 6.5);
      hop(b, 161, 0, 'mines', 2);
      b.npc(185, 0);
      b.npc(188, 0);
      shelter(196);
      ledge(205, 8.5);
      b.decor('lamp', 190, 0, -1.6);
      b.token(222, 1.6);
    },
  },

  // ---------------------------------------------------------------- 8
  {
    id: 'blizzard-lift',
    name: 'Blizzard Lift',
    desc: 'Industrial fans, icy slopes and bottomless chasms. Ride the wind.',
    theme: 'snow',
    difficulty: 4,
    par: 60,
    start: [0, 0],
    killY: -40,
    build(b) {
      const ice = { friction: 0.08 };
      b.ground(path([[-30, 10], [-12, 10], [-11, 0]], flat(-11, 30, 0)), { top: 0xf4f8ff });
      b.sign(6, 0, 'RIDE THE\nUPDRAFT');
      b.decor('pine', 12, 0, -2.6, 1.3);
      // chasm 30..46 with fan at the bottom-ish
      b.fan(37, -14, PI / 2, 10, 24, 40);
      b.ground(path(flat(44, 70, 1), curve(70, 1, 84, -2, 8)), { top: 0xf4f8ff });
      b.ground(path(flat(84, 100, -2)), { top: 0xd8ecff, ...ice });
      b.checkpoint(56, 1);
      b.trampoline(104.5, -5, 3, 0.2, 17);
      b.ground(path([[100, -2], [101, -5], [108, -5], [109, 1]]), { top: 0xf4f8ff });
      b.ground(path(flat(109, 128, 1)), { top: 0xf4f8ff });
      b.npc(118, 1);
      // updraft across the next gap
      b.fan(136, -12, PI / 2, 10, 26, 40);
      b.ground(path(flat(144, 172, 4)), { top: 0xf4f8ff });
      b.checkpoint(149, 4);
      b.spikes(161, 4, 2);
      b.ramp(155, 4, 4.5, 1.8, 1, { curve: true, style: 'wood' });
      // ice slide down
      b.ground(path(curve(172, 4, 196, -6, 12)), { top: 0xd8ecff, ...ice });
      b.ground(path(flat(196, 214, -6)), { top: 0xf4f8ff });
      b.fan(221, -24, PI / 2, 10, 30, 42);
      b.ground(path(flat(228, 270, -3), [[270, 9], [280, 9]]), { top: 0xf4f8ff });
      b.decor('pine', 250, -3, -2.6, 1.4);
      b.token(258, -1.4);
    },
  },

  // ---------------------------------------------------------------- 9
  {
    id: 'avalanche',
    name: 'Avalanche!',
    desc: 'A breakneck downhill run with boulders hot on your heels.',
    theme: 'snow',
    difficulty: 3,
    par: 40,
    start: [0, 60],
    build(b) {
      const pts = path(
        [[-50, 90], [-40, 82]],
        curve(-40, 82, -8, 61, 12),
        flat(-8, 8, 60),
        curve(8, 60, 40, 48, 10),
        [[40, 48], [44, 49.2]],
        [[44, 49.2], [46, 44]],
        curve(54, 42, 90, 30, 12),
        [[90, 30], [93, 31]],
        curve(100, 26, 140, 14, 12),
        hills(140, 180, 14, 1.2, 10, 1),
        curve(180, 14, 210, 2, 10),
        flat(210, 220, 2),
        pit(220, 232, 2, 6),
        flat(232, 280, 2),
        [[280, 14], [290, 14]],
      );
      b.ground(pts, { top: 0xf4f8ff });
      // boulders waiting uphill
      b.ball(-36, 84, 1.4, { color: 0x8a8f99, delay: 2.2 });
      b.ball(-31, 81.5, 1.1, { color: 0x7b808a, delay: 2.6 });
      b.ball(-26, 79, 1.6, { color: 0x8a8f99, delay: 3.0 });
      b.ball(-42, 87, 1.0, { spiked: true, delay: 3.4 });
      b.sign(-2, 60, 'RUN!!!');
      b.decor('pine', 4, 60, -2.4, 1.4);
      b.npc(26, b.groundAt(26));
      b.ball(70, b.groundAt(70) + 8, 0.9, { spiked: true, delay: 4.5 });
      b.platform(70, b.groundAt(70) + 6.5, 3, 0.4, -0.3, { style: 'wood' });
      b.checkpoint(110, b.groundAt(110));
      b.ball(124, b.groundAt(124) + 9, 1.2, { color: 0x7b808a, delay: 1.5 });
      b.platform(124, b.groundAt(124) + 7, 4, 0.4, -0.25, { style: 'wood' });
      for (const x of [150, 162, 174]) b.decor('pine', x, b.groundAt(x), -2.7, 1.2);
      b.npc(160, b.groundAt(160));
      b.spikes(226, -4, 11);
      b.ramp(213, 2, 6, 1.6, 1, { curve: true, style: 'wood' });
      b.token(268, 3.6);
    },
  },

  // ---------------------------------------------------------------- 10
  {
    id: 'domino-city',
    name: 'Domino City',
    desc: 'Smash through towers of planks, crates and glass. Bowling for bystanders.',
    theme: 'city',
    difficulty: 2,
    par: 45,
    start: [0, 0],
    build(b) {
      b.ground(path(
        [[-30, 12], [-12, 12], [-11, 0]],
        flat(-11, 250, 0),
        [[250, 14], [260, 14]],
      ), { top: 0x6d6d78 });
      b.sign(5, 0, 'STRIKE!');
      // domino row
      for (let i = 0; i < 9; i++) b.plank(26 + i * 1.6, 0, 0.3, 2.2, { color: [0xe74c3c, 0xf1c40f, 0x3498db][i % 3], density: 10 });
      b.ramp(46, 0, 6, 1.6, 1, { curve: true, style: 'concrete' });
      // crate pyramid
      for (let row = 0; row < 5; row++) {
        for (let i = 0; i < 5 - row; i++) b.crate(58 + i * 1.05 + row * 0.52, row * 1.0, 1.0);
      }
      b.npc(60.6, 5.0);
      b.checkpoint(70, 0);
      // glass office lobby
      b.platform(85, 6.2, 12, 0.6, 0, { style: 'concrete' });
      b.glass(79.3, 3, 0.3, 5.8);
      b.glass(90.7, 3, 0.3, 5.8);
      b.npc(83, 0);
      b.npc(86, 0);
      b.boost(96, 0, 0, 17, 3);
      // tall tower of planks
      for (let lvl = 0; lvl < 4; lvl++) {
        b.plank(108, lvl * 2.6, 0.3, 2.4);
        b.plank(111, lvl * 2.6, 0.3, 2.4);
        b.plank(109.5, lvl * 2.6 + 2.4, 3.6, 0.2);
      }
      b.npc(109.5, 10.4);
      b.ramp(122, 0, 5, 1.3, 1, { curve: true, style: 'concrete' });
      for (let i = 0; i < 12; i++) b.plank(132 + i * 1.3, 0, 0.3, 2.0 + i * 0.12, { color: i % 2 ? 0x9b59b6 : 0x1abc9c, density: 10 });
      b.barrel(152, 0);
      b.barrel(153, 0);
      b.barrel(152.5, 1);
      b.checkpoint(160, 0);
      for (let i = 0; i < 6; i++) b.npc(170 + i * 2.2, 0);
      b.ramp(186, 0, 6, 1.8, 1, { curve: true, style: 'concrete' });
      for (let row = 0; row < 6; row++) {
        for (let i = 0; i < 2; i++) b.crate(200 + i * 1.2, row * 1.2, 1.2);
      }
      b.decor('lamp', 30, 0, -1.6);
      b.decor('lamp', 120, 0, -1.6);
      b.token(238, 1.6);
    },
  },

  // ---------------------------------------------------------------- 11
  {
    id: 'buzzsaw-factory',
    name: 'Buzzsaw Factory',
    desc: 'Elevators, conveyor belts and hungry blades. Please keep limbs inside the vehicle.',
    theme: 'factory',
    difficulty: 5,
    par: 70,
    start: [0, 0],
    killY: -30,
    build(b) {
      b.ground(path(
        [[-30, 12], [-12, 12], [-11, 0]],
        flat(-11, 40, 0),
        pit(40, 52, 0, 8),
        flat(52, 80, 0),
      ), { top: 0x8d9097 });
      b.sign(5, 0, 'MIND THE\nBLADES');
      b.saw(20, 3.2, 1.1, { path: [20, 0.3], period: 2.0 });
      b.saw(30, 0.3, 1.1, { path: [30, 3.2], period: 2.0 });
      b.movingPlatform(46, -0.25, 9, 0.5, 0, -6, 5);
      b.spikes(46, -8, 11.5);
      b.conveyor(66, 0.2, 18, 6);
      b.saw(72, 3.0, 0.8, { spin: 22 });
      b.checkpoint(56, 0);
      // elevator up to the catwalk
      b.platform(95, 0.05, 30, 0.1, 0, { style: 'metal' });
      b.movingPlatform(84, 0.2, 4, 0.4, 0, 8.4, 6, { phase: 0 });
      b.platform(86.6, 3.9, 0.8, 7.8, 0, { style: 'hazard' });
      b.sign(90, 0, 'RIDE THE\nELEVATOR', { z: -2.4 });
      b.platform(107, 8.4, 41.6, 0.8, 0, { style: 'metal' });
      b.checkpoint(92, 8.8);
      b.saw(100, 9.6, 1.0, { path: [116, 9.6], period: 3.2 });
      b.barrel(110, 8.8);
      b.ramp(121, 8.8, 5, 1.2, 1, { curve: true, style: 'metal' });
      b.platform(145, 6.6, 14, 0.8, 0, { style: 'metal' });
      b.saw(146, 9.8, 1.0, { path: [146, 7.6], period: 1.6 });
      b.conveyor(160, 6.6, 16, -3);
      b.platform(178, 5.2, 16, 0.8, 0, { style: 'metal' });
      b.spikes(175, 5.6, 3);
      b.ramp(169, 5.6, 4, 1.0, 1, { curve: true, style: 'metal' });
      b.saw(183, 8.2, 1.3, { path: [183, 6.6], period: 2.4 });
      b.ground(path(flat(186, 230, 5.6), [[230, 18], [240, 18]]), { top: 0x8d9097 });
      b.npc(196, 5.6);
      b.token(220, 7.2);
    },
  },

  // ---------------------------------------------------------------- 12
  {
    id: 'loop-mania',
    name: 'Loop Mania',
    desc: 'Boost pads, double loops and trampolines. Speed is your friend.',
    theme: 'meadow',
    difficulty: 3,
    par: 45,
    start: [0, 0],
    build(b) {
      b.ground(path(
        [[-30, 10], [-12, 10], [-11, 0]],
        flat(-11, 104, 0),
        pit(104, 112, 0, 8),
        flat(112, 172, 0),
        curve(172, 0, 186, 3, 8),
        [[187, 3], [187, -6]],
        flat(187, 201, -6),
        [[201, -6], [201, 0]],
        flat(201, 260, 0),
        [[260, 12], [270, 12]],
      ));
      b.sign(4, 0, 'FULL SPEED\nAHEAD');
      b.boost(12, 0, 0, 20, 3);
      b.loop(28, 7, 7);
      b.boost(42, 0, 0, 20, 3);
      b.loop(58, 7, 7);
      b.checkpoint(70, 0);
      b.trampoline(80, 0, 3, 0, 14);
      b.platform(90, 6, 10, 0.6, 0, { style: 'wood' });
      b.spikes(90, 0, 8);
      b.boost(93, 6.3, 0, 20, 3);
      b.spikes(108, -8, 7.5);
      b.npc(125, 0);
      b.boost(132, 0, 0, 20, 3);
      b.loop(150, 7, 7);
      b.checkpoint(165, 0);
      b.spikes(194, -6, 13);
      b.boost(178, b.groundAt(178), 0.2, 18, 3);
      b.trampoline(214, 0, 3, 0.3, 15);
      b.npc(230, 0);
      b.npc(233, 0);
      b.token(248, 1.6);
    },
  },

  // ---------------------------------------------------------------- 13
  {
    id: 'stairway',
    name: 'Stairway to Pain',
    desc: 'A grand staircase, plate glass and spectators. Every step hurts.',
    theme: 'city',
    difficulty: 2,
    par: 40,
    start: [0, 48],
    build(b) {
      const pts = [[-30, 60], [-12, 60], [-11, 48], [10, 48]];
      let x = 10, y = 48;
      for (let i = 0; i < 24; i++) {
        pts.push([x, y - 0.6]);
        x += 2.0;
        y -= 0.6;
        pts.push([x, y]);
      }
      pts.push([x + 10, y]);
      const landingX = x + 10;
      const steps2 = [];
      let x2 = landingX, y2 = y;
      for (let i = 0; i < 20; i++) {
        steps2.push([x2, y2 - 0.75]);
        x2 += 2.4;
        y2 -= 0.75;
        steps2.push([x2, y2]);
      }
      b.ground(path(pts, steps2, flat(x2, x2 + 60, y2), [[x2 + 60, y2 + 12], [x2 + 70, y2 + 12]]), { top: 0xb8b8c0 });
      b.sign(4, 48, 'MIND THE\nSTEP');
      b.decor('lamp', 20, 46, -1.8);
      for (let i = 0; i < 5; i++) b.npc(16 + i * 9, b.groundAt(16 + i * 9) + 0.0);
      b.glass(36, b.groundAt(36) + 1.6, 0.25, 3.2);
      b.glass(52, b.groundAt(52) + 1.6, 0.25, 3.2);
      b.checkpoint(landingX - 6, y);
      for (let i = 0; i < 4; i++) b.npc(landingX + 6 + i * 12, b.groundAt(landingX + 6 + i * 12));
      b.glass(landingX + 20, b.groundAt(landingX + 20) + 1.6, 0.25, 3.2);
      b.crate(landingX + 30, b.groundAt(landingX + 30), 1);
      b.spikes(x2 + 14, y2, 3);
      b.ramp(x2 + 7, y2, 5, 1.3, 1, { curve: true, style: 'concrete' });
      b.token(x2 + 46, y2 + 1.6);
    },
  },

  // ---------------------------------------------------------------- 14
  {
    id: 'gauntlet',
    name: 'Gauntlet of Doom',
    desc: 'The final exam. Everything you have survived so far, all at once.',
    theme: 'night',
    difficulty: 5,
    par: 90,
    start: [0, 0],
    killY: -30,
    build(b) {
      b.ground(path(
        [[-30, 12], [-12, 12], [-11, 0]],
        flat(-11, 30, 0),
        flat(30, 84, 0),
        pit(84, 100, 0, 10),
        flat(100, 140, 0),
      ), { top: 0x3f9a63 });
      b.sign(5, 0, 'GOOD LUCK');
      hop(b, 27, 0, 'mines', 2);
      hop(b, 45, 0, 'mines', 3);
      b.barrel(61, 0);
      b.ramp(70, 0, 7, 1.9, 1, { curve: true, style: 'wood' });
      b.bridge(84, 0, 100, 0, { strength: 55000 });
      b.spikes(92, -10, 15);
      b.wreckingBall(92, 12, 9.5, 0.9, 1.0);
      b.checkpoint(106, 0);
      b.platform(126, 7.75, 1.6, 0.5, 0, { style: 'concrete' });
      b.harpoon(126, 8, { range: 22 });
      b.ramp(132, 0, 6, 1.6, 1, { curve: true, style: 'concrete' });
      b.fan(146, -16, PI / 2, 10, 26, 40);
      b.ground(path(flat(152, 196, 2)), { top: 0x3f9a63 });
      b.saw(166, 4.2, 1.0, { path: [166, 2.4], period: 1.8 });
      b.saw(176, 2.4, 1.0, { path: [176, 4.2], period: 1.8 });
      b.checkpoint(158, 2);
      b.boost(182, 2, 0, 20, 3);
      b.ground(path(flat(196, 198, 2), [[198, 2], [198, -2]], flat(198, 250, -2)), { top: 0x3f9a63 });
      b.loop(212, 5, 7);
      b.glass(224, 0, 0.3, 4);
      b.barrel(230, -2);
      b.mine(236, -2);
      b.checkpoint(240, -2);
      b.trampoline(248, -2, 2.4, 0.35, 16);
      b.ground(path(flat(250, 252, 4), flat(252, 290, 4)), { top: 0x3f9a63 });
      b.ground(path([[250, -2], [250, 4]]), { top: false });
      b.platform(268, 9.6, 0.8, 5.2, 0, { style: 'concrete' });
      b.glass(268, 5.5, 0.4, 2.9);
      b.npc(276, 4);
      b.npc(279, 4);
      b.platform(300, 10.75, 1.6, 0.5, 0, { style: 'concrete' });
      b.harpoon(300, 11, { range: 24, rate: 1.8 });
      b.ground(path(flat(290, 320, 4), [[320, 16], [330, 16]]), { top: 0x3f9a63 });
      b.token(312, 5.6);
    },
  },
];
