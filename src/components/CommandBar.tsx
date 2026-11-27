import { AlertTriangle, ArrowRight, ClipboardPaste, Link2, X } from 'lucide-react';
import { motion } from 'motion/react';
import React, { useState } from 'react';
import {
  PLATFORM_MAP,
  detectPlatformFromInput,
  extractCleanUrl,
  isLikelyValidUrl,
} from '../data/platforms';
import { PlatformId } from '../types/media';
import { PlatformIcon } from './BrandIcons';

interface CommandBarProps {
  activePlatform: PlatformId;
  urlInput: string;
  isAnalyzing: boolean;
  pasteHint?: string | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onUrlChange: (value: string) => void;
  onClear: () => void;
  onPaste: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

export function CommandBar({
  activePlatform,
  urlInput,
  isAnalyzing,
  pasteHint,
  inputRef,
  onUrlChange,
  onClear,
  onPaste,
  onSubmit,
  onCancel,
}: CommandBarProps) {
  const [isFocused, setIsFocused] = useState(false);
  const detectedPlatform = detectPlatformFromInput(urlInput);
  const effectivePlatform = detectedPlatform ?? activePlatform;
  const config = PLATFORM_MAP[effectivePlatform];
  const activeConfig = PLATFORM_MAP[activePlatform];

  const hasText = urlInput.trim().length > 0;
  const isReady = isLikelyValidUrl(urlInput);
  const isInvalidInput = hasText && !isReady;

  const handleInputPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData?.getData('text');
    if (!pasted) return;
    const cleaned = extractCleanUrl(pasted);
    if (cleaned) {
      e.preventDefault();
      onUrlChange(cleaned);
    }
  };

  return (
    <form onSubmit={onSubmit} className="mx-auto w-full max-w-2xl" noValidate>
      <div
        style={{
          borderColor: isAnalyzing
            ? config.borderTint
            : isInvalidInput
              ? 'rgba(251, 191, 36, 0.40)'
              : isFocused || isReady
                ? config.borderTint
                : 'rgba(255, 255, 255, 0.10)',
          boxShadow:
            isAnalyzing || isReady
              ? `inset 0 1px 0 rgba(255,255,255,0.20), 0 22px 54px -18px ${config.glowRgba}`
              : isFocused
                ? `inset 0 1px 0 rgba(255,255,255,0.16), 0 18px 44px -18px ${activeConfig.glowRgba}`
                : 'inset 0 1px 0 rgba(255,255,255,0.12), 0 18px 42px -20px rgba(0,0,0,0.72)',
        }}
        className="liquid-glass flex flex-col gap-2 rounded-[22px] p-2 transition-[border-color,box-shadow] duration-200 sm:flex-row sm:items-center"
      >
        {/* Left Adaptive Icon + Input Field */}
        <div className="flex min-w-0 flex-1 items-center gap-3 px-2.5 sm:px-3">
          <div
            style={
              detectedPlatform
                ? {
                    backgroundColor: `${config.accentFrom}1F`,
                    borderColor: `${config.accentFrom}55`,
                    color: config.accentFrom,
                  }
                : undefined
            }
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors duration-200 ${
              detectedPlatform
                ? ''
                : isInvalidInput
                  ? 'border-amber-400/35 bg-amber-500/10 text-amber-300'
                  : 'border-white/[0.06] bg-white/[0.03] text-zinc-400'
            }`}
          >
            {detectedPlatform ? (
              <PlatformIcon
                platform={detectedPlatform}
                className="h-4 w-4 transition-transform duration-150 scale-105"
              />
            ) : isInvalidInput ? (
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Link2 className="h-4 w-4" aria-hidden="true" />
            )}
          </div>

          <input
            ref={inputRef}
            type="text"
            inputMode="url"
            enterKeyHint="go"
            value={urlInput}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onPaste={handleInputPaste}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder={activeConfig.placeholder}
            aria-label={`${activeConfig.name} media URL`}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            className="h-11 w-full min-w-0 bg-transparent text-sm text-white placeholder:text-zinc-500 focus:outline-none"
          />

          {hasText && !isAnalyzing && (
            <button
              type="button"
              onClick={onClear}
              aria-label="Clear link"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-zinc-100"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Right Adaptive Action Controls (stable DOM node, zero flicker) */}
        <div className="flex items-center gap-2 shrink-0">
          {!hasText && !isAnalyzing && (
            <motion.button
              type="button"
              onClick={onPaste}
              whileTap={{ scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 520, damping: 32 }}
              className="inline-flex min-h-[46px] flex-1 items-center justify-center gap-1.5 rounded-[14px] border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-xs font-medium text-zinc-200 whitespace-nowrap shrink-0 transition-colors duration-150 hover:bg-white/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 sm:flex-initial"
            >
              <ClipboardPaste
                className="h-3.5 w-3.5"
                style={{ color: activeConfig.accentFrom }}
                aria-hidden="true"
              />
              <span>Paste</span>
            </motion.button>
          )}

          {isAnalyzing ? (
            <motion.button
              type="button"
              onClick={onCancel}
              whileTap={{ scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 520, damping: 32 }}
              className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-[14px] border border-rose-400/35 bg-rose-500/20 px-5 py-2.5 text-sm font-semibold text-rose-100 whitespace-nowrap shrink-0 transition-colors duration-150 hover:bg-rose-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 sm:w-auto transform-gpu"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              <span>Cancel</span>
            </motion.button>
          ) : (
            <motion.button
              type="submit"
              whileTap={{ scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 520, damping: 32 }}
              style={
                isReady
                  ? {
                      backgroundImage: `linear-gradient(135deg, ${config.accentFrom}, ${config.accentTo})`,
                      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.30), 0 10px 26px -8px ${config.glowRgba}`,
                    }
                  : undefined
              }
              className={`inline-flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-[14px] px-5 py-2.5 text-sm font-semibold whitespace-nowrap shrink-0 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 sm:w-auto sm:flex-initial transform-gpu ${
                isReady
                  ? 'text-white hover:brightness-110'
                  : isInvalidInput
                    ? 'border border-amber-400/35 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25'
                    : 'border border-white/[0.1] bg-white/[0.06] text-zinc-300 hover:bg-white/[0.1] hover:text-white'
              }`}
            >
              {isReady && (
                <PlatformIcon
                  platform={effectivePlatform}
                  className="h-3.5 w-3.5 sm:hidden"
                />
              )}
              <span className="sm:hidden">
                {isInvalidInput ? 'Check Link' : 'Analyze'}
              </span>
              <span className="hidden sm:inline">
                {isReady
                  ? config.actionLabel
                  : isInvalidInput
                    ? 'Check Link'
                    : 'Analyze'}
              </span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </motion.button>
          )}
        </div>
      </div>

      {/* Adaptive contextual hint when browser/iframe blocks direct clipboard read */}
      {pasteHint && !hasText && !isAnalyzing && (
        <p className="mt-2 text-center text-xs text-zinc-400">{pasteHint}</p>
      )}
    </form>
  );
}
