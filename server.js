const http = require('http');
const fs   = require('fs');
const path = require('path');
const { exec } = require('child_process');

const ROOT      = __dirname;
const START_PORT = 3000;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.csv':  'text/csv; charset=utf-8',
    '.txt':  'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
    const urlPath  = req.url.split('?')[0];
    const filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
    const ext      = path.extname(filePath).toLowerCase();
    const mime     = MIME[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(err.code === 'ENOENT' ? 404 : 500);
            res.end(err.code === 'ENOENT' ? '404 Not Found' : '500 Server Error');
            return;
        }
        res.writeHead(200, {
            'Content-Type':  mime,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma':        'no-cache',
            'Expires':       '0',
        });
        res.end(data);
    });
});

// Try ports 3000 → 3001 → 3002 … until one is free
function tryListen(port) {
    server.listen(port, '127.0.0.1');

    server.once('listening', () => {
        const url = `http://localhost:${port}`;
        console.log('');
        console.log('  ╔══════════════════════════════════════╗');
        console.log('  ║      🎵  YouTube Music Bot           ║');
        console.log(`  ║   Open in Chrome/Edge:               ║`);
        console.log(`  ║   ${url}          ║`);
        console.log('  ║   Press Ctrl+C to stop               ║');
        console.log('  ╚══════════════════════════════════════╝');
        console.log('');
        exec(`start ${url}`);
    });

    server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`  Port ${port} is busy — trying ${port + 1}…`);
            server.removeAllListeners('error');
            server.removeAllListeners('listening');
            tryListen(port + 1);
        } else {
            console.error('Server error:', err.message);
            process.exit(1);
        }
    });
}

tryListen(START_PORT);
