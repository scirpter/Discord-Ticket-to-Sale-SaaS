import { describe, expect, it } from 'vitest';

import {
  buildJoinGateButtons,
  buildJoinGatePrompt,
  buildJoinGateStatusMessage,
  parseJoinGateModalCustomId,
  parseJoinGateStartCustomId,
  sanitizeTicketChannelName,
} from './join-gate-runtime.js';

describe('join gate runtime helpers', () => {
  it('builds stable start button ids for both verification paths', () => {
    const row = buildJoinGateButtons('guild-123');
    const json = row.toJSON();
    const components = json.components as Array<{ custom_id?: string }>;

    expect(components).toHaveLength(2);
    expect(components[0]?.custom_id).toBe('join-gate:start:guild-123:current_customer');
    expect(components[1]?.custom_id).toBe('join-gate:start:guild-123:new_customer');
  });

  it('parses join gate custom ids from button and modal interactions', () => {
    expect(parseJoinGateStartCustomId('join-gate:start:guild-1:current_customer')).toEqual({
      guildId: 'guild-1',
      path: 'current_customer',
    });
    expect(parseJoinGateModalCustomId('join-gate:email:guild-2:new_customer')).toEqual({
      guildId: 'guild-2',
      path: 'new_customer',
    });
    expect(parseJoinGateStartCustomId('sale:start:guild-1:current_customer')).toBeNull();
    expect(parseJoinGateModalCustomId('join-gate:email:guild-2:wrong')).toBeNull();
  });

  it('builds the verification prompt copy for fallback delivery', () => {
    const payload = buildJoinGatePrompt({
      guildId: 'guild-1',
      guildName: 'Voodoo Guild',
      delivery: 'fallback',
    });
    const embed = payload.embeds?.[0]?.toJSON();

    expect(embed?.title).toBe('Verify Server Access');
    expect(embed?.description).toContain('cannot see the rest of the server yet');
  });

  it('sanitizes ticket channel names for Discord-friendly output', () => {
    expect(sanitizeTicketChannelName('Fancy User !!!', '01ABCDEF')).toBe('verify-fancy-user-01abcd');
    expect(sanitizeTicketChannelName('***', '!!')).toBe('verify-member-verify');
  });

  it('formats the status message with config and warning sections', () => {
    const content = buildJoinGateStatusMessage({
      config: {
        id: 'cfg-1',
        tenantId: 'tenant-1',
        guildId: 'guild-1',
        paidLogChannelId: null,
        staffRoleIds: [],
        defaultCurrency: 'GBP',
        tipEnabled: false,
        pointsEarnCategoryKeys: [],
        pointsRedeemCategoryKeys: [],
        pointValueMinor: 1,
        referralRewardMinor: 0,
        referralRewardCategoryKeys: [],
        referralLogChannelId: null,
        referralThankYouTemplate: '',
        referralSubmissionTemplate: '',
        ticketMetadataKey: 'isTicket',
        joinGateEnabled: true,
        joinGateFallbackChannelId: 'fallback-1',
        joinGateVerifiedRoleId: 'role-1',
        joinGateTicketCategoryId: 'cat-1',
        joinGateCurrentLookupChannelId: 'current-1',
        joinGateNewLookupChannelId: 'new-1',
      },
      missingConfig: ['Verified role'],
      runtimeWarnings: ['Missing guild permission: Manage Roles'],
      currentLookupCount: 12,
      newLookupCount: 3,
    });

    expect(content).toContain('Join Gate: Enabled');
    expect(content).toContain('Current-customer lookup: <#current-1> (12 indexed email(s))');
    expect(content).toContain('Missing config: Verified role');
    expect(content).toContain('- Missing guild permission: Manage Roles');
  });
});
