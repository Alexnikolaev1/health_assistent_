import { describe, it, expect } from 'vitest';
import { etcGmtFromUtcOffsetHours, parseTimezoneInput } from './timezone';

describe('etcGmtFromUtcOffsetHours', () => {
  it('maps UTC+3 to Etc/GMT-3', () => {
    expect(etcGmtFromUtcOffsetHours(3)).toBe('Etc/GMT-3');
  });
  it('maps UTC-5 to Etc/GMT+5', () => {
    expect(etcGmtFromUtcOffsetHours(-5)).toBe('Etc/GMT+5');
  });
  it('zero is Etc/UTC', () => {
    expect(etcGmtFromUtcOffsetHours(0)).toBe('Etc/UTC');
  });
});

describe('parseTimezoneInput', () => {
  it('accepts Europe/Moscow', () => {
    const r = parseTimezoneInput('Europe/Moscow');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.iana).toBe('Europe/Moscow');
  });
  it('accepts +4 as fixed offset', () => {
    const r = parseTimezoneInput('+4');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.iana).toBe('Etc/GMT-4');
  });
  it('accepts UTC+3', () => {
    const r = parseTimezoneInput('UTC+3');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.iana).toBe('Etc/GMT-3');
  });
  it('rejects garbage', () => {
    const r = parseTimezoneInput('NotA/Zone');
    expect(r.ok).toBe(false);
  });
});
