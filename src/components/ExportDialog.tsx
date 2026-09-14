import { useEffect, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { useEditStore } from "../store/editStore";
import type { ExportFormat } from "../types";
import { api } from "../api/tauri";

export type ExportStatus = "idle" | "exporting" | "done" | "error";

interface ExportDialogProps {
  onClose: () => void;
  onStatusChange: (status: ExportStatus) => void;
}

const FORMAT_EXTENSIONS: Record<ExportFormat, string> = {
  jpeg: "jpg",
  png: "png",
  tiff: "tiff",
  webp: "webp",
};

function getFormatFromPath(path: string): ExportFormat {
  const ext = path.split(".").pop()?.toLowerCase() || "";

  switch (ext) {
    case "jpg":
    case "jpeg":
      return "jpeg";
    case "png":
      return "png";
    case "tiff":
    case "tif":
      return "tiff";
    case "webp":
      return "webp";
    // For RAW formats and unknown types, default to PNG
    default:
      return "png";
  }
}

export function ExportDialog({ onClose, onStatusChange }: ExportDialogProps) {
  const activeImage = useEditStore((s) => s.activeImage);
  const edits = useEditStore((s) => s.edits);
  const refreshActiveRecent = useEditStore((s) => s.refreshActiveRecent);
  const bumpRefreshToken = useEditStore((s) => s.bumpRefreshToken);
  const [format, setFormat] = useState<ExportFormat>("png");
  const [quality, setQuality] = useState(75);

  // Set default format based on input image type
  useEffect(() => {
    if (activeImage) {
      const inputFormat = getFormatFromPath(activeImage.path);
      setFormat(inputFormat);
      // Adjust quality slider defaults based on format
      setQuality(inputFormat === "jpeg" ? 75 : 75);
    }
  }, [activeImage]);

  async function handleExport() {
    if (!activeImage) return;
    const defaultName = activeImage.name.replace(/\.[^/.]+$/, "");
    let outPath: string | null;
    try {
      outPath = await save({
        defaultPath: `${defaultName}-edited.${FORMAT_EXTENSIONS[format]}`,
        filters: [{ name: format.toUpperCase(), extensions: [FORMAT_EXTENSIONS[format]] }],
      });
    } catch (err) {
      console.error("Save dialog failed", err);
      return;
    }
    if (!outPath) return;

    onClose();
    onStatusChange("exporting");
    try {
      await api.exportImage(activeImage.path, edits, outPath, format, quality);
      onStatusChange("done");

      // If we overwrote the source file itself, reflect it live: reload the editor
      // preview and refresh its recents thumbnail so it doesn't go stale.
      if (outPath === activeImage.path) {
        await api.clearPreviewCache();
        bumpRefreshToken();
        refreshActiveRecent(outPath);
      }
    } catch (err) {
      console.error(err);
      onStatusChange("error");
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Export Photo</h3>

        <label className="modal-field">
          Format
          <select value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
            <option value="jpeg">JPEG</option>
            <option value="png">PNG</option>
            <option value="tiff">TIFF</option>
            <option value="webp">WebP</option>
          </select>
        </label>

        {(format === "jpeg" || format === "png") && (
          <label className="modal-field">
            Quality ({quality})
            <input
              type="range"
              min={1}
              max={100}
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
            />
          </label>
        )}

        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={handleExport}>
            Export
          </button>
        </div>
      </div>
    </div>
  );
}
