import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Identificador de cada build: la app lo compara con version.json para avisar
// que hay una versión nueva (el celu a veces sigue con la vieja en caché).
const BUILD_ID = Date.now().toString(36)

const versionFile = (): Plugin => ({
  name: 'version-file',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id: BUILD_ID }) })
  },
})

// https://vite.dev/config/
export default defineConfig({
  // Base relativa: la app se publica en GitHub Pages bajo /<repo>/, no en
  // la raíz del dominio. Con rutas relativas los assets resuelven bien ahí
  // y también sirviendo desde la raíz (dev local, Firebase Hosting, etc).
  base: './',
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [react(), versionFile()],
})
