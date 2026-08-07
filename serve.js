#!/usr/bin/env node
// Minimal static file server. ES modules cannot be loaded from a file:// URL
// because of CORS, so the game needs to be served over HTTP during development.
// Zero dependencies on purpose - `node serve.js` and you are playing.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname);
const PORT = Number(process.env.PORT) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';

    // Resolve inside ROOT and reject anything that escapes it, so a crafted
    // path like /../../etc/passwd cannot read outside the project.
    const filePath = join(ROOT, normalize(pathname));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(body);
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EISDIR') {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    } else {
      res.writeHead(500, { 'Content-Type': 'text/plain' }).end('Server error');
    }
  }
});

server.listen(PORT, () => {
  console.log(`Hollow Runner running at http://localhost:${PORT}`);
});
