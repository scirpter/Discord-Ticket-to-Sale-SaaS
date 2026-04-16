import { describe, expect, it } from 'vitest';

import { SETTINGS_MENU_ITEMS } from './dashboard-settings-menu';

describe('SETTINGS_MENU_ITEMS', () => {
  it('includes the tipping panel between paid logs and Telegram', () => {
    expect(SETTINGS_MENU_ITEMS.map((item) => item.id)).toEqual([
      'default-currency',
      'staff-roles',
      'paid-log-channel',
      'tipping',
      'telegram',
    ]);
  });
});
