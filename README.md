# Glossy XR

**Spatially anchored, multi-user voice annotation inside a 3D scene, in the browser.**

Put on a headset, pull the trigger, say something, let go. The recording is pinned to the spot in the scene where your hand was, tagged with who said it, when, and which layer it belongs to (a draft, a review pass, a period of time, whatever the project needs). Everyone else who opens the scene hears it there. Walk up to a marker and it plays. Export the whole set as JSON.

Glossy XR is the 2026 rebuild of [Glossy](https://github.com/ainsleys/glossy), a prototype Ainsley Sutherland built at the BuzzFeed Open Lab in October 2016 to let editors and producers leave notes inside a VR piece instead of describing positions in an email. The idea carried through [Voxhop](https://knightfoundation.org/articles/11-ideas-win-journalism-360-challenge-on-immersive-storytelling/) (Knight Foundation / Google News Lab Journalism 360 award, 2017) and MediateVR. This repository is the working codebase for the next iteration.

## What changed since 2016

The original ran on the WebVR API, which browsers removed in 2020. Nothing in the 2016 stack runs today. The interaction model is kept exactly; everything underneath is replaced.

| | 2016 | 2026 |
|---|---|---|
| Headset API | WebVR + polyfill + webvr-boilerplate | WebXR Device API |
| Rendering | three.js r79, VRControls / VREffect | three.js r186, `renderer.xr`, controller events |
| Audio capture | recorder.js + opus worker, WAV | `MediaRecorder`, webm/opus |
| Transport | Socket.IO 1 | Socket.IO 4 |
| Storage | audio base64-encoded into MongoDB documents | audio files on disk + JSON metadata store |
| Build | script tags, jQuery, `node_modules` committed | Vite, ES modules, no framework |
| Record shape | `{id, x, y, z, audioObject}` | author, timestamp, anchor, layer, consent, transcript slot |

The server also no longer emits the previous record instead of the one just saved, a bug noted in the 2016 commit log.

## Annotation record

Each annotation records who contributed it, when, where in the scene, and which layer it belongs to, so a set of annotations can be filtered, reviewed, and exported without the viewer.

```json
{
  "id": "011e1a87-…",
  "scene": "default",
  "author": "Ainsley",
  "createdAt": "2026-10-12T12:25:36.267Z",
  "anchor": { "x": 0.1, "y": 0.9, "z": -1.2, "objectId": "pot" },
  "layer": "review",
  "audioUrl": "/audio/011e1a87-….webm",
  "durationMs": 1000,
  "transcript": null,
  "consent": true
}
```

## Run it

```sh
npm install
npm run dev        # API on :3000, client on http://localhost:5173
```

**Desktop:** click the canvas, `W A S D` to move, `K` start recording, `L` stop. The clip is anchored 60 cm in front of you. `Space` plays the marker you are looking at; walking within about a metre of a marker on the active layer also plays it.

**Headset (Quest 3 or any WebXR browser):** the headset reaches your machine by IP, which browsers do not treat as secure, so either serve HTTPS and accept the self-signed certificate once:

```sh
HTTPS=1 npm run dev     # then open https://<your-ip>:5173 and press Enter VR
```

or, for Quest over USB, `adb reverse tcp:5173 tcp:5173` and open `http://localhost:5173`. Trigger records while held, or plays a marker you are pointing at. Squeeze cycles the layer.

**Your own environment:** `?scene=/models/house.glb` loads a glTF in place of the default room. Put models in `client/public/`.

**Production:** `npm run build && npm start` serves client and API from one process on `:3000`. `GLOSSY_DATA=/path` relocates the store.

## API

| Method | Path | |
|---|---|---|
| GET | `/api/annotations?scene=` | list |
| POST | `/api/annotations` | multipart: `audio`, `x`, `y`, `z`, `author`, `layer`, `consent=true`; optional `objectId`, `scene`, `durationMs` |
| DELETE | `/api/annotations/:id` | remove record and file |
| GET | `/api/export` | full JSON export with schema tag |
| GET | `/audio/<id>.webm` | clip |
| Socket.IO | `annotation:all`, `annotation:new`, `annotation:deleted` | live sync |

## Status

Verified 12 Oct 2026: server round-trip (post, list, serve, export, delete) and the desktop client rendering, connecting, and loading stored markers in Chrome. Not yet verified: recording through a live microphone prompt, and the WebXR path on a headset.

## Roadmap

- Companion web form bound to an existing anchor: text, photos, consent from a phone or tablet, no headset needed.
- Speech-to-text into `transcript`.
- Export mapped to standard metadata schemas.
- SQLite in place of the JSON file.
- Code-split three.js (bundle is ~690 kB minified).

## Lineage

This repository holds the original 2016 commits plus this single 2026 snapshot. It will not be updated further. Development continues at [ainsleys/glossy-XR](https://github.com/ainsleys/glossy-XR).

MIT.

---

## Original 2016 README

# glossy
##audio annotation for webvr
Glossy is an in-progress prototype for audio annotation in VR in the browser. It uses websockets to propagate new annotations to all clients, and saves annotations to a database (I am using MongoDB) as a BLOB and xyz information. Existing database entries are propagated when a client first loads the page.
##some notes
- Web audio requires an https address, getUserMedia won't run on insecure origins. This means you'll need an SSL certificate... you could use Let's Encrypt or self-signed certificate. 
- Because i am testing this in vive, which requires a windows PC, i have found it useful to host the project on a remote server so that I can develop on my non-windows computer. 
- The database I am using is currently MongoDB.
- To run the program in an HTC vive, it's necessary to use a version of Chromium that supports webvr. There is a chrome plugin for testing but it currently breaks the page, maybe it will be resolved soon :).

##running Glossy
You need a windows machine, an HTC Vive, a recent build of Chromium that supports webVR (You may have to run with webvr flags), and an https server. You will have to install MongoDB and mongoose on the server, and other dependencies. Run node index to get an error indicating which are required, and install them (npm install xxx). If you want to look at the code in a regular browser, it will open and run in chrome. Hotkeys "K" and "L" will allow you to test out the start and stop audio recording. 
- The main script is in index.html, and the server code is in index.js. Dependencies are made visible in "public". 
- Server configs (called glossy in configs) shows what I used to make socket.io, ec2, nginx, and node work together on Ubuntu 16.04
- Give it a minute to load, it's a bit slow when loading many files. 
- if you want to test this in my production environment just email me at sutherlande@gmail.com and I will make sure it's working and send you the link.
- if you are running locally, it will run in localhost:3000, and the Mongodb is located in port 27017.


##ToDo
- add "selecting" functionality
- add "groups" to annotations
