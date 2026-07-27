import { describe, expect, it } from 'vitest';
import {
  CERTIFIED_FOUNDATION_COORDINATE_PROMPT,
  FRAME_MODEL,
  FRAME_RESPONSE_REQUIRED_FIELDS,
  FRAME_SYSTEM_PROMPT,
  FOUNDATION_PLAN_DIRECT_MAPPING_PROMPT,
  FOUNDATION_PLAN_COORDINATE_PROMPT,
  REINFORCEMENT_SYSTEM_PROMPT,
} from './geminiService';

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

describe('FOUNDATION_PLAN_COORDINATE_PROMPT visible alias extraction', () => {
  it('keeps visible C or P aliases instead of forcing plain aliases to empty', () => {
    expect(FOUNDATION_PLAN_COORDINATE_PROMPT).toContain('visible C or P');
    expect(FOUNDATION_PLAN_COORDINATE_PROMPT).not.toMatch(/plain monochrome[^.]+empty string/i);
  });

  it('discourages inferred grid-intersection rows and empty primary coordinates', () => {
    expect(FOUNDATION_PLAN_COORDINATE_PROMPT).toMatch(/Do not create inferred rows/i);
    expect(FOUNDATION_PLAN_COORDINATE_PROMPT).toMatch(/only when the foundation or support location is visibly present/i);
    expect(FOUNDATION_PLAN_COORDINATE_PROMPT).not.toMatch(/return the foundation row and use an empty string/i);
  });
});

describe('CERTIFIED_FOUNDATION_COORDINATE_PROMPT schema guidance', () => {
  it('names the exact response keys to avoid snake_case/type variants', () => {
    expect(CERTIFIED_FOUNDATION_COORDINATE_PROMPT).toContain('xAxis');
    expect(CERTIFIED_FOUNDATION_COORDINATE_PROMPT).toContain('yAxis');
    expect(CERTIFIED_FOUNDATION_COORDINATE_PROMPT).toContain('columnType');
    expect(CERTIFIED_FOUNDATION_COORDINATE_PROMPT).toContain('1C2');
    expect(CERTIFIED_FOUNDATION_COORDINATE_PROMPT).toContain('Do not use snake_case');
  });
});

describe('FOUNDATION_PLAN_DIRECT_MAPPING_PROMPT fallback guidance', () => {
  it('extracts foundation-to-code rows without requiring coordinates', () => {
    expect(FOUNDATION_PLAN_DIRECT_MAPPING_PROMPT).toContain('foundation-to-column mapping');
    expect(FOUNDATION_PLAN_DIRECT_MAPPING_PROMPT).toContain('Do not require xAxis or yAxis');
    expect(FOUNDATION_PLAN_DIRECT_MAPPING_PROMPT).toContain('Do not return rows with an empty planColumnType');
  });
});

describe('FRAME_SYSTEM_PROMPT FW/FG contract', () => {
  it('uses the latest stable Flash model for Frame extraction', () => {
    expect(FRAME_MODEL).toBe('gemini-3.6-flash');
  });

  it('defines FW h from the bottom-most inner reinforcement square', () => {
    expect(FRAME_SYSTEM_PROMPT).toMatch(/bottom-most inner reinforcement square/i);
    expect(FRAME_SYSTEM_PROMPT).toMatch(/ignore.*500.*30/i);
  });

  it('requires all FG fields instead of allowing visible rows to be omitted', () => {
    expect(FRAME_SYSTEM_PROMPT).toMatch(/never leave.*FG.*blank.*visible/i);
    expect(FRAME_RESPONSE_REQUIRED_FIELDS).toEqual(
      expect.arrayContaining([
        'fgBottomRebarDiameter',
        'fgStirrupDiameter',
        'fgStirrupMaxDistance',
        'fgBellyRebarDiameter',
      ]),
    );
  });

  it('requires FW circle counting, numeric diameters, and defaults', () => {
    expect(FRAME_SYSTEM_PROMPT).toMatch(/circular markers/i);
    expect(FRAME_SYSTEM_PROMPT).toMatch(/ignore.*x.*marks/i);
    expect(FRAME_SYSTEM_PROMPT).toMatch(/lower reinforcement square/i);
    expect(FRAME_SYSTEM_PROMPT).toMatch(/exclude.*above/i);
    expect(FRAME_SYSTEM_PROMPT).toContain('FW_ヨコ筋_本数');
    expect(FRAME_SYSTEM_PROMPT).toMatch(/default.*13/i);
    expect(FRAME_SYSTEM_PROMPT).toMatch(/default.*10/i);
    expect(FRAME_SYSTEM_PROMPT).toMatch(/numeric.*after D/i);
  });

  it('names every FG output field and handles FG1B once', () => {
    expect(FRAME_SYSTEM_PROMPT).toMatch(/FG1B/i);
    expect(FRAME_SYSTEM_PROMPT).toMatch(/one.*row/i);
    for (const name of [
      'FG_上端筋_直径',
      'FG_下端筋_直径',
      'FG_St_直径',
      'FG_St_距離_最大',
      'FG_腹筋_直径',
      'FG_巾止筋_直径',
      'FG_巾止筋_距離_最大',
    ]) {
      expect(FRAME_SYSTEM_PROMPT).toContain(name);
    }
  });
});
