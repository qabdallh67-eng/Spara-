import React, { useEffect, useRef } from 'react';
import { Maximize2, Play, RotateCcw } from 'lucide-react';
import type { DrawElement, NarrationCue, WhiteboardScene } from '../types/whiteboard';
import type { WhiteboardAssets } from '../utils/handMatte';
import { renderWhiteboardFrame } from '../utils/whiteboardRenderer';
import { BOARD_HEIGHT, BOARD_WIDTH, findActiveScene } from '../utils/timing';

interface WhiteboardStageProps {
  scenes: WhiteboardScene[];
  allElements: DrawElement[];
  assets: WhiteboardAssets | null;
  assetsLoaded: boolean;
  isPlaying: boolean;
  hasStarted: boolean;
  pageScrollEnabled: boolean;
  showCaptions: boolean;
  activeCue: NarrationCue | null;
  currentTime: number;
  duration: number;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  stageContainerRef: React.RefObject<HTMLDivElement | null>;
  onTogglePlay: () => void;
  onRestart: () => void;
  onToggleFullscreen: () => void;
  onFrameTimeUpdate: (time: number) => void;
  textWidthsRef: React.MutableRefObject<Record<string, number>>;
}

export const WhiteboardStage: React.FC<WhiteboardStageProps> = ({
  scenes,
  allElements,
  assets,
  assetsLoaded,
  isPlaying,
  hasStarted,
  pageScrollEnabled,
  showCaptions,
  activeCue,
  currentTime,
  duration,
  audioRef,
  canvasRef,
  stageContainerRef,
  onTogglePlay,
  onRestart,
  onToggleFullscreen,
  onFrameTimeUpdate,
  textWidthsRef,
}) => {
  const propsRef = useRef({
    scenes,
    allElements,
    assets,
    isPlaying,
    pageScrollEnabled,
    currentTime,
    onFrameTimeUpdate,
  });

  propsRef.current = {
    scenes,
    allElements,
    assets,
    isPlaying,
    pageScrollEnabled,
    currentTime,
    onFrameTimeUpdate,
  };

  useEffect(() => {
    const drawAt = (t: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const activeScene = findActiveScene(scenes, t);
      renderWhiteboardFrame(ctx, canvas.width, canvas.height, {
        time: t,
        activeScene,
        allElements,
        assets,
        pageScrollEnabled,
        textWidths: textWidthsRef.current,
      });
    };

    if (!isPlaying) {
      drawAt(currentTime);
      if (typeof document !== 'undefined' && document.fonts?.ready) {
        void document.fonts.ready.then(() => {
          if (!propsRef.current.isPlaying) {
            drawAt(propsRef.current.currentTime);
          }
        });
      }
      return;
    }

    let rafId = 0;
    let lastReportedDeci = -1;

    const tick = () => {
      const audio = audioRef.current;
      const {
        currentTime: fallbackTime,
        onFrameTimeUpdate: reportTime,
      } = propsRef.current;

      const t = audio ? audio.currentTime : fallbackTime;
      drawAt(t);

      const deci = Math.floor(t * 10);
      if (deci !== lastReportedDeci) {
        lastReportedDeci = deci;
        reportTime(t);
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [
    allElements,
    assets,
    audioRef,
    canvasRef,
    currentTime,
    isPlaying,
    pageScrollEnabled,
    scenes,
    textWidthsRef,
  ]);

  const activeScene = findActiveScene(scenes, currentTime);
  const isFinished = duration > 0 && currentTime >= duration - 0.35;

  return (
    <div
      ref={stageContainerRef}
      data-testid="whiteboard-stage"
      data-state={isPlaying ? 'playing' : isFinished ? 'ended' : 'paused'}
      data-scene={activeScene.id}
      data-time={Math.floor(currentTime)}
      className="relative w-full select-none"
    >
      <div className="relative rounded-xl bg-[#D8DEE6] p-2 sm:p-2.5 shadow-[0_12px_36px_-12px_rgba(15,23,42,0.18)] border border-slate-300/80">
        <div className="relative w-full aspect-video overflow-hidden rounded-lg bg-white border border-slate-200">
          <canvas
            ref={canvasRef}
            data-testid="whiteboard-canvas"
            width={BOARD_WIDTH}
            height={BOARD_HEIGHT}
            onClick={onTogglePlay}
            className="block w-full h-full cursor-pointer object-contain"
          />

          <button
            type="button"
            onClick={onToggleFullscreen}
            aria-label="ملء الشاشة"
            className="absolute top-3 left-3 inline-flex items-center justify-center w-9 h-9 rounded-md bg-white/90 hover:bg-white text-slate-700 hover:text-slate-950 border border-slate-200/80 transition-colors focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          {!hasStarted && !isPlaying && (
            <div className="absolute inset-0 flex flex-col items-center justify-end pb-7 bg-gradient-to-t from-slate-950/12 via-transparent to-transparent">
              <button
                type="button"
                onClick={onTogglePlay}
                aria-label="تشغيل فيديو السبورة البيضاء"
                className="group inline-flex items-center gap-3 rounded-lg bg-slate-900 hover:bg-blue-700 text-white px-6 py-3 text-base font-semibold shadow-lg transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>تشغيل الشرح على السبورة</span>
              </button>
              {!assetsLoaded && (
                <p className="mt-2.5 text-xs text-slate-700 bg-white/95 px-3 py-1 rounded-md border border-slate-200">
                  جارٍ تجهيز اليد الواقعية والصور التعليمية...
                </p>
              )}
            </div>
          )}

          {isFinished && !isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/20">
              <button
                type="button"
                onClick={onRestart}
                aria-label="إعادة تشغيل الدرس من البداية"
                className="inline-flex items-center gap-2.5 rounded-lg bg-slate-900 hover:bg-blue-700 text-white px-6 py-3 text-base font-semibold shadow-lg transition-colors"
              >
                <RotateCcw className="w-5 h-5" />
                <span>إعادة المشاهدة من البداية</span>
              </button>
            </div>
          )}
        </div>

        <div className="mt-1.5 mx-auto w-2/5 h-1.5 rounded-full bg-gradient-to-b from-slate-400/70 to-slate-500/60" />
      </div>

      {showCaptions && hasStarted && activeCue && (
        <div
          data-testid="live-caption"
          className="mt-2.5 rounded-lg bg-slate-900 px-4 py-2.5 text-center text-sm sm:text-base font-medium leading-relaxed text-white"
        >
          {activeCue.text}
        </div>
      )}
    </div>
  );
};
