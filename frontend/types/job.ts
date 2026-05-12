export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface JobEvent {
  event: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface Job {
  job_id: string;
  url: string;
  goal: string;
  status: JobStatus;
  result?: BookResult[];
  error?: string;
  logs?: JobEvent[];
  created_at: string;
  updated_at: string;
}

export interface BookResult {
  title: string;
  price: string;
  rating: string;
  availability: string;
}

export type AppPhase = 'IDLE' | 'RUNNING' | 'COMPLETED' | 'FAILED';
