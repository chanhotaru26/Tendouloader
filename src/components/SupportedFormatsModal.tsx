import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import React from 'react';
import { PLATFORMS } from '../data/platforms';
import { PlatformId } from '../types/media';
import { PlatformIcon } from './BrandIcons';

interface SupportedFormatsModalProps {
  open: boolean;
  onClose: () => void;
  onSelectPlatform: (platform: PlatformId) => void;
}

export function SupportedFormatsModal({
  open,
  onClose,
  onSelectPlatform,
}: SupportedFormatsModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 440, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="formats-dialog-title"
            className="liquid-glass w-full max-w-lg rounded-3xl p-6 transform-gpu"
          >
            <div className="flex items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
              <div>
                <h2
                  id="formats-dialog-title"
                  className="font-display text-base font-semibold text-white"
                >
                  Supported Platforms & Formats
                </h2>
                <p className="text-xs text-zinc-400">
                  Select a platform to switch directly to its workspace.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close formats dialog"
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-300 transition-colors hover:bg-white/[0.1] hover:text-white"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4 divide-y divide-white/[0.06]">
              {PLATFORMS.map((platform) => (
                <button
                  key={platform.id}
                  type="button"
                  onClick={() => {
                    onSelectPlatform(platform.id);
                    onClose();
                  }}
                  className="flex w-full items-center justify-between gap-4 py-3 text-left transition-colors hover:bg-white/[0.03] rounded-xl px-2 -mx-2"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-violet-300">
                      <PlatformIcon platform={platform.id} className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="font-display text-sm font-semibold text-white">
                        {platform.name}
                      </div>
                      <div className="truncate text-xs text-zinc-400">
                        {platform.supportedTypes}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
