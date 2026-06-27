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
  build: {
    // Routes are code-split (React.lazy); heavy deps like xlsx load on demand.
    // The entry chunk (~530 kB) is the app shell + React/Radix vendor — fine for
    // an offline desktop app, so lift the default 500 kB warning threshold.
    chunkSizeWarningLimit: 700,
  },
})
