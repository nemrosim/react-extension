import { useEffect, useState } from "react";

interface ResourcesData {
  name: string;
  type: string;
  size: number;
}

export const useSimpleChromeExtension = () => {
  const [images, setImages] = useState<ResourcesData[]>();

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

          const foundImages = results[0].result.filter(
            (e) => e.type === "img" && isReallyImage(e.name),
          );

          if (!foundImages?.length) {
            return;
          }

          setImages(foundImages);
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

  return {
    isImagesFound: images?.length,
    downloadAllImages,
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
