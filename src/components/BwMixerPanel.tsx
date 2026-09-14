import { useEditStore } from "../store/editStore";
import { Slider } from "./Slider";
import { DEFAULT_BW_MIXER, type BwMixer } from "../types";

type MixerChannel = Exclude<keyof BwMixer, "enabled">;

const CHANNELS: Array<{ key: MixerChannel; label: string; swatch: string }> = [
  { key: "red", label: "Red", swatch: "#c1584a" },
  { key: "orange", label: "Orange", swatch: "#c98a4b" },
  { key: "yellow", label: "Yellow", swatch: "#c4b356" },
  { key: "green", label: "Green", swatch: "#7d9467" },
  { key: "aqua", label: "Aqua", swatch: "#5fa39a" },
  { key: "blue", label: "Blue", swatch: "#6788a8" },
  { key: "purple", label: "Purple", swatch: "#8b729c" },
  { key: "magenta", label: "Magenta", swatch: "#b06a89" },
];

export function BwMixerPanel() {
  const edits = useEditStore((s) => s.edits);
  const setEdit = useEditStore((s) => s.setEdit);
  const beginAdjustment = useEditStore((s) => s.beginAdjustment);
  const commitAdjustment = useEditStore((s) => s.commitAdjustment);
  const commitPartialEdit = useEditStore((s) => s.commitPartialEdit);
  const mixer = edits.bwMixer;

  function updateChannel(key: MixerChannel, value: number) {
    setEdit("bwMixer", { ...mixer, [key]: value });
  }

  function resetChannel(key: MixerChannel) {
    commitPartialEdit({ bwMixer: { ...mixer, [key]: DEFAULT_BW_MIXER[key] } });
  }

  function toggleEnabled() {
    commitPartialEdit({ bwMixer: { ...mixer, enabled: !mixer.enabled } });
  }

  return (
    <div className="panel">
      <div className="panel__header">
        <h3>Black &amp; White</h3>
        <button className={mixer.enabled ? "active" : ""} onClick={toggleEnabled}>
          {mixer.enabled ? "On" : "Off"}
        </button>
      </div>
      {mixer.enabled && (
        <>
          {CHANNELS.map(({ key, label, swatch }) => (
            <Slider
              key={key}
              label={
                <span className="bw-mixer__label">
                  <span className="bw-mixer__dot" style={{ background: swatch }} />
                  {label}
                </span>
              }
              value={mixer[key]}
              min={-100}
              max={100}
              onChange={(v) => updateChannel(key, v)}
              onDragStart={beginAdjustment}
              onDragEnd={commitAdjustment}
              onResetDoubleClick={() => resetChannel(key)}
            />
          ))}
        </>
      )}
    </div>
  );
}
