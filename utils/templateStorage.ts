import type { ReportTemplate } from '../types';

const TEMPLATE_KEY = 'structextract.report.template';

function read<T>(key: string): T | null {
  try {
    const s = localStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

export function loadTemplate(): ReportTemplate | null {
  return read<ReportTemplate>(TEMPLATE_KEY);
}

export function saveTemplate(template: ReportTemplate): void {
  write(TEMPLATE_KEY, template);
}
