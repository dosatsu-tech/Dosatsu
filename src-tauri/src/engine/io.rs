use super::raw;
use super::{Edits, ImageEntry};
use base64::{engine::general_purpose::STANDARD, Engine};
use image::{DynamicImage, ImageFormat, RgbImage};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use tauri_plugin_fs::{FsExt, OpenOptions};

const THUMBNAIL_MAX_DIM: u32 = 320;
pub const PREVIEW_MAX_DIM: u32 = 1600;

fn looks_like_uri(path: &Path) -> bool {
    path.to_str().map(|s| s.contains("://")).unwrap_or(false)
}

fn read_uri_bytes(app: &AppHandle, path: &Path) -> Result<Vec<u8>, String> {
    let path_str = path.to_string_lossy().to_string();
    let _ = app.fs_scope().allow_file(&path_str);
    let file_path: tauri_plugin_fs::FilePath =
        path_str.parse().expect("FilePath parsing is infallible");
    app.fs().read(file_path).map_err(|e| e.to_string())
}

fn write_uri_bytes(app: &AppHandle, path: &Path, bytes: &[u8]) -> Result<(), String> {
    let path_str = path.to_string_lossy().to_string();
    let _ = app.fs_scope().allow_file(&path_str);
    let file_path: tauri_plugin_fs::FilePath =
        path_str.parse().expect("FilePath parsing is infallible");
    let mut opts = OpenOptions::new();
    opts.write(true).create(true).truncate(true);
    let mut file = app.fs().open(file_path, opts).map_err(|e| e.to_string())?;
    file.write_all(bytes).map_err(|e| e.to_string())
}

pub(crate) fn read_bytes(app: &AppHandle, path: &Path) -> Result<Vec<u8>, String> {
    match std::fs::read(path) {
        Ok(bytes) => Ok(bytes),
        Err(fs_err) => {
            if looks_like_uri(path) {
                read_uri_bytes(app, path)
            } else {
                Err(fs_err.to_string())
            }
        }
    }
}

pub(crate) fn write_bytes(app: &AppHandle, path: &Path, bytes: &[u8]) -> Result<(), String> {
    match std::fs::write(path, bytes) {
        Ok(()) => Ok(()),
        Err(fs_err) => {
            if looks_like_uri(path) {
                write_uri_bytes(app, path, bytes)
            } else {
                Err(fs_err.to_string())
            }
        }
    }
}

fn imports_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("imports");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn extension_for_bytes(bytes: &[u8]) -> &'static str {
    match image::guess_format(bytes) {
        Ok(ImageFormat::Png) => "png",
        Ok(ImageFormat::WebP) => "webp",
        Ok(ImageFormat::Gif) => "gif",
        Ok(ImageFormat::Bmp) => "bmp",
        Ok(ImageFormat::Tiff) => "tiff",
        // Jpeg and anything guess_format doesn't recognize (e.g. HEIC, which the
        // `image` crate can't decode regardless, a pre-existing, separate limitation)
        // both fall back to jpg; it's overwhelmingly the common case either way.
        _ => "jpg",
    }
}

fn materialize_if_uri(app: &AppHandle, path: &Path) -> Result<PathBuf, String> {
    if !looks_like_uri(path) {
        return Ok(path.to_path_buf());
    }

    let bytes = read_uri_bytes(app, path)?;
    let ext = extension_for_bytes(&bytes);

    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    let dest = imports_dir(app)?.join(format!("{:x}.{}", hasher.finish(), ext));

    if !dest.exists() {
        std::fs::write(&dest, &bytes).map_err(|e| e.to_string())?;
    }
    Ok(dest)
}

fn decode_any(app: &AppHandle, path: &Path) -> Result<RgbImage, String> {
    if raw::is_raw(path) {
        return raw::decode_raw(&path.to_string_lossy());
    }

    match image::open(path) {
        Ok(img) => Ok(img.to_rgb8()),
        Err(open_err) => {
            if looks_like_uri(path) {
                let bytes = read_uri_bytes(app, path)?;
                image::load_from_memory(&bytes)
                    .map(|img| img.to_rgb8())
                    .map_err(|e| e.to_string())
            } else {
                Err(open_err.to_string())
            }
        }
    }
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default()
}

fn cache_file_path(cache_dir: &Path, path: &Path) -> Option<PathBuf> {
    let meta = std::fs::metadata(path).ok()?;
    let modified = meta
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_secs();

    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    modified.hash(&mut hasher);
    meta.len().hash(&mut hasher);
    Some(cache_dir.join(format!("{:x}.jpg", hasher.finish())))
}

pub fn generate_thumbnail_entry(
    app: &AppHandle,
    path: &Path,
    cache_dir: &Path,
) -> Result<ImageEntry, String> {
    let materialized = materialize_if_uri(app, path)?;
    let path = materialized.as_path();

    let cache_path = cache_file_path(cache_dir, path);

    if let Some(cached_bytes) = cache_path.as_ref().and_then(|p| std::fs::read(p).ok()) {
        let (width, height) = image::image_dimensions(path).unwrap_or((0, 0));
        return Ok(ImageEntry {
            path: path.to_string_lossy().to_string(),
            name: file_name(path),
            width,
            height,
            thumbnail: format!("data:image/jpeg;base64,{}", STANDARD.encode(&cached_bytes)),
            edits: None,
        });
    }

    let rgb = decode_any(app, path)?;
    let (width, height) = rgb.dimensions();
    let thumb = DynamicImage::ImageRgb8(rgb).thumbnail(THUMBNAIL_MAX_DIM, THUMBNAIL_MAX_DIM);

    let mut jpeg_bytes = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg_bytes, 80)
        .encode_image(&thumb)
        .map_err(|e| e.to_string())?;

    if let Some(cache_path) = &cache_path {
        let _ = std::fs::create_dir_all(cache_dir);
        let _ = std::fs::write(cache_path, &jpeg_bytes);
    }

    Ok(ImageEntry {
        path: path.to_string_lossy().to_string(),
        name: file_name(path),
        width,
        height,
        thumbnail: format!("data:image/jpeg;base64,{}", STANDARD.encode(&jpeg_bytes)),
        edits: None,
    })
}

pub fn generate_edited_thumbnail(
    app: &AppHandle,
    path: &Path,
    edits: &Edits,
) -> Result<ImageEntry, String> {
    let materialized = materialize_if_uri(app, path)?;
    let path = materialized.as_path();

    let rgb = decode_any(app, path)?;
    let geometry = super::geometry::apply_geometry(&rgb, edits);
    let (width, height) = geometry.dimensions();
    let thumb = DynamicImage::ImageRgb8(geometry).thumbnail(THUMBNAIL_MAX_DIM, THUMBNAIL_MAX_DIM);

    let mut jpeg_bytes = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg_bytes, 80)
        .encode_image(&thumb)
        .map_err(|e| e.to_string())?;

    Ok(ImageEntry {
        path: path.to_string_lossy().to_string(),
        name: file_name(path),
        width,
        height,
        thumbnail: format!("data:image/jpeg;base64,{}", STANDARD.encode(&jpeg_bytes)),
        edits: None,
    })
}

pub fn load_working_copy(app: &AppHandle, path: &str, max_dim: u32) -> Result<RgbImage, String> {
    let rgb = decode_any(app, Path::new(path))?;
    let img = DynamicImage::ImageRgb8(rgb);
    let resized = if img.width().max(img.height()) > max_dim {
        img.resize(max_dim, max_dim, image::imageops::FilterType::Lanczos3)
    } else {
        img
    };
    Ok(resized.to_rgb8())
}

pub fn load_full(app: &AppHandle, path: &str) -> Result<RgbImage, String> {
    decode_any(app, Path::new(path))
}

pub fn encode_data_url(
    img: &DynamicImage,
    format: ImageFormat,
    quality: u8,
) -> Result<String, String> {
    let mut bytes: Vec<u8> = Vec::new();
    match format {
        ImageFormat::Jpeg => {
            let mut encoder =
                image::codecs::jpeg::JpegEncoder::new_with_quality(&mut bytes, quality);
            encoder.encode_image(img).map_err(|e| e.to_string())?;
        }
        _ => {
            img.write_to(&mut Cursor::new(&mut bytes), format)
                .map_err(|e| e.to_string())?;
        }
    }
    let mime = match format {
        ImageFormat::Jpeg => "image/jpeg",
        ImageFormat::Png => "image/png",
        ImageFormat::WebP => "image/webp",
        _ => "application/octet-stream",
    };
    Ok(format!("data:{mime};base64,{}", STANDARD.encode(&bytes)))
}

pub fn save_image(
    app: &AppHandle,
    img: &RgbImage,
    out_path: &str,
    format: &str,
    quality: u8,
) -> Result<(), String> {
    let dynamic = DynamicImage::ImageRgb8(img.clone());
    let mut bytes: Vec<u8> = Vec::new();
    match format.to_lowercase().as_str() {
        "jpeg" | "jpg" => {
            let mut encoder =
                image::codecs::jpeg::JpegEncoder::new_with_quality(&mut bytes, quality);
            encoder.encode_image(&dynamic).map_err(|e| e.to_string())?;
        }
        // PNG is lossless; quality slider controls compression level (mapped from 0-100 to 0-9)
        // For simplicity, we use the image crate's default compression
        "png" => {
            dynamic
                .write_to(&mut Cursor::new(&mut bytes), ImageFormat::Png)
                .map_err(|e| e.to_string())?;
        }
        "tiff" | "tif" => {
            dynamic
                .write_to(&mut Cursor::new(&mut bytes), ImageFormat::Tiff)
                .map_err(|e| e.to_string())?;
        }
        "webp" => {
            dynamic
                .write_to(&mut Cursor::new(&mut bytes), ImageFormat::WebP)
                .map_err(|e| e.to_string())?;
        }
        other => return Err(format!("Unsupported export format: {other}")),
    }

    write_bytes(app, Path::new(out_path), &bytes)
}
