import type { MediaFormatOption, MediaItem } from '../../types/media.ts';
import { isPrivateOrReservedHost, sanitizeFilename } from '../security.ts';
import {
  DESKTOP_UA,
  decodeHtmlEntities,
  estimateAudioSize,
  fetchWithTimeout,
  formatDuration,
  signDownloadProxyUrl,
  signImageProxyUrl,
} from './common.ts';

function extractTweetId(urlObj: URL): string | null {
  const match = urlObj.pathname.match(/\/status\/(\d+)/i);
  return match ? match[1] : null;
}

interface VxTwitterResponse {
  text?: string;
  user_name?: string;
  user_screen_name?: string;
  tweetID?: string;
  media_extended?: Array<{
    type?: string;
    url?: string;
    thumbnail_url?: string;
    duration_millis?: number;
    size?: { width?: number; height?: number };
  }>;
}

interface FxTwitterResponse {
  tweet?: {
    id?: string;
    text?: string;
    author?: { name?: string; screen_name?: string };
    media?: {
      videos?: Array<{
        url?: string;
        thumbnail_url?: string;
        duration?: number;
        width?: number;
        height?: number;
        variants?: Array<{ bitrate?: number; content_type?: string; url?: string }>;
      }>;
      photos?: Array<{ url?: string; width?: number; height?: number }>;
    };
  };
}

async function queryFxTwitter(
  tweetId: string,
  sourceUrl: string,
  signal?: AbortSignal
): Promise<MediaItem> {
  const start = Date.now();
  const res = await fetchWithTimeout(`https://api.fxtwitter.com/status/${tweetId}`, {
    timeoutMs: 7500,
    parentSignal: signal,
    headers: { 'User-Agent': DESKTOP_UA, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`FxTwitter HTTP ${res.status}`);
  const data = (await res.json()) as FxTwitterResponse;
  const tweet = data.tweet;
  if (!tweet) throw new Error('Tweet not found');

  const title = decodeHtmlEntities(tweet.text || `X Post ${tweetId}`).slice(0, 140);
  const author = tweet.author?.screen_name
    ? `@${tweet.author.screen_name}`
    : tweet.author?.name || 'X Creator';
  const safeName = sanitizeFilename(title, `twitter_${tweetId}`);

  const formats: MediaFormatOption[] = [];
  let thumbRaw = '';
  let durationSeconds: number | undefined;

  const videos = tweet.media?.videos ?? [];
  videos.forEach((video, vIdx) => {
    if (!thumbRaw && video.thumbnail_url) thumbRaw = video.thumbnail_url;
    if (!durationSeconds && video.duration) durationSeconds = video.duration;

    const mp4Variants = (video.variants ?? [])
      .filter((v) => v.content_type === 'video/mp4' && v.url)
      .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));

    if (mp4Variants.length > 0) {
      mp4Variants.forEach((variant, rIdx) => {
        const resMatch = variant.url?.match(/\/(\d+)x(\d+)\//);
        const height = resMatch ? Number(resMatch[2]) : video.height || 720 - rIdx * 180;
        const labelPrefix = videos.length > 1 ? `Clip ${vIdx + 1} · ` : '';
        formats.push({
          id: `tw-mp4-${vIdx}-${rIdx}`,
          kind: 'mp4',
          label: `${labelPrefix}${height}p MP4`,
          quality: `${height}p`,
          ext: 'mp4',
          sizeLabel: variant.bitrate
            ? `${Math.round(variant.bitrate / 1000)} kbps`
            : 'HD',
          note: rIdx === 0 ? 'Highest quality X video' : 'Standard MP4 stream',
          hasAudio: true,
          height,
          downloadUrl: signDownloadProxyUrl({
            url: variant.url!,
            ext: 'mp4',
            mode: 'direct',
            filename: `${safeName}_${height}p.mp4`,
            referer: 'https://x.com/',
          }),
        });
      });
    } else if (video.url) {
      formats.push({
        id: `tw-mp4-${vIdx}`,
        kind: 'mp4',
        label: `${video.height || 720}p MP4`,
        quality: `${video.height || 720}p`,
        ext: 'mp4',
        sizeLabel: 'HD',
        note: 'Direct X video stream',
        hasAudio: true,
        height: video.height || 720,
        downloadUrl: signDownloadProxyUrl({
          url: video.url,
          ext: 'mp4',
          mode: 'direct',
          filename: `${safeName}.mp4`,
          referer: 'https://x.com/',
        }),
      });
    }
  });

  if (videos[0]) {
    const audioTarget =
      videos[0].variants?.find((v) => v.content_type === 'video/mp4' && v.url)?.url ||
      videos[0].url;
    if (audioTarget) {
      for (const kbps of [320, 192]) {
        formats.push({
          id: `tw-mp3-${kbps}`,
          kind: 'mp3',
          label: `MP3 ${kbps} kbps`,
          quality: `${kbps} kbps`,
          ext: 'mp3',
          sizeLabel: estimateAudioSize(durationSeconds, kbps),
          note: 'Extracted post audio',
          bitrateKbps: kbps,
          downloadUrl: signDownloadProxyUrl({
            url: audioTarget,
            ext: 'mp3',
            mode: 'mp3',
            bitrate: kbps,
            filename: `${safeName}_${kbps}kbps.mp3`,
            referer: 'https://x.com/',
          }),
        });
      }
    }
  }

  const photos = tweet.media?.photos ?? [];
  photos.forEach((photo, idx) => {
    if (!photo.url) return;
    if (!thumbRaw) thumbRaw = photo.url;
    formats.push({
      id: `tw-photo-${idx}`,
      kind: 'photo',
      label: photos.length > 1 ? `Photo ${idx + 1} HD` : 'Post Photo HD',
      quality: 'Original',
      ext: 'jpg',
      sizeLabel: 'Image',
      note: 'Original X image',
      downloadUrl: signDownloadProxyUrl({
        url: photo.url,
        ext: 'jpg',
        mode: 'direct',
        filename: `${safeName}_photo_${idx + 1}.jpg`,
        referer: 'https://x.com/',
      }),
    });
  });

  if (formats.length === 0) {
    throw new Error('This X post has no downloadable video or photo attachments.');
  }

  return {
    id: `tw_${tweetId}_${Date.now()}`,
    platform: 'twitter',
    sourceUrl,
    title,
    author,
    durationSeconds,
    durationLabel: formatDuration(durationSeconds),
    thumbnailUrl: thumbRaw ? signImageProxyUrl(thumbRaw, 'https://x.com/') : '',
    contentTypeLabel: videos.length > 0 ? 'Twitter X Video' : 'Twitter X Post Photo',
    formats,
    analyzedAt: Date.now(),
    elapsedMs: Date.now() - start,
  };
}

async function queryVxTwitter(
  tweetId: string,
  sourceUrl: string,
  signal?: AbortSignal
): Promise<MediaItem> {
  const start = Date.now();
  const res = await fetchWithTimeout(
    `https://api.vxtwitter.com/Twitter/status/${tweetId}`,
    {
      timeoutMs: 7500,
      parentSignal: signal,
      headers: { 'User-Agent': DESKTOP_UA, Accept: 'application/json' },
    }
  );
  if (!res.ok) throw new Error(`VxTwitter HTTP ${res.status}`);
  const data = (await res.json()) as VxTwitterResponse;
  const mediaList = data.media_extended ?? [];
  if (mediaList.length === 0) throw new Error('No media found in X post');

  const title = decodeHtmlEntities(data.text || `X Post ${tweetId}`).slice(0, 140);
  const author = data.user_screen_name
    ? `@${data.user_screen_name}`
    : data.user_name || 'X Creator';
  const safeName = sanitizeFilename(title, `twitter_${tweetId}`);

  const formats: MediaFormatOption[] = [];
  let thumbRaw = '';
  let durationSeconds: number | undefined;
  let hasVideo = false;

  mediaList.forEach((m, idx) => {
    if (!m.url) return;
    if (m.type === 'video' || m.type === 'gif') {
      hasVideo = true;
      if (!thumbRaw && m.thumbnail_url) thumbRaw = m.thumbnail_url;
      if (!durationSeconds && m.duration_millis) {
        durationSeconds = m.duration_millis / 1000;
      }
      const height = m.size?.height || 720;
      formats.push({
        id: `vx-mp4-${idx}`,
        kind: 'mp4',
        label: `${height}p MP4`,
        quality: `${height}p`,
        ext: 'mp4',
        sizeLabel: 'HD',
        note: m.type === 'gif' ? 'Animated GIF as MP4' : 'Direct X video stream',
        hasAudio: m.type !== 'gif',
        height,
        downloadUrl: signDownloadProxyUrl({
          url: m.url,
          ext: 'mp4',
          mode: 'direct',
          filename: `${safeName}_${idx + 1}.mp4`,
          referer: 'https://x.com/',
        }),
      });
    } else if (m.type === 'image') {
      if (!thumbRaw) thumbRaw = m.url;
      formats.push({
        id: `vx-photo-${idx}`,
        kind: 'photo',
        label: `Post Photo ${idx + 1}`,
        quality: 'Original',
        ext: 'jpg',
        sizeLabel: 'Image',
        note: 'Original X image',
        downloadUrl: signDownloadProxyUrl({
          url: m.url,
          ext: 'jpg',
          mode: 'direct',
          filename: `${safeName}_photo_${idx + 1}.jpg`,
          referer: 'https://x.com/',
        }),
      });
    }
  });

  const firstVideo = mediaList.find((m) => m.type === 'video' && m.url);
  if (firstVideo?.url) {
    formats.push({
      id: 'vx-mp3-192',
      kind: 'mp3',
      label: 'MP3 192 kbps',
      quality: '192 kbps',
      ext: 'mp3',
      sizeLabel: estimateAudioSize(durationSeconds, 192),
      note: 'Extracted post audio',
      bitrateKbps: 192,
      downloadUrl: signDownloadProxyUrl({
        url: firstVideo.url,
        ext: 'mp3',
        mode: 'mp3',
        bitrate: 192,
        filename: `${safeName}.mp3`,
        referer: 'https://x.com/',
      }),
    });
  }

  return {
    id: `tw_${tweetId}_${Date.now()}`,
    platform: 'twitter',
    sourceUrl,
    title,
    author,
    durationSeconds,
    durationLabel: formatDuration(durationSeconds),
    thumbnailUrl: thumbRaw ? signImageProxyUrl(thumbRaw, 'https://x.com/') : '',
    contentTypeLabel: hasVideo ? 'Twitter X Video' : 'Twitter X Post Photo',
    formats,
    analyzedAt: Date.now(),
    elapsedMs: Date.now() - start,
  };
}

async function queryCliptoTwitter(
  tweetId: string,
  sourceUrl: string,
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
    body: JSON.stringify({ url: `https://x.com/i/status/${tweetId}` }),
  });
  if (!res.ok) throw new Error(`X resolver HTTP ${res.status}`);
  const data = await res.json();
  if (!data?.success || !Array.isArray(data.medias) || data.medias.length === 0) {
    throw new Error(data?.message || 'X post media unavailable');
  }

  const title = decodeHtmlEntities(data.title || `X Post ${tweetId}`).slice(0, 140);
  const author = decodeHtmlEntities(data.author || 'X Creator');
  const safeName = sanitizeFilename(title, `twitter_${tweetId}`);
  const formats: MediaFormatOption[] = [];
  let firstVideoUrl = '';

  (data.medias as Array<{ url?: string; quality?: string; type?: string; extension?: string; height?: number }>).forEach(
    (m, idx) => {
      if (!m.url) return;
      if (m.type === 'video' || m.extension === 'mp4') {
        if (!firstVideoUrl) firstVideoUrl = m.url;
        const height = m.height || 720;
        formats.push({
          id: `tw-clipto-mp4-${idx}`,
          kind: 'mp4',
          label: `${m.quality || `${height}p`} MP4`,
          quality: m.quality || `${height}p`,
          ext: 'mp4',
          sizeLabel: 'HD',
          note: 'Direct X video stream',
          hasAudio: true,
          height,
          downloadUrl: signDownloadProxyUrl({
            url: m.url,
            ext: 'mp4',
            mode: 'direct',
            filename: `${safeName}_${idx + 1}.mp4`,
            referer: 'https://x.com/',
          }),
        });
      } else if (m.type === 'image') {
        formats.push({
          id: `tw-clipto-photo-${idx}`,
          kind: 'photo',
          label: `Post Photo ${idx + 1}`,
          quality: 'Original',
          ext: 'jpg',
          sizeLabel: 'Image',
          note: 'Original X image',
          downloadUrl: signDownloadProxyUrl({
            url: m.url,
            ext: 'jpg',
            mode: 'direct',
            filename: `${safeName}_photo_${idx + 1}.jpg`,
            referer: 'https://x.com/',
          }),
        });
      }
    }
  );

  if (firstVideoUrl) {
    formats.push({
      id: 'tw-clipto-mp3-192',
      kind: 'mp3',
      label: 'MP3 192 kbps',
      quality: '192 kbps',
      ext: 'mp3',
      sizeLabel: 'Auto',
      note: 'Extracted post audio',
      bitrateKbps: 192,
      downloadUrl: signDownloadProxyUrl({
        url: firstVideoUrl,
        ext: 'mp3',
        mode: 'mp3',
        bitrate: 192,
        filename: `${safeName}.mp3`,
        referer: 'https://x.com/',
      }),
    });
  }

  return {
    id: `tw_${tweetId}_${Date.now()}`,
    platform: 'twitter',
    sourceUrl,
    title,
    author,
    thumbnailUrl: data.thumbnail ? signImageProxyUrl(data.thumbnail, 'https://x.com/') : '',
    contentTypeLabel: firstVideoUrl ? 'Twitter X Video' : 'Twitter X Post Photo',
    formats,
    analyzedAt: Date.now(),
    elapsedMs: Date.now() - start,
  };
}

export async function extractTwitter(
  urlObj: URL,
  signal?: AbortSignal
): Promise<MediaItem> {
  let resolvedUrl = urlObj;
  if (
    urlObj.hostname === 't.co' ||
    urlObj.hostname.includes('fxtwitter') ||
    urlObj.hostname.includes('vxtwitter') ||
    urlObj.hostname.includes('fixupx')
  ) {
    if (urlObj.hostname === 't.co') {
      const head = await fetchWithTimeout(urlObj.toString(), {
        method: 'GET',
        redirect: 'follow',
        timeoutMs: 4000,
        parentSignal: signal,
      }).catch(() => null);
      if (head?.url) {
        const parsed = new URL(head.url);
        if (!isPrivateOrReservedHost(parsed.hostname)) {
          resolvedUrl = parsed;
        }
      }
    } else {
      const normalized = new URL(urlObj.toString());
      normalized.hostname = 'x.com';
      resolvedUrl = normalized;
    }
  }

  const tweetId = extractTweetId(resolvedUrl);
  if (!tweetId) {
    throw new Error('Could not detect a valid Twitter/X status ID in this link.');
  }

  try {
    return await Promise.any([
      queryFxTwitter(tweetId, resolvedUrl.toString(), signal),
      queryCliptoTwitter(tweetId, resolvedUrl.toString(), signal),
      queryVxTwitter(tweetId, resolvedUrl.toString(), signal),
    ]);
  } catch (err) {
    if (signal?.aborted) throw new Error('Analysis cancelled.');
    const msg =
      err instanceof AggregateError
        ? err.errors[0]?.message || 'Post unreachable'
        : err instanceof Error
          ? err.message
          : 'Twitter extraction failed';
    throw new Error(`Unable to extract this X post (${msg}).`);
  }
}
