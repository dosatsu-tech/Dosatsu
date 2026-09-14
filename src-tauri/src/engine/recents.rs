use super::ImageEntry;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const MAX_RECENTS: usize = 100;

fn recents_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let dir = base.join("recents");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn recents_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(recents_dir(app)?.join("recents.json"))
}

fn write_recents(app: &AppHandle, entries: &[ImageEntry]) -> Result<(), String> {
    let file = recents_file(app)?;
    let contents = serde_json::to_string_pretty(entries).map_err(|e| e.to_string())?;
    std::fs::write(&file, contents).map_err(|e| e.to_string())
}

pub fn list_recents(app: &AppHandle) -> Result<Vec<ImageEntry>, String> {
    let file = recents_file(app)?;
    if !file.exists() {
        return Ok(Vec::new());
    }
    match std::fs::read_to_string(&file) {
        Ok(contents) => Ok(serde_json::from_str(&contents).unwrap_or_default()),
        Err(_) => Ok(Vec::new()),
    }
}

pub fn record_recent(app: &AppHandle, entry: ImageEntry) -> Result<Vec<ImageEntry>, String> {
    let mut entries = list_recents(app)?;
    entries.retain(|e| e.path != entry.path);
    entries.insert(0, entry);
    entries.truncate(MAX_RECENTS);
    write_recents(app, &entries)?;
    Ok(entries)
}

pub fn clear_recents(app: &AppHandle) -> Result<(), String> {
    write_recents(app, &[])
}

pub fn remove_recent(app: &AppHandle, path: &str) -> Result<Vec<ImageEntry>, String> {
    let mut entries = list_recents(app)?;
    entries.retain(|e| e.path != path);
    write_recents(app, &entries)?;
    Ok(entries)
}
