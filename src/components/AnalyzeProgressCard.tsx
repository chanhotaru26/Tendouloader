import { Check, Loader2, X } from 'lucide-react';
import { motion } from 'motion/react';
import React, { useEffect, useState } from 'react';
import { PLATFORM_MAP } from '../data/platforms';
import { PlatformId } from '../types/media';
import { PlatformIcon } from './BrandIcons';

interface AnalyzeProgressCardProps {
  platform: PlatformId;
  url: string;
  onCancel: () => void;
}

const STAGES = [
  'Validating media link',
  'Racing fast stream endpoints',
  'Resolving HD video & MP3 audio',
];

function ElapsedBadge() {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const timer = window.setInterval(() => {
      setElapsedMs(performance.now() - start);
    }, 150);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <span className="font-mono text-xs font-medium text-violet-300 tabular-nums">
      {(elapsedMs / 1000).toFixed(1)}s
    </span>
  );
}

export function AnalyzeProgressCard({
  platform,
  url,
  onCancel,
}: AnalyzeProgressCardProps) {
  const config = PLATFORM_MAP[platform];
  const [activeStage, setActiveStage] = useState(0);

  useEffect(() => {
    setActiveStage(0);
    const t1 = window.setTimeout(() => setActiveStage(1), 280);
    const t2 = window.setTimeout(() => setActiveStage(2), 950);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [url, platform]);

  const progressRatio = activeStage === 0 ? 0.28 : activeStage === 1 ? 0.64 : 0.9;

  let hostPreview = url;
  try {
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const parsed = new URL(normalized);
    hostPreview = `${parsed.hostname.replace(/^www\./, '')}${parsed.pathname.slice(0, 28)}`;
  } catch {
    hostPreview = url.slice(0, 42);
  }

  return (
    <motion.section
      key={`analyze-${platform}`}
      aria-live="polite"
      initial={{ opacity: 0, y: 12, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.985 }}
      transition={{
        type: 'spring',
        stiffness: 420,
        damping: 32,
        mass: 0.78,
      }}
      style={{
        borderColor: config.borderTint,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.16), 0 22px 54px -20px ${config.glowRgba}`,
      }}
      className="liquid-glass relative overflow-hidden rounded-3xl p-5 sm:p-6 transform-gpu"
    >
      {/* Subtle GPU-only specular shimmer sweep */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl"
      >
        <div
          className="animate-liquid-shimmer h-full w-1/2 opacity-20"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${config.accentFrom}44 50%, transparent 100%)`,
          }}
        />
      </div>

      <div className="relative z-10 flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
              <span
                aria-hidden="true"
                style={{ borderColor: config.borderTint }}
                className="animate-ios-ring absolute inset-0 rounded-2xl border"
              />
              <div
                style={{
                  background: `linear-gradient(135deg, ${config.accentFrom}30, ${config.accentTo}26)`,
                  borderColor: config.borderTint,
                }}
                className="relative flex h-11 w-11 items-center justify-center rounded-2xl border text-violet-100"
              >
                <PlatformIcon platform={platform} className="h-5 w-5" />
              </div>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <span>Analyzing {config.name} Media</span>
                <span className="text-zinc-500" aria-hidden="true">·</span>
                <ElapsedBadge />
              </div>
              <p className="truncate text-xs text-zinc-400 max-w-md">
                {hostPreview}
              </p>
            </div>
          </div>

          <motion.button
            type="button"
            onClick={onCancel}
            whileTap={{ scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 520, damping: 32 }}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-rose-400/30 bg-rose-500/15 px-3.5 py-2 text-xs font-semibold text-rose-200 whitespace-nowrap shrink-0 transition-colors duration-150 hover:bg-rose-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Cancel Analysis</span>
          </motion.button>
        </div>

        {/* GPU-composited Liquid Progress Track */}
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <motion.div
            className="h-full w-full origin-left rounded-full transform-gpu"
            style={{
              background: `linear-gradient(90deg, ${config.accentFrom}, ${config.accentTo})`,
            }}
            animate={{ scaleX: progressRatio }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {STAGES.map((label, idx) => {
            const isDone = idx < activeStage;
            const isCurrent = idx === activeStage;
            return (
              <div
                key={label}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-xs transition-colors duration-150 ${
                  isCurrent
                    ? 'border-violet-400/30 bg-violet-500/10 text-zinc-100'
                    : isDone
                      ? 'border-white/[0.08] bg-white/[0.03] text-zinc-300'
                      : 'border-white/[0.04] bg-transparent text-zinc-500'
                }`}
              >
                {isDone ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-violet-300" aria-hidden="true" />
                ) : isCurrent ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-violet-300" aria-hidden="true" />
                ) : (
                  <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-zinc-700" aria-hidden="true" />
                )}
                <span className="truncate font-medium">{label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </motion.section>
  );
}
