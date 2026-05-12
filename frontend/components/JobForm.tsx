'use client';

import { useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface JobFormProps {
  onJobCreated: (jobId: string) => void;
}

export default function JobForm({ onJobCreated }: JobFormProps) {
  const [url, setUrl] = useState('https://books.toscrape.com');
  const [goal, setGoal] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ url?: string; goal?: string; api?: string }>({});

  const validate = (): boolean => {
    const newErrors: { url?: string; goal?: string } = {};

    if (!url.trim()) {
      newErrors.url = 'URL is required';
    } else {
      try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          newErrors.url = 'URL must start with http:// or https://';
        }
      } catch {
        newErrors.url = 'Please enter a valid URL';
      }
    }

    if (!goal.trim()) {
      newErrors.goal = 'Goal is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    setErrors({});

    try {
      const response = await fetch(`${API_BASE}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), goal: goal.trim() }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ detail: 'Server error' }));
        throw new Error(errData.detail || `HTTP ${response.status}`);
      }

      const data: { job_id: string; status: string } = await response.json();
      onJobCreated(data.job_id);
    } catch (err) {
      setErrors({ api: err instanceof Error ? err.message : 'Failed to create job' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="job-url" className="block text-sm font-medium text-gray-700 mb-1">
          Target URL
        </label>
        <input
          id="job-url"
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://books.toscrape.com"
          disabled={isLoading}
          className={`w-full px-3 py-2 border rounded-md shadow-sm text-gray-900 placeholder-gray-400
            focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm
            ${errors.url ? 'border-red-300' : 'border-gray-300'}`}
        />
        {errors.url && <p className="mt-1 text-sm text-red-600">{errors.url}</p>}
      </div>

      <div>
        <label htmlFor="job-goal" className="block text-sm font-medium text-gray-700 mb-1">
          Automation Goal
        </label>
        <textarea
          id="job-goal"
          required
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder='e.g. "Extract all book titles and prices"'
          rows={3}
          disabled={isLoading}
          className={`w-full px-3 py-2 border rounded-md shadow-sm text-gray-900 placeholder-gray-400
            focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm resize-none
            ${errors.goal ? 'border-red-300' : 'border-gray-300'}`}
        />
        {errors.goal && <p className="mt-1 text-sm text-red-600">{errors.goal}</p>}
      </div>

      {errors.api && (
        <div className="p-3 bg-red-50 text-red-700 text-sm rounded-md border border-red-200">
          {errors.api}
        </div>
      )}

      <button
        id="submit-job"
        type="submit"
        disabled={isLoading}
        className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Launching Automation...' : 'Run Automation'}
      </button>
    </form>
  );
}
