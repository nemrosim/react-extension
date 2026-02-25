const express = require("express");
const { exec } = require("child_process");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
app.use(cors()); // Allow the extension to talk to us
app.use(bodyParser.json());

app.post("/download", (req, res) => {
  const videoUrl = req.body.url;

  if (!videoUrl) {
    return res.status(400).send("No URL provided");
  }

  console.log(`Downloading: ${videoUrl}`);

  // SECURITY WARNING: In a real app, sanitize 'videoUrl' to prevent command injection!
  // This executes yt-dlp in the current folder
  const command = `yt-dlp "${videoUrl}"`;

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error.message}`);
      return res.status(500).json({ error: error.message });
    }
    if (stderr) {
      console.log(`Stderr: ${stderr}`);
    }
    console.log(`Success: ${stdout}`);
    res.json({ status: "success", output: stdout });
  });
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
  console.log("Waiting for extension commands...");
});
