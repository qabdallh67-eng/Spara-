import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ALL_BOARD_ELEMENTS,
  CHAPTERS,
  NARRATION_CUES,
  WHITEBOARD_SCENES,
} from './data/scenes';
import { loadWhiteboardAssets, type WhiteboardAssets } from './utils/handMatte';
import {
  AUDIO_DURATION,
  AUDIO_URL,
  clamp,
  findActiveNarrationCue,
  findActiveScene,
} from './utils/timing';
import { WhiteboardStage } from './components/WhiteboardStage';
import { TransportControls } from './components/TransportControls';
import { SceneSidebar } from './components/SceneSidebar';
import { ExportModal } from './components/ExportModal';

export default function App() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const textWidthsRef = useRef<Record<string, number>>({});

  const [assets, setAssets] = useState<WhiteboardAssets | null>(null);
  const [assetsLoaded, setAssetsLoaded] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(AUDIO_DURATION);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [pageScrollEnabled, setPageScrollEnabled] = useState(true);
  const [showCaptions, setShowCaptions] = useState(true);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  // Load and matte the full uncropped human hands (writing & pinch) + AI illustrations
  useEffect(() => {
    let active = true;
    loadWhiteboardAssets()
      .then((loaded) => {
        if (active) {
          setAssets(loaded);
          setAssetsLoaded(true);
        }
      })
      .catch(() => {
        if (active) setAssetsLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  // Support ?autostart=1 for immediate active stage verification
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      setHasStarted(true);
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = 4.8;
        setCurrentTime(4.8);
        audio.play().catch(() => {
          setIsPlaying(false);
        });
      }
    }
  }, []);

  const handleTogglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!hasStarted) {
      setHasStarted(true);
      if (audio.currentTime >= duration - 0.5) {
        audio.currentTime = 0;
      }
    }

    if (audio.paused) {
      setAudioError(null);
      audio
        .play()
        .then(() => {
          setIsPlaying(true);
        })
        .catch(() => {
          setAudioError('اضغط على زر التشغيل مرة أخرى للسماح بتشغيل الصوت في المتصفح.');
          setIsPlaying(false);
        });
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, [duration, hasStarted]);

  const handleSeek = useCallback(
    (time: number) => {
      const audio = audioRef.current;
      const clamped = clamp(time, 0, duration);
      setHasStarted(true);
      if (audio) {
        audio.currentTime = clamped;
      }
      setCurrentTime(clamped);
    },
    [duration]
  );

  const handleSkip = useCallback(
    (deltaSeconds: number) => {
      const audio = audioRef.current;
      const base = audio ? audio.currentTime : currentTime;
      handleSeek(base + deltaSeconds);
    },
    [currentTime, handleSeek]
  );

  const handleRestart = useCallback(() => {
    const audio = audioRef.current;
    setHasStarted(true);
    if (audio) {
      audio.currentTime = 0;
      setCurrentTime(0);
      void audio.play().then(() => setIsPlaying(true));
    }
  }, []);

  const handlePlaybackRateChange = useCallback((rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  }, []);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (audioRef.current) {
        audioRef.current.muted = next;
      }
      return next;
    });
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    const el = stageContainerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      void el.requestFullscreen?.().catch(() => undefined);
    } else {
      void document.exitFullscreen?.().catch(() => undefined);
    }
  }, []);

  // Keyboard shortcuts (Space: play/pause)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleTogglePlay]);

  // Before first user start, showcase the rich completed Scene 1 preview (t = 12.4s) on the canvas
  const renderTime = !hasStarted && !isPlaying && currentTime === 0 ? 12.4 : currentTime;
  const activeScene = findActiveScene(WHITEBOARD_SCENES, renderTime);
  const activeCue = findActiveNarrationCue(NARRATION_CUES, renderTime);

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F5F7] text-[#0F172A]">
      {/* Hidden Primary Original Audio Source */}
      <audio
        ref={audioRef}
        src={AUDIO_URL}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) {
            setDuration(d);
          }
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(duration);
        }}
        onError={() => {
          setAudioError('تعذر تحميل ملف الصوت الأصلي. تأكد من توفر الملف في المسار الصحيح.');
        }}
      />

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-element Brand Wordmark */}
          <a
            href="#top"
            className="text-lg font-bold tracking-tight text-slate-950 whitespace-nowrap shrink-0"
          >
            السبورة التاريخية
          </a>

          {/* Zone 2: 5 concise single-line chapter navigation links */}
          <nav
            aria-label="فصول الدرس"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
          >
            {CHAPTERS.map((ch) => {
              const isCurrent = activeScene.chapterId === ch.id;
              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => handleSeek(ch.startTime)}
                  className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                    isCurrent
                      ? 'border-blue-700 text-slate-950 font-semibold'
                      : 'border-transparent hover:text-slate-950 hover:border-slate-300'
                  }`}
                >
                  {ch.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 Primary CTA */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => {
                if (audioRef.current && !audioRef.current.paused) {
                  audioRef.current.pause();
                }
                setIsExportOpen(true);
              }}
              className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-slate-900 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              تصدير الفيديو
            </button>
          </div>
        </div>
      </header>

      {/* Main Two-Zone Educational Whiteboard Workspace */}
      <main id="top" className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-5 sm:py-6">
        {audioError && (
          <div
            role="alert"
            className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-800"
          >
            {audioError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
          {/* Primary Visual Stage + Transport Controls */}
          <section aria-label="عرض السبورة البيضاء" className="space-y-4 min-w-0">
            <WhiteboardStage
              scenes={WHITEBOARD_SCENES}
              allElements={ALL_BOARD_ELEMENTS}
              assets={assets}
              assetsLoaded={assetsLoaded}
              isPlaying={isPlaying}
              hasStarted={hasStarted}
              pageScrollEnabled={pageScrollEnabled}
              showCaptions={showCaptions}
              activeCue={activeCue}
              currentTime={renderTime}
              duration={duration}
              audioRef={audioRef}
              canvasRef={canvasRef}
              stageContainerRef={stageContainerRef}
              onTogglePlay={handleTogglePlay}
              onRestart={handleRestart}
              onToggleFullscreen={handleToggleFullscreen}
              onFrameTimeUpdate={setCurrentTime}
              textWidthsRef={textWidthsRef}
            />

            <TransportControls
              isPlaying={isPlaying}
              currentTime={hasStarted ? currentTime : 0}
              duration={duration}
              playbackRate={playbackRate}
              isMuted={isMuted}
              pageScrollEnabled={pageScrollEnabled}
              showCaptions={showCaptions}
              scenes={WHITEBOARD_SCENES}
              onTogglePlay={handleTogglePlay}
              onSeek={handleSeek}
              onSkip={handleSkip}
              onPlaybackRateChange={handlePlaybackRateChange}
              onToggleMute={handleToggleMute}
              onTogglePageScroll={() => setPageScrollEnabled((v) => !v)}
              onToggleCaptions={() => setShowCaptions((v) => !v)}
            />

            {/* Clean Unboxed Lesson Summary Strip */}
            <div className="pt-1 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-950 leading-snug">
                  {activeScene.title}
                </h1>
                <p className="mt-1 text-sm text-slate-600">{activeScene.subtitle}</p>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                <span className="font-semibold text-slate-700">
                  المشهد {activeScene.index} / {WHITEBOARD_SCENES.length}
                </span>
                <span aria-hidden="true">·</span>
                <span>{activeScene.chapterLabel}</span>
                <span aria-hidden="true">·</span>
                <span>سبورة مترابطة ممتدة</span>
              </div>
            </div>
          </section>

          {/* Secondary Deck: 10 Scenes + Synchronized Narration Script */}
          <SceneSidebar
            scenes={WHITEBOARD_SCENES}
            cues={NARRATION_CUES}
            activeSceneId={activeScene.id}
            activeCueId={activeCue?.id ?? null}
            currentTime={renderTime}
            onSeek={handleSeek}
          />
        </div>
      </main>

      <ExportModal
        isOpen={isExportOpen}
        scenes={WHITEBOARD_SCENES}
        allElements={ALL_BOARD_ELEMENTS}
        assets={assets}
        pageScrollEnabled={pageScrollEnabled}
        onClose={() => setIsExportOpen(false)}
      />
    </div>
  );
}
