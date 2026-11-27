import {
  CheckCircle2,
  Download,
  Film,
  Image as ImageIcon,
  Music,
  RotateCcw,
  X,
} from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import React, { useEffect, useMemo, useState } from 'react';
import { PLATFORM_MAP } from '../data/platforms';
import {
  DownloadTask,
  MediaFormatKind,
  MediaFormatOption,
  MediaItem,
} from '../types/media';
import { PlatformIcon } from './BrandIcons';

interface MediaResultCardProps {
  item: MediaItem;
  activeTasks: DownloadTask[];
  onStartDownload: (item: MediaItem, format: MediaFormatOption) => void;
  onCancelTask: (taskId: string) => void;
  onReset: () => void;
}

const KIND_META: Record<
  MediaFormatKind,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  mp4: { label: 'Video MP4', icon: Film },
  mp3: { label: 'Audio MP3', icon: Music },
  photo: { label: 'Photo HD', icon: ImageIcon },
};

export function MediaResultCard({
  item,
  activeTasks,
  onStartDownload,
  onCancelTask,
  onReset,
}: MediaResultCardProps) {
  const platformCfg = PLATFORM_MAP[item.platform];
  const [thumbFailed, setThumbFailed] = useState(false);

  const availableKinds = useMemo(() => {
    const order: MediaFormatKind[] = ['mp4', 'mp3', 'photo'];
    return order.filter((k) => item.formats.some((f) => f.kind === k));
  }, [item.formats]);

  const [selectedKind, setSelectedKind] = useState<MediaFormatKind>(
    availableKinds[0] ?? 'mp4'
  );

  useEffect(() => {
    setThumbFailed(false);
    setSelectedKind(availableKinds[0] ?? 'mp4');
  }, [item.id, availableKinds]);

  const visibleFormats = useMemo(
    () => item.formats.filter((f) => f.kind === selectedKind),
    [item.formats, selectedKind]
  );

  return (
    <motion.section
      key={item.id}
      initial={{ opacity: 0, y: 16, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.985 }}
      transition={{
        type: 'spring',
        stiffness: 410,
        damping: 32,
        mass: 0.8,
      }}
      style={{
        borderColor: platformCfg.borderTint,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.12), 0 24px 60px -22px ${platformCfg.glowRgba}`,
      }}
      className="liquid-glass overflow-hidden rounded-3xl p-5 sm:p-7 transform-gpu"
    >
      {/* Top Preview Split: Thumbnail + Clean Unboxed Metadata */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-stretch">
        {/* Media Thumbnail with resilient CSS/SVG fallback */}
        <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#12121B] sm:w-64">
          {item.thumbnailUrl && !thumbFailed ? (
            <img
              src={item.thumbnailUrl}
              alt={`${item.title} preview thumbnail`}
              referrerPolicy="no-referrer"
              onError={() => setThumbFailed(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-violet-500/15 via-indigo-500/10 to-transparent p-4 text-center">
              <PlatformIcon
                platform={item.platform}
                className="h-8 w-8 text-violet-300"
              />
              <span className="line-clamp-2 text-xs font-medium text-zinc-400">
                {item.contentTypeLabel}
              </span>
            </div>
          )}

          {item.durationLabel && (
            <span className="absolute right-2.5 bottom-2.5 rounded-lg bg-black/75 px-2 py-0.5 font-mono text-[11px] font-medium text-zinc-100 tabular-nums backdrop-blur-sm">
              {item.durationLabel}
            </span>
          )}
        </div>

        {/* Metadata Column (Zero-Pill Discipline) */}
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              <span className="inline-flex items-center gap-1.5 font-medium text-violet-300">
                <PlatformIcon platform={item.platform} className="h-3.5 w-3.5" />
                <span>{item.contentTypeLabel}</span>
              </span>
              <span aria-hidden="true">·</span>
              <span className="truncate max-w-[200px]">{item.author}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-zinc-500">
                {(item.elapsedMs / 1000).toFixed(2)}s
              </span>
            </div>

            <h2 className="font-display text-lg font-semibold leading-snug text-white sm:text-xl [text-wrap:balance] line-clamp-2">
              {item.title}
            </h2>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            {/* Segmented Format Type Tabs */}
            <LayoutGroup id={`formats-${item.id}`}>
              <div
                role="tablist"
                aria-label="Media format types"
                className="inline-flex items-center gap-1 rounded-xl border border-white/[0.08] bg-white/[0.03] p-1"
              >
                {availableKinds.map((kind) => {
                  const isSelected = selectedKind === kind;
                  const MetaIcon = KIND_META[kind].icon;
                  return (
                    <button
                      key={kind}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      onClick={() => setSelectedKind(kind)}
                      className={`relative flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
                        isSelected ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {isSelected && (
                        <motion.span
                          layoutId="result-format-tab"
                          transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                          className="liquid-glass-pill absolute inset-0 rounded-lg transform-gpu"
                        />
                      )}
                      <span className="relative z-10 flex items-center gap-1.5">
                        <MetaIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{KIND_META[kind].label}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </LayoutGroup>

            <button
              type="button"
              onClick={onReset}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium text-zinc-400 whitespace-nowrap shrink-0 transition-colors duration-150 hover:bg-white/[0.05] hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>New Link</span>
            </button>
          </div>
        </div>
      </div>

      {/* Hairline Divider */}
      <div className="my-5 h-px w-full bg-white/[0.07]" />

      {/* Resolution / Quality Rows */}
      <AnimatePresence mode="wait">
        <motion.div
          key={selectedKind}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          className="divide-y divide-white/[0.06]"
        >
          {visibleFormats.map((fmt) => {
            const activeTask = activeTasks.find(
              (t) => t.mediaId === item.id && t.formatId === fmt.id
            );
            const isDownloading = activeTask?.status === 'downloading';
            const isCompleted = activeTask?.status === 'completed';
            const isError = activeTask?.status === 'error';

            return (
              <div
                key={fmt.id}
                className="flex flex-col gap-3 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-sm font-semibold text-zinc-100">
                      {fmt.label}
                    </span>
                    <span className="text-zinc-600" aria-hidden="true">·</span>
                    <span className="font-mono text-xs text-zinc-400 tabular-nums uppercase">
                      {fmt.ext}
                    </span>
                    <span className="text-zinc-600" aria-hidden="true">·</span>
                    <span className="font-mono text-xs text-zinc-400 tabular-nums">
                      {fmt.sizeLabel}
                    </span>
                  </div>
                  {fmt.note && (
                    <p className="text-xs text-zinc-500">
                      {isError && activeTask?.errorMessage ? (
                        <span className="text-rose-300">{activeTask.errorMessage}</span>
                      ) : (
                        fmt.note
                      )}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {isDownloading && activeTask ? (
                    <div className="flex w-full items-center gap-3 sm:w-auto">
                      <div className="flex min-w-[140px] flex-col gap-1.5">
                        <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-violet-200">
                          <span>
                            {activeTask.progress !== null
                              ? `${activeTask.progress}%`
                              : `${(activeTask.loadedBytes / (1024 * 1024)).toFixed(1)} MB`}
                          </span>
                          <span className="text-zinc-400">Saving</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
                          <div
                            className="h-full w-full origin-left rounded-full bg-gradient-to-r from-violet-400 to-violet-600 transition-transform duration-150 transform-gpu"
                            style={{
                              transform: `scaleX(${
                                activeTask.progress !== null
                                  ? Math.max(0.06, activeTask.progress / 100)
                                  : 0.55
                              })`,
                            }}
                          />
                        </div>
                      </div>

                      <motion.button
                        type="button"
                        onClick={() => onCancelTask(activeTask.taskId)}
                        whileTap={{ scale: 0.95 }}
                        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-rose-400/30 bg-rose-500/15 px-3.5 py-2 text-xs font-semibold text-rose-200 whitespace-nowrap shrink-0 transition-colors hover:bg-rose-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Cancel</span>
                      </motion.button>
                    </div>
                  ) : (
                    <motion.button
                      type="button"
                      onClick={() => onStartDownload(item, fmt)}
                      whileTap={{ scale: 0.96 }}
                      transition={{ type: 'spring', stiffness: 520, damping: 32 }}
                      style={
                        !isCompleted
                          ? {
                              backgroundImage: `linear-gradient(135deg, ${platformCfg.accentFrom}, ${platformCfg.accentTo})`,
                              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.26), 0 10px 24px -8px ${platformCfg.glowRgba}`,
                            }
                          : undefined
                      }
                      className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold whitespace-nowrap shrink-0 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
                        isCompleted
                          ? 'border border-emerald-400/30 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
                          : 'text-white hover:brightness-110'
                      }`}
                    >
                      {isCompleted ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Saved · Download Again</span>
                        </>
                      ) : (
                        <>
                          <Download className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Download</span>
                        </>
                      )}
                    </motion.button>
                  )}
                </div>
              </div>
            );
          })}
        </motion.div>
      </AnimatePresence>
    </motion.section>
  );
}
