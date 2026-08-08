import { describe, it, expect } from 'vitest';
import { escHtml, csvCell } from '../src/lib/strings.js';

describe('escHtml', () => {
  it('escapes HTML-significant characters', () => {
    expect(escHtml('<b>')).toBe('&lt;b&gt;');
    expect(escHtml('a & b')).toBe('a &amp; b');
    expect(escHtml('say "hi"')).toBe('say &quot;hi&quot;');
    expect(escHtml(null)).toBe('');
  });
});

describe('csvCell (RFC-4180)', () => {
  // Regression: "Austin, TX" and timestamped dates used to bleed into adjacent columns.
  it('quotes fields containing commas', () => {
    expect(csvCell('Austin, TX')).toBe('"Austin, TX"');
    expect(csvCell('8/1/2026, 7:30:00 AM')).toBe('"8/1/2026, 7:30:00 AM"');
  });
  it('doubles internal quotes', () => {
    expect(csvCell('He said "hi"')).toBe('"He said ""hi"""');
  });
  it('quotes fields with newlines', () => {
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
  });
  it('leaves plain fields unquoted and coerces nullish to empty', () => {
    expect(csvCell('Denver')).toBe('Denver');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(42)).toBe('42');
  });
});
