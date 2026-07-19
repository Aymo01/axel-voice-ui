import { useCallback, useEffect, useRef, useState } from 'react';
import { PorcupineWorker } from '@picovoice/porcupine-web';
import { WebVoiceProcessor } from '@picovoice/web-voice-processor';
import type { BuiltInKeyword } from '@picovoice/porcupine-web';

export type WakeWordStatus = 'idle' | 'loading' | 'listening' | 'error' | 'unavailable';

const ACCESS_KEY = import.meta.env.VITE_PICOVOICE_ACCESS_KEY as string | undefined;
const KEYWORD_PATH = import.meta.env.VITE_PORCUPINE_KEYWORD_PATH as string | undefined;
const KEYWORD_LABEL = (import.meta.env.VITE_PORCUPINE_KEYWORD_LABEL as string | undefined) ?? 'Hey Axel';
const MODEL_PATH = (import.meta.env.VITE_PORCUPINE_MODEL_PATH as string | undefined) ?? '/porcupine_params.pv';
const FALLBACK_BUILTIN_KEYWORD = import.meta.env.VITE_PORCUPINE_BUILTIN_KEYWORD as BuiltInKeyword | undefined;

export function useWakeWordDetection(onWake: () => void) {
  const [status, setStatus] = useState<WakeWordStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const workerRef = useRef<PorcupineWorker | null>(null);
  const onWakeRef = useRef(onWake);
  onWakeRef.current = onWake;

  const configured = Boolean(ACCESS_KEY) && Boolean(KEYWORD_PATH || FALLBACK_BUILTIN_KEYWORD);

  const stop = useCallback(async () => {
    const worker = workerRef.current;
    workerRef.current = null;
    if (worker) {
      try {
        await WebVoiceProcessor.unsubscribe(worker);
      } catch {
        // already unsubscribed
      }
      worker.terminate();
    }
    setStatus((current) => (current === 'error' || current === 'unavailable' ? current : 'idle'));
  }, []);

  const start = useCallback(async () => {
    if (!ACCESS_KEY || !(KEYWORD_PATH || FALLBACK_BUILTIN_KEYWORD)) {
      setStatus('unavailable');
      setErrorMessage(
        'Wake-word detection is not configured. Set VITE_PICOVOICE_ACCESS_KEY and VITE_PORCUPINE_KEYWORD_PATH in .env.',
      );
      return;
    }

    if (workerRef.current) return;

    setStatus('loading');
    setErrorMessage(null);

    try {
      const keyword = KEYWORD_PATH
        ? { publicPath: KEYWORD_PATH, label: KEYWORD_LABEL }
        : { builtin: FALLBACK_BUILTIN_KEYWORD as BuiltInKeyword };

      const worker = await PorcupineWorker.create(
        ACCESS_KEY,
        keyword,
        () => {
          onWakeRef.current();
        },
        { publicPath: MODEL_PATH },
        {
          processErrorCallback: (error) => {
            setStatus('error');
            setErrorMessage(error.message);
          },
        },
      );

      workerRef.current = worker;
      await WebVoiceProcessor.subscribe(worker);
      setStatus('listening');
    } catch (error) {
      workerRef.current = null;
      setStatus('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to start wake-word detection. Check microphone permissions.',
      );
    }
  }, []);

  useEffect(
    () => () => {
      void stop();
    },
    [stop],
  );

  return { status, errorMessage, configured, start, stop };
}
