import { PlatformId } from '../types/media';

export interface PlatformConfig {
  id: PlatformId;
  name: string;
  shortName: string;
  actionLabel: string;
  headline: string;
  subtitle: string;
  placeholder: string;
  supportedTypes: string;
  accentFrom: string;
  accentTo: string;
  glowRgba: string;
  ambientRgba: string;
  borderTint: string;
  hosts: string[];
}

export const PLATFORMS: PlatformConfig[] = [
  {
    id: 'youtube',
    name: 'YouTube',
    shortName: 'YouTube',
    actionLabel: 'Analyze YouTube',
    headline: 'YouTube Videos & Shorts',
    subtitle: 'Save HD MP4 up to 4K, Shorts, and crisp MP3 audio without cookies.',
    placeholder: 'Paste YouTube video or Shorts link...',
    supportedTypes: 'Videos · Shorts · MP4 HD · MP3 320 kbps',
    accentFrom: '#C084FC',
    accentTo: '#9333EA',
    glowRgba: 'rgba(168, 85, 247, 0.30)',
    ambientRgba: 'rgba(168, 85, 247, 0.17)',
    borderTint: 'rgba(192, 132, 252, 0.42)',
    hosts: ['youtube.com', 'youtu.be', 'music.youtube.com'],
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    shortName: 'TikTok',
    actionLabel: 'Analyze TikTok',
    headline: 'TikTok Watermark-Free',
    subtitle: 'Download clean HD TikTok videos, slideshows, and original audio.',
    placeholder: 'Paste TikTok video or short link...',
    supportedTypes: 'No Watermark MP4 · Slideshows · MP3 Audio',
    accentFrom: '#A78BFA',
    accentTo: '#6366F1',
    glowRgba: 'rgba(129, 140, 248, 0.30)',
    ambientRgba: 'rgba(124, 58, 237, 0.17)',
    borderTint: 'rgba(167, 139, 250, 0.42)',
    hosts: ['tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'],
  },
  {
    id: 'instagram',
    name: 'Instagram',
    shortName: 'Instagram',
    actionLabel: 'Analyze IG',
    headline: 'Instagram Reels & Posts',
    subtitle: 'Extract Reels, feed videos, HD photos, and carousels effortlessly.',
    placeholder: 'Paste Instagram Reel, post, or photo link...',
    supportedTypes: 'Reels · Feed Videos · HD Photos · Carousels',
    accentFrom: '#E879F9',
    accentTo: '#7E22CE',
    glowRgba: 'rgba(217, 70, 239, 0.28)',
    ambientRgba: 'rgba(192, 38, 211, 0.15)',
    borderTint: 'rgba(232, 121, 249, 0.42)',
    hosts: ['instagram.com', 'instagr.am', 'ddinstagram.com'],
  },
  {
    id: 'twitter',
    name: 'Twitter X',
    shortName: 'Twitter X',
    actionLabel: 'Analyze X',
    headline: 'Twitter X Videos & Media',
    subtitle: 'Grab multi-resolution MP4 videos, GIFs, and HD images from any post.',
    placeholder: 'Paste X or Twitter post link...',
    supportedTypes: 'Post Videos · GIFs · HD Photos · MP3 Audio',
    accentFrom: '#818CF8',
    accentTo: '#4F46E5',
    glowRgba: 'rgba(99, 102, 241, 0.32)',
    ambientRgba: 'rgba(99, 102, 241, 0.17)',
    borderTint: 'rgba(129, 140, 248, 0.44)',
    hosts: ['x.com', 'twitter.com', 't.co', 'fxtwitter.com', 'vxtwitter.com', 'fixupx.com'],
  },
  {
    id: 'facebook',
    name: 'Facebook',
    shortName: 'Facebook',
    actionLabel: 'Analyze FB',
    headline: 'Facebook Videos & Reels',
    subtitle: 'Save public Watch videos, Reels, and shared clips in HD or SD.',
    placeholder: 'Paste Facebook video, Watch, or Reels link...',
    supportedTypes: 'Watch Videos · Reels · HD & SD MP4 · MP3',
    accentFrom: '#93C5FD',
    accentTo: '#6D28D9',
    glowRgba: 'rgba(110, 145, 248, 0.30)',
    ambientRgba: 'rgba(96, 165, 250, 0.15)',
    borderTint: 'rgba(147, 197, 253, 0.42)',
    hosts: ['facebook.com', 'fb.watch', 'fb.com', 'fb.me'],
  },
];

export const PLATFORM_MAP: Record<PlatformId, PlatformConfig> = PLATFORMS.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<PlatformId, PlatformConfig>
);

/**
 * Extracts a clean http/https URL from share-sheet text, whitespace, or bare domain links.
 */
export function extractCleanUrl(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed) return '';

  // 1. Prefer an explicit http(s) URL anywhere inside pasted share text
  const explicitMatch = trimmed.match(/https?:\/\/[^\s<>"'`]+/i);
  if (explicitMatch) {
    return explicitMatch[0].replace(/[),.;!?]+$/, '');
  }

  // 2. Fallback: bare domain URL without protocol (e.g., "vt.tiktok.com/ZS..." or "youtube.com/shorts/...")
  const bareMatch = trimmed.match(
    /(?:[a-z0-9-]+\.)*(?:youtube\.com|youtu\.be|tiktok\.com|instagram\.com|instagr\.am|x\.com|twitter\.com|t\.co|fxtwitter\.com|vxtwitter\.com|fixupx\.com|facebook\.com|fb\.watch|fb\.com|fb\.me)\/[^\s<>"'`]*/i
  );
  if (bareMatch) {
    return `https://${bareMatch[0].replace(/[),.;!?]+$/, '')}`;
  }

  return trimmed;
}

export function detectPlatformFromInput(rawUrl: string): PlatformId | null {
  try {
    const cleaned = extractCleanUrl(rawUrl);
    if (!cleaned) return null;
    const normalized = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
    const parsed = new URL(normalized);
    const host = parsed.hostname
      .toLowerCase()
      .replace(/^(?:www|m|mobile|web|mbasic|touch|l|lm)\./, '');

    if (
      host === 'youtu.be' ||
      host === 'youtube.com' ||
      host.endsWith('.youtube.com')
    ) {
      return 'youtube';
    }
    if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
      return 'tiktok';
    }
    if (
      host === 'instagram.com' ||
      host.endsWith('.instagram.com') ||
      host === 'instagr.am' ||
      host === 'ddinstagram.com'
    ) {
      return 'instagram';
    }
    if (
      host === 'x.com' ||
      host.endsWith('.x.com') ||
      host === 'twitter.com' ||
      host.endsWith('.twitter.com') ||
      host === 't.co' ||
      host === 'fxtwitter.com' ||
      host === 'vxtwitter.com' ||
      host === 'fixupx.com'
    ) {
      return 'twitter';
    }
    if (
      host === 'facebook.com' ||
      host.endsWith('.facebook.com') ||
      host === 'fb.watch' ||
      host === 'fb.com' ||
      host === 'fb.me'
    ) {
      return 'facebook';
    }
    return null;
  } catch {
    return null;
  }
}

export function isLikelyValidUrl(rawUrl: string): boolean {
  const cleaned = extractCleanUrl(rawUrl);
  if (!cleaned || cleaned.length < 6) return false;
  return detectPlatformFromInput(cleaned) !== null;
}
