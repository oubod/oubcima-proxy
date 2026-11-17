const express = require('express');
const cors = require('cors');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
  allowedHeaders: '*',
  exposedHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges', 'Content-Type']
}));

app.get('/proxy', (req, res) => {
  // Capture everything after "?url=" intact so query parameters like &password= aren't dropped
  const rawUrlIndex = req.url.indexOf('?url=');
  if (rawUrlIndex === -1) {
    return res.status(400).json({ error: 'Missing ?url= parameter' });
  }

  let targetUrl = req.url.substring(rawUrlIndex + 5);

  // If the browser encoded it, decode it
  try {
    targetUrl = decodeURIComponent(targetUrl);
  } catch (e) {
    // Keep as-is if already raw
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid URL format', target: targetUrl });
  }

  const client = parsedUrl.protocol === 'https:' ? https : http;

  const options = {
    protocol: parsedUrl.protocol,
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'GET',
    headers: {
      'Host': parsedUrl.host,
      'User-Agent': 'IPTVSmartersPro/3.1.5 (Linux; Android 12)',
      'Accept': '*/*',
      'Connection': 'keep-alive',
      'Icy-MetaData': '1'
    }
  };

  if (req.headers.range) {
    options.headers['Range'] = req.headers.range;
  }

  const proxyReq = client.request(options, (proxyRes) => {
    if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
      return res.redirect(proxyRes.headers.location);
    }

    res.status(proxyRes.statusCode);
    
    Object.keys(proxyRes.headers).forEach((key) => {
      res.setHeader(key, proxyRes.headers[key]);
    });

    if (targetUrl.includes('.ts') || targetUrl.includes('/live/') || !targetUrl.includes('.php')) {
      res.setHeader('Content-Type', 'video/mp2t');
    }

    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy Engine Error:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Upstream connection error', details: err.message });
    }
  });

  req.on('close', () => {
    proxyReq.destroy();
  });

  proxyReq.end();
});

app.get('/', (req, res) => {
  res.send('oub cima Proxy Engine Operational');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`oub cima Proxy listening on port ${PORT}`);
});
