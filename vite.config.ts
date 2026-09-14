import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite doesn't read PORT on its own. Honouring it lets a launcher assign a free
// port; otherwise Vite falls back to its default. Nothing here needs a fixed
// port — Neon allowlists every localhost port by default.
const port = process.env.PORT ? Number(process.env.PORT) : undefined;

export default defineConfig({
  plugins: [react()],
  server: { port },
});
