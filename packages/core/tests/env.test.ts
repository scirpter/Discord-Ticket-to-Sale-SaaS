import { afterEach, describe, expect, it } from 'vitest';

import { getEnv, resetEnvForTests } from '../src/config/env.js';

const ORIGINAL_SUPER_ADMIN_DISCORD_IDS = process.env.SUPER_ADMIN_DISCORD_IDS;
const ORIGINAL_VOODOO_ENV_FILE = process.env.VOODOO_ENV_FILE;
const ORIGINAL_SPORTS_DEFAULT_PUBLISH_TIME = process.env.SPORTS_DEFAULT_PUBLISH_TIME;
const ORIGINAL_CHANNEL_COPY_DISCORD_TOKEN = process.env.CHANNEL_COPY_DISCORD_TOKEN;
const ORIGINAL_CHANNEL_COPY_DISCORD_CLIENT_ID = process.env.CHANNEL_COPY_DISCORD_CLIENT_ID;

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
    } else {
      process.env.VOODOO_ENV_FILE = ORIGINAL_VOODOO_ENV_FILE;
    }

    if (ORIGINAL_SPORTS_DEFAULT_PUBLISH_TIME == null) {
      delete process.env.SPORTS_DEFAULT_PUBLISH_TIME;
      return;
    }

    process.env.SPORTS_DEFAULT_PUBLISH_TIME = ORIGINAL_SPORTS_DEFAULT_PUBLISH_TIME;
  });

  afterEach(() => {
    if (ORIGINAL_CHANNEL_COPY_DISCORD_TOKEN == null) {
      delete process.env.CHANNEL_COPY_DISCORD_TOKEN;
    } else {
      process.env.CHANNEL_COPY_DISCORD_TOKEN = ORIGINAL_CHANNEL_COPY_DISCORD_TOKEN;
    }

    if (ORIGINAL_CHANNEL_COPY_DISCORD_CLIENT_ID == null) {
      delete process.env.CHANNEL_COPY_DISCORD_CLIENT_ID;
      return;
    }

    process.env.CHANNEL_COPY_DISCORD_CLIENT_ID = ORIGINAL_CHANNEL_COPY_DISCORD_CLIENT_ID;
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

  it('defaults channel copy Discord credentials to empty strings', () => {
    delete process.env.CHANNEL_COPY_DISCORD_TOKEN;
    delete process.env.CHANNEL_COPY_DISCORD_CLIENT_ID;
    process.env.VOODOO_ENV_FILE = '__missing_env_file__.env';
    resetEnvForTests();

    const env = getEnv();

    expect(env.CHANNEL_COPY_DISCORD_TOKEN).toBe('');
    expect(env.CHANNEL_COPY_DISCORD_CLIENT_ID).toBe('');
  });
});
