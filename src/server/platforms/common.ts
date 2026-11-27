import { createSignedToken } from '../security';

export const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';

export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeoutMs?: number; parentSignal?: AbortSignal } = {}
): Promise<Response> {
  const { timeoutMs = 5000, parentSignal, ...fetchOptions } = options;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const combinedSignal = parentSignal
    ? AbortSignal.any([parentSignal, timeoutSignal])
    : timeoutSignal;

  return fetch(url, {
    ...fetchOptions,
    signal: combinedSignal,
  });
}

export function decodeHtmlEntities(input: string): string {
  if (!input) return '';
  return input
    .replace(/\\u0026/g, '&')
    .replace(/\\u003C/g, '<')
    .replace(/\\u003E/g, '>')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .trim();
}

export function formatDuration(seconds?: number): string | undefined {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return undefined;
  const total = Math.round(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function formatBytes(bytes?: number): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return 'Auto';
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function estimateAudioSize(durationSeconds?: number, kbps = 192): string {
  if (!durationSeconds || durationSeconds <= 0) return 'Auto';
  const bytes = (durationSeconds * kbps * 1000) / 8;
  return formatBytes(bytes);
}

export function signImageProxyUrl(rawUrl: string, referer?: string): string {
  if (!rawUrl) return '';
  const token = createSignedToken({
    type: 'image',
    url: rawUrl,
    referer,
  });
  return `/api/proxy-image?token=${encodeURIComponent(token)}`;
}

export function signDownloadProxyUrl(params: {
  url: string;
  audioUrl?: string;
  ext: 'mp4' | 'mp3' | 'jpg' | 'png' | 'webp';
  mode: 'direct' | 'mp3' | 'mux';
  bitrate?: number;
  filename: string;
  referer?: string;
}): string {
  const token = createSignedToken({
    type: 'download',
    ...params,
  });
  return `/api/download?token=${encodeURIComponent(token)}`;
}
