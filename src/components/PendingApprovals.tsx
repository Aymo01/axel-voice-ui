import type { PendingApproval } from '../hooks/useAxelAPI';

interface PendingApprovalsProps {
  approvals: PendingApproval[];
  pendingActionId: string | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export default function PendingApprovals({ approvals, pendingActionId, onApprove, onReject }: PendingApprovalsProps) {
  if (approvals.length === 0) return null;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3 px-4">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-cyan-300/70">Pending Approvals</h2>
      {approvals.map((approval) => {
        const isBusy = pendingActionId === approval.id;
        return (
          <div
            key={approval.id}
            className="flex flex-col gap-3 rounded-xl border border-cyan-500/25 bg-slate-900/70 p-4 shadow-lg shadow-cyan-500/5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="text-sm font-medium text-slate-100">{approval.action}</p>
              {approval.details && <p className="mt-1 text-xs text-slate-400">{approval.details}</p>}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => onApprove(approval.id)}
                className="rounded-lg bg-cyan-500/90 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => onReject(approval.id)}
                className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
