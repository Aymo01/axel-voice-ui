import { useEffect, useRef } from 'react';

export type ActivityStatus = 'ok' | 'error' | 'pending' | 'info';

export interface ActivityEntry {
  id: string;
  time: string;
  text: string;
  status: ActivityStatus;
}

interface ActivityPanelProps {
  entries: ActivityEntry[];
  connected: boolean;
}

const STATUS_DOT_CLASS: Record<ActivityStatus, string> = {
  ok: 'bg-emerald-400 shadow-[0_0_6px_1px_rgba(52,211,153,0.8)]',
  error: 'bg-red-400 shadow-[0_0_6px_1px_rgba(248,113,113,0.8)]',
  pending: 'bg-amber-400 shadow-[0_0_6px_1px_rgba(251,191,36,0.8)]',
  info: 'bg-cyan-400 shadow-[0_0_6px_1px_rgba(34,211,238,0.8)]',
};

const CORNER_BASE = 'absolute h-3 w-3 border-cyan-400/50';

export default function ActivityPanel({ entries, connected }: ActivityPanelProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [entries]);

  return (
    <div className="relative border border-cyan-500/15 bg-slate-950/40 p-4 font-mono">
      <span className={`${CORNER_BASE} -left-px -top-px border-l border-t`} />
      <span className={`${CORNER_BASE} -right-px -top-px border-r border-t`} />
      <span className={`${CORNER_BASE} -bottom-px -left-px border-b border-l`} />
      <span className={`${CORNER_BASE} -bottom-px -right-px border-b border-r`} />

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300/80">Activity Log</h2>
        <span
          className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400 shadow-[0_0_6px_1px_rgba(52,211,153,0.8)]' : 'bg-red-400 shadow-[0_0_6px_1px_rgba(248,113,113,0.8)]'}`}
        />
      </div>

      <div ref={listRef} className="flex max-h-72 flex-col gap-1.5 overflow-y-auto text-[11px] leading-relaxed lg:max-h-[calc(100vh-14rem)]">
        {entries.length === 0 && <p className="text-slate-600">No activity yet.</p>}
        {entries.map((entry) => (
          <div key={entry.id} className="flex items-start gap-2">
            <span className="mt-1 shrink-0 text-slate-600">{entry.time}</span>
            <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT_CLASS[entry.status]}`} />
            <span className="break-words text-slate-300">{entry.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
