import { AlertCircle } from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnalyzeProgressCard } from './components/AnalyzeProgressCard';
import { CommandBar } from './components/CommandBar';
import { FloatingCancelBar } from './components/FloatingCancelBar';
import { MediaResultCard } from './components/MediaResultCard';
import { Navbar } from './components/Navbar';
import { PlatformSwitcher } from './components/PlatformSwitcher';
import { SupportedFormatsModal } from './components/SupportedFormatsModal';
import { PLATFORM_MAP, detectPlatformFromInput, extractCleanUrl } from './data/platforms';
import {
  DownloadTask,
  MediaFormatOption,
  MediaItem,
  PlatformId,
} from './types/media';

export default function App() {
  const [activePlatform, setActivePlatform] = useState<PlatformId>('youtube');
  const [urlInput, setUrlInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzingUrl, setAnalyzingUrl] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pasteHint, setPasteHint] = useState<string | null>(null);
  const [result, setResult] = useState<MediaItem | null>(null);
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [formatsOpen, setFormatsOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const analyzeAbortRef = useRef<AbortController | null>(null);
  const downloadAbortsRef = useRef<Map<string, AbortController>>(new Map());

  const platformConfig = PLATFORM_MAP[activePlatform];

  const handleSelectPlatform = useCallback(
    (nextPlatform: PlatformId) => {
      if (isAnalyzing) return;
      setActivePlatform(nextPlatform);
      setErrorMessage(null);
      setPasteHint(null);
      const currentDetected = detectPlatformFromInput(urlInput);
      if (currentDetected && currentDetected !== nextPlatform) {
        setUrlInput('');
      }
      if (result && result.platform !== nextPlatform) {
        setResult(null);
      }
    },
    [isAnalyzing, result, urlInput]
  );

  const handleCancelAnalyze = useCallback(() => {
    if (analyzeAbortRef.current) {
      analyzeAbortRef.current.abort();
      analyzeAbortRef.current = null;
    }
    setIsAnalyzing(false);
    setAnalyzingUrl('');
    setErrorMessage(null);
  }, []);

  const handleCancelDownload = useCallback((taskId: string) => {
    const controller = downloadAbortsRef.current.get(taskId);
    if (controller) {
      controller.abort();
      downloadAbortsRef.current.delete(taskId);
    }
    setTasks((prev) =>
      prev.map((t) =>
        t.taskId === taskId ? { ...t, status: 'cancelled' } : t
      )
    );
  }, []);

  const runAnalysis = useCallback(
    async (rawUrl: string, forcedPlatform?: PlatformId) => {
      const cleaned = extractCleanUrl(rawUrl);
      if (!cleaned) {
        setErrorMessage(
          'Paste a media link from YouTube, TikTok, Instagram, Twitter X, or Facebook.'
        );
        inputRef.current?.focus();
        return;
      }

      if (cleaned !== urlInput) {
        setUrlInput(cleaned);
      }
      setPasteHint(null);

      const detected = detectPlatformFromInput(cleaned);
      const targetPlatform = detected ?? forcedPlatform ?? activePlatform;
      if (detected && detected !== activePlatform) {
        setActivePlatform(detected);
      }

      if (analyzeAbortRef.current) {
        analyzeAbortRef.current.abort();
      }
      const controller = new AbortController();
      analyzeAbortRef.current = controller;

      setErrorMessage(null);
      setResult(null);
      setAnalyzingUrl(cleaned);
      setIsAnalyzing(true);

      try {
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            url: cleaned,
            platform: targetPlatform,
          }),
        });

        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || 'Could not analyze this media link.');
        }

        const item = payload as MediaItem;
        setActivePlatform(item.platform);
        setResult(item);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        if (controller.signal.aborted) {
          return;
        }
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Unable to analyze this URL. Please try again.'
        );
      } finally {
        if (analyzeAbortRef.current === controller) {
          analyzeAbortRef.current = null;
          setIsAnalyzing(false);
        }
      }
    },
    [activePlatform, urlInput]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isAnalyzing) {
      handleCancelAnalyze();
      return;
    }
    void runAnalysis(urlInput);
  };

  const handleUrlChange = (value: string) => {
    setUrlInput(value);
    if (errorMessage) setErrorMessage(null);
    if (pasteHint) setPasteHint(null);
    const detected = detectPlatformFromInput(value);
    if (detected && detected !== activePlatform && !isAnalyzing) {
      setActivePlatform(detected);
    }
  };

  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      const cleaned = extractCleanUrl(text || '');
      if (cleaned) {
        setPasteHint(null);
        setUrlInput(cleaned);
        const detected = detectPlatformFromInput(cleaned);
        if (detected) {
          setActivePlatform(detected);
        }
        void runAnalysis(cleaned, detected ?? activePlatform);
        return;
      }
      setPasteHint('Clipboard is empty — copy a link or press Ctrl+V (Cmd+V) in the box.');
    } catch {
      setPasteHint('Clipboard read is restricted in preview — press Ctrl+V (Cmd+V) in the box.');
    }
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [activePlatform, runAnalysis]);

  const handleStartDownload = useCallback(
    async (item: MediaItem, format: MediaFormatOption) => {
      const taskId = `${item.id}_${format.id}_${Date.now()}`;
      const controller = new AbortController();
      downloadAbortsRef.current.set(taskId, controller);

      const initialTask: DownloadTask = {
        taskId,
        mediaId: item.id,
        formatId: format.id,
        platform: item.platform,
        title: item.title,
        quality: format.label,
        ext: format.ext,
        progress: 0,
        loadedBytes: 0,
        totalBytes: null,
        status: 'downloading',
        startedAt: Date.now(),
      };

      setTasks((prev) => [
        initialTask,
        ...prev.filter(
          (t) => !(t.mediaId === item.id && t.formatId === format.id)
        ),
      ]);

      try {
        const response = await fetch(format.downloadUrl, {
          signal: controller.signal,
        });

        if (!response.ok) {
          let errMsg = `Download failed (HTTP ${response.status})`;
          try {
            const errJson = await response.json();
            if (errJson?.error) errMsg = errJson.error;
          } catch {
            // Keep HTTP status message
          }
          throw new Error(errMsg);
        }

        const contentLengthHeader = response.headers.get('content-length');
        const totalBytes = contentLengthHeader
          ? Number(contentLengthHeader)
          : null;

        if (!response.body) {
          const blob = await response.blob();
          if (blob.size <= 0) {
            throw new Error('Received empty media stream.');
          }
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = `${item.title.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 60)}.${format.ext}`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
        } else {
          const reader = response.body.getReader();
          const chunks: BlobPart[] = [];
          let loadedBytes = 0;
          let lastUiUpdate = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value);
              loadedBytes += value.byteLength;

              const now = performance.now();
              if (now - lastUiUpdate >= 120) {
                lastUiUpdate = now;
                const pct =
                  totalBytes && totalBytes > 0
                    ? Math.min(99, Math.round((loadedBytes / totalBytes) * 100))
                    : null;
                setTasks((prev) =>
                  prev.map((t) =>
                    t.taskId === taskId
                      ? { ...t, loadedBytes, totalBytes, progress: pct }
                      : t
                  )
                );
              }
            }
          }

          if (loadedBytes <= 0) {
            throw new Error('Empty stream returned from source CDN.');
          }

          const mime =
            response.headers.get('content-type') || 'application/octet-stream';
          const blob = new Blob(chunks, { type: mime });

          const disposition = response.headers.get('content-disposition') || '';
          const match = disposition.match(/filename="([^"]+)"/i);
          const filename =
            match?.[1] ||
            `${item.title.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 60)}.${format.ext}`;

          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.setTimeout(() => URL.revokeObjectURL(blobUrl), 2500);
        }

        downloadAbortsRef.current.delete(taskId);
        setTasks((prev) =>
          prev.map((t) =>
            t.taskId === taskId
              ? { ...t, progress: 100, status: 'completed' }
              : t
          )
        );
      } catch (err) {
        downloadAbortsRef.current.delete(taskId);
        if (
          controller.signal.aborted ||
          (err instanceof DOMException && err.name === 'AbortError')
        ) {
          setTasks((prev) =>
            prev.map((t) =>
              t.taskId === taskId ? { ...t, status: 'cancelled' } : t
            )
          );
          return;
        }

        setTasks((prev) =>
          prev.map((t) =>
            t.taskId === taskId
              ? {
                  ...t,
                  status: 'error',
                  errorMessage:
                    err instanceof Error ? err.message : 'Download interrupted',
                }
              : t
          )
        );
      }
    },
    []
  );

  // Global Esc key shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (formatsOpen) {
        setFormatsOpen(false);
        return;
      }
      if (isAnalyzing) {
        handleCancelAnalyze();
        return;
      }
      const running = tasks.find((t) => t.status === 'downloading');
      if (running) {
        handleCancelDownload(running.taskId);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [formatsOpen, isAnalyzing, tasks, handleCancelAnalyze, handleCancelDownload]);

  const activeDownload = tasks.find((t) => t.status === 'downloading');

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-screen flex flex-col">
        <div
          className="ambient-backdrop transition-[background-image] duration-500"
          aria-hidden="true"
          style={{
            backgroundImage: `radial-gradient(64% 46% at 50% -4%, ${platformConfig.ambientRgba} 0%, ${platformConfig.glowRgba.replace(/[\d.]+\)$/, '0.06)')} 48%, transparent 100%), radial-gradient(36% 32% at 86% 24%, ${platformConfig.glowRgba.replace(/[\d.]+\)$/, '0.09)')} 0%, transparent 100%), radial-gradient(34% 32% at 14% 32%, ${platformConfig.ambientRgba.replace(/[\d.]+\)$/, '0.07)')} 0%, transparent 100%)`,
          }}
        />

        <Navbar
          onOpenFormats={() => setFormatsOpen(true)}
          onQuickPaste={() => void handlePasteFromClipboard()}
        />

        <main className="relative z-10 mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-4 py-10 sm:px-6 sm:py-16">
          <section id="downloader" className="w-full space-y-6 sm:space-y-7">
            {/* Clean Minimalist Hero */}
            <div className="mx-auto max-w-xl text-center space-y-3">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activePlatform}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{
                    type: 'spring',
                    stiffness: 460,
                    damping: 34,
                  }}
                  className="space-y-2 transform-gpu"
                >
                  <h1 className="font-display text-3xl font-bold tracking-tight text-white sm:text-[2.5rem] sm:leading-[1.15] [text-wrap:balance]">
                    {platformConfig.headline}
                  </h1>
                  <p className="mx-auto max-w-md text-sm leading-relaxed text-zinc-400">
                    {platformConfig.subtitle}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* iOS Liquid Glass Platform Switcher */}
            <PlatformSwitcher
              activePlatform={activePlatform}
              onSelectPlatform={handleSelectPlatform}
              disabled={isAnalyzing}
            />

            {/* Futuristic Adaptive Command Bar */}
            <CommandBar
              activePlatform={activePlatform}
              urlInput={urlInput}
              isAnalyzing={isAnalyzing}
              pasteHint={pasteHint}
              inputRef={inputRef}
              onUrlChange={handleUrlChange}
              onClear={() => {
                setUrlInput('');
                setErrorMessage(null);
                setPasteHint(null);
                inputRef.current?.focus();
              }}
              onPaste={() => void handlePasteFromClipboard()}
              onSubmit={handleSubmit}
              onCancel={handleCancelAnalyze}
            />

            {/* Adaptive Stage: Analyze HUD / Error / Media Result */}
            <div className="mx-auto w-full max-w-2xl">
              <AnimatePresence mode="wait">
                {isAnalyzing ? (
                  <AnalyzeProgressCard
                    key="analyze-progress"
                    platform={activePlatform}
                    url={analyzingUrl || urlInput}
                    onCancel={handleCancelAnalyze}
                  />
                ) : errorMessage ? (
                  <motion.div
                    key="analyze-error"
                    initial={{ opacity: 0, y: 8, scale: 0.99 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.99 }}
                    transition={{ type: 'spring', stiffness: 440, damping: 32 }}
                    role="alert"
                    className="liquid-glass flex flex-col gap-3 rounded-2xl border-rose-400/25 p-5 sm:flex-row sm:items-center sm:justify-between transform-gpu"
                  >
                    <div className="flex items-start gap-3">
                      <AlertCircle
                        className="mt-0.5 h-5 w-5 shrink-0 text-rose-300"
                        aria-hidden="true"
                      />
                      <div className="space-y-0.5">
                        <p className="text-sm font-semibold text-rose-100">
                          Could not load media
                        </p>
                        <p className="text-xs leading-relaxed text-rose-200/80">
                          {errorMessage}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setErrorMessage(null)}
                      className="inline-flex min-h-[36px] items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-1.5 text-xs font-medium text-zinc-200 whitespace-nowrap shrink-0 hover:bg-white/[0.1]"
                    >
                      Dismiss
                    </button>
                  </motion.div>
                ) : result ? (
                  <MediaResultCard
                    key={result.id}
                    item={result}
                    activeTasks={tasks}
                    onStartDownload={(item, fmt) =>
                      void handleStartDownload(item, fmt)
                    }
                    onCancelTask={handleCancelDownload}
                    onReset={() => {
                      setResult(null);
                      setUrlInput('');
                      inputRef.current?.focus();
                    }}
                  />
                ) : null}
              </AnimatePresence>
            </div>
          </section>
        </main>

        <footer className="relative z-10 border-t border-white/[0.05] py-6">
          <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-2 px-4 text-xs text-zinc-500 sm:flex-row sm:px-6">
            <span>Tendouloader</span>
            <span>YouTube · TikTok · Instagram · Twitter X · Facebook</span>
          </div>
        </footer>

        <SupportedFormatsModal
          open={formatsOpen}
          onClose={() => setFormatsOpen(false)}
          onSelectPlatform={handleSelectPlatform}
        />

        <FloatingCancelBar
          isAnalyzing={isAnalyzing}
          activePlatform={activePlatform}
          activeDownload={activeDownload}
          onCancelAnalyze={handleCancelAnalyze}
          onCancelDownload={handleCancelDownload}
        />
      </div>
    </MotionConfig>
  );
}
