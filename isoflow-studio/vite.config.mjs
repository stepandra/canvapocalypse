import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { isoflowBridgePlugin } from './scripts/lib/isoflow-bridge-vite.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  server: {
    allowedHosts: ['.onamp.dev']
  },
  plugins: [
    isoflowBridgePlugin({
      root,
      projectSources: {
        'autorecruit-ideal': 'public/sessions/autorecruit-ideal.pro.json',
        'eval-lab': 'public/sessions/eval-lab.pro.json',
        'autorecruit-contours': 'public/sessions/autorecruit-contours.pro.json',
        'hub-rewrite': 'public/sessions/hub-rewrite.pro.json'
      }
    })
  ],
  resolve: {
    preserveSymlinks: true,
    dedupe: ['react', 'react-dom']
  },
  optimizeDeps: {
    include: ['isoflow']
  }
});
