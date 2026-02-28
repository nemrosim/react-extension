const express = require("express");
const { spawn } = require("child_process");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const { randomUUID } = require("crypto");

const app = express();
app.use(cors()); // Allow the extension to talk to us
app.use(bodyParser.json());

// Store download progress
const downloads = new Map();

app.post("/download", (req, res) => {
  const videoUrl = req.body.url;

  if (!videoUrl) {
    return res.status(400).send("No URL provided");
  }

  const downloadId = randomUUID();

  downloads.set(downloadId, {
    url: videoUrl,
    status: "starting",
    progress: 0,
    output: [],
    error: null
  });

  console.log(`Starting download ${downloadId}: ${videoUrl}`);

  // SECURITY WARNING: In a real app, sanitize 'videoUrl' to prevent command injection!
  const ytdlp = spawn("yt-dlp", [videoUrl, "--newline"]);

  ytdlp.stdout.on("data", (data) => {
    const output = data.toString();
    const download = downloads.get(downloadId);

    download.output.push(output);
    download.status = "downloading";

    // Parse progress from yt-dlp output (format: "[download]  45.2% of 10.50MiB")
    const progressMatch = output.match(/\[download\]\s+(\d+\.?\d*)%/);
    if (progressMatch) {
      download.progress = parseFloat(progressMatch[1]);
    }
  });

  ytdlp.stderr.on("data", (data) => {
    const download = downloads.get(downloadId);
    download.output.push(data.toString());
  });

  ytdlp.on("close", (code) => {
    const download = downloads.get(downloadId);
    if (code === 0) {
      download.status = "completed";
      download.progress = 100;
      console.log(`Download ${downloadId} completed`);
    } else {
      download.status = "failed";
      download.error = `Process exited with code ${code}`;
      console.error(`Download ${downloadId} failed`);
    }
  });

  res.json({ downloadId });
});

app.get("/download/:id", (req, res) => {
  const downloadId = req.params.id;
  const download = downloads.get(downloadId);

  if (!download) {
    return res.status(404).json({ error: "Download not found" });
  }

  res.json({
    downloadId,
    status: download.status,
    progress: download.progress,
    url: download.url,
    error: download.error,
    output: download.output.join("")
  });
});

// Serve the HTML page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
  console.log("Waiting for extension commands...");
});
