import axios from 'axios';
import { useCallback, useMemo } from 'react';

const API_BASE_URL =
  (import.meta.env.VITE_AXEL_API_URL as string | undefined) ?? 'https://axle-production-3d97.up.railway.app';
const USER_ID = 'web-voice-user';

export interface ChatResult {
  response: string;
  raw: unknown;
}

export interface PendingApproval {
  id: string;
  action: string;
  details?: string;
  raw: unknown;
}

interface RawApprovalRecord {
  id?: string;
  action_id?: string;
  action?: string;
  description?: string;
  summary?: string;
  details?: string;
  detail?: string;
}

function normalizeApprovals(payload: unknown): PendingApproval[] {
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  const list = (record.pending_approvals ?? record.approvals ?? record.pending ?? []) as RawApprovalRecord[];
  if (!Array.isArray(list)) return [];

  return list.map((item, index) => ({
    id: item.id ?? item.action_id ?? String(index),
    action: item.action ?? item.description ?? item.summary ?? 'Pending action',
    details: item.details ?? item.detail,
    raw: item,
  }));
}

export function useAxelAPI() {
  const client = useMemo(
    () =>
      axios.create({
        baseURL: API_BASE_URL,
        timeout: 30000,
      }),
    [],
  );

  const sendMessage = useCallback(
    async (message: string): Promise<ChatResult> => {
      const { data } = await client.post('/chat', {
        message,
        user_id: USER_ID,
        mode: 'default',
      });
      const record = (data ?? {}) as Record<string, unknown>;
      const response =
        (record.response as string | undefined) ??
        (record.message as string | undefined) ??
        (record.text as string | undefined) ??
        "Sorry, I didn't get a response from Axel.";
      return { response, raw: data };
    },
    [client],
  );

  const fetchStatus = useCallback(async (): Promise<PendingApproval[]> => {
    const { data } = await client.get('/status');
    return normalizeApprovals(data);
  }, [client]);

  const approveAction = useCallback(
    async (id: string) => {
      await client.post('/approve', { id, user_id: USER_ID });
    },
    [client],
  );

  const rejectAction = useCallback(
    async (id: string) => {
      await client.post('/reject', { id, user_id: USER_ID });
    },
    [client],
  );

  return { sendMessage, fetchStatus, approveAction, rejectAction, apiBaseUrl: API_BASE_URL };
}
