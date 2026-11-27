export type PlatformId =
  | 'youtube'
  | 'tiktok'
  | 'instagram'
  | 'twitter'
  | 'facebook';

export type MediaFormatKind = 'mp4' | 'mp3' | 'photo';

export interface MediaFormatOption {
  id: string;
  kind: MediaFormatKind;
  label: string;
  quality: string;
  ext: 'mp4' | 'mp3' | 'jpg' | 'png' | 'webp';
  sizeLabel: string;
  note?: string;
  downloadUrl: string;
  hasAudio?: boolean;
  bitrateKbps?: number;
  height?: number;
}

export interface MediaItem {
  id: string;
  platform: PlatformId;
  sourceUrl: string;
  title: string;
  author: string;
  durationSeconds?: number;
  durationLabel?: string;
  thumbnailUrl: string;
  contentTypeLabel: string;
  formats: MediaFormatOption[];
  analyzedAt: number;
  elapsedMs: number;
}

export type DownloadStatus =
  | 'downloading'
  | 'completed'
  | 'cancelled'
  | 'error';

export interface DownloadTask {
  taskId: string;
  mediaId: string;
  formatId: string;
  platform: PlatformId;
  title: string;
  quality: string;
  ext: string;
  progress: number | null;
  loadedBytes: number;
  totalBytes: number | null;
  status: DownloadStatus;
  errorMessage?: string;
  startedAt: number;
}
