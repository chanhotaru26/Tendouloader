import type { MediaFormatOption, MediaItem } from '../../types/media.ts';
import { isPrivateOrReservedHost, sanitizeFilename } from '../security.ts';
import {
  DESKTOP_UA,
  MOBILE_UA,
  decodeHtmlEntities,
  estimateAudioSize,
  fetchWithTimeout,
  formatDuration,
  signDownloadProxyUrl,
  signImageProxyUrl,
} from './common.ts';

function normalizeFacebookUrl(urlObj: URL): string {
  const clean = new URL(urlObj.toString());
  if (
    clean.hostname === 'm.facebook.com' ||
    clean.hostname === 'mbasic.facebook.com' ||
    clean.hostname === 'touch.facebook.com'
  ) {
    clean.hostname = 'www.facebook.com';
  }
  return clean.toString();
}

async function resolveFacebookShareUrl(
  targetUrl: string,
  signal?: AbortSignal
): Promise<string> {
  const parsed = new URL(targetUrl);
  const needsRedirect =
    parsed.hostname.includes('fb.watch') ||
    parsed.hostname.includes('fb.me') ||
    parsed.pathname.startsWith('/share/');

  if (needsRedirect) {
    const res = await fetchWithTimeout(targetUrl, {
      method: 'GET',
      redirect: 'follow',
      timeoutMs: 4500,
      parentSignal: signal,
      headers: { 'User-Agent': DESKTOP_UA },
    }).catch(() => null);
    if (res?.url) {
      try {
        const finalUrl = new URL(res.url);
        if (
          !isPrivateOrReservedHost(finalUrl.hostname) &&
          (finalUrl.hostname.includes('facebook.com') || finalUrl.hostname.includes('fb.'))
        ) {
          return normalizeFacebookUrl(finalUrl);
        }
      } catch {
        // Keep original URL
      }
    }
  }
  return targetUrl;
}

interface CliptoFbMedia {
  url?: string;
  quality?: string;
  type?: string;
  extension?: string;
}

interface CliptoFbResponse {
  success?: boolean;
  title?: string;
  author?: string;
  thumbnail?: string;
  duration?: number;
  medias?: CliptoFbMedia[];
}

async function queryCliptoFacebook(
  targetUrl: string,
  signal?: AbortSignal
): Promise<MediaItem> {
  const start = Date.now();
  const res = await fetchWithTimeout('https://www.clipto.com/api/youtube', {
    method: 'POST',
    timeoutMs: 11000,
    parentSignal: signal,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': DESKTOP_UA,
      Accept: 'application/json',
    },
    body: JSON.stringify({ url: targetUrl }),
  });
  if (!res.ok) throw new Error(`Facebook resolver HTTP ${res.status}`);
  const data = (await res.json()) as CliptoFbResponse;
  if (!data.success || !Array.isArray(data.medias) || data.medias.length === 0) {
    throw new Error('Facebook media unavailable');
  }

  const rawTitle = decodeHtmlEntities(data.title || 'Facebook Video').trim();
  const title = rawTitle === '-' || rawTitle === '- Facebook Reel' ? 'Facebook Video' : rawTitle;
  const author = decodeHtmlEntities(data.author || 'Facebook');
  const durationSeconds =
    data.duration && data.duration > 0
      ? data.duration > 7200
        ? Math.round(data.duration / 1000)
        : data.duration
      : undefined;
  const safeName = sanitizeFilename(title, `facebook_${Date.now()}`);

  const formats: MediaFormatOption[] = [];
  const videos = data.medias.filter((m) => m.type === 'video' && m.url);
  const images = data.medias.filter((m) => m.type === 'image' && m.url);

  const hdVideo =
    videos.find((v) => v.quality?.toLowerCase().includes('hd')) || videos[0];
  const sdVideo =
    videos.find((v) => v.quality?.toLowerCase().includes('sd')) ||
    videos.find((v) => v !== hdVideo);

  if (hdVideo?.url) {
    formats.push({
      id: 'fb-clipto-hd',
      kind: 'mp4',
      label: '1080p / HD MP4',
      quality: 'HD',
      ext: 'mp4',
      sizeLabel: 'HD Stream',
      note: 'High-definition Facebook MP4',
      hasAudio: true,
      height: 1080,
      downloadUrl: signDownloadProxyUrl({
        url: hdVideo.url,
        ext: 'mp4',
        mode: 'direct',
        filename: `${safeName}_hd.mp4`,
        referer: 'https://www.facebook.com/',
      }),
    });
  }

  if (sdVideo?.url && sdVideo.url !== hdVideo?.url) {
    formats.push({
      id: 'fb-clipto-sd',
      kind: 'mp4',
      label: '480p / SD MP4',
      quality: 'SD',
      ext: 'mp4',
      sizeLabel: 'Standard',
      note: 'Lightweight Facebook MP4',
      hasAudio: true,
      height: 480,
      downloadUrl: signDownloadProxyUrl({
        url: sdVideo.url,
        ext: 'mp4',
        mode: 'direct',
        filename: `${safeName}_sd.mp4`,
        referer: 'https://www.facebook.com/',
      }),
    });
  }

  const audioSrc = hdVideo?.url || sdVideo?.url;
  if (audioSrc) {
    for (const kbps of [320, 192]) {
      formats.push({
        id: `fb-mp3-${kbps}`,
        kind: 'mp3',
        label: `MP3 ${kbps} kbps`,
        quality: `${kbps} kbps`,
        ext: 'mp3',
        sizeLabel: estimateAudioSize(durationSeconds, kbps),
        note: 'Extracted Facebook audio',
        bitrateKbps: kbps,
        downloadUrl: signDownloadProxyUrl({
          url: audioSrc,
          ext: 'mp3',
          mode: 'mp3',
          bitrate: kbps,
          filename: `${safeName}_${kbps}kbps.mp3`,
          referer: 'https://www.facebook.com/',
        }),
      });
    }
  }

  const thumbRaw = data.thumbnail || images[0]?.url || '';
  if (thumbRaw) {
    formats.push({
      id: 'fb-photo-cover',
      kind: 'photo',
      label: videos.length > 0 ? 'Video Cover HD' : 'Post Photo HD',
      quality: 'Original JPG',
      ext: 'jpg',
      sizeLabel: 'Image',
      note: 'Original Facebook image',
      downloadUrl: signDownloadProxyUrl({
        url: thumbRaw,
        ext: 'jpg',
        mode: 'direct',
        filename: `${safeName}_image.jpg`,
        referer: 'https://www.facebook.com/',
      }),
    });
  }

  const isReel = targetUrl.toLowerCase().includes('/reel');

  return {
    id: `fb_${Date.now()}`,
    platform: 'facebook',
    sourceUrl: targetUrl,
    title,
    author,
    durationSeconds,
    durationLabel: formatDuration(durationSeconds),
    thumbnailUrl: thumbRaw ? signImageProxyUrl(thumbRaw, 'https://www.facebook.com/') : '',
    contentTypeLabel:
      videos.length > 0
        ? isReel
          ? 'Facebook Reels'
          : 'Facebook Video'
        : 'Facebook Post Photo',
    formats,
    analyzedAt: Date.now(),
    elapsedMs: Date.now() - start,
  };
}

function parseFacebookHtml(html: string, sourceUrl: string, start: number): MediaItem {
  const hdPatterns = [
    /"browser_native_hd_url"\s*:\s*"([^"]+)"/,
    /"playable_url_quality_hd"\s*:\s*"([^"]+)"/,
    /"hd_src_no_ratelimit"\s*:\s*"([^"]+)"/,
    /"hd_src"\s*:\s*"([^"]+)"/,
  ];
  const sdPatterns = [
    /"browser_native_sd_url"\s*:\s*"([^"]+)"/,
    /"playable_url"\s*:\s*"([^"]+)"/,
    /"sd_src_no_ratelimit"\s*:\s*"([^"]+)"/,
    /"sd_src"\s*:\s*"([^"]+)"/,
    /<meta[^>]+property="og:video(?::url)?"[^>]+content="([^"]+)"/i,
  ];

  let hdUrl = '';
  for (const pat of hdPatterns) {
    const m = html.match(pat);
    if (m?.[1]) {
      hdUrl = decodeHtmlEntities(m[1]);
      break;
    }
  }

  let sdUrl = '';
  for (const pat of sdPatterns) {
    const m = html.match(pat);
    if (m?.[1]) {
      sdUrl = decodeHtmlEntities(m[1]);
      break;
    }
  }

  const titleMatch =
    html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i) ||
    html.match(/<title>([^<]+)<\/title>/i);
  const thumbMatch =
    html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i) ||
    html.match(/"preferred_thumbnail"\s*:\s*\{\s*"image"\s*:\s*\{\s*"uri"\s*:\s*"([^"]+)"/);

  const rawTitle = decodeHtmlEntities(titleMatch?.[1] || 'Facebook Video')
    .replace(/\s*\|\s*Facebook$/i, '')
    .trim();
  const rawThumb = thumbMatch?.[1] ? decodeHtmlEntities(thumbMatch[1]) : '';
  const safeName = sanitizeFilename(rawTitle, `facebook_${Date.now()}`);

  const formats: MediaFormatOption[] = [];
  if (hdUrl) {
    formats.push({
      id: 'fb-mp4-hd',
      kind: 'mp4',
      label: '1080p / HD MP4',
      quality: 'HD',
      ext: 'mp4',
      sizeLabel: 'HD Stream',
      note: 'High-definition Facebook MP4',
      hasAudio: true,
      height: 1080,
      downloadUrl: signDownloadProxyUrl({
        url: hdUrl,
        ext: 'mp4',
        mode: 'direct',
        filename: `${safeName}_hd.mp4`,
        referer: 'https://www.facebook.com/',
      }),
    });
  }

  if (sdUrl && sdUrl !== hdUrl) {
    formats.push({
      id: 'fb-mp4-sd',
      kind: 'mp4',
      label: '480p / SD MP4',
      quality: 'SD',
      ext: 'mp4',
      sizeLabel: 'Standard',
      note: 'Lightweight Facebook MP4',
      hasAudio: true,
      height: 480,
      downloadUrl: signDownloadProxyUrl({
        url: sdUrl,
        ext: 'mp4',
        mode: 'direct',
        filename: `${safeName}_sd.mp4`,
        referer: 'https://www.facebook.com/',
      }),
    });
  }

  const audioSrc = hdUrl || sdUrl;
  if (audioSrc) {
    for (const kbps of [320, 192]) {
      formats.push({
        id: `fb-mp3-${kbps}`,
        kind: 'mp3',
        label: `MP3 ${kbps} kbps`,
        quality: `${kbps} kbps`,
        ext: 'mp3',
        sizeLabel: 'Auto',
        note: 'Extracted Facebook audio',
        bitrateKbps: kbps,
        downloadUrl: signDownloadProxyUrl({
          url: audioSrc,
          ext: 'mp3',
          mode: 'mp3',
          bitrate: kbps,
          filename: `${safeName}_${kbps}kbps.mp3`,
          referer: 'https://www.facebook.com/',
        }),
      });
    }
  }

  if (rawThumb) {
    formats.push({
      id: 'fb-photo-cover',
      kind: 'photo',
      label: formats.length === 0 ? 'Post Photo HD' : 'Video Cover HD',
      quality: 'Original JPG',
      ext: 'jpg',
      sizeLabel: 'Image',
      note: 'Original Facebook image',
      downloadUrl: signDownloadProxyUrl({
        url: rawThumb,
        ext: 'jpg',
        mode: 'direct',
        filename: `${safeName}_image.jpg`,
        referer: 'https://www.facebook.com/',
      }),
    });
  }

  if (formats.length === 0) {
    throw new Error('No public Facebook video or image stream found');
  }

  const isReel = sourceUrl.toLowerCase().includes('/reel');

  return {
    id: `fb_${Date.now()}`,
    platform: 'facebook',
    sourceUrl,
    title: rawTitle || 'Facebook Media',
    author: 'Facebook',
    thumbnailUrl: rawThumb ? signImageProxyUrl(rawThumb, 'https://www.facebook.com/') : '',
    contentTypeLabel: audioSrc
      ? isReel
        ? 'Facebook Reels'
        : 'Facebook Video'
      : 'Facebook Post Photo',
    formats,
    analyzedAt: Date.now(),
    elapsedMs: Date.now() - start,
  };
}

async function fetchFbDesktop(
  targetUrl: string,
  signal?: AbortSignal
): Promise<MediaItem> {
  const start = Date.now();
  const res = await fetchWithTimeout(targetUrl, {
    timeoutMs: 7500,
    parentSignal: signal,
    headers: {
      'User-Agent': DESKTOP_UA,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Fetch-Mode': 'navigate',
    },
  });
  if (!res.ok) throw new Error(`Facebook HTTP ${res.status}`);
  const html = await res.text();
  return parseFacebookHtml(html, targetUrl, start);
}

async function fetchFbPlugin(
  targetUrl: string,
  signal?: AbortSignal
): Promise<MediaItem> {
  const start = Date.now();
  const pluginUrl = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(targetUrl)}&show_text=0`;
  const res = await fetchWithTimeout(pluginUrl, {
    timeoutMs: 7500,
    parentSignal: signal,
    headers: {
      'User-Agent': MOBILE_UA,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!res.ok) throw new Error(`Facebook plugin HTTP ${res.status}`);
  const html = await res.text();
  return parseFacebookHtml(html, targetUrl, start);
}

export async function extractFacebook(
  urlObj: URL,
  signal?: AbortSignal
): Promise<MediaItem> {
  const normalizedUrl = normalizeFacebookUrl(urlObj);
  const targetUrl = await resolveFacebookShareUrl(normalizedUrl, signal);

  try {
    return await Promise.any([
      queryCliptoFacebook(targetUrl, signal),
      fetchFbDesktop(targetUrl, signal),
      fetchFbPlugin(targetUrl, signal),
    ]);
  } catch (err) {
    if (signal?.aborted) throw new Error('Analysis cancelled.');
    const msg =
      err instanceof AggregateError
        ? err.errors[0]?.message || 'Facebook post unreachable'
        : err instanceof Error
          ? err.message
          : 'Facebook extraction failed';
    throw new Error(
      `Unable to extract this Facebook post (${msg}). Make sure the video or post is public.`
    );
  }
}
