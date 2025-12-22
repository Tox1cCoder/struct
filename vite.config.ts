import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  return {
    plugins: [react()],
    // GitHub Pages usually serves from a subdirectory (the repo name).
    // If you are using a custom domain, change this to '/'.
    // We try to auto-detect the repo name from package.json name or assume root if unavailable.
    base: './', 
  };
});
