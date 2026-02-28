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
  const [pageTitle, setPageTitle] = useState<string>("");
  const [pageAltTitle, setPageAltTitle] = useState<string>("");

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
          const payload = results[0].result;
          if (!payload || !payload.resources?.length) {
            // alert("No resources found");
            return;
          }

          const pageResources = payload.resources || [];
          setPageTitle(payload.title);
          setPageAltTitle(payload.altHeadline);

          // Get additional captured URLs from background script
          const backgroundResponse = await new Promise<{ urls: string[] }>((resolve) => {
            chrome.runtime.sendMessage({ type: "GET_CAPTURED_URLS", tabId: activeTabId }, resolve);
          });
          const capturedUrls = backgroundResponse?.urls || [];

          // Merge all resources and unique them by name/URL
          const allCapturedResources = [
            ...pageResources,
            ...capturedUrls.map(url => ({ name: url, type: "network", size: 0 }))
          ];

          const uniqueResources = allCapturedResources.filter(
            (v, i, a) => a.findIndex(t => t.name === v.name) === i
          );

          // Find images
          const foundImages = uniqueResources.filter(
            (e) => e.type === "img" && isReallyImage(e.name),
          );

          if (foundImages?.length) {
            setImages(foundImages);
          }

          // Find m3u8 files - group by episode
          const m3u8Resources = uniqueResources.filter((e) =>
            e.name.includes(".m3u8") || e.name.includes(".urlset")
          );

          console.log("Found m3u8 resources:", m3u8Resources);

          // Find all master playlists
          const masterPlaylists = m3u8Resources.filter(
            (e) =>
              e.name.toLowerCase().includes("master") ||
              e.name.toLowerCase().includes("manifest") ||
              e.name.toLowerCase().includes(".urlset") ||
              e.name.toLowerCase().includes("playlist.m3u8")
          );

          // Group master playlists by episode (extract s#/e# from URL)
          const episodeMap = new Map<string, string>();

          masterPlaylists.forEach((playlist) => {
            const filmsMatch = playlist.name.match(/\/films\/([^/]+)\//);
            const seMatch = playlist.name.match(/\/(s\d+\/e\d+)\//);

            if (filmsMatch) {
              const episodeKey = filmsMatch[1];
              if (!episodeMap.has(episodeKey)) {
                episodeMap.set(episodeKey, playlist.name);
              }
            } else if (seMatch) {
              const episodeKey = seMatch[1];
              // Keep only unique episodes (first occurrence)
              if (!episodeMap.has(episodeKey)) {
                episodeMap.set(episodeKey, playlist.name);
              }
            } else {
              // Fallback: extract a recognizable part of the URL (e.g. video name)
              const parts = playlist.name.split('/');
              // Look backwards for a part that isn't empty, doesn't contain m3u8/hls
              let uniqueKey = "video";
              for (let i = parts.length - 2; i >= 0; i--) { // Start from parent directory of manifest.m3u8
                if (parts[i] && !parts[i].includes('m3u8') && !parts[i].includes('hls')) {
                  uniqueKey = parts[i].split(':')[0]; // Remove extra appended stuff like :hls
                  break;
                }
              }
              // Ensure uniqueness if multiple playlists show up with same generic names
              if (episodeMap.has(uniqueKey)) {
                uniqueKey = `${uniqueKey}-${Math.random().toString(36).substring(2, 7)}`;
              }
              episodeMap.set(uniqueKey, playlist.name);
            }
          });

          console.log("Unique episodes found:", Array.from(episodeMap.keys()));

          // Process each episode to get all quality variants
          const videoDataPromises = Array.from(episodeMap.entries()).map(
            async ([episode, masterUrl]) => {
              try {
                // Fetch using executeScript to maintain page context, origin, and cookies (Bypasses CDN blocking popup fetches)
                const fetchResults = await chrome.scripting.executeScript({
                  target: { tabId: activeTabId },
                  func: async (url) => {
                    const res = await fetch(url);
                    if (!res.ok) throw new Error("HTTP " + res.status);
                    return res.text();
                  },
                  args: [masterUrl]
                });

                const text = fetchResults[0]?.result;
                if (!text) return null;

                let qualities = extractAllQualities(text, masterUrl);
                let url1080p = extract1080pUrl(text, masterUrl);

                // If quality list is empty, it might be a direct chunklist instead of a master playlist
                if (qualities.length === 0) {
                  if (text.includes("#EXTINF") || text.includes("#EXT-X-TARGETDURATION")) {
                    qualities = [{ quality: "Unknown", url: masterUrl, resolution: "Unknown" }];
                    url1080p = masterUrl;
                  }
                }

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
                // Fallback if fetch fails (e.g. wiped CDN file or CORS error) -> just provide the direct URL as Unknown quality
                return {
                  masterUrl,
                  url1080p: masterUrl,
                  episode,
                  qualities: [{ quality: "Unknown", url: masterUrl, resolution: "Unknown" }],
                };
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
            // Select the last video by default
            setSelectedVideo(videoDataList[videoDataList.length - 1]);
          }

          // Find subtitle files (.vtt)
          const subtitleResources = uniqueResources.filter(
            (e: any) => e.name.includes(".vtt"),
          );

          if (subtitleResources.length > 0) {
            const subtitleDataPromises = subtitleResources.map(async (sub: any) => {
              // Extract language from filename (e.g., eng1.vtt, rus2.vtt, eng.vtt)
              const urlParts = sub.name.split('/');
              const filename = urlParts[urlParts.length - 1];

              const match = filename.match(/^([a-z]+)\d*\.vtt$/i);
              let language = match ? match[1] : "unknown";

              // If language is not cleanly regex matched, fetch the first few KB and detect!
              if (language === "unknown") {
                try {
                  const fetchResults = await chrome.scripting.executeScript({
                    target: { tabId: activeTabId },
                    func: async (url) => {
                      try {
                        const res = await fetch(url, { headers: { Range: "bytes=0-2000" } });
                        if (!res.ok && res.status !== 206) {
                          const fullRes = await fetch(url);
                          const text = await fullRes.text();
                          return text.substring(0, 2000);
                        }
                        return await res.text();
                      } catch (e) {
                        return "";
                      }
                    },
                    args: [sub.name]
                  });

                  const text = fetchResults[0]?.result || "";
                  if (text) {
                    // Fast language detection based on majority
                    const cyrillicCount = (text.match(/[\u0400-\u04FF]/g) || []).length;
                    const engCount = (text.match(/\b(the|is|and|you|that|it|of|to|I|what|we|this)\b/gi) || []).length;
                    const itaCount = (text.match(/\b(di|che|la|il|un|non|si|da|per|una)\b/gi) || []).length;

                    if (cyrillicCount > 10) language = "rus";
                    else if (itaCount > engCount && itaCount > 2) language = "ita";
                    else if (engCount > 2) language = "eng";
                    else language = filename.replace('.vtt', '');
                  } else {
                    language = filename.replace('.vtt', '');
                  }
                } catch (e) {
                  language = filename.replace('.vtt', '');
                }
              }

              return {
                url: sub.name,
                language,
              };
            });

            const subtitleList = await Promise.all(subtitleDataPromises);
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
    pageTitle,
    pageAltTitle,
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
      if (resolution.includes("1920x1080") || resolution.includes("1920x")) quality = "1080p";
      else if (resolution.includes("1280x720") || resolution.includes("1280x")) quality = "720p";
      else if (resolution.includes("854x480") || resolution.includes("850x480") || resolution.includes("x480")) quality = "480p";
      else if (resolution.includes("640x360") || resolution.includes("x360")) quality = "360p";
      else {
        // Extract height for other resolutions
        const heightMatch = resolution.match(/x(\d+)/);
        quality = heightMatch ? `${heightMatch[1]}p` : `${resolution}p`;
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
    } else if (line.startsWith("#EXT-X-STREAM-INF") && !line.includes("RESOLUTION=")) {
      // Handle cases where resolution is missing but quality might be in NAME or elsewhere
      const nameMatch = line.match(/NAME="([^"]+)"/);
      let quality = nameMatch ? nameMatch[1] : "Direct Stream";

      // The next non-empty line should be the URL
      for (let j = i + 1; j < lines.length; j++) {
        const urlLine = lines[j].trim();
        if (urlLine && !urlLine.startsWith("#")) {
          let url: string;
          if (urlLine.startsWith("http")) {
            url = urlLine;
          } else {
            try {
              const baseUrlObj = new URL(baseUrl);
              const basePath = baseUrlObj.pathname.substring(0, baseUrlObj.pathname.lastIndexOf("/"));
              url = `${baseUrlObj.origin}${basePath}/${urlLine}`;
            } catch (error) {
              console.error("Error constructing absolute URL:", error);
              break;
            }
          }
          qualities.push({ quality, url, resolution: "Unknown" });
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

  const resources = entries.map((entry) => {
    const resource = entry as PerformanceResourceTiming;

    return {
      name: resource.name,
      type: resource.initiatorType,
      size: resource.transferSize,
    };
  });

  // Also check DOM for direct video/iframe links
  const videos = Array.from(document.querySelectorAll('video, source')).map(v => {
    const src = (v as HTMLVideoElement).src || (v as HTMLSourceElement).src;
    return src ? { name: src, type: "video-tag", size: 0 } : null;
  }).filter(v => v !== null) as any[];

  const iframes = Array.from(document.querySelectorAll('iframe')).map(i => {
    const src = i.src;
    // Common video hosts in iframes
    if (src && (src.includes('m3u8') || src.includes('.mp4') || src.includes('embed'))) {
      return { name: src, type: "iframe-tag", size: 0 };
    }
    return null;
  }).filter(i => i !== null) as any[];

  const altHeadline = document.querySelector('div[itemprop="alternativeHeadline"]')?.textContent?.trim() || "";

  return {
    resources: [...resources, ...videos, ...iframes],
    title: document.title,
    altHeadline
  };
}
