import { useEffect, useRef, useState } from "react";
import type { Edits, Histogram, ImageEntry } from "../types";
import { api } from "../api/tauri";

/**
 * Debounces preview requests to Rust so rapid slider drags don't flood
 * the backend, while still feeling live. Also returns the histogram of
 * the currently rendered (edited) image.
 */
export function usePreview(image: ImageEntry | null, edits: Edits, refreshToken = 0, delay = 40) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [histogram, setHistogram] = useState<Histogram | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!image) {
      setPreviewUrl(null);
      setHistogram(null);
      setError(null);
      return;
    }

    const currentRequest = ++requestId.current;
    setIsRendering(true);
    const timer = setTimeout(async () => {
      try {
        const result = await api.getPreview(image.path, edits);
        if (requestId.current === currentRequest) {
          setPreviewUrl(result.preview);
          setHistogram(result.histogram);
          setError(null);
        }
      } catch (err) {
        console.error("Failed to render preview", err);

        if (requestId.current === currentRequest) {
          setPreviewUrl(null);
          setHistogram(null);
          setError("Couldn't load this photo — it may have been moved or deleted.");
        }
      } finally {
        if (requestId.current === currentRequest) {
          setIsRendering(false);
        }
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [image, edits, refreshToken, delay]);

  return { previewUrl, histogram, isRendering, error };
}

