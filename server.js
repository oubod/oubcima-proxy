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

// Recursive fetch function to follow upstream 302 redirects internally
function fetchWithRedirects(targetUrl, incomingHeaders, res, maxRedirects = 5) {
  if (maxRedirects <= 0) {
    return res.status(502).json({ error: 'Too many upstream redirects' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid URL', target: targetUrl });
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

  if (incomingHeaders.range) {
    options.headers['Range'] = incomingHeaders.range;
  }

  const proxyReq = client.request(options, (proxyRes) => {
    // If upstream redirects (301/302/307), follow it internally on Render
    if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
      let redirectUrl = proxyRes.headers.location;
      // Handle relative redirects
      if (!redirectUrl.startsWith('http://') && !redirectUrl.startsWith('https://')) {
        redirectUrl = new URL(redirectUrl, targetUrl).toString();
      }
      return fetchWithRedirects(redirectUrl, incomingHeaders, res, maxRedirects - 1);
    }

    // Set response status and forward headers
    res.status(proxyRes.statusCode);

    Object.keys(proxyRes.headers).forEach((key) => {
      // Do not forward connection headers that conflict with Express
      if (!['connection', 'transfer-encoding'].includes(key.toLowerCase())) {
        res.setHeader(key, proxyRes.headers[key]);
      }
    });

    // Enforce proper MIME type for video streaming
    if (targetUrl.includes('.ts') || targetUrl.includes('/live/') || !targetUrl.includes('.php')) {
      res.setHeader('Content-Type', 'video/mp2t');
    }

    // Pipe the media stream directly to the browser
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy Error on URL:', targetUrl, err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Upstream connection failed', details: err.message });
    }
  });

  res.on('close', () => {
    proxyReq.destroy();
  });

  proxyReq.end();
}

app.get('/proxy', (req, res) => {
  const rawUrlIndex = req.url.indexOf('?url=');
  if (rawUrlIndex === -1) {
    return res.status(400).json({ error: 'Missing ?url= parameter' });
  }

  let targetUrl = req.url.substring(rawUrlIndex + 5);

  try {
    targetUrl = decodeURIComponent(targetUrl);
  } catch (e) {
    // Keep raw if already decoded
  }

  fetchWithRedirects(targetUrl, req.headers, res);
});

app.get('/', (req, res) => {
  res.send('oub cima Proxy Engine Operational');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`oub cima Proxy listening on port ${PORT}`);
});
