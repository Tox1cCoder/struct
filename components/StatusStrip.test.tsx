import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusStrip } from './StatusStrip';

describe('StatusStrip coverage warnings', () => {
  it('shows incomplete coverage separately from an extraction error', () => {
    render(<StatusStrip
      accent="cyan"
      results={[{
        id: 'right',
        fileName: 'Right.pdf',
        status: 'SUCCESS',
        durationMs: 80000,
        passUsed: 'escalated',
        warning: 'Incomplete coverage',
        missingLabels: ['F2', 'F3'],
      }]}
    />);

    expect(screen.getByText(/Incomplete coverage/)).toBeInTheDocument();
    expect(screen.getByText(/F2, F3/)).toBeInTheDocument();
    expect(screen.getByText('1 ok')).toBeInTheDocument();
  });

  it('limits a long missing-label summary to five entries', () => {
    render(<StatusStrip
      accent="cyan"
      results={[{
        id: 'right',
        status: 'SUCCESS',
        warning: 'Incomplete coverage',
        missingLabels: ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7'],
      }]}
    />);

    expect(screen.getByText(/F1, F2, F3, F4, F5 \+ 2 more/)).toBeInTheDocument();
  });
});
