// Utilidades de los tests: cada archivo trabaja en una carpeta de datos desechable, nunca en tu data/ real.
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';

export const tempData = () => fs.mkdtempSync(path.join(os.tmpdir(), 'repoteca-test-'));

export const freePort = () =>
  new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
