import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// Dev-only: POST a PNG data URL to /__shot?name=foo to save a canvas capture.
// Used for automated visual checks while tuning levels.
const shotDir = process.env.HW_SHOT_DIR;

export default defineConfig({
  build: { chunkSizeWarningLimit: 1200 },
  plugins: [
    {
      name: 'dev-screenshot',
      apply: 'serve',
      configureServer(server) {
        if (!shotDir) return;
        server.middlewares.use('/__shot', (req, res) => {
          let body = '';
          req.on('data', (c) => { body += c; });
          req.on('end', () => {
            const name = new URL(req.url, 'http://x').searchParams.get('name') || 'shot';
            const b64 = body.replace(/^data:image\/\w+;base64,/, '');
            fs.mkdirSync(shotDir, { recursive: true });
            fs.writeFileSync(path.join(shotDir, name.replace(/[^\w-]/g, '') + '.jpg'), Buffer.from(b64, 'base64'));
            res.end('ok');
          });
        });
      },
    },
  ],
});
