import type { MediaFormatOption, MediaItem } from '../../types/media.ts';
import { sanitizeFilename } from '../security.ts';
import {
  DESKTOP_UA,
  decodeHtmlEntities,
  estimateAudioSize,
  fetchWithTimeout,
  formatBytes,
  formatDuration,
  signDownloadProxyUrl,
  signImageProxyUrl,
} from './common.ts';

interface InnertubeFormat {
  itag?: number;
  url?: string;
  mimeType?: string;
  bitrate?: number;
  width?: number;
  height?: number;
  contentLength?: string;
  qualityLabel?: string;
}

interface InnertubePlayerResponse {
  playabilityStatus?: {
    status?: string;
    reason?: string;
  };
  videoDetails?: {
    videoId?: string;
    title?: string;
    author?: string;
    lengthSeconds?: string;
    thumbnail?: {
      thumbnails?: Array<{ url: string; width?: number; height?: number }>;
    };
  };
  streamingData?: {
    formats?: InnertubeFormat[];
    adaptiveFormats?: InnertubeFormat[];
  };
}

interface CliptoMedia {
  url?: string;
  mimeType?: string;
  bitrate?: number;
  width?: number;
  height?: number;
  qualityLabel?: string;
  label?: string;
  is_audio?: boolean;
  type?: 'video' | 'audio' | string;
  extension?: string;
}

interface CliptoResponse {
  success?: boolean;
  title?: string;
  author?: string;
  thumbnail?: string;
  duration?: number;
  medias?: CliptoMedia[];
  message?: string;
}

export function extractYouTubeVideoId(urlObj: URL): string | null {
  const host = urlObj.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'youtu.be') {
    const id = urlObj.pathname.split('/').filter(Boolean)[0];
    return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  }

  const vParam = urlObj.searchParams.get('v');
  if (vParam && /^[a-zA-Z0-9_-]{11}$/.test(vParam)) {
    return vParam;
  }

  const parts = urlObj.pathname.split('/').filter(Boolean);
  if (
    parts.length >= 2 &&
    ['shorts', 'embed', 'live', 'v'].includes(parts[0]) &&
    /^[a-zA-Z0-9_-]{11}$/.test(parts[1])
  ) {
    return parts[1];
  }

  return null;
}

const INNERTUBE_CLIENTS = [
  {
    name: 'IOS',
    userAgent:
      'com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_1_0 like Mac OS X)',
    context: {
      client: {
        clientName: 'IOS',
        clientVersion: '19.45.4',
        deviceMake: 'Apple',
        deviceModel: 'iPhone16,2',
        osName: 'iPhone',
        osVersion: '18.1.0.22B83',
        hl: 'en',
        gl: 'US',
      },
    },
  },
  {
    name: 'ANDROID',
    userAgent: 'com.google.android.youtube/19.44.38 (Linux; U; Android 14) gzip',
    context: {
      client: {
        clientName: 'ANDROID',
        clientVersion: '19.44.38',
        androidSdkVersion: 34,
        hl: 'en',
        gl: 'US',
      },
    },
  },
  {
    name: 'ANDROID_VR',
    userAgent:
      'com.google.android.apps.youtube.vr.oculus/1.56.21 (Linux; U; Android 12L) gzip',
    context: {
      client: {
        clientName: 'ANDROID_VR',
        clientVersion: '1.56.21',
        deviceMake: 'Oculus',
        deviceModel: 'Quest 3',
        osName: 'Android',
        osVersion: '12L',
        androidSdkVersion: 32,
        hl: 'en',
        gl: 'US',
      },
    },
  },
];

function hasUsableStreams(data: InnertubePlayerResponse | null): boolean {
  if (!data?.streamingData) return false;
  const progressive = data.streamingData.formats ?? [];
  const adaptive = data.streamingData.adaptiveFormats ?? [];
  return [...progressive, ...adaptive].some(
    (f) => typeof f.url === 'string' && f.url.length > 0
  );
}

async function queryInnertubeClient(
  videoId: string,
  clientCfg: (typeof INNERTUBE_CLIENTS)[number],
  signal?: AbortSignal
): Promise<InnertubePlayerResponse> {
  const res = await fetchWithTimeout(
    'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
    {
      method: 'POST',
      timeoutMs: 3600,
      parentSignal: signal,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': clientCfg.userAgent,
        Origin: 'https://www.youtube.com',
        Referer: `https://www.youtube.com/watch?v=${videoId}`,
      },
      body: JSON.stringify({
        videoId,
        context: clientCfg.context,
        contentCheckOk: true,
        racyCheckOk: true,
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`InnerTube ${clientCfg.name} HTTP ${res.status}`);
  }

  const json = (await res.json()) as InnertubePlayerResponse;
  if (!hasUsableStreams(json)) {
    throw new Error(
      json.playabilityStatus?.reason || `No direct streams from ${clientCfg.name}`
    );
  }
  return json;
}

async function queryCliptoYouTube(
  videoId: string,
  sourceUrl: string,
  isShorts: boolean,
  signal?: AbortSignal
): Promise<MediaItem> {
  const start = Date.now();
  const res = await fetchWithTimeout('https://www.clipto.com/api/youtube', {
    method: 'POST',
    timeoutMs: 12500,
    parentSignal: signal,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': DESKTOP_UA,
      Accept: 'application/json',
    },
    body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${videoId}` }),
  });

  if (!res.ok) throw new Error(`Fast YouTube resolver HTTP ${res.status}`);
  const data = (await res.json()) as CliptoResponse;
  if (!data.success || !Array.isArray(data.medias) || data.medias.length === 0) {
    throw new Error(data.message || 'No YouTube streams found');
  }

  const title = decodeHtmlEntities(data.title || `YouTube Video ${videoId}`);
  const author = decodeHtmlEntities(data.author || 'YouTube Creator');
  const durationSeconds = data.duration && data.duration > 0 ? data.duration : undefined;
  const durationLabel = formatDuration(durationSeconds);
  const rawThumb =
    data.thumbnail || `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
  const thumbnailUrl = signImageProxyUrl(rawThumb, 'https://www.youtube.com/');
  const safeName = sanitizeFilename(title, `youtube_${videoId}`);

  const audioCandidates = data.medias
    .filter((m) => m.type === 'audio' && m.url)
    .sort((a, b) => {
      const aM4a = a.extension === 'm4a' ? 1 : 0;
      const bM4a = b.extension === 'm4a' ? 1 : 0;
      if (aM4a !== bM4a) return bM4a - aM4a;
      return (b.bitrate ?? 0) - (a.bitrate ?? 0);
    });
  const bestAudio = audioCandidates[0];

  const formats: MediaFormatOption[] = [];
  const seenHeights = new Set<number>();

  const videoStreams = data.medias
    .filter((m) => m.type === 'video' && m.url && m.extension === 'mp4')
    .sort((a, b) => {
      const aHasAudio = a.is_audio ? 1 : 0;
      const bHasAudio = b.is_audio ? 1 : 0;
      if ((b.height ?? 0) !== (a.height ?? 0)) return (b.height ?? 0) - (a.height ?? 0);
      return bHasAudio - aHasAudio;
    });

  for (const m of videoStreams) {
    const height = m.height ?? 360;
    if (seenHeights.has(height)) continue;
    seenHeights.add(height);
    const qualityLabel = m.qualityLabel || `${height}p`;
    const estBytes =
      durationSeconds && m.bitrate
        ? Math.round((durationSeconds * m.bitrate) / 8)
        : undefined;

    formats.push({
      id: `yt-mp4-${height}`,
      kind: 'mp4',
      label: `${qualityLabel} MP4`,
      quality: qualityLabel,
      ext: 'mp4',
      sizeLabel: formatBytes(estBytes),
      note: m.is_audio ? 'Direct MP4 with audio' : 'HD MP4 muxed stream',
      hasAudio: true,
      height,
      downloadUrl: signDownloadProxyUrl({
        url: m.url!,
        audioUrl: !m.is_audio ? bestAudio?.url : undefined,
        ext: 'mp4',
        mode: !m.is_audio && bestAudio?.url ? 'mux' : 'direct',
        filename: `${safeName}_${qualityLabel}.mp4`,
        referer: 'https://www.youtube.com/',
      }),
    });
  }

  const audioSource = bestAudio?.url || videoStreams[0]?.url;
  if (audioSource) {
    for (const kbps of [320, 192, 128]) {
      formats.push({
        id: `yt-mp3-${kbps}`,
        kind: 'mp3',
        label: `MP3 ${kbps} kbps`,
        quality: `${kbps} kbps`,
        ext: 'mp3',
        sizeLabel: estimateAudioSize(durationSeconds, kbps),
        note: kbps === 320 ? 'Studio quality audio' : 'High efficiency MP3',
        bitrateKbps: kbps,
        downloadUrl: signDownloadProxyUrl({
          url: audioSource,
          ext: 'mp3',
          mode: 'mp3',
          bitrate: kbps,
          filename: `${safeName}_${kbps}kbps.mp3`,
          referer: 'https://www.youtube.com/',
        }),
      });
    }
  }

  formats.push({
    id: 'yt-thumb-hd',
    kind: 'photo',
    label: 'Cover Thumbnail HD',
    quality: 'Max Res JPG',
    ext: 'jpg',
    sizeLabel: 'Image',
    note: 'Original video cover artwork',
    downloadUrl: signDownloadProxyUrl({
      url: rawThumb,
      ext: 'jpg',
      mode: 'direct',
      filename: `${safeName}_cover.jpg`,
      referer: 'https://www.youtube.com/',
    }),
  });

  return {
    id: `yt_${videoId}_${Date.now()}`,
    platform: 'youtube',
    sourceUrl,
    title,
    author,
    durationSeconds,
    durationLabel,
    thumbnailUrl,
    contentTypeLabel: isShorts ? 'YouTube Shorts' : 'YouTube Video',
    formats,
    analyzedAt: Date.now(),
    elapsedMs: Date.now() - start,
  };
}

function buildFromInnertube(
  playerData: InnertubePlayerResponse,
  videoId: string,
  sourceUrl: string,
  isShorts: boolean,
  start: number
): MediaItem {
  const details = playerData.videoDetails ?? {};
  const title = decodeHtmlEntities(details.title || `YouTube Video ${videoId}`);
  const author = decodeHtmlEntities(details.author || 'YouTube Creator');
  const durationSeconds = details.lengthSeconds
    ? Number(details.lengthSeconds)
    : undefined;
  const durationLabel = formatDuration(durationSeconds);

  const thumbs = details.thumbnail?.thumbnails ?? [];
  const bestThumbRaw =
    thumbs.sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ||
    `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
  const thumbnailUrl = signImageProxyUrl(bestThumbRaw, 'https://www.youtube.com/');

  const safeName = sanitizeFilename(title, `youtube_${videoId}`);
  const progressive = (playerData.streamingData?.formats ?? []).filter((f) =>
    Boolean(f.url)
  );
  const adaptive = (playerData.streamingData?.adaptiveFormats ?? []).filter((f) =>
    Boolean(f.url)
  );

  const audioStreams = adaptive
    .filter((f) => f.mimeType?.startsWith('audio/') && f.url)
    .sort((a, b) => {
      const aIsMp4 = a.mimeType?.includes('audio/mp4') ? 1 : 0;
      const bIsMp4 = b.mimeType?.includes('audio/mp4') ? 1 : 0;
      if (aIsMp4 !== bIsMp4) return bIsMp4 - aIsMp4;
      return (b.bitrate ?? 0) - (a.bitrate ?? 0);
    });
  const bestAudio = audioStreams[0] ?? progressive[0];

  const formats: MediaFormatOption[] = [];
  const seenHeights = new Set<number>();

  const mp4Progressive = progressive
    .filter((f) => f.mimeType?.includes('video/mp4') && f.url)
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));

  for (const fmt of mp4Progressive) {
    const height = fmt.height ?? 360;
    if (seenHeights.has(height)) continue;
    seenHeights.add(height);
    const qualityLabel = fmt.qualityLabel || `${height}p`;
    const bytes = fmt.contentLength ? Number(fmt.contentLength) : undefined;
    formats.push({
      id: `yt-mp4-prog-${height}`,
      kind: 'mp4',
      label: `${qualityLabel} MP4`,
      quality: qualityLabel,
      ext: 'mp4',
      sizeLabel: formatBytes(bytes),
      note: 'Direct MP4 with audio',
      hasAudio: true,
      height,
      downloadUrl: signDownloadProxyUrl({
        url: fmt.url!,
        ext: 'mp4',
        mode: 'direct',
        filename: `${safeName}_${qualityLabel}.mp4`,
        referer: 'https://www.youtube.com/',
      }),
    });
  }

  const mp4Adaptive = adaptive
    .filter(
      (f) => f.mimeType?.includes('video/mp4') && f.url && (f.height ?? 0) >= 480
    )
    .sort((a, b) => {
      const aAvc = a.mimeType?.includes('avc1') ? 1 : 0;
      const bAvc = b.mimeType?.includes('avc1') ? 1 : 0;
      if ((b.height ?? 0) !== (a.height ?? 0)) return (b.height ?? 0) - (a.height ?? 0);
      if (aAvc !== bAvc) return bAvc - aAvc;
      return (b.bitrate ?? 0) - (a.bitrate ?? 0);
    });

  for (const fmt of mp4Adaptive) {
    const height = fmt.height ?? 720;
    if (seenHeights.has(height)) continue;
    seenHeights.add(height);
    const qualityLabel = fmt.qualityLabel || `${height}p`;
    const videoBytes = fmt.contentLength ? Number(fmt.contentLength) : 0;
    const audioBytes = bestAudio?.contentLength ? Number(bestAudio.contentLength) : 0;
    const combinedBytes = videoBytes > 0 ? videoBytes + audioBytes : undefined;

    formats.push({
      id: `yt-mp4-hd-${height}`,
      kind: 'mp4',
      label: `${qualityLabel} MP4`,
      quality: qualityLabel,
      ext: 'mp4',
      sizeLabel: formatBytes(combinedBytes),
      note: height >= 1080 ? 'Full HD / 4K muxed stream' : 'HD MP4 with audio',
      hasAudio: true,
      height,
      downloadUrl: signDownloadProxyUrl({
        url: fmt.url!,
        audioUrl: bestAudio?.url,
        ext: 'mp4',
        mode: bestAudio?.url ? 'mux' : 'direct',
        filename: `${safeName}_${qualityLabel}.mp4`,
        referer: 'https://www.youtube.com/',
      }),
    });
  }

  formats.sort((a, b) => (b.height ?? 0) - (a.height ?? 0));

  if (bestAudio?.url) {
    for (const kbps of [320, 192, 128]) {
      formats.push({
        id: `yt-mp3-${kbps}`,
        kind: 'mp3',
        label: `MP3 ${kbps} kbps`,
        quality: `${kbps} kbps`,
        ext: 'mp3',
        sizeLabel: estimateAudioSize(durationSeconds, kbps),
        note: kbps === 320 ? 'Studio quality audio' : 'High efficiency MP3',
        bitrateKbps: kbps,
        downloadUrl: signDownloadProxyUrl({
          url: bestAudio.url,
          ext: 'mp3',
          mode: 'mp3',
          bitrate: kbps,
          filename: `${safeName}_${kbps}kbps.mp3`,
          referer: 'https://www.youtube.com/',
        }),
      });
    }
  }

  formats.push({
    id: 'yt-thumb-hd',
    kind: 'photo',
    label: 'Cover Thumbnail HD',
    quality: 'Max Res JPG',
    ext: 'jpg',
    sizeLabel: 'Image',
    note: 'Original video cover artwork',
    downloadUrl: signDownloadProxyUrl({
      url: bestThumbRaw,
      ext: 'jpg',
      mode: 'direct',
      filename: `${safeName}_cover.jpg`,
      referer: 'https://www.youtube.com/',
    }),
  });

  return {
    id: `yt_${videoId}_${Date.now()}`,
    platform: 'youtube',
    sourceUrl,
    title,
    author,
    durationSeconds,
    durationLabel,
    thumbnailUrl,
    contentTypeLabel: isShorts ? 'YouTube Shorts' : 'YouTube Video',
    formats,
    analyzedAt: Date.now(),
    elapsedMs: Date.now() - start,
  };
}

export async function extractYouTube(
  urlObj: URL,
  signal?: AbortSignal
): Promise<MediaItem> {
  const start = Date.now();
  const videoId = extractYouTubeVideoId(urlObj);
  if (!videoId) {
    throw new Error('Could not detect a valid YouTube video or Shorts ID in this link.');
  }

  const isShorts = urlObj.pathname.toLowerCase().includes('/shorts/');
  const sourceUrl = urlObj.toString();

  try {
    return await Promise.any([
      ...INNERTUBE_CLIENTS.map(async (client) => {
        const res = await queryInnertubeClient(videoId, client, signal);
        return buildFromInnertube(res, videoId, sourceUrl, isShorts, start);
      }),
      queryCliptoYouTube(videoId, sourceUrl, isShorts, signal),
    ]);
  } catch (err) {
    if (signal?.aborted) {
      throw new Error('Analysis cancelled.');
    }
    const reason =
      err instanceof AggregateError
        ? err.errors[err.errors.length - 1]?.message || 'YouTube extraction failed'
        : err instanceof Error
          ? err.message
          : 'YouTube extraction failed';
    throw new Error(`Unable to load this YouTube video right now (${reason}).`);
  }
}
