import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import { useSimpleChromeExtension } from "./hooks";
import "./App.css";
import { useState } from "react";

function App() {
  const {
    isImagesFound,
    downloadAllImages,
    allVideos,
    selectedVideo,
    setSelectedVideo,
    subtitles,
    copyToClipboard,
    downloadSubtitle,
  } = useSimpleChromeExtension();
  const [copied, setCopied] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState<string>("1080p");

  const handleCopy = (url: string) => {
    copyToClipboard(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyCommand = (command: string) => {
    copyToClipboard(command);
    setCopiedCommand(true);
    setTimeout(() => setCopiedCommand(false), 2000);
  };

  // Extract filename from URL: s1/e1 -> s01e01
  const extractFilename = (url: string, quality: string): string => {
    const match = url.match(/\/s(\d+)\/e(\d+)\//);
    if (match) {
      const season = match[1].padStart(2, "0");
      const episode = match[2].padStart(2, "0");
      return `s${season}e${episode}.${quality}`;
    }
    return `video.${quality}`;
  };

  // Extract filename from subtitle URL specifically
  const extractSubtitleFilename = (subtitleUrl: string, language: string): string => {
    const match = subtitleUrl.match(/\/s(\d+)\/e(\d+)\//);
    if (match) {
      const season = match[1].padStart(2, "0");
      const episode = match[2].padStart(2, "0");
      return `s${season}e${episode}.1080p.${language}.vtt`;
    }
    return `subtitle.${language}.vtt`;
  };

  const generateYtDlpCommand = (url: string, quality: string): string => {
    const filename = extractFilename(url, quality);
    return `yt-dlp --no-check-certificate -f "bv+ba/b" --merge-output-format mp4 -P ~/Downloads -o "${filename}.%(ext)s" "${url}"`;
  };

  // Get current quality URL
  const getCurrentQualityUrl = () => {
    if (!selectedVideo) return "";
    const qualityVariant = selectedVideo.qualities.find(q => q.quality === selectedQuality);
    return qualityVariant ? qualityVariant.url : selectedVideo.url1080p;
  };

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Video Downloader</h1>

      {/* M3U8 Video Detection */}
      <div className="card">
        {selectedVideo ? (
          <div style={{ textAlign: "left" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <h3 style={{ margin: 0 }}>🎬 Video Detected!</h3>
              {allVideos.length > 1 && (
                <select
                  value={selectedVideo.episode}
                  onChange={(e) => {
                    const video = allVideos.find(v => v.episode === e.target.value);
                    if (video) setSelectedVideo(video);
                  }}
                  style={{
                    padding: "8px 12px",
                    fontSize: "14px",
                    borderRadius: "5px",
                    border: "2px solid #667eea",
                    background: "white",
                    color: "#333",
                    cursor: "pointer",
                    fontWeight: "bold",
                  }}
                >
                  {allVideos.map((video) => (
                    <option key={video.episode} value={video.episode} style={{ color: "#333" }}>
                      Episode: {video.episode.toUpperCase()}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Quality selector */}
            {selectedVideo.qualities.length > 1 && (
              <div style={{ marginBottom: "15px" }}>
                <strong style={{ color: "#333" }}>Quality:</strong>
                <select
                  value={selectedQuality}
                  onChange={(e) => setSelectedQuality(e.target.value)}
                  style={{
                    marginLeft: "10px",
                    padding: "6px 12px",
                    fontSize: "14px",
                    borderRadius: "5px",
                    border: "2px solid #667eea",
                    background: "white",
                    color: "#333",
                    cursor: "pointer",
                    fontWeight: "bold",
                  }}
                >
                  {selectedVideo.qualities.map((q) => (
                    <option key={q.quality} value={q.quality} style={{ color: "#333" }}>
                      {q.quality} ({q.resolution})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Filename display */}
            <div style={{ marginBottom: "15px" }}>
              <strong style={{ color: "#333" }}>Filename:</strong>
              <div
                style={{
                  background: "#f0f0f0",
                  padding: "10px",
                  borderRadius: "5px",
                  marginTop: "5px",
                  fontSize: "14px",
                  color: "#333",
                  fontFamily: "monospace",
                }}
              >
                {extractFilename(getCurrentQualityUrl(), selectedQuality)}.mp4
              </div>
            </div>

            {/* Video URL */}
            <div style={{ marginBottom: "15px" }}>
              <strong style={{ color: "#333" }}>Video URL ({selectedQuality}):</strong>
              <div
                style={{
                  background: "#f0f0f0",
                  padding: "10px",
                  borderRadius: "5px",
                  marginTop: "5px",
                  wordBreak: "break-all",
                  fontSize: "12px",
                  color: "#333",
                }}
              >
                {getCurrentQualityUrl()}
              </div>
              <button
                onClick={() => handleCopy(getCurrentQualityUrl())}
                style={{ marginTop: "10px" }}
              >
                {copied ? "✓ Copied!" : `Copy ${selectedQuality} URL`}
              </button>
            </div>

            {/* yt-dlp command */}
            <div style={{ marginBottom: "15px" }}>
              <strong style={{ color: "#333" }}>yt-dlp Command:</strong>
              <div
                style={{
                  background: "#f0f0f0",
                  padding: "10px",
                  borderRadius: "5px",
                  marginTop: "5px",
                  wordBreak: "break-all",
                  fontSize: "11px",
                  color: "#333",
                  fontFamily: "monospace",
                }}
              >
                {generateYtDlpCommand(getCurrentQualityUrl(), selectedQuality)}
              </div>
              <button
                onClick={() =>
                  handleCopyCommand(generateYtDlpCommand(getCurrentQualityUrl(), selectedQuality))
                }
                style={{ marginTop: "10px" }}
              >
                {copiedCommand ? "✓ Command Copied!" : "Copy yt-dlp Command"}
              </button>

              {/* Installation instructions */}
              <details style={{ marginTop: "10px" }}>
                <summary
                  style={{
                    cursor: "pointer",
                    color: "#666",
                    fontSize: "12px",
                  }}
                >
                  ℹ️ Install yt-dlp
                </summary>
                <div
                  style={{
                    marginTop: "10px",
                    padding: "12px",
                    background: "#f9f9f9",
                    borderRadius: "5px",
                    fontSize: "12px",
                    color: "#333",
                    lineHeight: "1.6",
                  }}
                >
                  <div style={{ marginBottom: "12px" }}>
                    <strong>macOS (Homebrew):</strong>
                    <div
                      style={{
                        background: "#2d2d2d",
                        color: "#f8f8f2",
                        padding: "8px",
                        borderRadius: "4px",
                        marginTop: "5px",
                        fontFamily: "monospace",
                        fontSize: "11px",
                      }}
                    >
                      brew install yt-dlp
                    </div>
                  </div>
                  <div>
                    <strong>Windows (Chocolatey):</strong>
                    <div
                      style={{
                        background: "#2d2d2d",
                        color: "#f8f8f2",
                        padding: "8px",
                        borderRadius: "4px",
                        marginTop: "5px",
                        fontFamily: "monospace",
                        fontSize: "11px",
                      }}
                    >
                      choco install yt-dlp
                    </div>
                  </div>
                </div>
              </details>
            </div>

            {/* Master playlist (collapsible) */}
            <details>
              <summary
                style={{
                  cursor: "pointer",
                  marginBottom: "10px",
                  color: "#333",
                  fontWeight: "bold",
                }}
              >
                Show Master Playlist URL
              </summary>
              <div
                style={{
                  background: "#f0f0f0",
                  padding: "10px",
                  borderRadius: "5px",
                  wordBreak: "break-all",
                  fontSize: "12px",
                  color: "#333",
                }}
              >
                {selectedVideo.masterUrl}
              </div>
            </details>

            {/* Subtitles section */}
            {subtitles.length > 0 && (
              <div style={{ marginTop: "20px", paddingTop: "20px", borderTop: "1px solid #ddd" }}>
                <strong style={{ color: "#333" }}>Subtitles:</strong>
                <div style={{ marginTop: "10px" }}>
                  {subtitles.map((subtitle, index) => {
                    const filename = extractSubtitleFilename(subtitle.url, subtitle.language);
                    return (
                      <div
                        key={index}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: "10px",
                          padding: "10px",
                          background: "#f9f9f9",
                          borderRadius: "5px",
                        }}
                      >
                        <div>
                          <span
                            style={{
                              fontFamily: "monospace",
                              fontSize: "14px",
                              color: "#333",
                            }}
                          >
                            {filename}
                          </span>
                          <div
                            style={{
                              fontSize: "11px",
                              color: "#666",
                              marginTop: "3px",
                            }}
                          >
                            {subtitle.url}
                          </div>
                        </div>
                        <button
                          onClick={() => downloadSubtitle(subtitle.url, filename)}
                          style={{
                            padding: "8px 16px",
                            fontSize: "14px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Download {subtitle.language.toUpperCase()}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            <h3>No video detected</h3>
            <p style={{ fontSize: "14px", color: "#666" }}>
              Click on a video to detect the stream URL
            </p>
          </div>
        )}
      </div>

      {/* Image Download Section */}
      <div className="card">
        {isImagesFound ? (
          <button onClick={downloadAllImages}>Download images</button>
        ) : (
          <p style={{ fontSize: "14px", color: "#666" }}>No images found</p>
        )}
      </div>
    </>
  );
}

export default App;
