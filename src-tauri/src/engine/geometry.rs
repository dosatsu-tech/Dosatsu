use super::{CropRect, Edits};
use image::{imageops, RgbImage};

pub fn apply_geometry(src: &RgbImage, edits: &Edits) -> RgbImage {
    let mut out = match edits.rotate90 % 4 {
        1 => imageops::rotate90(src),
        2 => imageops::rotate180(src),
        3 => imageops::rotate270(src),
        _ => src.clone(),
    };

    if edits.flip_horizontal {
        out = imageops::flip_horizontal(&out);
    }
    if edits.flip_vertical {
        out = imageops::flip_vertical(&out);
    }

    if let Some(crop) = &edits.crop {
        out = crop_normalized(&out, crop);
    }

    out
}

fn crop_normalized(img: &RgbImage, crop: &CropRect) -> RgbImage {
    let (width, height) = img.dimensions();
    let x = (crop.x.clamp(0.0, 1.0) * width as f32) as u32;
    let y = (crop.y.clamp(0.0, 1.0) * height as f32) as u32;
    let w = ((crop.w.clamp(0.0, 1.0)) * width as f32).max(1.0) as u32;
    let h = ((crop.h.clamp(0.0, 1.0)) * height as f32).max(1.0) as u32;

    let w = w.min(width.saturating_sub(x)).max(1);
    let h = h.min(height.saturating_sub(y)).max(1);

    imageops::crop_imm(img, x, y, w, h).to_image()
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgb;

    fn gradient_image(width: u32, height: u32) -> RgbImage {
        let mut img = RgbImage::new(width, height);
        for y in 0..height {
            for x in 0..width {
                img.put_pixel(x, y, Rgb([(x * 10) as u8, (y * 10) as u8, 0]));
            }
        }
        img
    }

    // Asserting an exact pixel mapping would just be re-encoding `image::imageops`'s
    // own rotation convention (clockwise vs counter-clockwise) into the test, so
    // these check the direction-agnostic properties that actually matter: four
    // quarter-turns is a no-op, and dimensions swap correctly for odd turns.
    #[test]
    fn rotate90_four_times_returns_to_original() {
        let img = gradient_image(3, 2);
        let edits = Edits {
            rotate90: 1,
            ..Edits::default()
        };
        let mut current = img.clone();
        for _ in 0..4 {
            current = apply_geometry(&current, &edits);
        }
        assert_eq!(current, img);
    }

    #[test]
    fn rotate90_swaps_dimensions() {
        let img = gradient_image(4, 2);
        let edits = Edits {
            rotate90: 1,
            ..Edits::default()
        };
        let out = apply_geometry(&img, &edits);
        assert_eq!(out.dimensions(), (2, 4));
    }

    #[test]
    fn rotate180_keeps_dimensions() {
        let img = gradient_image(4, 2);
        let edits = Edits {
            rotate90: 2,
            ..Edits::default()
        };
        let out = apply_geometry(&img, &edits);
        assert_eq!(out.dimensions(), (4, 2));
    }

    #[test]
    fn flip_horizontal_twice_returns_to_original() {
        let img = gradient_image(3, 3);
        let edits = Edits {
            flip_horizontal: true,
            ..Edits::default()
        };
        let once = apply_geometry(&img, &edits);
        let twice = apply_geometry(&once, &edits);
        assert_eq!(twice, img);
    }

    #[test]
    fn flip_vertical_twice_returns_to_original() {
        let img = gradient_image(3, 3);
        let edits = Edits {
            flip_vertical: true,
            ..Edits::default()
        };
        let once = apply_geometry(&img, &edits);
        let twice = apply_geometry(&once, &edits);
        assert_eq!(twice, img);
    }

    #[test]
    fn no_geometry_edits_is_noop() {
        let img = gradient_image(4, 4);
        let out = apply_geometry(&img, &Edits::default());
        assert_eq!(out, img);
    }

    #[test]
    fn crop_normalized_extracts_expected_region() {
        let img = gradient_image(4, 4);
        let crop = CropRect {
            x: 0.25,
            y: 0.25,
            w: 0.5,
            h: 0.5,
        };
        let edits = Edits {
            crop: Some(crop),
            ..Edits::default()
        };
        let out = apply_geometry(&img, &edits);

        assert_eq!(out.dimensions(), (2, 2));
        assert_eq!(*out.get_pixel(0, 0), *img.get_pixel(1, 1));
        assert_eq!(*out.get_pixel(1, 1), *img.get_pixel(2, 2));
    }

    #[test]
    fn crop_normalized_clamps_to_image_bounds() {
        let img = gradient_image(4, 4);
        // x=0.75 -> pixel column 3; a 0.8-wide request would run off the right
        // edge, so it should clamp down to the single column that's left.
        let crop = CropRect {
            x: 0.75,
            y: 0.0,
            w: 0.8,
            h: 1.0,
        };
        let edits = Edits {
            crop: Some(crop),
            ..Edits::default()
        };
        let out = apply_geometry(&img, &edits);

        assert_eq!(out.dimensions(), (1, 4));
    }
}
