import type { ReportTemplate, TemplateMappingConfig } from '../types';

const TEMPLATE_KEY = 'structextract.report.template';
const MAPPING_PREFIX = 'structextract.report.mapping';

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

/** Load the mapping config saved for a specific file. Returns null if none saved for this file. */
export function loadMappingConfig(fileName: string): TemplateMappingConfig | null {
  return read<TemplateMappingConfig>(`${MAPPING_PREFIX}.${fileName}`);
}

/** Save the mapping config keyed to the specific file so it never bleeds into other templates. */
export function saveMappingConfig(config: TemplateMappingConfig, fileName: string): void {
  write(`${MAPPING_PREFIX}.${fileName}`, config);
}
