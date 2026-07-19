import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import axios from 'axios';
import WakeWordDetector from './components/WakeWordDetector';
import OrbVisualization from './components/OrbVisualization';
import type { OrbState } from './components/OrbVisualization';
import ActivityPanel from './components/ActivityPanel';
import type { ActivityEntry, ActivityStatus } from './components/ActivityPanel';
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
const MAX_LOG_ENTRIES = 60;
const CONNECTION_POLL_MS = 20000;

const ORB_STATE_BY_PHASE: Record<Phase, OrbState> = {
  'wake-listening': 'idle',
  greeting: 'talking',
  recording: 'listening',
  processing: 'processing',
  speaking: 'talking',
};

function createMessage(role: ChatMessage['role'], text: string): ChatMessage {
  return { id: crypto.randomUUID(), role, text, timestamp: Date.now() };
}

function formatTime(): string {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

function describeRequestError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response) {
      const body = typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data);
      return `Backend responded ${error.response.status}: ${body.slice(0, 140)}`;
    }
    return 'Network error — request never reached the backend (connectivity or CORS).';
  }
  return error instanceof Error ? error.message : 'Unknown error contacting Axel.';
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
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const [connected, setConnected] = useState(true);

  const tts = useTextToSpeech();
  const voiceInput = useVoiceInput();
  const axelApi = useAxelAPI();

  const handleWakeRef = useRef<() => void>(() => {});
  const wakeWord = useWakeWordDetection(() => handleWakeRef.current());

  const addLog = useCallback((text: string, status: ActivityStatus = 'info') => {
    setActivityLog((prev) => {
      const next = [...prev, { id: crypto.randomUUID(), time: formatTime(), text, status }];
      return next.length > MAX_LOG_ENTRIES ? next.slice(next.length - MAX_LOG_ENTRIES) : next;
    });
  }, []);

  const addMessage = useCallback((role: ChatMessage['role'], text: string) => {
    setMessages((prev) => [...prev, createMessage(role, text)]);
  }, []);

  const showBanner = useCallback((text: string) => {
    setBanner(text);
    setTimeout(() => setBanner((current) => (current === text ? null : current)), 6000);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const checkConnection = async () => {
      try {
        await axios.get(axelApi.apiBaseUrl, { timeout: 5000 });
        if (!cancelled) setConnected(true);
      } catch {
        if (!cancelled) setConnected(false);
      }
    };
    void checkConnection();
    const interval = setInterval(checkConnection, CONNECTION_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [axelApi.apiBaseUrl]);

  const refreshApprovals = useCallback(async () => {
    try {
      const list = await axelApi.fetchStatus();
      setApprovals(list);
      if (list.length > 0) addLog(`${list.length} pending approval(s) awaiting review`, 'pending');
    } catch {
      // Non-critical: pending approvals will refresh on the next turn.
    }
  }, [addLog, axelApi]);

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
      addLog(`→ "${text}"`, 'info');
      setPhase('processing');

      try {
        const result = await withRetry(() => axelApi.sendMessage(text));
        addMessage('axel', result.response);
        addLog('← Axel replied', 'ok');
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
      } catch (error) {
        addMessage('system', "Axel's backend is unreachable right now. Please try again in a moment.");
        addLog(describeRequestError(error), 'error');
        showBanner('Network error reaching Axel — returning to listening mode.');
        resumeListening();
      }
    },
    [addLog, addMessage, axelApi, refreshApprovals, resumeListening, showBanner, tts],
  );

  const startRecording = useCallback(() => {
    setPhase('recording');
    voiceInput.start({
      onFinalResult: (text) => {
        void handleUserUtterance(text);
      },
      onError: (message) => {
        addMessage('system', message);
        addLog(message, 'error');
        showBanner(message);
        resumeListening();
      },
    });
  }, [addLog, addMessage, handleUserUtterance, resumeListening, showBanner, voiceInput]);

  const handleWake = useCallback(() => {
    void wakeWord.stop();
    addLog('Wake word "Hey Axel" detected', 'ok');
    setPhase('greeting');
    tts.speak(GREETING, {
      onEnd: startRecording,
      onError: () => {
        showBanner('Voice output failed, continuing in text mode.');
        startRecording();
      },
    });
  }, [addLog, showBanner, startRecording, tts, wakeWord]);

  handleWakeRef.current = handleWake;

  useEffect(() => {
    addLog('System online. Waiting for wake word.', 'info');
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
        addLog(`Approved action ${id}`, 'ok');
      } catch {
        showBanner('Could not approve that action. Please try again.');
        addLog(`Failed to approve action ${id}`, 'error');
      } finally {
        setPendingActionId(null);
      }
    },
    [addLog, axelApi, showBanner],
  );

  const handleReject = useCallback(
    async (id: string) => {
      setPendingActionId(id);
      try {
        await axelApi.rejectAction(id);
        setApprovals((prev) => prev.filter((a) => a.id !== id));
        addLog(`Rejected action ${id}`, 'ok');
      } catch {
        showBanner('Could not reject that action. Please try again.');
        addLog(`Failed to reject action ${id}`, 'error');
      } finally {
        setPendingActionId(null);
      }
    },
    [addLog, axelApi, showBanner],
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
    <div className="grid min-h-screen w-full grid-cols-1 bg-[#050510] text-slate-100 lg:grid-cols-[1fr_20rem]">
      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between px-6 py-5">
          <h1 className="text-lg font-semibold tracking-[0.3em] text-cyan-100">
            AXEL<span className="text-cyan-400">.</span>
          </h1>
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-slate-400">
            <span
              className={`h-2 w-2 rounded-full ${
                connected
                  ? 'bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.7)]'
                  : 'bg-red-500 shadow-[0_0_8px_2px_rgba(239,68,68,0.7)]'
              }`}
            />
            {connected ? 'Connected' : 'Disconnected'}
          </div>
        </header>

        {banner && (
          <div className="mx-auto mb-2 w-full max-w-2xl rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-200">
            {banner}
          </div>
        )}

        <main className="flex w-full flex-1 flex-col items-center justify-center gap-6 px-4 pb-10">
          <div className="flex flex-col items-center gap-3">
            <OrbVisualization state={ORB_STATE_BY_PHASE[phase]} audioLevel={voiceInput.audioLevel} />
            {phase === 'wake-listening' ? (
              <WakeWordDetector status={wakeWord.status} errorMessage={wakeWord.errorMessage} />
            ) : (
              <div className="flex items-center gap-2">
                {tts.isSpeaking && <span aria-hidden="true">🔊</span>}
                <span className="text-sm font-medium uppercase tracking-widest text-cyan-200/80">
                  {phaseLabel[phase]}
                </span>
              </div>
            )}
          </div>

          <ChatDisplay messages={messages.slice(-3)} interimTranscript={voiceInput.interimTranscript} />

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

      <aside className="border-t border-cyan-500/10 p-4 lg:border-l lg:border-t-0">
        <ActivityPanel entries={activityLog} connected={connected} />
      </aside>
    </div>
  );
}

export default App;
