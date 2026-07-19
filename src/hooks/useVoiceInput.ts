import { useCallback, useEffect, useRef, useState } from 'react';

interface VoiceInputCallbacks {
  onFinalResult?: (transcript: string) => void;
  onError?: (message: string) => void;
}

function getSpeechRecognitionCtor(): SpeechRecognitionStatic | null {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export function useVoiceInput() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [isSupported] = useState(() => getSpeechRecognitionCtor() !== null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const callbacksRef = useRef<VoiceInputCallbacks>({});

  const stopAudioLevelMonitor = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    analyserRef.current = null;
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  const startAudioLevelMonitor = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const average = data.reduce((sum, value) => sum + value, 0) / data.length;
        setAudioLevel(Math.min(1, average / 128));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // Mic access for level metering is a visual nice-to-have; recognition can proceed without it.
    }
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(
    (callbacks: VoiceInputCallbacks = {}) => {
      callbacksRef.current = callbacks;
      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) {
        callbacks.onError?.('Speech recognition is not supported in this browser. Try Chrome or Edge.');
        return;
      }

      setTranscript('');
      setInterimTranscript('');

      const recognition = new Ctor();
      recognition.lang = 'en-US';
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsRecording(true);
        void startAudioLevelMonitor();
      };

      recognition.onresult = (event) => {
        let finalText = '';
        let interimText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const text = result[0]?.transcript ?? '';
          if (result.isFinal) finalText += text;
          else interimText += text;
        }
        if (finalText) setTranscript((prev) => (prev + finalText).trim());
        setInterimTranscript(interimText);
      };

      recognition.onerror = (event) => {
        if (event.error === 'no-speech' || event.error === 'aborted') return;
        callbacksRef.current.onError?.(`Microphone error: ${event.error}`);
      };

      recognition.onend = () => {
        setIsRecording(false);
        stopAudioLevelMonitor();
        setTranscript((finalTranscript) => {
          const result = finalTranscript.trim();
          if (result) callbacksRef.current.onFinalResult?.(result);
          else callbacksRef.current.onError?.('No speech detected. Please try again.');
          return finalTranscript;
        });
      };

      recognitionRef.current = recognition;
      recognition.start();
    },
    [startAudioLevelMonitor, stopAudioLevelMonitor],
  );

  useEffect(
    () => () => {
      recognitionRef.current?.abort();
      stopAudioLevelMonitor();
    },
    [stopAudioLevelMonitor],
  );

  return {
    isSupported,
    isRecording,
    transcript,
    interimTranscript,
    audioLevel,
    start,
    stop,
  };
}
