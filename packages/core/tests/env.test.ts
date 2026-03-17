import { afterEach, describe, expect, it } from 'vitest';

import { getEnv, resetEnvForTests } from '../src/config/env.js';

const ORIGINAL_SUPER_ADMIN_DISCORD_IDS = process.env.SUPER_ADMIN_DISCORD_IDS;

describe('getEnv', () => {
  afterEach(() => {
    resetEnvForTests();

    if (ORIGINAL_SUPER_ADMIN_DISCORD_IDS == null) {
      delete process.env.SUPER_ADMIN_DISCORD_IDS;
      return;
    }

    process.env.SUPER_ADMIN_DISCORD_IDS = ORIGINAL_SUPER_ADMIN_DISCORD_IDS;
  });

  it('parses configured super admin Discord IDs as a trimmed list', () => {
    process.env.SUPER_ADMIN_DISCORD_IDS = '111, 222 ,,333 ';
    resetEnvForTests();

    expect(getEnv().superAdminDiscordIds).toEqual(['111', '222', '333']);
  });
});
