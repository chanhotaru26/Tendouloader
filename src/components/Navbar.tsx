import { ClipboardPaste } from 'lucide-react';
import { motion } from 'motion/react';
import React from 'react';
import { TendouLogoMark } from './BrandIcons';

interface NavbarProps {
  onOpenFormats: () => void;
  onQuickPaste: () => void;
}

export function Navbar({ onOpenFormats, onQuickPaste }: NavbarProps) {
  return (
    <header className="liquid-glass-bar sticky top-0 z-40 border-b border-white/[0.06]">
      <div className="mx-auto flex h-16 max-w-4xl items-center justify-between gap-8 px-4 sm:px-6">
        {/* Zone 1: Single-line Brand Wordmark */}
        <a
          href="#downloader"
          className="inline-flex items-center gap-2.5 font-display text-base font-semibold tracking-tight text-[#F5F5FA] whitespace-nowrap shrink-0 transition-opacity hover:opacity-90"
        >
          <TendouLogoMark className="h-6 w-6 shrink-0" />
          <span>Tendouloader</span>
        </a>

        {/* Zone 2: Minimal single-line text links (no history/queue clutter) */}
        <nav
          aria-label="Primary Navigation"
          className="flex items-center gap-6 text-sm font-medium text-zinc-400"
        >
          <a
            href="#downloader"
            className="hidden sm:inline whitespace-nowrap shrink-0 transition-colors duration-150 hover:text-white hover:underline underline-offset-4"
          >
            Downloader
          </a>
          <button
            type="button"
            onClick={onOpenFormats}
            className="whitespace-nowrap shrink-0 transition-colors duration-150 hover:text-white hover:underline underline-offset-4"
          >
            Platforms
          </button>
        </nav>

        {/* Zone 3: Single primary quick action */}
        <div className="flex items-center shrink-0">
          <motion.button
            type="button"
            onClick={onQuickPaste}
            whileTap={{ scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 520, damping: 32 }}
            className="inline-flex min-h-[38px] items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2 text-xs font-medium text-zinc-100 whitespace-nowrap shrink-0 transition-colors duration-150 hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <ClipboardPaste className="h-3.5 w-3.5 text-violet-300" aria-hidden="true" />
            <span>Paste Link</span>
          </motion.button>
        </div>
      </div>
    </header>
  );
}
