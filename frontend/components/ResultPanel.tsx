'use client';

import type { BookResult, JobEvent } from '@/types/job';

interface ResultPanelProps {
  result: BookResult[];
  events: JobEvent[];
  onReset: () => void;
}

export default function ResultPanel({ result, events, onReset }: ResultPanelProps) {
  const screenshotEvent = events.find((e) => e.event === 'screenshot.captured');
  const screenshotPath = screenshotEvent?.data?.path as string | undefined;
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-green-200 bg-green-50 p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-semibold text-green-800 text-lg">Extraction Complete</h3>
            <p className="text-sm text-green-700">
              Successfully extracted <span className="font-semibold">{result.length}</span> books
            </p>
          </div>
          <button
            id="run-another-job"
            onClick={onReset}
            className="px-4 py-2 rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Run Another Job
          </button>
        </div>
      </div>

      {screenshotPath && (
        <div className="rounded-md border border-gray-200 bg-white overflow-hidden shadow-sm">
          <div className="px-4 py-2 border-b border-gray-200 bg-gray-50">
            <span className="text-sm font-medium text-gray-700">Page Screenshot</span>
          </div>
          <div className="p-4">
            <img
              src={`${apiBase}/${screenshotPath}`}
              alt="Page screenshot"
              className="w-full rounded-md border border-gray-200"
            />
          </div>
        </div>
      )}

      <div className="rounded-md border border-gray-200 bg-white overflow-hidden shadow-sm">
        <div className="px-4 py-2 border-b border-gray-200 bg-gray-50">
          <span className="text-sm font-medium text-gray-700">Extracted Books</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="border-b border-gray-200">
                <th className="text-left px-4 py-3 text-gray-600 font-semibold text-xs tracking-wider">#</th>
                <th className="text-left px-4 py-3 text-gray-600 font-semibold text-xs tracking-wider">Title</th>
                <th className="text-left px-4 py-3 text-gray-600 font-semibold text-xs tracking-wider">Price</th>
                <th className="text-left px-4 py-3 text-gray-600 font-semibold text-xs tracking-wider">Rating</th>
                <th className="text-left px-4 py-3 text-gray-600 font-semibold text-xs tracking-wider">Availability</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {result.map((book, i) => (
                <tr key={`book-${i}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 text-xs">{i + 1}</td>
                  <td className="px-4 py-3 text-gray-900 font-medium max-w-xs truncate">{book.title}</td>
                  <td className="px-4 py-3 text-gray-900 font-mono">{book.price}</td>
                  <td className="px-4 py-3 text-gray-600">{book.rating}</td>
                  <td className="px-4 py-3 text-gray-600">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium
                      ${book.availability.toLowerCase().includes('in stock')
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'}`}>
                      {book.availability}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
