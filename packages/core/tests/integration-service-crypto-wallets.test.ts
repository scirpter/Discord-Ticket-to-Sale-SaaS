import { describe, expect, it } from 'vitest';

import { hasAnyCryptoWallet } from '../src/services/integration-service.js';

describe('hasAnyCryptoWallet', () => {
  it('returns false when all wallet entries are empty', () => {
    const result = hasAnyCryptoWallet({
      evm: null,
      btc: null,
      bitcoincash: null,
      ltc: null,
      doge: null,
      trc20: null,
      solana: null,
    });

    expect(result).toBe(false);
  });

  it('returns true when at least one wallet is present', () => {
    const result = hasAnyCryptoWallet({
      evm: null,
      btc: '',
      bitcoincash: null,
      ltc: 'Labc123',
      doge: null,
      trc20: null,
      solana: null,
    });

    expect(result).toBe(true);
  });
});
