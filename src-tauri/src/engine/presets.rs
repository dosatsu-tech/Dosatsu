use super::io;
use super::Edits;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

fn default_source() -> PresetSource {
    PresetSource::User
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PresetSource {
    Default,
    User,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Preset {
    pub id: String,
    pub name: String,
    pub edits: Edits,
    // Missing on presets saved before this field existed; treat those as user presets.
    #[serde(default = "default_source")]
    pub source: PresetSource,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub favorite: bool,
}

#[derive(Debug, Clone, Deserialize)]
struct ImportedPreset {
    name: String,
    #[serde(default)]
    edits: Edits,
    #[serde(default)]
    tags: Vec<String>,
}

pub fn presets_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let dir = base.join("presets");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    // One-time migration: presets.json used to live directly in the app data dir.
    let legacy_file = base.join("presets.json");
    let new_file = dir.join("presets.json");
    if legacy_file.exists() && !new_file.exists() {
        let _ = std::fs::rename(&legacy_file, &new_file);
    }

    Ok(dir)
}

fn presets_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(presets_dir(app)?.join("presets.json"))
}

fn named_preset(name: &str, edits: Edits) -> Preset {
    Preset {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.to_string(),
        edits,
        source: PresetSource::User,
        tags: Vec::new(),
        favorite: false,
    }
}

fn imported_to_preset(item: ImportedPreset) -> Preset {
    Preset {
        tags: item.tags,
        ..named_preset(&item.name, item.edits)
    }
}

/// The built-in preset pack, bundled with the app and baked into the binary at
/// compile time (so it works identically on mobile, where there's no writable
/// asset directory to read from at runtime). Seeded into a fresh install's
/// presets.json on first run (see `list_presets`) — after that, this function
/// only matters again if that file goes away, e.g. on uninstall/reinstall.
pub fn default_presets() -> Vec<Preset> {
    const DEFAULT_PRESETS_JSON: &str = include_str!("../../../public/presets/default/presets.json");

    match serde_json::from_str::<Vec<Preset>>(DEFAULT_PRESETS_JSON) {
        Ok(presets) => presets,
        Err(err) => {
            eprintln!("Bundled default presets.json is malformed: {err}");
            Vec::new()
        }
    }
}

pub fn list_presets(app: &AppHandle) -> Result<Vec<Preset>, String> {
    let file = presets_file(app)?;

    if !file.exists() {
        // First run: seed with the built-in preset pack so the list isn't empty.
        let seeded = default_presets();
        // Try to write to disk, but if it fails, still return the default presets
        // so the app remains functional
        let _ = write_presets(app, &seeded);
        return Ok(seeded);
    }

    // Try to read existing presets
    match std::fs::read_to_string(&file) {
        Ok(contents) => {
            match serde_json::from_str::<Vec<Preset>>(&contents) {
                Ok(presets) => Ok(presets),
                Err(_) => {
                    // File exists but is corrupted, seed with defaults
                    let seeded = default_presets();
                    let _ = write_presets(app, &seeded);
                    Ok(seeded)
                }
            }
        }
        Err(_) => {
            // File exists but can't be read, return defaults
            Ok(default_presets())
        }
    }
}

fn write_presets(app: &AppHandle, presets: &[Preset]) -> Result<(), String> {
    let file = presets_file(app)?;
    let contents = serde_json::to_string_pretty(presets).map_err(|e| e.to_string())?;
    std::fs::write(&file, contents).map_err(|e| e.to_string())
}

pub fn save_preset(app: &AppHandle, name: String, edits: Edits) -> Result<Preset, String> {
    let mut presets = list_presets(app)?;
    let preset = named_preset(&name, edits);
    presets.push(preset.clone());
    write_presets(app, &presets)?;
    Ok(preset)
}

pub fn delete_preset(app: &AppHandle, id: &str) -> Result<(), String> {
    let mut presets = list_presets(app)?;
    presets.retain(|p| p.id != id);
    write_presets(app, &presets)
}

pub fn set_preset_tags(app: &AppHandle, id: &str, tags: Vec<String>) -> Result<Preset, String> {
    let mut presets = list_presets(app)?;
    let preset = presets
        .iter_mut()
        .find(|p| p.id == id)
        .ok_or_else(|| "Preset not found".to_string())?;
    preset.tags = tags;
    let updated = preset.clone();
    write_presets(app, &presets)?;
    Ok(updated)
}

pub fn set_preset_favorite(app: &AppHandle, id: &str, favorite: bool) -> Result<Preset, String> {
    let mut presets = list_presets(app)?;
    let preset = presets
        .iter_mut()
        .find(|p| p.id == id)
        .ok_or_else(|| "Preset not found".to_string())?;
    preset.favorite = favorite;
    let updated = preset.clone();
    write_presets(app, &presets)?;
    Ok(updated)
}

pub fn export_preset(app: &AppHandle, id: &str, out_path: &str) -> Result<(), String> {
    let presets = list_presets(app)?;
    let preset = presets
        .iter()
        .find(|p| p.id == id)
        .ok_or_else(|| "Preset not found".to_string())?;
    let json = serde_json::to_string_pretty(preset).map_err(|e| e.to_string())?;
    io::write_bytes(app, Path::new(out_path), json.as_bytes())
}

pub fn import_presets(app: &AppHandle, dir: &str) -> Result<Vec<Preset>, String> {
    let mut presets = list_presets(app)?;

    let entries = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        let is_json = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("json"))
            .unwrap_or(false);
        if !path.is_file() || !is_json {
            continue;
        }

        let contents = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(err) => {
                eprintln!("Skipping preset file {:?}: {err}", path);
                continue;
            }
        };

        let imported: Vec<ImportedPreset> =
            match serde_json::from_str::<Vec<ImportedPreset>>(&contents) {
                Ok(list) => list,
                Err(_) => match serde_json::from_str::<ImportedPreset>(&contents) {
                    Ok(single) => vec![single],
                    Err(err) => {
                        eprintln!("Skipping invalid preset file {:?}: {err}", path);
                        continue;
                    }
                },
            };

        for item in imported {
            presets.push(imported_to_preset(item));
        }
    }

    write_presets(app, &presets)?;
    Ok(presets)
}

pub fn import_presets_from_file(app: &AppHandle, file_path: &str) -> Result<Vec<Preset>, String> {
    let mut presets = list_presets(app)?;

    let bytes = io::read_bytes(app, Path::new(file_path))?;
    let contents = String::from_utf8(bytes).map_err(|e| e.to_string())?;

    let imported: Vec<ImportedPreset> = match serde_json::from_str::<Vec<ImportedPreset>>(&contents)
    {
        Ok(list) => list,
        Err(_) => match serde_json::from_str::<ImportedPreset>(&contents) {
            Ok(single) => vec![single],
            Err(err) => {
                return Err(format!("Invalid preset file format: {err}"));
            }
        },
    };

    for item in imported {
        presets.push(imported_to_preset(item));
    }

    write_presets(app, &presets)?;
    Ok(presets)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_default_presets_parse() {
        let presets = default_presets();
        assert!(
            !presets.is_empty(),
            "expected the bundled default preset pack to be non-empty"
        );
        for preset in &presets {
            assert!(!preset.id.is_empty());
            assert!(!preset.name.is_empty());
            assert_eq!(preset.source, PresetSource::Default);
        }
    }

    #[test]
    fn bundled_default_preset_ids_are_unique() {
        let presets = default_presets();
        let mut ids: Vec<&str> = presets.iter().map(|p| p.id.as_str()).collect();
        let count_before = ids.len();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(
            ids.len(),
            count_before,
            "found duplicate ids in the bundled default presets"
        );
    }
}
