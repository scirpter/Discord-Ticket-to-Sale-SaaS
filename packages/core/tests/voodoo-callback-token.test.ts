import { describe, expect, it } from 'vitest';

import { signVoodooCallbackToken, verifyVoodooCallbackToken } from '../src/security/voodoo-callback-token.js';

describe('voodoo callback token', () => {
  it('signs and verifies callback token', () => {
    const payload = {
      tenantId: 'tenant_1',
      guildId: 'guild_1',
      orderSessionId: 'order_1',
    };
    const secret = 'test-secret-key-with-minimum-entropy';
    const token = signVoodooCallbackToken(payload, secret);

    const valid = verifyVoodooCallbackToken({
      payload,
      secret,
      providedToken: token,
    });

    expect(valid).toBe(true);
  });

  it('rejects callback token with wrong payload', () => {
    const token = signVoodooCallbackToken(
      {
        tenantId: 'tenant_1',
        guildId: 'guild_1',
        orderSessionId: 'order_1',
      },
      'test-secret-key-with-minimum-entropy',
    );

    const valid = verifyVoodooCallbackToken({
      payload: {
        tenantId: 'tenant_1',
        guildId: 'guild_2',
        orderSessionId: 'order_1',
      },
      secret: 'test-secret-key-with-minimum-entropy',
      providedToken: token,
    });

    expect(valid).toBe(false);
  });
});
