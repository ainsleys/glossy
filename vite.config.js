import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// WebXR and getUserMedia need a secure context. http://localhost already
// counts as one, so plain HTTP is the default for desktop work. A headset on
// the LAN hits the machine by IP, which is not secure, so for that run
//   HTTPS=1 npm run client
// and accept the self-signed certificate once in the headset browser.
// The API server (Express + Socket.IO) runs on :3000 and is proxied here, so
// the client only ever talks to one origin.
const useHttps = process.env.HTTPS === '1';

export default defineConfig({
  root: 'client',
  plugins: useHttps ? [basicSsl()] : [],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/audio': { target: 'http://localhost:3000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3000', ws: true, changeOrigin: true },
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
