import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Base relativa: la app se publica en GitHub Pages bajo /<repo>/, no en
  // la raíz del dominio. Con rutas relativas los assets resuelven bien ahí
  // y también sirviendo desde la raíz (dev local, Firebase Hosting, etc).
  base: './',
  plugins: [react()],
})
