'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { JobEvent, JobStatus } from '@/types/job';

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000';

interface UseJobSocketReturn {
  events: JobEvent[];
  status: JobStatus;
  isConnected: boolean;
}

export function useJobSocket(jobId: string | null): UseJobSocketReturn {
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [status, setStatus] = useState<JobStatus>('queued');
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const resetState = useCallback(() => {
    setEvents([]);
    setStatus('queued');
    setIsConnected(false);
  }, []);

  useEffect(() => {
    if (!jobId) {
      resetState();
      return;
    }

    setEvents([]);
    setStatus('queued');

    const ws = new WebSocket(`${WS_BASE}/ws/${jobId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
    };

    ws.onmessage = (messageEvent: MessageEvent) => {
      try {
        const parsed: JobEvent = JSON.parse(messageEvent.data as string);
        setEvents((prev) => [...prev, parsed]);

        if (parsed.event === 'job.completed') {
          setStatus('completed');
        } else if (parsed.event === 'job.failed') {
          setStatus('failed');
        } else {
          setStatus('running');
        }
      } catch {
        // skip malformed messages
      }
    };

    ws.onclose = () => setIsConnected(false);
    ws.onerror = () => setIsConnected(false);

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [jobId, resetState]);

  return { events, status, isConnected };
}
