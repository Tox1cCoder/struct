import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Cast process to any to avoid "Property 'cwd' does not exist on type 'Process'" error
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    // GitHub Pages usually serves from a subdirectory (the repo name).
    // If you are using a custom domain, change this to '/'.
    // We try to auto-detect the repo name from package.json name or assume root if unavailable.
    base: './', 
    define: {
      // This injects the process.env.API_KEY into the code at build time
      'process.env.API_KEY': JSON.stringify(process.env.API_KEY || env.API_KEY),
    },
  };
});