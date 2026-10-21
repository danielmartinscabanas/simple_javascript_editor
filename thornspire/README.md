# Thornspire — Siege of the Weeping Rift

A gothic dark-fantasy lane-battler in 3D (Three.js), played against a bot that emulates ranked PvP matchmaking.

Open `index.html` through any static server (`python3 -m http.server` in this folder) — ES modules don't load from `file://`.

## The arena

No two-lane layout. A chasm of embers splits the field with **three crossings**: two long flank bridges and a short central causeway through the **Altar of the Pale Saint** (hold it with units alone and your souls regenerate 40% faster). **Spike galleries** on every crossing erupt on a rhythm for 130 damage to ground units. **Thornbrakes** hide ground units from enemies and spires until something comes within arm's reach or they attack. **Weeping Mire** tar pools halve ground speed at the foot of each flank bridge. Mausoleums and weeping-angel statues block sightlines and force pathing.

## Rules

Three minutes, souls cap at 10 and regenerate twice as fast in the final minute, then one minute of sudden death; tiebreak on lowest spire health. Bell Towers give a crown and open deployment ground behind them; the Cathedral Keep wakes when hit or when a Bell Tower falls, and felling it takes all three crowns.

12 cards (8 per deck, chosen in the Grimoire): Grave Knight, Ossuary Horde, Witch-Hunters, Gargoyle, Bone Colossus, Hemomancer, Vampire Lord, Wraiths, Gallows Lantern, Hellfire, Murder of Crows, Raise the Dead.

## Code map

- `js/config.js` — arena layout, card stats, factions
- `js/nav.js` — navigation grid + A* (hazard-weighted)
- `js/world.js` — arena geometry, lighting, hazards, ambient FX
- `js/models.js` — procedural unit and spire models
- `js/sim.js` — simulation: targeting, combat, projectiles, spells, hazards, altar, crowns
- `js/bot.js` — rival AI (defence, pushes, spell timing, altar contesting, emotes)
- `js/audio.js` — procedural WebAudio (bells, drones, impacts)
- `js/main.js` — renderer, camera framing, UI flow, input, emulated matchmaking

## Credits

Skeleton units (Grave Knight, Ossuary Horde, Witch-Hunters, Bone Colossus, Hemomancer) use the rigged, animated models and weapons from the [KayKit Character Pack: Skeletons](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0) by Kay Lousberg, released under CC0. Assets in `assets/` were trimmed to the animations the game uses; the license is in `assets/LICENSE-KayKit-Skeletons.txt`.

`js/assets-data.js` is the same `.glb` files base64-packed into a module (some static hosts won't serve `.glb`). Regenerate it after changing `assets/`.
