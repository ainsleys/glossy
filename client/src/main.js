// Glossy XR client.
//
// 2016 Glossy: WebVR + three r79 + VRControls/VREffect + webvr-boilerplate,
// Vive gamepads polled by hand, recorder.js, spheres at the controller position,
// socket.io 1.x. Everything in that list is gone from browsers or three.js.
//
// This keeps the interaction model and swaps the plumbing:
//   WebXR (renderer.xr) + XRControllerModelFactory, MediaRecorder,
//   PositionalAudio, Socket.IO 4, ESM three via Vite.
// Desktop fallback (pointer lock + WASD, K/L to record) kept from the original
// so the tool can be used without a headset.

import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VoiceRecorder } from './recorder.js';
import { connect, postAnnotation } from './api.js';

// ---- config ----------------------------------------------------------------

const params = new URLSearchParams(location.search);
const SCENE_URL = params.get('scene');           // optional GLB/glTF environment
const SCENE_ID = SCENE_URL || 'default';
const LAYERS = ['default', 'draft', 'review', 'final'];
const MARKER_RADIUS = 0.06;
const PLAY_DISTANCE = 1.2;                        // metres; walk near a marker and it plays

// ---- HUD -------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const hud = { author: $('author'), layer: $('layer'), consent: $('consent'), status: $('statusText'), rec: $('rec'), count: $('count') };
try {
  hud.author.value = localStorage.getItem('glossy.author') || '';
  hud.layer.value = localStorage.getItem('glossy.layer') || 'default';
  hud.consent.checked = localStorage.getItem('glossy.consent') === '1';
} catch {}
hud.author.addEventListener('change', () => { try { localStorage.setItem('glossy.author', hud.author.value); } catch {} });
hud.layer.addEventListener('change', () => { try { localStorage.setItem('glossy.layer', hud.layer.value); } catch {} });
hud.consent.addEventListener('change', () => { try { localStorage.setItem('glossy.consent', hud.consent.checked ? '1' : '0'); } catch {} });
const setStatus = (t) => { hud.status.textContent = t; };

// ---- renderer / scene ------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f14);
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 200);
camera.position.set(0, 1.6, 2);
const listener = new THREE.AudioListener();
camera.add(listener);

// player rig so desktop movement and XR share one transform
const rig = new THREE.Group();
rig.add(camera);
scene.add(rig);

scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(3, 6, 2);
scene.add(sun);

// default environment: a 6 m room with a grid floor, in place of the 2016 green box
const room = new THREE.Group();
{
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshStandardMaterial({ color: 0x1b2330, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  room.add(floor, new THREE.GridHelper(6, 12, 0x3b4b5f, 0x2a3644));
  const walls = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 6), new THREE.MeshStandardMaterial({ color: 0x141a22, side: THREE.BackSide, roughness: 1 }));
  walls.position.y = 1.5;
  room.add(walls);
  // a few "objects" to annotate so there's something to point at
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a6d3b, roughness: 0.7 });
  const table = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.7), mat); table.position.set(0, 0.75, -1.2); table.name = 'table';
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.3, 24), new THREE.MeshStandardMaterial({ color: 0xb87333, metalness: 0.6, roughness: 0.35 })); pot.position.set(0, 0.94, -1.2); pot.name = 'pot';
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.5), mat); chest.position.set(-2, 0.25, 0.5); chest.name = 'chest';
  room.add(table, pot, chest);
}
scene.add(room);

if (SCENE_URL) {
  new GLTFLoader().load(SCENE_URL, (g) => { room.visible = false; scene.add(g.scene); setStatus('scene loaded'); }, undefined, (e) => setStatus('scene failed: ' + e.message));
}

// ---- annotations in the scene ---------------------------------------------

const markers = new Map();           // id -> { mesh, sound, record }
const markerGroup = new THREE.Group();
scene.add(markerGroup);
const audioLoader = new THREE.AudioLoader();
const layerColor = (layer) => new THREE.Color().setHSL(((LAYERS.indexOf(layer) + 8) % 8) / 8, 0.75, 0.55);

function addMarker(record) {
  if (markers.has(record.id)) return;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(MARKER_RADIUS, 20, 14),
    new THREE.MeshStandardMaterial({ color: layerColor(record.layer), emissive: layerColor(record.layer), emissiveIntensity: 0.35 }),
  );
  mesh.position.set(record.anchor.x, record.anchor.y, record.anchor.z);
  mesh.userData.id = record.id;
  markerGroup.add(mesh);
  const sound = new THREE.PositionalAudio(listener);
  sound.setRefDistance(0.4);
  sound.setRolloffFactor(2);
  mesh.add(sound);
  audioLoader.load(record.audioUrl, (buffer) => sound.setBuffer(buffer));
  markers.set(record.id, { mesh, sound, record });
  hud.count.textContent = `· ${markers.size} annotation${markers.size === 1 ? '' : 's'}`;
  applyLayerFilter();
}
function removeMarker({ id }) {
  const m = markers.get(id);
  if (!m) return;
  m.sound.isPlaying && m.sound.stop();
  markerGroup.remove(m.mesh);
  markers.delete(id);
  hud.count.textContent = `· ${markers.size}`;
}
function applyLayerFilter() {
  // show the active layer bright, others dim; hiding entirely would hide the point of "layers"
  for (const { mesh, record } of markers.values()) {
    const active = record.layer === hud.layer.value;
    mesh.material.opacity = active ? 1 : 0.25;
    mesh.material.transparent = !active;
    mesh.scale.setScalar(active ? 1 : 0.7);
  }
}
hud.layer.addEventListener('change', applyLayerFilter);

function play(id) {
  const m = markers.get(id);
  if (!m || !m.sound.buffer) return;
  if (listener.context.state === 'suspended') listener.context.resume();
  for (const other of markers.values()) other.sound.isPlaying && other.sound.stop();
  m.sound.play();
}

// ---- recording -------------------------------------------------------------

const recorder = new VoiceRecorder();
const cursor = new THREE.Mesh(new THREE.SphereGeometry(MARKER_RADIUS * 1.2, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff3333, wireframe: true }));
cursor.visible = false;
scene.add(cursor);
let anchorSource = null;             // Object3D whose world position becomes the anchor while recording

async function beginRecording(source) {
  if (recorder.isRecording) return;
  if (!hud.author.value.trim()) return setStatus('enter your name first');
  if (!hud.consent.checked) return setStatus('tick consent first');
  try {
    await recorder.start();
  } catch (e) {
    return setStatus('mic blocked: ' + e.message);
  }
  anchorSource = source;
  cursor.visible = true;
  hud.rec.classList.add('on');
  setStatus('recording… (' + hud.layer.value + ')');
}

async function endRecording() {
  if (!recorder.isRecording) return;
  const anchor = new THREE.Vector3();
  anchorSource.getWorldPosition(anchor);
  const clip = await recorder.stop();
  cursor.visible = false;
  hud.rec.classList.remove('on');
  if (!clip) return setStatus('too short, discarded');
  setStatus('saving…');
  try {
    const rec = await postAnnotation({
      ...clip, anchor, author: hud.author.value.trim(), layer: hud.layer.value, scene: SCENE_ID, consent: true,
    });
    setStatus(`saved ${Math.round(clip.durationMs / 100) / 10}s at (${anchor.x.toFixed(2)}, ${anchor.y.toFixed(2)}, ${anchor.z.toFixed(2)})`);
    addMarker(rec);                  // local echo; server broadcast is deduped by id
  } catch (e) {
    setStatus('save failed: ' + e.message);
  }
}

// ---- XR controllers --------------------------------------------------------

const controllerModelFactory = new XRControllerModelFactory();
const raycaster = new THREE.Raycaster();
const tmpMat = new THREE.Matrix4();
const controllers = [];
for (let i = 0; i < 2; i++) {
  const ctrl = renderer.xr.getController(i);
  ctrl.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]),
    new THREE.LineBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.5 }),
  ));
  const tip = new THREE.Object3D(); tip.position.z = -0.05; ctrl.add(tip);   // anchor just ahead of the controller
  ctrl.addEventListener('selectstart', () => {
    const hit = pointAt(ctrl);
    if (hit) play(hit); else beginRecording(tip);
  });
  ctrl.addEventListener('selectend', () => { if (recorder.isRecording && anchorSource === tip) endRecording(); });
  ctrl.addEventListener('squeezestart', () => {
    const next = LAYERS[(LAYERS.indexOf(hud.layer.value) + 1) % LAYERS.length];
    hud.layer.value = next; hud.layer.dispatchEvent(new Event('change'));
    setStatus('layer: ' + next);
  });
  rig.add(ctrl);
  const grip = renderer.xr.getControllerGrip(i);
  grip.add(controllerModelFactory.createControllerModel(grip));
  rig.add(grip);
  controllers.push(ctrl);
}
function pointAt(ctrl) {
  tmpMat.identity().extractRotation(ctrl.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(ctrl.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tmpMat);
  const hit = raycaster.intersectObjects(markerGroup.children, false)[0];
  return hit?.object.userData.id || null;
}

// ---- desktop fallback ------------------------------------------------------

const lock = new PointerLockControls(camera, renderer.domElement);
renderer.domElement.addEventListener('click', () => { if (!renderer.xr.isPresenting) lock.lock(); });
const keys = new Set();
const ahead = new THREE.Object3D(); ahead.position.z = -0.6; camera.add(ahead);   // desktop anchor: 60 cm in front of the eye
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'KeyK') beginRecording(ahead);
  if (e.code === 'KeyL') endRecording();
  if (e.code === 'Space') { const hit = pointAt(camera); if (hit) play(hit); }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

// ---- network ---------------------------------------------------------------

connect({
  onAll: (all) => { all.filter((a) => a.scene === SCENE_ID).forEach(addMarker); setStatus(`loaded ${markers.size}`); },
  onNew: (a) => a.scene === SCENE_ID && addMarker(a),
  onDeleted: removeMarker,
  onStatus: setStatus,
});

// ---- loop ------------------------------------------------------------------

const clock = new THREE.Clock();
const near = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);

  if (!renderer.xr.isPresenting && lock.isLocked) {
    const speed = 2.0 * dt;
    if (keys.has('KeyW')) lock.moveForward(speed);
    if (keys.has('KeyS')) lock.moveForward(-speed);
    if (keys.has('KeyA')) lock.moveRight(-speed);
    if (keys.has('KeyD')) lock.moveRight(speed);
  }

  if (recorder.isRecording && anchorSource) anchorSource.getWorldPosition(cursor.position);

  // proximity playback for the active layer: walk up to a marker and it plays
  camera.getWorldPosition(near);
  for (const { mesh, sound, record } of markers.values()) {
    if (record.layer !== hud.layer.value || !sound.buffer) continue;
    const d = mesh.position.distanceTo(near);
    if (d < PLAY_DISTANCE && !sound.isPlaying && !mesh.userData.played) { mesh.userData.played = true; play(record.id); }
    if (d > PLAY_DISTANCE * 1.5) mesh.userData.played = false;
  }

  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
