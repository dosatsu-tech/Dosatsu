import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { Edits, ImageEntry, Preset, PreviewResponse } from "../types";

export const api = {
  regenerateThumbnail: (path: string) => invoke<ImageEntry>("regenerate_thumbnail", { path }),

  getPreview: (path: string, edits: Edits) =>
    invoke<PreviewResponse>("get_preview", { path, edits }),

  getOriginalPreview: (path: string, edits: Edits) =>
    invoke<string>("get_original_preview", { path, edits }),

  exportImage: (
    path: string,
    edits: Edits,
    outPath: string,
    format: string,
    quality: number,
  ) => invoke<void>("export_image", { path, edits, outPath, format, quality }),

  clearPreviewCache: () => invoke<void>("clear_preview_cache"),

  matchStyle: (currentPath: string, referencePath: string) =>
    invoke<Edits>("match_style", { currentPath, referencePath }),

  listPresets: () => invoke<Preset[]>("list_presets"),

  savePreset: (name: string, edits: Edits) =>
    invoke<Preset>("save_preset", { name, edits }),

  deletePreset: (id: string) => invoke<void>("delete_preset", { id }),

  setPresetTags: (id: string, tags: string[]) =>
    invoke<Preset>("set_preset_tags", { id, tags }),

  setPresetFavorite: (id: string, favorite: boolean) =>
    invoke<Preset>("set_preset_favorite", { id, favorite }),

  exportPreset: (id: string, outPath: string) =>
    invoke<void>("export_preset", { id, outPath }),

  importPresets: (dir: string) => invoke<Preset[]>("import_presets", { dir }),

  importPresetsFromFile: (filePath: string) => invoke<Preset[]>("import_presets_from_file", { filePath }),

  getPresetsFolderPath: () => invoke<string>("get_presets_folder_path"),

  openPresetsFolder: async () => {
    const path = await invoke<string>("get_presets_folder_path");
    // revealItemInDir (Finder's "reveal" API) is used instead of openPath because
    // openPath shells out to `open`, which on macOS mistakes the presets folder
    // (named after the "com.dosatsu.app" bundle identifier) for an app bundle to launch.
    await revealItemInDir(path);
  },

  listRecents: () => invoke<ImageEntry[]>("list_recents"),

  recordRecent: (entry: ImageEntry) => invoke<ImageEntry[]>("record_recent", { entry }),

  clearRecents: () => invoke<void>("clear_recents"),

  removeRecent: (path: string) => invoke<ImageEntry[]>("remove_recent", { path }),

  saveImageEdits: (path: string, edits: Edits) =>
    invoke<ImageEntry[]>("save_image_edits", { path, edits }),
};
