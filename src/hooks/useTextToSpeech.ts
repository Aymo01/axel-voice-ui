import { useCallback, useEffect, useRef, useState } from 'react';

interface SpeakOptions {
  onEnd?: () => void;
  onError?: (message: string) => void;
}

export function useTextToSpeech() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSupported] = useState(() => typeof window !== 'undefined' && 'speechSynthesis' in window);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (!isSupported) return;

    const loadVoices = () => {
      const available = window.speechSynthesis.getVoices();
      if (available.length === 0) return;
      setVoices(available);
      setSelectedVoiceURI((current) => {
        if (current && available.some((v) => v.voiceURI === current)) return current;
        const preferred =
          available.find((v) => v.lang.startsWith('en') && /female|samantha|zira|google us/i.test(v.name)) ??
          available.find((v) => v.lang.startsWith('en')) ??
          available[0];
        return preferred?.voiceURI ?? null;
      });
    };

    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, [isSupported]);

  const speak = useCallback(
    (text: string, options: SpeakOptions = {}) => {
      if (!isSupported) {
        options.onError?.('Speech synthesis is not supported in this browser.');
        return;
      }

      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      const voice = voices.find((v) => v.voiceURI === selectedVoiceURI);
      if (voice) utterance.voice = voice;
      utterance.rate = 1;
      utterance.pitch = 1;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        options.onEnd?.();
      };
      utterance.onerror = (event) => {
        setIsSpeaking(false);
        options.onError?.(event.error ?? 'Speech synthesis failed.');
      };

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [isSupported, selectedVoiceURI, voices],
  );

  const cancel = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [isSupported]);

  useEffect(() => () => cancel(), [cancel]);

  return {
    isSupported,
    isSpeaking,
    voices,
    selectedVoiceURI,
    setSelectedVoiceURI,
    speak,
    cancel,
  };
}
