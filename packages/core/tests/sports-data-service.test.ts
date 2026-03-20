import { describe, expect, it } from 'vitest';

import {
  pickBestSportsSearchResult,
  type SportsSearchResult,
} from '../src/services/sports-data-service.js';

describe('pickBestSportsSearchResult', () => {
  it('prefers the closest event name match', () => {
    const results: SportsSearchResult[] = [
      {
        eventId: '2',
        eventName: 'Celtic vs Rangers Legends',
        sportName: 'Soccer',
        leagueName: 'Legends',
        dateEvent: '2026-03-22',
        imageUrl: null,
      },
      {
        eventId: '1',
        eventName: 'Rangers vs Celtic',
        sportName: 'Soccer',
        leagueName: 'Scottish Premiership',
        dateEvent: '2026-03-21',
        imageUrl: null,
      },
    ];

    const best = pickBestSportsSearchResult('rangers v celtic', results);

    expect(best?.eventId).toBe('1');
  });
});
