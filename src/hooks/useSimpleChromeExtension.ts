import { useEffect, useState } from "react";

interface ResourcesData {
  name: string;
  type: string;
  size: number;
}

interface QualityVariant {
  quality: string; // e.g., "1080p", "720p", "480p"
  url: string;
  resolution: string; // e.g., "1920x1080"
}

interface M3u8Data {
  masterUrl: string;
  url1080p: string;
  episode: string; // e.g., "s1/e1", "s1/e2"
  qualities: QualityVariant[]; // All available quality variants
}

interface SubtitleData {
  url: string;
  language: string;
}

export const useSimpleChromeExtension = () => {
  const [images, setImages] = useState<ResourcesData[]>();
  const [allVideos, setAllVideos] = useState<M3u8Data[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<M3u8Data | null>(null);
  const [subtitles, setSubtitles] = useState<SubtitleData[]>([]);

  useEffect(() => {
    if (!chrome.tabs) {
      //  Will be undefined if open app not as a Chrome extension
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTabId = tabs[0].id;

      if (!activeTabId) {
        //  Will be undefined if open app not as a Chrome extension
        alert("activeTabId is undefined");
        return;
      }

      chrome.scripting.executeScript(
        {
          target: { tabId: activeTabId },
          func: getPageResources,
        },
        async (results) => {
          if (!results[0].result?.length) {
            alert("No resources found");
            return;
          }

          const resources = results[0].result;

          // Find images
          const foundImages = resources.filter(
            (e) => e.type === "img" && isReallyImage(e.name),
          );

          if (foundImages?.length) {
            setImages(foundImages);
          }

          // Find m3u8 files - group by episode
          const m3u8Resources = resources.filter((e) => e.name.includes(".m3u8"));

          console.log("Found m3u8 resources:", m3u8Resources);

          // Find all master playlists
          const masterPlaylists = m3u8Resources.filter(
            (e) =>
              e.name.includes("master.m3u8") || e.name.includes(".m3u8.urlset/"),
          );

          // Group master playlists by episode (extract s#/e# from URL)
          const episodeMap = new Map<string, string>();

          masterPlaylists.forEach((playlist) => {
            const match = playlist.name.match(/\/(s\d+\/e\d+)\//);
            if (match) {
              const episodeKey = match[1];
              // Keep only unique episodes (first occurrence)
              if (!episodeMap.has(episodeKey)) {
                episodeMap.set(episodeKey, playlist.name);
              }
            }
          });

          console.log("Unique episodes found:", Array.from(episodeMap.keys()));

          // Process each episode to get all quality variants
          const videoDataPromises = Array.from(episodeMap.entries()).map(
            async ([episode, masterUrl]) => {
              try {
                const response = await fetch(masterUrl);
                const text = await response.text();
                const qualities = extractAllQualities(text, masterUrl);
                const url1080p = extract1080pUrl(text, masterUrl);

                if (url1080p && qualities.length > 0) {
                  return {
                    masterUrl,
                    url1080p,
                    episode,
                    qualities,
                  };
                }
              } catch (error) {
                console.error(`Error fetching playlist for ${episode}:`, error);
              }
              return null;
            },
          );

          const videoDataList = (await Promise.all(videoDataPromises)).filter(
            (v): v is M3u8Data => v !== null,
          );

          console.log("Processed videos:", videoDataList);

          if (videoDataList.length > 0) {
            setAllVideos(videoDataList);
            // Select the first video by default
            setSelectedVideo(videoDataList[0]);
          }

          // Find subtitle files (.vtt)
          const subtitleResources = resources.filter(
            (e) => e.name.includes(".vtt") && e.name.includes("subtitles"),
          );

          if (subtitleResources.length > 0) {
            const subtitleList = subtitleResources.map((sub) => {
              // Extract language from filename (e.g., eng.vtt, rus.vtt)
              const match = sub.name.match(/\/([a-z]{3})\.vtt$/i);
              const language = match ? match[1] : "unknown";

              return {
                url: sub.name,
                language,
              };
            });

            setSubtitles(subtitleList);
          }
        },
      );
    });
  }, []);

  const downloadAllImages = () => {
    if (!images?.length) {
      return;
    }

    images.forEach((e) => {
      chrome.downloads.download({
        url: e.name,
        // Renames if file exists
        conflictAction: "uniquify",
        // Set to true if you want a popup for every single file
        saveAs: false,
      });
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const downloadSubtitle = async (subtitleUrl: string, filename: string) => {
    try {
      // Fetch the subtitle VTT content
      const response = await fetch(subtitleUrl);
      const vttContent = await response.text();

      // Create a VTT file with proper MIME type
      const blob = new Blob([vttContent], { type: "text/vtt;charset=utf-8" });
      const blobUrl = URL.createObjectURL(blob);

      // Download with .vtt extension
      chrome.downloads.download(
        {
          url: blobUrl,
          filename: filename, // Already includes .vtt extension
          conflictAction: "uniquify",
          saveAs: false,
        },
        (downloadId) => {
          // Clean up the blob URL after download starts
          if (downloadId) {
            setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
          }
        }
      );
    } catch (error) {
      console.error("Error downloading subtitle:", error);
      alert(`Failed to download subtitle: ${error}`);
    }
  };

  return {
    isImagesFound: images?.length,
    downloadAllImages,
    allVideos,
    selectedVideo,
    setSelectedVideo,
    subtitles,
    copyToClipboard,
    downloadSubtitle,
  };
};

function isReallyImage(name: string) {
  return (
    name.includes(".jpg") ||
    name.includes(".jpeg") ||
    name.includes(".png") ||
    name.includes(".svg") ||
    name.includes(".gif") ||
    name.includes(".webp")
  );
}

// Function to extract all quality variants from m3u8 playlist content
function extractAllQualities(playlistContent: string, baseUrl: string): QualityVariant[] {
  const lines = playlistContent.split("\n");
  const qualities: QualityVariant[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Look for stream info lines with resolution
    if (line.startsWith("#EXT-X-STREAM-INF") && line.includes("RESOLUTION=")) {
      // Extract resolution
      const resolutionMatch = line.match(/RESOLUTION=(\d+x\d+)/);
      if (!resolutionMatch) continue;

      const resolution = resolutionMatch[1];

      // Determine quality label (480p, 720p, 1080p, etc.)
      let quality = "unknown";
      if (resolution.includes("1920x1080")) quality = "1080p";
      else if (resolution.includes("1280x720")) quality = "720p";
      else if (resolution.includes("854x480")) quality = "480p";
      else if (resolution.includes("640x360")) quality = "360p";
      else {
        // Extract height for other resolutions
        const height = resolution.split("x")[1];
        quality = `${height}p`;
      }

      // The next non-empty line should be the URL
      for (let j = i + 1; j < lines.length; j++) {
        const urlLine = lines[j].trim();
        if (urlLine && !urlLine.startsWith("#")) {
          let url: string;

          // If it's already an absolute URL, use it
          if (urlLine.startsWith("http")) {
            url = urlLine;
          } else {
            // Construct absolute URL from base URL
            try {
              const baseUrlObj = new URL(baseUrl);
              const basePath = baseUrlObj.pathname.substring(
                0,
                baseUrlObj.pathname.lastIndexOf("/"),
              );
              url = `${baseUrlObj.origin}${basePath}/${urlLine}`;
            } catch (error) {
              console.error("Error constructing absolute URL:", error);
              break;
            }
          }

          qualities.push({ quality, url, resolution });
          break;
        }
      }
    }
  }

  // Sort by quality (highest first)
  qualities.sort((a, b) => {
    const aHeight = parseInt(a.quality);
    const bHeight = parseInt(b.quality);
    return bHeight - aHeight;
  });

  return qualities;
}

// Function to extract 1080p URL from m3u8 playlist content
function extract1080pUrl(playlistContent: string, baseUrl: string): string | null {
  const qualities = extractAllQualities(playlistContent, baseUrl);
  const q1080p = qualities.find((q) => q.quality === "1080p");
  return q1080p ? q1080p.url : null;
}

function getPageResources() {
  const entries = performance.getEntriesByType("resource");

  return entries.map((entry) => {
    const resource = entry as PerformanceResourceTiming;

    return {
      name: resource.name,
      type: resource.initiatorType,
      size: resource.transferSize,
    };
  });
}
