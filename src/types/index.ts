export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HslChannel {
  hue: number;
  saturation: number;
  luminance: number;
}

export interface HslAdjustments {
  red: HslChannel;
  orange: HslChannel;
  yellow: HslChannel;
  green: HslChannel;
  aqua: HslChannel;
  blue: HslChannel;
  purple: HslChannel;
  magenta: HslChannel;
}

export interface ColorGrading {
  shadows: HslChannel;
  midtones: HslChannel;
  highlights: HslChannel;
}

export interface CurvePoint {
  x: number;
  y: number;
}

export interface ToneCurve {
  rgb: CurvePoint[];
  red: CurvePoint[];
  green: CurvePoint[];
  blue: CurvePoint[];
}

export interface BwMixer {
  enabled: boolean;
  red: number;
  orange: number;
  yellow: number;
  green: number;
  aqua: number;
  blue: number;
  purple: number;
  magenta: number;
}

export interface Edits {
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  temperature: number;
  tint: number;
  saturation: number;
  vibrance: number;
  sharpening: number;
  vignette: number;
  fade: number;
  clarity: number;
  texture: number;
  dehaze: number;
  bloom: number;
  halation: number;
  softness: number;
  lensDistortion: number;
  chromaticAberration: number;
  grain: number;
  grainSize: number;
  grainRoughness: number;
  noise: number;
  hsl: HslAdjustments;
  colorGrading: ColorGrading;
  toneCurve: ToneCurve;
  bwMixer: BwMixer;
  rotate90: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
  crop: CropRect | null;
}

export const DEFAULT_HSL_CHANNEL: HslChannel = { hue: 0, saturation: 0, luminance: 0 };

export const DEFAULT_HSL_ADJUSTMENTS: HslAdjustments = {
  red: { ...DEFAULT_HSL_CHANNEL },
  orange: { ...DEFAULT_HSL_CHANNEL },
  yellow: { ...DEFAULT_HSL_CHANNEL },
  green: { ...DEFAULT_HSL_CHANNEL },
  aqua: { ...DEFAULT_HSL_CHANNEL },
  blue: { ...DEFAULT_HSL_CHANNEL },
  purple: { ...DEFAULT_HSL_CHANNEL },
  magenta: { ...DEFAULT_HSL_CHANNEL },
};

export const DEFAULT_COLOR_GRADING: ColorGrading = {
  shadows: { ...DEFAULT_HSL_CHANNEL },
  midtones: { ...DEFAULT_HSL_CHANNEL },
  highlights: { ...DEFAULT_HSL_CHANNEL },
};

export function identityCurve(): CurvePoint[] {
  return [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ];
}

export const DEFAULT_TONE_CURVE: ToneCurve = {
  rgb: identityCurve(),
  red: identityCurve(),
  green: identityCurve(),
  blue: identityCurve(),
};

export const DEFAULT_BW_MIXER: BwMixer = {
  enabled: false,
  red: 0,
  orange: 0,
  yellow: 0,
  green: 0,
  aqua: 0,
  blue: 0,
  purple: 0,
  magenta: 0,
};

export const DEFAULT_EDITS: Edits = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  temperature: 0,
  tint: 0,
  saturation: 0,
  vibrance: 0,
  sharpening: 0,
  vignette: 0,
  fade: 0,
  clarity: 0,
  texture: 0,
  dehaze: 0,
  bloom: 0,
  halation: 0,
  softness: 0,
  lensDistortion: 0,
  chromaticAberration: 0,
  grain: 0,
  grainSize: 25,
  grainRoughness: 50,
  noise: 0,
  hsl: { ...DEFAULT_HSL_ADJUSTMENTS },
  colorGrading: { ...DEFAULT_COLOR_GRADING },
  toneCurve: { rgb: identityCurve(), red: identityCurve(), green: identityCurve(), blue: identityCurve() },
  bwMixer: { ...DEFAULT_BW_MIXER },
  rotate90: 0,
  flipHorizontal: false,
  flipVertical: false,
  crop: null,
};

export interface Histogram {
  r: number[];
  g: number[];
  b: number[];
  luminance: number[];
}

export interface PreviewResponse {
  preview: string;
  histogram: Histogram;
}

export interface ImageEntry {
  path: string;
  name: string;
  width: number;
  height: number;
  thumbnail: string;
  /** The last edits saved for this photo, if any, restored when it's reopened. */
  edits: Edits | null;
}

export type PresetSource = "default" | "user";

export interface Preset {
  id: string;
  name: string;
  edits: Edits;
  source: PresetSource;
  tags: string[];
  favorite: boolean;
}

export type GalleryViewMode = "square" | "full";

export type ExportFormat = "jpeg" | "png" | "tiff" | "webp";
