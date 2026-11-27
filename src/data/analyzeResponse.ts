import type { MediaItem } from '../types/media';
import { PLATFORM_MAP } from './platforms';

export async function readAnalysisResponse(response: Response): Promise<MediaItem> {
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    if (typeof payload?.error === 'string' && payload.error.trim()) {
      throw new Error(payload.error);
    }
    throw new Error(`The media service is unavailable (HTTP ${response.status}). Please try again.`);
  }

  if (
    typeof payload?.id !== 'string' ||
    typeof payload.platform !== 'string' ||
    !Object.hasOwn(PLATFORM_MAP, payload.platform) ||
    typeof payload.title !== 'string' ||
    !Array.isArray(payload.formats)
  ) {
    throw new Error('The media service returned an invalid response. Please try again.');
  }

  return payload as MediaItem;
}
