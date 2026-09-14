import { useEditStore } from "../store/editStore";
import { Slider } from "./Slider";
import type { Edits } from "../types";

type NumericEditKey = {
  [K in keyof Edits]: Edits[K] extends number ? K : never;
}[keyof Edits];

const SLIDER_CONFIG: Array<{ key: NumericEditKey; label: string; min: number; max: number }> = [
  { key: "exposure", label: "Exposure", min: -5, max: 5 },
  { key: "contrast", label: "Contrast", min: -100, max: 100 },
  { key: "highlights", label: "Highlights", min: -100, max: 100 },
  { key: "shadows", label: "Shadows", min: -100, max: 100 },
  { key: "whites", label: "Whites", min: -100, max: 100 },
  { key: "blacks", label: "Blacks", min: -100, max: 100 },
  { key: "temperature", label: "Temperature", min: -100, max: 100 },
  { key: "tint", label: "Tint", min: -100, max: 100 },
  { key: "saturation", label: "Saturation", min: -100, max: 100 },
  { key: "vibrance", label: "Vibrance", min: -100, max: 100 },
  { key: "sharpening", label: "Sharpening", min: 0, max: 150 },
  { key: "softness", label: "Softness", min: 0, max: 100 },
  { key: "vignette", label: "Vignette", min: -100, max: 100 },
  { key: "fade", label: "Fade", min: 0, max: 100 },
  { key: "clarity", label: "Clarity", min: -100, max: 100 },
  { key: "texture", label: "Texture", min: -100, max: 100 },
  { key: "dehaze", label: "Dehaze", min: -100, max: 100 },
  { key: "bloom", label: "Bloom", min: 0, max: 100 },
  { key: "halation", label: "Halation", min: 0, max: 100 },
  { key: "lensDistortion", label: "Lens Distortion", min: -100, max: 100 },
  { key: "chromaticAberration", label: "Chromatic Aberration", min: 0, max: 100 },
  { key: "grain", label: "Grain", min: 0, max: 100 },
  { key: "grainSize", label: "Grain Size", min: 0, max: 100 },
  { key: "grainRoughness", label: "Grain Roughness", min: 0, max: 100 },
  { key: "noise", label: "Noise", min: 0, max: 100 },
];

export function AdjustmentPanel() {
  const edits = useEditStore((s) => s.edits);
  const setEdit = useEditStore((s) => s.setEdit);
  const resetEdits = useEditStore((s) => s.resetEdits);
  const beginAdjustment = useEditStore((s) => s.beginAdjustment);
  const commitAdjustment = useEditStore((s) => s.commitAdjustment);
  const resetSlider = useEditStore((s) => s.resetSlider);

  return (
    <div className="panel">
      <div className="panel__header">
        <h3>Adjustments</h3>
        <button className="link-button" onClick={resetEdits}>
          Reset
        </button>
      </div>
      {SLIDER_CONFIG.map(({ key, label, min, max }) => (
        <Slider
          key={key}
          label={label}
          value={edits[key]}
          min={min}
          max={max}
          step={key === "exposure" ? 0.1 : 1}
          onChange={(value) => setEdit(key, value)}
          onDragStart={beginAdjustment}
          onDragEnd={commitAdjustment}
          onResetDoubleClick={() => resetSlider(key)}
        />
      ))}
    </div>
  );
}
