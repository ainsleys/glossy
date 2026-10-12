import { io } from 'socket.io-client';

export function connect({ onAll, onNew, onDeleted, onStatus }) {
  const socket = io({ transports: ['websocket', 'polling'] });
  socket.on('connect', () => onStatus?.('connected'));
  socket.on('disconnect', () => onStatus?.('disconnected'));
  socket.on('annotation:all', onAll);
  socket.on('annotation:new', onNew);
  socket.on('annotation:deleted', onDeleted);
  return socket;
}

export async function postAnnotation({ blob, durationMs, anchor, author, layer, scene, consent, objectId }) {
  const fd = new FormData();
  fd.append('audio', blob, 'clip');
  fd.append('x', anchor.x);
  fd.append('y', anchor.y);
  fd.append('z', anchor.z);
  if (objectId) fd.append('objectId', objectId);
  fd.append('author', author);
  fd.append('layer', layer);
  fd.append('scene', scene);
  fd.append('consent', String(consent));
  fd.append('durationMs', durationMs);
  const res = await fetch('/api/annotations', { method: 'POST', body: fd });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}
