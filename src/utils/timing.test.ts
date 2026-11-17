import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIO_DURATION,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  PANORAMA_BAYS,
  PANORAMA_WIDTH,
  computeElementProgress,
  computeHandState,
  computeImagePlacementState,
  computePanoramicCameraState,
  findActiveNarrationCue,
  findActiveScene,
  formatTimecode,
  samplePolylinePoint,
  sampleTextHandPosition,
} from './timing';
import { ALL_BOARD_ELEMENTS, WHITEBOARD_SCENES, NARRATION_CUES } from '../data/scenes';
import type { DrawElement, ImageDrawElement, NarrationCue, WhiteboardScene } from '../types/whiteboard';

const MOCK_SCENE: WhiteboardScene = {
  id: 'scene-test',
  index: 1,
  chapterId: 'ch1',
  chapterLabel: 'الفصل الأول',
  title: 'مصر قبل ١٩٥٢',
  subtitle: 'النظام السياسي',
  startTime: 10,
  endTime: 30,
  bayCenterX: 16320,
  cameraKeyframes: [],
  elements: [
    {
      id: 'stroke-1',
      kind: 'stroke',
      startTime: 12,
      endTime: 16,
      color: '#111827',
      lineWidth: 5,
      handPose: 'writing',
      points: [
        { x: 15500, y: 200 },
        { x: 15700, y: 200 },
        { x: 15700, y: 400 },
      ],
    },
    {
      id: 'text-1',
      kind: 'text',
      startTime: 18,
      endTime: 22,
      color: '#C81E1E',
      text: '٢٣ يوليو ١٩٥٢',
      x: 16800,
      y: 250,
      fontSize: 56,
      fontFamily: 'hand',
      align: 'right',
      estimatedWidth: 320,
      handPose: 'writing',
    },
    {
      id: 'img-1',
      kind: 'image',
      startTime: 24,
      endTime: 28,
      color: '#1D4ED8',
      imageKey: 'egypt_1952',
      x: 15520,
      y: 340,
      width: 460,
      height: 290,
      rotationDeg: -1.5,
      handPose: 'pinch',
    },
  ],
};

test('formatTimecode formats mm:ss with zero padding', () => {
  assert.equal(formatTimecode(0), '00:00');
  assert.equal(formatTimecode(63.8), '01:03');
  assert.equal(formatTimecode(831.1), '13:51');
});

test('findActiveScene selects matching scene and clamps ends', () => {
  const s2: WhiteboardScene = {
    ...MOCK_SCENE,
    id: 'scene-2',
    index: 2,
    startTime: 30,
    endTime: 60,
    bayCenterX: 14400,
  };
  const scenes = [MOCK_SCENE, s2];
  assert.equal(findActiveScene(scenes, 0).id, 'scene-test');
  assert.equal(findActiveScene(scenes, 15).id, 'scene-test');
  assert.equal(findActiveScene(scenes, 30).id, 'scene-2');
  assert.equal(findActiveScene(scenes, 999).id, 'scene-2');
});

test('computeElementProgress clamps between 0 and 1 linearly', () => {
  const el = MOCK_SCENE.elements[0];
  assert.equal(computeElementProgress(el, 10), 0);
  assert.equal(computeElementProgress(el, 14), 0.5);
  assert.equal(computeElementProgress(el, 20), 1);
});

test('samplePolylinePoint interpolates accurately along segments', () => {
  const pts = [
    { x: 100, y: 200 },
    { x: 300, y: 200 },
    { x: 300, y: 400 },
  ];
  const mid = samplePolylinePoint(pts, 0.5);
  assert.equal(Math.round(mid.point.x), 300);
  assert.equal(Math.round(mid.point.y), 200);

  const quarter = samplePolylinePoint(pts, 0.25);
  assert.equal(Math.round(quarter.point.x), 200);
  assert.equal(Math.round(quarter.point.y), 200);
});

test('sampleTextHandPosition moves from right to left for RTL Arabic', () => {
  const textEl = MOCK_SCENE.elements[1];
  if (textEl.kind !== 'text') throw new Error('expected text element');
  const start = sampleTextHandPosition(textEl, 0);
  const end = sampleTextHandPosition(textEl, 1);
  assert.ok(start.point.x > end.point.x, 'Hand must sweep right-to-left for Arabic text');
  assert.equal(Math.round(start.point.x), 16800);
  assert.equal(Math.round(end.point.x), 16480);
});

test('computeImagePlacementState slides card in, presses flat, then releases pinch hand', () => {
  const imgEl = MOCK_SCENE.elements[2] as ImageDrawElement;
  const start = computeImagePlacementState(imgEl, 0);
  const press = computeImagePlacementState(imgEl, 0.7);
  const end = computeImagePlacementState(imgEl, 1);

  assert.ok(start.cardX > imgEl.x, 'Card starts offset before sliding to target position');
  assert.ok(start.cardLift > 0.5, 'Card starts elevated while pinched');
  assert.equal(press.cardX, imgEl.x);
  assert.equal(press.cardY, imgEl.y);
  assert.equal(press.cardLift, 0);
  assert.equal(end.cardLift, 0);
  assert.ok(end.handX > press.handX && end.handY > press.handY, 'Two fingers release cleanly after press');
});

test('computePanoramicCameraState stays steady until bay fills, then glides smoothly across 9 bays', () => {
  const bay1Early = computePanoramicCameraState(MOCK_SCENE, 45, true);
  const bay1Late = computePanoramicCameraState(MOCK_SCENE, 89.5, true);
  assert.equal(bay1Early.x, 16320);
  assert.equal(bay1Late.x, 16320);
  assert.equal(bay1Early.zoom, 1);

  const midPan1to2 = computePanoramicCameraState(MOCK_SCENE, 91.4, true);
  assert.ok(midPan1to2.x < 16320 && midPan1to2.x > 14400, 'Camera glides between Bay 1 and Bay 2');

  const bay2Settled = computePanoramicCameraState(MOCK_SCENE, 110, true);
  assert.equal(bay2Settled.x, 14400);

  const bay9End = computePanoramicCameraState(MOCK_SCENE, 800, true);
  assert.equal(bay9End.x, 960);

  const manualScene: WhiteboardScene = { ...MOCK_SCENE, bayCenterX: 4800 };
  const locked = computePanoramicCameraState(manualScene, 91.4, false);
  assert.equal(locked.x, 4800);
});

test('computeHandState switches marker colors and uses two-finger pinch pose for AI images', () => {
  const elements: DrawElement[] = MOCK_SCENE.elements;
  const drawingBlack = computeHandState(elements, MOCK_SCENE, 14);
  assert.equal(drawingBlack.isDrawing, true);
  assert.equal(drawingBlack.pose, 'writing');
  assert.equal(drawingBlack.activeColor, '#111827');

  const lifting = computeHandState(elements, MOCK_SCENE, 17);
  assert.equal(lifting.isDrawing, false);
  assert.ok(lifting.lift > 0.8, 'Hand should lift during inter-element transition');

  const writingRed = computeHandState(elements, MOCK_SCENE, 20);
  assert.equal(writingRed.isDrawing, true);
  assert.equal(writingRed.pose, 'writing');
  assert.equal(writingRed.activeColor, '#C81E1E');

  const pinchingImage = computeHandState(elements, MOCK_SCENE, 26);
  assert.equal(pinchingImage.pose, 'pinch');
  assert.equal(pinchingImage.isDrawing, false);
});

test('findActiveNarrationCue matches active spoken interval', () => {
  const cues: NarrationCue[] = [
    { id: 'c1', sceneId: 's1', startTime: 0, endTime: 13.5, text: 'مقدمة' },
    { id: 'c2', sceneId: 's2', startTime: 13.5, endTime: 32, text: 'أول حكاية' },
  ];
  assert.equal(findActiveNarrationCue(cues, 5)?.id, 'c1');
  assert.equal(findActiveNarrationCue(cues, 18)?.id, 'c2');
});

test('WHITEBOARD_SCENES and ALL_BOARD_ELEMENTS cover full 831.10s audio within 17280x1080 9-bay panorama', () => {
  assert.equal(PANORAMA_BAYS, 9);
  assert.equal(PANORAMA_WIDTH, 17280);
  assert.equal(WHITEBOARD_SCENES.length, 18);
  assert.equal(WHITEBOARD_SCENES[0].startTime, 0);
  assert.equal(WHITEBOARD_SCENES[WHITEBOARD_SCENES.length - 1].endTime, AUDIO_DURATION);
  assert.ok(ALL_BOARD_ELEMENTS.length > 90);

  let imageCount = 0;
  for (let i = 0; i < WHITEBOARD_SCENES.length; i++) {
    const s = WHITEBOARD_SCENES[i];
    assert.ok(s.endTime > s.startTime, `Scene ${s.id} must have positive duration`);
    assert.ok(
      s.bayCenterX >= BOARD_WIDTH / 2 && s.bayCenterX <= PANORAMA_WIDTH - BOARD_WIDTH / 2,
      `Scene ${s.id} bayCenterX out of bounds`
    );
    if (i > 0) {
      assert.equal(s.startTime, WHITEBOARD_SCENES[i - 1].endTime, `Scene ${s.id} must abut previous scene`);
    }
    for (const el of s.elements) {
      assert.ok(el.endTime > el.startTime, `Element ${el.id} must have positive duration`);
      assert.ok(el.startTime >= s.startTime && el.endTime <= s.endTime, `Element ${el.id} must lie within scene ${s.id}`);
      if (el.kind === 'stroke') {
        for (const pt of el.points) {
          assert.ok(
            pt.x >= 0 && pt.x <= PANORAMA_WIDTH && pt.y >= 0 && pt.y <= BOARD_HEIGHT,
            `Stroke ${el.id} point (${pt.x}, ${pt.y}) out of panorama bounds`
          );
        }
      } else if (el.kind === 'image') {
        imageCount++;
        assert.ok(
          el.x >= 0 && el.x + el.width <= PANORAMA_WIDTH && el.y >= 0 && el.y + el.height <= BOARD_HEIGHT,
          `Image ${el.id} out of panorama bounds`
        );
      } else {
        assert.ok(
          el.x >= 0 && el.x <= PANORAMA_WIDTH && el.y >= 0 && el.y <= BOARD_HEIGHT,
          `Text ${el.id} anchor (${el.x}, ${el.y}) out of panorama bounds`
        );
      }
    }
  }
  assert.equal(imageCount, 15, 'All 15 AI-generated illustrations must be placed on the board');
  assert.ok(NARRATION_CUES.length >= 20);
});
