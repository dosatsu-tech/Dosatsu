import { useState } from "react";
import { useEditStore } from "../store/editStore";
import { Slider } from "./Slider";
import { DEFAULT_HSL_CHANNEL, type ColorGrading } from "../types";

const RANGES: Array<{ key: keyof ColorGrading; label: string }> = [
  { key: "shadows", label: "Shadows" },
  { key: "midtones", label: "Midtones" },
  { key: "highlights", label: "Highlights" },
];

export function ColorGradingPanel() {
  const edits = useEditStore((s) => s.edits);
  const setEdit = useEditStore((s) => s.setEdit);
  const beginAdjustment = useEditStore((s) => s.beginAdjustment);
  const commitAdjustment = useEditStore((s) => s.commitAdjustment);
  const commitPartialEdit = useEditStore((s) => s.commitPartialEdit);
  const [active, setActive] = useState<keyof ColorGrading>("shadows");

  const range = edits.colorGrading[active];

  const updateRange = (field: keyof typeof range, value: number) => {
    setEdit("colorGrading", { ...edits.colorGrading, [active]: { ...range, [field]: value } });
  };

  const resetRange = (field: keyof typeof range) => {
    commitPartialEdit({
      colorGrading: { ...edits.colorGrading, [active]: { ...range, [field]: DEFAULT_HSL_CHANNEL[field] } },
    });
  };

  return (
    <div className="panel">
      <div className="panel__header">
        <h3>Color Grading</h3>
      </div>
      <div className="color-grading-tabs">
        {RANGES.map(({ key, label }) => (
          <button
            key={key}
            className={`color-grading-tab${active === key ? " color-grading-tab--active" : ""}`}
            onClick={() => setActive(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <Slider
        label="Hue"
        value={range.hue}
        min={0}
        max={360}
        onChange={(v) => updateRange("hue", v)}
        onDragStart={beginAdjustment}
        onDragEnd={commitAdjustment}
        onResetDoubleClick={() => resetRange("hue")}
      />
      <Slider
        label="Saturation"
        value={range.saturation}
        min={0}
        max={100}
        onChange={(v) => updateRange("saturation", v)}
        onDragStart={beginAdjustment}
        onDragEnd={commitAdjustment}
        onResetDoubleClick={() => resetRange("saturation")}
      />
      <Slider
        label="Luminance"
        value={range.luminance}
        min={-100}
        max={100}
        onChange={(v) => updateRange("luminance", v)}
        onDragStart={beginAdjustment}
        onDragEnd={commitAdjustment}
        onResetDoubleClick={() => resetRange("luminance")}
      />
    </div>
  );
}
