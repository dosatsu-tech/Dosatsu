use super::adjustments::{hue_weight, rgb_to_hsl, smoothstep};
use super::io;
use super::{BwMixer, ColorGrading, Edits, HslAdjustments, HslChannel};
use image::{imageops::FilterType, RgbImage};

/// Working resolution for color/tone statistics — plenty for stable averages, tiny
/// enough that this stays effectively instant.
const COLOR_STATS_MAX_DIM: u32 = 400;

/// Working resolution for the grain estimate. Needs to stay much closer to the
/// original than the color stats do — downscaling smooths away exactly the
/// fine, high-frequency texture grain detection depends on.
const GRAIN_STATS_MAX_DIM: u32 = 1000;

/// How strongly a tonal band's derived *brightness* shift is allowed to pull the
/// image, expressed in the same units `apply_color_grading` uses for its `strength`
/// factor. Deliberately luminance-only: a band's *color* is handled separately by
/// the dominant-hue HSL boost below, which only touches pixels that already share a
/// color's hue instead of tinting an entire tonal band — painting, say, a stray red
/// flower's color across the whole midtone band is exactly the "filter overlay" this
/// split avoids.
const BAND_LUMINANCE_STRENGTH: f32 = 0.7;

/// A tonal band (shadows/midtones/highlights) needs to cover at least this fraction
/// of the frame, in *both* photos, before its derived brightness shift is trusted at
/// full strength — a band that's almost empty (e.g. a photo with barely any true
/// highlights) gives a noisy, unrepresentative average, and shouldn't be read as a
/// deliberate brightness edit.
const FULL_CONFIDENCE_COVERAGE: f32 = 0.12;

/// Ceiling on the derived global saturation shift — a ratio-based estimate can swing
/// to the slider's full ±100 for two photos that are just differently saturated,
/// which reads as over-processed; keep the automatic pass moderate.
const SATURATION_CAP: f32 = 60.0;

/// Below this average per-pixel chroma, a photo is treated as having no meaningful
/// color of its own (a black & white reference, give or take JPEG noise) rather than
/// just being a low-saturation color photo.
const GRAYSCALE_CHROMA_THRESHOLD: f32 = 0.015;

/// Ignore near-neutral pixels entirely when measuring which hues are present — their
/// hue angle is numerically meaningless noise once saturation gets this low.
const HUE_PRESENCE_MIN_SATURATION: f32 = 0.02;

/// The 8 hue-channel centers the app's HSL panel and B&W mixer already use, so a
/// boosted channel here affects exactly the pixels the corresponding slider would.
const HUE_CHANNEL_CENTERS: [f32; 8] = [0.0, 30.0, 60.0, 120.0, 180.0, 240.0, 275.0, 315.0];
const HUE_HALF_WIDTH: f32 = 45.0;

/// Ignore a hue channel's presence delta below this — floating-point/JPEG noise, not
/// a color actually worth boosting.
const HUE_PRESENCE_EPSILON: f32 = 0.01;

/// Empirical scale mapping a hue channel's measured presence delta (reference minus
/// current, both 0..~1-ish coverage-weighted-by-saturation) to the HSL saturation
/// slider's 0..100 range. Tuned so a clearly-present accent color (occupying a modest
/// fraction of the frame at high saturation) lands as a solid, visible boost rather
/// than a barely-there nudge.
const HUE_BOOST_SCALE: f32 = 8.0;

/// Ceilings on a single channel's derived boost — a very dominant reference color
/// (e.g. a large saturated background) would otherwise be scaled arbitrarily high.
const HUE_BOOST_SATURATION_CAP: f32 = 45.0;
const HUE_BOOST_LUMINANCE_CAP: f32 = 15.0;

/// Empirical scale mapping a measured high-frequency-energy delta (0..255-ish units)
/// to the `grain` slider's 0..100 range. Not a physical calibration — just tuned so a
/// noticeably grainier reference lands in the slider's middle, not pinned at max.
const GRAIN_SCALE: f32 = 6.0;

const LUM_WEIGHTS: (f32, f32, f32) = (0.2126, 0.7152, 0.0722);

struct ImageStats {
    mean_r: f32,
    mean_g: f32,
    mean_b: f32,
    mean_lum: f32,
    std_lum: f32,
    mean_chroma: f32,
    shadow_mean: (f32, f32, f32),
    shadow_weight: f32,
    midtone_mean: (f32, f32, f32),
    midtone_weight: f32,
    highlight_mean: (f32, f32, f32),
    highlight_weight: f32,
    /// Per-channel "how much of the frame is this hue, weighted by how saturated it
    /// is" — the same signal `apply_hsl`/`apply_bw_mixer` weight pixels by, averaged
    /// over the whole image so a small accent color naturally scores lower than a
    /// dominant one instead of both reading as "100% present."
    hue_presence: [f32; 8],
}

fn downscale(img: &RgbImage, max_dim: u32) -> RgbImage {
    let (w, h) = img.dimensions();
    if w.max(h) <= max_dim {
        return img.clone();
    }
    let scale = max_dim as f32 / w.max(h) as f32;
    let nw = ((w as f32 * scale).round() as u32).max(1);
    let nh = ((h as f32 * scale).round() as u32).max(1);
    image::imageops::resize(img, nw, nh, FilterType::Triangle)
}

fn luminance(r: f32, g: f32, b: f32) -> f32 {
    LUM_WEIGHTS.0 * r + LUM_WEIGHTS.1 * g + LUM_WEIGHTS.2 * b
}

fn compute_stats(img: &RgbImage) -> ImageStats {
    let small = downscale(img, COLOR_STATS_MAX_DIM);
    let n = (small.width() as f64) * (small.height() as f64);

    let (mut sum_r, mut sum_g, mut sum_b, mut sum_lum, mut sum_chroma) =
        (0f64, 0f64, 0f64, 0f64, 0f64);
    let (mut sh_sum, mut mid_sum, mut hi_sum) =
        ((0f64, 0f64, 0f64), (0f64, 0f64, 0f64), (0f64, 0f64, 0f64));
    let (mut sh_w, mut mid_w, mut hi_w) = (0f64, 0f64, 0f64);
    let mut hue_sums = [0f64; 8];

    for px in small.pixels() {
        let r = px[0] as f32 / 255.0;
        let g = px[1] as f32 / 255.0;
        let b = px[2] as f32 / 255.0;
        let lum = luminance(r, g, b);

        sum_r += r as f64;
        sum_g += g as f64;
        sum_b += b as f64;
        sum_lum += lum as f64;
        sum_chroma += (((r - lum).abs() + (g - lum).abs() + (b - lum).abs()) / 3.0) as f64;

        let shadow_mask = 1.0 - smoothstep(0.0, 0.5, lum);
        let highlight_mask = smoothstep(0.5, 1.0, lum);
        let midtone_mask = (1.0 - shadow_mask - highlight_mask).max(0.0);

        sh_sum.0 += (r * shadow_mask) as f64;
        sh_sum.1 += (g * shadow_mask) as f64;
        sh_sum.2 += (b * shadow_mask) as f64;
        sh_w += shadow_mask as f64;

        mid_sum.0 += (r * midtone_mask) as f64;
        mid_sum.1 += (g * midtone_mask) as f64;
        mid_sum.2 += (b * midtone_mask) as f64;
        mid_w += midtone_mask as f64;

        hi_sum.0 += (r * highlight_mask) as f64;
        hi_sum.1 += (g * highlight_mask) as f64;
        hi_sum.2 += (b * highlight_mask) as f64;
        hi_w += highlight_mask as f64;

        let (h, s, _l) = rgb_to_hsl(r, g, b);
        if s >= HUE_PRESENCE_MIN_SATURATION {
            for (i, &center) in HUE_CHANNEL_CENTERS.iter().enumerate() {
                let w = hue_weight(h, center, HUE_HALF_WIDTH);
                if w > 0.0 {
                    hue_sums[i] += (w * s) as f64;
                }
            }
        }
    }

    let mean_r = (sum_r / n) as f32;
    let mean_g = (sum_g / n) as f32;
    let mean_b = (sum_b / n) as f32;
    let mean_lum = (sum_lum / n) as f32;
    let mean_chroma = (sum_chroma / n) as f32;

    let mut sum_sq = 0f64;
    for px in small.pixels() {
        let r = px[0] as f32 / 255.0;
        let g = px[1] as f32 / 255.0;
        let b = px[2] as f32 / 255.0;
        let d = luminance(r, g, b) as f64 - mean_lum as f64;
        sum_sq += d * d;
    }
    let std_lum = (sum_sq / n).sqrt() as f32;

    let mut hue_presence = [0f32; 8];
    for i in 0..8 {
        hue_presence[i] = (hue_sums[i] / n) as f32;
    }

    let safe = |w: f64| if w < 1e-3 { 1e-3 } else { w };
    ImageStats {
        mean_r,
        mean_g,
        mean_b,
        mean_lum,
        std_lum,
        mean_chroma,
        shadow_mean: (
            (sh_sum.0 / safe(sh_w)) as f32,
            (sh_sum.1 / safe(sh_w)) as f32,
            (sh_sum.2 / safe(sh_w)) as f32,
        ),
        shadow_weight: (sh_w / n) as f32,
        midtone_mean: (
            (mid_sum.0 / safe(mid_w)) as f32,
            (mid_sum.1 / safe(mid_w)) as f32,
            (mid_sum.2 / safe(mid_w)) as f32,
        ),
        midtone_weight: (mid_w / n) as f32,
        highlight_mean: (
            (hi_sum.0 / safe(hi_w)) as f32,
            (hi_sum.1 / safe(hi_w)) as f32,
            (hi_sum.2 / safe(hi_w)) as f32,
        ),
        highlight_weight: (hi_w / n) as f32,
        hue_presence,
    }
}

/// Rough grain/noise estimate: mean per-channel deviation from a lightly blurred copy
/// of the image. This also picks up genuine fine detail (foliage, fabric, texture),
/// not just grain — there's no cheap way to fully separate the two — so it's only
/// used as a *relative* signal (reference vs. current), never an absolute one.
fn estimate_grain_score(img: &RgbImage) -> f32 {
    let small = downscale(img, GRAIN_STATS_MAX_DIM);
    let blurred = image::imageops::blur(&small, 1.0);
    let n = (small.width() as f64) * (small.height() as f64) * 3.0;

    let mut sum_abs_diff = 0f64;
    for (p, bp) in small.pixels().zip(blurred.pixels()) {
        for c in 0..3 {
            sum_abs_diff += (p[c] as f32 - bp[c] as f32).abs() as f64;
        }
    }
    (sum_abs_diff / n) as f32
}

/// Derives one tonal band's brightness-only shift (no hue/saturation — see the module
/// doc comment for why). `confidence` (0..1) scales it down when either photo has too
/// little of this band to trust its average.
fn derive_band_luminance(
    reference: (f32, f32, f32),
    current: (f32, f32, f32),
    confidence: f32,
) -> f32 {
    let ref_lum = luminance(reference.0, reference.1, reference.2);
    let cur_lum = luminance(current.0, current.1, current.2);
    ((ref_lum - cur_lum) * confidence / BAND_LUMINANCE_STRENGTH * 100.0).clamp(-100.0, 100.0)
}

/// Finds which of the 8 hue channels are more present in the reference than the
/// current photo already is, and boosts *only those channels'* saturation/luminance —
/// which, via `apply_hsl`, only affects pixels whose own hue is already close to that
/// channel. A red flower in the reference can only ever brighten/intensify red-ish
/// pixels already in the current photo; it can never tint the rest of the image.
fn derive_hue_boost(reference: &[f32; 8], current: &[f32; 8]) -> HslAdjustments {
    let mut hsl = HslAdjustments::default();
    for i in 0..8 {
        let delta = (reference[i] - current[i]).max(0.0);
        if delta < HUE_PRESENCE_EPSILON {
            continue;
        }
        let raw = delta * HUE_BOOST_SCALE * 100.0;
        let channel = HslChannel {
            hue: 0.0,
            saturation: raw.min(HUE_BOOST_SATURATION_CAP),
            luminance: (raw * 0.35).min(HUE_BOOST_LUMINANCE_CAP),
        };
        match i {
            0 => hsl.red = channel,
            1 => hsl.orange = channel,
            2 => hsl.yellow = channel,
            3 => hsl.green = channel,
            4 => hsl.aqua = channel,
            5 => hsl.blue = channel,
            6 => hsl.purple = channel,
            _ => hsl.magenta = channel,
        }
    }
    hsl
}

/// Analyzes a reference photo and derives an `Edits` set that pushes the current
/// photo's white balance, exposure, contrast, overall saturation, grain, and
/// shadow/midtone/highlight brightness toward the reference's — plus a boost to
/// whichever specific colors the reference has more of, applied only to matching-hue
/// pixels in the current photo rather than as a tint over the whole image. Geometry
/// (rotation/flip/crop) is left at its default — the caller merges this onto the
/// current edits the same way applying a preset does, which keeps whatever geometry
/// is already set.
pub fn match_style(
    app: &tauri::AppHandle,
    current_path: &str,
    reference_path: &str,
) -> Result<Edits, String> {
    let current = io::load_working_copy(app, current_path, GRAIN_STATS_MAX_DIM)?;
    let reference = io::load_working_copy(app, reference_path, GRAIN_STATS_MAX_DIM)?;

    let cur = compute_stats(&current);
    let refs = compute_stats(&reference);

    let exposure = (refs.mean_lum.max(1e-4) / cur.mean_lum.max(1e-4))
        .log2()
        .clamp(-5.0, 5.0);
    let contrast = ((refs.std_lum / cur.std_lum.max(1e-4) - 1.0) * 100.0).clamp(-100.0, 100.0);

    // A reference with essentially no color of its own can't supply a white balance or
    // saturation target — and crushing saturation via the slider would be self-defeating
    // anyway, since the B&W mixer converts to grayscale using each pixel's *original*
    // hue/saturation to weight it, so that has to stay intact for the mixer to do anything.
    let is_reference_grayscale = refs.mean_chroma < GRAYSCALE_CHROMA_THRESHOLD;

    let (temperature, tint, saturation, bw_mixer) = if is_reference_grayscale {
        (
            0.0,
            0.0,
            0.0,
            BwMixer {
                enabled: true,
                ..BwMixer::default()
            },
        )
    } else {
        // White balance: color-balance deltas with the shared luminance component
        // removed first, so a brighter/darker reference doesn't get read as a color cast.
        let cur_dev = (
            cur.mean_r - cur.mean_lum,
            cur.mean_g - cur.mean_lum,
            cur.mean_b - cur.mean_lum,
        );
        let ref_dev = (
            refs.mean_r - refs.mean_lum,
            refs.mean_g - refs.mean_lum,
            refs.mean_b - refs.mean_lum,
        );
        let dr = ref_dev.0 - cur_dev.0;
        let dg = ref_dev.1 - cur_dev.1;
        let db = ref_dev.2 - cur_dev.2;

        // Inverts the exact white-balance formula in `apply_edits`: r += temp*0.30 - tint*0.10,
        // g += tint*0.20, b += -temp*0.30 - tint*0.10 (tint's r/b contribution cancels in dr-db).
        let temperature = ((dr - db) / 0.6 * 100.0).clamp(-100.0, 100.0);
        let tint = (dg / 0.2 * 100.0).clamp(-100.0, 100.0);
        let saturation = ((refs.mean_chroma / cur.mean_chroma.max(1e-4) - 1.0) * 100.0)
            .clamp(-SATURATION_CAP, SATURATION_CAP);

        (temperature, tint, saturation, BwMixer::default())
    };

    // A grayscale reference has ~zero hue_presence everywhere (near-neutral pixels are
    // excluded from the measurement), so this naturally comes out all-neutral there
    // too — no separate branch needed.
    let hsl = derive_hue_boost(&refs.hue_presence, &cur.hue_presence);

    let shadow_confidence =
        (refs.shadow_weight.min(cur.shadow_weight) / FULL_CONFIDENCE_COVERAGE).clamp(0.0, 1.0);
    let midtone_confidence =
        (refs.midtone_weight.min(cur.midtone_weight) / FULL_CONFIDENCE_COVERAGE).clamp(0.0, 1.0);
    let highlight_confidence = (refs.highlight_weight.min(cur.highlight_weight)
        / FULL_CONFIDENCE_COVERAGE)
        .clamp(0.0, 1.0);

    let color_grading = ColorGrading {
        shadows: HslChannel {
            hue: 0.0,
            saturation: 0.0,
            luminance: derive_band_luminance(refs.shadow_mean, cur.shadow_mean, shadow_confidence),
        },
        midtones: HslChannel {
            hue: 0.0,
            saturation: 0.0,
            luminance: derive_band_luminance(
                refs.midtone_mean,
                cur.midtone_mean,
                midtone_confidence,
            ),
        },
        highlights: HslChannel {
            hue: 0.0,
            saturation: 0.0,
            luminance: derive_band_luminance(
                refs.highlight_mean,
                cur.highlight_mean,
                highlight_confidence,
            ),
        },
    };

    // Grain: only ever add what the reference has *more* of than the current photo
    // already carries — there's no "remove grain" lever here, so a cleaner reference
    // just leaves the current photo's own grain alone rather than fighting it.
    let grain_delta = estimate_grain_score(&reference) - estimate_grain_score(&current);
    let grain = (grain_delta.max(0.0) * GRAIN_SCALE).clamp(0.0, 100.0);

    Ok(Edits {
        exposure,
        contrast,
        temperature,
        tint,
        saturation,
        hsl,
        color_grading,
        bw_mixer,
        grain,
        ..Edits::default()
    })
}
