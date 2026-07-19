import type { WakeWordStatus } from '../hooks/useWakeWordDetection';

interface WakeWordDetectorProps {
  status: WakeWordStatus;
  errorMessage: string | null;
}

const STATUS_COPY: Record<WakeWordStatus, string> = {
  idle: 'Starting up…',
  loading: 'Waking up the listener…',
  listening: 'Listening for "Hey Axel"',
  error: 'Wake-word detection ran into a problem',
  unavailable: 'Wake-word detection unavailable',
};

export default function WakeWordDetector({ status, errorMessage }: WakeWordDetectorProps) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <div className="flex items-center gap-2">
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            status === 'listening'
              ? 'animate-pulse bg-cyan-400 shadow-[0_0_12px_2px_rgba(34,211,238,0.8)]'
              : status === 'loading'
                ? 'animate-pulse bg-amber-400'
                : 'bg-red-400'
          }`}
        />
        <span className="text-sm font-medium uppercase tracking-widest text-cyan-200/80">
          {STATUS_COPY[status]}
        </span>
      </div>
      {(status === 'error' || status === 'unavailable') && errorMessage && (
        <p className="max-w-md text-sm text-amber-400/90">{errorMessage}</p>
      )}
    </div>
  );
}
