import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  base: "/Medcore-dev/",
  root: process.cwd(),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // Ensure SPA fallback for client-side routing
    historyApiFallback: true,
    fs: {
      // Allow serving files from project root
      allow: [path.resolve(__dirname)],
    },
  },
  plugins: [
    react(),
  ],
});
