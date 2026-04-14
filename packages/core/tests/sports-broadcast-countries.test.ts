import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SHARED_BROADCAST_COUNTRIES,
  formatBroadcastCountriesLabel,
  normalizeBroadcastCountries,
} from '../src/services/sports-broadcast-countries.js';

describe('sports broadcast countries', () => {
  it('defaults to the shared UK and USA list when no explicit countries are provided', () => {
    expect(normalizeBroadcastCountries([])).toEqual(DEFAULT_SHARED_BROADCAST_COUNTRIES);
  });

  it('formats a stable label for shared category copy', () => {
    expect(formatBroadcastCountriesLabel(['United Kingdom', 'United States'])).toBe(
      'United Kingdom + United States',
    );
  });
});
