import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import WakeWordDetector from './components/WakeWordDetector';
import Waveform from './components/Waveform';
import ChatDisplay from './components/ChatDisplay';
import type { ChatMessage } from './components/ChatDisplay';
import PendingApprovals from './components/PendingApprovals';
import { useWakeWordDetection } from './hooks/useWakeWordDetection';
import { useVoiceInput } from './hooks/useVoiceInput';
import { useTextToSpeech } from './hooks/useTextToSpeech';
import { useAxelAPI } from './hooks/useAxelAPI';
import type { PendingApproval } from './hooks/useAxelAPI';
import './App.css';

type Phase = 'wake-listening' | 'greeting' | 'recording' | 'processing' | 'speaking';

const GREETING = 'Hi! How can I help you today?';

function createMessage(role: ChatMessage['role'], text: string): ChatMessage {
  return { id: crypto.randomUUID(), role, text, timestamp: Date.now() };
}

async function withRetry<T>(fn: () => Promise<T>, retries = 1, delayMs = 1500): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) throw error;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return withRetry(fn, retries - 1, delayMs);
  }
}

function App() {
  const [phase, setPhase] = useState<Phase>('wake-listening');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [manualText, setManualText] = useState('');

  const tts = useTextToSpeech();
  const voiceInput = useVoiceInput();
  const axelApi = useAxelAPI();

  const handleWakeRef = useRef<() => void>(() => {});
  const wakeWord = useWakeWordDetection(() => handleWakeRef.current());

  const addMessage = useCallback((role: ChatMessage['role'], text: string) => {
    setMessages((prev) => [...prev, createMessage(role, text)]);
  }, []);

  const showBanner = useCallback((text: string) => {
    setBanner(text);
    setTimeout(() => setBanner((current) => (current === text ? null : current)), 6000);
  }, []);

  const refreshApprovals = useCallback(async () => {
    try {
      const list = await axelApi.fetchStatus();
      setApprovals(list);
    } catch {
      // Non-critical: pending approvals will refresh on the next turn.
    }
  }, [axelApi]);

  const resumeListening = useCallback(() => {
    setPhase('wake-listening');
    void wakeWord.start();
    // wakeWord.start/stop are stable across renders; omitting `wakeWord` avoids
    // recreating this callback every time the hook returns a new object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUserUtterance = useCallback(
    async (text: string) => {
      addMessage('user', text);
      setPhase('processing');

      try {
        const result = await withRetry(() => axelApi.sendMessage(text));
        addMessage('axel', result.response);
        setPhase('speaking');
        tts.speak(result.response, {
          onEnd: () => {
            void refreshApprovals();
            resumeListening();
          },
          onError: () => {
            void refreshApprovals();
            resumeListening();
          },
        });
      } catch {
        addMessage('system', "Axel's backend is unreachable right now. Please try again in a moment.");
        showBanner('Network error reaching Axel — returning to listening mode.');
        resumeListening();
      }
    },
    [addMessage, axelApi, refreshApprovals, resumeListening, showBanner, tts],
  );

  const startRecording = useCallback(() => {
    setPhase('recording');
    voiceInput.start({
      onFinalResult: (text) => {
        void handleUserUtterance(text);
      },
      onError: (message) => {
        addMessage('system', message);
        showBanner(message);
        resumeListening();
      },
    });
  }, [addMessage, handleUserUtterance, resumeListening, showBanner, voiceInput]);

  const handleWake = useCallback(() => {
    void wakeWord.stop();
    setPhase('greeting');
    tts.speak(GREETING, {
      onEnd: startRecording,
      onError: () => {
        showBanner('Voice output failed, continuing in text mode.');
        startRecording();
      },
    });
  }, [showBanner, startRecording, tts, wakeWord]);

  handleWakeRef.current = handleWake;

  useEffect(() => {
    void wakeWord.start();
    return () => {
      void wakeWord.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApprove = useCallback(
    async (id: string) => {
      setPendingActionId(id);
      try {
        await axelApi.approveAction(id);
        setApprovals((prev) => prev.filter((a) => a.id !== id));
      } catch {
        showBanner('Could not approve that action. Please try again.');
      } finally {
        setPendingActionId(null);
      }
    },
    [axelApi, showBanner],
  );

  const handleReject = useCallback(
    async (id: string) => {
      setPendingActionId(id);
      try {
        await axelApi.rejectAction(id);
        setApprovals((prev) => prev.filter((a) => a.id !== id));
      } catch {
        showBanner('Could not reject that action. Please try again.');
      } finally {
        setPendingActionId(null);
      }
    },
    [axelApi, showBanner],
  );

  const handleManualSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      const text = manualText.trim();
      if (!text) return;
      setManualText('');
      void handleUserUtterance(text);
    },
    [handleUserUtterance, manualText],
  );

  const phaseLabel: Record<Exclude<Phase, 'wake-listening'>, string> = {
    greeting: 'Axel is greeting you…',
    recording: 'Listening to you…',
    processing: 'Axel is thinking…',
    speaking: 'Axel is speaking…',
  };

  return (
    <div className="flex min-h-screen w-full flex-col items-center bg-[#05070d] px-4 py-10 text-slate-100">
      <header className="mb-8 flex flex-col items-center gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-cyan-100">
          Axel<span className="text-cyan-400">.</span>
        </h1>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Voice Assistant</p>
      </header>

      {banner && (
        <div className="mb-6 w-full max-w-2xl rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-200">
          {banner}
        </div>
      )}

      <main className="flex w-full flex-1 flex-col items-center gap-8">
        <div className="flex w-full max-w-2xl flex-col items-center gap-4">
          {phase === 'wake-listening' ? (
            <WakeWordDetector status={wakeWord.status} errorMessage={wakeWord.errorMessage} />
          ) : (
            <div className="flex flex-col items-center gap-4">
              <Waveform
                mode={phase === 'recording' ? 'recording' : phase === 'greeting' ? 'speaking' : phase}
                audioLevel={voiceInput.audioLevel}
              />
              <div className="flex items-center gap-2">
                {tts.isSpeaking && <span aria-hidden="true">🔊</span>}
                <span className="text-sm font-medium uppercase tracking-widest text-cyan-200/80">
                  {phaseLabel[phase]}
                </span>
              </div>
            </div>
          )}
        </div>

        <ChatDisplay messages={messages} interimTranscript={voiceInput.interimTranscript} />

        <PendingApprovals
          approvals={approvals}
          pendingActionId={pendingActionId}
          onApprove={handleApprove}
          onReject={handleReject}
        />

        {wakeWord.status === 'unavailable' && (
          <form onSubmit={handleManualSubmit} className="flex w-full max-w-2xl gap-2 px-4">
            <input
              type="text"
              value={manualText}
              onChange={(event) => setManualText(event.target.value)}
              placeholder='Wake word unavailable — type your message to Axel'
              className="flex-1 rounded-lg border border-slate-700 bg-slate-900/70 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-lg bg-cyan-500/90 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
            >
              Send
            </button>
          </form>
        )}
      </main>
    </div>
  );
}

export default App;
