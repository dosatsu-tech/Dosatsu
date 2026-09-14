import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useEditStore } from "../store/editStore";
import { ImagePlusIcon } from "./icons";
import { Slider } from "./Slider";
import { IMAGE_EXTENSIONS } from "../constants";
import { DEFAULT_EDITS, type Edits, type HslChannel } from "../types";

type Status = "idle" | "matching" | "error";

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function blendChannel(base: HslChannel, target: HslChannel, t: number): HslChannel {
  return {
    hue: lerp(base.hue, target.hue, t),
    saturation: lerp(base.saturation, target.saturation, t),
    luminance: lerp(base.luminance, target.luminance, t),
  };
}

function blendMatchedEdits(matched: Edits, t: number): Partial<Edits> {
  return {
    exposure: lerp(DEFAULT_EDITS.exposure, matched.exposure, t),
    contrast: lerp(DEFAULT_EDITS.contrast, matched.contrast, t),
    temperature: lerp(DEFAULT_EDITS.temperature, matched.temperature, t),
    tint: lerp(DEFAULT_EDITS.tint, matched.tint, t),
    saturation: lerp(DEFAULT_EDITS.saturation, matched.saturation, t),
    grain: lerp(DEFAULT_EDITS.grain, matched.grain, t),
    hsl: {
      red: blendChannel(DEFAULT_EDITS.hsl.red, matched.hsl.red, t),
      orange: blendChannel(DEFAULT_EDITS.hsl.orange, matched.hsl.orange, t),
      yellow: blendChannel(DEFAULT_EDITS.hsl.yellow, matched.hsl.yellow, t),
      green: blendChannel(DEFAULT_EDITS.hsl.green, matched.hsl.green, t),
      aqua: blendChannel(DEFAULT_EDITS.hsl.aqua, matched.hsl.aqua, t),
      blue: blendChannel(DEFAULT_EDITS.hsl.blue, matched.hsl.blue, t),
      purple: blendChannel(DEFAULT_EDITS.hsl.purple, matched.hsl.purple, t),
      magenta: blendChannel(DEFAULT_EDITS.hsl.magenta, matched.hsl.magenta, t),
    },
    colorGrading: {
      shadows: blendChannel(DEFAULT_EDITS.colorGrading.shadows, matched.colorGrading.shadows, t),
      midtones: blendChannel(DEFAULT_EDITS.colorGrading.midtones, matched.colorGrading.midtones, t),
      highlights: blendChannel(DEFAULT_EDITS.colorGrading.highlights, matched.colorGrading.highlights, t),
    },
    bwMixer: {
      ...DEFAULT_EDITS.bwMixer,
      enabled: t > 0 && matched.bwMixer.enabled,
    },
  };
}

interface StyleMatchViewProps {
  previewUrl: string | null;
  currentName: string;
  onApplied: () => void;
}

export function StyleMatchView({ previewUrl, currentName, onApplied }: StyleMatchViewProps) {
  const referenceImage = useEditStore((s) => s.referenceImage);
  const setReferenceImageFromPath = useEditStore((s) => s.setReferenceImageFromPath);
  const clearReferenceImage = useEditStore((s) => s.clearReferenceImage);
  const matchStyleFromReference = useEditStore((s) => s.matchStyleFromReference);
  const applyPreset = useEditStore((s) => s.applyPreset);
  const setEdits = useEditStore((s) => s.setEdits);
  const beginAdjustment = useEditStore((s) => s.beginAdjustment);
  const commitAdjustment = useEditStore((s) => s.commitAdjustment);

  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [matchedEdits, setMatchedEdits] = useState<Edits | null>(null);
  const [intensity, setIntensity] = useState(100);

  async function handleChoose() {
    const file = await open({
      multiple: false,
      filters: [{ name: "Images", extensions: IMAGE_EXTENSIONS }],
    });
    if (typeof file !== "string") return;
    setStatus("idle");
    setErrorMessage("");
    setMatchedEdits(null);
    setIntensity(100);
    await setReferenceImageFromPath(file);
  }

  function handleClearReference() {
    clearReferenceImage();
    setMatchedEdits(null);
    setIntensity(100);
  }

  async function handleMatch() {
    if (!referenceImage) return;
    setStatus("matching");
    setErrorMessage("");
    try {
      const matched = await matchStyleFromReference(referenceImage.path);
      if (!matched) throw new Error("No active photo");
      setMatchedEdits(matched);
      setIntensity(100);
      applyPreset(matched); // full strength, the slider's default is "as is"
      setStatus("idle");
    } catch (err) {
      console.error("Failed to match style", err);
      setErrorMessage("Couldn't match that photo's style.");
      setStatus("error");
    }
  }

  function handleIntensityChange(value: number) {
    setIntensity(value);
    if (matchedEdits) {
      setEdits(blendMatchedEdits(matchedEdits, value / 100));
    }
  }

  function handleIntensityReset() {
    setIntensity(100);
    if (matchedEdits) applyPreset(matchedEdits);
  }

  return (
    <div className="style-match-view">
      <div className="style-match-view__panes">
        <div className="style-match-view__pane">
          <span className="style-match-view__label">Current</span>
          <div className="style-match-view__frame">
            {previewUrl ? (
              <img src={previewUrl} alt={currentName} className="style-match-view__image" />
            ) : (
              <div className="style-match-view__placeholder">Loading…</div>
            )}
          </div>
          <span className="style-match-view__filename" title={currentName}>
            {currentName}
          </span>
        </div>

        <div className="style-match-view__pane">
          <span className="style-match-view__label">Reference</span>
          {referenceImage ? (
            <div className="style-match-view__frame">
              <img src={referenceImage.thumbnail} alt={referenceImage.name} className="style-match-view__image" />
              <button
                className="style-match-view__clear"
                onClick={handleClearReference}
                title="Remove reference photo"
              >
                ×
              </button>
            </div>
          ) : (
            <button className="style-match-view__dropzone" onClick={handleChoose}>
              <ImagePlusIcon />
              <span>Drag a photo here, or click to choose one</span>
            </button>
          )}
          <span className="style-match-view__filename" title={referenceImage?.name}>
            {referenceImage?.name ?? ""}
          </span>
        </div>
      </div>

      {referenceImage && (
        <div className="style-match-view__actions">
          <button className="link-button" onClick={handleChoose}>
            Change reference photo
          </button>
          <button className="primary" onClick={handleMatch} disabled={status === "matching"}>
            {status === "matching" ? "Matching…" : matchedEdits ? "Re-match" : "Match style"}
          </button>
          {matchedEdits && <button onClick={onApplied}>Done</button>}
        </div>
      )}

      {matchedEdits && (
        <div className="style-match-view__intensity">
          <Slider
            label="Intensity"
            value={intensity}
            min={0}
            max={100}
            onChange={handleIntensityChange}
            onDragStart={beginAdjustment}
            onDragEnd={commitAdjustment}
            onResetDoubleClick={handleIntensityReset}
          />
        </div>
      )}

      {status === "error" && <p className="modal-status modal-status--error">{errorMessage}</p>}
      {matchedEdits && status !== "error" && (
        <p className="modal-status modal-status--ok">
          Applied at {intensity}%
        </p>
      )}
    </div>
  );
}
