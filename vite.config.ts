import { defineConfig } from 'vite'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Fixed port so the Tauri desktop shell's devUrl (http://localhost:5173) always
  // matches `npm run dev`. Harmless for the plain web workflow.
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    // Routes are code-split (React.lazy); heavy deps like xlsx load on demand.
    // The entry chunk (~530 kB) is the app shell + React/Radix vendor — fine for
    // an offline desktop app, so lift the default 500 kB warning threshold.
    chunkSizeWarningLimit: 700,
  },
})
