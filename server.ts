import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { createMediaApp } from './src/server/app.ts';

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = createMediaApp();

  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Tendouloader server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Tendouloader server:', err);
  process.exit(1);
});
