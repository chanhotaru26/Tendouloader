import { Loader2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import React from 'react';
import { PLATFORM_MAP } from '../data/platforms';
import { DownloadTask, PlatformId } from '../types/media';

interface FloatingCancelBarProps {
  isAnalyzing: boolean;
  activePlatform: PlatformId;
  activeDownload: DownloadTask | undefined;
  onCancelAnalyze: () => void;
  onCancelDownload: (taskId: string) => void;
}

export function FloatingCancelBar({
  isAnalyzing,
  activePlatform,
  activeDownload,
  onCancelAnalyze,
  onCancelDownload,
}: FloatingCancelBarProps) {
  const visible = isAnalyzing || Boolean(activeDownload);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.96 }}
          transition={{
            type: 'spring',
            stiffness: 440,
            damping: 32,
          }}
          className="fixed inset-x-0 bottom-4 z-50 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-3 rounded-2xl border border-white/15 bg-[#12121D]/90 px-4 py-2.5 shadow-2xl backdrop-blur-xl transform-gpu"
        >
          <Loader2
            className="h-4 w-4 shrink-0 animate-spin text-violet-300"
            aria-hidden="true"
          />

          <div className="min-w-0 text-xs font-medium text-zinc-100 truncate">
            {isAnalyzing ? (
              <span>
                Analyzing {PLATFORM_MAP[activePlatform].shortName} link
              </span>
            ) : activeDownload ? (
              <span className="font-mono tabular-nums">
                Downloading {activeDownload.quality} ·{' '}
                {activeDownload.progress !== null
                  ? `${activeDownload.progress}%`
                  : `${(activeDownload.loadedBytes / (1024 * 1024)).toFixed(1)} MB`}
              </span>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => {
              if (isAnalyzing) onCancelAnalyze();
              else if (activeDownload) onCancelDownload(activeDownload.taskId);
            }}
            className="inline-flex min-h-[34px] items-center gap-1 rounded-xl border border-rose-400/35 bg-rose-500/20 px-3 py-1 text-xs font-semibold text-rose-100 whitespace-nowrap shrink-0 transition-colors hover:bg-rose-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Cancel</span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
