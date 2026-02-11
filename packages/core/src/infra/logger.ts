import pino from 'pino';

import { getEnv } from '../config/env.js';

export const logger = pino({
  level: getEnv().LOG_LEVEL,
  base: null,
  redact: {
    paths: [
      '*.token',
      '*.secret',
      '*.authorization',
      '*.consumerKey',
      '*.consumerSecret',
      '*.DISCORD_TOKEN',
    ],
    censor: '[REDACTED]',
  },
});

