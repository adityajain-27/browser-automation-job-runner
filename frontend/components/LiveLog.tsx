'use client';

import { useEffect, useRef } from 'react';
import type { JobEvent } from '@/types/job';

interface LiveLogProps {
  events: JobEvent[];
  isRunning: boolean;
}

function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

function summarizeData(data: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (key === 'sample') continue;
    if (typeof value === 'string') {
      parts.push(`${key}: ${value}`);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      parts.push(`${key}: ${String(value)}`);
    }
  }
  return parts.join(' · ');
}

export default function LiveLog({ events, isRunning }: LiveLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  return (
    <div className="border border-gray-200 bg-white rounded-md overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50">
        <span className="text-sm font-semibold text-gray-700">Live Log</span>
        {isRunning && (
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
            </span>
            <span className="text-xs font-medium text-gray-500">Running</span>
          </div>
        )}
      </div>

      <div ref={scrollRef} className="max-h-[400px] overflow-y-auto p-4 space-y-3 font-mono text-sm">
        {events.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            Waiting for events...
          </div>
        )}

        {events.map((evt, i) => {
          const isError = evt.event === 'job.failed';
          const isSuccess = evt.event === 'job.completed';

          return (
            <div
              key={`${evt.event}-${i}`}
              className={`flex flex-col gap-1 pb-3 ${i !== events.length - 1 ? 'border-b border-gray-100' : ''}`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-gray-400 text-xs">
                  {formatTimestamp(evt.timestamp)}
                </span>
                <span className={`font-semibold ${isError ? 'text-red-600' : isSuccess ? 'text-green-600' : 'text-blue-600'}`}>
                  {evt.event}
                </span>
              </div>
              {evt.data && Object.keys(evt.data).length > 0 && (
                <p className="text-gray-600 text-xs truncate">
                  {summarizeData(evt.data)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
