const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT      = 3007;
const DATA_DIR  = path.join(__dirname, 'mileage-data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ jobs: [], savedClients: {} }, null, 2));

function read() {
    try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
    catch(e) { return { jobs: [], savedClients: {} }; }
}

function write(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, data, status = 200) {
    cors(res);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

function getBody(req) {
    return new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', chunk => raw += chunk);
        req.on('end', () => {
            try { resolve(JSON.parse(raw)); }
            catch(e) { resolve(null); }
        });
        req.on('error', reject);
    });
}

http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url, `http://localhost:${PORT}`);

    if (req.method === 'OPTIONS') {
        cors(res); res.writeHead(204); res.end(); return;
    }

    if (pathname !== '/api/mileage') {
        cors(res); res.writeHead(404); res.end('Not found'); return;
    }

    if (req.method === 'GET') {
        return json(res, read());
    }

    if (req.method === 'POST') {
        const body = await getBody(req);
        if (!body || typeof body !== 'object') {
            return json(res, { error: 'Invalid JSON' }, 400);
        }
        const current = read();
        const updated = {
            jobs:         Array.isArray(body.jobs) ? body.jobs : current.jobs,
            savedClients: (typeof body.savedClients === 'object' && !Array.isArray(body.savedClients))
                          ? body.savedClients : current.savedClients,
        };
        write(updated);
        return json(res, { ok: true });
    }

    cors(res); res.writeHead(405); res.end('Method not allowed');

}).listen(PORT, '127.0.0.1', () => {
    console.log(`HMS Mileage API running on port ${PORT}`);
});
