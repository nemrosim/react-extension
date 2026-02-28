chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));

// Store captured URLs in memory
const capturedUrls = new Map(); // tabId -> Set of URLs

// Listen for network requests to catch m3u8 and mp4 files
chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
        const { url, tabId, type } = details;
        if (tabId === -1) return;

        // Filter for video-related extensions or patterns
        const isVideo = url.includes(".m3u8") ||
            url.includes(".mp4") ||
            url.includes(".mkv") ||
            url.includes(".urlset") ||
            (type === "xmlhttprequest" && (url.includes("playlist") || url.includes("manifest")));

        if (isVideo) {
            if (!capturedUrls.has(tabId)) {
                capturedUrls.set(tabId, new Set());
            }
            capturedUrls.get(tabId).add(url);

            // Optional: Log for debugging
            console.log(`Captured video URL for tab ${tabId}: ${url}`);
        }
    },
    { urls: ["<all_urls>"] }
);

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
    capturedUrls.delete(tabId);
});

// Provide URLs to the sidepanel/popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "GET_CAPTURED_URLS") {
        const tabId = message.tabId;
        const urls = Array.from(capturedUrls.get(tabId) || []);
        sendResponse({ urls });
        return true; // Keep channel open for async response
    }

    if (message.type === "CLEAR_CAPTURED_URLS") {
        const tabId = message.tabId;
        capturedUrls.delete(tabId);
        sendResponse({ success: true });
    }
});
