import type {
  CameraState,
  DrawElement,
  HandState,
  ImageDrawElement,
  StrokeDrawElement,
  TextDrawElement,
  WhiteboardScene,
} from '../types/whiteboard';
import type { WhiteboardAssets } from './handMatte';
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  PANORAMA_WIDTH,
  clamp,
  computeElementProgress,
  computeHandState,
  computeImagePlacementState,
  computePanoramicCameraState,
  easeInOutCubic,
  lerp,
  polylineLength,
} from './timing';

export interface StaticLayerCache {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  camX: number;
  camY: number;
  camZoom: number;
  staticKey: string;
}

export interface RenderOptions {
  time: number;
  activeScene: WhiteboardScene;
  allElements: DrawElement[];
  assets: WhiteboardAssets | null;
  pageScrollEnabled: boolean;
  /** Reusable cache of measured text widths keyed by element id */
  textWidths: Record<string, number>;
  /** Optional static-prefix cache for ultra-fast video export */
  layerCache?: StaticLayerCache;
}

function getCanvasFont(el: TextDrawElement): string {
  const weight = el.fontWeight ?? (el.fontFamily === 'hand' ? '700' : '600');
  const family =
    el.fontFamily === 'hand'
      ? "'Aref Ruqaa', 'Cairo', serif"
      : "'Cairo', system-ui, sans-serif";
  return `${weight} ${el.fontSize}px ${family}`;
}

let cachedBackdrop: HTMLCanvasElement | null = null;

function drawWhiteboardBackdrop(ctx: CanvasRenderingContext2D): void {
  if (!cachedBackdrop) {
    const off = document.createElement('canvas');
    off.width = BOARD_WIDTH;
    off.height = BOARD_HEIGHT;
    const bctx = off.getContext('2d');
    if (bctx) {
      const bgGrad = bctx.createRadialGradient(
        BOARD_WIDTH * 0.48,
        BOARD_HEIGHT * 0.42,
        120,
        BOARD_WIDTH * 0.5,
        BOARD_HEIGHT * 0.5,
        BOARD_WIDTH * 0.72
      );
      bgGrad.addColorStop(0, '#FFFFFF');
      bgGrad.addColorStop(0.65, '#FAFBFD');
      bgGrad.addColorStop(1, '#EFF2F6');
      bctx.fillStyle = bgGrad;
      bctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

      const sheen = bctx.createLinearGradient(0, 0, BOARD_WIDTH * 0.8, BOARD_HEIGHT * 0.75);
      sheen.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
      sheen.addColorStop(0.35, 'rgba(255, 255, 255, 0.08)');
      sheen.addColorStop(1, 'rgba(226, 232, 240, 0.14)');
      bctx.fillStyle = sheen;
      bctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

      bctx.strokeStyle = 'rgba(15, 23, 42, 0.06)';
      bctx.lineWidth = 8;
      bctx.strokeRect(4, 4, BOARD_WIDTH - 8, BOARD_HEIGHT - 8);
      cachedBackdrop = off;
    }
  }

  if (cachedBackdrop) {
    ctx.drawImage(cachedBackdrop, 0, 0);
  }
}

/**
 * Draws subtle vertical enamel panel seams on the continuous 9600px panoramic board
 * so scrolling across bays feels like panning across one real wide physical whiteboard.
 */
function drawPanoramicSeams(ctx: CanvasRenderingContext2D, viewLeft: number, viewRight: number): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
  ctx.setLineDash([10, 14]);
  ctx.lineWidth = 2;
  for (let x = BOARD_WIDTH; x < PANORAMA_WIDTH; x += BOARD_WIDTH) {
    if (x >= viewLeft - 40 && x <= viewRight + 40) {
      ctx.beginPath();
      ctx.moveTo(x, 60);
      ctx.lineTo(x, BOARD_HEIGHT - 60);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawProgressiveImage(
  ctx: CanvasRenderingContext2D,
  el: ImageDrawElement,
  progress: number,
  assets: WhiteboardAssets | null
): void {
  if (progress <= 0 || !assets) return;
  const ill = assets.illustrations[el.imageKey];
  if (!ill) return;

  const placement = computeImagePlacementState(el, progress);
  const cx = placement.cardX + el.width / 2;
  const cy = placement.cardY + el.height / 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(placement.cardRotationRad);
  ctx.scale(placement.cardScale, placement.cardScale);

  // Tactile card lift shadow while held by the two fingers, settling flat onto the board
  const shadowAlpha = 0.08 + placement.cardLift * 0.16;
  ctx.shadowColor = `rgba(15, 23, 42, ${shadowAlpha.toFixed(2)})`;
  ctx.shadowBlur = 10 + placement.cardLift * 20;
  ctx.shadowOffsetX = 4 + placement.cardLift * 14;
  ctx.shadowOffsetY = 6 + placement.cardLift * 18;

  // Crisp rounded whiteboard sticker-card backing
  const r = 12;
  const hw = el.width / 2;
  const hh = el.height / 2;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.roundRect(-hw, -hh, el.width, el.height, r);
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(-hw + 4, -hh + 4, el.width - 8, el.height - 8, r - 2);
  ctx.clip();
  ctx.drawImage(ill.canvas, -hw + 4, -hh + 4, el.width - 8, el.height - 8);
  ctx.restore();

  // Hairline ink border around placed illustration
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.16)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(-hw, -hh, el.width, el.height, r);
  ctx.stroke();

  ctx.restore();
}

function drawProgressiveStroke(
  ctx: CanvasRenderingContext2D,
  el: StrokeDrawElement,
  progress: number
): void {
  const pts = el.points;
  if (pts.length < 2 || progress <= 0) return;

  const totalLen = polylineLength(pts);
  const targetLen = totalLen * clamp(progress, 0, 1);

  if (el.closed && el.fillAfter && progress > 0.85) {
    const fillAlpha = clamp((progress - 0.85) / 0.15, 0, 1);
    ctx.save();
    ctx.globalAlpha *= fillAlpha;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = el.fillAfter;
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.strokeStyle = el.color;
  ctx.lineWidth = el.lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (el.dashed) {
    ctx.setLineDash([el.lineWidth * 2.2, el.lineWidth * 2.1]);
  }

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);

  let walked = 0;
  let tipX = pts[0].x;
  let tipY = pts[0].y;

  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    const segLen = Math.hypot(dx, dy);

    if (walked + segLen <= targetLen || progress >= 1) {
      ctx.lineTo(pts[i].x, pts[i].y);
      walked += segLen;
      tipX = pts[i].x;
      tipY = pts[i].y;
    } else {
      const remain = Math.max(0, targetLen - walked);
      const t = segLen > 0.0001 ? remain / segLen : 0;
      tipX = lerp(pts[i - 1].x, pts[i].x, t);
      tipY = lerp(pts[i - 1].y, pts[i].y, t);
      ctx.lineTo(tipX, tipY);
      break;
    }
  }

  ctx.shadowColor = el.color;
  ctx.shadowBlur = 0.6;
  ctx.stroke();

  if (progress > 0 && progress < 1) {
    ctx.setLineDash([]);
    ctx.fillStyle = el.color;
    ctx.beginPath();
    ctx.arc(tipX, tipY, el.lineWidth * 0.58, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawProgressiveText(
  ctx: CanvasRenderingContext2D,
  el: TextDrawElement,
  progress: number,
  textWidths: Record<string, number>
): void {
  if (progress <= 0) return;

  ctx.save();
  ctx.font = getCanvasFont(el);
  ctx.direction = 'rtl';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = el.align;

  const measured = ctx.measureText(el.text).width;
  const width = Math.max(24, measured || el.estimatedWidth);
  textWidths[el.id] = width;

  let rightEdge = el.x;
  if (el.align === 'center') {
    rightEdge = el.x + width / 2;
  } else if (el.align === 'left') {
    rightEdge = el.x + width;
  }
  const leftEdge = rightEdge - width;

  if (el.highlightBox && progress > 0.05) {
    const boxAlpha = clamp(progress * 1.4, 0, 1);
    const padX = 16;
    const padTop = el.fontSize * 0.92;
    const padBot = el.fontSize * 0.34;
    const currentLeft = lerp(rightEdge + padX, leftEdge - padX, progress);
    ctx.save();
    ctx.globalAlpha *= boxAlpha;
    ctx.fillStyle = el.highlightBox;
    ctx.beginPath();
    ctx.roundRect(
      currentLeft,
      el.y - padTop,
      Math.max(0, rightEdge + padX - currentLeft),
      padTop + padBot,
      10
    );
    ctx.fill();
    ctx.restore();
  }

  if (progress < 1) {
    const revealLeft = lerp(rightEdge + 10, leftEdge - 14, progress);
    ctx.save();
    ctx.beginPath();
    ctx.rect(
      revealLeft,
      el.y - el.fontSize * 1.45,
      rightEdge + 24 - revealLeft,
      el.fontSize * 2.1
    );
    ctx.clip();
    ctx.fillStyle = el.color;
    ctx.fillText(el.text, el.x, el.y);
    ctx.restore();
  } else {
    ctx.fillStyle = el.color;
    ctx.fillText(el.text, el.x, el.y);
  }

  if (el.underline && progress > 0.72) {
    const uProg = easeInOutCubic((progress - 0.72) / 0.28);
    const uEnd = lerp(rightEdge, leftEdge, uProg);
    ctx.strokeStyle = el.color;
    ctx.lineWidth = Math.max(3, el.fontSize * 0.075);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(rightEdge, el.y + el.fontSize * 0.24);
    ctx.quadraticCurveTo(
      (rightEdge + uEnd) / 2,
      el.y + el.fontSize * 0.29,
      uEnd,
      el.y + el.fontSize * 0.24
    );
    ctx.stroke();
  }

  ctx.restore();
}

function drawPhotorealisticHand(
  ctx: CanvasRenderingContext2D,
  hand: HandState,
  assets: WhiteboardAssets | null
): void {
  if (!hand.visible || !assets) return;

  const sprite =
    hand.pose === 'pinch'
      ? assets.pinchHand
      : assets.markerHands[hand.activeColor] ?? assets.markerHands['#111827'];

  if (!sprite) return;

  // Scaled cleanly (~550px full hand+wrist height) so the ENTIRE hand, thumb, fingers, and wrist stay visible
  const baseScale = hand.pose === 'pinch' ? 0.76 : 0.70;
  const liftScale = 1 + hand.lift * 0.035;
  const scale = baseScale * liftScale;

  ctx.save();
  ctx.translate(hand.x, hand.y);
  ctx.rotate(hand.angle);

  const shadowAlpha = clamp(0.26 - hand.lift * 0.09, 0.12, 0.28);
  ctx.shadowColor = `rgba(15, 23, 42, ${shadowAlpha.toFixed(2)})`;
  ctx.shadowBlur = 16 + hand.lift * 18;
  ctx.shadowOffsetX = 12 + hand.lift * 22;
  ctx.shadowOffsetY = 16 + hand.lift * 26;

  ctx.drawImage(
    sprite.canvas,
    -sprite.tipX * scale,
    -sprite.tipY * scale,
    sprite.width * scale,
    sprite.height * scale
  );

  // Subtle wet marker ink nib highlight at exact contact point when drawing
  if (hand.pose === 'writing' && hand.isDrawing) {
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = hand.activeColor;
    ctx.globalAlpha = 0.78;
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function createStaticLayerCache(width: number, height: number): StaticLayerCache {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return {
    canvas,
    width,
    height,
    camX: Number.NaN,
    camY: Number.NaN,
    camZoom: Number.NaN,
    staticKey: '',
  };
}

function isElementInView(el: DrawElement, viewLeft: number, viewRight: number): boolean {
  if (el.kind === 'image') {
    return !(el.x + el.width + 400 < viewLeft || el.x - 100 > viewRight);
  }
  if (el.kind === 'text') {
    return !(el.x + 200 < viewLeft || el.x - el.estimatedWidth - 200 > viewRight);
  }
  let minX = Infinity;
  let maxX = -Infinity;
  for (let j = 0; j < el.points.length; j++) {
    if (el.points[j].x < minX) minX = el.points[j].x;
    if (el.points[j].x > maxX) maxX = el.points[j].x;
  }
  return !(maxX < viewLeft || minX > viewRight);
}

function drawElementAtProgress(
  ctx: CanvasRenderingContext2D,
  el: DrawElement,
  progress: number,
  assets: WhiteboardAssets | null,
  textWidths: Record<string, number>
): void {
  if (el.kind === 'image') {
    drawProgressiveImage(ctx, el, progress, assets);
  } else if (el.kind === 'text') {
    drawProgressiveText(ctx, el, progress, textWidths);
  } else {
    drawProgressiveStroke(ctx, el, progress);
  }
}

export function renderWhiteboardFrame(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  options: RenderOptions
): { camera: CameraState; hand: HandState } {
  const { time, activeScene, allElements, assets, pageScrollEnabled, textWidths, layerCache } =
    options;

  const scaleX = canvasWidth / BOARD_WIDTH;
  const scaleY = canvasHeight / BOARD_HEIGHT;
  const camera = computePanoramicCameraState(activeScene, time, pageScrollEnabled);
  const viewHalfW = BOARD_WIDTH / (2 * camera.zoom);
  const viewLeft = camera.x - viewHalfW - 420;
  const viewRight = camera.x + viewHalfW + 420;

  if (layerCache) {
    if (layerCache.width !== canvasWidth || layerCache.height !== canvasHeight) {
      layerCache.canvas.width = canvasWidth;
      layerCache.canvas.height = canvasHeight;
      layerCache.width = canvasWidth;
      layerCache.height = canvasHeight;
      layerCache.staticKey = '__invalid__';
    }

    // Collect contiguous completed visible elements before any in-progress element (preserves exact z-order)
    const visibleStatic: DrawElement[] = [];
    const visibleDynamic: Array<{ el: DrawElement; progress: number }> = [];
    let prefixOpen = true;
    let staticSig = '';

    for (let i = 0; i < allElements.length; i++) {
      const el = allElements[i];
      const progress = computeElementProgress(el, time);
      if (progress <= 0) continue;
      if (!isElementInView(el, viewLeft, viewRight)) continue;

      if (prefixOpen && progress >= 1) {
        visibleStatic.push(el);
        staticSig += el.id + '|';
      } else {
        prefixOpen = false;
        visibleDynamic.push({ el, progress });
      }
    }

    const camMatches =
      Math.abs(layerCache.camX - camera.x) < 0.01 &&
      Math.abs(layerCache.camY - camera.y) < 0.01 &&
      Math.abs(layerCache.camZoom - camera.zoom) < 0.0001;

    if (!camMatches || layerCache.staticKey !== staticSig) {
      const sctx = layerCache.canvas.getContext('2d');
      if (sctx) {
        sctx.save();
        sctx.scale(scaleX, scaleY);
        drawWhiteboardBackdrop(sctx);
        sctx.translate(BOARD_WIDTH / 2, BOARD_HEIGHT / 2);
        sctx.scale(camera.zoom, camera.zoom);
        sctx.translate(-camera.x, -camera.y);
        drawPanoramicSeams(sctx, viewLeft, viewRight);
        for (let i = 0; i < visibleStatic.length; i++) {
          drawElementAtProgress(sctx, visibleStatic[i], 1, assets, textWidths);
        }
        sctx.restore();
      }
      layerCache.camX = camera.x;
      layerCache.camY = camera.y;
      layerCache.camZoom = camera.zoom;
      layerCache.staticKey = staticSig;
    }

    // Blit cached static background + completed elements in <0.2ms
    ctx.drawImage(layerCache.canvas, 0, 0);

    ctx.save();
    ctx.scale(scaleX, scaleY);
    ctx.translate(BOARD_WIDTH / 2, BOARD_HEIGHT / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    for (let i = 0; i < visibleDynamic.length; i++) {
      const item = visibleDynamic[i];
      drawElementAtProgress(ctx, item.el, item.progress, assets, textWidths);
    }

    const hand = computeHandState(allElements, activeScene, time, textWidths);
    drawPhotorealisticHand(ctx, hand, assets);
    ctx.restore();

    return { camera, hand };
  }

  ctx.save();
  ctx.scale(scaleX, scaleY);

  // 1. Physical whiteboard surface
  drawWhiteboardBackdrop(ctx);

  // 2. Camera positioning across unified panoramic board (moves only when page fills up)
  ctx.save();
  ctx.translate(BOARD_WIDTH / 2, BOARD_HEIGHT / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  // Subtle panoramic bay seam lines
  drawPanoramicSeams(ctx, viewLeft, viewRight);

  // 3. Draw all elements inside or overlapping the current panoramic viewport
  for (let i = 0; i < allElements.length; i++) {
    const el = allElements[i];
    const progress = computeElementProgress(el, time);
    if (progress <= 0) continue;
    if (!isElementInView(el, viewLeft, viewRight)) continue;
    drawElementAtProgress(ctx, el, progress, assets, textWidths);
  }

  // 4. Full photorealistic hand (either colored marker writing grip OR two-finger open placement pose)
  const hand = computeHandState(allElements, activeScene, time, textWidths);
  drawPhotorealisticHand(ctx, hand, assets);

  ctx.restore();
  ctx.restore();

  return { camera, hand };
}
