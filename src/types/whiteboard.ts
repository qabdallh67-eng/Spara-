export interface Point {
  x: number;
  y: number;
}

export type InkColor =
  | '#111827' // Main black dry-erase ink
  | '#C81E1E' // Crimson red for dates & warnings
  | '#1D4ED8' // Royal blue for names & leaders
  | '#047857' // Forest green for goals & victories
  | '#B45309' // Warm amber/ochre for accents
  | '#475569'; // Slate gray

export type HandPose = 'writing' | 'pinch';

export type IllustrationKey =
  | 'egypt_1952'
  | 'farouk_palace'
  | 'social_crisis'
  | 'canal_struggle'
  | 'officers_club'
  | 'cairo_fire'
  | 'free_officers'
  | 'july23_radio'
  | 'royal_abdication'
  | 'evacuation_1954'
  | 'high_dam'
  | 'suez_nationalization'
  | 'agrarian_reform'
  | 'women_education'
  | 'republic_summary';

export interface BaseDrawElement {
  id: string;
  startTime: number;
  endTime: number;
  color: string;
  handPose?: HandPose;
}

export interface StrokeDrawElement extends BaseDrawElement {
  kind: 'stroke';
  points: Point[];
  lineWidth: number;
  closed?: boolean;
  fillAfter?: string;
  dashed?: boolean;
}

export interface TextDrawElement extends BaseDrawElement {
  kind: 'text';
  text: string;
  /** Anchor coordinate in continuous panoramic board space */
  x: number;
  y: number;
  fontSize: number;
  fontFamily: 'hand' | 'sans';
  fontWeight?: 'normal' | 'bold';
  align: 'right' | 'center' | 'left';
  estimatedWidth: number;
  underline?: boolean;
  highlightBox?: string;
}

export interface ImageDrawElement extends BaseDrawElement {
  kind: 'image';
  imageKey: IllustrationKey;
  /** Final resting top-left coordinate in continuous panoramic board space */
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg?: number;
  caption?: string;
}

export type DrawElement = StrokeDrawElement | TextDrawElement | ImageDrawElement;

export interface CameraKeyframe {
  time: number;
  x: number;
  y: number;
  zoom: number;
}

export interface WhiteboardScene {
  id: string;
  index: number;
  chapterId: string;
  chapterLabel: string;
  title: string;
  subtitle: string;
  startTime: number;
  endTime: number;
  /** Center X of the panoramic whiteboard bay where this scene sits */
  bayCenterX: number;
  elements: DrawElement[];
  cameraKeyframes: CameraKeyframe[];
}

export interface NarrationCue {
  id: string;
  sceneId: string;
  startTime: number;
  endTime: number;
  text: string;
  keywords?: Array<{ word: string; type: 'date' | 'name' | 'concept' }>;
}

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export interface HandState {
  visible: boolean;
  x: number;
  y: number;
  /** 0 = touching board, 1 = lifted mid-transition */
  lift: number;
  /** Slight wrist rotation in radians */
  angle: number;
  pose: HandPose;
  activeColor: string;
  isDrawing: boolean;
}
