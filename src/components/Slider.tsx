import { useRef, useState } from "react";

interface SliderProps {
  label: React.ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onResetDoubleClick?: () => void;
}

const DOUBLE_TAP_MS = 400;
const DOUBLE_TAP_DISTANCE = 30;
const TAP_MOVE_TOLERANCE = 10;
const GRAB_RADIUS = 24;
const THUMB_VISUAL_RADIUS = 10;

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  onDragStart,
  onDragEnd,
  onResetDoubleClick,
}: SliderProps) {
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const tapStart = useRef<{ x: number; y: number } | null>(null);
  const lastTap = useRef<{ time: number; x: number; y: number } | null>(null);

  function thumbCenterX(trackWidth: number) {
    const fraction = (value - min) / (max - min);
    const usable = trackWidth - THUMB_VISUAL_RADIUS * 2;
    return THUMB_VISUAL_RADIUS + fraction * usable;
  }

  function valueFromX(x: number, trackWidth: number) {
    const usable = trackWidth - THUMB_VISUAL_RADIUS * 2;
    const fraction = usable > 0 ? (x - THUMB_VISUAL_RADIUS) / usable : 0;
    const clamped = Math.min(1, Math.max(0, fraction));
    const raw = min + clamped * (max - min);
    const stepped = Math.round(raw / step) * step;
    return Math.min(max, Math.max(min, stepped));
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const x = e.clientX - rect.left;
    tapStart.current = { x: e.clientX, y: e.clientY };

    if (Math.abs(x - thumbCenterX(rect.width)) <= GRAB_RADIUS) {
      e.currentTarget.setPointerCapture(e.pointerId);
      e.currentTarget.style.touchAction = "none";
      setDragging(true);
      onDragStart?.();
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    onChange(valueFromX(e.clientX - rect.left, rect.width));
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (dragging) {
      e.currentTarget.releasePointerCapture(e.pointerId);
      e.currentTarget.style.touchAction = "pan-y";
      setDragging(false);
      onDragEnd?.();
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const wasDragging = dragging;
    endDrag(e);

    const start = tapStart.current;
    tapStart.current = null;
    if (wasDragging || !start) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_MOVE_TOLERANCE) {
      lastTap.current = null;
      return;
    }
    const now = Date.now();
    const prev = lastTap.current;
    if (prev && now - prev.time < DOUBLE_TAP_MS && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < DOUBLE_TAP_DISTANCE) {
      lastTap.current = null;
      onResetDoubleClick?.();
    } else {
      lastTap.current = { time: now, x: e.clientX, y: e.clientY };
    }
  }

  function handlePointerCancel(e: React.PointerEvent<HTMLDivElement>) {
    endDrag(e);
    tapStart.current = null;
    lastTap.current = null;
  }

  return (
    <div className="slider-row">
      <div className="slider-row__header">
        <span>{label}</span>
        <span className="slider-row__value">{value}</span>
      </div>
      <div className="slider-row__track" ref={trackRef}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          onPointerDown={onDragStart}
          onPointerUp={onDragEnd}
          onDoubleClick={onResetDoubleClick}
          title="Double-click to reset"
        />
        <div
          className="slider-row__touch-lock"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        />
      </div>
    </div>
  );
}
