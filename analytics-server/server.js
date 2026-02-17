const express = require('express');
const fs = require('fs');
const path = require('path');
const geoip = require('geoip-lite');

const app = express();
const PORT = 3001;

const ANALYTICS_FILE = path.join(__dirname, 'analytics.json');

const EXCLUDED_IPS = [
    '38.49.72.41',
];

const BOT_PATTERNS = /bot|crawler|spider|googlebot|bingbot|yandex|baidu|semrush|ahrefsbot|mj12bot|dotbot|python-requests|curl|wget|libwww|go-http-client|scrapy|slackbot|pinterest|whatsapp|facebookexternalhit/i;

if (!fs.existsSync(ANALYTICS_FILE)) {
    fs.writeFileSync(ANALYTICS_FILE, JSON.stringify({ visits: [] }));
}

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', 'https://highlandmediaservices.com');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(express.json());

function getIP(req) {
    const raw = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || '';
    return raw.split(',')[0].trim();
}

function parseUA(ua) {
    let device = 'Desktop';
    if (/mobile|android|iphone/i.test(ua)) device = 'Mobile';
    else if (/ipad|tablet/i.test(ua)) device = 'Tablet';

    let os = 'Unknown';
    if (/windows/i.test(ua)) os = 'Windows';
    else if (/macintosh|mac os x/i.test(ua)) os = 'macOS';
    else if (/android/i.test(ua)) os = 'Android';
    else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
    else if (/linux/i.test(ua)) os = 'Linux';
    else if (/cros/i.test(ua)) os = 'Chrome OS';

    let browser = 'Unknown';
    if (/edg/i.test(ua)) browser = 'Edge';
    else if (/chrome/i.test(ua)) browser = 'Chrome';
    else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
    else if (/firefox/i.test(ua)) browser = 'Firefox';
    else if (/opera|opr/i.test(ua)) browser = 'Opera';

    return { device, os, browser };
}

// Track page view
app.post('/api/hms/track', (req, res) => {
    const ip = getIP(req);
    const ua = req.headers['user-agent'] || '';

    if (EXCLUDED_IPS.includes(ip) || BOT_PATTERNS.test(ua)) {
        return res.json({ success: true });
    }

    const { device, os, browser } = parseUA(ua);
    const geo = geoip.lookup(ip);
    let location = 'Unknown';
    if (geo) {
        const parts = [geo.city, geo.region, geo.country].filter(Boolean);
        location = parts.join(', ') || 'Unknown';
    }

    const sessionId = req.body.sessionId || null;

    // If sessionId exists and matches an existing visit, add a page to it
    try {
        const data = JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf8'));
        const existing = sessionId
            ? data.visits.find(v => v.sessionId === sessionId)
            : null;

        if (existing) {
            // Add this page to the existing session
            existing.pages = existing.pages || [existing.path];
            const newPath = req.body.path || '/';
            if (!existing.pages.includes(newPath)) existing.pages.push(newPath);
            existing.lastPath = newPath;
            existing.pageCount = (existing.pageCount || 1) + 1;
            fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(data, null, 2));
        } else {
            // New session
            const visit = {
                timestamp: new Date().toISOString(),
                sessionId,
                ip,
                location,
                device,
                os,
                browser,
                referer: req.body.referer || req.headers['referer'] || 'Direct',
                path: req.body.path || '/',
                pages: [req.body.path || '/'],
                pageCount: 1,
            };
            data.visits.push(visit);
            if (data.visits.length > 10000) data.visits = data.visits.slice(-10000);
            fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(data, null, 2));
        }
    } catch (e) {
        console.error('Track error:', e);
    }

    res.json({ success: true });
});

// Track navigation clicks
app.post('/api/hms/track-nav', (req, res) => {
    const ip = getIP(req);
    if (EXCLUDED_IPS.includes(ip)) return res.json({ success: true });

    try {
        const data = JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf8'));
        const sessionId = req.body.sessionId || null;
        const visit = sessionId
            ? data.visits.find(v => v.sessionId === sessionId)
            : data.visits.filter(v => v.ip === ip).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
        if (visit) {
            visit.navigations = (visit.navigations || 0) + 1;
            fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(data, null, 2));
        }
    } catch (e) {}

    res.json({ success: true });
});

// Heartbeat
app.post('/api/hms/heartbeat', (req, res) => {
    const ip = getIP(req);
    if (EXCLUDED_IPS.includes(ip)) return res.json({ success: true });

    try {
        const data = JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf8'));
        const sessionId = req.body.sessionId || null;
        const visit = sessionId
            ? data.visits.find(v => v.sessionId === sessionId)
            : data.visits.filter(v => v.ip === ip).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
        if (visit) {
            visit.lastHeartbeat = new Date().toISOString();
            visit.duration = Math.floor((new Date(visit.lastHeartbeat) - new Date(visit.timestamp)) / 1000);
            fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(data, null, 2));
        }
    } catch (e) {}

    res.json({ success: true });
});

// Raw analytics JSON for dashboard
app.get('/api/hms/analytics', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf8'));
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: 'Failed to load analytics' });
    }
});

// Analytics dashboard
app.get('/analytics', (req, res) => {
    res.sendFile(path.join(__dirname, 'analytics-dashboard.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Highland Media Services analytics running on port ${PORT}`);
});
