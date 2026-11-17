const express = require("express");
const cors = require("cors");
const needle = require("needle");

const app = express();

// 1. Enable full CORS for browser & PWA MSE playback
app.use(
  cors({
    origin: "*",
    methods: ["GET", "HEAD", "POST", "OPTIONS"],
    allowedHeaders: "*",
    exposedHeaders: ["Content-Length", "Content-Range", "Accept-Ranges"],
  })
);

// 2. High-throughput streaming endpoint
app.get("/proxy", (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).json({ error: "Missing ?url= query parameter" });
  }

  // Spoof genuine hardware IPTV Box / VLC player headers
  const options = {
    headers: {
      "User-Agent": "VLC/3.0.18 LibVLC/3.0.18",
      "Accept": "*/*",
      "Icy-MetaData": "1",
      "Connection": "keep-alive",
    },
    follow_max: 5,
    response_timeout: 15000,
  };

  // Pass video range requests if requested by the browser
  if (req.headers.range) {
    options.headers["Range"] = req.headers.range;
  }

  // Stream raw bytes directly to the browser
  const stream = needle.get(targetUrl, options);

  stream.on("header", (statusCode, headers) => {
    // Forward media headers
    res.status(statusCode);
    if (headers["content-type"]) res.setHeader("Content-Type", headers["content-type"]);
    if (headers["content-length"]) res.setHeader("Content-Length", headers["content-length"]);
    if (headers["content-range"]) res.setHeader("Content-Range", headers["content-range"]);
    if (headers["accept-ranges"]) res.setHeader("Accept-Ranges", headers["accept-ranges"]);

    // Override Content-Type for MPEG-TS to ensure browser MSE accepts it
    if (targetUrl.includes(".ts") || targetUrl.includes("/live/")) {
      res.setHeader("Content-Type", "video/mp2t");
    }
  });

  stream.on("data", (chunk) => {
    res.write(chunk);
  });

  stream.on("end", () => {
    res.end();
  });

  stream.on("error", (err) => {
    console.error("Stream Proxy Error:", err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: "Failed to pipe upstream", message: err.message });
    } else {
      res.end();
    }
  });

  // If browser closes the player modal, abort the upstream socket immediately
  req.on("close", () => {
    stream.destroy();
  });
});

// Health check endpoint
app.get("/", (req, res) => {
  res.send("oub cima Node Stream Proxy is operational!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`oub cima Proxy running on port ${PORT}`);
});
