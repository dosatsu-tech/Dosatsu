mod engine;

use engine::histogram::Histogram;
use engine::presets::Preset;
use engine::{io, Edits, ImageEntry};
use image::{DynamicImage, ImageFormat};
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;
use tauri::{Manager, State};

/// Caches the downscaled "working copy" of each opened image so that
/// live-preview edits don't have to re-decode the full-resolution file
/// on every slider change.
struct PreviewCache(Mutex<HashMap<String, image::RgbImage>>);

#[derive(Debug, Clone, Serialize)]
struct PreviewResponse {
    preview: String,
    histogram: Histogram,
}

fn thumbnail_cache_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("thumbnails"))
}

/// Regenerates a single image's thumbnail (e.g. after it was just exported/overwritten),
/// bypassing the stale cache entry since the file's modified time will have changed.
#[tauri::command]
fn regenerate_thumbnail(app: tauri::AppHandle, path: String) -> Result<ImageEntry, String> {
    let cache_dir = thumbnail_cache_dir(&app)?;
    io::generate_thumbnail_entry(&app, Path::new(&path), &cache_dir)
}

fn get_working_copy(
    app: &tauri::AppHandle,
    path: &str,
    cache: &State<PreviewCache>,
) -> Result<image::RgbImage, String> {
    let mut map = cache.0.lock().map_err(|e| e.to_string())?;
    if let Some(img) = map.get(path) {
        Ok(img.clone())
    } else {
        let img = io::load_working_copy(app, path, io::PREVIEW_MAX_DIM)?;
        map.insert(path.to_string(), img.clone());
        Ok(img)
    }
}

#[tauri::command]
fn get_preview(
    app: tauri::AppHandle,
    path: String,
    edits: Edits,
    cache: State<PreviewCache>,
) -> Result<PreviewResponse, String> {
    let working = get_working_copy(&app, &path, &cache)?;

    let geometry = engine::geometry::apply_geometry(&working, &edits);
    let edited = engine::adjustments::apply_edits(&geometry, &edits);
    let histogram = engine::histogram::compute_histogram(&edited);

    let dynamic = DynamicImage::ImageRgb8(edited);
    let preview = io::encode_data_url(&dynamic, ImageFormat::Jpeg, 85)?;

    Ok(PreviewResponse { preview, histogram })
}

#[tauri::command]
fn get_original_preview(
    app: tauri::AppHandle,
    path: String,
    edits: Edits,
    cache: State<PreviewCache>,
) -> Result<String, String> {
    let working = get_working_copy(&app, &path, &cache)?;
    // Geometry (rotate/flip/crop) should match the edited preview; only color/effect edits are excluded.
    let geometry = engine::geometry::apply_geometry(&working, &edits);
    let dynamic = DynamicImage::ImageRgb8(geometry);
    io::encode_data_url(&dynamic, ImageFormat::Jpeg, 85)
}

#[tauri::command]
fn export_image(
    app: tauri::AppHandle,
    path: String,
    edits: Edits,
    out_path: String,
    format: String,
    quality: u8,
) -> Result<(), String> {
    let full = io::load_full(&app, &path)?;
    let geometry = engine::geometry::apply_geometry(&full, &edits);
    let edited = engine::adjustments::apply_edits(&geometry, &edits);
    io::save_image(&app, &edited, &out_path, &format, quality)
}

#[tauri::command]
fn clear_preview_cache(cache: State<PreviewCache>) -> Result<(), String> {
    cache.0.lock().map_err(|e| e.to_string())?.clear();
    Ok(())
}

#[tauri::command]
fn match_style(
    app: tauri::AppHandle,
    current_path: String,
    reference_path: String,
) -> Result<Edits, String> {
    engine::style_match::match_style(&app, &current_path, &reference_path)
}

#[tauri::command]
fn list_presets(app: tauri::AppHandle) -> Result<Vec<Preset>, String> {
    engine::presets::list_presets(&app)
}

#[tauri::command]
fn save_preset(app: tauri::AppHandle, name: String, edits: Edits) -> Result<Preset, String> {
    engine::presets::save_preset(&app, name, edits)
}

#[tauri::command]
fn delete_preset(app: tauri::AppHandle, id: String) -> Result<(), String> {
    engine::presets::delete_preset(&app, &id)
}

#[tauri::command]
fn set_preset_tags(app: tauri::AppHandle, id: String, tags: Vec<String>) -> Result<Preset, String> {
    engine::presets::set_preset_tags(&app, &id, tags)
}

#[tauri::command]
fn set_preset_favorite(
    app: tauri::AppHandle,
    id: String,
    favorite: bool,
) -> Result<Preset, String> {
    engine::presets::set_preset_favorite(&app, &id, favorite)
}

#[tauri::command]
fn export_preset(app: tauri::AppHandle, id: String, out_path: String) -> Result<(), String> {
    engine::presets::export_preset(&app, &id, &out_path)
}

#[tauri::command]
fn import_presets(app: tauri::AppHandle, dir: String) -> Result<Vec<Preset>, String> {
    engine::presets::import_presets(&app, &dir)
}

#[tauri::command]
fn import_presets_from_file(
    app: tauri::AppHandle,
    file_path: String,
) -> Result<Vec<Preset>, String> {
    engine::presets::import_presets_from_file(&app, &file_path)
}

#[tauri::command]
fn get_presets_folder_path(app: tauri::AppHandle) -> Result<String, String> {
    let dir = engine::presets::presets_dir(&app)?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
fn list_recents(app: tauri::AppHandle) -> Result<Vec<ImageEntry>, String> {
    engine::recents::list_recents(&app)
}

#[tauri::command]
fn record_recent(app: tauri::AppHandle, entry: ImageEntry) -> Result<Vec<ImageEntry>, String> {
    engine::recents::record_recent(&app, entry)
}

#[tauri::command]
fn clear_recents(app: tauri::AppHandle) -> Result<(), String> {
    engine::recents::clear_recents(&app)
}

#[tauri::command]
fn remove_recent(app: tauri::AppHandle, path: String) -> Result<Vec<ImageEntry>, String> {
    engine::recents::remove_recent(&app, &path)
}

/// Persists a photo's current edits (including rotation/flip/crop) so reopening it
/// restores them, and re-renders its gallery thumbnail with the geometry baked in so
/// the tile itself visually reflects the rotation/flip/crop too.
#[tauri::command]
fn save_image_edits(
    app: tauri::AppHandle,
    path: String,
    edits: Edits,
) -> Result<Vec<ImageEntry>, String> {
    let mut entry = io::generate_edited_thumbnail(&app, Path::new(&path), &edits)?;
    entry.edits = Some(edits);
    engine::recents::record_recent(&app, entry)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(PreviewCache(Mutex::new(HashMap::new())))
        .invoke_handler(tauri::generate_handler![
            regenerate_thumbnail,
            get_preview,
            get_original_preview,
            export_image,
            clear_preview_cache,
            match_style,
            list_presets,
            save_preset,
            delete_preset,
            set_preset_tags,
            set_preset_favorite,
            export_preset,
            import_presets,
            import_presets_from_file,
            get_presets_folder_path,
            list_recents,
            record_recent,
            clear_recents,
            remove_recent,
            save_image_edits,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
