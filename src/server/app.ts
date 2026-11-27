import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import express, { type ErrorRequestHandler } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { analyzeMediaUrl } from './extractors.ts';
import { DESKTOP_UA } from './platforms/common.ts';
import { fetchPublicUrl } from './publicFetch.ts';
import {
  isTrustedMediaUrl,
  sanitizeFilename,
  verifySignedToken,
} from './security.ts';
import type { PlatformId } from '../types/media.ts';

const FFMPEG_BIN = '/usr/bin/ffmpeg';

export function createMediaApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/analyze', async (req, res) => {
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url : '';
    const platform = typeof req.body?.platform === 'string'
      ? (req.body.platform as PlatformId)
      : undefined;

    const abortController = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    });

    const timeout = AbortSignal.timeout(15_000);
    const signal = AbortSignal.any([abortController.signal, timeout]);

    try {
      const result = await analyzeMediaUrl(rawUrl, platform, signal);
      if (abortController.signal.aborted || res.writableEnded) return;
      res.json(result);
    } catch (error) {
      if (abortController.signal.aborted || res.writableEnded) return;
      if (timeout.aborted) {
        res.status(504).json({ error: 'Media analysis timed out. Please try again.' });
        return;
      }
      const message =
        error instanceof Error ? error.message : 'Unable to analyze this media link.';
      res.status(400).json({ error: message });
    }
  });

  app.get('/api/proxy-image', async (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const payload = verifySignedToken(token);
    if (!payload || payload.type !== 'image') {
      res.status(403).send('Invalid or expired image token');
      return;
    }

    const abortController = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    });

    try {
      const upstream = await fetchPublicUrl(payload.url, {
        signal: abortController.signal,
        headers: {
          'User-Agent': DESKTOP_UA,
          ...(payload.referer ? { Referer: payload.referer } : {}),
        },
      });
      if (!upstream.ok || !upstream.body) {
        res.status(502).send('Upstream image unavailable');
        return;
      }

      const contentType = upstream.headers.get('content-type') || 'image/jpeg';
      if (!contentType.startsWith('image/')) {
        res.status(403).send('Blocked non-image content');
        return;
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=1800');
      await pipeline(
        Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]),
        res
      );
    } catch {
      if (!res.headersSent) {
        res.status(502).end();
      }
    }
  });

  app.get('/api/download', async (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const payload = verifySignedToken(token);
    if (!payload || payload.type !== 'download') {
      res.status(403).json({ error: 'Download link expired. Please re-analyze the URL.' });
      return;
    }

    const abortController = new AbortController();
    let closed = false;
    let activeChild: ReturnType<typeof spawn> | null = null;
    let tempFilePath: string | null = null;

    const cleanupTemp = () => {
      if (tempFilePath) {
        const target = tempFilePath;
        tempFilePath = null;
        fs.promises.unlink(target).catch(() => {});
      }
    };

    res.on('close', () => {
      if (res.writableEnded) return;
      closed = true;
      abortController.abort();
      if (activeChild && !activeChild.killed) {
        activeChild.kill('SIGKILL');
      }
      cleanupTemp();
    });

    const ext = payload.ext || 'mp4';
    const baseName = sanitizeFilename(
      (payload.filename || 'tendouloader_media').replace(/\.[^.]+$/, ''),
      'tendouloader_media'
    );
    const safeDownloadName = `${baseName}.${ext}`;

    const mimeByExt: Record<string, string> = {
      mp4: 'video/mp4',
      mp3: 'audio/mpeg',
      jpg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
    };
    const contentType = mimeByExt[ext] || 'application/octet-stream';

    // Mode 1: Real-time MP3 conversion via ffmpeg (no shell)
    if (payload.mode === 'mp3') {
      const kbps = [128, 192, 320].includes(Number(payload.bitrate))
        ? Number(payload.bitrate)
        : 192;

      const args = [
        '-hide_banner',
        '-loglevel',
        'error',
        '-reconnect',
        '1',
        '-reconnect_streamed',
        '1',
        '-reconnect_delay_max',
        '2',
        '-user_agent',
        DESKTOP_UA,
        ...(payload.referer ? ['-headers', `Referer: ${payload.referer}\r\n`] : []),
        '-i',
        payload.url,
        '-vn',
        '-c:a',
        'libmp3lame',
        '-b:a',
        `${kbps}k`,
        '-f',
        'mp3',
        'pipe:1',
      ];

      let sentAnyBytes = false;
      activeChild = spawn(FFMPEG_BIN, args, { shell: false });

      activeChild.stdout?.on('data', (chunk: Buffer) => {
        if (closed) return;
        if (!sentAnyBytes) {
          sentAnyBytes = true;
          res.setHeader('Content-Type', 'audio/mpeg');
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="${safeDownloadName}"`
          );
          res.setHeader('Cache-Control', 'no-store');
        }
        res.write(chunk);
      });

      activeChild.on('error', () => {
        if (closed) return;
        if (!res.headersSent) {
          res.status(500).json({ error: 'Audio encoder failed.' });
        } else if (!res.writableEnded) {
          res.end();
        }
      });

      activeChild.on('close', (code) => {
        if (closed) return;
        if (!sentAnyBytes || code !== 0) {
          if (!res.headersSent) {
            res.status(502).json({
              error: 'Audio stream unavailable or restricted. Try another format or re-analyze.',
            });
          } else if (!res.writableEnded) {
            res.end();
          }
          return;
        }
        if (!res.writableEnded) {
          res.end();
        }
      });
      return;
    }

    // Mode 2: Mux adaptive HD video + audio into a clean faststart MP4
    if (payload.mode === 'mux' && payload.audioUrl) {
      const tmpId = crypto.randomBytes(10).toString('hex');
      tempFilePath = path.join(os.tmpdir(), `tendou_${tmpId}.mp4`);

      const args = [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-reconnect',
        '1',
        '-reconnect_streamed',
        '1',
        '-reconnect_delay_max',
        '2',
        '-user_agent',
        DESKTOP_UA,
        '-i',
        payload.url,
        '-reconnect',
        '1',
        '-reconnect_streamed',
        '1',
        '-reconnect_delay_max',
        '2',
        '-user_agent',
        DESKTOP_UA,
        '-i',
        payload.audioUrl,
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-movflags',
        '+faststart',
        tempFilePath,
      ];

      try {
        await new Promise<void>((resolve, reject) => {
          activeChild = spawn(FFMPEG_BIN, args, { shell: false });
          activeChild.on('error', reject);
          activeChild.on('close', (code) => {
            if (closed) {
              reject(new Error('Client aborted'));
              return;
            }
            if (code === 0) resolve();
            else reject(new Error(`Muxing exited with code ${code}`));
          });
        });

        if (closed || !tempFilePath) {
          cleanupTemp();
          return;
        }

        const stat = await fs.promises.stat(tempFilePath);
        if (stat.size <= 0) {
          throw new Error('Empty mux output');
        }
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Length', String(stat.size));
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${safeDownloadName}"`
        );
        res.setHeader('Cache-Control', 'no-store');

        const fileStream = fs.createReadStream(tempFilePath);
        await pipeline(fileStream, res);
      } catch {
        if (!closed && !res.headersSent) {
          res.status(502).json({
            error: 'Could not prepare HD stream. Try a lower resolution or re-analyze.',
          });
        }
      } finally {
        cleanupTemp();
      }
      return;
    }

    // Mode 3: Direct high-speed stream proxy with automatic retry
    let attempt = 0;
    while (attempt < 2 && !closed) {
      attempt += 1;
      try {
        const upstream = await fetchPublicUrl(payload.url, {
          signal: abortController.signal,
          redirect: 'follow',
          headers: {
            'User-Agent': DESKTOP_UA,
            ...(payload.referer ? { Referer: payload.referer } : {}),
            ...(req.headers.range ? { Range: String(req.headers.range) } : {}),
          },
        });

        // Verify final redirected URL stays within trusted media CDNs
        if (upstream.url && !isTrustedMediaUrl(upstream.url)) {
          res.status(403).json({ error: 'Blocked untrusted media redirect.' });
          return;
        }

        if (!upstream.ok || !upstream.body) {
          if (upstream.status === 403) {
            res.status(502).json({
              error: 'Source CDN denied this stream request. Please re-analyze or try another format.',
            });
            return;
          }
          if (attempt < 2) continue;
          res.status(502).json({ error: `Upstream media returned HTTP ${upstream.status}` });
          return;
        }

        res.status(upstream.status);
        res.setHeader('Content-Type', contentType);
        const contentLen = upstream.headers.get('content-length');
        if (contentLen) res.setHeader('Content-Length', contentLen);
        const contentRange = upstream.headers.get('content-range');
        if (contentRange) res.setHeader('Content-Range', contentRange);
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${safeDownloadName}"`
        );
        res.setHeader('Cache-Control', 'no-store');

        await pipeline(
          Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]),
          res
        );
        return;
      } catch {
        if (closed || res.headersSent) return;
        if (attempt >= 2) {
          res.status(502).json({ error: 'Download interrupted. Please try again.' });
        }
      }
    }
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Media API endpoint not found.' });
  });

  const handleApiError: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Invalid JSON request.' });
    } else if (error.type === 'entity.too.large') {
      res.status(413).json({ error: 'Media API request is too large.' });
    } else {
      res.status(500).json({ error: 'Media service could not process the request.' });
    }
  };
  app.use('/api', handleApiError);

  return app;
}
