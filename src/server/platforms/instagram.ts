import type { MediaFormatOption, MediaItem } from '../../types/media.ts';
import { isPrivateOrReservedHost, sanitizeFilename } from '../security.ts';
import {
  DESKTOP_UA,
  MOBILE_UA,
  decodeHtmlEntities,
  fetchWithTimeout,
  signDownloadProxyUrl,
  signImageProxyUrl,
} from './common.ts';

function extractInstagramShortcode(urlObj: URL): string | null {
  const match = urlObj.pathname.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  return match ? match[1] : null;
}

async function resolveInstagramUrl(urlObj: URL, signal?: AbortSignal): Promise<URL> {
  if (
    urlObj.pathname.startsWith('/share/') ||
    urlObj.hostname.toLowerCase().includes('instagr.am') ||
    urlObj.hostname.toLowerCase().includes('ddinstagram.com')
  ) {
    if (urlObj.hostname.toLowerCase().includes('ddinstagram.com')) {
      const normalized = new URL(urlObj.toString());
      normalized.hostname = 'www.instagram.com';
      return normalized;
    }
    const res = await fetchWithTimeout(urlObj.toString(), {
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
          finalUrl.hostname.includes('instagram.com')
        ) {
          return finalUrl;
        }
      } catch {
        // Keep original URL
      }
    }
  }
  return urlObj;
}

function buildInstagramResult(params: {
  shortcode: string;
  sourceUrl: string;
  title: string;
  author: string;
  thumbnailRaw: string;
  videoUrls: string[];
  photoUrls: string[];
  isReel: boolean;
  start: number;
}): MediaItem {
  const {
    shortcode,
    sourceUrl,
    title,
    author,
    thumbnailRaw,
    videoUrls,
    photoUrls,
    isReel,
    start,
  } = params;

  const safeName = sanitizeFilename(title, `instagram_${shortcode}`);
  const formats: MediaFormatOption[] = [];

  videoUrls.forEach((vUrl, idx) => {
    const label =
      videoUrls.length > 1 ? `HD Video ${idx + 1} (MP4)` : 'HD Video / Reel (MP4)';
    formats.push({
      id: `ig-mp4-${idx}`,
      kind: 'mp4',
      label,
      quality: '1080p HD',
      ext: 'mp4',
      sizeLabel: 'HD Stream',
      note: 'Clean MP4 with original audio',
      hasAudio: true,
      height: 1080,
      downloadUrl: signDownloadProxyUrl({
        url: vUrl,
        ext: 'mp4',
        mode: 'direct',
        filename: `${safeName}_${idx + 1}.mp4`,
        referer: 'https://www.instagram.com/',
      }),
    });
  });

  if (videoUrls[0]) {
    for (const kbps of [320, 192]) {
      formats.push({
        id: `ig-mp3-${kbps}`,
        kind: 'mp3',
        label: `MP3 ${kbps} kbps`,
        quality: `${kbps} kbps`,
        ext: 'mp3',
        sizeLabel: 'Auto',
        note: 'Extracted Reel / video audio',
        bitrateKbps: kbps,
        downloadUrl: signDownloadProxyUrl({
          url: videoUrls[0],
          ext: 'mp3',
          mode: 'mp3',
          bitrate: kbps,
          filename: `${safeName}_${kbps}kbps.mp3`,
          referer: 'https://www.instagram.com/',
        }),
      });
    }
  }

  photoUrls.forEach((pUrl, idx) => {
    formats.push({
      id: `ig-photo-${idx}`,
      kind: 'photo',
      label:
        photoUrls.length > 1 ? `Photo ${idx + 1} (Original HD)` : 'Photo (Original HD)',
      quality: 'Original JPG',
      ext: 'jpg',
      sizeLabel: 'Image',
      note: 'Full resolution Instagram photo',
      downloadUrl: signDownloadProxyUrl({
        url: pUrl,
        ext: 'jpg',
        mode: 'direct',
        filename: `${safeName}_photo_${idx + 1}.jpg`,
        referer: 'https://www.instagram.com/',
      }),
    });
  });

  if (formats.length === 0) {
    throw new Error('No downloadable Instagram media found');
  }

  const contentTypeLabel =
    videoUrls.length > 0 && photoUrls.length > 1
      ? 'Instagram Carousel'
      : isReel
        ? 'Instagram Reels'
        : videoUrls.length > 0
          ? 'Instagram Video'
          : photoUrls.length > 1
            ? 'Instagram Carousel Photos'
            : 'Instagram Photo';

  return {
    id: `ig_${shortcode}_${Date.now()}`,
    platform: 'instagram',
    sourceUrl,
    title,
    author,
    thumbnailUrl: thumbnailRaw
      ? signImageProxyUrl(thumbnailRaw, 'https://www.instagram.com/')
      : '',
    contentTypeLabel,
    formats,
    analyzedAt: Date.now(),
    elapsedMs: Date.now() - start,
  };
}

async function queryCliptoInstagram(
  shortcode: string,
  sourceUrl: string,
  isReel: boolean,
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
    body: JSON.stringify({ url: sourceUrl }),
  });
  if (!res.ok) throw new Error(`Instagram resolver HTTP ${res.status}`);
  const data = await res.json();
  if (!data?.success || !Array.isArray(data.medias) || data.medias.length === 0) {
    throw new Error(data?.message || 'Instagram media unavailable');
  }

  const videoUrls: string[] = [];
  const photoUrls: string[] = [];
  for (const m of data.medias as Array<{ url?: string; type?: string; extension?: string }>) {
    if (!m.url) continue;
    if (m.type === 'video' || m.extension === 'mp4') videoUrls.push(m.url);
    else if (m.type === 'image' || m.extension === 'jpg' || m.extension === 'png') {
      photoUrls.push(m.url);
    }
  }

  return buildInstagramResult({
    shortcode,
    sourceUrl,
    title: decodeHtmlEntities(data.title || `Instagram Post ${shortcode}`),
    author: decodeHtmlEntities(data.author || 'Instagram Creator'),
    thumbnailRaw: data.thumbnail || photoUrls[0] || '',
    videoUrls,
    photoUrls,
    isReel,
    start,
  });
}

async function queryInstagramEmbed(
  shortcode: string,
  sourceUrl: string,
  isReel: boolean,
  signal?: AbortSignal
): Promise<MediaItem> {
  const start = Date.now();
  const res = await fetchWithTimeout(
    `https://www.instagram.com/p/${shortcode}/embed/captioned/`,
    {
      timeoutMs: 7500,
      parentSignal: signal,
      headers: {
        'User-Agent': DESKTOP_UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    }
  );
  if (!res.ok) throw new Error(`Instagram embed HTTP ${res.status}`);
  const html = await res.text();

  const videoSet = new Set<string>();
  const photoSet = new Set<string>();

  for (const match of html.matchAll(/"video_url"\s*:\s*"([^"]+)"/g)) {
    videoSet.add(decodeHtmlEntities(match[1]));
  }
  for (const match of html.matchAll(/<video[^>]+src="([^"]+)"/gi)) {
    videoSet.add(decodeHtmlEntities(match[1]));
  }
  for (const match of html.matchAll(/"display_url"\s*:\s*"([^"]+)"/g)) {
    photoSet.add(decodeHtmlEntities(match[1]));
  }

  if (photoSet.size === 0) {
    const imgMatch = html.match(/class="EmbeddedMediaImage"[^>]+src="([^"]+)"/i);
    if (imgMatch) photoSet.add(decodeHtmlEntities(imgMatch[1]));
  }

  const captionMatch =
    html.match(/class="Caption"[^>]*>([\s\S]*?)<div/i) ||
    html.match(/"caption"\s*:\s*"([^"]+)"/);
  const rawCaption = captionMatch
    ? captionMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    : '';
  const authorMatch =
    html.match(/class="UsernameText"[^>]*>([^<]+)</i) ||
    html.match(/"username"\s*:\s*"([^"]+)"/);

  const videoUrls = Array.from(videoSet);
  const photoUrls = Array.from(photoSet);

  if (videoUrls.length === 0 && photoUrls.length === 0) {
    throw new Error('Instagram embed had no media');
  }

  return buildInstagramResult({
    shortcode,
    sourceUrl,
    title: decodeHtmlEntities(rawCaption || `Instagram Post ${shortcode}`),
    author: authorMatch ? `@${decodeHtmlEntities(authorMatch[1])}` : 'Instagram Creator',
    thumbnailRaw: photoUrls[0] || '',
    videoUrls,
    photoUrls,
    isReel,
    start,
  });
}

async function queryInstagramJsonApi(
  shortcode: string,
  sourceUrl: string,
  isReel: boolean,
  signal?: AbortSignal
): Promise<MediaItem> {
  const start = Date.now();
  const res = await fetchWithTimeout(
    `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`,
    {
      timeoutMs: 7000,
      parentSignal: signal,
      headers: {
        'User-Agent': MOBILE_UA,
        Accept: 'application/json',
        'X-IG-App-ID': '936619743392459',
      },
    }
  );
  if (!res.ok) throw new Error(`Instagram JSON HTTP ${res.status}`);
  const data = await res.json();
  const item = data?.items?.[0] || data?.graphql?.shortcode_media;
  if (!item) throw new Error('Instagram JSON payload empty');

  const videoUrls: string[] = [];
  const photoUrls: string[] = [];

  if (Array.isArray(item.carousel_media)) {
    for (const slide of item.carousel_media) {
      if (slide.video_versions?.[0]?.url) videoUrls.push(slide.video_versions[0].url);
      if (slide.image_versions2?.candidates?.[0]?.url) {
        photoUrls.push(slide.image_versions2.candidates[0].url);
      }
    }
  } else {
    if (item.video_versions?.[0]?.url) videoUrls.push(item.video_versions[0].url);
    if (item.video_url) videoUrls.push(item.video_url);
    if (item.image_versions2?.candidates?.[0]?.url) {
      photoUrls.push(item.image_versions2.candidates[0].url);
    }
    if (item.display_url) photoUrls.push(item.display_url);
  }

  const title = decodeHtmlEntities(
    item.caption?.text ||
      item.edge_media_to_caption?.edges?.[0]?.node?.text ||
      `Instagram Post ${shortcode}`
  );
  const username = item.user?.username || item.owner?.username;

  return buildInstagramResult({
    shortcode,
    sourceUrl,
    title,
    author: username ? `@${username}` : 'Instagram Creator',
    thumbnailRaw: photoUrls[0] || '',
    videoUrls,
    photoUrls,
    isReel,
    start,
  });
}

async function queryInstagramOpenGraph(
  shortcode: string,
  sourceUrl: string,
  isReel: boolean,
  signal?: AbortSignal
): Promise<MediaItem> {
  const start = Date.now();
  const res = await fetchWithTimeout(`https://www.ddinstagram.com/p/${shortcode}/`, {
    timeoutMs: 7000,
    parentSignal: signal,
    headers: { 'User-Agent': 'TelegramBot (like TwitterBot)' },
  });
  if (!res.ok) throw new Error(`Instagram OG mirror HTTP ${res.status}`);
  const html = await res.text();

  const ogVideo = html.match(/<meta[^>]+property="og:video"[^>]+content="([^"]+)"/i)?.[1];
  const ogImage = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)?.[1];
  const ogTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)?.[1];
  const ogDesc = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i)?.[1];

  const videoUrls = ogVideo ? [decodeHtmlEntities(ogVideo)] : [];
  const photoUrls = ogImage ? [decodeHtmlEntities(ogImage)] : [];

  if (videoUrls.length === 0 && photoUrls.length === 0) {
    throw new Error('No OG media tags found');
  }

  return buildInstagramResult({
    shortcode,
    sourceUrl,
    title: decodeHtmlEntities(ogDesc || ogTitle || `Instagram Post ${shortcode}`),
    author: decodeHtmlEntities(ogTitle || 'Instagram Creator'),
    thumbnailRaw: photoUrls[0] || '',
    videoUrls,
    photoUrls,
    isReel,
    start,
  });
}

export async function extractInstagram(
  urlObj: URL,
  signal?: AbortSignal
): Promise<MediaItem> {
  const resolvedUrl = await resolveInstagramUrl(urlObj, signal);
  const shortcode = extractInstagramShortcode(resolvedUrl);
  if (!shortcode) {
    throw new Error('Could not find an Instagram post, photo, or Reels ID in this link.');
  }
  const isReel = resolvedUrl.pathname.toLowerCase().includes('/reel');
  const sourceUrl = `https://www.instagram.com/${isReel ? 'reel' : 'p'}/${shortcode}/`;

  try {
    return await Promise.any([
      queryCliptoInstagram(shortcode, sourceUrl, isReel, signal),
      queryInstagramEmbed(shortcode, sourceUrl, isReel, signal),
      queryInstagramJsonApi(shortcode, sourceUrl, isReel, signal),
      queryInstagramOpenGraph(shortcode, sourceUrl, isReel, signal),
    ]);
  } catch (err) {
    if (signal?.aborted) throw new Error('Analysis cancelled.');
    const msg =
      err instanceof AggregateError
        ? err.errors[0]?.message || 'Instagram post unreachable'
        : err instanceof Error
          ? err.message
          : 'Instagram extraction failed';
    throw new Error(
      `Unable to extract this Instagram post (${msg}). Ensure the account is public.`
    );
  }
}
