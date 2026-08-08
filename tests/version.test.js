import { describe, it, expect } from 'vitest';
import { updateAvailable } from '../src/lib/version.js';

describe('updateAvailable', () => {
  it('is true when the deployed build differs from the running one', () => {
    expect(updateAvailable('100', '200')).toBe(true);
  });
  it('is false when they match', () => {
    expect(updateAvailable('100', '100')).toBe(false);
  });
  it('is false in a dev/un-built context', () => {
    expect(updateAvailable('dev', '200')).toBe(false);
  });
  it('is false when either id is missing', () => {
    expect(updateAvailable('', '200')).toBe(false);
    expect(updateAvailable('100', '')).toBe(false);
    expect(updateAvailable(undefined, undefined)).toBe(false);
  });
});
