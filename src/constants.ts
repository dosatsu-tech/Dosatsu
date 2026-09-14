/** Every image (including RAW) format the Rust engine can decode via `image` or the
 * RAW pipeline — used to filter file/photo pickers and dropped files consistently. */
export const IMAGE_EXTENSIONS = [
  "jpg", "jpeg", "png", "webp", "tiff", "tif", "raw", "cr2", "crw", "nef", "nrw",
  "arw", "raf", "rw2", "dng", "heic", "heif", "bmp", "gif",
];
