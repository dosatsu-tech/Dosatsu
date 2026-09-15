# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [v1.0.0]

### Added

- Non-destructive adjustments: exposure, contrast, highlights/shadows,
  whites/blacks, temperature/tint, saturation/vibrance, sharpening, vignette,
  clarity/texture/dehaze/fade, bloom/halation, chromatic aberration, lens
  distortion, grain, noise, and softness.
- Per-channel tone curve (RGB/red/green/blue) and a black & white mixer.
- HSL panel and three-way (shadows/midtones/highlights) color grading.
- Crop, 90° rotate, horizontal/vertical flip, and a before/after compare
  slider.
- RAW file support (Canon, Nikon, Sony, Fuji, Panasonic, Olympus, Pentax, DNG,
  and more) — RAW photos open, preview, and export like any other image.
- Presets: save, apply, delete, favorite, and tag; search/filter by name or
  tag; import and export preset files; a bundled default pack.
- Match Style: copy another photo's color and tone characteristics onto the
  photo you're editing, with an intensity slider to dial in the strength.
- Gallery with drag-and-drop import, adjustable thumbnail grid size, and an
  indicator on thumbnails that have been edited.
- Edits and rotation persist per photo across sessions.
- Export to JPEG, PNG, TIFF, or WebP with quality control.
- Cross-platform via Tauri: macOS, Windows, Linux, and Android (iOS in
  progress) from one codebase.
- Mobile-tailored editing UI: a locked-in-place canvas with a collapsible
  histogram, swipeable and sticky Adjustments/Presets tabs, touch-safe
  sliders (drag only grabs from the knob, so scrolling past one doesn't nudge
  it), and a bottom-sheet tone curve editor.
