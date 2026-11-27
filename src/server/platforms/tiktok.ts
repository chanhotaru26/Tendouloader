import { MediaFormatOption, MediaItem } from '../../types/media';
import { isPrivateOrReservedHost, sanitizeFilename } from '../security';
import {
  DESKTOP_UA,
  decodeHtmlEntities,
  estimateAudioSize,
  fetchWithTimeout,
  formatBytes,
  formatDuration,
  signDownloadProxyUrl,
  signImageProxyUrl,
} from './common';

interface TikWmResponse {
  code?: number;
  msg?: string;
  data?: {
    id?: string;
    title?: string;
    duration?: number;
    cover?: string;
    origin_cover?: string;
    play?: string;
    hdplay?: string;
    size?: number;
    hd_size?: number;
    music?: string;
    music_info?: {
      title?: string;
    };
    author?: {
      nickname?: string;
      unique_id?: string;
    };
    images?: string[];
  };
}

interface CliptoTikTokResponse {
  success?: boolean;
  id?: string;
  title?: string;
  author?: string;
  thumbnail?: string;
  duration?: number;
  medias?: Array<{
    url?: string;
    quality?: string;
    type?: string;
    extension?: string;
    data_size?: number;
  }>;
}

async function resolveTikTokUrl(rawUrl: string, signal?: AbortSignal): Promise<string> {
  const parsed = new URL(rawUrl);
  const isShort =
    parsed.hostname.includes('vm.tiktok.com') ||
    parsed.hostname.includes('vt.tiktok.com') ||
    parsed.pathname.startsWith('/t/');

  if (isShort) {
    const res = await fetchWithTimeout(rawUrl, {
      method: 'GET',
      redirect: 'follow',
      timeoutMs: 4500,
      parentSignal: signal,
      headers: { 'User-Agent': DESKTOP_UA },
    }).catch(() => null);
    if (res?.url) {
      try {
        const finalUrl = new URL(res.url);
        if (!isPrivateOrReservedHost(finalUrl.hostname) && finalUrl.hostname.includes('tiktok.com')) {
          return finalUrl.origin + finalUrl.pathname;
        }
      } catch {
        // Keep original URL
      }
    }
  }
  return rawUrl;
}

async function queryCliptoTikTok(
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
  if (!res.ok) throw new Error(`TikTok resolver HTTP ${res.status}`);
  const data = (await res.json()) as CliptoTikTokResponse;
  if (!data.success || !Array.isArray(data.medias) || data.medias.length === 0) {
    throw new Error('TikTok video metadata unavailable');
  }

  const title = decodeHtmlEntities(data.title || 'TikTok Video');
  const author = decodeHtmlEntities(data.author || 'TikTok Creator');
  const durationSeconds =
    data.duration && data.duration > 0
      ? data.duration > 7200
        ? Math.round(data.duration / 1000)
        : data.duration
      : undefined;
  const rawThumb = data.thumbnail || '';
  const safeName = sanitizeFilename(title, `tiktok_${data.id || Date.now()}`);

  const formats: MediaFormatOption[] = [];
  const videos = data.medias.filter(
    (m) => m.type === 'video' && m.url && m.quality !== 'watermark'
  );
  const images = data.medias.filter((m) => m.type === 'image' && m.url);
  const audio = data.medias.find((m) => m.type === 'audio' && m.url);

  const hdVideo = videos.find((v) => v.quality?.includes('hd')) || videos[0];
  const sdVideo = videos.find((v) => v !== hdVideo);

  if (hdVideo?.url) {
    formats.push({
      id: 'tt-clipto-hd',
      kind: 'mp4',
      label: '1080p HD (No Watermark)',
      quality: 'HD No Watermark',
      ext: 'mp4',
      sizeLabel: formatBytes(hdVideo.data_size),
      note: 'Clean watermark-free HD stream',
      hasAudio: true,
      height: 1080,
      downloadUrl: signDownloadProxyUrl({
        url: hdVideo.url,
        ext: 'mp4',
        mode: 'direct',
        filename: `${safeName}_hd_nowm.mp4`,
        referer: 'https://www.tiktok.com/',
      }),
    });
  }

  if (sdVideo?.url) {
    formats.push({
      id: 'tt-clipto-sd',
      kind: 'mp4',
      label: '720p MP4 (No Watermark)',
      quality: 'Standard No Watermark',
      ext: 'mp4',
      sizeLabel: formatBytes(sdVideo.data_size),
      note: 'Fast watermark-free MP4',
      hasAudio: true,
      height: 720,
      downloadUrl: signDownloadProxyUrl({
        url: sdVideo.url,
        ext: 'mp4',
        mode: 'direct',
        filename: `${safeName}_nowm.mp4`,
        referer: 'https://www.tiktok.com/',
      }),
    });
  }

  if (images.length > 0) {
    images.forEach((img, idx) => {
      formats.push({
        id: `tt-slide-${idx + 1}`,
        kind: 'photo',
        label: `Slide Photo ${idx + 1}`,
        quality: 'Original HD',
        ext: 'jpg',
        sizeLabel: 'Image',
        note: `Photo ${idx + 1} of ${images.length}`,
        downloadUrl: signDownloadProxyUrl({
          url: img.url!,
          ext: 'jpg',
          mode: 'direct',
          filename: `${safeName}_slide_${idx + 1}.jpg`,
          referer: 'https://www.tiktok.com/',
        }),
      });
    });
  } else if (rawThumb) {
    formats.push({
      id: 'tt-clipto-cover',
      kind: 'photo',
      label: 'Video Cover HD',
      quality: 'Original JPG',
      ext: 'jpg',
      sizeLabel: 'Image',
      note: 'High-resolution cover frame',
      downloadUrl: signDownloadProxyUrl({
        url: rawThumb,
        ext: 'jpg',
        mode: 'direct',
        filename: `${safeName}_cover.jpg`,
        referer: 'https://www.tiktok.com/',
      }),
    });
  }

  const audioSrc = audio?.url || hdVideo?.url;
  if (audioSrc) {
    for (const kbps of [320, 192]) {
      formats.push({
        id: `tt-mp3-${kbps}`,
        kind: 'mp3',
        label: `MP3 ${kbps} kbps`,
        quality: `${kbps} kbps`,
        ext: 'mp3',
        sizeLabel: estimateAudioSize(durationSeconds, kbps),
        note: 'Extracted original audio',
        bitrateKbps: kbps,
        downloadUrl: signDownloadProxyUrl({
          url: audioSrc,
          ext: 'mp3',
          mode: 'mp3',
          bitrate: kbps,
          filename: `${safeName}_${kbps}kbps.mp3`,
          referer: 'https://www.tiktok.com/',
        }),
      });
    }
  }

  return {
    id: `tt_${data.id || Date.now()}`,
    platform: 'tiktok',
    sourceUrl: targetUrl,
    title,
    author,
    durationSeconds,
    durationLabel: formatDuration(durationSeconds),
    thumbnailUrl: rawThumb ? signImageProxyUrl(rawThumb, 'https://www.tiktok.com/') : '',
    contentTypeLabel: images.length > 0 ? 'TikTok Photo Slideshow' : 'TikTok Video',
    formats,
    analyzedAt: Date.now(),
    elapsedMs: Date.now() - start,
  };
}

async function queryTikWm(targetUrl: string, signal?: AbortSignal): Promise<MediaItem> {
  const start = Date.now();
  const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(targetUrl)}&hd=1`;
  const res = await fetchWithTimeout(apiUrl, {
    timeoutMs: 7500,
    parentSignal: signal,
    headers: {
      'User-Agent': DESKTOP_UA,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`TikTok resolver HTTP ${res.status}`);
  const json = (await res.json()) as TikWmResponse;
  if (json.code !== 0 || !json.data) {
    throw new Error(json.msg || 'TikTok video metadata unavailable');
  }

  const d = json.data;
  const title = decodeHtmlEntities(d.title || 'TikTok Video');
  const author = decodeHtmlEntities(
    d.author?.nickname || (d.author?.unique_id ? `@${d.author.unique_id}` : 'TikTok Creator')
  );
  const durationSeconds = d.duration;
  const durationLabel = formatDuration(durationSeconds);
  const rawCover = d.origin_cover || d.cover || '';
  const thumbnailUrl = rawCover ? signImageProxyUrl(rawCover, 'https://www.tiktok.com/') : '';
  const safeName = sanitizeFilename(title, `tiktok_${d.id || Date.now()}`);

  const formats: MediaFormatOption[] = [];

  if (d.hdplay) {
    formats.push({
      id: 'tt-mp4-hd',
      kind: 'mp4',
      label: '1080p HD (No Watermark)',
      quality: 'HD No Watermark',
      ext: 'mp4',
      sizeLabel: formatBytes(d.hd_size || d.size),
      note: 'Clean watermark-free HD stream',
      hasAudio: true,
      height: 1080,
      downloadUrl: signDownloadProxyUrl({
        url: d.hdplay,
        ext: 'mp4',
        mode: 'direct',
        filename: `${safeName}_hd_nowm.mp4`,
        referer: 'https://www.tiktok.com/',
      }),
    });
  }

  if (d.play) {
    formats.push({
      id: 'tt-mp4-sd',
      kind: 'mp4',
      label: '720p MP4 (No Watermark)',
      quality: 'Standard No Watermark',
      ext: 'mp4',
      sizeLabel: formatBytes(d.size),
      note: 'Fast watermark-free MP4',
      hasAudio: true,
      height: 720,
      downloadUrl: signDownloadProxyUrl({
        url: d.play,
        ext: 'mp4',
        mode: 'direct',
        filename: `${safeName}_nowm.mp4`,
        referer: 'https://www.tiktok.com/',
      }),
    });
  }

  if (Array.isArray(d.images) && d.images.length > 0) {
    d.images.forEach((imgUrl, idx) => {
      formats.push({
        id: `tt-photo-${idx + 1}`,
        kind: 'photo',
        label: `Slide Photo ${idx + 1}`,
        quality: 'Original HD',
        ext: 'jpg',
        sizeLabel: 'Image',
        note: `Carousel photo ${idx + 1} of ${d.images!.length}`,
        downloadUrl: signDownloadProxyUrl({
          url: imgUrl,
          ext: 'jpg',
          mode: 'direct',
          filename: `${safeName}_slide_${idx + 1}.jpg`,
          referer: 'https://www.tiktok.com/',
        }),
      });
    });
  } else if (rawCover) {
    formats.push({
      id: 'tt-cover-jpg',
      kind: 'photo',
      label: 'Video Cover HD',
      quality: 'Original JPG',
      ext: 'jpg',
      sizeLabel: 'Image',
      note: 'High-resolution cover frame',
      downloadUrl: signDownloadProxyUrl({
        url: rawCover,
        ext: 'jpg',
        mode: 'direct',
        filename: `${safeName}_cover.jpg`,
        referer: 'https://www.tiktok.com/',
      }),
    });
  }

  const audioSource = d.music || d.play || d.hdplay;
  if (audioSource) {
    for (const kbps of [320, 192]) {
      formats.push({
        id: `tt-mp3-${kbps}`,
        kind: 'mp3',
        label: `MP3 ${kbps} kbps`,
        quality: `${kbps} kbps`,
        ext: 'mp3',
        sizeLabel: estimateAudioSize(durationSeconds, kbps),
        note: d.music_info?.title
          ? `Original sound: ${decodeHtmlEntities(d.music_info.title).slice(0, 36)}`
          : 'Extracted original audio',
        bitrateKbps: kbps,
        downloadUrl: signDownloadProxyUrl({
          url: audioSource,
          ext: 'mp3',
          mode: 'mp3',
          bitrate: kbps,
          filename: `${safeName}_${kbps}kbps.mp3`,
          referer: 'https://www.tiktok.com/',
        }),
      });
    }
  }

  if (formats.length === 0) {
    throw new Error('No downloadable TikTok streams found.');
  }

  return {
    id: `tt_${d.id || Date.now()}`,
    platform: 'tiktok',
    sourceUrl: targetUrl,
    title,
    author,
    durationSeconds,
    durationLabel,
    thumbnailUrl,
    contentTypeLabel:
      Array.isArray(d.images) && d.images.length > 0 ? 'TikTok Photo Slideshow' : 'TikTok Video',
    formats,
    analyzedAt: Date.now(),
    elapsedMs: Date.now() - start,
  };
}

async function queryTikTokHtmlFallback(
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
    },
  });
  if (!res.ok) throw new Error(`TikTok page HTTP ${res.status}`);
  const html = await res.text();
  const match = html.match(
    /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/
  );
  if (!match) throw new Error('TikTok hydration data not found');

  const json = JSON.parse(match[1]);
  const itemStruct =
    json?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct;
  if (!itemStruct) throw new Error('TikTok item structure unavailable');

  const title = decodeHtmlEntities(itemStruct.desc || 'TikTok Video');
  const author = decodeHtmlEntities(
    itemStruct.author?.nickname || itemStruct.author?.uniqueId || 'TikTok Creator'
  );
  const durationSeconds = itemStruct.video?.duration;
  const playAddr = itemStruct.video?.playAddr || itemStruct.video?.downloadAddr;
  const cover = itemStruct.video?.originCover || itemStruct.video?.cover || '';
  const imageSlides: string[] = Array.isArray(itemStruct.imagePost?.images)
    ? itemStruct.imagePost.images
        .map((img: { imageURL?: { urlList?: string[] } }) => img?.imageURL?.urlList?.[0])
        .filter(Boolean)
    : [];
  const safeName = sanitizeFilename(title, `tiktok_${itemStruct.id || Date.now()}`);

  const formats: MediaFormatOption[] = [];

  if (playAddr) {
    formats.push({
      id: 'tt-html-mp4',
      kind: 'mp4',
      label: 'HD MP4 (No Watermark)',
      quality: `${itemStruct.video?.height || 720}p`,
      ext: 'mp4',
      sizeLabel: 'Auto',
      note: 'Direct TikTok stream',
      hasAudio: true,
      height: itemStruct.video?.height || 720,
      downloadUrl: signDownloadProxyUrl({
        url: playAddr,
        ext: 'mp4',
        mode: 'direct',
        filename: `${safeName}.mp4`,
        referer: 'https://www.tiktok.com/',
      }),
    });
  }

  imageSlides.forEach((imgUrl, idx) => {
    formats.push({
      id: `tt-html-slide-${idx + 1}`,
      kind: 'photo',
      label: `Slide Photo ${idx + 1}`,
      quality: 'Original HD',
      ext: 'jpg',
      sizeLabel: 'Image',
      note: `Photo ${idx + 1} of ${imageSlides.length}`,
      downloadUrl: signDownloadProxyUrl({
        url: imgUrl,
        ext: 'jpg',
        mode: 'direct',
        filename: `${safeName}_slide_${idx + 1}.jpg`,
        referer: 'https://www.tiktok.com/',
      }),
    });
  });

  if (playAddr || itemStruct.music?.playUrl) {
    formats.push({
      id: 'tt-html-mp3-192',
      kind: 'mp3',
      label: 'MP3 192 kbps',
      quality: '192 kbps',
      ext: 'mp3',
      sizeLabel: estimateAudioSize(durationSeconds, 192),
      note: 'Extracted TikTok audio',
      bitrateKbps: 192,
      downloadUrl: signDownloadProxyUrl({
        url: itemStruct.music?.playUrl || playAddr,
        ext: 'mp3',
        mode: 'mp3',
        bitrate: 192,
        filename: `${safeName}.mp3`,
        referer: 'https://www.tiktok.com/',
      }),
    });
  }

  if (formats.length === 0) {
    throw new Error('No direct video or photo stream found in TikTok HTML');
  }

  return {
    id: `tt_${itemStruct.id || Date.now()}`,
    platform: 'tiktok',
    sourceUrl: targetUrl,
    title,
    author,
    durationSeconds,
    durationLabel: formatDuration(durationSeconds),
    thumbnailUrl: cover ? signImageProxyUrl(cover, 'https://www.tiktok.com/') : '',
    contentTypeLabel:
      imageSlides.length > 0 ? 'TikTok Photo Slideshow' : 'TikTok Video',
    formats,
    analyzedAt: Date.now(),
    elapsedMs: Date.now() - start,
  };
}

export async function extractTikTok(
  urlObj: URL,
  signal?: AbortSignal
): Promise<MediaItem> {
  const targetUrl = await resolveTikTokUrl(urlObj.toString(), signal);
  try {
    return await Promise.any([
      queryCliptoTikTok(targetUrl, signal),
      queryTikWm(targetUrl, signal),
      queryTikTokHtmlFallback(targetUrl, signal),
    ]);
  } catch (err) {
    if (signal?.aborted) throw new Error('Analysis cancelled.');
    const msg =
      err instanceof AggregateError
        ? err.errors[0]?.message || 'TikTok extraction failed'
        : err instanceof Error
          ? err.message
          : 'TikTok extraction failed';
    throw new Error(`Could not extract TikTok video (${msg}). Make sure the post is public.`);
  }
}
