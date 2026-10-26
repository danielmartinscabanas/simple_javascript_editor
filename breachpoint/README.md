# Breachpoint — Tactical Tower Assault

A 3D lane-battler (Three.js) where Counter-Terrorists face Insurgents across a desert map. You play against a bot that emulates ranked matchmaking; pick your side in the menu.

Serve the folder over HTTP (`python3 -m http.server`); ES modules don't load from `file://`.

## Map: Dustline

A three-lane map (40 × 68 m) in the spirit of a MOBA, played with cards:

- **Lanes:** Long (left, open and mined), Mid (straight over the river), Tunnels (right; a walled stretch at the river hides troops). Each lane has an outer and an inner outpost; the Command Post sits in the base.
- **Shields:** an inner outpost can't be damaged while its lane's outer outpost stands; the Command Post can't be damaged until any inner outpost falls. Destroying the Command Post wins.
- **River objectives:** Supply Drop (funds +40%), Armory (troops +15% damage), Med Station (troops heal 1.5%/s). Capture by holding the pad with troops alone.
- **Jungle:** flat-roofed blocks, containers and walls between the lanes, with deep-sand patches and mines.
- **Recruit waves:** every 30 s each base sends three recruits down every lane. Card units march the nearest lane when nothing is in sight.
- **Deploying:** your side of the river, plus a forward zone around each enemy outpost you destroy (+$2 each).
- **Veterancy:** units earn XP in combat (time fighting, damage, kills) and level up to 4 (+HP, +damage, faster fire; chevrons overhead). XP a card's units earn also ranks the card up, so later deployments start at a higher level.
- **Match:** 8 minutes (double funds in the last 2), then 2 minutes of sudden death; without a Command Post kill, more outposts destroyed wins.
- **Camera:** drag to pan, pinch/scroll to zoom, tap the minimap; WASD/arrows, +/-, Space for base.

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
| Announcer | Kenney Voiceover Pack |
| Victory fanfare, victory and defeat songs | "Classic fanfare lick" by fvcalderan; "Town Theme RPG" and "Crystal Cave" by cynicmusic (OpenGameArt, CC0) |
| Music | "Battle Theme A" by cynicmusic; "Head in the Sand" by congusbongus (OpenGameArt, CC0) |

License files are in `assets/licenses/` and `assets/audio/`. `js/assets-data.js` is `assets/models/*.glb` base64-packed (some hosts won't serve `.glb`).
