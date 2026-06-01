import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    viteStaticCopy({
      targets: [
        { src: 'node_modules/pdfjs-dist/cmaps/*', dest: 'pdfjs/cmaps' },
        { src: 'node_modules/pdfjs-dist/standard_fonts/*', dest: 'pdfjs/standard_fonts' },
      ],
    }),
  ],
  server: { host: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          genai: ['@google/genai'],
          spreadsheet: ['xlsx'],
          pdfViewer: ['react-pdf', 'pdfjs-dist'],
        },
      },
    },
  },
});
