import type {
  CameraKeyframe,
  CameraState,
  DrawElement,
  HandPose,
  HandState,
  ImageDrawElement,
  NarrationCue,
  Point,
  WhiteboardScene,
} from '../types/whiteboard';

export const BOARD_WIDTH = 1920;
export const BOARD_HEIGHT = 1080;
export const PANORAMA_BAYS = 9;
export const PANORAMA_WIDTH = BOARD_WIDTH * PANORAMA_BAYS; // 17280px continuous board
export const AUDIO_DURATION = 831.10;
export const AUDIO_URL = `${import.meta.env.BASE_URL}assets/aistudio/audio-3696319e-c167-4675-88b6-6b34e8455625_cfa0ca08.mp3`;

/**
 * Global panoramic camera keyframes across 9 connected RTL bays (B1 right -> B9 left):
 * Stays 100% steady on each board bay until that bay fills up,
 * then pans smoothly across the linking arrow to the next bay.
 */
export const PANORAMA_CAMERA_KEYFRAMES: CameraKeyframe[] = [
  { time: 0, x: 16320, y: 540, zoom: 1.0 },     // Bay 1 (Intro + Politics)
  { time: 90.30, x: 16320, y: 540, zoom: 1.0 },
  { time: 91.60, x: 14400, y: 540, zoom: 1.0 },  // Bay 2 (0.5% Social & Economic Crises)
  { time: 167.40, x: 14400, y: 540, zoom: 1.0 },
  { time: 168.70, x: 12480, y: 540, zoom: 1.0 }, // Bay 3 (1936 Treaty, 1951 Canal, Officers' Club)
  { time: 245.00, x: 12480, y: 540, zoom: 1.0 },
  { time: 246.20, x: 10560, y: 540, zoom: 1.0 }, // Bay 4 (Cairo Fire 1952 + Free Officers Prep)
  { time: 329.00, x: 10560, y: 540, zoom: 1.0 },
  { time: 330.20, x: 8640, y: 540, zoom: 1.0 },  // Bay 5 (July 23 Revolution + 5 Success Factors)
  { time: 412.00, x: 8640, y: 540, zoom: 1.0 },
  { time: 413.20, x: 6720, y: 540, zoom: 1.0 },  // Bay 6 (End of Monarchy + 1954 Evacuation)
  { time: 481.80, x: 6720, y: 540, zoom: 1.0 },
  { time: 483.00, x: 4800, y: 540, zoom: 1.0 },  // Bay 7 (High Dam 1956 + Suez Nationalization)
  { time: 570.40, x: 4800, y: 540, zoom: 1.0 },
  { time: 571.60, x: 2880, y: 540, zoom: 1.0 },  // Bay 8 (Agrarian/Social Reforms, Women 1957, Results)
  { time: 683.70, x: 2880, y: 540, zoom: 1.0 },
  { time: 684.90, x: 960, y: 540, zoom: 1.0 },   // Bay 9 (5 Officer Goals + Grand Lesson Summary)
  { time: AUDIO_DURATION, x: 960, y: 540, zoom: 1.0 },
];

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function easeInOutCubic(t: number): number {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function formatTimecode(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function findActiveScene(scenes: WhiteboardScene[], time: number): WhiteboardScene {
  if (scenes.length === 0) {
    throw new Error('Scenes list must not be empty');
  }
  const t = clamp(time, 0, AUDIO_DURATION);
  if (t <= scenes[0].startTime) {
    return scenes[0];
  }
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    if (t >= s.startTime && t < s.endTime) {
      return s;
    }
  }
  return scenes[scenes.length - 1];
}

export function findActiveNarrationCue(cues: NarrationCue[], time: number): NarrationCue | null {
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    if (time >= cue.startTime && time < cue.endTime) {
      return cue;
    }
  }
  return cues.length > 0 && time >= cues[cues.length - 1].startTime
    ? cues[cues.length - 1]
    : null;
}

export function computeElementProgress(el: DrawElement, time: number): number {
  if (time <= el.startTime) return 0;
  if (time >= el.endTime) return 1;
  const duration = Math.max(0.05, el.endTime - el.startTime);
  return clamp((time - el.startTime) / duration, 0, 1);
}

export function polylineLength(points: Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    len += Math.hypot(dx, dy);
  }
  return len;
}

export function samplePolylinePoint(
  points: Point[],
  progress: number
): { point: Point; angle: number } {
  if (points.length === 0) {
    return { point: { x: BOARD_WIDTH / 2, y: BOARD_HEIGHT / 2 }, angle: 0 };
  }
  if (points.length === 1) {
    return { point: points[0], angle: 0 };
  }
  const p = clamp(progress, 0, 1);
  const total = polylineLength(points);
  if (total < 0.001) {
    return { point: points[0], angle: 0 };
  }
  const targetDist = total * p;
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const segLen = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    if (walked + segLen >= targetDist || i === points.length - 1) {
      const localT = segLen > 0.0001 ? clamp((targetDist - walked) / segLen, 0, 1) : 1;
      const x = lerp(points[i - 1].x, points[i].x, localT);
      const y = lerp(points[i - 1].y, points[i].y, localT);
      const angle = Math.atan2(points[i].y - points[i - 1].y, points[i].x - points[i - 1].x);
      return { point: { x, y }, angle };
    }
    walked += segLen;
  }
  const last = points[points.length - 1];
  return { point: last, angle: 0 };
}

/**
 * Computes the exact RTL handwriting marker tip position in panoramic board coordinates.
 * Arabic writes right-to-left: progress 0 starts at the rightmost edge and sweeps left.
 */
export function sampleTextHandPosition(
  el: Extract<DrawElement, { kind: 'text' }>,
  progress: number,
  measuredWidth?: number
): { point: Point; angle: number } {
  const width = Math.max(40, measuredWidth ?? el.estimatedWidth);
  let rightEdge = el.x;
  if (el.align === 'center') {
    rightEdge = el.x + width / 2;
  } else if (el.align === 'left') {
    rightEdge = el.x + width;
  }
  const leftEdge = rightEdge - width;
  const p = clamp(progress, 0, 1);
  const x = lerp(rightEdge, leftEdge, p);
  const oscCycles = Math.max(4, Math.round(width / 32));
  const yOsc = Math.sin(p * Math.PI * 2 * oscCycles) * (el.fontSize * 0.16);
  const y = el.y - el.fontSize * 0.25 + yOsc;
  const tilt = Math.cos(p * Math.PI * 2 * oscCycles) * 0.035;
  return { point: { x, y }, angle: tilt };
}

/**
 * Computes the AI illustration card transform and open two-finger placement position
 * (two extended fingers resting flat on the card face to slide & press it onto the whiteboard).
 */
export function computeImagePlacementState(
  el: ImageDrawElement,
  progress: number
): {
  cardX: number;
  cardY: number;
  cardScale: number;
  cardRotationRad: number;
  cardLift: number;
  handX: number;
  handY: number;
  handLift: number;
} {
  const p = clamp(progress, 0, 1);
  const targetRot = ((el.rotationDeg ?? 0) * Math.PI) / 180;
  // Two extended fingers touch smoothly on the lower-right surface of the card
  const gripRelX = el.width * 0.68;
  const gripRelY = el.height * 0.66;

  if (p <= 0.58) {
    const moveT = easeInOutCubic(p / 0.58);
    const cardX = lerp(el.x + 220, el.x, moveT);
    const cardY = lerp(el.y + 150, el.y, moveT);
    const cardScale = lerp(1.04, 1.0, moveT);
    const cardRotationRad = lerp(targetRot + 0.06, targetRot, moveT);
    const cardLift = 1 - moveT * 0.85;
    return {
      cardX,
      cardY,
      cardScale,
      cardRotationRad,
      cardLift,
      handX: cardX + gripRelX,
      handY: cardY + gripRelY,
      handLift: cardLift,
    };
  }

  if (p <= 0.78) {
    // Pressing flat onto the whiteboard surface with the pads of the two extended fingers
    return {
      cardX: el.x,
      cardY: el.y,
      cardScale: 1,
      cardRotationRad: targetRot,
      cardLift: 0,
      handX: el.x + gripRelX,
      handY: el.y + gripRelY,
      handLift: 0.03,
    };
  }

  // Lifting the two extended fingers cleanly away from the settled card
  const releaseT = easeInOutCubic((p - 0.78) / 0.22);
  return {
    cardX: el.x,
    cardY: el.y,
    cardScale: 1,
    cardRotationRad: targetRot,
    cardLift: 0,
    handX: el.x + gripRelX + releaseT * 125,
    handY: el.y + gripRelY + releaseT * 140,
    handLift: releaseT,
  };
}

export function getElementEndpoint(
  el: DrawElement,
  which: 'start' | 'end',
  measuredWidth?: number
): { point: Point; pose: HandPose } {
  if (el.kind === 'stroke') {
    const idx = which === 'start' ? 0 : Math.max(0, el.points.length - 1);
    return {
      point: el.points[idx] ?? { x: BOARD_WIDTH / 2, y: BOARD_HEIGHT / 2 },
      pose: el.handPose ?? 'writing',
    };
  }
  if (el.kind === 'image') {
    const placement = computeImagePlacementState(el, which === 'start' ? 0 : 1);
    return {
      point: { x: placement.handX, y: placement.handY },
      pose: 'pinch',
    };
  }
  const res = sampleTextHandPosition(el, which === 'start' ? 0 : 1, measuredWidth);
  return {
    point: res.point,
    pose: el.handPose ?? 'writing',
  };
}

/**
 * Computes panoramic camera position:
 * - When pageScrollEnabled is true (default): camera stays locked on the current bay
 *   until that bay fills up, then pans smoothly across the linking arrow to the next bay.
 * - When false (Manual/Static lock on active bay): jumps/locks strictly to active scene's bayCenterX.
 */
export function computePanoramicCameraState(
  activeScene: WhiteboardScene,
  time: number,
  pageScrollEnabled: boolean,
  keyframes: CameraKeyframe[] = PANORAMA_CAMERA_KEYFRAMES
): CameraState {
  if (!pageScrollEnabled || keyframes.length === 0) {
    return { x: activeScene.bayCenterX, y: BOARD_HEIGHT / 2, zoom: 1 };
  }

  if (time <= keyframes[0].time) {
    return { x: keyframes[0].x, y: keyframes[0].y, zoom: keyframes[0].zoom };
  }
  if (time >= keyframes[keyframes.length - 1].time) {
    const last = keyframes[keyframes.length - 1];
    return { x: last.x, y: last.y, zoom: last.zoom };
  }
  for (let i = 1; i < keyframes.length; i++) {
    if (time <= keyframes[i].time) {
      const prev = keyframes[i - 1];
      const next = keyframes[i];
      const span = Math.max(0.01, next.time - prev.time);
      const t = easeInOutCubic((time - prev.time) / span);
      return {
        x: lerp(prev.x, next.x, t),
        y: lerp(prev.y, next.y, t),
        zoom: lerp(prev.zoom, next.zoom, t),
      };
    }
  }
  return { x: activeScene.bayCenterX, y: BOARD_HEIGHT / 2, zoom: 1 };
}

export function computeHandState(
  allElements: DrawElement[],
  activeScene: WhiteboardScene,
  time: number,
  textWidths?: Record<string, number>
): HandState {
  if (allElements.length === 0) {
    return {
      visible: false,
      x: activeScene.bayCenterX,
      y: BOARD_HEIGHT * 0.6,
      lift: 1,
      angle: 0,
      pose: 'writing',
      activeColor: '#111827',
      isDrawing: false,
    };
  }

  // 1. Check if any element is actively being drawn or placed right now
  for (let i = 0; i < allElements.length; i++) {
    const el = allElements[i];
    if (time >= el.startTime && time <= el.endTime) {
      const progress = computeElementProgress(el, time);
      if (el.kind === 'stroke') {
        const { point, angle } = samplePolylinePoint(el.points, progress);
        const clampedAngle = clamp(Math.sin(angle) * 0.065, -0.08, 0.08);
        return {
          visible: true,
          x: point.x,
          y: point.y,
          lift: 0,
          angle: clampedAngle,
          pose: 'writing',
          activeColor: el.color,
          isDrawing: true,
        };
      }
      if (el.kind === 'image') {
        const placement = computeImagePlacementState(el, progress);
        return {
          visible: true,
          x: placement.handX,
          y: placement.handY,
          lift: placement.handLift,
          angle: 0.02 * placement.handLift,
          pose: 'pinch',
          activeColor: el.color,
          isDrawing: false,
        };
      }
      const { point, angle } = sampleTextHandPosition(el, progress, textWidths?.[el.id]);
      return {
        visible: true,
        x: point.x,
        y: point.y,
        lift: 0,
        angle: clamp(angle, -0.05, 0.05),
        pose: 'writing',
        activeColor: el.color,
        isDrawing: true,
      };
    }
  }

  // 2. Between elements: smooth parabolic lift-and-glide across the unified board
  let prevEl: DrawElement | null = null;
  let nextEl: DrawElement | null = null;

  for (let i = 0; i < allElements.length; i++) {
    if (allElements[i].endTime < time) {
      prevEl = allElements[i];
    } else if (allElements[i].startTime > time && !nextEl) {
      nextEl = allElements[i];
    }
  }

  if (!prevEl && nextEl) {
    const leadIn = Math.min(0.65, Math.max(0.2, nextEl.startTime));
    const tRaw = (time - (nextEl.startTime - leadIn)) / Math.max(0.1, leadIn);
    const t = easeInOutCubic(tRaw);
    const target = getElementEndpoint(nextEl, 'start', textWidths?.[nextEl.id]);
    const entryX = target.point.x + 130;
    const entryY = Math.min(BOARD_HEIGHT - 120, target.point.y + 150);
    return {
      visible: true,
      x: lerp(entryX, target.point.x, t),
      y: lerp(entryY, target.point.y, t),
      lift: 1 - t,
      angle: lerp(0.05, 0, t),
      pose: target.pose,
      activeColor: nextEl.color,
      isDrawing: false,
    };
  }

  if (prevEl && nextEl) {
    const gap = Math.max(0.05, nextEl.startTime - prevEl.endTime);
    const t = easeInOutCubic((time - prevEl.endTime) / gap);
    const from = getElementEndpoint(prevEl, 'end', textWidths?.[prevEl.id]);
    const to = getElementEndpoint(nextEl, 'start', textWidths?.[nextEl.id]);
    const lift = Math.sin(clamp((time - prevEl.endTime) / gap, 0, 1) * Math.PI);
    return {
      visible: true,
      x: lerp(from.point.x, to.point.x, t),
      y: lerp(from.point.y, to.point.y, t) - lift * 20,
      lift,
      angle: lift * 0.04,
      pose: t < 0.5 ? from.pose : to.pose,
      activeColor: t < 0.5 ? prevEl.color : nextEl.color,
      isDrawing: false,
    };
  }

  if (prevEl && !nextEl) {
    const settleDuration = 0.7;
    const elapsed = time - prevEl.endTime;
    const t = easeInOutCubic(clamp(elapsed / settleDuration, 0, 1));
    const from = getElementEndpoint(prevEl, 'end', textWidths?.[prevEl.id]);
    const restX = clamp(from.point.x + 120, 120, PANORAMA_WIDTH - 120);
    const restY = clamp(from.point.y + 110, 180, BOARD_HEIGHT - 220);
    return {
      visible: true,
      x: lerp(from.point.x, restX, t),
      y: lerp(from.point.y, restY, t),
      lift: lerp(0, 0.75, t),
      angle: lerp(0, 0.04, t),
      pose: from.pose,
      activeColor: prevEl.color,
      isDrawing: false,
    };
  }

  return {
    visible: false,
    x: activeScene.bayCenterX,
    y: BOARD_HEIGHT * 0.6,
    lift: 1,
    angle: 0,
    pose: 'writing',
    activeColor: '#111827',
    isDrawing: false,
  };
}
