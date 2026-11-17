import React from 'react';
import {
  Camera,
  Captions,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { WhiteboardScene } from '../types/whiteboard';
import { formatTimecode } from '../utils/timing';

interface TransportControlsProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  isMuted: boolean;
  pageScrollEnabled: boolean;
  showCaptions: boolean;
  scenes: WhiteboardScene[];
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onSkip: (deltaSeconds: number) => void;
  onPlaybackRateChange: (rate: number) => void;
  onToggleMute: () => void;
  onTogglePageScroll: () => void;
  onToggleCaptions: () => void;
}

const SPEED_OPTIONS = [1, 1.25, 1.5];

export const TransportControls: React.FC<TransportControlsProps> = ({
  isPlaying,
  currentTime,
  duration,
  playbackRate,
  isMuted,
  pageScrollEnabled,
  showCaptions,
  scenes,
  onTogglePlay,
  onSeek,
  onSkip,
  onPlaybackRateChange,
  onToggleMute,
  onTogglePageScroll,
  onToggleCaptions,
}) => {
  const safeDuration = Math.max(1, duration);
  const progressPct = Math.min(100, Math.max(0, (currentTime / safeDuration) * 100));

  return (
    <div className="rounded-xl bg-white border border-slate-200 p-3.5 sm:p-4">
      {/* Interactive Timeline Scrubber with Scene Chapter Markers */}
      <div className="relative mb-3" dir="ltr">
        <div className="relative h-6 flex items-center">
          {/* Chapter Tick Marks */}
          <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full bg-blue-700 transition-[width] duration-75"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {scenes.map((scene) => {
            if (scene.startTime <= 0) return null;
            const leftPct = (scene.startTime / safeDuration) * 100;
            return (
              <span
                key={scene.id}
                aria-hidden="true"
                title={scene.title}
                className="pointer-events-none absolute top-1/2 -translate-y-1/2 w-0.5 h-2.5 bg-slate-400/70"
                style={{ left: `${leftPct}%` }}
              />
            );
          })}
          <input
            type="range"
            aria-label="شريط التقدم الزمني للفيديو"
            min={0}
            max={safeDuration}
            step={0.1}
            value={Math.min(safeDuration, currentTime)}
            onChange={(e) => onSeek(parseFloat(e.target.value))}
            dir="ltr"
            className="timeline-slider relative z-10 w-full m-0"
          />
        </div>
      </div>

      {/* Transport Buttons & Studio Toggles */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Right Group (in RTL): Play, Skip, Mute, Timecode */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? 'إيقاف مؤقت' : 'تشغيل'}
            className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-slate-900 hover:bg-blue-700 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
            <span>{isPlaying ? 'إيقاف' : 'تشغيل'}</span>
          </button>

          <button
            type="button"
            onClick={() => onSkip(-10)}
            aria-label="رجوع ١٠ ثوانٍ"
            className="inline-flex items-center justify-center gap-1 h-10 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>١٠ث</span>
          </button>

          <button
            type="button"
            onClick={() => onSkip(10)}
            aria-label="تقديم ١٠ ثوانٍ"
            className="inline-flex items-center justify-center gap-1 h-10 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>١٠ث</span>
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            aria-label={isMuted ? 'إلغاء كتم الصوت' : 'كتم الصوت'}
            className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors shrink-0"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-red-700" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <div
            dir="ltr"
            className="px-2.5 text-xs sm:text-sm font-mono-code tabular-nums text-slate-700 whitespace-nowrap shrink-0"
          >
            <span className="font-semibold text-slate-950">{formatTimecode(currentTime)}</span>
            <span className="text-slate-400 mx-1">/</span>
            <span className="text-slate-500">{formatTimecode(safeDuration)}</span>
          </div>
        </div>

        {/* Left Group (in RTL): Page-Fill Scroll Toggle, Captions Toggle, Playback Speed */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onTogglePageScroll}
            aria-pressed={pageScrollEnabled}
            className={`inline-flex items-center gap-1.5 h-10 px-3 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 ${
              pageScrollEnabled
                ? 'bg-blue-50 border-blue-200 text-blue-800'
                : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>تمرير عند امتلاء الصفحة</span>
          </button>

          <button
            type="button"
            onClick={onToggleCaptions}
            aria-pressed={showCaptions}
            className={`inline-flex items-center gap-1.5 h-10 px-3 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 ${
              showCaptions
                ? 'bg-blue-50 border-blue-200 text-blue-800'
                : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
            }`}
          >
            <Captions className="w-3.5 h-3.5" />
            <span>النص المتزامن</span>
          </button>

          <div
            role="group"
            aria-label="سرعة التشغيل"
            className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
          >
            {SPEED_OPTIONS.map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => onPlaybackRateChange(rate)}
                className={`px-2.5 py-1.5 text-xs font-mono-code tabular-nums font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  playbackRate === rate
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
