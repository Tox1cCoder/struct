import React from 'react';
import { ProcessingStatus } from '../types';
import { summarizeJobs } from '../utils/fileJobs';

export type StatusStripAccent = 'indigo' | 'amber' | 'cyan' | 'emerald';

interface StatusStripFile {
  id: string;
  fileName?: string;
  status: ProcessingStatus;
  error?: string;
  durationMs?: number;
  passUsed?: 'primary' | 'escalated';
}

interface StatusStripProps {
  results: StatusStripFile[];
  accent: StatusStripAccent;
  onRetry?: (id: string) => void;
  onRemove?: (id: string) => void;
}

const accentText: Record<StatusStripAccent, string> = {
  indigo: 'text-indigo-700',
  amber: 'text-amber-700',
  cyan: 'text-cyan-700',
  emerald: 'text-emerald-700',
};

export const StatusStrip: React.FC<StatusStripProps> = ({ results, accent, onRetry, onRemove }) => {
  if (results.length === 0) return null;
  const { total, succeeded, processing, failed } = summarizeJobs(results);
  const errors = results.filter((r) => r.status === 'ERROR');

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className={`font-medium ${accentText[accent]}`}>{total} files</span>
        <span className="flex items-center gap-1 text-green-600">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          {succeeded} ok
        </span>
        {processing > 0 && (
          <span className="flex items-center gap-1 text-amber-600">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
            {processing} processing
          </span>
        )}
        {failed > 0 && (
          <span className="flex items-center gap-1 text-red-600">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            {failed} failed
          </span>
        )}
      </div>
      {(onRetry || onRemove || results.some((r) => r.durationMs !== undefined || r.passUsed)) && (
        <ul className="mt-2 space-y-0.5 text-[11px] text-gray-600">
          {results.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 truncate">
              <span className="truncate">
                <span className="font-mono">{r.fileName ?? r.id}</span>
                {r.durationMs !== undefined && (
                  <span className="ml-2 text-gray-500">{Math.round(r.durationMs / 100) / 10}s</span>
                )}
                {r.passUsed && (
                  <span className="ml-2 text-gray-500">
                    [{r.passUsed === 'escalated' ? 'escalated' : 'primary'}]
                  </span>
                )}
                {r.status === 'ERROR' && (
                  <span className="ml-2 text-red-600">{r.error ?? 'Unknown error'}</span>
                )}
              </span>
              <span className="flex items-center gap-2">
                {onRetry && r.status === 'ERROR' && (
                  <button
                    type="button"
                    onClick={() => onRetry(r.id)}
                    className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800"
                  >
                    Retry
                  </button>
                )}
                {onRemove && r.status !== 'PROCESSING' && r.status !== 'PENDING' && (
                  <button
                    type="button"
                    onClick={() => onRemove(r.id)}
                    className="text-[11px] font-medium text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!onRetry && !onRemove && failed > 0 && (
        <ul className="mt-2 space-y-0.5 text-[11px] text-red-600">
          {errors.slice(0, 3).map((r, i) => (
            <li key={i} className="truncate">{r.error ?? 'Unknown error'}</li>
          ))}
          {failed > 3 && <li>+ {failed - 3} more…</li>}
        </ul>
      )}
    </div>
  );
};
