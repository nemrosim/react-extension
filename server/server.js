const express = require("express");
const { spawn } = require("child_process");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");
const https = require("https");
const http = require("http");
const readline = require("readline");

const app = express();
app.use(cors()); // Allow the extension to talk to us
app.use(bodyParser.json());

// Serve the downloads directory so users can download files
const downloadsDir = path.join(__dirname, "downloads");
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}
app.use("/downloads", express.static(downloadsDir));

// Store download progress
const downloads = new Map();

// Helper to download subtitle file using native http/https
const downloadFile = (url, dest) => {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    protocol.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(dest);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => { }); // Delete the file async.
      reject(err);
    });
  });
};

app.post("/download", (req, res) => {
  const { url: videoUrl, filename, subtitleUrl, subtitleFilename } = req.body;

  if (!videoUrl) {
    return res.status(400).send("No URL provided");
  }

  const downloadId = randomUUID();
  const downloadFolder = path.join(downloadsDir, downloadId);
  fs.mkdirSync(downloadFolder, { recursive: true });

  const safeFilename = filename ? filename.replace(/[^a-z0-9.]/gi, '_') : "video.mp4";

  // Create relative paths for client download link later
  let videoFilePath = `downloads/${downloadId}/${safeFilename}`;

  downloads.set(downloadId, {
    url: videoUrl,
    filename: safeFilename,
    status: "starting",
    progress: 0,
    output: [],
    error: null,
    files: []
  });

  console.log(`Starting download ${downloadId}: ${videoUrl}`);

  // Download subtitle if provided
  if (subtitleUrl && subtitleFilename) {
    const subDest = path.join(downloadFolder, subtitleFilename.replace(/[^a-z0-9.]/gi, '_'));
    downloadFile(subtitleUrl, subDest)
      .then(() => console.log(`Downloaded subtitle for ${downloadId}`))
      .catch(err => console.error(`Subtitle error for ${downloadId}:`, err));
  }

  // Build yt-dlp command. Output format handles extension. Example: downloads/123e4567/s01e01.%(ext)s
  // If safeFilename has an extension, yt-dlp will replace the extension properly with %(ext)s if we strip the current extension.
  const nameWithoutExt = safeFilename.substring(0, safeFilename.lastIndexOf('.')) || safeFilename;
  const outputPath = path.join(downloadFolder, `${nameWithoutExt}.%(ext)s`);

  // SECURITY WARNING: In a real app, sanitize 'videoUrl' to prevent command injection!
  const args = [
    videoUrl,
    "--newline",
    "--no-check-certificate",
    "-f", "bv+ba/b",
    "--merge-output-format", "mp4",
    "-o", outputPath
  ];

  const ytdlp = spawn("yt-dlp", args);

  const readline = require("readline"); // Fallback check
  const rl = readline.createInterface({ input: ytdlp.stdout });

  rl.on("line", (line) => {
    const download = downloads.get(downloadId);

    download.output.push(line);
    // Keep output array bounded to prevent memory leaks
    if (download.output.length > 50) {
      download.output.shift();
    }

    download.status = "downloading";

    // Parse progress from yt-dlp output (format: "[download]  45.2% of 10.50MiB")
    const progressMatch = line.match(/\[download\]\s+(\d+\.?\d*)%/);
    if (progressMatch) {
      download.progress = parseFloat(progressMatch[1]);
    }

    // Parse speed
    const speedMatch = line.match(/at\s+([~0-9.]+[a-zA-Z/]+)/);
    if (speedMatch) {
      download.speed = speedMatch[1].replace('~', '');
    }

    // Parse ETA
    const etaMatch = line.match(/ETA\s+([0-9:]+|Unknown)/i);
    if (etaMatch) {
      download.eta = etaMatch[1];
    }

    // Parse fragments (format: "(frag 12/45)" or "frag 1/15")
    const fragMatch = line.match(/frag[\s:]*(\d+)\/(\d+)/i);
    if (fragMatch) {
      download.fragDownloaded = parseInt(fragMatch[1]);
      download.fragTotal = parseInt(fragMatch[2]);
    }

    // Sometimes yt-dlp outputs the actual destination file. 
    // Format: [download] Destination: path/to/file.mp4
    const destMatch = line.match(/\[download\] Destination: (.*)/);
    if (destMatch) {
      const realFile = path.basename(destMatch[1].trim());
      download.finalVideoPath = `downloads/${downloadId}/${realFile}`;
    }
    const mergeMatch = line.match(/\[Merger\] Merging formats into "(.*)"/);
    if (mergeMatch) {
      const realFile = path.basename(mergeMatch[1].trim());
      download.finalVideoPath = `downloads/${downloadId}/${realFile}`;
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

      // Look at everything in the folder to see what files are actually there
      fs.readdir(downloadFolder, (err, files) => {
        if (!err && files.length > 0) {
          download.files = files.map(file => `/downloads/${downloadId}/${file}`);
        }
      });

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
    speed: download.speed,
    eta: download.eta,
    fragDownloaded: download.fragDownloaded,
    fragTotal: download.fragTotal,
    url: download.url,
    error: download.error,
    files: download.files,
    output: download.output.slice(-20).join("\n") // only send last 20 lines to save bandwidth
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
