import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: {
        city: resolve(import.meta.dirname, 'index.html'),
        construction: resolve(import.meta.dirname, 'construction.html'),
        home: resolve(import.meta.dirname, 'home.html'),
        characters: resolve(import.meta.dirname, 'characters.html'),
        classroom: resolve(import.meta.dirname, 'classroom.html'),
        hospital: resolve(import.meta.dirname, 'hospital.html'),
        canteen: resolve(import.meta.dirname, 'canteen.html'),
        hotel: resolve(import.meta.dirname, 'hotel.html'),
        gallery: resolve(import.meta.dirname, 'gallery.html'),
      },
    },
  },
});
