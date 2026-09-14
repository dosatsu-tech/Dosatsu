use image::RgbImage;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Histogram {
    pub r: Vec<u32>,
    pub g: Vec<u32>,
    pub b: Vec<u32>,
    pub luminance: Vec<u32>,
}

/// Builds a 256-bin histogram per channel plus luminance from a rendered image.
pub fn compute_histogram(img: &RgbImage) -> Histogram {
    let mut r = vec![0u32; 256];
    let mut g = vec![0u32; 256];
    let mut b = vec![0u32; 256];
    let mut luminance = vec![0u32; 256];

    for pixel in img.pixels() {
        let [pr, pg, pb] = pixel.0;
        r[pr as usize] += 1;
        g[pg as usize] += 1;
        b[pb as usize] += 1;
        let lum = (0.2126 * pr as f32 + 0.7152 * pg as f32 + 0.0722 * pb as f32).round() as usize;
        luminance[lum.min(255)] += 1;
    }

    Histogram { r, g, b, luminance }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgb;

    #[test]
    fn every_bin_has_256_entries() {
        let img = RgbImage::new(2, 2);
        let hist = compute_histogram(&img);
        assert_eq!(hist.r.len(), 256);
        assert_eq!(hist.g.len(), 256);
        assert_eq!(hist.b.len(), 256);
        assert_eq!(hist.luminance.len(), 256);
    }

    #[test]
    fn solid_color_image_spikes_one_bin_per_channel() {
        let img = RgbImage::from_pixel(5, 4, Rgb([10, 200, 50]));
        let hist = compute_histogram(&img);
        let pixel_count = 5 * 4;

        assert_eq!(hist.r[10], pixel_count);
        assert_eq!(hist.r.iter().sum::<u32>(), pixel_count);
        assert_eq!(hist.g[200], pixel_count);
        assert_eq!(hist.b[50], pixel_count);
    }

    #[test]
    fn black_and_white_pixels_land_at_luminance_extremes() {
        let mut img = RgbImage::new(2, 1);
        img.put_pixel(0, 0, Rgb([0, 0, 0]));
        img.put_pixel(1, 0, Rgb([255, 255, 255]));
        let hist = compute_histogram(&img);

        assert_eq!(hist.luminance[0], 1);
        assert_eq!(hist.luminance[255], 1);
    }
}
