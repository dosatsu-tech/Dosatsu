import { useEffect, useMemo, useRef, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useEditStore } from "../store/editStore";
import { StarIcon, ChevronDownIcon, DownloadIcon } from "./icons";
import type { Preset } from "../types";

function PresetRow({
  preset,
  isActive,
  isTagsOpen,
  isAddingTag,
  tagDraft,
  onApply,
  onToggleFavorite,
  onDelete,
  onExport,
  onToggleTagsOpen,
  onStartAddTag,
  onTagDraftChange,
  onConfirmAddTag,
  onCancelAddTag,
  onRemoveTag,
}: {
  preset: Preset;
  isActive: boolean;
  isTagsOpen: boolean;
  isAddingTag: boolean;
  tagDraft: string;
  onApply: (preset: Preset) => void;
  onToggleFavorite: (preset: Preset) => void;
  onDelete: (preset: Preset) => void;
  onExport: (preset: Preset) => void;
  onToggleTagsOpen: (id: string) => void;
  onStartAddTag: (id: string) => void;
  onTagDraftChange: (value: string) => void;
  onConfirmAddTag: (preset: Preset) => void;
  onCancelAddTag: () => void;
  onRemoveTag: (preset: Preset, tag: string) => void;
}) {
  const showPanel = isTagsOpen || isAddingTag;

  return (
    <div className={`preset-item${isActive ? " preset-item--active" : ""}`}>
      <div className="preset-item__row">
        <button
          className="preset-item__favorite"
          onClick={() => onToggleFavorite(preset)}
          title={preset.favorite ? "Remove from favorites" : "Add to favorites"}
        >
          <StarIcon filled={preset.favorite} />
        </button>
        <button className="preset-item__name" onClick={() => onApply(preset)} title={`Apply ${preset.name}`}>
          {preset.name}
        </button>
        {preset.source === "user" && (
          <>
            <button className="preset-item__export" onClick={() => onExport(preset)} title="Export preset to file">
              <DownloadIcon />
            </button>
            <button className="preset-item__delete" onClick={() => onDelete(preset)} title="Delete preset">
              ×
            </button>
          </>
        )}
      </div>
      <div className="preset-item__tag-controls">
        <button className="tag-toggle" onClick={() => onToggleTagsOpen(preset.id)}>
          {preset.tags.length > 0 ? `View tags (${preset.tags.length})` : "View tags"}
          <ChevronDownIcon className={`chevron${isTagsOpen ? " chevron--open" : ""}`} />
        </button>
        <button className="tag-add" onClick={() => onStartAddTag(preset.id)} title="Add tag">
          + tag
        </button>
      </div>
      {showPanel && (
        <div className="tag-dropdown">
          {preset.tags.length === 0 && !isAddingTag && <p className="tag-dropdown__empty">No tags yet.</p>}
          {preset.tags.map((tag) => (
            <span key={tag} className="tag-chip">
              {tag}
              <button className="tag-chip__remove" onClick={() => onRemoveTag(preset, tag)} title="Remove tag">
                ×
              </button>
            </span>
          ))}
          {isAddingTag && (
            <input
              autoFocus
              className="tag-input"
              value={tagDraft}
              placeholder="tag name"
              onChange={(e) => onTagDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onConfirmAddTag(preset);
                if (e.key === "Escape") onCancelAddTag();
              }}
              onBlur={() => onConfirmAddTag(preset)}
            />
          )}
        </div>
      )}
    </div>
  );
}

export function PresetsPanel({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const presets = useEditStore((s) => s.presets);
  const loadPresets = useEditStore((s) => s.loadPresets);
  const removePreset = useEditStore((s) => s.removePreset);
  const applyPreset = useEditStore((s) => s.applyPreset);
  const importPresetsFromFile = useEditStore((s) => s.importPresetsFromFile);
  const openPresetsFolder = useEditStore((s) => s.openPresetsFolder);
  const setPresetFavorite = useEditStore((s) => s.setPresetFavorite);
  const addPresetTag = useEditStore((s) => s.addPresetTag);
  const removePresetTag = useEditStore((s) => s.removePresetTag);
  const exportPreset = useEditStore((s) => s.exportPreset);

  const [importStatus, setImportStatus] = useState<"idle" | "importing" | "error">("idle");
  const [search, setSearch] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const [openTagsFor, setOpenTagsFor] = useState<string | null>(null);
  const [addingTagFor, setAddingTagFor] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  // Guards against the input's onBlur (fired when it unmounts after Enter/Escape)
  // re-running with a stale closure over the pre-keypress draft text.
  const tagInputHandledRef = useRef(false);
  const tagMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadPresets();
  }, [loadPresets]);

  // Close the "all tags" filter dropdown on an outside click.
  useEffect(() => {
    if (!tagMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (tagMenuRef.current && !tagMenuRef.current.contains(e.target as Node)) {
        setTagMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [tagMenuOpen]);

  const allTags = useMemo(
    () => Array.from(new Set(presets.flatMap((p) => p.tags))).sort(),
    [presets],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return presets.filter((p) => {
      if (favoritesOnly && !p.favorite) return false;
      if (tagFilter.length > 0 && !tagFilter.some((t) => p.tags.includes(t))) return false;
      if (q) {
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesTag = p.tags.some((t) => t.includes(q));
        if (!matchesName && !matchesTag) return false;
      }
      return true;
    });
  }, [presets, search, favoritesOnly, tagFilter]);

  const defaultPresets = filtered.filter((p) => p.source === "default");
  const userPresets = filtered.filter((p) => p.source === "user");

  function toggleTagFilter(tag: string) {
    setTagFilter((current) =>
      current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag],
    );
  }

  function toggleTagsOpen(id: string) {
    setOpenTagsFor((current) => (current === id ? null : id));
  }

  function startAddTag(id: string) {
    tagInputHandledRef.current = false;
    setAddingTagFor(id);
    setTagDraft("");
  }

  function cancelAddTag() {
    tagInputHandledRef.current = true;
    setAddingTagFor(null);
    setTagDraft("");
  }

  async function confirmAddTag(preset: Preset) {
    if (tagInputHandledRef.current) return;
    tagInputHandledRef.current = true;
    const value = tagDraft;
    setAddingTagFor(null);
    setTagDraft("");
    if (value.trim()) await addPresetTag(preset.id, value);
  }

  async function handleImport() {
    const file = await open({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] });
    if (typeof file !== "string") return;
    setImportStatus("importing");
    try {
      await importPresetsFromFile(file);
      setImportStatus("idle");
    } catch (err) {
      console.error("Failed to import presets", err);
      setImportStatus("error");
    }
  }

  function handleApply(preset: Preset) {
    onSelect(preset.id);
    applyPreset(preset.edits);
  }

  async function handleDelete(preset: Preset) {
    await removePreset(preset.id);
    if (selectedId === preset.id) onSelect("");
  }

  async function handleExport(preset: Preset) {
    const outPath = await save({
      defaultPath: `${preset.name}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!outPath) return;
    try {
      await exportPreset(preset.id, outPath);
    } catch (err) {
      console.error("Failed to export preset", err);
    }
  }

  async function handleOpenFolder() {
    try {
      await openPresetsFolder();
    } catch (err) {
      console.error("Failed to open presets folder", err);
    }
  }

  return (
    <div className="panel">
      <div className="panel__header">
        <h3>Presets</h3>
      </div>

      <div className="preset-actions-row">
        <button className="link-button" onClick={handleImport} disabled={importStatus === "importing"}>
          {importStatus === "importing" ? "Importing…" : "Import from file"}
        </button>
        <button className="link-button" onClick={handleOpenFolder} title="Open presets folder in Finder">
          Open folder
        </button>
      </div>

      {importStatus === "error" && (
        <p className="modal-status modal-status--error">Failed to import presets from that file.</p>
      )}

      <div className="preset-search-row">
        <input
          type="text"
          placeholder="Search by name or tag…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className={`icon-button${favoritesOnly ? " active" : ""}`}
          onClick={() => setFavoritesOnly((v) => !v)}
          title="Show favorites only"
        >
          <StarIcon filled={favoritesOnly} />
        </button>
      </div>

      {allTags.length > 0 && (
        <div className="tag-menu" ref={tagMenuRef}>
          <button className="tag-menu__trigger" onClick={() => setTagMenuOpen((v) => !v)}>
            Tags{tagFilter.length > 0 ? ` (${tagFilter.length})` : ""}
            <ChevronDownIcon className={`chevron${tagMenuOpen ? " chevron--open" : ""}`} />
          </button>
          {tagMenuOpen && (
            <div className="tag-menu__panel">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  className={`tag-filter-chip${tagFilter.includes(tag) ? " tag-filter-chip--active" : ""}`}
                  onClick={() => toggleTagFilter(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="preset-list">
        {defaultPresets.length === 0 && userPresets.length === 0 && (
          <p className="preset-empty">No presets match.</p>
        )}

        {defaultPresets.length > 0 && (
          <>
            <div className="preset-group-label">Default presets</div>
            {defaultPresets.map((preset) => (
              <PresetRow
                key={preset.id}
                preset={preset}
                isActive={selectedId === preset.id}
                isTagsOpen={openTagsFor === preset.id}
                isAddingTag={addingTagFor === preset.id}
                tagDraft={tagDraft}
                onApply={handleApply}
                onToggleFavorite={(p) => setPresetFavorite(p.id, !p.favorite)}
                onDelete={handleDelete}
                onExport={handleExport}
                onToggleTagsOpen={toggleTagsOpen}
                onStartAddTag={startAddTag}
                onTagDraftChange={setTagDraft}
                onConfirmAddTag={confirmAddTag}
                onCancelAddTag={cancelAddTag}
                onRemoveTag={(p, tag) => removePresetTag(p.id, tag)}
              />
            ))}
          </>
        )}

        {userPresets.length > 0 && (
          <>
            <div className="preset-group-label">My presets</div>
            {userPresets.map((preset) => (
              <PresetRow
                key={preset.id}
                preset={preset}
                isActive={selectedId === preset.id}
                isTagsOpen={openTagsFor === preset.id}
                isAddingTag={addingTagFor === preset.id}
                tagDraft={tagDraft}
                onApply={handleApply}
                onToggleFavorite={(p) => setPresetFavorite(p.id, !p.favorite)}
                onDelete={handleDelete}
                onExport={handleExport}
                onToggleTagsOpen={toggleTagsOpen}
                onStartAddTag={startAddTag}
                onTagDraftChange={setTagDraft}
                onConfirmAddTag={confirmAddTag}
                onCancelAddTag={cancelAddTag}
                onRemoveTag={(p, tag) => removePresetTag(p.id, tag)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
