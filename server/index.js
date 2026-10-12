// Glossy XR server.
//
// Same job as the 2016 index.js: accept an audio annotation with a position,
// persist it, and push it to every connected client; send the full set to a
// client when it connects. Differences:
//   - audio lives on disk as webm/opus files, not base64 blobs in Mongo
//   - metadata is a JSON file (swap for SQLite/Postgres later; the shape is stable)
//   - every annotation carries author, timestamp, spatial anchor and layer, so
//     a set can be filtered, reviewed and exported without the viewer
//   - the "lagging one behind" bug is gone: the server emits the record it just
//     saved, not the last record in the table
//   - GET /api/export returns the whole store as a single JSON document

import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import multer from 'multer';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.GLOSSY_DATA || path.join(ROOT, 'data');
const AUDIO_DIR = path.join(DATA_DIR, 'audio');
const STORE = path.join(DATA_DIR, 'annotations.json');
const PORT = Number(process.env.PORT || 3000);

fs.mkdirSync(AUDIO_DIR, { recursive: true });
if (!fs.existsSync(STORE)) fs.writeFileSync(STORE, '[]\n');

// ---- store -----------------------------------------------------------------

let annotations = JSON.parse(fs.readFileSync(STORE, 'utf8'));
let writing = Promise.resolve();
function persist() {
  // serialise writes so concurrent posts never interleave
  writing = writing.then(() =>
    fsp.writeFile(STORE, JSON.stringify(annotations, null, 2) + '\n'),
  );
  return writing;
}

/**
 * Annotation record.
 *
 * {
 *   id:          uuid
 *   scene:       string      which environment this belongs to ("default", a GLB url, ...)
 *   author:      string      attribution (display name; free text for now)
 *   createdAt:   ISO-8601    timestamp
 *   anchor:      { x, y, z, objectId?: string }    position in scene metres
 *   layer:       string      grouping label (e.g. "draft", "review", "1920s")
 *   audioUrl:    /audio/<id>.webm
 *   durationMs:  number
 *   transcript?: string      optional, filled by a later ASR pass
 *   consent:     boolean     contributor agreed to the stated terms
 * }
 */
function validate(body) {
  const errors = [];
  const num = (v) => (v === undefined || v === null || v === '' ? NaN : Number(v));
  const x = num(body.x), y = num(body.y), z = num(body.z);
  if ([x, y, z].some(Number.isNaN)) errors.push('anchor x/y/z must be numbers');
  const author = String(body.author || '').trim().slice(0, 120);
  if (!author) errors.push('author (attribution) is required');
  const layer = String(body.layer || '').trim().slice(0, 120) || 'default';
  const scene = String(body.scene || 'default').slice(0, 200);
  const objectId = body.objectId ? String(body.objectId).slice(0, 200) : undefined;
  const consent = body.consent === 'true' || body.consent === true;
  if (!consent) errors.push('consent must be true');
  return { errors, x, y, z, author, layer, scene, objectId, consent };
}

// ---- http ------------------------------------------------------------------

const app = express();
const server = http.createServer(app);
const io = new SocketServer(server, { cors: { origin: true } });

app.use('/audio', express.static(AUDIO_DIR, { maxAge: '1h' }));
app.use(express.json());

const upload = multer({
  storage: multer.diskStorage({
    destination: AUDIO_DIR,
    filename: (_req, file, cb) => {
      const ext = file.mimetype.includes('ogg') ? 'ogg'
        : file.mimetype.includes('mp4') ? 'm4a'
        : 'webm';
      cb(null, `${randomUUID()}.${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  // Browsers send audio/webm or audio/ogg; some clients label the same bytes
  // video/webm or application/octet-stream, so accept those containers too.
  fileFilter: (_req, file, cb) => cb(null,
    file.mimetype.startsWith('audio/')
    || ['video/webm', 'video/ogg', 'application/ogg', 'application/octet-stream'].includes(file.mimetype)),
});

app.get('/api/health', (_req, res) => res.json({ ok: true, count: annotations.length }));

app.get('/api/annotations', (req, res) => {
  const scene = req.query.scene;
  res.json(scene ? annotations.filter((a) => a.scene === scene) : annotations);
});

app.get('/api/export', (_req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename="glossy-annotations.json"');
  res.json({
    exportedAt: new Date().toISOString(),
    schema: 'glossy-xr/annotation/0.2',
    fields: ['id', 'scene', 'author', 'createdAt', 'anchor', 'layer', 'audioUrl', 'durationMs', 'transcript', 'consent'],
    annotations,
  });
});

app.post('/api/annotations', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'audio file is required' });
  const v = validate(req.body);
  if (v.errors.length) {
    await fsp.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ error: v.errors.join('; ') });
  }
  const id = path.parse(req.file.filename).name;
  const record = {
    id,
    scene: v.scene,
    author: v.author,
    createdAt: new Date().toISOString(),
    anchor: { x: v.x, y: v.y, z: v.z, ...(v.objectId ? { objectId: v.objectId } : {}) },
    layer: v.layer,
    audioUrl: `/audio/${req.file.filename}`,
    durationMs: Number(req.body.durationMs) || null,
    transcript: null,
    consent: true,
  };
  annotations.push(record);
  await persist();
  io.emit('annotation:new', record);     // the record we just saved, to everyone
  res.status(201).json(record);
});

app.delete('/api/annotations/:id', async (req, res) => {
  const i = annotations.findIndex((a) => a.id === req.params.id);
  if (i < 0) return res.status(404).end();
  const [gone] = annotations.splice(i, 1);
  await persist();
  await fsp.unlink(path.join(AUDIO_DIR, path.basename(gone.audioUrl))).catch(() => {});
  io.emit('annotation:deleted', { id: gone.id });
  res.status(204).end();
});

// serve the built client in production
if (process.env.NODE_ENV === 'production') {
  const dist = path.join(ROOT, 'dist');
  app.use(express.static(dist));
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// ---- sockets ---------------------------------------------------------------

io.on('connection', (socket) => {
  socket.emit('annotation:all', annotations);
  socket.on('presence', (p) => socket.broadcast.emit('presence', { id: socket.id, ...p }));
  socket.on('disconnect', () => io.emit('presence:left', { id: socket.id }));
});

server.listen(PORT, () => {
  console.log(`glossy-xr server on http://localhost:${PORT}  (${annotations.length} annotations, data in ${DATA_DIR})`);
});
