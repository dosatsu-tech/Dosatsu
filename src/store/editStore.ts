import { create } from "zustand";
import {
  DEFAULT_EDITS,
  type Edits,
  type GalleryViewMode,
  type ImageEntry,
  type Preset,
} from "../types";
import { api } from "../api/tauri";

type View = "gallery" | "editor";

const VIEW_MODE_KEY = "dosatsu.galleryViewMode";
const TILE_SIZE_KEY = "dosatsu.gallerySize";

function readStoredViewMode(): GalleryViewMode {
  return localStorage.getItem(VIEW_MODE_KEY) === "full" ? "full" : "square";
}

function readStoredTileSize(): number {
  const stored = Number(localStorage.getItem(TILE_SIZE_KEY));
  return Number.isFinite(stored) && stored >= 100 && stored <= 400 ? stored : 160;
}

interface EditStore {
  view: View;
  images: ImageEntry[];
  galleryViewMode: GalleryViewMode;
  gallerySize: number;
  activeImage: ImageEntry | null;
  edits: Edits;
  past: Edits[];
  future: Edits[];
  dragSnapshot: Edits | null;
  presets: Preset[];
  refreshToken: number;
  referenceImage: ImageEntry | null;
  acceptingReferenceDrop: boolean;

  loadRecents: () => Promise<void>;
  clearRecents: () => Promise<void>;
  removeRecent: (path: string) => Promise<void>;
  saveImageEdits: (path: string, edits: Edits) => Promise<void>;
  flushActiveImageEdits: () => Promise<void>;
  refreshActiveRecent: (path: string) => Promise<void>;
  setGalleryViewMode: (mode: GalleryViewMode) => void;
  setGallerySize: (size: number) => void;
  setActiveImage: (image: ImageEntry) => Promise<void>;
  openImage: (image: ImageEntry) => Promise<void>;
  openDroppedImages: (paths: string[]) => Promise<void>;
  closeEditor: () => void;
  nextImage: () => void;
  prevImage: () => void;
  bumpRefreshToken: () => void;

  setEdit: <K extends keyof Edits>(key: K, value: Edits[K]) => void;
  setEdits: (partial: Partial<Edits>) => void;
  beginAdjustment: () => void;
  commitAdjustment: () => void;
  resetSlider: <K extends keyof Edits>(key: K) => void;
  commitPartialEdit: (partial: Partial<Edits>) => void;
  resetEdits: () => void;
  applyEdits: (edits: Edits) => void;
  applyPreset: (preset: Edits) => void;
  matchStyleFromReference: (referencePath: string) => Promise<Edits | null>;
  setReferenceImageFromPath: (path: string) => Promise<void>;
  clearReferenceImage: () => void;
  setAcceptingReferenceDrop: (accepting: boolean) => void;
  undo: () => void;
  redo: () => void;

  loadPresets: () => Promise<void>;
  saveCurrentAsPreset: (name: string) => Promise<Preset>;
  removePreset: (id: string) => Promise<void>;
  importPresetsFromFile: (filePath: string) => Promise<void>;
  openPresetsFolder: () => Promise<void>;
  setPresetFavorite: (id: string, favorite: boolean) => Promise<void>;
  addPresetTag: (id: string, tag: string) => Promise<void>;
  removePresetTag: (id: string, tag: string) => Promise<void>;
  exportPreset: (id: string, outPath: string) => Promise<void>;
}

export const useEditStore = create<EditStore>((set, get) => ({
  view: "gallery",
  images: [],
  galleryViewMode: readStoredViewMode(),
  gallerySize: readStoredTileSize(),
  activeImage: null,
  edits: { ...DEFAULT_EDITS },
  past: [],
  future: [],
  dragSnapshot: null,
  presets: [],
  refreshToken: 0,
  referenceImage: null,
  acceptingReferenceDrop: false,

  loadRecents: async () => {
    try {
      const images = await api.listRecents();
      set({ images });
    } catch (err) {
      console.error("Failed to load recents", err);
    }
  },

  clearRecents: async () => {
    await api.clearRecents();
    set({ images: [] });
  },

  removeRecent: async (path) => {
    const images = await api.removeRecent(path);
    set({ images });
  },

  refreshActiveRecent: async (path) => {
    try {
      const updated = await api.regenerateThumbnail(path);
      const images = await api.recordRecent(updated);
      set((state) => ({
        images,
        activeImage: state.activeImage?.path === path ? updated : state.activeImage,
      }));
    } catch (err) {
      console.error("Failed to refresh recent thumbnail", err);
    }
  },

  setGalleryViewMode: (mode) => {
    localStorage.setItem(VIEW_MODE_KEY, mode);
    set({ galleryViewMode: mode });
  },

  setGallerySize: (size) => {
    localStorage.setItem(TILE_SIZE_KEY, String(size));
    set({ gallerySize: size });
  },

  bumpRefreshToken: () => set((state) => ({ refreshToken: state.refreshToken + 1 })),

  saveImageEdits: async (path, edits) => {
    try {
      const images = await api.saveImageEdits(path, edits);
      // Deliberately doesn't touch `activeImage` even if it's this same photo — that
      // would hand usePreview() a new object reference and trigger a redundant
      // re-fetch of a preview that hasn't actually changed. The gallery re-reads
      // `images` next time it's shown, which is the only place this needs to land.
      set({ images });
    } catch (err) {
      console.error("Failed to save image edits", err);
    }
  },

  flushActiveImageEdits: async () => {
    const { activeImage, edits } = get();
    if (!activeImage) return;
    const savedEdits = activeImage.edits ?? DEFAULT_EDITS;
    if (JSON.stringify(edits) !== JSON.stringify(savedEdits)) {
      await get().saveImageEdits(activeImage.path, edits);
    }
  },

  setActiveImage: async (image) => {
    await get().flushActiveImageEdits();
    set({
      activeImage: image,
      edits: image.edits ? { ...image.edits } : { ...DEFAULT_EDITS },
      past: [],
      future: [],
      dragSnapshot: null,
      view: "editor",
    });
  },

  openImage: async (image) => {
    await get().setActiveImage(image);
    try {
      const images = await api.recordRecent(image);
      set({ images });
    } catch (err) {
      console.error("Failed to record recent image", err);
    }
  },

  openDroppedImages: async (paths) => {
    if (paths.length === 0) return;
    // Re-dragging a photo already in recents should restore its saved edits, not
    // silently discard them the way a fresh regenerateThumbnail() (which never
    // carries `edits`) would.
    const known = get().images;
    let entries: ImageEntry[];
    try {
      entries = await Promise.all(
        paths.map((p) => known.find((img) => img.path === p) ?? api.regenerateThumbnail(p)),
      );
    } catch (err) {
      console.error("Failed to decode dropped image(s)", err);
      return;
    }
    if (entries.length === 0) return;

    await get().setActiveImage(entries[0]);

    try {
      for (const entry of entries.slice(1)) {
        await api.recordRecent(entry);
      }
      // Record the opened image last so it ends up at the front of the list.
      const images = await api.recordRecent(entries[0]);
      set({ images });
    } catch (err) {
      console.error("Failed to record recent image(s)", err);
    }
  },

  closeEditor: () => {
    get().flushActiveImageEdits();
    set({ view: "gallery", activeImage: null, past: [], future: [], dragSnapshot: null });
  },

  nextImage: () => {
    const { images, activeImage } = get();
    if (images.length === 0 || !activeImage) return;
    const index = images.findIndex((img) => img.path === activeImage.path);
    get().setActiveImage(images[(index + 1) % images.length]);
  },

  prevImage: () => {
    const { images, activeImage } = get();
    if (images.length === 0 || !activeImage) return;
    const index = images.findIndex((img) => img.path === activeImage.path);
    get().setActiveImage(images[(index - 1 + images.length) % images.length]);
  },

  setEdit: (key, value) => {
    set((state) => ({ edits: { ...state.edits, [key]: value } }));
  },

  setEdits: (partial) => {
    set((state) => ({ edits: { ...state.edits, ...partial } }));
  },

  // Adjustments are dragged continuously; only push one undo step per drag gesture.
  beginAdjustment: () => set((state) => ({ dragSnapshot: state.edits })),

  commitAdjustment: () => {
    const { dragSnapshot, edits } = get();
    if (dragSnapshot && JSON.stringify(dragSnapshot) !== JSON.stringify(edits)) {
      set((state) => ({ past: [...state.past, dragSnapshot], future: [], dragSnapshot: null }));
    } else {
      set({ dragSnapshot: null });
    }
  },

  resetSlider: (key) => {
    const current = get().edits;
    if (current[key] === DEFAULT_EDITS[key]) return;
    set((state) => ({
      past: [...state.past, current],
      future: [],
      edits: { ...current, [key]: DEFAULT_EDITS[key] },
    }));
  },

  commitPartialEdit: (partial) => {
    set((state) => ({
      past: [...state.past, state.edits],
      future: [],
      edits: { ...state.edits, ...partial },
    }));
  },

  resetEdits: () => {
    const { rotate90, flipHorizontal, flipVertical } = get().edits;
    get().commitPartialEdit({ ...DEFAULT_EDITS, rotate90, flipHorizontal, flipVertical });
  },

  applyEdits: (edits) => get().commitPartialEdit(edits),

  applyPreset: (preset) => {
    const { rotate90: _rotate90, flipHorizontal: _flipHorizontal, flipVertical: _flipVertical, crop: _crop, ...adjustments } = preset;
    get().commitPartialEdit(adjustments);
  },

  matchStyleFromReference: async (referencePath) => {
    const { activeImage } = get();
    if (!activeImage) return null;
    return api.matchStyle(activeImage.path, referencePath);
  },

  setReferenceImageFromPath: async (path) => {
    try {
      const entry = await api.regenerateThumbnail(path);
      set({ referenceImage: entry });
    } catch (err) {
      console.error("Failed to load reference photo", err);
    }
  },

  clearReferenceImage: () => set({ referenceImage: null }),

  setAcceptingReferenceDrop: (accepting) => set({ acceptingReferenceDrop: accepting }),

  undo: () => {
    const { past, edits, future } = get();
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    set({ edits: previous, past: past.slice(0, -1), future: [edits, ...future] });
  },

  redo: () => {
    const { future, edits, past } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({ edits: next, future: future.slice(1), past: [...past, edits] });
  },

  loadPresets: async () => {
    const presets = await api.listPresets();
    set({ presets });
  },

  saveCurrentAsPreset: async (name) => {
    const preset = await api.savePreset(name, get().edits);
    set((state) => ({ presets: [...state.presets, preset] }));
    return preset;
  },

  removePreset: async (id) => {
    await api.deletePreset(id);
    set((state) => ({ presets: state.presets.filter((p) => p.id !== id) }));
  },

  importPresetsFromFile: async (filePath) => {
    const presets = await api.importPresetsFromFile(filePath);
    set({ presets });
  },

  openPresetsFolder: async () => {
    await api.openPresetsFolder();
  },

  setPresetFavorite: async (id, favorite) => {
    const updated = await api.setPresetFavorite(id, favorite);
    set((state) => ({ presets: state.presets.map((p) => (p.id === id ? updated : p)) }));
  },

  addPresetTag: async (id, tag) => {
    const trimmed = tag.trim().toLowerCase();
    if (!trimmed) return;
    const preset = get().presets.find((p) => p.id === id);
    if (!preset || preset.tags.includes(trimmed)) return;
    const updated = await api.setPresetTags(id, [...preset.tags, trimmed]);
    set((state) => ({ presets: state.presets.map((p) => (p.id === id ? updated : p)) }));
  },

  removePresetTag: async (id, tag) => {
    const preset = get().presets.find((p) => p.id === id);
    if (!preset) return;
    const updated = await api.setPresetTags(
      id,
      preset.tags.filter((t) => t !== tag),
    );
    set((state) => ({ presets: state.presets.map((p) => (p.id === id ? updated : p)) }));
  },

  exportPreset: async (id, outPath) => {
    await api.exportPreset(id, outPath);
  },
}));

