'use client';

import { useState, useCallback, useEffect } from 'react';
import type { AppPhase, BookResult, JobEvent } from '@/types/job';
import { useJobSocket } from '@/hooks/useJobSocket';
import JobForm from '@/components/JobForm';
import LiveLog from '@/components/LiveLog';
import ResultPanel from '@/components/ResultPanel';
import ErrorPanel from '@/components/ErrorPanel';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function Home() {
  const [phase, setPhase] = useState<AppPhase>('IDLE');
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<BookResult[]>([]);

  const { events, status } = useJobSocket(jobId);

  const currentPhase = (() => {
    if (phase === 'IDLE') return 'IDLE';
    if (status === 'completed') return 'COMPLETED';
    if (status === 'failed') return 'FAILED';
    return 'RUNNING';
  })();

  const fetchResult = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/jobs/${id}?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const job = await res.json();
        if (job.result) {
          setResult(job.result as BookResult[]);
        }
      }
    } catch (err) {
      console.error("Failed to fetch job result:", err);
    }
  }, []);

  useEffect(() => {
    if (currentPhase === 'COMPLETED' && result.length === 0 && jobId) {
      fetchResult(jobId);
    }
  }, [currentPhase, result.length, jobId, fetchResult]);

  const handleJobCreated = (newJobId: string) => {
    setResult([]);
    setJobId(newJobId);
    setPhase('RUNNING');
  };

  const handleReset = () => {
    setPhase('IDLE');
    setJobId(null);
    setResult([]);
  };

  const failedEvent = events.find((e) => e.event === 'job.failed');
  const errorMessage = (failedEvent?.data?.reason as string) || 'Unknown error';
  const lastStep = (failedEvent?.data?.last_step as string) || 'unknown';

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-12">
      <header className="text-center mb-10 max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight mb-2 text-gray-900">
          Browser Automation Job Runner
        </h1>
        <p className="text-gray-600">
          Submit a URL and a goal. Watch the execution in real-time.
        </p>
      </header>

      <div className="w-full max-w-2xl space-y-8">
        {currentPhase === 'IDLE' && (
          <div className="border border-gray-200 bg-white p-6 shadow-sm rounded-md">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">New Job</h2>
            <JobForm onJobCreated={handleJobCreated} />
          </div>
        )}

        {currentPhase === 'RUNNING' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                Running Automation...
              </h2>
              <span className="text-xs text-gray-500 font-mono">Job ID: {jobId?.slice(0, 8)}</span>
            </div>
            <LiveLog events={events} isRunning={true} />
          </div>
        )}

        {currentPhase === 'COMPLETED' && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Automation Complete</h2>
            <LiveLog events={events} isRunning={false} />
            <ResultPanel result={result} events={events} onReset={handleReset} />
          </div>
        )}

        {currentPhase === 'FAILED' && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Automation Failed</h2>
            <ErrorPanel
              error={errorMessage}
              lastStep={lastStep}
              events={events.filter((e) => e.event !== 'job.failed')}
              onRetry={handleReset}
            />
          </div>
        )}
      </div>
    </main>
  );
}
