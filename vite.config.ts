import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-compat', 'recast-navigation', '@recast-navigation/three'],
  },
  build: {
    target: 'esnext',
  },
});
