import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    rollupOptions: {
      input: {
        app: 'index.html',
        campusPreview: 'campus-preview.html',
        r3f: 'r3f.html'
      }
    }
  },
  optimizeDeps: {
    exclude: ['onnxruntime-web']
  }
});
