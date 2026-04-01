import { describe, expect, it } from 'vitest';

import {
  assertValidTimezone,
  computeNextRunAtUtc,
  parseDailyTimeHhMm,
  resolveLocalDate,
} from '../src/services/sports-schedule.js';

describe('sports schedule helpers', () => {
  it('parses valid HH:mm input', () => {
    expect(parseDailyTimeHhMm('01:15')).toEqual({ hour: 1, minute: 15 });
  });

  it('rejects invalid HH:mm input and invalid timezones', () => {
    expect(() => parseDailyTimeHhMm('1:15')).toThrow();
    expect(() => parseDailyTimeHhMm('24:00')).toThrow();
    expect(() => assertValidTimezone('Moon/Base')).toThrow();
  });

  it('computes the next UK run and resolves the local date', () => {
    const now = new Date('2026-03-20T00:30:00.000Z');
    const localDate = resolveLocalDate({
      timezone: 'Europe/London',
      at: now,
    });
    const nextRun = computeNextRunAtUtc({
      timezone: 'Europe/London',
      timeHhMm: '01:00',
      now,
    });

    expect(localDate).toBe('2026-03-20');
    expect(nextRun.toISOString()).toBe('2026-03-20T01:00:00.000Z');
  });

  it('computes the next UK run using the new default sports publish time', () => {
    const now = new Date('2026-03-20T00:00:30.000Z');
    const nextRun = computeNextRunAtUtc({
      timezone: 'Europe/London',
      timeHhMm: '00:01',
      now,
    });

    expect(nextRun.toISOString()).toBe('2026-03-20T00:01:00.000Z');
  });
});
