import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit()
  ],

  // Tauri expects a fixed port
  server: {
    port: 1420,
    strictPort: true,
    host: true
  },

  // Prevent Vite from obscuring Rust errors
  clearScreen: false,

  // Tauri environment variables
  envPrefix: ['VITE_', 'TAURI_'],

  build: {
    // Tauri uses Chromium, which supports ES2021
    target: 'esnext',
    // Produce sourcemaps for debugging
    sourcemap: true
  }
});
