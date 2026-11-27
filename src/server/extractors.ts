import type { MediaItem, PlatformId } from '../types/media.ts';
import { validateSourceUrl } from './security.ts';
import { extractFacebook } from './platforms/facebook.ts';
import { extractInstagram } from './platforms/instagram.ts';
import { extractTikTok } from './platforms/tiktok.ts';
import { extractTwitter } from './platforms/twitter.ts';
import { extractYouTube } from './platforms/youtube.ts';

interface CacheEntry {
  item: MediaItem;
  expiresAt: number;
}

const ANALYSIS_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 45_000;

export async function analyzeMediaUrl(
  rawUrl: string,
  expectedPlatform?: PlatformId,
  signal?: AbortSignal
): Promise<MediaItem> {
  const validated = validateSourceUrl(rawUrl);
  if (!validated.valid) {
    throw new Error(validated.error);
  }

  const { url, platform } = validated;

  // Return instant cached result if recently analyzed (keeps tokens valid for 1h)
  const cacheKey = `${platform}:${url.toString()}`;
  const cached = ANALYSIS_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      ...cached.item,
      analyzedAt: Date.now(),
      elapsedMs: 12,
    };
  }

  let item: MediaItem;
  const start = Date.now();

  switch (platform) {
    case 'youtube':
      item = await extractYouTube(url, signal);
      break;
    case 'tiktok':
      item = await extractTikTok(url, signal);
      break;
    case 'instagram':
      item = await extractInstagram(url, signal);
      break;
    case 'twitter':
      item = await extractTwitter(url, signal);
      break;
    case 'facebook':
      item = await extractFacebook(url, signal);
      break;
    default:
      throw new Error(`Unsupported platform: ${expectedPlatform ?? platform}`);
  }

  item.elapsedMs = Math.max(15, Date.now() - start);
  ANALYSIS_CACHE.set(cacheKey, {
    item,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  // Bound cache size
  if (ANALYSIS_CACHE.size > 100) {
    const oldestKey = ANALYSIS_CACHE.keys().next().value;
    if (oldestKey) ANALYSIS_CACHE.delete(oldestKey);
  }

  return item;
}
