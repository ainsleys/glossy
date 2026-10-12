// Microphone capture with the MediaRecorder API. Replaces recorder.js /
// opus-recorder / encoderWorker from the 2016 build. Produces webm/opus on
// Chrome (desktop and Quest), ogg/opus or mp4/aac on other engines.

const PREFERRED = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'];

export class VoiceRecorder {
  constructor() {
    this.stream = null;
    this.rec = null;
    this.chunks = [];
    this.startedAt = 0;
    this.mimeType = PREFERRED.find((t) => window.MediaRecorder?.isTypeSupported(t)) || '';
  }

  get isRecording() {
    return !!this.rec && this.rec.state === 'recording';
  }

  async init() {
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
  }

  async start() {
    await this.init();
    if (this.isRecording) return;
    this.chunks = [];
    this.rec = new MediaRecorder(this.stream, this.mimeType ? { mimeType: this.mimeType } : undefined);
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start(250);
    this.startedAt = performance.now();
  }

  /** @returns {Promise<{blob: Blob, durationMs: number} | null>} */
  stop() {
    return new Promise((resolve) => {
      if (!this.isRecording) return resolve(null);
      const durationMs = Math.round(performance.now() - this.startedAt);
      this.rec.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.rec.mimeType || this.mimeType || 'audio/webm' });
        this.chunks = [];
        resolve(durationMs < 300 ? null : { blob, durationMs });
      };
      this.rec.stop();
    });
  }
}
