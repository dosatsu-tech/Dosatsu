import { useState } from "react";
import { useEditStore } from "../store/editStore";
import { Slider } from "./Slider";
import { DEFAULT_HSL_CHANNEL, type HslAdjustments } from "../types";

const COLORS: Array<{ key: keyof HslAdjustments; label: string; swatch: string }> = [
  { key: "red", label: "Red", swatch: "#c1584a" },
  { key: "orange", label: "Orange", swatch: "#c98a4b" },
  { key: "yellow", label: "Yellow", swatch: "#c4b356" },
  { key: "green", label: "Green", swatch: "#7d9467" },
  { key: "aqua", label: "Aqua", swatch: "#5fa39a" },
  { key: "blue", label: "Blue", swatch: "#6788a8" },
  { key: "purple", label: "Purple", swatch: "#8b729c" },
  { key: "magenta", label: "Magenta", swatch: "#b06a89" },
];

export function HslPanel() {
  const edits = useEditStore((s) => s.edits);
  const setEdit = useEditStore((s) => s.setEdit);
  const beginAdjustment = useEditStore((s) => s.beginAdjustment);
  const commitAdjustment = useEditStore((s) => s.commitAdjustment);
  const commitPartialEdit = useEditStore((s) => s.commitPartialEdit);
  const [active, setActive] = useState<keyof HslAdjustments>("red");

  const channel = edits.hsl[active];

  const updateChannel = (field: keyof typeof channel, value: number) => {
    setEdit("hsl", { ...edits.hsl, [active]: { ...channel, [field]: value } });
  };

  const resetChannel = (field: keyof typeof channel) => {
    commitPartialEdit({ hsl: { ...edits.hsl, [active]: { ...channel, [field]: DEFAULT_HSL_CHANNEL[field] } } });
  };

  return (
    <div className="panel">
      <div className="panel__header">
        <h3>HSL</h3>
      </div>
      <div className="hsl-swatches">
        {COLORS.map(({ key, label, swatch }) => (
          <button
            key={key}
            className={`hsl-swatch${active === key ? " hsl-swatch--active" : ""}`}
            style={{ background: swatch }}
            title={label}
            onClick={() => setActive(key)}
          />
        ))}
      </div>
      <Slider
        label="Hue"
        value={channel.hue}
        min={-100}
        max={100}
        onChange={(v) => updateChannel("hue", v)}
        onDragStart={beginAdjustment}
        onDragEnd={commitAdjustment}
        onResetDoubleClick={() => resetChannel("hue")}
      />
      <Slider
        label="Saturation"
        value={channel.saturation}
        min={-100}
        max={100}
        onChange={(v) => updateChannel("saturation", v)}
        onDragStart={beginAdjustment}
        onDragEnd={commitAdjustment}
        onResetDoubleClick={() => resetChannel("saturation")}
      />
      <Slider
        label="Luminance"
        value={channel.luminance}
        min={-100}
        max={100}
        onChange={(v) => updateChannel("luminance", v)}
        onDragStart={beginAdjustment}
        onDragEnd={commitAdjustment}
        onResetDoubleClick={() => resetChannel("luminance")}
      />
    </div>
  );
}
