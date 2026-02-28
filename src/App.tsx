import { useSimpleChromeExtension } from "./hooks";
import "./App.css";
import { useState, useEffect } from "react";

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
    pageTitle,
    pageAltTitle,
  } = useSimpleChromeExtension();
  const [copied, setCopied] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState<string>("1080p");
  const [isDownloadingServer, setIsDownloadingServer] = useState(false);

  const [customFilename, setCustomFilename] = useState<string>("");
  const [reloadReasons, setReloadReasons] = useState<string[]>([]);
  const [editedSubtitleNames, setEditedSubtitleNames] = useState<{ [key: number]: string }>({});

  useEffect(() => {
    if (!chrome.tabs) return;

    let originTabId: number | null = null;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        originTabId = tabs[0].id;
      }
    });

    const handleTabUpdate = (
      tabId: number,
      changeInfo: any
    ) => {
      if (tabId === originTabId) {
        const changes: string[] = [];
        if (changeInfo.status === "complete") changes.push("Page fully loaded or reloaded");
        if (changeInfo.url) changes.push("URL changed (Navigation)");
        if (changeInfo.title) changes.push("Page title changed");

        if (changes.length > 0) {
          setReloadReasons(prev => Array.from(new Set([...prev, ...changes])));
        }
      }
    };

    chrome.tabs.onUpdated.addListener(handleTabUpdate);

    return () => {
      chrome.tabs.onUpdated.removeListener(handleTabUpdate);
    };
  }, []);

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

  const handleServerDownload = async () => {
    try {
      setIsDownloadingServer(true);
      const videoUrl = getCurrentQualityUrl();
      const filename = customFilename + ".mp4";

      let subtitleUrl = undefined;
      let subtitleFilename = undefined;

      // Select the first subtitle or specifically English if multiple exist
      if (subtitles && subtitles.length > 0) {
        const engSub = subtitles.find(s => s.language.includes('eng')) || subtitles[0];
        subtitleUrl = engSub.url;
        // Match the video filename (strip out ".1080p" etc if we want, but keeping it is fine as per custom string. We just add language)
        let baseName = customFilename;
        // Optionally, remove the quality string from the end of customFilename to insert before language
        if (baseName.endsWith(`.${selectedQuality}`)) {
          baseName = baseName.replace(`.${selectedQuality}`, '');
        }
        subtitleFilename = `${baseName}.${engSub.language}.vtt`;
      }

      const response = await fetch('http://localhost:3000/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: videoUrl, filename, subtitleUrl, subtitleFilename })
      });

      if (!response.ok) {
        throw new Error('Failed to start download');
      }

      const data = await response.json();

      // Open server frontend in new tab to track progress
      window.open(`http://localhost:3000/?id=${data.downloadId}`, '_blank');
    } catch (error) {
      console.error(error);
      alert("Failed to start server download. Is the server running?");
    } finally {
      setIsDownloadingServer(false);
    }
  };

  // Extract filename from URL: s1/e1 -> s01e01
  const extractFilename = (url: string, quality: string, episodeKey: string): string => {
    // Priority 1: Check for /films/ pattern (new requirement)
    const filmsMatch = url.match(/\/films\/([^/]+)\//);
    if (filmsMatch) {
      return `${filmsMatch[1]}.${quality}`;
    }

    // Priority 2: Check for sX/eY pattern
    const match = url.match(/\/s(\d+)\/e(\d+)\//);
    if (match) {
      const season = match[1].padStart(2, "0");
      const episode = match[2].padStart(2, "0");
      return `s${season}e${episode}.${quality}`;
    }

    // Fallback: Use episodeKey if it doesn't match the sX/eY format
    if (episodeKey && !episodeKey.includes('/')) {
      // Strip trailing extension if present in the key
      const safeKey = episodeKey.split('.')[0];
      return `${safeKey}.${quality}`;
    }

    return `video.${quality}`;
  };

  // Extract filename from subtitle URL specifically
  const extractSubtitleFilename = (language: string, baseName: string): string => {
    // If we have a custom or generated base name, let's just append the language to it
    // First, safely remove the video extension if it was included in baseName
    let cleanBaseName = baseName;
    if (cleanBaseName.endsWith('.mp4') || cleanBaseName.endsWith('.mkv')) {
      cleanBaseName = cleanBaseName.split('.').slice(0, -1).join('.');
    }
    // Optionally remove trailing qualities like "1080p" to keep names clean
    if (cleanBaseName.endsWith(`.${selectedQuality}`)) {
      cleanBaseName = cleanBaseName.replace(`.${selectedQuality}`, '');
    }

    return `${cleanBaseName}.${language}.vtt`;
  };

  const generateYtDlpCommand = (url: string, customName: string): string => {
    return `yt-dlp --no-check-certificate -f "bv+ba/b" --merge-output-format mp4 -P ~/Downloads -o "${customName}.%(ext)s" "${url}"`;
  };

  // Get current quality URL
  const getCurrentQualityUrl = () => {
    if (!selectedVideo) return "";
    const qualityVariant = selectedVideo.qualities.find(q => q.quality === selectedQuality);
    return qualityVariant ? qualityVariant.url : selectedVideo.url1080p;
  };

  useEffect(() => {
    if (selectedVideo) {
      setCustomFilename(extractFilename(getCurrentQualityUrl(), selectedQuality, selectedVideo.episode || ""));
    }
  }, [selectedVideo, selectedQuality]);

  return (
    <>
      <div className="refresh-container">
        <button
          className="refresh-btn"
          onClick={() => window.location.reload()}
          aria-label="Refresh extension"
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            stroke="currentColor"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
          <span className="tooltip">Refresh</span>
        </button>
      </div>

      <h1>Video Downloader</h1>

      {reloadReasons.length > 0 && (
        <div style={{
          background: "linear-gradient(135deg, #f6d365 0%, #fda085 100%)",
          color: "white",
          padding: "10px",
          borderRadius: "8px",
          marginBottom: "15px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
        }}>
          <strong style={{ fontSize: "14px", textShadow: "0 1px 2px rgba(0,0,0,0.2)" }}>⚠️ Page contents changed. Reload data?</strong>

          <details style={{ fontSize: "12px", background: "rgba(0,0,0,0.1)", borderRadius: "5px", padding: "5px 8px" }}>
            <summary style={{ cursor: "pointer", fontWeight: "bold", outline: "none" }}>What changed?</summary>
            <ul style={{ margin: "5px 0 0 0", paddingLeft: "20px", opacity: 0.9 }}>
              {reloadReasons.map((reason, idx) => (
                <li key={idx} style={{ marginBottom: "2px" }}>{reason}</li>
              ))}
            </ul>
          </details>

          <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap", marginTop: "5px" }}>
            <button
              onClick={() => window.location.reload()}
              style={{ flex: 1, padding: "6px 12px", background: "white", color: "#f6d365", fontWeight: "bold", border: "none", borderRadius: "5px", cursor: "pointer", fontSize: "12px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}
            >
              🔄 Yes, reload
            </button>
            <button
              onClick={() => setReloadReasons([])}
              style={{ flex: 1, padding: "6px 12px", background: "transparent", color: "white", border: "2px solid white", fontWeight: "bold", borderRadius: "5px", cursor: "pointer", fontSize: "12px" }}
            >
              ❌ No, keep data
            </button>
          </div>
        </div>
      )}

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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "5px" }}>
                <strong style={{ color: "#333" }}>Filename:</strong>
                <div style={{ display: "flex", gap: "5px" }}>
                  <button
                    onClick={() => setCustomFilename(extractFilename(getCurrentQualityUrl(), selectedQuality, selectedVideo?.episode || ""))}
                    style={{ padding: "4px 8px", fontSize: "10px", backgroundColor: "#e2e8f0", color: "#475569", border: "none", borderRadius: "3px", cursor: "pointer" }}
                  >Default</button>
                  <button
                    onClick={() => {
                      const safeTitle = pageTitle.trim().replace(/[/\\?%*:|"<>]/g, '-');
                      setCustomFilename(`${safeTitle || "video"}.${selectedQuality}`);
                    }}
                    style={{ padding: "4px 8px", fontSize: "10px", backgroundColor: "#e2e8f0", color: "#475569", border: "none", borderRadius: "3px", cursor: "pointer" }}
                  >Page Title</button>
                  {pageAltTitle && (
                    <button
                      onClick={() => {
                        const safeTitle = pageAltTitle.trim().replace(/[/\\?%*:|"<>]/g, '-');
                        setCustomFilename(`${safeTitle || "video"}.${selectedQuality}`);
                      }}
                      style={{ padding: "4px 8px", fontSize: "10px", backgroundColor: "#e2e8f0", color: "#475569", border: "none", borderRadius: "3px", cursor: "pointer" }}
                    >Alt Title</button>
                  )}
                </div>
              </div>
              <input
                type="text"
                value={customFilename}
                onChange={(e) => setCustomFilename(e.target.value)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  background: "#f0f0f0",
                  padding: "8px",
                  border: "1px solid #cbd5e1",
                  borderRadius: "5px",
                  fontSize: "13px",
                  color: "#333",
                  fontFamily: "monospace",
                  outline: "none"
                }}
              />
            </div>

            {/* Video URL */}
            <div style={{ marginBottom: "15px" }}>
              <strong style={{ color: "#333" }}>Video URL ({selectedQuality}):</strong>
              <div
                style={{
                  background: "#f0f0f0",
                  padding: "8px",
                  borderRadius: "5px",
                  marginTop: "5px",
                  wordBreak: "break-all",
                  fontSize: "11px",
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
                  padding: "8px",
                  borderRadius: "5px",
                  marginTop: "5px",
                  wordBreak: "break-all",
                  fontSize: "10px",
                  color: "#333",
                  fontFamily: "monospace",
                }}
              >
                {generateYtDlpCommand(getCurrentQualityUrl(), customFilename)}
              </div>
              <div style={{ display: "flex", gap: "8px", marginTop: "10px", flexDirection: "column" }}>
                <button
                  onClick={handleServerDownload}
                  disabled={isDownloadingServer}
                  style={{
                    width: "100%",
                    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                    color: "white",
                    border: "none",
                    fontWeight: "bold",
                    opacity: isDownloadingServer ? 0.7 : 1,
                    padding: "10px"
                  }}
                >
                  {isDownloadingServer ? "Starting..." : "🚀 Download on Server"}
                </button>
                <button
                  onClick={() =>
                    handleCopyCommand(generateYtDlpCommand(getCurrentQualityUrl(), customFilename))
                  }
                  style={{ width: "100%", padding: "10px" }}
                >
                  {copiedCommand ? "✓ Command Copied!" : "📋 Copy Command"}
                </button>
              </div>

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
                    const isDuplicate = subtitles.filter(s => s.language === subtitle.language).length > 1;
                    const defaultName = extractSubtitleFilename(subtitle.language, customFilename);
                    const initialName = isDuplicate ? defaultName.replace('.vtt', `-${index + 1}.vtt`) : defaultName;
                    const filename = editedSubtitleNames[index] ?? initialName;

                    return (
                      <div
                        key={index}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "10px",
                          marginBottom: "15px",
                          padding: "10px",
                          background: "#f9f9f9",
                          borderRadius: "5px",
                          border: "1px solid #eee",
                        }}
                      >
                        <div style={{ wordBreak: "break-all" }}>
                          {isDuplicate ? (
                            <div style={{ marginBottom: "8px" }}>
                              <label style={{ fontSize: "10px", color: "#666", display: "block", marginBottom: "3px" }}>
                                ⚠️ Multiple {subtitle.language} subs found. Edit filename:
                              </label>
                              <input
                                type="text"
                                value={filename}
                                onChange={(e) => setEditedSubtitleNames({ ...editedSubtitleNames, [index]: e.target.value })}
                                style={{
                                  width: "100%",
                                  boxSizing: "border-box",
                                  padding: "6px 8px",
                                  fontSize: "13px",
                                  background: "white",
                                  border: "1px solid #cbd5e1",
                                  borderRadius: "4px",
                                  color: "#333",
                                  fontFamily: "monospace",
                                  outline: "none"
                                }}
                              />
                            </div>
                          ) : (
                            <strong
                              style={{
                                fontFamily: "monospace",
                                fontSize: "13px",
                                color: "#333",
                                display: "block",
                                marginBottom: "4px"
                              }}
                            >
                              {filename}
                            </strong>
                          )}
                          <div
                            style={{
                              fontSize: "10px",
                              color: "#666",
                            }}
                          >
                            {subtitle.url}
                          </div>
                        </div>
                        <button
                          onClick={() => downloadSubtitle(subtitle.url, filename)}
                          style={{
                            padding: "8px 16px",
                            fontSize: "12px",
                            width: "100%",
                            background: "#e2e8f0",
                            color: "#334155",
                            fontWeight: "bold",
                            border: "none",
                            borderRadius: "4px",
                            cursor: "pointer",
                          }}
                        >
                          Download
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
