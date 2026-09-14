use super::{BwMixer, ColorGrading, CurvePoint, Edits, HslAdjustments, HslChannel, ToneCurve};
use image::{imageops, ImageBuffer, Luma, Rgb, RgbImage};
use rand::Rng;
use rayon::prelude::*;

/// Applies the full edit pipeline to an RGB image and returns a new image.
/// Order mirrors a typical raw-processing pipeline: white balance, exposure,
/// tone (contrast/highlights/shadows/whites/blacks), color (saturation/vibrance),
/// tone curve, HSL, black & white mixer, color grading, then local/lens effects
/// (sharpening, softness, bloom, halation, lens distortion, chromatic aberration,
/// vignette, grain, noise).
pub fn apply_edits(src: &RgbImage, edits: &Edits) -> RgbImage {
    let (width, height) = src.dimensions();
    let mut out = src.clone();

    let contrast_factor = contrast_factor(edits.contrast);
    let temp = edits.temperature / 100.0;
    let tint = edits.tint / 100.0;
    let exposure_mul = 2f32.powf(edits.exposure);
    let sat = 1.0 + edits.saturation / 100.0;
    let vib = edits.vibrance / 100.0;
    let fade = edits.fade / 100.0;
    let dehaze = (edits.dehaze / 100.0).clamp(-1.0, 1.0);

    out.as_flat_samples_mut()
        .samples
        .par_chunks_mut(3)
        .for_each(|px| {
            let mut r = px[0] as f32 / 255.0;
            let mut g = px[1] as f32 / 255.0;
            let mut b = px[2] as f32 / 255.0;

            // White balance (temperature / tint)
            r += temp * 0.30;
            b -= temp * 0.30;
            g += tint * 0.20;
            r -= tint * 0.10;
            b -= tint * 0.10;

            // Exposure
            r *= exposure_mul;
            g *= exposure_mul;
            b *= exposure_mul;

            // Tone: highlights / shadows / whites / blacks based on luminance mask
            let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            let highlight_mask = smoothstep(0.5, 1.0, lum);
            let shadow_mask = 1.0 - smoothstep(0.0, 0.5, lum);
            let white_mask = smoothstep(0.75, 1.0, lum);
            let black_mask = 1.0 - smoothstep(0.0, 0.25, lum);

            let highlight_adj = edits.highlights / 100.0 * highlight_mask * 0.6;
            let shadow_adj = edits.shadows / 100.0 * shadow_mask * 0.6;
            let white_adj = edits.whites / 100.0 * white_mask * 0.4;
            let black_adj = edits.blacks / 100.0 * black_mask * 0.4;
            let tone_delta = highlight_adj + shadow_adj + white_adj + black_adj;

            r += tone_delta;
            g += tone_delta;
            b += tone_delta;

            // Contrast around mid-gray
            r = (r - 0.5) * contrast_factor + 0.5;
            g = (g - 0.5) * contrast_factor + 0.5;
            b = (b - 0.5) * contrast_factor + 0.5;

            // Dehaze: negative lifts blacks + desaturates for a washed/hazy film veil,
            // positive stretches contrast (dark channel-style haze removal, simplified).
            if dehaze != 0.0 {
                let veil = (-dehaze).max(0.0) * 0.25;
                r = r * (1.0 - veil) + veil;
                g = g * (1.0 - veil) + veil;
                b = b * (1.0 - veil) + veil;

                let stretch = 1.0 + dehaze.max(0.0) * 0.5;
                r = (r - 0.5) * stretch + 0.5;
                g = (g - 0.5) * stretch + 0.5;
                b = (b - 0.5) * stretch + 0.5;
            }

            // Saturation / vibrance (via HSL-ish luminance blend)
            let l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            let current_sat = ((r - l).abs() + (g - l).abs() + (b - l).abs()) / 3.0;
            let vib_boost = vib * (1.0 - current_sat).max(0.0);
            let total_sat = (sat + vib_boost + dehaze * 0.3).max(0.0);
            r = l + (r - l) * total_sat;
            g = l + (g - l) * total_sat;
            b = l + (b - l) * total_sat;

            // Fade: raise the black point toward a light gray for a vintage matte look.
            if fade > 0.0 {
                let lift = fade * 0.18;
                r = lift + r * (1.0 - lift);
                g = lift + g * (1.0 - lift);
                b = lift + b * (1.0 - lift);
            }

            px[0] = to_u8(r);
            px[1] = to_u8(g);
            px[2] = to_u8(b);
        });

    if !is_tone_curve_identity(&edits.tone_curve) {
        apply_tone_curve(&mut out, &edits.tone_curve);
    }

    if has_hsl_adjustments(&edits.hsl) {
        apply_hsl(&mut out, &edits.hsl);
    }

    if edits.bw_mixer.enabled {
        apply_bw_mixer(&mut out, &edits.bw_mixer);
    }

    if has_color_grading(&edits.color_grading) {
        apply_color_grading(&mut out, &edits.color_grading);
    }

    if edits.clarity != 0.0 {
        apply_local_contrast(&mut out, edits.clarity / 100.0, 18.0, true);
    }

    if edits.texture != 0.0 {
        apply_local_contrast(&mut out, edits.texture / 100.0, 3.0, false);
    }

    if edits.sharpening > 0.0 {
        out = sharpen(&out, edits.sharpening / 100.0);
    }

    if edits.softness > 0.0 {
        apply_softness(&mut out, edits.softness / 100.0);
    }

    if edits.bloom > 0.0 {
        apply_bloom(&mut out, edits.bloom / 100.0);
    }

    if edits.halation > 0.0 {
        apply_halation(&mut out, edits.halation / 100.0);
    }

    if edits.lens_distortion != 0.0 {
        apply_lens_distortion(&mut out, edits.lens_distortion / 100.0, width, height);
    }

    if edits.chromatic_aberration > 0.0 {
        apply_chromatic_aberration(&mut out, edits.chromatic_aberration / 100.0, width, height);
    }

    if edits.vignette != 0.0 {
        apply_vignette(&mut out, edits.vignette / 100.0, width, height);
    }

    if edits.grain > 0.0 {
        apply_grain(
            &mut out,
            edits.grain / 100.0,
            edits.grain_size / 100.0,
            edits.grain_roughness / 100.0,
            width,
            height,
        );
    }

    if edits.noise > 0.0 {
        apply_noise(&mut out, edits.noise / 100.0);
    }

    out
}

fn contrast_factor(contrast: f32) -> f32 {
    let c = contrast.clamp(-100.0, 100.0) / 100.0;
    (1.0 + c).max(0.0)
}

pub(crate) fn smoothstep(edge0: f32, edge1: f32, x: f32) -> f32 {
    let t = ((x - edge0) / (edge1 - edge0)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

fn to_u8(v: f32) -> u8 {
    (v.clamp(0.0, 1.0) * 255.0).round() as u8
}

fn sharpen(src: &RgbImage, amount: f32) -> RgbImage {
    let blurred = imageops::blur(src, 1.5);
    let mut out = src.clone();

    out.as_flat_samples_mut()
        .samples
        .par_chunks_mut(3)
        .zip(blurred.as_flat_samples().samples.par_chunks(3))
        .for_each(|(px, bpx)| {
            for i in 0..3 {
                let original = px[i] as f32;
                let blur = bpx[i] as f32;
                let sharpened = original + (original - blur) * amount * 2.0;
                px[i] = sharpened.clamp(0.0, 255.0) as u8;
            }
        });

    out
}

fn apply_local_contrast(img: &mut RgbImage, amount: f32, radius: f32, midtone_only: bool) {
    let blurred = imageops::blur(&*img, radius);

    img.as_flat_samples_mut()
        .samples
        .par_chunks_mut(3)
        .zip(blurred.as_flat_samples().samples.par_chunks(3))
        .for_each(|(px, bpx)| {
            let r = px[0] as f32 / 255.0;
            let g = px[1] as f32 / 255.0;
            let b = px[2] as f32 / 255.0;
            let br = bpx[0] as f32 / 255.0;
            let bg = bpx[1] as f32 / 255.0;
            let bb = bpx[2] as f32 / 255.0;

            let mask = if midtone_only {
                let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                (1.0 - (lum - 0.5).abs() * 2.0).max(0.0)
            } else {
                1.0
            };

            let factor = amount * 1.6 * mask;
            px[0] = to_u8(r + (r - br) * factor);
            px[1] = to_u8(g + (g - bg) * factor);
            px[2] = to_u8(b + (b - bb) * factor);
        });
}

fn apply_bloom(img: &mut RgbImage, amount: f32) {
    let (width, height) = img.dimensions();
    const THRESHOLD: f32 = 0.7;

    let mut bright: RgbImage = ImageBuffer::new(width, height);
    for (x, y, px) in img.enumerate_pixels() {
        let r = px.0[0] as f32 / 255.0;
        let g = px.0[1] as f32 / 255.0;
        let b = px.0[2] as f32 / 255.0;
        let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        let boost = ((lum - THRESHOLD) / (1.0 - THRESHOLD)).clamp(0.0, 1.0);
        bright.put_pixel(
            x,
            y,
            Rgb([to_u8(r * boost), to_u8(g * boost), to_u8(b * boost)]),
        );
    }
    let glow = imageops::blur(&bright, 14.0);

    img.as_flat_samples_mut()
        .samples
        .par_chunks_mut(3)
        .zip(glow.as_flat_samples().samples.par_chunks(3))
        .for_each(|(px, gpx)| {
            for c in 0..3 {
                let orig = px[c] as f32 / 255.0;
                let glow_v = gpx[c] as f32 / 255.0 * amount * 0.9;
                px[c] = to_u8(orig + glow_v);
            }
        });
}

fn apply_halation(img: &mut RgbImage, amount: f32) {
    let (width, height) = img.dimensions();
    const THRESHOLD: f32 = 0.85;

    let mut bright: ImageBuffer<Luma<u8>, Vec<u8>> = ImageBuffer::new(width, height);
    for (x, y, px) in img.enumerate_pixels() {
        let r = px.0[0] as f32 / 255.0;
        let g = px.0[1] as f32 / 255.0;
        let b = px.0[2] as f32 / 255.0;
        let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        let boost = ((lum - THRESHOLD) / (1.0 - THRESHOLD)).clamp(0.0, 1.0);
        bright.put_pixel(x, y, Luma([to_u8(boost)]));
    }
    let glow = imageops::blur(&bright, 9.0);

    img.as_flat_samples_mut()
        .samples
        .par_chunks_mut(3)
        .zip(glow.as_flat_samples().samples.par_chunks(1))
        .for_each(|(px, gpx)| {
            let g = gpx[0] as f32 / 255.0 * amount;
            px[0] = to_u8(px[0] as f32 / 255.0 + g * 0.9);
            px[1] = to_u8(px[1] as f32 / 255.0 + g * 0.35);
            px[2] = to_u8(px[2] as f32 / 255.0 + g * 0.05);
        });
}

fn apply_vignette(img: &mut RgbImage, strength: f32, width: u32, height: u32) {
    let cx = width as f32 / 2.0;
    let cy = height as f32 / 2.0;
    let max_dist = (cx * cx + cy * cy).sqrt();

    for y in 0..height {
        for x in 0..width {
            let dx = x as f32 - cx;
            let dy = y as f32 - cy;
            let dist = (dx * dx + dy * dy).sqrt() / max_dist;
            let falloff = smoothstep(0.3, 1.1, dist) * strength;
            let px = img.get_pixel_mut(x, y);
            for c in 0..3 {
                let v = px.0[c] as f32 / 255.0;
                let adjusted = if strength >= 0.0 {
                    v * (1.0 - falloff.max(0.0))
                } else {
                    v + (1.0 - v) * (-falloff).max(0.0)
                };
                px.0[c] = to_u8(adjusted);
            }
        }
    }
}

fn apply_grain(
    img: &mut RgbImage,
    amount: f32,
    size: f32,
    roughness: f32,
    width: u32,
    height: u32,
) {
    if amount <= 0.0 || width == 0 || height == 0 {
        return;
    }

    let mut rng = rand::rng();
    let mut raw: ImageBuffer<Luma<u8>, Vec<u8>> = ImageBuffer::new(width, height);
    for px in raw.pixels_mut() {
        px.0[0] = rng.random::<u8>();
    }

    let blur_radius = 0.4 + size.clamp(0.0, 1.0) * 2.6;
    let smoothed = imageops::blur(&raw, blur_radius);

    let roughness = roughness.clamp(0.0, 1.0);
    let strength = amount.clamp(0.0, 1.0) * 0.35;

    for y in 0..height {
        for x in 0..width {
            let raw_v = raw.get_pixel(x, y).0[0] as f32 / 255.0 - 0.5;
            let smooth_v = smoothed.get_pixel(x, y).0[0] as f32 / 255.0 - 0.5;
            let noise = smooth_v * (1.0 - roughness) + raw_v * roughness;
            let delta = noise * strength;

            let px = img.get_pixel_mut(x, y);
            for c in 0..3 {
                let v = px.0[c] as f32 / 255.0 + delta;
                px.0[c] = to_u8(v);
            }
        }
    }
}

fn apply_noise(img: &mut RgbImage, amount: f32) {
    if amount <= 0.0 {
        return;
    }
    let mut rng = rand::rng();
    let strength = amount.clamp(0.0, 1.0) * 0.22;

    for px in img.pixels_mut() {
        let lum =
            (0.2126 * px.0[0] as f32 + 0.7152 * px.0[1] as f32 + 0.0722 * px.0[2] as f32) / 255.0;
        let shadow_boost = 1.6 - lum * 1.1;
        let luminance_noise = (rng.random::<f32>() - 0.5) * strength * shadow_boost;

        for c in 0..3 {
            let chroma_noise = (rng.random::<f32>() - 0.5) * strength * shadow_boost * 0.4;
            let v = px.0[c] as f32 / 255.0 + luminance_noise + chroma_noise;
            px.0[c] = to_u8(v);
        }
    }
}

fn apply_softness(img: &mut RgbImage, amount: f32) {
    if amount <= 0.0 {
        return;
    }
    let blurred = imageops::blur(&*img, 2.0 + amount * 6.0);

    img.as_flat_samples_mut()
        .samples
        .par_chunks_mut(3)
        .zip(blurred.as_flat_samples().samples.par_chunks(3))
        .for_each(|(px, bpx)| {
            let lum =
                (0.2126 * px[0] as f32 + 0.7152 * px[1] as f32 + 0.0722 * px[2] as f32) / 255.0;
            let weight = (0.3 + lum * 0.7) * amount;
            for c in 0..3 {
                let orig = px[c] as f32;
                let blur = bpx[c] as f32;
                px[c] = (orig * (1.0 - weight) + blur * weight)
                    .round()
                    .clamp(0.0, 255.0) as u8;
            }
        });
}

fn bilinear_rgb(img: &RgbImage, x: f32, y: f32, width: u32, height: u32) -> [f32; 3] {
    let x = x.clamp(0.0, width as f32 - 1.0);
    let y = y.clamp(0.0, height as f32 - 1.0);
    let x0 = x.floor() as u32;
    let y0 = y.floor() as u32;
    let x1 = (x0 + 1).min(width - 1);
    let y1 = (y0 + 1).min(height - 1);
    let fx = x - x0 as f32;
    let fy = y - y0 as f32;

    let p00 = img.get_pixel(x0, y0);
    let p10 = img.get_pixel(x1, y0);
    let p01 = img.get_pixel(x0, y1);
    let p11 = img.get_pixel(x1, y1);

    let mut out = [0.0f32; 3];
    for (c, o) in out.iter_mut().enumerate() {
        let top = p00.0[c] as f32 * (1.0 - fx) + p10.0[c] as f32 * fx;
        let bottom = p01.0[c] as f32 * (1.0 - fx) + p11.0[c] as f32 * fx;
        *o = top * (1.0 - fy) + bottom * fy;
    }
    out
}

fn apply_lens_distortion(img: &mut RgbImage, amount: f32, width: u32, height: u32) {
    if amount == 0.0 || width == 0 || height == 0 {
        return;
    }
    let src = img.clone();
    let cx = width as f32 / 2.0;
    let cy = height as f32 / 2.0;
    let max_r = (cx * cx + cy * cy).sqrt().max(1.0);
    let k = amount.clamp(-1.0, 1.0) * 0.6;

    for y in 0..height {
        for x in 0..width {
            let dx = x as f32 - cx;
            let dy = y as f32 - cy;
            let r_out = (dx * dx + dy * dy).sqrt() / max_r;
            let factor = 1.0 + k * r_out * r_out;

            let src_x = cx + dx * factor;
            let src_y = cy + dy * factor;

            let sample = if src_x < 0.0
                || src_y < 0.0
                || src_x > width as f32 - 1.0
                || src_y > height as f32 - 1.0
            {
                [0.0, 0.0, 0.0]
            } else {
                bilinear_rgb(&src, src_x, src_y, width, height)
            };

            let px = img.get_pixel_mut(x, y);
            px.0[0] = sample[0].round().clamp(0.0, 255.0) as u8;
            px.0[1] = sample[1].round().clamp(0.0, 255.0) as u8;
            px.0[2] = sample[2].round().clamp(0.0, 255.0) as u8;
        }
    }
}

fn apply_chromatic_aberration(img: &mut RgbImage, amount: f32, width: u32, height: u32) {
    if amount <= 0.0 || width == 0 || height == 0 {
        return;
    }
    let src = img.clone();
    let cx = width as f32 / 2.0;
    let cy = height as f32 / 2.0;
    let max_dist = (cx * cx + cy * cy).sqrt().max(1.0);
    let max_shift = amount.clamp(0.0, 1.0) * (width.max(height) as f32) * 0.012;

    for y in 0..height {
        for x in 0..width {
            let dx = x as f32 - cx;
            let dy = y as f32 - cy;
            let dist = (dx * dx + dy * dy).sqrt();
            let (nx, ny) = if dist > 0.5 {
                (dx / dist, dy / dist)
            } else {
                (0.0, 0.0)
            };
            let shift = max_shift * (dist / max_dist).powi(2);

            let r = bilinear_rgb(
                &src,
                x as f32 + nx * shift,
                y as f32 + ny * shift,
                width,
                height,
            )[0];
            let g = src.get_pixel(x, y).0[1] as f32;
            let b = bilinear_rgb(
                &src,
                x as f32 - nx * shift,
                y as f32 - ny * shift,
                width,
                height,
            )[2];

            let px = img.get_pixel_mut(x, y);
            px.0[0] = r.round().clamp(0.0, 255.0) as u8;
            px.0[1] = g.round().clamp(0.0, 255.0) as u8;
            px.0[2] = b.round().clamp(0.0, 255.0) as u8;
        }
    }
}

fn has_hsl_adjustments(hsl: &HslAdjustments) -> bool {
    [
        hsl.red,
        hsl.orange,
        hsl.yellow,
        hsl.green,
        hsl.aqua,
        hsl.blue,
        hsl.purple,
        hsl.magenta,
    ]
    .iter()
    .any(|c| c.hue != 0.0 || c.saturation != 0.0 || c.luminance != 0.0)
}

fn has_color_grading(grading: &ColorGrading) -> bool {
    [grading.shadows, grading.midtones, grading.highlights]
        .iter()
        .any(|c| c.saturation != 0.0 || c.luminance != 0.0)
}

fn is_channel_curve_identity(points: &[CurvePoint]) -> bool {
    points.len() <= 2
        && points.iter().all(|p| (p.x - p.y).abs() < 1e-4)
        && points.first().map(|p| p.x <= 1e-4).unwrap_or(true)
        && points.last().map(|p| p.x >= 1.0 - 1e-4).unwrap_or(true)
}

fn is_tone_curve_identity(curve: &ToneCurve) -> bool {
    [&curve.rgb, &curve.red, &curve.green, &curve.blue]
        .iter()
        .all(|points| is_channel_curve_identity(points))
}

fn build_curve_lut(points: &[CurvePoint]) -> [f32; 256] {
    let mut lut = [0.0f32; 256];

    let mut pts: Vec<(f32, f32)> = points
        .iter()
        .map(|p| (p.x.clamp(0.0, 1.0), p.y.clamp(0.0, 1.0)))
        .collect();
    pts.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
    pts.dedup_by(|a, b| (a.0 - b.0).abs() < 1e-6);

    if pts.len() < 2 {
        for (i, v) in lut.iter_mut().enumerate() {
            *v = i as f32 / 255.0;
        }
        return lut;
    }

    let n = pts.len();
    let mut secants = vec![0.0f32; n - 1];
    for i in 0..n - 1 {
        let dx = pts[i + 1].0 - pts[i].0;
        secants[i] = if dx.abs() < 1e-6 {
            0.0
        } else {
            (pts[i + 1].1 - pts[i].1) / dx
        };
    }

    let mut tangents = vec![0.0f32; n];
    tangents[0] = secants[0];
    tangents[n - 1] = secants[n - 2];
    for i in 1..n - 1 {
        tangents[i] = if secants[i - 1] * secants[i] <= 0.0 {
            0.0
        } else {
            (secants[i - 1] + secants[i]) / 2.0
        };
    }
    // Constrain tangents so the interpolant stays monotonic between each pair of points.
    for i in 0..n - 1 {
        if secants[i] == 0.0 {
            tangents[i] = 0.0;
            tangents[i + 1] = 0.0;
            continue;
        }
        let a = tangents[i] / secants[i];
        let b = tangents[i + 1] / secants[i];
        let s = a * a + b * b;
        if s > 9.0 {
            let t = 3.0 / s.sqrt();
            tangents[i] = t * a * secants[i];
            tangents[i + 1] = t * b * secants[i];
        }
    }

    for (i, v) in lut.iter_mut().enumerate() {
        let x = i as f32 / 255.0;
        let y = if x <= pts[0].0 {
            pts[0].1
        } else if x >= pts[n - 1].0 {
            pts[n - 1].1
        } else {
            let seg = pts
                .windows(2)
                .position(|w| x >= w[0].0 && x <= w[1].0)
                .unwrap();
            let (x0, y0) = pts[seg];
            let (x1, y1) = pts[seg + 1];
            let h = x1 - x0;
            let t = (x - x0) / h;
            let t2 = t * t;
            let t3 = t2 * t;
            let h00 = 2.0 * t3 - 3.0 * t2 + 1.0;
            let h10 = t3 - 2.0 * t2 + t;
            let h01 = -2.0 * t3 + 3.0 * t2;
            let h11 = t3 - t2;
            h00 * y0 + h10 * h * tangents[seg] + h01 * y1 + h11 * h * tangents[seg + 1]
        };
        *v = y.clamp(0.0, 1.0);
    }

    lut
}

fn lut_index(v: f32) -> usize {
    (v.clamp(0.0, 1.0) * 255.0).round() as usize
}

fn apply_tone_curve(img: &mut RgbImage, curve: &ToneCurve) {
    let rgb_lut = build_curve_lut(&curve.rgb);
    let red_lut = build_curve_lut(&curve.red);
    let green_lut = build_curve_lut(&curve.green);
    let blue_lut = build_curve_lut(&curve.blue);

    img.as_flat_samples_mut()
        .samples
        .par_chunks_mut(3)
        .for_each(|px| {
            let r = rgb_lut[px[0] as usize];
            let g = rgb_lut[px[1] as usize];
            let b = rgb_lut[px[2] as usize];
            px[0] = to_u8(red_lut[lut_index(r)]);
            px[1] = to_u8(green_lut[lut_index(g)]);
            px[2] = to_u8(blue_lut[lut_index(b)]);
        });
}

fn apply_bw_mixer(img: &mut RgbImage, mixer: &BwMixer) {
    const HALF_WIDTH: f32 = 45.0;
    let channels: [(f32, f32); 8] = [
        (0.0, mixer.red),
        (30.0, mixer.orange),
        (60.0, mixer.yellow),
        (120.0, mixer.green),
        (180.0, mixer.aqua),
        (240.0, mixer.blue),
        (275.0, mixer.purple),
        (315.0, mixer.magenta),
    ];

    img.as_flat_samples_mut()
        .samples
        .par_chunks_mut(3)
        .for_each(|px| {
            let r = px[0] as f32 / 255.0;
            let g = px[1] as f32 / 255.0;
            let b = px[2] as f32 / 255.0;

            let base_lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            let (h, s, _l) = rgb_to_hsl(r, g, b);

            let mut shift = 0.0;
            if s > 0.0001 {
                for (center, weight) in channels.iter() {
                    if *weight == 0.0 {
                        continue;
                    }
                    let w = hue_weight(h, *center, HALF_WIDTH) * s;
                    shift += w * (weight / 100.0) * 0.5;
                }
            }

            let gray = to_u8(base_lum + shift);
            px[0] = gray;
            px[1] = gray;
            px[2] = gray;
        });
}

fn apply_hsl(img: &mut RgbImage, hsl: &HslAdjustments) {
    const HALF_WIDTH: f32 = 45.0;
    let channels: [(f32, HslChannel); 8] = [
        (0.0, hsl.red),
        (30.0, hsl.orange),
        (60.0, hsl.yellow),
        (120.0, hsl.green),
        (180.0, hsl.aqua),
        (240.0, hsl.blue),
        (275.0, hsl.purple),
        (315.0, hsl.magenta),
    ];

    img.as_flat_samples_mut()
        .samples
        .par_chunks_mut(3)
        .for_each(|px| {
            let r = px[0] as f32 / 255.0;
            let g = px[1] as f32 / 255.0;
            let b = px[2] as f32 / 255.0;

            let (h, s, l) = rgb_to_hsl(r, g, b);
            if s <= 0.0001 {
                return;
            }

            let mut hue_shift = 0.0;
            let mut sat_shift = 0.0;
            let mut lum_shift = 0.0;
            for (center, channel) in channels.iter() {
                let w = hue_weight(h, *center, HALF_WIDTH);
                if w <= 0.0 {
                    continue;
                }
                hue_shift += w * channel.hue;
                sat_shift += w * channel.saturation;
                lum_shift += w * channel.luminance;
            }

            let new_h = h + hue_shift * 0.4; // -100..100 -> roughly -40..40 degrees
            let new_s = (s * (1.0 + sat_shift / 100.0)).clamp(0.0, 1.0);
            let new_l = (l + lum_shift / 100.0 * 0.5).clamp(0.0, 1.0);

            let (nr, ng, nb) = hsl_to_rgb(new_h, new_s, new_l);
            px[0] = to_u8(nr);
            px[1] = to_u8(ng);
            px[2] = to_u8(nb);
        });
}

fn apply_color_grading(img: &mut RgbImage, grading: &ColorGrading) {
    let shadow_tint = hsl_to_rgb(
        grading.shadows.hue,
        (grading.shadows.saturation / 100.0).clamp(0.0, 1.0),
        0.5,
    );
    let midtone_tint = hsl_to_rgb(
        grading.midtones.hue,
        (grading.midtones.saturation / 100.0).clamp(0.0, 1.0),
        0.5,
    );
    let highlight_tint = hsl_to_rgb(
        grading.highlights.hue,
        (grading.highlights.saturation / 100.0).clamp(0.0, 1.0),
        0.5,
    );

    img.as_flat_samples_mut()
        .samples
        .par_chunks_mut(3)
        .for_each(|px| {
            let mut r = px[0] as f32 / 255.0;
            let mut g = px[1] as f32 / 255.0;
            let mut b = px[2] as f32 / 255.0;

            let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            let shadow_mask = 1.0 - smoothstep(0.0, 0.5, lum);
            let highlight_mask = smoothstep(0.5, 1.0, lum);
            let midtone_mask = (1.0 - shadow_mask - highlight_mask).max(0.0);

            for &(mask, tint, lum_shift) in &[
                (shadow_mask, shadow_tint, grading.shadows.luminance),
                (midtone_mask, midtone_tint, grading.midtones.luminance),
                (highlight_mask, highlight_tint, grading.highlights.luminance),
            ] {
                if mask <= 0.0 {
                    continue;
                }
                let strength = mask * 0.5;
                r += (tint.0 - 0.5) * strength;
                g += (tint.1 - 0.5) * strength;
                b += (tint.2 - 0.5) * strength;

                let l_delta = mask * lum_shift / 100.0 * 0.5;
                r += l_delta;
                g += l_delta;
                b += l_delta;
            }

            px[0] = to_u8(r);
            px[1] = to_u8(g);
            px[2] = to_u8(b);
        });
}

pub(crate) fn rgb_to_hsl(r: f32, g: f32, b: f32) -> (f32, f32, f32) {
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let l = (max + min) / 2.0;
    let d = max - min;
    if d < 1e-6 {
        return (0.0, 0.0, l);
    }

    let s = if l > 0.5 {
        d / (2.0 - max - min)
    } else {
        d / (max + min)
    };
    let mut h = if max == r {
        60.0 * (((g - b) / d) % 6.0)
    } else if max == g {
        60.0 * ((b - r) / d + 2.0)
    } else {
        60.0 * ((r - g) / d + 4.0)
    };
    if h < 0.0 {
        h += 360.0;
    }
    (h, s, l)
}

fn hsl_to_rgb(h: f32, s: f32, l: f32) -> (f32, f32, f32) {
    if s <= 0.0 {
        return (l, l, l);
    }
    let c = (1.0 - (2.0 * l - 1.0).abs()) * s;
    let hp = h.rem_euclid(360.0) / 60.0;
    let x = c * (1.0 - (hp % 2.0 - 1.0).abs());
    let m = l - c / 2.0;
    let (r1, g1, b1) = match hp as i32 {
        0 => (c, x, 0.0),
        1 => (x, c, 0.0),
        2 => (0.0, c, x),
        3 => (0.0, x, c),
        4 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };
    (r1 + m, g1 + m, b1 + m)
}

pub(crate) fn hue_weight(hue: f32, center: f32, half_width: f32) -> f32 {
    let mut d = (hue - center).abs();
    if d > 180.0 {
        d = 360.0 - d;
    }
    if d >= half_width {
        return 0.0;
    }
    let t = 1.0 - d / half_width;
    t * t * (3.0 - 2.0 * t)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn smoothstep_clamps_outside_the_edges() {
        assert_eq!(smoothstep(0.0, 1.0, -1.0), 0.0);
        assert_eq!(smoothstep(0.0, 1.0, 2.0), 1.0);
    }

    #[test]
    fn smoothstep_is_half_at_the_midpoint() {
        assert_eq!(smoothstep(0.0, 1.0, 0.5), 0.5);
    }

    #[test]
    fn contrast_factor_is_neutral_at_zero() {
        assert_eq!(contrast_factor(0.0), 1.0);
    }

    #[test]
    fn contrast_factor_never_goes_negative() {
        assert_eq!(contrast_factor(-500.0), 0.0);
    }

    #[test]
    fn to_u8_clamps_and_scales() {
        assert_eq!(to_u8(0.0), 0);
        assert_eq!(to_u8(1.0), 255);
        assert_eq!(to_u8(-1.0), 0);
        assert_eq!(to_u8(2.0), 255);
    }

    #[test]
    fn hue_weight_peaks_at_the_center() {
        assert_eq!(hue_weight(30.0, 30.0, 20.0), 1.0);
    }

    #[test]
    fn hue_weight_wraps_across_0_360() {
        // 358deg and 10deg are really 12deg apart going through 0/360, not 348deg
        // apart the naive (unwrapped) distance would wrongly put this outside a
        // 20deg half-width and return 0.
        assert!(hue_weight(358.0, 10.0, 20.0) > 0.0);
        assert_eq!(hue_weight(358.0, 10.0, 20.0), hue_weight(10.0, 358.0, 20.0));
    }

    #[test]
    fn hue_weight_is_zero_past_the_half_width() {
        assert_eq!(hue_weight(180.0, 30.0, 20.0), 0.0);
        // Exactly at the half-width (350 <-> 10 wraps to precisely 20deg apart).
        assert_eq!(hue_weight(350.0, 10.0, 20.0), 0.0);
    }

    /// A fully-default `Edits` should leave the image completely untouched, every
    /// effect in the pipeline is gated behind a "this differs from neutral" check.
    /// If a future effect misses that gate, this is the test that catches it.
    #[test]
    fn apply_edits_with_default_edits_is_a_noop() {
        let img = RgbImage::from_pixel(6, 6, Rgb([80, 140, 200]));
        let out = apply_edits(&img, &Edits::default());
        assert_eq!(out, img);
    }
}
