import { useState } from "react";
import { useEditStore } from "../store/editStore";
import { DEFAULT_EDITS } from "../types";

export function SavePresetButton({
  selectedId,
  onSaved,
}: {
  selectedId: string;
  onSaved: (id: string) => void;
}) {
  const presets = useEditStore((s) => s.presets);
  const edits = useEditStore((s) => s.edits);
  const saveCurrentAsPreset = useEditStore((s) => s.saveCurrentAsPreset);

  const [promptOpen, setPromptOpen] = useState(false);
  const [promptName, setPromptName] = useState("");

  const selectedPreset = presets.find((p) => p.id === selectedId) ?? null;
  const editBaseline = selectedPreset ? selectedPreset.edits : DEFAULT_EDITS;
  const hasUnsavedChanges = JSON.stringify(edits) !== JSON.stringify(editBaseline);

  if (!hasUnsavedChanges) return null;

  function openPrompt() {
    setPromptName("");
    setPromptOpen(true);
  }

  async function handleSave() {
    const trimmed = promptName.trim();
    if (!trimmed) return;
    const preset = await saveCurrentAsPreset(trimmed);
    onSaved(preset.id);
    setPromptOpen(false);
    setPromptName("");
  }

  return (
    <>
      <button className="save-pulse" onClick={openPrompt} title="Save the current edits as a preset">
        Save Preset
      </button>

      {promptOpen && (
        <div className="modal-overlay" onClick={() => setPromptOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Save Preset</h3>
            <label className="modal-field">
              Name
              <input
                autoFocus
                placeholder="Preset name"
                value={promptName}
                onChange={(e) => setPromptName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
              />
            </label>
            <div className="modal-actions">
              <button onClick={() => setPromptOpen(false)}>Cancel</button>
              <button className="primary" onClick={handleSave} disabled={!promptName.trim()}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
