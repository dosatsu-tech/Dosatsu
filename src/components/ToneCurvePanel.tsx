import { useRef, useState } from "react";
import { useEditStore } from "../store/editStore";
import { identityCurve, type CurvePoint, type ToneCurve } from "../types";

const SIZE = 240;
const POINT_RADIUS = 5;
const MIN_POINT_GAP = 0.015;
const ADD_POINT_MIN_DISTANCE = 0.02;

type CurveChannel = keyof ToneCurve;

const CHANNELS: Array<{ key: CurveChannel; label: string; stroke: string }> = [
  { key: "rgb", label: "RGB", stroke: "#ece5d8" },
  { key: "red", label: "Red", stroke: "#c1584a" },
  { key: "green", label: "Green", stroke: "#7d9467" },
  { key: "blue", label: "Blue", stroke: "#6788a8" },
];

function sortPoints(points: CurvePoint[]): CurvePoint[] {
  return [...points].sort((a, b) => a.x - b.x);
}

/** Same Fritsch-Carlson monotonic cubic Hermite spline as the Rust engine
 * (engine/adjustments.rs, build_curve_lut), used here only to preview the curve shape. */
function evaluateCurve(sorted: CurvePoint[], x: number): number {
  const n = sorted.length;
  if (x <= sorted[0].x) return sorted[0].y;
  if (x >= sorted[n - 1].x) return sorted[n - 1].y;

  const secants: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = sorted[i + 1].x - sorted[i].x;
    secants.push(dx < 1e-6 ? 0 : (sorted[i + 1].y - sorted[i].y) / dx);
  }
  const tangents: number[] = new Array(n).fill(0);
  tangents[0] = secants[0];
  tangents[n - 1] = secants[n - 2];
  for (let i = 1; i < n - 1; i++) {
    tangents[i] = secants[i - 1] * secants[i] <= 0 ? 0 : (secants[i - 1] + secants[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (secants[i] === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const a = tangents[i] / secants[i];
    const b = tangents[i + 1] / secants[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      tangents[i] = t * a * secants[i];
      tangents[i + 1] = t * b * secants[i];
    }
  }

  let seg = 0;
  while (seg < n - 2 && x > sorted[seg + 1].x) seg++;
  const { x: x0, y: y0 } = sorted[seg];
  const { x: x1, y: y1 } = sorted[seg + 1];
  const h = x1 - x0;
  const t = (x - x0) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * y0 + h10 * h * tangents[seg] + h01 * y1 + h11 * h * tangents[seg + 1];
}

function buildCurvePath(points: CurvePoint[], samples = 48): string {
  const sorted = sortPoints(points);
  if (sorted.length < 2) return "";
  let d = "";
  for (let i = 0; i <= samples; i++) {
    const x = i / samples;
    const y = evaluateCurve(sorted, x);
    const sx = x * SIZE;
    const sy = SIZE - y * SIZE;
    d += `${i === 0 ? "M" : "L"}${sx.toFixed(2)},${sy.toFixed(2)} `;
  }
  return d.trim();
}

export function ToneCurvePanel() {
  const edits = useEditStore((s) => s.edits);
  const setEdit = useEditStore((s) => s.setEdit);
  const beginAdjustment = useEditStore((s) => s.beginAdjustment);
  const commitAdjustment = useEditStore((s) => s.commitAdjustment);
  const commitPartialEdit = useEditStore((s) => s.commitPartialEdit);
  const [active, setActive] = useState<CurveChannel>("rgb");
  // Mobile-only (see the max-width media query in App.css): the curve needs more
  // room than the sidebar can spare next to every other adjustment panel, and its
  // own `touch-action: none`, required so dragging a point doesn't also scroll the
  // page, meant a touch starting anywhere on it blocked scrolling past it entirely.
  // Opening it as its own bottom sheet sidesteps both: full height to work with, and
  // nothing else to need to scroll past while it's open.
  const [overlayOpen, setOverlayOpen] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragIndex = useRef<number | null>(null);

  const points = sortPoints(edits.toneCurve[active]);
  const path = buildCurvePath(points);
  const activeChannel = CHANNELS.find((c) => c.key === active)!;

  function updatePoints(next: CurvePoint[]) {
    setEdit("toneCurve", { ...edits.toneCurve, [active]: next });
  }

  function commitPoints(next: CurvePoint[]) {
    commitPartialEdit({ toneCurve: { ...edits.toneCurve, [active]: next } });
  }

  function toNormalized(e: { clientX: number; clientY: number }): CurvePoint {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = 1 - (e.clientY - rect.top) / rect.height;
    return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
  }

  function handlePointDown(index: number, e: React.PointerEvent) {
    e.stopPropagation();
    dragIndex.current = index;
    beginAdjustment();
  }

  function handlePointerMove(e: React.PointerEvent) {
    const index = dragIndex.current;
    if (index === null) return;
    const raw = toNormalized(e);
    const isEndpoint = index === 0 || index === points.length - 1;
    const prevX = points[index - 1]?.x ?? 0;
    const nextX = points[index + 1]?.x ?? 1;
    const x = isEndpoint
      ? points[index].x
      : Math.min(nextX - MIN_POINT_GAP, Math.max(prevX + MIN_POINT_GAP, raw.x));
    const next = [...points];
    next[index] = { x, y: raw.y };
    updatePoints(next);
  }

  function handlePointerUp() {
    if (dragIndex.current === null) return;
    dragIndex.current = null;
    commitAdjustment();
  }

  function handleAddPoint(e: React.MouseEvent) {
    if (dragIndex.current !== null) return;
    const point = toNormalized(e);
    if (points.some((p) => Math.abs(p.x - point.x) < ADD_POINT_MIN_DISTANCE)) return;
    commitPoints(sortPoints([...points, point]));
  }

  function handleRemovePoint(index: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (index === 0 || index === points.length - 1) return;
    commitPoints(points.filter((_, i) => i !== index));
  }

  function handleReset() {
    commitPartialEdit({ toneCurve: { ...edits.toneCurve, [active]: identityCurve() } });
  }

  return (
    <div className="panel">
      <div className="panel__header">
        <h3>Tone Curve</h3>
        <button className="link-button" onClick={handleReset}>
          Reset
        </button>
      </div>

      {/* Mobile-only entry point (see .tone-curve-trigger in App.css). Desktop never
          shows this; the editor below renders inline there instead. */}
      <button className="tone-curve-trigger" onClick={() => setOverlayOpen(true)}>
        Edit tone curve
      </button>

      {overlayOpen && <div className="tone-curve-sheet-backdrop" onClick={() => setOverlayOpen(false)} />}

      <div className={`tone-curve-body${overlayOpen ? " tone-curve-body--open" : ""}`}>
        <div className="tone-curve-sheet-header">
          <span className="tone-curve-sheet-handle" />
          <button className="link-button" onClick={() => setOverlayOpen(false)}>
            Done
          </button>
        </div>
        <div className="color-grading-tabs">
          {CHANNELS.map(({ key, label }) => (
            <button
              key={key}
              className={`color-grading-tab${active === key ? " color-grading-tab--active" : ""}`}
              onClick={() => setActive(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <svg
          ref={svgRef}
          className="tone-curve"
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          <rect
            className="tone-curve__backdrop"
            x={0}
            y={0}
            width={SIZE}
            height={SIZE}
            onClick={handleAddPoint}
          />
          {[1, 2, 3].map((i) => (
            <line
              key={`v${i}`}
              className="tone-curve__grid"
              x1={(SIZE / 4) * i}
              y1={0}
              x2={(SIZE / 4) * i}
              y2={SIZE}
            />
          ))}
          {[1, 2, 3].map((i) => (
            <line
              key={`h${i}`}
              className="tone-curve__grid"
              x1={0}
              y1={(SIZE / 4) * i}
              x2={SIZE}
              y2={(SIZE / 4) * i}
            />
          ))}
          <line className="tone-curve__diagonal" x1={0} y1={SIZE} x2={SIZE} y2={0} />
          <path className="tone-curve__path" d={path} stroke={activeChannel.stroke} fill="none" />
          {points.map((p, i) => (
            <circle
              key={i}
              className="tone-curve__point"
              cx={p.x * SIZE}
              cy={SIZE - p.y * SIZE}
              r={POINT_RADIUS}
              stroke={activeChannel.stroke}
              onPointerDown={(e) => handlePointDown(i, e)}
              onDoubleClick={(e) => handleRemovePoint(i, e)}
            />
          ))}
        </svg>
        <p className="tone-curve__hint">Click to add a point, double-click a point to remove it.</p>
      </div>
    </div>
  );
}
