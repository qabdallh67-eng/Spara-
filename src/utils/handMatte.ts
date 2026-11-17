import type { HandPose, IllustrationKey } from '../types/whiteboard';

export interface ProcessedHandSprite {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  tipX: number;
  tipY: number;
}

export interface ProcessedIllustration {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

export interface WhiteboardAssets {
  /** Colored marker variants keyed by normalized hex color */
  markerHands: Record<string, ProcessedHandSprite>;
  /** Full uncropped two-finger pinching hand for placing AI illustrations */
  pinchHand: ProcessedHandSprite;
  /** AI-generated whiteboard educational illustrations */
  illustrations: Record<IllustrationKey, ProcessedIllustration>;
}

export const HAND_FULL_URL = '/src/assets/images/whiteboard_hand_full_1794913591987.jpg';
export const HAND_PINCH_URL = '/src/assets/images/whiteboard_hand_place_1794918385734.jpg';

export const ILLUSTRATION_URLS: Record<IllustrationKey, string> = {
  egypt_1952: '/src/assets/images/illus_egypt_1952_1794913594100.jpg',
  farouk_palace: '/src/assets/images/illus_farouk_palace_1794913592542.jpg',
  social_crisis: '/src/assets/images/illus_social_crisis_1794913595218.jpg',
  canal_struggle: '/src/assets/images/illus_canal_struggle_1794913594976.jpg',
  officers_club: '/src/assets/images/illus_officers_club_1794913594757.jpg',
  cairo_fire: '/src/assets/images/illus_cairo_fire_1794913594770.jpg',
  free_officers: '/src/assets/images/illus_free_officers_1794913595488.jpg',
  july23_radio: '/src/assets/images/illus_july23_radio_1794913597208.jpg',
  royal_abdication: '/src/assets/images/illus_royal_abdication_1794917349562.jpg',
  evacuation_1954: '/src/assets/images/illus_evacuation_1954_1794917350909.jpg',
  high_dam: '/src/assets/images/illus_high_dam_1794917350595.jpg',
  suez_nationalization: '/src/assets/images/illus_suez_nationalization_1794917352342.jpg',
  agrarian_reform: '/src/assets/images/illus_agrarian_reform_1794917353424.jpg',
  women_education: '/src/assets/images/illus_women_education_1794917352443.jpg',
  republic_summary: '/src/assets/images/illus_republic_summary_1794917352833.jpg',
};

const MARKER_COLORS = ['#111827', '#C81E1E', '#1D4ED8', '#047857', '#B45309', '#475569'];

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const n = parseInt(clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Removes pure studio white background using edge-seeded BFS flood fill so
 * internal highlights (nails, white marker barrel, eyes) remain 100% opaque.
 */
function matteHandSprite(
  img: HTMLImageElement,
  pose: HandPose,
  targetSize = 768
): ProcessedHandSprite {
  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return {
      canvas,
      width: targetSize,
      height: targetSize,
      tipX: targetSize * 0.25,
      tipY: targetSize * 0.34,
    };
  }

  ctx.drawImage(img, 0, 0, targetSize, targetSize);
  const imageData = ctx.getImageData(0, 0, targetSize, targetSize);
  const data = imageData.data;
  const totalPixels = targetSize * targetSize;
  const visited = new Uint8Array(totalPixels);
  const isBg = new Uint8Array(totalPixels);

  const isStudioWhite = (idx4: number): boolean => {
    const r = data[idx4];
    const g = data[idx4 + 1];
    const b = data[idx4 + 2];
    const minC = Math.min(r, g, b);
    const maxC = Math.max(r, g, b);
    return minC >= 218 && maxC - minC <= 22;
  };

  const queue = new Int32Array(totalPixels);
  let head = 0;
  let tail = 0;

  const tryEnqueue = (x: number, y: number) => {
    if (x < 0 || x >= targetSize || y < 0 || y >= targetSize) return;
    const p = y * targetSize + x;
    if (visited[p]) return;
    visited[p] = 1;
    if (isStudioWhite(p * 4)) {
      isBg[p] = 1;
      queue[tail++] = p;
    }
  };

  for (let x = 0; x < targetSize; x++) {
    tryEnqueue(x, 0);
    if (x < targetSize * 0.6) tryEnqueue(x, targetSize - 1);
  }
  for (let y = 0; y < targetSize; y++) {
    tryEnqueue(0, y);
    if (y < targetSize * 0.72) tryEnqueue(targetSize - 1, y);
  }

  while (head < tail) {
    const p = queue[head++];
    const x = p % targetSize;
    const y = (p - x) / targetSize;
    tryEnqueue(x + 1, y);
    tryEnqueue(x - 1, y);
    tryEnqueue(x, y + 1);
    tryEnqueue(x, y - 1);
  }

  for (let p = 0; p < totalPixels; p++) {
    const idx4 = p * 4;
    if (isBg[p]) {
      data[idx4 + 3] = 0;
    } else {
      const x = p % targetSize;
      const y = (p - x) / targetSize;
      let bgNeighbors = 0;
      if (x > 0 && isBg[p - 1]) bgNeighbors++;
      if (x < targetSize - 1 && isBg[p + 1]) bgNeighbors++;
      if (y > 0 && isBg[p - targetSize]) bgNeighbors++;
      if (y < targetSize - 1 && isBg[p + targetSize]) bgNeighbors++;
      if (bgNeighbors > 0) {
        const lum = (data[idx4] + data[idx4 + 1] + data[idx4 + 2]) / 3;
        const edgeAlpha = lum > 205 ? Math.max(0.18, 1 - (lum - 205) / 48) : 0.88;
        data[idx4 + 3] = Math.round(edgeAlpha * 255);
      }

      // Soft studio depth falloff along the bottom/right forearm entry edge
      // so the forearm never shows a sharp horizontal photo cutoff mid-board
      const yNorm = y / targetSize;
      const xNorm = x / targetSize;
      if (yNorm > 0.88 || xNorm > 0.91) {
        const yFade = yNorm > 0.88 ? Math.max(0, 1 - (yNorm - 0.88) / 0.12) : 1;
        const xFade = xNorm > 0.91 ? Math.max(0, 1 - (xNorm - 0.91) / 0.09) : 1;
        const smoothFade = Math.min(yFade, xFade);
        data[idx4 + 3] = Math.round(data[idx4 + 3] * (smoothFade * smoothFade * (3 - 2 * smoothFade)));
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);

  // Calibrate exact anchor point:
  // - For writing hand: leftmost dark marker nib pixel in upper-left quadrant
  // - For two-finger placement hand: pads of the two extended index/middle fingertips (upper quadrant)
  let minX = targetSize;
  let sumY = 0;
  let count = 0;
  const maxScanX = Math.floor(targetSize * 0.52);
  const minScanY = pose === 'pinch' ? Math.floor(targetSize * 0.10) : Math.floor(targetSize * 0.16);
  const maxScanY = pose === 'pinch' ? Math.floor(targetSize * 0.34) : Math.floor(targetSize * 0.56);

  for (let y = minScanY; y < maxScanY; y++) {
    for (let x = 20; x < maxScanX; x++) {
      const idx4 = (y * targetSize + x) * 4;
      const a = data[idx4 + 3];
      if (a > 195) {
        if (pose === 'writing') {
          const lum = (data[idx4] + data[idx4 + 1] + data[idx4 + 2]) / 3;
          if (lum > 110) continue;
        }
        if (x < minX) {
          minX = x;
          sumY = y;
          count = 1;
        } else if (x <= minX + 6) {
          sumY += y;
          count++;
        }
        break;
      }
    }
  }

  const tipX = count > 0 ? minX + (pose === 'pinch' ? 28 : 2) : targetSize * 0.28;
  const tipY = count > 0 ? sumY / count + (pose === 'pinch' ? 6 : 0) : targetSize * 0.36;

  return { canvas, width: targetSize, height: targetSize, tipX, tipY };
}

/**
 * Generates a realistic colored marker variant (Red, Blue, Green, Amber)
 * by tinting the neutral black cap, barrel band, and felt nib of the EXPO marker
 * while keeping the human skin, fingernails, and wristwatch untouched.
 */
function createColoredMarkerVariant(
  base: ProcessedHandSprite,
  hexColor: string
): ProcessedHandSprite {
  if (hexColor.toUpperCase() === '#111827') {
    return base;
  }

  const canvas = document.createElement('canvas');
  canvas.width = base.width;
  canvas.height = base.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return base;

  ctx.drawImage(base.canvas, 0, 0);
  const imgData = ctx.getImageData(0, 0, base.width, base.height);
  const d = imgData.data;
  const [tr, tg, tb] = hexToRgb(hexColor);

  // Marker shaft spans roughly x: [0.18..0.68]*w, y: [0.24..0.60]*h (well above wristwatch)
  const minX = Math.floor(base.width * 0.16);
  const maxX = Math.floor(base.width * 0.68);
  const minY = Math.floor(base.height * 0.22);
  const maxY = Math.floor(base.height * 0.60);

  for (let y = minY; y < maxY; y++) {
    for (let x = minX; x < maxX; x++) {
      const idx4 = (y * base.width + x) * 4;
      const a = d[idx4 + 3];
      if (a < 80) continue;

      const r = d[idx4];
      const g = d[idx4 + 1];
      const b = d[idx4 + 2];
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const chroma = maxC - minC;
      const lum = (r + g + b) / 3;

      // Neutral dark pixels inside marker zone (cap, ink label band, felt tip)
      // Exclude warm skin tones where R - B >= 16
      if (lum < 118 && chroma <= 22 && r - b < 15) {
        // Preserve plastic specular highlights using luminance lift factor
        const shade = 0.55 + (lum / 118) * 0.65;
        d[idx4] = Math.min(255, Math.round(tr * shade));
        d[idx4 + 1] = Math.min(255, Math.round(tg * shade));
        d[idx4 + 2] = Math.min(255, Math.round(tb * shade));
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return {
    canvas,
    width: base.width,
    height: base.height,
    tipX: base.tipX,
    tipY: base.tipY,
  };
}

/**
 * Crops any thin outer edge frame (4% inset, or 17% top crop for republic_summary)
 * and prepares a crisp whiteboard illustration card.
 */
function processIllustration(img: HTMLImageElement, key: IllustrationKey): ProcessedIllustration {
  const cropRatio = 0.04;
  const topCropRatio = key === 'republic_summary' ? 0.175 : cropRatio;
  const sx = Math.round(img.width * cropRatio);
  const sy = Math.round(img.height * topCropRatio);
  const sw = Math.round(img.width * (1 - cropRatio * 2));
  const sh = Math.round(img.height * (1 - topCropRatio - cropRatio));

  const outW = 640;
  const outH = Math.round((sh / Math.max(1, sw)) * outW);
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
  }
  return { canvas, width: outW, height: outH };
}

let cachedAssetsPromise: Promise<WhiteboardAssets> | null = null;

export function loadWhiteboardAssets(): Promise<WhiteboardAssets> {
  if (cachedAssetsPromise) return cachedAssetsPromise;

  const keys = Object.keys(ILLUSTRATION_URLS) as IllustrationKey[];
  cachedAssetsPromise = Promise.all([
    loadImage(HAND_FULL_URL).then((img) => matteHandSprite(img, 'writing', 768)),
    loadImage(HAND_PINCH_URL).then((img) => matteHandSprite(img, 'pinch', 768)),
    ...keys.map((k) =>
      loadImage(ILLUSTRATION_URLS[k]).then((img) => [k, processIllustration(img, k)] as const)
    ),
  ]).then(([baseMarkerHand, pinchHand, ...illusPairs]) => {
    const markerHands: Record<string, ProcessedHandSprite> = {};
    for (const hex of MARKER_COLORS) {
      markerHands[hex] = createColoredMarkerVariant(baseMarkerHand, hex);
    }

    const illustrations = {} as Record<IllustrationKey, ProcessedIllustration>;
    for (const [k, v] of illusPairs) {
      illustrations[k] = v;
    }

    return { markerHands, pinchHand, illustrations };
  });

  return cachedAssetsPromise;
}
