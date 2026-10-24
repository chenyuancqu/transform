import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    open: true,
    // Runtime recordings and browser snapshots are written below the Vite
    // root while the demo is being captured. They change continuously and
    // must never be treated as source edits, otherwise Vite reloads the page
    // during a recording.
    watch: {
      ignored: [
        '**/output/**',
        '**/.playwright-cli/**',
        '**/*.webm',
        '**/*.mp4'
      ]
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    rollupOptions: {
      input: {
        app: 'index.html',
        campusPreview: 'campus-preview.html',
        assetReview: 'asset-review.html',
        motherPreview: 'mother-preview.html',
        approvedAssetPreview: 'approved-asset-preview.html',
        showcase: 'showcase.html',
        r3f: 'r3f.html'
      }
    }
  },
  optimizeDeps: {
    exclude: ['onnxruntime-web']
  }
});
