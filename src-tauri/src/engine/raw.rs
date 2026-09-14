use image::RgbImage;

pub const RAW_EXTENSIONS: &[&str] = &[
    "cr2", "cr3", "nef", "arw", "dng", "raf", "rw2", "orf", "pef", "srw", "3fr", "erf", "kdc",
    "mrw", "raw", "rwl", "srw",
];

pub fn is_raw(path: &std::path::Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| RAW_EXTENSIONS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

pub fn decode_raw(path: &str) -> Result<RgbImage, String> {
    let mut pipeline = imagepipe::Pipeline::new_from_file(path).map_err(|e| e.to_string())?;
    let decoded = pipeline.output_8bit(None).map_err(|e| e.to_string())?;

    RgbImage::from_raw(decoded.width as u32, decoded.height as u32, decoded.data)
        .ok_or_else(|| "Failed to build image buffer from decoded RAW data".to_string())
}
