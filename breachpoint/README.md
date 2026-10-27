# Breachpoint — Tactical Tower Assault

A 3D lane-battler (Three.js) where Counter-Terrorists face Insurgents across a desert map. You play against a bot that emulates ranked matchmaking; pick your side in the menu.

Serve the folder over HTTP (`python3 -m http.server`); ES modules don't load from `file://`.

## Maps

Pick a map in the menu. Every map is mirrored across its centre line, so both sides play exactly the same ground (`js/maps.js` holds the definitions; the player half is authored and the rival half is generated).

- **Dustline** (desert): three lanes (Long, Mid, Tunnels) split by a dry riverbed with bridges; jungle blocks between the lanes; Supply Drop, Armory and Med Station in the river.
- **Overpass** (urban): an octagonal city block. A canal cuts off the B side and is crossed only by footbridges and the highway overpass. Two outpost lanes (A past the park, B through the Monster tunnel) plus the Connector, a walled passage from each base to the central plaza. Objectives: Supply Drop, Construction Site, Pharmacy.
- **Citadel** (medieval): each side holds a walled castle behind a moat; the wall opens only at two gatehouses with drawbridges. A village lies between the castles with the Market, the Smithy and the Chapel; orchards on the flanks hide troops.

## Rules

- **Shields:** an inner outpost can't be damaged while its lane's outer outpost stands; the Command Post can't be damaged until any inner outpost falls. Destroying the Command Post wins. Two-lane maps have tougher outposts.
- **Objectives:** funds +40%, troops +15% damage, troops heal 1.5%/s. Capture by holding the pad with troops alone.
- **Recruit waves:** every 30 s each base sends three recruits down every route. Card units march the nearest route when nothing is in sight.
- **Deploying:** your half of the map, plus a forward zone around each enemy outpost you destroy (+$2 each).
- **Veterancy:** units earn XP in combat (time fighting, damage, kills) and level up to 4 (+HP, +damage, faster fire; chevrons overhead). XP a card's units earn also ranks the card up, so later deployments start at a higher level.
- **Match:** 8 minutes (double funds in the last 2), then 2 minutes of sudden death; without a Command Post kill, more outposts destroyed wins.
- **Camera:** drag to pan, pinch/scroll to zoom, tap the minimap; WASD/arrows, +/-, Space for base.

## Cards (28)

- **Troops:** Riflemen, SMG Rush, Marksman, Heavy Gunner (shotgun splash), Grenadier (lobbed grenades, minimum range), Rocket Trooper (2.5× vs mechs, vehicles and drones), K-9 Unit.
- **Melee:** Ghost (knife; cloaked until it strikes), Riot Shield (blocks 65% of gunfire from the front), Breacher (plants a charge on a structure and dies in the blast).
- **Support:** Combat Medic (heals nearby troops and follows the wounded), Combat Engineer (repairs outposts and turrets), Field Commander (aura: +25% damage, +20% speed), Medevac (unarmed ambulance with a big heal aura).
- **Vehicles & machines:** Armored Car (fast, fires on the move at ground and air), Assault Mech (structure-only), Recon Drone, Kamikaze Drones.
- **Buildings:** Sentry Gun, Mortar Pit (11 m artillery, can't hit close or air), Barricade (blocks a path, soaks fire).
- **Tactical:** Frag, Smoke, Flashbang, Molotov, Airstrike (a jet bombs a line after a delay), EMP (machines shut down 4.5 s, troops 1 s), Adrenaline (heal 20% and +40% speed and fire rate for 6 s).

## Assets — all CC0

| What | Source |
|---|---|
| Soldiers (CT blue SWAT, camo, sand-balaclava insurgents) | Quaternius, Ultimate Animated Character Pack |
| Rifles, SMG, shotgun, pistol, containers, barrels, pallets, barriers, water tower, armoured truck, K-9 | Quaternius, Zombie Apocalypse Kit |
| Assault mechs | Quaternius, Animated Mech Pack |
| Medics, engineers, commander, ghosts, rocket trooper | Quaternius, Ultimate Animated Character Pack (Doctor, Worker, Suit, Cowboy, Ninja, Soldier) |
| Armored car, technical, ambulance | Kenney, Car Kit (police, truck, ambulance) |
| Mortar | Kenney, Tower Defense Kit (cannon) |
| Rocket launcher, airstrike jet | Kenney, Space Kit (weapon rifle, racer craft) |
| Knife | KayKit, Fantasy Weapons Bits (dagger) |
| Riot shield, engineer's hammer | Kenney, Survival Kit (metal panel, hammer) |
| Overpass city blocks, cars, park trees, road furniture | Kenney, City Kit Commercial / Suburban / Industrial / Roads; Car Kit |
| Citadel walls, gatehouses, drawbridges, siege engines | Kenney, Castle Kit |
| Citadel houses, market stalls, fountain, hedges, trees | Kenney, Fantasy Town Kit |
| Towers and walls | Kenney, Castle Kit |
| Drones, sentry turret | Kenney, Tower Defense Kit and Space Kit |
| Crates, grenade | Kenney, Blaster Kit; Survival Kit; Retro Urban Kit |
| Gunfire | Real recordings (AK-47, Carl Gustav M45, PPSh, 1911, .22 Magnum) from The Free Firearm Sound Library and OpenGameArt CC0 packs |
| Explosions, impacts, footsteps, dog, voices, smoke, fire, rotor and wind loops | CC0 recordings by OpenGameArt authors (EZduzziteh, qubodup, rubberduck, HaelDB and others); full per-file list in `assets/audio/CREDITS.md` |
| Announcer | Kenney Voiceover Pack |
| Victory fanfare, victory and defeat songs | "Classic fanfare lick" by fvcalderan; "Town Theme RPG" and "Crystal Cave" by cynicmusic (OpenGameArt, CC0) |
| Music | "Battle Theme A" by cynicmusic; "Head in the Sand" by congusbongus (OpenGameArt, CC0) |

License files are in `assets/licenses/` and `assets/audio/`. `js/assets-data.js` packs the shared models; `js/assets-urban.js` and `js/assets-castle.js` pack each map's props and load only when that map is chosen (some hosts won't serve `.glb`).
