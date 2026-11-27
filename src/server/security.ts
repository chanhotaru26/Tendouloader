import crypto from 'node:crypto';
import net from 'node:net';
import type { PlatformId } from '../types/media.ts';

// Ephemeral in-memory fallback when SESSION_SECRET is unset (never hardcoded)
const EPHEMERAL_HMAC_SECRET = crypto.randomBytes(32);

function getSigningKey(): Buffer | string {
  const configured = process.env.SESSION_SECRET?.trim();
  return configured && configured.length >= 16 ? configured : EPHEMERAL_HMAC_SECRET;
}

const ALLOWED_SOURCE_HOSTS: Record<PlatformId, string[]> = {
  youtube: [
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'music.youtube.com',
    'shorts.youtube.com',
    'youtu.be',
    'youtube-nocookie.com',
    'www.youtube-nocookie.com',
  ],
  tiktok: [
    'tiktok.com',
    'www.tiktok.com',
    'm.tiktok.com',
    'vm.tiktok.com',
    'vt.tiktok.com',
  ],
  instagram: [
    'instagram.com',
    'www.instagram.com',
    'm.instagram.com',
    'instagr.am',
    'ddinstagram.com',
    'www.ddinstagram.com',
  ],
  twitter: [
    'x.com',
    'www.x.com',
    'mobile.x.com',
    'twitter.com',
    'www.twitter.com',
    'mobile.twitter.com',
    't.co',
    'fxtwitter.com',
    'vxtwitter.com',
    'fixupx.com',
  ],
  facebook: [
    'facebook.com',
    'www.facebook.com',
    'm.facebook.com',
    'mbasic.facebook.com',
    'web.facebook.com',
    'touch.facebook.com',
    'l.facebook.com',
    'lm.facebook.com',
    'fb.watch',
    'www.fb.watch',
    'fb.com',
    'fb.me',
  ],
};

const TRUSTED_MEDIA_CDN_SUFFIXES = [
  'googlevideo.com',
  'ytimg.com',
  'ggpht.com',
  'youtube.com',
  'tiktokcdn.com',
  'tiktokcdn-us.com',
  'tiktokcdn-eu.com',
  'tiktokv.com',
  'tiktok.com',
  'tikwm.com',
  'muscdn.com',
  'musical.ly',
  'byteoversea.com',
  'ibytedtos.com',
  'akamaized.net',
  'cdninstagram.com',
  'fbcdn.net',
  'fbsbx.com',
  'instagram.com',
  'twimg.com',
  'video.twimg.com',
  'pbs.twimg.com',
  'vxtwitter.com',
  'fxtwitter.com',
];

export function extractCleanUrlServer(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed) return '';
  const explicitMatch = trimmed.match(/https?:\/\/[^\s<>"'`]+/i);
  if (explicitMatch) {
    return explicitMatch[0].replace(/[),.;!?]+$/, '');
  }
  const bareMatch = trimmed.match(
    /(?:[a-z0-9-]+\.)*(?:youtube\.com|youtu\.be|tiktok\.com|instagram\.com|instagr\.am|x\.com|twitter\.com|t\.co|fxtwitter\.com|vxtwitter\.com|fixupx\.com|facebook\.com|fb\.watch|fb\.com|fb\.me)\/[^\s<>"'`]*/i
  );
  if (bareMatch) {
    return `https://${bareMatch[0].replace(/[),.;!?]+$/, '')}`;
  }
  return trimmed;
}

export function isPrivateOrReservedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localhost')
  ) {
    return true;
  }

  const ipVersion = net.isIP(host);
  if (ipVersion === 4) {
    const parts = host.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
  }

  if (ipVersion === 6) {
    if (
      host === '::' ||
      host === '::1' ||
      host.startsWith('fe80:') ||
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      host.startsWith('::ffff:127.') ||
      host.startsWith('::ffff:10.') ||
      host.startsWith('::ffff:192.168.')
    ) {
      return true;
    }
  }

  return false;
}

export function validateSourceUrl(
  rawUrl: string
): { valid: true; url: URL; platform: PlatformId } | { valid: false; error: string } {
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    return { valid: false, error: 'Please paste a media link to analyze.' };
  }
  if (rawUrl.length > 2048) {
    return { valid: false, error: 'URL exceeds maximum allowed length.' };
  }

  const cleaned = extractCleanUrlServer(rawUrl);
  const normalized = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return { valid: false, error: 'Invalid URL format. Please check the link.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: 'Only HTTP and HTTPS links are supported.' };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, error: 'URLs with embedded credentials are not permitted.' };
  }

  const host = parsed.hostname.toLowerCase();
  if (isPrivateOrReservedHost(host)) {
    return { valid: false, error: 'Private or local network addresses are blocked.' };
  }

  for (const [platform, hosts] of Object.entries(ALLOWED_SOURCE_HOSTS) as [
    PlatformId,
    string[],
  ][]) {
    if (
      hosts.some(
        (allowed) => host === allowed || host.endsWith(`.${allowed}`)
      )
    ) {
      return { valid: true, url: parsed, platform };
    }
  }

  return {
    valid: false,
    error:
      'Unsupported domain. Please use a link from YouTube, TikTok, Instagram, Twitter X, or Facebook.',
  };
}

export function isTrustedMediaUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    if (isPrivateOrReservedHost(host)) {
      return false;
    }
    return TRUSTED_MEDIA_CDN_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`)
    );
  } catch {
    return false;
  }
}

export interface SignedDownloadPayload {
  type: 'download' | 'image';
  url: string;
  audioUrl?: string;
  ext?: string;
  mode?: 'direct' | 'mp3' | 'mux';
  bitrate?: number;
  filename?: string;
  referer?: string;
  exp: number;
}

export function createSignedToken(
  payload: Omit<SignedDownloadPayload, 'exp'>,
  ttlSeconds = 3600
): string {
  const fullPayload: SignedDownloadPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', getSigningKey())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifySignedToken(token: string): SignedDownloadPayload | null {
  if (typeof token !== 'string' || !token.includes('.')) {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encoded, providedSig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getSigningKey())
    .update(encoded)
    .digest('base64url');

  const a = Buffer.from(providedSig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    ) as SignedDownloadPayload;

    if (!parsed || typeof parsed.exp !== 'number' || parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    if (!parsed.url || !isTrustedMediaUrl(parsed.url)) {
      return null;
    }
    if (parsed.audioUrl && !isTrustedMediaUrl(parsed.audioUrl)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function sanitizeFilename(name: string, fallback = 'tendouloader-media'): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s._-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 72);
  return cleaned || fallback;
}
