# Breachpoint — Tactical Tower Assault

A 3D lane-battler (Three.js) where Counter-Terrorists face Insurgents across a desert map. You play against a bot that emulates ranked matchmaking; pick your side in the menu.

Serve the folder over HTTP (`python3 -m http.server`); ES modules don't load from `file://`.

## Map: Dustline

A sandstone wall splits the field with three crossings:

- **Long Doors** (left): wide gate, a proximity mine in the doorway, deep sand on the far side.
- **Mid Doors** (centre): narrow, mined at both ends, runs over the **Supply Drop** (hold it for +40% funds).
- **Tunnels** (right): a roofed passage; ground troops inside are concealed until enemies get close or they fire.

## Cards (14)

Riflemen, SMG Rush, Marksman, Heavy Gunner (shotgun splash), Assault Mech (structure-only), K-9 Unit, Breacher (plants a charge on a structure and dies in the blast), Recon Drone, Kamikaze Drones, Sentry Gun, Frag Grenade, Smoke Grenade (conceals everything inside for 7 s), Flashbang (2.4 s stun), Molotov (fire area).

## Assets — all CC0

| What | Source |
|---|---|
| Soldiers (CT blue SWAT, camo, sand-balaclava insurgents) | Quaternius, Ultimate Animated Character Pack |
| Rifles, SMG, shotgun, pistol, containers, barrels, pallets, barriers, water tower, armoured truck, K-9 | Quaternius, Zombie Apocalypse Kit |
| Assault mechs | Quaternius, Animated Mech Pack |
| Towers and walls | Kenney, Castle Kit |
| Drones, sentry turret | Kenney, Tower Defense Kit and Space Kit |
| Crates, grenade | Kenney, Blaster Kit; Survival Kit; Retro Urban Kit |
| Gunfire | Real recordings (AK-47, Carl Gustav M45, PPSh, 1911, .22 Magnum) from The Free Firearm Sound Library and OpenGameArt CC0 packs |
| Explosions, impacts, footsteps, dog, voices, smoke, fire, rotor and wind loops | CC0 recordings by OpenGameArt authors (EZduzziteh, qubodup, rubberduck, HaelDB and others); full per-file list in `assets/audio/CREDITS.md` |
| Announcer, victory sting | Kenney audio packs |
| Music | "Battle Theme A" by cynicmusic; "Head in the Sand" by congusbongus (OpenGameArt, CC0) |

License files are in `assets/licenses/` and `assets/audio/`. `js/assets-data.js` is `assets/models/*.glb` base64-packed (some hosts won't serve `.glb`).
