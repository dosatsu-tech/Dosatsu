pub mod adjustments;
pub mod geometry;
pub mod histogram;
pub mod io;
pub mod presets;
pub mod raw;
pub mod recents;
pub mod style_match;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CropRect {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

/// A hue/saturation/luminance triplet, reused for both per-color HSL channels
/// and shadow/midtone/highlight color grading ranges.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HslChannel {
    pub hue: f32,
    pub saturation: f32,
    pub luminance: f32,
}

/// Per-color hue/saturation/luminance adjustments (Lightroom-style HSL panel).
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct HslAdjustments {
    pub red: HslChannel,
    pub orange: HslChannel,
    pub yellow: HslChannel,
    pub green: HslChannel,
    pub aqua: HslChannel,
    pub blue: HslChannel,
    pub purple: HslChannel,
    pub magenta: HslChannel,
}

/// Separate coloration applied to shadows/midtones/highlights based on luminance.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ColorGrading {
    pub shadows: HslChannel,
    pub midtones: HslChannel,
    pub highlights: HslChannel,
}

/// A single control point on a tone curve; both axes normalized 0..1.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CurvePoint {
    pub x: f32,
    pub y: f32,
}

fn identity_curve() -> Vec<CurvePoint> {
    vec![CurvePoint { x: 0.0, y: 0.0 }, CurvePoint { x: 1.0, y: 1.0 }]
}

/// An "RGB" master curve plus optional per-channel
/// curves layered on top of it (final = channel_curve(rgb_curve(value))).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ToneCurve {
    pub rgb: Vec<CurvePoint>,
    pub red: Vec<CurvePoint>,
    pub green: Vec<CurvePoint>,
    pub blue: Vec<CurvePoint>,
}

impl Default for ToneCurve {
    fn default() -> Self {
        Self {
            rgb: identity_curve(),
            red: identity_curve(),
            green: identity_curve(),
            blue: identity_curve(),
        }
    }
}

/// Black & white channel mixer: when enabled, the image
/// is converted to grayscale using a hue-weighted mix of these per-color contributions
/// instead of a flat luminance formula. All channels at 0 reproduces plain luminance.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct BwMixer {
    pub enabled: bool,
    pub red: f32,
    pub orange: f32,
    pub yellow: f32,
    pub green: f32,
    pub aqua: f32,
    pub blue: f32,
    pub purple: f32,
    pub magenta: f32,
}

/// The full set of non-destructive adjustments that can be applied to a photo.
/// Ranges roughly follow Lightroom conventions so presets feel familiar.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Edits {
    pub exposure: f32,             // stops, -5.0..5.0
    pub contrast: f32,             // -100..100
    pub highlights: f32,           // -100..100
    pub shadows: f32,              // -100..100
    pub whites: f32,               // -100..100
    pub blacks: f32,               // -100..100
    pub temperature: f32,          // -100..100 (blue <-> yellow)
    pub tint: f32,                 // -100..100 (green <-> magenta)
    pub saturation: f32,           // -100..100
    pub vibrance: f32,             // -100..100
    pub sharpening: f32,           // 0..150
    pub vignette: f32,             // -100..100
    pub fade: f32,                 // 0..100, raised/faded blacks for vintage processing
    pub clarity: f32,              // -100..100, midtone/local contrast
    pub texture: f32,              // -100..100, fine detail independent of sharpening
    pub dehaze: f32, // -100..100, negative adds haze (washed film), positive removes it
    pub bloom: f32,  // 0..100, soft glow around bright areas
    pub halation: f32, // 0..100, red/orange glow around strong highlights
    pub softness: f32, // 0..100, highlight-weighted diffusion (soft-focus / Pro-Mist look)
    pub lens_distortion: f32, // -100..100, negative = pincushion, positive = barrel
    pub chromatic_aberration: f32, // 0..100, red/cyan-blue fringing toward the frame edges
    pub grain: f32,  // 0..100, overall grain intensity
    pub grain_size: f32, // 0..100, fine 35mm grain <-> chunky disposable-camera grain
    pub grain_roughness: f32, // 0..100, uniform digital noise <-> organic film clumping
    pub noise: f32,  // 0..100, digital sensor noise (luma + chroma, shadow-weighted)
    pub hsl: HslAdjustments,
    pub color_grading: ColorGrading,
    pub tone_curve: ToneCurve,
    pub bw_mixer: BwMixer,
    pub rotate90: u8, // number of 90deg clockwise turns, 0..3
    pub flip_horizontal: bool,
    pub flip_vertical: bool,
    /// Normalized crop rectangle (0..1 fractions), applied after rotation/flip.
    pub crop: Option<CropRect>,
}

impl Default for Edits {
    fn default() -> Self {
        Self {
            exposure: 0.0,
            contrast: 0.0,
            highlights: 0.0,
            shadows: 0.0,
            whites: 0.0,
            blacks: 0.0,
            temperature: 0.0,
            tint: 0.0,
            saturation: 0.0,
            vibrance: 0.0,
            sharpening: 0.0,
            vignette: 0.0,
            fade: 0.0,
            clarity: 0.0,
            texture: 0.0,
            dehaze: 0.0,
            bloom: 0.0,
            halation: 0.0,
            softness: 0.0,
            lens_distortion: 0.0,
            chromatic_aberration: 0.0,
            grain: 0.0,
            grain_size: 25.0,
            grain_roughness: 50.0,
            noise: 0.0,
            hsl: HslAdjustments::default(),
            color_grading: ColorGrading::default(),
            tone_curve: ToneCurve::default(),
            bw_mixer: BwMixer::default(),
            rotate90: 0,
            flip_horizontal: false,
            flip_vertical: false,
            crop: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageEntry {
    pub path: String,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub thumbnail: String,
    /// The last edits saved for this photo (see `save_image_edits`), so reopening it
    /// restores where the user left off instead of starting from a blank slate.
    /// Missing on entries recorded before this field existed.
    #[serde(default)]
    pub edits: Option<Edits>,
}
