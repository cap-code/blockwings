# ✈ BlockWings — Voxel Earth Flight & Combat Simulator

A Minecraft-style flight simulator for the browser. Fly eleven blocky
aircraft over the **entire Earth** — every continent, ocean, mountain range,
desert, rainforest and 30 major cities, generated as voxel terrain that
streams in around you as you fly. Then arm up: machine guns, bombs and a
chargeable ULTRA strike, against AI rivals offline or other players online.
Works on desktop and mobile (touch controls).

## Run it

Any static web server works (ES modules can't load from `file://`):

```bash
cd blockwings
python3 -m http.server 8080
# open http://localhost:8080
```

The only external dependency is Three.js, loaded from a CDN, so you need
internet on first load.

To play on your phone, serve from your computer and open
`http://<your-computer-ip>:8080` on the phone (same Wi-Fi), or host the folder
on any static host (GitHub Pages, Netlify, etc.).

## Game modes

- **🗺 Free flight** — the classic sightseeing sim. Weapons still work if you
  fancy strafing an empty desert.
- **🤖 VS Bots** — five AI rival pilots (Maverick, Viper, Iceman…) spawn
  around you, hunt you (and each other) with lead-pursuit gunnery, and
  respawn when downed. Kill feed + scoreboard (Tab) keep score.
- **🌐 Online** — competitive multiplayer dogfights. Run the arena server:

  ```bash
  npm install
  npm start          # ws://0.0.0.0:8081  (PORT=… to change)
  ```

  Pick ONLINE in the menu, enter your callsign and the server address
  (`ws://<host>:8081`, or `wss://…` behind TLS). Everyone in the arena sees
  each other's planes, paint jobs, tracers, bombs and ultras; the server
  referees hits, kills, respawns and the scoreboard.

## Weapons

| Weapon | Key | Notes |
|---|---|---|
| 🔫 Machine guns | hold **Space** / LMB | twin tracers; sustained fire overheats |
| 🚀 Missile | **V** / RMB | 8 in stock (slow regen); homing when LOCKED |
| 💣 Bomb | **F** | falls with your momentum, big splash damage |
| 🌟 ULTRA | **G** | charge by dealing damage; 6 homing missiles + afterburner |

**🔒 Lock-on (Ace Combat style):** keep an enemy inside your nose cone and a
green target box appears with a ticking lock tone; hold them there ~1 second
and it snaps to a red **LOCK** — missiles fired now chase that plane hard.
Lose them from the wider keep-cone and the lock drops. Without a lock,
missiles dumb-fire straight ahead. When someone locks *you*, a flashing
**⚠ MISSILE ⚠** warning and tone tell you to break hard — missiles can be
out-turned at close range. Bots fire missiles too, so keep checking six.

HP, heat, missile stock, bomb cooldown and ultra charge live on the
bottom-center combat bar. Get shot down and you respawn a few seconds
later, mid-air, full HP.

## The garage 🔧

Hit **GARAGE** in the menu: a live rotating preview of your plane with
- **paint shop** — primary & secondary colors (16-color palette, or stock)
- **upgrade bay** — 6 points across ENGINE (speed/accel), ARMOR (HP) and
  GUNS (damage/fire rate), 3 max per system

Everything persists in your browser per-plane, and your custom paint is what
other players see online.

## The planet

The world is a 65,536 × 32,768-block cylinder (1 block ≈ 0.6 km, longitude
wraps — fly west long enough and you circumnavigate the globe). Terrain is
generated from hand-built continent outlines + 35 real mountain ranges +
27 real rivers + lakes + climate zones, rasterized at startup, then detailed
with fractal noise:

- biomes by latitude & climate: jungle, savanna, desert, temperate, taiga,
  tundra, polar ice — each with its own trees (palms, oaks, conifers, acacias,
  cacti), wildflower meadows, and an alpine gradient where vegetation dries
  into scree as the ground climbs
- towering ranges: the big ranges rise on a quadratic curve with ridged-noise
  crests, Everest tops out far above most planes' service ceilings
- rivers you can follow from the air — the Amazon, Nile, Mississippi, Yangtze,
  Volga, Congo and more, carved into valleys that wind to the sea — plus the
  great lakes: Victoria, Baikal, Titicaca, Chad, Winnipeg, …
- turquoise shallows fading to deep ocean blue, beaches, island chains
- blocky skylines at 30 real cities (Kochi, New York, Tokyo, London, …)
- puffy multi-block cloud clusters drifting on the westerlies
- the minimap (M) shows the whole planet, your position, and every airport

## Airports

Nine international airports with realistic, full-size layouts: a 181×11-block
runway with piano-key thresholds, dashed centerline, touchdown-zone stripes,
aiming-point bars and white edge lines; a wide parallel taxiway (dashed
yellow taxi line) with five connectors; and a huge concrete apron with a pier
terminal, jet bridges, a 22-block control tower, triple hangars, a fuel farm
and a marked helipad:

Kochi · New York JFK · Los Angeles LAX · London Heathrow · Cairo ·
Dubai · Tokyo Haneda · Sydney · Rio Galeão

Pick a "🛫 … — runway" start location to spawn parked at the threshold:
throttle up (Shift), and pull up past your aircraft's **Vr** to take off.
Airports are the white squares on the minimap.

## Takeoff & landing

Every airframe has its own envelope, shown live on the HUD:

- **Vr** — rotation speed; the ground-roll readout counts you up to it
- **vland / vsink** — max touchdown speed and descent rate; the 🛬 approach
  line warns (⚠) when you're hot or dropping too fast. Inside the envelope
  you grease it on; a bit outside is a HARD LANDING that dents the airframe;
  well outside is a crater
- **rough field** — bush planes, warbirds and the Herc land on grass; the
  jet, airliner, Comet and shuttle need pavement (a grass landing wrecks the
  gear), and only the Pelican can land on water
- **service ceiling** — each aircraft has a max altitude where thin air drags
  it back down (it always leaves you ~40 blocks over high terrain). Only the
  🛰 Astro Shuttle reaches space
- the 🕊 Whisper Glider has no engine: hold full throttle on the ground to
  hook the **winch**, then pull up and ride the sky
- the 🚁 Hover Hornet is a helicopter: throttle is the collective (above 50%
  climbs, below sinks), tilt the nose to translate, hover, and set the skids
  down anywhere — including the apron helipad

## Crashes

Hit the ground too hard and the plane **dismantles** — every block of the
airframe flies off with its own momentum, tumbles, bounces and burns out in
a shower of fire cubes, watched by a pull-back crash camera. You respawn
mid-air a few seconds later.

## The fleet

| Plane | Character |
|---|---|
| 🐝 Bumble Biplane | slow, forgiving sightseer |
| 🌲 Bush Hopper | high-wing prop, lands almost anywhere |
| 🪖 Warhawk | WWII fighter, fast rolls |
| ⚡ Falcon Jet | twitchy supersonic fighter |
| 🚁 Hover Hornet | helicopter — hover, strafe, land anywhere |
| 🛫 Sky Liner 747 | stately heavy jumbo |
| 📦 Herc Cargo | four props, fat belly |
| 🌊 Pelican Seaplane | the only one that can land on water |
| 🕊 Whisper Glider | no engine — trade altitude for speed |
| 🎪 Aero Ace | aerobatic monster, huge roll rate |
| 🚀 Comet SST | fastest thing in the sky |

## Controls

**🖱 Mouse flight (recommended for dogfights):** click the screen in flight
to grab the mouse — it becomes a virtual stick with an on-screen steering
reticle. Fine movements near the center for gunnery, full deflection for
hard banks; the plane also feeds in coordinated rudder. **LMB** guns ·
**RMB** missile · **scroll wheel** throttle · **middle-click** recenter stick ·
**Esc** release the mouse. In combat a red **◇ lead pip** marks where to aim
so your bullets and the nearest enemy arrive at the same spot, and an amber
**➤ edge arrow** points at them when they're off-screen.

**Keyboard:** W/S or ↑/↓ pitch · A/D or ←/→ roll (banking turns the plane) ·
Q/E rudder · Shift / Ctrl throttle · Space fire · F bomb · G ultra ·
Tab scoreboard · C camera (chase / cockpit / far) · M map · R reset ·
Esc plane menu

**Mobile:** touch anywhere on the left = virtual stick · right slider =
throttle · ◀ ▶ rudder · 🔫 hold to fire · 💣 bomb · 🌟 ultra · buttons for
menu / camera / map / sound

Watch your speed: get too slow and you stall. Land gently (shallow descent,
wings level) and you can taxi and take off again.

## Files

- `js/world.js` — Earth data + rasterizer + terrain/biome/airport sampling
- `js/terrain.js` — chunked voxel mesher & streaming
- `js/planes.js` — the twelve aircraft: stats, flight envelopes, paint slots, gun hardpoints
- `js/input.js` — keyboard & touch controls (incl. combat buttons)
- `js/combat.js` — bullets, bombs, homing missiles, explosions, name tags
- `js/bots.js` — AI rival pilots for VS BOTS
- `js/net.js` — multiplayer client (state sync + interpolation)
- `js/garage.js` — paint shop, upgrades, live 3D preview
- `js/main.js` — physics, camera, HUD, minimap, menu, sound, game modes
- `server.js` — the online arena server (Node + ws)
# blockwings
