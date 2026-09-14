import { useEffect, useState } from "react";
import { DEFAULT_EDITS, type CropRect, type ImageEntry } from "../types";
import { api } from "../api/tauri";

/**
 * Fetches the unedited-but-geometry-matched preview for before/after comparison:
 * rotation/flip/crop must match the edited image, only color/effect edits are excluded.
 */
export function useOriginalPreview(
  image: ImageEntry | null,
  geometry: { rotate90: number; flipHorizontal: boolean; flipVertical: boolean; crop: CropRect | null },
  refreshToken = 0,
) {
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!image) {
      setOriginalUrl(null);
      return;
    }
    let cancelled = false;
    api
      .getOriginalPreview(image.path, { ...DEFAULT_EDITS, ...geometry })
      .then((url) => {
        if (!cancelled) setOriginalUrl(url);
      })
      .catch((err) => console.error("Failed to load original preview", err));
    return () => {
      cancelled = true;
    };
  }, [image, geometry.rotate90, geometry.flipHorizontal, geometry.flipVertical, geometry.crop, refreshToken]);

  return originalUrl;
}
