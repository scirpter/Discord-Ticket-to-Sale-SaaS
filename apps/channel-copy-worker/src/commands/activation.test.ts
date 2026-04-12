import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';

vi.mock('@voodoo/core', () => {
  class ChannelCopyService {
    public async listAuthorizedUsers(): Promise<never> {
      throw new Error('Mock listAuthorizedUsers not implemented');
    }

    public async grantUserAccess(): Promise<never> {
      throw new Error('Mock grantUserAccess not implemented');
    }

    public async revokeUserAccess(): Promise<never> {
      throw new Error('Mock revokeUserAccess not implemented');
    }
  }

  return {
    ChannelCopyService,
    getEnv: () => ({
      superAdminDiscordIds: (process.env.SUPER_ADMIN_DISCORD_IDS ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    }),
    resetEnvForTests: () => undefined,
  };
});

import { ChannelCopyService, resetEnvForTests } from '@voodoo/core';

import { activationCommand } from './activation.js';

const ORIGINAL_SUPER_ADMIN_DISCORD_IDS = process.env.SUPER_ADMIN_DISCORD_IDS;

function createOkResult<T>(value: T): { isErr: () => false; isOk: () => true; value: T } {
  return {
    isErr: () => false,
    isOk: () => true,
    value,
  };
}

function createInteractionMock(input?: {
  userId?: string;
  subcommand?: 'grant' | 'revoke' | 'list';
  guildId?: string;
  userIdOption?: string;
}): {
  interaction: ChatInputCommandInteraction;
  deferReply: ReturnType<typeof vi.fn>;
  editReply: ReturnType<typeof vi.fn>;
  reply: ReturnType<typeof vi.fn>;
} {
  const deferReply = vi.fn(async () => {
    interaction.deferred = true;
  });
  const editReply = vi.fn(async () => undefined);
  const reply = vi.fn(async () => undefined);

  const interaction = {
    client: {
      guilds: {
        fetch: vi.fn(async (guildId: string) => ({
          id: guildId,
          name: 'Archive Guild',
        })),
      },
    },
    deferred: false,
    editReply,
    deferReply,
    followUp: vi.fn(async () => undefined),
    options: {
      getSubcommand: vi.fn().mockReturnValue(input?.subcommand ?? 'grant'),
      getString: vi.fn((name: string) => {
        if (name === 'guild_id') {
          return input?.guildId ?? '123456789012345678';
        }

        return input?.userIdOption ?? '234567890123456789';
      }),
    },
    replied: false,
    reply,
    user: { id: input?.userId ?? 'user-1' },
  } as unknown as ChatInputCommandInteraction & { deferred: boolean };

  return { interaction, deferReply, editReply, reply };
}

describe('channel-copy activation command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetEnvForTests();

    if (ORIGINAL_SUPER_ADMIN_DISCORD_IDS == null) {
      delete process.env.SUPER_ADMIN_DISCORD_IDS;
    } else {
      process.env.SUPER_ADMIN_DISCORD_IDS = ORIGINAL_SUPER_ADMIN_DISCORD_IDS;
    }
  });

  it('blocks non-super-admin users', async () => {
    process.env.SUPER_ADMIN_DISCORD_IDS = 'owner-1';
    resetEnvForTests();

    const { interaction, reply } = createInteractionMock({ userId: 'user-2' });

    await activationCommand.execute(interaction);

    expect(reply).toHaveBeenCalledWith({
      content: 'Only the configured super admin Discord ID can manage channel-copy activation.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('grants remote channel-copy access by guild ID and user ID', async () => {
    process.env.SUPER_ADMIN_DISCORD_IDS = 'owner-1';
    resetEnvForTests();

    const grantUserAccessSpy = vi
      .spyOn(ChannelCopyService.prototype, 'grantUserAccess')
      .mockResolvedValue(
        createOkResult({
          authorizationId: 'auth-1',
          discordUserId: '234567890123456789',
          created: true,
        }) as Awaited<ReturnType<ChannelCopyService['grantUserAccess']>>,
      );

    const { interaction, deferReply, editReply } = createInteractionMock({
      userId: 'owner-1',
    });

    await activationCommand.execute(interaction);

    expect(deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(grantUserAccessSpy).toHaveBeenCalledWith({
      guildId: '123456789012345678',
      discordUserId: '234567890123456789',
      grantedByDiscordUserId: 'owner-1',
    });
    expect(editReply).toHaveBeenCalledWith({
      content:
        'Granted `/channel-copy` access for `234567890123456789` in `Archive Guild` (`123456789012345678`).',
    });
  });
});
