# Maze Walk — find the way out (WebXR)

Lesson 12 example (from 3D images on a screen → VR/XR): a WebXR demo where you
walk through a maze in first-person view and find the way out.

The XR part uses the same battle-tested engine as `../walking_xr` (the mountain
walking demo): world-group anchored to the real floor, one `setAnimationLoop`
for every mode, XR entry only from a real button tap, and a guaranteed return
to flat mode if a device starts an XR session and then fails. The mountains,
grass, trees and sun are replaced by maze walls.

## What the demo does

- **Maze** = a new random map every load: a random-DFS carving of a 15×15 grid
  = a *perfect maze* (a spanning tree): **exactly one route leads out**, every
  junction branch is a dead end. `?seed=N` in the URL reproduces the same map.
  Rendered with one `InstancedMesh` (127 wall blocks, brick texture); collision
  is checked against the grid (circle vs cell AABB), so you never clip a wall.
- **Exit = a real gap in the wall.** The outer wall on the goal corridor row is
  knocked out: walk straight through the gap, out onto the open ground, to the
  orange beacon → confetti + the sign redraws "YOU ESCAPED!". You physically
  leave the maze instead of just touching a finish line.
- **Controls (the required spec):** look downward ~20° from the horizon → you
  walk smoothly toward where you look (straight / left / right). Deeper =
  faster (up to 2.3 m/s), look up = stop. A muted ring appears on the floor
  where your gaze lands while walking.
- **Fallback (no WebXR):** flat-screen FPS — WASD + mouse look (click to lock
  pointer) or finger-drag on phones, hold **Space** (or the WALK/STOP button on
  touch devices) to try the same gaze-walk.

## How to run

`three.module.js` (three.js r169, vendored from walking_xr) sits next to
`index.html` — no internet needed. ES modules require http(s), not `file://`.

Computer (flat mode):

    cd SCMA292_lesson12
    python3 -m http.server 8080
    # open http://localhost:8080/Maze/

Phone / headset (needs a **secure origin** — WebXR removes `navigator.xr` on
plain http://lan-ip):

    openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 30 -subj "/CN=maze.local"
    python3 serve_https.py 8443 key.pem cert.pem
    # on the phone open https://<computer-ip>:8443/Maze/  (tap Advanced → Proceed on the cert warning)

Or any https tunnel (e.g. `cloudflared tunnel`). A tunnel URL must be opened as
`https://…trycloudflare.com/…/Maze/`.

## How the XR entry works (browser rules, not options)

1. At load the page only *probes* support: `isSessionSupported('immersive-vr')`
   then `'immersive-ar'`. If either works, a button "🥽 Enter VR / Enter AR"
   appears. `requestSession()` only ever runs inside that tap (user-gesture
   rule) — auto-starting XR is rejected by real devices.
2. `setReferenceSpaceType('local-floor')` **before** `setSession()`; if
   `local-floor` is refused, the page cleanly retries `local`. On total failure
   the button reports "⚠ XR could not start on this device — try Chrome" and
   the flat mode keeps working — nothing ever gets stuck (all input checks read
   `renderer.xr.isPresenting`, the same trick that made walking_xr reliable).
3. In the world-group trick the camera stays at the XR origin and the maze
   `world` group is offset by (−px, 0, −pz), so the maze floor always sits at
   your real floor.
4. AR passthrough: when `session.environmentBlendMode !== 'opaque'` the sky is
   hidden — you see your real room, the maze stands on your real floor.
5. On Android, **Google Chrome** (ARCore) is the best-tested browser. Brave may
   open the camera and then drop the session — the app recovers to flat touch
   mode automatically (drag to look + WALK/STOP button).

## Debug / screenshot hooks (used by the automated tests)

| URL suffix | effect |
|---|---|
| `?seed=N` | fixed random map (absent = new map each load) |
| `?pos=x,z` | start at this maze position |
| `?look=p,y` | starting look angle in degrees (negative pitch = down) |
| `?walk=1` | force gaze-walk in flat mode (for tests/screenshots) |
| `?view=overview` | top-down view of the whole maze (shows the exit gap) |
| `?view=goal` | view from the goal corridor through the exit gap |
| `?ui=0` | hide the overlay |

`window.__app` exposes `status() / setPlayer() / setLook() / probe() /
enterXR()` for headless testing. A puppeteer suite (19 checks) verifies: seeded
map determinism, the graph is a spanning tree (**unique route to the exit, all
branches dead ends**), the exit gap is walkable, gaze-walk engages at ≥20° and
not at 10°, wall collision, win at the beacon outside the wall, and the
XR-button flow including a device that fails mid-session.

Run them yourself (dev-only, needs Node + puppeteer):

    cd Maze/test && npm i puppeteer
    MAZE_TEST_BASE=http://localhost:8080/Maze/index.html node verify.mjs

## What to observe from the lesson

- Flat screen = one camera, one viewpoint — depth only from parallax/shadows
  ("the guess from one view is ambiguous"). In XR the world is anchored to the
  real floor and your real head pose drives a stereo camera — the maze becomes
  a place you physically walk through and *exit through a hole in the wall*.

## Files

- `index.html` — the whole program (single file, English-only UI)
- `three.module.js` — three.js r169 vendored copy (from walking_xr)
- `serve_https.py` — tiny https server for the phone's secure-origin requirement
- `_preview/` — verified screenshots (overview, first-person, walking+gaze ring,
  exit gap, escaped screen, outer sign face)
