import { ArrayBufferTarget as Mp4ArrayBufferTarget, Muxer as Mp4Muxer } from 'mp4-muxer';
import { ArrayBufferTarget as WebmArrayBufferTarget, Muxer as WebmMuxer } from 'webm-muxer';
import type { DrawElement, WhiteboardScene } from '../types/whiteboard';
import type { WhiteboardAssets } from './handMatte';
import { AUDIO_DURATION, AUDIO_URL, findActiveScene } from './timing';
import { createStaticLayerCache, renderWhiteboardFrame } from './whiteboardRenderer';

export type ExportPresetId = 'fast' | '720p' | '1080p';

export interface ExportPresetConfig {
  id: ExportPresetId;
  label: string;
  detail: string;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  avcCodec: string;
}

export const EXPORT_PRESETS: Record<ExportPresetId, ExportPresetConfig> = {
  fast: {
    id: 'fast',
    label: 'تصدير فائق السرعة',
    detail: '540p · 15 FPS',
    width: 960,
    height: 540,
    fps: 15,
    bitrate: 2_200_000,
    avcCodec: 'avc1.42001f',
  },
  '720p': {
    id: '720p',
    label: 'جودة متوازنة HD',
    detail: '720p · 20 FPS',
    width: 1280,
    height: 720,
    fps: 20,
    bitrate: 3_500_000,
    avcCodec: 'avc1.42001f',
  },
  '1080p': {
    id: '1080p',
    label: 'جودة عالية Full HD',
    detail: '1080p · 24 FPS',
    width: 1920,
    height: 1080,
    fps: 24,
    bitrate: 6_500_000,
    avcCodec: 'avc1.4d002a',
  },
};

export interface FastExportProgress {
  phase: 'audio' | 'rendering' | 'finalizing';
  currentTime: number;
  duration: number;
  pct: number;
  speedMultiplier: number;
  etaSeconds: number;
}

export interface FastExportResult {
  blob: Blob;
  mimeType: string;
  extension: 'mp4' | 'webm';
  elapsedSeconds: number;
}

function yieldMicro(): Promise<void> {
  return new Promise((resolve) => {
    const mc = new MessageChannel();
    mc.port1.onmessage = () => resolve();
    mc.port2.postMessage(null);
  });
}

function yieldPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

interface NormalizedAudioData {
  sampleRate: number;
  numberOfChannels: number;
  length: number;
  duration: number;
  channels: Float32Array[];
}

let cachedNormalizedAudioPromise: Promise<NormalizedAudioData> | null = null;

function resampleFloat32Linear(
  input: Float32Array,
  fromRate: number,
  toRate: number
): Float32Array {
  if (fromRate === toRate) return input;
  const outLength = Math.ceil((input.length * toRate) / fromRate);
  const output = new Float32Array(outLength);
  const ratio = fromRate / toRate;
  const lastIdx = input.length - 1;
  for (let i = 0; i < outLength; i++) {
    const srcPos = i * ratio;
    const idx = Math.floor(srcPos);
    const frac = srcPos - idx;
    const s0 = input[idx];
    const s1 = idx < lastIdx ? input[idx + 1] : s0;
    output[i] = s0 + (s1 - s0) * frac;
  }
  return output;
}

async function decodeAndNormalizeAudio(
  url: string,
  targetSampleRate = 48000
): Promise<NormalizedAudioData> {
  if (cachedNormalizedAudioPromise) {
    return cachedNormalizedAudioPromise;
  }

  const task = (async (): Promise<NormalizedAudioData> => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('تعذر تحميل الملف الصوتي للتصدير.');
    }
    const arrayBuffer = await response.arrayBuffer();
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const tempCtx = new AudioCtx();
    try {
      const decoded = await tempCtx.decodeAudioData(arrayBuffer);
      const chCount = Math.min(2, Math.max(1, decoded.numberOfChannels));
      const channels: Float32Array[] = [];
      for (let ch = 0; ch < chCount; ch++) {
        const raw = decoded.getChannelData(ch);
        channels.push(
          decoded.sampleRate === targetSampleRate
            ? new Float32Array(raw)
            : resampleFloat32Linear(raw, decoded.sampleRate, targetSampleRate)
        );
      }
      return {
        sampleRate: targetSampleRate,
        numberOfChannels: chCount,
        length: channels[0]?.length ?? 0,
        duration: decoded.duration,
        channels,
      };
    } finally {
      if (tempCtx.state !== 'closed') {
        await tempCtx.close();
      }
    }
  })();

  cachedNormalizedAudioPromise = task.catch((err) => {
    cachedNormalizedAudioPromise = null;
    throw err;
  });

  return cachedNormalizedAudioPromise;
}

interface SelectedWebCodecsProfile {
  container: 'mp4' | 'webm';
  videoConfig: VideoEncoderConfig;
  audioConfig: AudioEncoderConfig;
}

async function selectWebCodecsProfile(
  preset: ExportPresetConfig,
  sampleRate: number,
  numberOfChannels: number
): Promise<SelectedWebCodecsProfile | null> {
  if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined') {
    return null;
  }

  // 1. Prefer MP4 (H.264 + AAC) for universal playback
  const mp4VideoCandidates: VideoEncoderConfig[] = [
    {
      codec: preset.avcCodec,
      width: preset.width,
      height: preset.height,
      bitrate: preset.bitrate,
      framerate: preset.fps,
      latencyMode: 'realtime',
      hardwareAcceleration: 'prefer-hardware',
    },
    {
      codec: preset.avcCodec,
      width: preset.width,
      height: preset.height,
      bitrate: preset.bitrate,
      framerate: preset.fps,
      latencyMode: 'realtime',
    },
    {
      codec: 'avc1.42E01E',
      width: preset.width,
      height: preset.height,
      bitrate: preset.bitrate,
      framerate: preset.fps,
      latencyMode: 'realtime',
    },
  ];

  const mp4AudioConfig: AudioEncoderConfig = {
    codec: 'mp4a.40.2',
    sampleRate,
    numberOfChannels,
    bitrate: 128_000,
  };

  try {
    const aacSupport = await AudioEncoder.isConfigSupported(mp4AudioConfig);
    if (aacSupport.supported) {
      for (const vc of mp4VideoCandidates) {
        const vSupport = await VideoEncoder.isConfigSupported(vc);
        if (vSupport.supported) {
          return {
            container: 'mp4',
            videoConfig: vSupport.config ?? vc,
            audioConfig: aacSupport.config ?? mp4AudioConfig,
          };
        }
      }
    }
  } catch {
    // Fall through to WebM
  }

  // 2. Fallback to ultra-fast WebM (VP8 + Opus — supported natively across Chromium)
  const webmVideoCandidates: VideoEncoderConfig[] = [
    {
      codec: 'vp8',
      width: preset.width,
      height: preset.height,
      bitrate: preset.bitrate,
      framerate: preset.fps,
      latencyMode: 'realtime',
    },
    {
      codec: 'vp09.00.10.08',
      width: preset.width,
      height: preset.height,
      bitrate: preset.bitrate,
      framerate: preset.fps,
      latencyMode: 'realtime',
    },
  ];

  const opusConfig: AudioEncoderConfig = {
    codec: 'opus',
    sampleRate,
    numberOfChannels,
    bitrate: 128_000,
  };

  try {
    const opusSupport = await AudioEncoder.isConfigSupported(opusConfig);
    if (opusSupport.supported) {
      for (const vc of webmVideoCandidates) {
        const vSupport = await VideoEncoder.isConfigSupported(vc);
        if (vSupport.supported) {
          return {
            container: 'webm',
            videoConfig: vSupport.config ?? vc,
            audioConfig: opusSupport.config ?? opusConfig,
          };
        }
      }
    }
  } catch {
    return null;
  }

  return null;
}

export async function exportWhiteboardFast(options: {
  preset: ExportPresetId;
  scenes: WhiteboardScene[];
  allElements: DrawElement[];
  assets: WhiteboardAssets | null;
  pageScrollEnabled: boolean;
  signal: AbortSignal;
  onProgress: (progress: FastExportProgress) => void;
}): Promise<FastExportResult> {
  const { preset: presetId, scenes, allElements, assets, pageScrollEnabled, signal, onProgress } =
    options;
  const preset = EXPORT_PRESETS[presetId];
  const startedAt = performance.now();

  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready;
  }

  onProgress({
    phase: 'audio',
    currentTime: 0,
    duration: AUDIO_DURATION,
    pct: 1,
    speedMultiplier: 0,
    etaSeconds: 0,
  });

  const audioBuffer = await decodeAndNormalizeAudio(AUDIO_URL, 48000);
  if (signal.aborted) {
    throw new DOMException('Export aborted', 'AbortError');
  }

  const duration = Math.min(AUDIO_DURATION, audioBuffer.duration || AUDIO_DURATION);
  const profile = await selectWebCodecsProfile(
    preset,
    audioBuffer.sampleRate,
    audioBuffer.numberOfChannels
  );

  if (!profile) {
    throw new Error('المتصفح لا يدعم التصدير السريع عبر WebCodecs.');
  }

  const offCanvas = document.createElement('canvas');
  offCanvas.width = preset.width;
  offCanvas.height = preset.height;
  const ctx = offCanvas.getContext('2d', { alpha: false });
  if (!ctx) {
    throw new Error('تعذر تهيئة لوحة الرسم للتصدير.');
  }

  const isMp4 = profile.container === 'mp4';
  const mp4Target = isMp4 ? new Mp4ArrayBufferTarget() : null;
  const webmTarget = !isMp4 ? new WebmArrayBufferTarget() : null;

  const mp4Muxer = isMp4
    ? new Mp4Muxer({
        target: mp4Target!,
        video: {
          codec: 'avc',
          width: preset.width,
          height: preset.height,
          frameRate: preset.fps,
        },
        audio: {
          codec: 'aac',
          numberOfChannels: audioBuffer.numberOfChannels,
          sampleRate: audioBuffer.sampleRate,
        },
        fastStart: 'in-memory',
        firstTimestampBehavior: 'offset',
      })
    : null;

  const webmCodecId = profile.videoConfig.codec.startsWith('vp09') ? 'V_VP9' : 'V_VP8';
  const webmMuxer = !isMp4
    ? new WebmMuxer({
        target: webmTarget!,
        video: {
          codec: webmCodecId,
          width: preset.width,
          height: preset.height,
          frameRate: preset.fps,
        },
        audio: {
          codec: 'A_OPUS',
          numberOfChannels: audioBuffer.numberOfChannels,
          sampleRate: audioBuffer.sampleRate,
        },
        firstTimestampBehavior: 'offset',
      })
    : null;

  let encoderError: Error | null = null;

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      if (mp4Muxer) mp4Muxer.addVideoChunk(chunk, meta);
      else if (webmMuxer) webmMuxer.addVideoChunk(chunk, meta);
    },
    error: (err) => {
      encoderError = err instanceof Error ? err : new Error(String(err));
    },
  });

  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => {
      if (mp4Muxer) mp4Muxer.addAudioChunk(chunk, meta);
      else if (webmMuxer) webmMuxer.addAudioChunk(chunk, meta);
    },
    error: (err) => {
      encoderError = err instanceof Error ? err : new Error(String(err));
    },
  });

  videoEncoder.configure(profile.videoConfig);
  audioEncoder.configure(profile.audioConfig);

  // Interleave 1-second audio chunks with video frames so VideoEncoder & AudioEncoder run concurrently
  const chunkFrames = audioBuffer.sampleRate;
  const channels = audioBuffer.numberOfChannels;
  const totalSamples = audioBuffer.length;
  let audioOffset = 0;

  const encodeAudioUpToSample = (targetSample: number) => {
    while (audioOffset < targetSample && audioOffset < totalSamples && !signal.aborted && !encoderError) {
      const frames = Math.min(chunkFrames, totalSamples - audioOffset);
      const planar = new Float32Array(frames * channels);
      for (let ch = 0; ch < channels; ch++) {
        planar.set(audioBuffer.channels[ch].subarray(audioOffset, audioOffset + frames), ch * frames);
      }
      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate: audioBuffer.sampleRate,
        numberOfFrames: frames,
        numberOfChannels: channels,
        timestamp: Math.round((audioOffset / audioBuffer.sampleRate) * 1_000_000),
        data: planar,
      });
      audioEncoder.encode(audioData);
      audioData.close();
      audioOffset += frames;
    }
  };

  // Render & encode all video frames + interleaved audio concurrently using StaticLayerCache
  const renderStartedAt = performance.now();
  const totalFrames = Math.ceil(duration * preset.fps);
  const frameDurationUs = Math.round(1_000_000 / preset.fps);
  const keyFrameEvery = preset.fps * 3;
  const layerCache = createStaticLayerCache(preset.width, preset.height);
  const textWidths: Record<string, number> = {};
  let lastUiAt = performance.now();

  for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
    if (signal.aborted) {
      videoEncoder.close();
      audioEncoder.close();
      throw new DOMException('Export aborted', 'AbortError');
    }
    if (encoderError) {
      throw encoderError;
    }

    const t = Math.min(duration, frameIdx / preset.fps);
    encodeAudioUpToSample(Math.ceil((t + 0.5) * audioBuffer.sampleRate));

    const activeScene = findActiveScene(scenes, t);

    renderWhiteboardFrame(ctx, preset.width, preset.height, {
      time: t,
      activeScene,
      allElements,
      assets,
      pageScrollEnabled,
      textWidths,
      layerCache,
    });

    const videoFrame = new VideoFrame(offCanvas, {
      timestamp: Math.round((frameIdx / preset.fps) * 1_000_000),
      duration: frameDurationUs,
    });

    videoEncoder.encode(videoFrame, {
      keyFrame: frameIdx % keyFrameEvery === 0,
    });
    videoFrame.close();

    // Manage encoder backpressure with zero-clamp MessageChannel yield
    while (
      (videoEncoder.encodeQueueSize >= 24 || audioEncoder.encodeQueueSize >= 48) &&
      !signal.aborted &&
      !encoderError
    ) {
      await yieldMicro();
    }

    const now = performance.now();
    if (frameIdx === 0 || now - lastUiAt >= 180) {
      lastUiAt = now;
      const elapsedSec = Math.max(0.05, (now - renderStartedAt) / 1000);
      const speedMultiplier = t / elapsedSec;
      const etaSeconds = speedMultiplier > 0.05 ? Math.max(0, (duration - t) / speedMultiplier) : 0;
      const pct = Math.min(99, Math.max(2, Math.round(((frameIdx + 1) / totalFrames) * 98) + 1));
      onProgress({
        phase: 'rendering',
        currentTime: t,
        duration,
        pct,
        speedMultiplier,
        etaSeconds,
      });
      await yieldPaint();
    }
  }

  encodeAudioUpToSample(totalSamples);

  onProgress({
    phase: 'finalizing',
    currentTime: duration,
    duration,
    pct: 99,
    speedMultiplier: 0,
    etaSeconds: 0,
  });

  await Promise.all([videoEncoder.flush(), audioEncoder.flush()]);
  videoEncoder.close();
  audioEncoder.close();

  if (mp4Muxer && mp4Target) {
    mp4Muxer.finalize();
    const blob = new Blob([mp4Target.buffer], { type: 'video/mp4' });
    return {
      blob,
      mimeType: 'video/mp4',
      extension: 'mp4',
      elapsedSeconds: (performance.now() - startedAt) / 1000,
    };
  }

  if (webmMuxer && webmTarget) {
    webmMuxer.finalize();
    const blob = new Blob([webmTarget.buffer], { type: 'video/webm' });
    return {
      blob,
      mimeType: 'video/webm',
      extension: 'webm',
      elapsedSeconds: (performance.now() - startedAt) / 1000,
    };
  }

  throw new Error('تعذر إتمام تجميع ملف الفيديو.');
}
