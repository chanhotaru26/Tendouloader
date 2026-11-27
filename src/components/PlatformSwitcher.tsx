import { motion } from 'motion/react';
import React from 'react';
import { PLATFORMS } from '../data/platforms';
import { PlatformId } from '../types/media';
import { PlatformIcon } from './BrandIcons';

interface PlatformSwitcherProps {
  activePlatform: PlatformId;
  onSelectPlatform: (platform: PlatformId) => void;
  disabled?: boolean;
}

export function PlatformSwitcher({
  activePlatform,
  onSelectPlatform,
  disabled = false,
}: PlatformSwitcherProps) {
  return (
    <div className="w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div
        role="tablist"
        aria-label="Supported Media Platforms"
        className="liquid-glass-subtle mx-auto flex w-max items-center gap-1 rounded-2xl p-1.5"
      >
        {PLATFORMS.map((platform) => {
          const isActive = platform.id === activePlatform;
          return (
            <motion.button
              key={platform.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              disabled={disabled}
              onClick={() => onSelectPlatform(platform.id)}
              whileTap={disabled ? undefined : { scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 520, damping: 34 }}
              className={`relative flex min-h-[42px] items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
                isActive ? 'text-white' : 'text-zinc-400 hover:text-zinc-100'
              } ${disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
            >
              {isActive && (
                <motion.span
                  layoutId="liquid-platform-capsule"
                  transition={{
                    type: 'spring',
                    stiffness: 440,
                    damping: 32,
                    mass: 0.7,
                  }}
                  style={{
                    background: `linear-gradient(180deg, ${platform.accentFrom}46 0%, ${platform.accentTo}38 100%)`,
                    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.28), 0 8px 22px -6px ${platform.glowRgba}`,
                    borderColor: platform.borderTint,
                  }}
                  className="liquid-glass-pill absolute inset-0 rounded-xl transform-gpu"
                />
              )}
              <span className="relative z-10 flex items-center gap-2">
                <PlatformIcon
                  platform={platform.id}
                  style={isActive ? { color: platform.accentFrom } : undefined}
                  className={`h-4 w-4 transition-transform duration-150 ${
                    isActive ? 'scale-105' : 'text-zinc-400'
                  }`}
                />
                <span>{platform.shortName}</span>
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
