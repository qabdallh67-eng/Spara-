import React, { useEffect, useRef, useState } from 'react';
import { Download, Film, X, Zap } from 'lucide-react';
import type { DrawElement, WhiteboardScene } from '../types/whiteboard';
import type { WhiteboardAssets } from '../utils/handMatte';
import {
  EXPORT_PRESETS,
  type ExportPresetId,
  type FastExportProgress,
  exportWhiteboardFast,
} from '../utils/fastVideoExporter';
import { renderWhiteboardFrame } from '../utils/whiteboardRenderer';
import { AUDIO_DURATION, AUDIO_URL, findActiveScene, formatTimecode } from '../utils/timing';

interface ExportModalProps {
  isOpen: boolean;
  scenes: WhiteboardScene[];
  allElements: DrawElement[];
  assets: WhiteboardAssets | null;
  pageScrollEnabled: boolean;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  scenes,
  allElements,
  assets,
  pageScrollEnabled,
  onClose,
}) => {
  const [preset, setPreset] = useState<ExportPresetId>('fast');
  const [status, setStatus] = useState<'idle' | 'recording' | 'ready' | 'error'>('idle');
  const [progress, setProgress] = useState<FastExportProgress>({
    phase: 'rendering',
    currentTime: 0,
    duration: AUDIO_DURATION,
    pct: 0,
    speedMultiplier: 0,
    etaSeconds: 0,
  });
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [fileExt, setFileExt] = useState<'mp4' | 'webm'>('mp4');
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number>(0);

  const cleanup = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    cancelAnimationFrame(rafRef.current);
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.src = '';
      audioElRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      void audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    recorderRef.current = null;
  };

  useEffect(() => {
    if (!isOpen) {
      cleanup();
      setStatus('idle');
      setProgress({
        phase: 'rendering',
        currentTime: 0,
        duration: AUDIO_DURATION,
        pct: 0,
        speedMultiplier: 0,
        etaSeconds: 0,
      });
      setErrorMsg(null);
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
        setDownloadUrl(null);
      }
    }
    return () => {
      cleanup();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const startMediaRecorderFallback = async (selected: ExportPresetId) => {
    const cfg = EXPORT_PRESETS[selected];
    const offCanvas = document.createElement('canvas');
    offCanvas.width = cfg.width;
    offCanvas.height = cfg.height;
    const ctx = offCanvas.getContext('2d');
    if (!ctx) throw new Error('تعذر تهيئة لوحة الرسم للتصدير.');

    const audioEl = new Audio();
    audioEl.crossOrigin = 'anonymous';
    audioEl.src = AUDIO_URL;
    audioEl.preload = 'auto';
    audioElRef.current = audioEl;

    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const source = audioCtx.createMediaElementSource(audioEl);
    const dest = audioCtx.createMediaStreamDestination();
    source.connect(dest);

    const videoStream = offCanvas.captureStream(cfg.fps);
    const combined = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ]);

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : 'video/webm';

    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(combined, {
      mimeType,
      videoBitsPerSecond: cfg.bitrate,
    });
    recorderRef.current = recorder;

    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) chunks.push(ev.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      setFileExt('webm');
      setDownloadUrl(url);
      setStatus('ready');
      cleanup();
    };

    const textWidths: Record<string, number> = {};
    const renderLoop = () => {
      const t = audioEl.currentTime;
      const scene = findActiveScene(scenes, t);
      renderWhiteboardFrame(ctx, cfg.width, cfg.height, {
        time: t,
        activeScene: scene,
        allElements,
        assets,
        pageScrollEnabled,
        textWidths,
      });
      setProgress({
        phase: 'rendering',
        currentTime: t,
        duration: AUDIO_DURATION,
        pct: Math.min(100, Math.round((t / AUDIO_DURATION) * 100)),
        speedMultiplier: 1,
        etaSeconds: Math.max(0, AUDIO_DURATION - t),
      });
      if (!audioEl.paused && !audioEl.ended) {
        rafRef.current = requestAnimationFrame(renderLoop);
      }
    };

    audioEl.onended = () => {
      if (recorder.state === 'recording') recorder.stop();
    };

    recorder.start(500);
    await audioEl.play();
    rafRef.current = requestAnimationFrame(renderLoop);
  };

  const startExport = async () => {
    setErrorMsg(null);
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }

    setStatus('recording');
    setProgress({
      phase: 'audio',
      currentTime: 0,
      duration: AUDIO_DURATION,
      pct: 1,
      speedMultiplier: 0,
      etaSeconds: 0,
    });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      if (typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined') {
        try {
          const result = await exportWhiteboardFast({
            preset,
            scenes,
            allElements,
            assets,
            pageScrollEnabled,
            signal: controller.signal,
            onProgress: (p) => setProgress(p),
          });
          const url = URL.createObjectURL(result.blob);
          setFileExt(result.extension);
          setElapsedSec(result.elapsedSeconds);
          setDownloadUrl(url);
          setStatus('ready');
          return;
        } catch (fastError) {
          if (fastError instanceof DOMException && fastError.name === 'AbortError') {
            throw fastError;
          }
          // Some Android browsers expose WebCodecs but do not support the
          // required H.264/AAC encoder profile. Try the compatible recorder path.
          if (typeof MediaRecorder === 'undefined') {
            throw fastError;
          }
        }
      }

      if (typeof MediaRecorder !== 'undefined') {
        await startMediaRecorderFallback(preset);
        return;
      }

      throw new Error('متصفحك لا يدعم تصدير الفيديو.');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setStatus('idle');
        return;
      }
      cleanup();
      setStatus('error');
      setErrorMsg(
        err instanceof Error ? err.message : 'حدث خطأ أثناء تجهيز تصدير الفيديو.'
      );
    }
  };

  const cancelExport = () => {
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop();
      return;
    }
    cleanup();
    setStatus('idle');
  };

  const presetList: ExportPresetId[] = ['fast', '720p', '1080p'];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-lg rounded-xl bg-white border border-slate-200 shadow-xl p-6">
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <Film className="w-5 h-5 text-blue-700" />
            <h2 id="export-modal-title" className="text-lg font-bold text-slate-950">
              تصدير سريع لفيديو السبورة
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق نافذة التصدير"
            className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="py-5 space-y-4">
          <p className="text-sm text-slate-600 leading-relaxed">
            تصدير مباشر فائق السرعة دون انتظار زمن الفيديو، متزامن بالكامل مع الصوت الأصلي وبجودة ١٦:٩.
          </p>

          <div>
            <span className="block text-xs font-semibold text-slate-700 mb-2">
              سرعة ودقة التصدير
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {presetList.map((id) => {
                const item = EXPORT_PRESETS[id];
                const selected = preset === id;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={status === 'recording'}
                    onClick={() => setPreset(id)}
                    className={`rounded-lg border px-3 py-2.5 text-right transition-colors ${
                      selected
                        ? 'bg-blue-50 border-blue-400 text-blue-950'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      {id === 'fast' && <Zap className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
                      <span>{item.label}</span>
                    </div>
                    <div
                      dir="ltr"
                      className="mt-1 text-[11px] text-slate-500 font-mono-code whitespace-nowrap text-right"
                    >
                      {item.detail}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {status === 'recording' && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span>
                  {progress.phase === 'audio'
                    ? 'جارٍ تجهيز المسار الصوتي...'
                    : progress.phase === 'finalizing'
                      ? 'جارٍ تجميع وحفظ الملف النهائي...'
                      : 'جارٍ التصيير السريع للإطارات...'}
                </span>
                <span dir="ltr" className="font-mono-code tabular-nums">
                  {formatTimecode(progress.currentTime)} / {formatTimecode(progress.duration)} ({progress.pct}%)
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full bg-blue-700 transition-[width] duration-150"
                  style={{ width: `${progress.pct}%` }}
                />
              </div>
              {progress.phase === 'rendering' && progress.speedMultiplier > 0 && (
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>سرعة المعالجة: {progress.speedMultiplier.toFixed(1)}x</span>
                  <span>
                    المتبقي تقريباً: {Math.max(1, Math.ceil(progress.etaSeconds))} ثانية
                  </span>
                </div>
              )}
            </div>
          )}

          {status === 'ready' && downloadUrl && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3.5 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-emerald-900">
                  اكتمل تصدير الفيديو بنجاح
                </div>
                {elapsedSec > 0 && (
                  <div className="text-xs text-emerald-700 mt-0.5">
                    تم التصدير في {elapsedSec.toFixed(1)} ثانية ({fileExt.toUpperCase()})
                  </div>
                )}
              </div>
              <a
                href={downloadUrl}
                download={`whiteboard-1952-${preset}.${fileExt}`}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap"
              >
                <Download className="w-4 h-4" />
                <span>تحميل الفيديو</span>
              </a>
            </div>
          )}

          {status === 'error' && errorMsg && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
              {errorMsg}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            إغلاق
          </button>

          {status === 'recording' ? (
            <button
              type="button"
              onClick={cancelExport}
              className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white text-sm font-semibold transition-colors"
            >
              إلغاء التصدير
            </button>
          ) : (
            <button
              type="button"
              onClick={startExport}
              className="px-5 py-2 rounded-lg bg-slate-900 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
            >
              بدء التصدير السريع
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
