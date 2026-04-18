import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  server: {
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3030',
        ws: true,
      },
      '/api': {
        target: 'http://localhost:3030',
      },
    },
  },
})
