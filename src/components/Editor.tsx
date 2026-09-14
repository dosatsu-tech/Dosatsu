import { useEffect, useRef, useState } from "react";
import { useEditStore } from "../store/editStore";
import { usePreview } from "../hooks/usePreview";
import { useOriginalPreview } from "../hooks/useOriginalPreview";
import { usePersistEdits } from "../hooks/usePersistEdits";
import { AdjustmentPanel } from "./AdjustmentPanel";
import { PresetsPanel } from "./PresetsPanel";
import { SavePresetButton } from "./SavePresetButton";
import { StyleMatchView } from "./StyleMatchView";
import { HslPanel } from "./HslPanel";
import { ColorGradingPanel } from "./ColorGradingPanel";
import { ToneCurvePanel } from "./ToneCurvePanel";
import { BwMixerPanel } from "./BwMixerPanel";
import { ExportDialog, type ExportStatus } from "./ExportDialog";
import { Histogram } from "./Histogram";
import { CropOverlay } from "./CropOverlay";
import { BeforeAfterSlider } from "./BeforeAfterSlider";
import { RotateLeftIcon, RotateRightIcon, FlipHorizontalIcon, FlipVerticalIcon, HistogramIcon } from "./icons";

const SWIPE_THRESHOLD = 60;

export function Editor() {
  const activeImage = useEditStore((s) => s.activeImage);
  const edits = useEditStore((s) => s.edits);
  const commitPartialEdit = useEditStore((s) => s.commitPartialEdit);
  const closeEditor = useEditStore((s) => s.closeEditor);
  const nextImage = useEditStore((s) => s.nextImage);
  const prevImage = useEditStore((s) => s.prevImage);
  const undo = useEditStore((s) => s.undo);
  const redo = useEditStore((s) => s.redo);
  const resetEdits = useEditStore((s) => s.resetEdits);
  const canUndo = useEditStore((s) => s.past.length > 0);
  const canRedo = useEditStore((s) => s.future.length > 0);
  const refreshToken = useEditStore((s) => s.refreshToken);
  const setAcceptingReferenceDrop = useEditStore((s) => s.setAcceptingReferenceDrop);
  const removeRecent = useEditStore((s) => s.removeRecent);
  const { previewUrl, histogram, isRendering, error } = usePreview(activeImage, edits, refreshToken);
  usePersistEdits(activeImage, edits);
  const originalUrl = useOriginalPreview(
    activeImage,
    { rotate90: edits.rotate90, flipHorizontal: edits.flipHorizontal, flipVertical: edits.flipVertical, crop: edits.crop },
    refreshToken,
  );
  const [showExport, setShowExport] = useState(false);
  const [exportStatus, setExportStatus] = useState<ExportStatus>("idle");
  const [cropMode, setCropMode] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [styleMatchMode, setStyleMatchMode] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"presets" | "adjustments">("presets");
  const [selectedPresetId, setSelectedPresetId] = useState("");
  // Only affects mobile layouts (see the histogram-toggle/histogram-wrap CSS) on
  // desktop the histogram always shows regardless of this, closed-by-default is a
  // small-screen space-saving default, not a change to the desktop experience.
  const [histogramOpen, setHistogramOpen] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setAcceptingReferenceDrop(styleMatchMode);
    return () => setAcceptingReferenceDrop(false);
  }, [styleMatchMode, setAcceptingReferenceDrop]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (e.key === "ArrowRight") nextImage();
      if (e.key === "ArrowLeft") prevImage();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, nextImage, prevImage]);

  useEffect(() => {
    if (exportStatus !== "done" && exportStatus !== "error") return;
    const timer = setTimeout(() => setExportStatus("idle"), 1500);
    return () => clearTimeout(timer);
  }, [exportStatus]);

  if (!activeImage) return null;

  function rotate(direction: 1 | -1) {
    const next = (((edits.rotate90 + direction) % 4) + 4) % 4;
    commitPartialEdit({ rotate90: next });
  }

  // Crop - compare - match-style each take over the canvas only one at a time.
  function toggleCropMode() {
    setCropMode((v) => !v);
    setCompareMode(false);
    setStyleMatchMode(false);
  }

  function toggleCompareMode() {
    setCompareMode((v) => !v);
    setCropMode(false);
    setStyleMatchMode(false);
  }

  function toggleStyleMatchMode() {
    setStyleMatchMode((v) => !v);
    setCropMode(false);
    setCompareMode(false);
  }

  async function handleRemoveFromGallery() {
    if (!activeImage) return;
    await removeRecent(activeImage.path);
    closeEditor();
  }

  function handleSwipeStart(e: React.PointerEvent) {
    swipeStart.current = { x: e.clientX, y: e.clientY };
  }

  function handleSwipeEnd(e: React.PointerEvent) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) nextImage();
      else prevImage();
    }
  }

  return (
    <div className="editor">
      <div className="editor__canvas-area">
        <div className="editor__toolbar">
          <button className="link-button" onClick={closeEditor}>
            Back to gallery
          </button>
          <span className="editor__filename">{activeImage.name}</span>

          <div className="editor__tools">
            <button onClick={resetEdits} title="Reset adjustments">
              Reset
            </button>
            <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl/Cmd+Z)">
              Undo
            </button>
            <button onClick={redo} disabled={!canRedo} title="Redo (Shift+Ctrl/Cmd+Z)">
              Redo
            </button>
            <button className="icon-button" onClick={() => rotate(-1)} title="Rotate left">
              <RotateLeftIcon />
            </button>
            <button className="icon-button" onClick={() => rotate(1)} title="Rotate right">
              <RotateRightIcon />
            </button>
            <button
              className={`icon-button${edits.flipHorizontal ? " active" : ""}`}
              onClick={() => commitPartialEdit({ flipHorizontal: !edits.flipHorizontal })}
              title="Flip horizontal"
            >
              <FlipHorizontalIcon />
            </button>
            <button
              className={`icon-button${edits.flipVertical ? " active" : ""}`}
              onClick={() => commitPartialEdit({ flipVertical: !edits.flipVertical })}
              title="Flip vertical"
            >
              <FlipVerticalIcon />
            </button>
            <button onClick={toggleCropMode} className={cropMode ? "active" : ""} title="Crop">
              Crop
            </button>
            {edits.crop && (
              <button className="link-button" onClick={() => commitPartialEdit({ crop: null })}>
                Clear crop
              </button>
            )}
            <button
              onClick={toggleCompareMode}
              className={compareMode ? "active" : ""}
              title="Before / after"
              disabled={!originalUrl}
            >
              Compare
            </button>
            <button onClick={toggleStyleMatchMode} className={styleMatchMode ? "active" : ""} title="Match a photo's style">
              Match style
            </button>
          </div>

          <SavePresetButton selectedId={selectedPresetId} onSaved={setSelectedPresetId} />
          <button
            className={`primary export-button${exportStatus !== "idle" ? ` export-button--${exportStatus}` : ""}`}
            onClick={() => setShowExport(true)}
            disabled={exportStatus === "exporting"}
          >
            {exportStatus === "exporting" && <span className="spinner" aria-hidden="true" />}
            {exportStatus === "exporting"
              ? "Exporting…"
              : exportStatus === "done"
                ? "Exported ✓"
                : exportStatus === "error"
                  ? "Export failed"
                  : "Export"}
          </button>
        </div>
        <div className="editor__canvas" ref={canvasRef}>
          {styleMatchMode ? (
            <StyleMatchView
              previewUrl={previewUrl}
              currentName={activeImage.name}
              onApplied={() => setStyleMatchMode(false)}
            />
          ) : error ? (
            <div className="editor__error">
              <p>{error}</p>
              <div className="editor__error-actions">
                <button onClick={closeEditor}>Back to gallery</button>
                <button className="primary" onClick={handleRemoveFromGallery}>
                  Remove from gallery
                </button>
              </div>
            </div>
          ) : previewUrl ? (
            compareMode && originalUrl ? (
              <BeforeAfterSlider beforeUrl={originalUrl} afterUrl={previewUrl} alt={activeImage.name} />
            ) : (
              <img
                ref={imgRef}
                src={previewUrl}
                alt={activeImage.name}
                className="editor__image"
                draggable={false}
                onPointerDown={cropMode ? undefined : handleSwipeStart}
                onPointerUp={cropMode ? undefined : handleSwipeEnd}
              />
            )
          ) : (
            <div className="editor__placeholder">Loading preview…</div>
          )}
          {!styleMatchMode && !error && isRendering && <div className="editor__rendering-badge">Rendering…</div>}
          {!cropMode && !compareMode && !styleMatchMode && !error && (
            <>
              <button className="editor__nav editor__nav--prev" onClick={prevImage} title="Previous photo">
                ‹
              </button>
              <button className="editor__nav editor__nav--next" onClick={nextImage} title="Next photo">
                ›
              </button>
            </>
          )}
          {cropMode && !compareMode && !styleMatchMode && !error && (
            <CropOverlay
              containerRef={canvasRef}
              imgRef={imgRef}
              onCropChange={(rect) => commitPartialEdit({ crop: rect })}
            />
          )}
        </div>
      </div>
      <aside className="editor__sidebar">
        <div className="editor__sidebar-top">
          <button
            className="histogram-toggle icon-button"
            onClick={() => setHistogramOpen((v) => !v)}
            title={histogramOpen ? "Hide histogram" : "Show histogram"}
          >
            <HistogramIcon />
          </button>
        </div>
        <div className={`histogram-wrap${histogramOpen ? " histogram-wrap--open" : ""}`}>
          <Histogram data={histogram} />
        </div>
        <div className="sidebar-tabs">
          <button
            className={`sidebar-tab${sidebarTab === "presets" ? " sidebar-tab--active" : ""}`}
            onClick={() => setSidebarTab("presets")}
          >
            Presets
          </button>
          <button
            className={`sidebar-tab${sidebarTab === "adjustments" ? " sidebar-tab--active" : ""}`}
            onClick={() => setSidebarTab("adjustments")}
          >
            Adjustments
          </button>
        </div>
        {sidebarTab === "presets" ? (
          <PresetsPanel selectedId={selectedPresetId} onSelect={setSelectedPresetId} />
        ) : (
          <>
            <AdjustmentPanel />
            <ToneCurvePanel />
            <HslPanel />
            <BwMixerPanel />
            <ColorGradingPanel />
          </>
        )}
      </aside>
      {showExport && (
        <ExportDialog onClose={() => setShowExport(false)} onStatusChange={setExportStatus} />
      )}
    </div>
  );
}
