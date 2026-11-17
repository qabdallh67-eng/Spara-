import React, { useState } from 'react';
import type { NarrationCue, WhiteboardScene } from '../types/whiteboard';
import { clamp, formatTimecode } from '../utils/timing';

interface SceneSidebarProps {
  scenes: WhiteboardScene[];
  cues: NarrationCue[];
  activeSceneId: string;
  activeCueId: string | null;
  currentTime: number;
  onSeek: (time: number) => void;
}

function renderHighlightedCueText(cue: NarrationCue): React.ReactNode {
  if (!cue.keywords || cue.keywords.length === 0) {
    return cue.text;
  }
  const parts: Array<{ text: string; type?: 'date' | 'name' | 'concept' }> = [
    { text: cue.text },
  ];

  for (const kw of cue.keywords) {
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.type) continue;
      const idx = part.text.indexOf(kw.word);
      if (idx !== -1) {
        const before = part.text.slice(0, idx);
        const match = part.text.slice(idx, idx + kw.word.length);
        const after = part.text.slice(idx + kw.word.length);
        const replacement: typeof parts = [];
        if (before) replacement.push({ text: before });
        replacement.push({ text: match, type: kw.type });
        if (after) replacement.push({ text: after });
        parts.splice(i, 1, ...replacement);
        break;
      }
    }
  }

  return parts.map((p, idx) => {
    if (p.type === 'date') {
      return (
        <span key={idx} className="font-semibold text-red-700">
          {p.text}
        </span>
      );
    }
    if (p.type === 'name') {
      return (
        <span key={idx} className="font-semibold text-blue-700">
          {p.text}
        </span>
      );
    }
    if (p.type === 'concept') {
      return (
        <span key={idx} className="font-semibold text-emerald-700">
          {p.text}
        </span>
      );
    }
    return <React.Fragment key={idx}>{p.text}</React.Fragment>;
  });
}

export const SceneSidebar: React.FC<SceneSidebarProps> = ({
  scenes,
  cues,
  activeSceneId,
  activeCueId,
  currentTime,
  onSeek,
}) => {
  const [activeTab, setActiveTab] = useState<'scenes' | 'transcript'>('scenes');

  return (
    <aside
      aria-label="فهرس المشاهد والنص الصوتي"
      className="flex flex-col rounded-xl bg-white border border-slate-200 overflow-hidden lg:h-[calc(100vh-148px)] lg:min-h-[540px] lg:max-h-[780px]"
    >
      {/* Segmented Control Tabs */}
      <div className="p-3 border-b border-slate-200/80">
        <div role="tablist" className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'scenes'}
            onClick={() => setActiveTab('scenes')}
            className={`px-3 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'scenes'
                ? 'bg-white text-slate-950 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            المشاهد ({scenes.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'transcript'}
            onClick={() => setActiveTab('transcript')}
            className={`px-3 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'transcript'
                ? 'bg-white text-slate-950 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            النص الصوتي الكامل
          </button>
        </div>
      </div>

      {/* Scrollable Deck Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {activeTab === 'scenes' ? (
          scenes.map((scene) => {
            const isActive = scene.id === activeSceneId;
            const sceneDur = Math.max(1, scene.endTime - scene.startTime);
            const sceneProgress = isActive
              ? clamp(((currentTime - scene.startTime) / sceneDur) * 100, 0, 100)
              : currentTime >= scene.endTime
                ? 100
                : 0;

            return (
              <button
                key={scene.id}
                type="button"
                onClick={() => onSeek(scene.startTime)}
                className={`w-full text-right rounded-lg p-3 border transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
                  isActive
                    ? 'bg-blue-50/70 border-blue-200'
                    : 'bg-white border-slate-200/70 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                {/* Unboxed clean metadata line */}
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-1">
                  <span className={isActive ? 'font-semibold text-blue-800' : 'font-medium text-slate-600'}>
                    {String(scene.index).padStart(2, '0')} · {scene.chapterLabel}
                  </span>
                  <span dir="ltr" className="font-mono-code tabular-nums">
                    {formatTimecode(scene.startTime)}
                  </span>
                </div>

                <div className="text-sm font-semibold text-slate-950 leading-snug">
                  {scene.title}
                </div>
                <div className="mt-1 text-xs text-slate-600 leading-relaxed">
                  {scene.subtitle}
                </div>

                {/* Scene progress hairline */}
                <div className="mt-2.5 h-1 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full transition-[width] duration-150 ${
                      isActive ? 'bg-blue-700' : 'bg-slate-300'
                    }`}
                    style={{ width: `${sceneProgress}%` }}
                  />
                </div>
              </button>
            );
          })
        ) : (
          cues.map((cue) => {
            const isActive = cue.id === activeCueId;
            return (
              <button
                key={cue.id}
                type="button"
                onClick={() => onSeek(cue.startTime)}
                className={`w-full text-right rounded-lg p-3 border transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
                  isActive
                    ? 'bg-blue-50/70 border-blue-200'
                    : 'bg-white border-slate-200/70 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                  <span className={isActive ? 'font-semibold text-blue-800' : ''}>
                    {isActive ? 'يُعرض الآن' : 'انقر للانتقال'}
                  </span>
                  <span dir="ltr" className="font-mono-code tabular-nums">
                    {formatTimecode(cue.startTime)} – {formatTimecode(cue.endTime)}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-slate-900">
                  {renderHighlightedCueText(cue)}
                </p>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
};
