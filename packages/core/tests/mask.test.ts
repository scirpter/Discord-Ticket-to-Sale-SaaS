import { describe, expect, it } from 'vitest';

import { maskAnswers, maskSensitiveValue } from '../src/utils/mask.js';

describe('mask utility', () => {
  it('masks sensitive values and leaves non-sensitive unchanged', () => {
    const out = maskAnswers(
      {
        email: 'john@example.com',
        username: 'johnny',
      },
      new Set(['email']),
    );

    expect(out.username).toBe('johnny');
    expect(out.email).not.toBe('john@example.com');
    expect(out.email.includes('*')).toBe(true);
  });

  it('handles short values', () => {
    expect(maskSensitiveValue('ab')).toBe('**');
    expect(maskSensitiveValue('a')).toBe('*');
  });
});
