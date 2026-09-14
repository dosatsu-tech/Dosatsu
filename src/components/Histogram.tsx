import { useEffect, useRef } from "react";
import type { Histogram as HistogramData } from "../types";

interface HistogramProps {
  data: HistogramData | null;
}

const CHANNEL_COLORS: Record<"r" | "g" | "b", string> = {
  r: "rgba(193, 88, 74, 0.65)",
  g: "rgba(125, 148, 103, 0.65)",
  b: "rgba(103, 136, 168, 0.65)",
};

export function Histogram({ data }: HistogramProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#120f0d";
    ctx.fillRect(0, 0, width, height);

    if (!data) return;

    (["r", "g", "b"] as const).forEach((channel) => {
      const values = data[channel];
      const max = Math.max(...values, 1);
      ctx.fillStyle = CHANNEL_COLORS[channel];
      ctx.beginPath();
      ctx.moveTo(0, height);
      values.forEach((v, i) => {
        const x = (i / (values.length - 1)) * width;
        const y = height - (v / max) * height;
        ctx.lineTo(x, y);
      });
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fill();
    });
  }, [data]);

  return (
    <div className="panel histogram-panel">
      <div className="panel__header">
        <h3>Histogram</h3>
      </div>
      <canvas ref={canvasRef} width={280} height={110} className="histogram-canvas" />
    </div>
  );
}
