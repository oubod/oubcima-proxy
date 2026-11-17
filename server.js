const express = require('express');
const cors = require('cors');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const app = express();

// Full CORS support for PWA / Web MSE
app.use(cors({
  origin: '*',
  methods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
  allowedHeaders: '*',
  exposedHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges', 'Content-Type']
}));

app.get('/proxy', (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing ?url= parameter' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid URL format' });
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
      'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
      'Accept': '*/*',
      'Connection': 'keep-alive',
      'Icy-MetaData': '1'
    }
  };

  if (req.headers.range) {
    options.headers['Range'] = req.headers.range;
  }

  const proxyReq = client.request(options, (proxyRes) => {
    // If upstream redirects (301/302), follow it
    if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
      return res.redirect(proxyRes.headers.location);
    }

    // Pass headers
    res.status(proxyRes.statusCode);
    
    Object.keys(proxyRes.headers).forEach((key) => {
      res.setHeader(key, proxyRes.headers[key]);
    });

    // Enforce proper MIME type for MPEG-TS live video
    if (targetUrl.includes('.ts') || targetUrl.includes('/live/') || !targetUrl.includes('.php')) {
      res.setHeader('Content-Type', 'video/mp2t');
    }

    // Direct pipe without buffering to keep memory footprint tiny
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy Engine Error:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Bad Gateway: Upstream connection refused', details: err.message });
    }
  });

  // Terminate upstream socket if client closes browser tab/player modal
  req.on('close', () => {
    proxyReq.destroy();
  });

  proxyReq.end();
});

app.get('/', (req, res) => {
  res.send('oub cima Proxy Engine is Live and Operational');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`oub cima Proxy listening on port ${PORT}`);
});
