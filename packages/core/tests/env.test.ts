import { afterEach, describe, expect, it } from 'vitest';

import { getEnv, resetEnvForTests } from '../src/config/env.js';

const ORIGINAL_SUPER_ADMIN_DISCORD_IDS = process.env.SUPER_ADMIN_DISCORD_IDS;
const ORIGINAL_VOODOO_ENV_FILE = process.env.VOODOO_ENV_FILE;

describe('getEnv', () => {
  afterEach(() => {
    resetEnvForTests();

    if (ORIGINAL_SUPER_ADMIN_DISCORD_IDS == null) {
      delete process.env.SUPER_ADMIN_DISCORD_IDS;
      return;
    }

    process.env.SUPER_ADMIN_DISCORD_IDS = ORIGINAL_SUPER_ADMIN_DISCORD_IDS;
  });

  afterEach(() => {
    if (ORIGINAL_VOODOO_ENV_FILE == null) {
      delete process.env.VOODOO_ENV_FILE;
      return;
    }

    process.env.VOODOO_ENV_FILE = ORIGINAL_VOODOO_ENV_FILE;
  });

  it('parses configured super admin Discord IDs as a trimmed list', () => {
    process.env.SUPER_ADMIN_DISCORD_IDS = '111, 222 ,,333 ';
    resetEnvForTests();

    expect(getEnv().superAdminDiscordIds).toEqual(['111', '222', '333']);
  });

  it('uses 00:01 as the sports default publish time', () => {
    delete process.env.SPORTS_DEFAULT_PUBLISH_TIME;
    process.env.VOODOO_ENV_FILE = '__missing_env_file__.env';
    resetEnvForTests();

    expect(getEnv().SPORTS_DEFAULT_PUBLISH_TIME).toBe('00:01');
  });
});
