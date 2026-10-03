# Hapless Wheels

A Happy Wheels–style ragdoll physics racer for the browser, built with **three.js** (rendering) and **planck.js** (a JavaScript port of Box2D, the engine the original game used).

Pick a hapless rider, guide their vehicle through 14 obstacle-course levels and reach the golden star. Limbs come off, heads pop, and you can keep riding as long as you're still alive.

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:5174 (or whichever port Vite prints). To make a static build, run `npm run build`; the output goes to `dist/`.

## Controls

| Key | Action |
| --- | --- |
| ↑ / ↓ (W / S) | Accelerate / reverse |
| ← / → (A / D) | Lean back / forward (also works in mid-air) |
| Space | Primary ability |
| Shift / Ctrl | Secondary ability |
| Z | Eject (after ejecting, arrows flail your limbs and Space curls you into a ball) |
| Enter | Retry from the last checkpoint (or go to the next level after winning) |
| R | Restart the level |
| Esc / P | Pause |
| M | Mute |

Touch devices get on-screen buttons.

## Characters

| Rider | Vehicle | Space | Shift |
| --- | --- | --- | --- |
| Wendell | Rocket Wheelchair | Rocket boost | Lift jets |
| Gary | Gyro Board (self-balancing) | Jump | Brake |
| Reckless Dad (+ Junior) | Bicycle with a child seat; the pedals really turn | Brake | Bell |
| Bargain Betty | Motorized Cart (with groceries) | Jump | Brake |
| Scooter Sal | Turbo Moped | Turbo | Brake |

## Levels

1. **First Steps**: tutorial hills, a spike hop, a boost pad and a pit jump
2. **Rolling Hills**: rope bridge over a spike ravine, a loop-the-loop, a seesaw
3. **Skyscraper Scramble**: rooftop gaps, office glass to smash through, steel girders
4. **Mine Your Step**: kicker ramps over minefields, chain-reaction barrels, a harpoon turret
5. **Wrecking Yard**: swinging wrecking balls, a reverse conveyor, buzzsaws on rails
6. **Spike Canyon**: breakable rope bridge, pillar hopping, spiked canyon walls
7. **Harpoon Alley**: tracking harpoon turrets; hide under the shelters
8. **Blizzard Lift**: fans that blow you across chasms, ice slides, a trampoline pit
9. **Avalanche!**: a downhill run with boulders released behind you
10. **Domino City**: domino rows, a crate pyramid, a plank tower, a crowd to bowl through
11. **Buzzsaw Factory**: moving saws, an elevator ride, catwalks and conveyors
12. **Loop Mania**: a triple loop with boost pads and trampolines
13. **Stairway to Pain**: two long staircases lined with plate glass and spectators
14. **Gauntlet of Doom**: everything at once, with checkpoints

Best times are saved in `localStorage`. Finishing under par earns gold, within 1.5× par earns silver, and anything slower earns bronze.

## Settings

- **Blood & gore:** off / mild / normal / extra
- **Body toughness:** fragile / normal / tough / iron. This scales how easily joints break and how hard an impact has to be to kill.

## How it works

- `src/ragdoll.js`: a 10-part ragdoll. Poses are solved with 2-bone IK. Revolute joints use limits and PD "muscle" motors. Joints rip when the reaction force gets too high. Also handles impaling, severing and head explosions.
- `src/characters.js`: vehicles, the breakable grips between rider and vehicle, and per-vehicle abilities. A small anti-wheelie torque keeps full throttle controllable.
- `src/objects.js`: the level-building kit (terrain, ramps, spikes, mines, barrels, boost pads, trampolines, conveyors, wrecking balls, saws, harpoon turrets, fans, glass, bridges, seesaws, elevators, loops, NPCs, checkpoints, finish token).
- `src/levels.js`: the 14 levels, written as code against that kit.
- `src/game.js`: fixed 120 Hz physics step, contact handling (damage comes from impact closing speed), checkpoints, win and death.
- `src/effects.js`: instanced blood droplets that leave decals where they land, sparks, smoke, explosions, glass shards and gibs.
- `src/audio.js`: every sound is synthesized with Web Audio, including the screams. There are no audio files.

### Dev helpers

Under `npm run dev`, `src/devtools.js` adds console helpers:

- `auto(levelIndex, charId, seconds)` runs a level headlessly with an autopilot.
- `sweepAll([levels])` runs every character through the given levels.
- `survey(level, [[x, y], ...])` captures overview shots of a level. It needs `HW_SHOT_DIR` set; see `vite.config.js`.

This is a fan-made homage with original characters, art and levels. It isn't affiliated with the original Happy Wheels.
