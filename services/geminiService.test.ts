import { describe, expect, it } from 'vitest';
import { REINFORCEMENT_SYSTEM_PROMPT } from './geminiService';

// Guards the 基礎柱形設計例 extraction contract. The zone priority was silently
// flipped once already (Zone II -> Zone I, commit 65d5db0) by a manual find/replace
// with no test protecting it. These assertions pin the intended selection so a
// future edit that drops or inverts it fails loudly.
describe('REINFORCEMENT_SYSTEM_PROMPT column/row selection', () => {
  it('prioritizes the Ⅰゾーンの場合 (Zone I) column', () => {
    expect(REINFORCEMENT_SYSTEM_PROMPT).toContain('Ⅰゾーンの場合');
    expect(REINFORCEMENT_SYSTEM_PROMPT).toMatch(
      /Priority:[^]*Ⅰゾーンの場合/,
    );
  });

  it('falls back to Ⅱゾーンの場合 only when Zone I is absent', () => {
    expect(REINFORCEMENT_SYSTEM_PROMPT).toMatch(
      /Fallback:[^]*Ⅰゾーンの場合[^]*absent[^]*Ⅱゾーンの場合/,
    );
  });

  it('always selects the 側・隅柱用 (Corner/Side) row', () => {
    expect(REINFORCEMENT_SYSTEM_PROMPT).toContain('側・隅柱用');
    expect(REINFORCEMENT_SYSTEM_PROMPT).toMatch(/always extract[^]*側・隅柱用/i);
  });

  it('applies the zone selection to every table value, not just reinforcement', () => {
    expect(REINFORCEMENT_SYSTEM_PROMPT).toContain('基礎柱形主筋');
    expect(REINFORCEMENT_SYSTEM_PROMPT).toContain('帯筋');
    expect(REINFORCEMENT_SYSTEM_PROMPT).toContain('柱形');
  });
});
