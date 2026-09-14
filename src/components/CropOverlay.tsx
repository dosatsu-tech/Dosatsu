import { useRef, useState, type RefObject } from "react";
import type { CropRect } from "../types";

interface CropOverlayProps {
  containerRef: RefObject<HTMLDivElement | null>;
  imgRef: RefObject<HTMLImageElement | null>;
  onCropChange: (rect: CropRect) => void;
}

interface ContentRect {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Offset of the image content box relative to the overlay container, for rendering. */
  offsetX: number;
  offsetY: number;
}

function getContentRect(img: HTMLImageElement, container: HTMLDivElement): ContentRect {
  const containerRect = container.getBoundingClientRect();
  const scale = Math.min(
    containerRect.width / img.naturalWidth,
    containerRect.height / img.naturalHeight,
  );
  const width = img.naturalWidth * scale;
  const height = img.naturalHeight * scale;
  const left = containerRect.left + (containerRect.width - width) / 2;
  const top = containerRect.top + (containerRect.height - height) / 2;
  return {
    left,
    top,
    width,
    height,
    offsetX: left - containerRect.left,
    offsetY: top - containerRect.top,
  };
}

/** Drag-to-draw crop rectangle overlay, positioned to match the letterboxed preview image. */
export function CropOverlay({ containerRef, imgRef, onCropChange }: CropOverlayProps) {
  const [dragRect, setDragRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(
    null,
  );
  const contentRect = useRef<ContentRect | null>(null);

  function startDrag(e: React.PointerEvent) {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container) return;
    contentRect.current = getContentRect(img, container);
    const x = e.clientX - contentRect.current.left;
    const y = e.clientY - contentRect.current.top;
    setDragRect({ x1: x, y1: y, x2: x, y2: y });
  }

  function moveDrag(e: React.PointerEvent) {
    if (!dragRect || !contentRect.current) return;
    const x = e.clientX - contentRect.current.left;
    const y = e.clientY - contentRect.current.top;
    setDragRect({ ...dragRect, x2: x, y2: y });
  }

  function endDrag() {
    const rect = contentRect.current;
    if (!dragRect || !rect || rect.width === 0 || rect.height === 0) {
      setDragRect(null);
      return;
    }
    const x1 = Math.min(dragRect.x1, dragRect.x2);
    const y1 = Math.min(dragRect.y1, dragRect.y2);
    const x2 = Math.max(dragRect.x1, dragRect.x2);
    const y2 = Math.max(dragRect.y1, dragRect.y2);

    const normalized: CropRect = {
      x: Math.min(1, Math.max(0, x1 / rect.width)),
      y: Math.min(1, Math.max(0, y1 / rect.height)),
      w: Math.min(1, Math.max(0.02, (x2 - x1) / rect.width)),
      h: Math.min(1, Math.max(0.02, (y2 - y1) / rect.height)),
    };
    onCropChange(normalized);
    setDragRect(null);
  }

  return (
    <div
      className="crop-overlay"
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
    >
      {dragRect && contentRect.current && (
        <div
          className="crop-overlay__rect"
          style={{
            left: contentRect.current.offsetX + Math.min(dragRect.x1, dragRect.x2),
            top: contentRect.current.offsetY + Math.min(dragRect.y1, dragRect.y2),
            width: Math.abs(dragRect.x2 - dragRect.x1),
            height: Math.abs(dragRect.y2 - dragRect.y1),
          }}
        />
      )}
    </div>
  );
}
