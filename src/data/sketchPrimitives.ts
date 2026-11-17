import type { Point, StrokeDrawElement } from '../types/whiteboard';

/**
 * Generates an organic hand-drawn circle/ellipse polyline.
 */
export function circlePoints(
  cx: number,
  cy: number,
  rx: number,
  ry = rx,
  segments = 28,
  startAngle = -Math.PI / 2
): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = startAngle + (i / segments) * Math.PI * 2;
    // Slight organic dry-erase imperfection
    const wobble = 1 + Math.sin(i * 1.7) * 0.015;
    pts.push({
      x: cx + Math.cos(a) * rx * wobble,
      y: cy + Math.sin(a) * ry * wobble,
    });
  }
  return pts;
}

/**
 * Generates an organic hand-drawn rounded rectangle polyline.
 */
export function boxPoints(x: number, y: number, w: number, h: number): Point[] {
  const inset = 6;
  return [
    { x: x + inset, y },
    { x: x + w - inset, y: y + 1.5 },
    { x: x + w, y: y + inset },
    { x: x + w - 1, y: y + h - inset },
    { x: x + w - inset, y: y + h },
    { x: x + inset, y: y + h - 1 },
    { x, y: y + h - inset },
    { x: x + 1.5, y: y + inset },
    { x: x + inset, y },
  ];
}

/**
 * Generates a curved directional arrow (shaft + arrowhead) as 2 stroke elements.
 */
export function arrowStrokes(
  idPrefix: string,
  from: Point,
  to: Point,
  startTime: number,
  endTime: number,
  color = '#111827',
  curveOffset = 0,
  lineWidth = 5
): StrokeDrawElement[] {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / len;
  const ny = dx / len;

  const ctrlX = midX + nx * curveOffset;
  const ctrlY = midY + ny * curveOffset;

  const shaftPts: Point[] = [];
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const inv = 1 - t;
    shaftPts.push({
      x: inv * inv * from.x + 2 * inv * t * ctrlX + t * t * to.x,
      y: inv * inv * from.y + 2 * inv * t * ctrlY + t * t * to.y,
    });
  }

  const endAngle = Math.atan2(to.y - ctrlY, to.x - ctrlX);
  const headLen = 22;
  const wing = 0.48;
  const headPts: Point[] = [
    {
      x: to.x - Math.cos(endAngle - wing) * headLen,
      y: to.y - Math.sin(endAngle - wing) * headLen,
    },
    to,
    {
      x: to.x - Math.cos(endAngle + wing) * headLen,
      y: to.y - Math.sin(endAngle + wing) * headLen,
    },
  ];

  const split = startTime + (endTime - startTime) * 0.72;
  return [
    {
      id: `${idPrefix}-shaft`,
      kind: 'stroke',
      startTime,
      endTime: split,
      color,
      lineWidth,
      handPose: 'writing',
      points: shaftPts,
    },
    {
      id: `${idPrefix}-head`,
      kind: 'stroke',
      startTime: split,
      endTime,
      color,
      lineWidth,
      handPose: 'writing',
      points: headPts,
    },
  ];
}

/**
 * Hand-drawn map of Egypt (Sinai, Red Sea coast, Mediterranean coast, Nile River & Delta).
 */
export function egyptMapStrokes(
  idPrefix: string,
  ox: number,
  oy: number,
  scale: number,
  startTime: number,
  endTime: number
): StrokeDrawElement[] {
  const p = (x: number, y: number): Point => ({ x: ox + x * scale, y: oy + y * scale });
  const dur = endTime - startTime;
  const t1 = startTime + dur * 0.45;
  const t2 = startTime + dur * 0.75;

  return [
    {
      id: `${idPrefix}-border`,
      kind: 'stroke',
      startTime,
      endTime: t1,
      color: '#111827',
      lineWidth: 5,
      closed: true,
      fillAfter: 'rgba(254, 243, 199, 0.38)',
      handPose: 'writing',
      points: [
        p(0, 40),
        p(90, 32),
        p(145, 45),
        p(185, 28),
        p(235, 36),
        p(275, 22),
        p(305, 20),
        p(322, 65),
        p(302, 108),
        p(282, 72),
        p(292, 128),
        p(345, 215),
        p(372, 290),
        p(340, 298),
        p(15, 298),
        p(10, 155),
        p(0, 40),
      ],
    },
    {
      id: `${idPrefix}-nile`,
      kind: 'stroke',
      startTime: t1,
      endTime: t2,
      color: '#1D4ED8',
      lineWidth: 5.5,
      handPose: 'writing',
      points: [
        p(215, 295),
        p(205, 245),
        p(228, 205),
        p(208, 165),
        p(195, 118),
        p(205, 78),
        p(172, 36),
      ],
    },
    {
      id: `${idPrefix}-delta`,
      kind: 'stroke',
      startTime: t2,
      endTime,
      color: '#1D4ED8',
      lineWidth: 4.5,
      handPose: 'writing',
      points: [p(205, 78), p(236, 36)],
    },
  ];
}

/**
 * Hand-drawn Pyramids silhouette.
 */
export function pyramidsStrokes(
  idPrefix: string,
  ox: number,
  oy: number,
  scale: number,
  startTime: number,
  endTime: number
): StrokeDrawElement[] {
  const p = (x: number, y: number): Point => ({ x: ox + x * scale, y: oy + y * scale });
  const mid = startTime + (endTime - startTime) * 0.55;
  return [
    {
      id: `${idPrefix}-pyr1`,
      kind: 'stroke',
      startTime,
      endTime: mid,
      color: '#B45309',
      lineWidth: 5,
      closed: true,
      fillAfter: 'rgba(245, 158, 11, 0.16)',
      handPose: 'writing',
      points: [p(0, 110), p(85, 0), p(170, 110), p(0, 110)],
    },
    {
      id: `${idPrefix}-pyr2`,
      kind: 'stroke',
      startTime: mid,
      endTime,
      color: '#B45309',
      lineWidth: 4.5,
      closed: true,
      fillAfter: 'rgba(245, 158, 11, 0.12)',
      handPose: 'writing',
      points: [p(135, 110), p(195, 32), p(255, 110), p(135, 110)],
    },
  ];
}

/**
 * Hand-drawn Royal Crown (symbolizing King Farouk / Monarchy).
 */
export function crownStrokes(
  idPrefix: string,
  cx: number,
  cy: number,
  scale: number,
  startTime: number,
  endTime: number,
  color = '#B45309'
): StrokeDrawElement[] {
  const p = (x: number, y: number): Point => ({ x: cx + x * scale, y: cy + y * scale });
  const mid = startTime + (endTime - startTime) * 0.72;
  return [
    {
      id: `${idPrefix}-body`,
      kind: 'stroke',
      startTime,
      endTime: mid,
      color,
      lineWidth: 5,
      closed: true,
      fillAfter: 'rgba(245, 158, 11, 0.18)',
      handPose: 'writing',
      points: [
        p(-65, 32),
        p(-80, -25),
        p(-35, 8),
        p(0, -42),
        p(35, 8),
        p(80, -25),
        p(65, 32),
        p(-65, 32),
      ],
    },
    {
      id: `${idPrefix}-base`,
      kind: 'stroke',
      startTime: mid,
      endTime,
      color,
      lineWidth: 5,
      handPose: 'writing',
      points: [p(-68, 44), p(68, 44)],
    },
  ];
}

/**
 * Hand-drawn Constitutional Scroll / Document.
 */
export function scrollStrokes(
  idPrefix: string,
  x: number,
  y: number,
  w: number,
  h: number,
  startTime: number,
  endTime: number,
  color = '#111827'
): StrokeDrawElement[] {
  const dur = endTime - startTime;
  return [
    {
      id: `${idPrefix}-frame`,
      kind: 'stroke',
      startTime,
      endTime: startTime + dur * 0.55,
      color,
      lineWidth: 4.5,
      closed: true,
      fillAfter: 'rgba(241, 245, 249, 0.7)',
      handPose: 'writing',
      points: boxPoints(x, y, w, h),
    },
    {
      id: `${idPrefix}-line1`,
      kind: 'stroke',
      startTime: startTime + dur * 0.55,
      endTime: startTime + dur * 0.78,
      color: '#475569',
      lineWidth: 3.5,
      handPose: 'writing',
      points: [
        { x: x + w - 28, y: y + h * 0.34 },
        { x: x + 36, y: y + h * 0.34 },
      ],
    },
    {
      id: `${idPrefix}-line2`,
      kind: 'stroke',
      startTime: startTime + dur * 0.78,
      endTime,
      color: '#475569',
      lineWidth: 3.5,
      handPose: 'writing',
      points: [
        { x: x + w - 28, y: y + h * 0.62 },
        { x: x + 64, y: y + h * 0.62 },
      ],
    },
  ];
}

/**
 * Hand-drawn Portrait Bust (for Mohamed Naguib / Gamal Abdel Nasser / Leaders).
 */
export function officerPortraitStrokes(
  idPrefix: string,
  cx: number,
  cy: number,
  scale: number,
  startTime: number,
  endTime: number,
  color = '#1D4ED8'
): StrokeDrawElement[] {
  const p = (x: number, y: number): Point => ({ x: cx + x * scale, y: cy + y * scale });
  const d = endTime - startTime;
  const t1 = startTime + d * 0.35;
  const t2 = startTime + d * 0.65;
  const t3 = startTime + d * 0.85;
  return [
    {
      id: `${idPrefix}-cap`,
      kind: 'stroke',
      startTime,
      endTime: t1,
      color,
      lineWidth: 4.5,
      closed: true,
      fillAfter: 'rgba(29, 78, 216, 0.14)',
      handPose: 'writing',
      points: [p(-44, -22), p(-52, -48), p(0, -58), p(52, -48), p(44, -22), p(-44, -22)],
    },
    {
      id: `${idPrefix}-face`,
      kind: 'stroke',
      startTime: t1,
      endTime: t2,
      color: '#111827',
      lineWidth: 4.5,
      handPose: 'writing',
      points: [
        p(-34, -20),
        p(-34, 14),
        p(-18, 36),
        p(0, 42),
        p(18, 36),
        p(34, 14),
        p(34, -20),
      ],
    },
    {
      id: `${idPrefix}-shoulders`,
      kind: 'stroke',
      startTime: t2,
      endTime: t3,
      color,
      lineWidth: 5,
      closed: true,
      fillAfter: 'rgba(29, 78, 216, 0.1)',
      handPose: 'writing',
      points: [p(-68, 92), p(-54, 48), p(-18, 42), p(0, 62), p(18, 42), p(54, 48), p(68, 92), p(-68, 92)],
    },
    {
      id: `${idPrefix}-stars`,
      kind: 'stroke',
      startTime: t3,
      endTime,
      color: '#B45309',
      lineWidth: 4,
      handPose: 'writing',
      points: [p(-46, 56), p(-34, 56), p(34, 56), p(46, 56)],
    },
  ];
}

/**
 * Hand-drawn Tilted / Unbalanced Scale (Justice / Economic Trade Deficit / Instability).
 */
export function balanceScaleStrokes(
  idPrefix: string,
  cx: number,
  cy: number,
  tiltDeg: number,
  startTime: number,
  endTime: number,
  color = '#111827'
): StrokeDrawElement[] {
  const rad = (tiltDeg * Math.PI) / 180;
  const arm = 135;
  const lx = cx - Math.cos(rad) * arm;
  const ly = cy - 40 - Math.sin(rad) * arm;
  const rx = cx + Math.cos(rad) * arm;
  const ry = cy - 40 + Math.sin(rad) * arm;

  const d = endTime - startTime;
  const t1 = startTime + d * 0.3;
  const t2 = startTime + d * 0.55;
  const t3 = startTime + d * 0.78;

  return [
    {
      id: `${idPrefix}-stand`,
      kind: 'stroke',
      startTime,
      endTime: t1,
      color,
      lineWidth: 5,
      handPose: 'writing',
      points: [
        { x: cx - 55, y: cy + 85 },
        { x: cx + 55, y: cy + 85 },
        { x: cx, y: cy + 85 },
        { x: cx, y: cy - 55 },
      ],
    },
    {
      id: `${idPrefix}-beam`,
      kind: 'stroke',
      startTime: t1,
      endTime: t2,
      color,
      lineWidth: 5.5,
      handPose: 'writing',
      points: [{ x: lx, y: ly }, { x: rx, y: ry }],
    },
    {
      id: `${idPrefix}-leftPan`,
      kind: 'stroke',
      startTime: t2,
      endTime: t3,
      color: '#C81E1E',
      lineWidth: 4,
      handPose: 'writing',
      points: [
        { x: lx, y: ly },
        { x: lx - 38, y: ly + 62 },
        { x: lx + 38, y: ly + 62 },
        { x: lx, y: ly },
      ],
    },
    {
      id: `${idPrefix}-rightPan`,
      kind: 'stroke',
      startTime: t3,
      endTime,
      color: '#1D4ED8',
      lineWidth: 4,
      handPose: 'writing',
      points: [
        { x: rx, y: ry },
        { x: rx - 38, y: ry + 62 },
        { x: rx + 38, y: ry + 62 },
        { x: rx, y: ry },
      ],
    },
  ];
}
