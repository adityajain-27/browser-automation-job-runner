'use client';

import type { JobEvent } from '@/types/job';
import LiveLog from './LiveLog';

interface ErrorPanelProps {
  error: string;
  lastStep: string;
  events: JobEvent[];
  onRetry: () => void;
}

export default function ErrorPanel({ error, lastStep, events, onRetry }: ErrorPanelProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-md border border-red-200 bg-red-50 p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h3 className="font-semibold text-red-800 text-lg">Automation Failed</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
            <div className="mt-2 text-sm text-red-800">
              <span className="font-medium">Failed at step:</span>
              <span className="font-mono ml-2">{lastStep}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            id="try-again"
            onClick={onRetry}
            className="px-4 py-2 rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>

      {events.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Events Before Failure</h4>
          <LiveLog events={events} isRunning={false} />
        </div>
      )}
    </div>
  );
}
