import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' keeps asset paths relative so the build drops onto any static host
// (Netlify, Vercel, or a GitHub Pages project subpath) without extra config.
export default defineConfig({
  plugins: [react()],
  base: './',
});
