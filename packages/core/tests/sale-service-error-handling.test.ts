import { ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

import { SaleService } from '../src/services/sale-service.js';

describe('SaleService error handling', () => {
  it('returns an error result when the internal bot sale session flow throws', async () => {
    const service = new SaleService();

    vi.spyOn((service as any).authorizationService, 'ensureTenantIsActive').mockResolvedValue(ok(undefined));
    vi.spyOn(service as any, 'createSaleSessionInternal').mockRejectedValue(new Error('missing column'));

    const result = await service.createSaleSessionFromBot({
      tenantId: 'tenant-1',
      guildId: 'guild-1',
      ticketChannelId: 'channel-1',
      staffDiscordUserId: 'staff-1',
      customerDiscordUserId: 'customer-1',
      productId: 'product-1',
      variantId: 'variant-1',
      answers: {},
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe('missing column');
      expect(result.error.code).toBe('INTERNAL_ERROR');
    }
  });
});
