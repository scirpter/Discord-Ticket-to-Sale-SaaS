import { AdminService, AuthService, getEnv, type OAuthDiscordGuild } from '@voodoo/core';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { jsonError, requireSession } from '@/lib/http';

const authService = new AuthService();
const adminService = new AdminService();
const env = getEnv();

const DISCORD_PERMISSION_ADMINISTRATOR = 1n << 3n;
const DISCORD_PERMISSION_MANAGE_GUILD = 1n << 5n;
const DISCORD_TEXT_CHANNEL_TYPES = new Set([0, 5]);

function hasManageGuildPermissions(guild: OAuthDiscordGuild): boolean {
  if (guild.owner) {
    return true;
  }

  const raw = guild.permissions ?? '0';
  let permissions = 0n;
  try {
    permissions = BigInt(raw);
  } catch {
    return false;
  }

  return (
    (permissions & DISCORD_PERMISSION_ADMINISTRATOR) !== 0n ||
    (permissions & DISCORD_PERMISSION_MANAGE_GUILD) !== 0n
  );
}

function buildBotInviteUrl(): string {
  const query = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    permissions: '8',
    scope: 'bot applications.commands',
  });

  return `https://discord.com/oauth2/authorize?${query.toString()}`;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ guildId: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireSession(request);
    if (!auth.ok) {
      return auth.response;
    }

    const { guildId } = await context.params;
    const oauthAccessToken = request.cookies.get('vd_discord_access_token')?.value ?? '';
    if (!oauthAccessToken) {
      return NextResponse.json({ error: 'Discord session expired. Please log in again.' }, { status: 401 });
    }

    const guildsResult = await authService.listDiscordGuildsByAccessToken(oauthAccessToken);
    if (guildsResult.isErr()) {
      return NextResponse.json({ error: guildsResult.error.message }, { status: guildsResult.error.statusCode });
    }

    const selectedGuild = guildsResult.value.find((guild) => guild.id === guildId);
    if (!selectedGuild || !hasManageGuildPermissions(selectedGuild)) {
      return NextResponse.json({ error: 'You do not have Manage Server access for this Discord server.' }, { status: 403 });
    }

    const botTokenResult = await adminService.getResolvedBotToken();
    if (botTokenResult.isErr()) {
      return NextResponse.json({ error: botTokenResult.error.message }, { status: botTokenResult.error.statusCode });
    }

    const inviteUrl = buildBotInviteUrl();
    const botToken = botTokenResult.value;
    const guildCheckResponse = await fetch(`${env.DISCORD_API_BASE_URL}/guilds/${guildId}`, {
      headers: {
        Authorization: `Bot ${botToken}`,
      },
    });

    if (guildCheckResponse.status === 403 || guildCheckResponse.status === 404) {
      return NextResponse.json({
        botInGuild: false,
        inviteUrl,
        guild: {
          id: selectedGuild.id,
          name: selectedGuild.name,
        },
        channels: [],
        roles: [],
      });
    }

    if (!guildCheckResponse.ok) {
      return NextResponse.json(
        { error: `Failed to inspect bot membership (${guildCheckResponse.status})` },
        { status: 502 },
      );
    }

    const [channelsResponse, rolesResponse] = await Promise.all([
      fetch(`${env.DISCORD_API_BASE_URL}/guilds/${guildId}/channels`, {
        headers: {
          Authorization: `Bot ${botToken}`,
        },
      }),
      fetch(`${env.DISCORD_API_BASE_URL}/guilds/${guildId}/roles`, {
        headers: {
          Authorization: `Bot ${botToken}`,
        },
      }),
    ]);

    if (!channelsResponse.ok || !rolesResponse.ok) {
      return NextResponse.json(
        {
          error: `Failed to load server channels/roles (${channelsResponse.status}/${rolesResponse.status}). Ensure the bot has permissions in this server.`,
        },
        { status: 502 },
      );
    }

    const rawChannels = (await channelsResponse.json()) as Array<{
      id: string;
      name: string;
      type: number;
      position?: number;
    }>;
    const rawRoles = (await rolesResponse.json()) as Array<{
      id: string;
      name: string;
      color: number;
      managed: boolean;
      position: number;
    }>;

    const channels = rawChannels
      .filter((channel) => DISCORD_TEXT_CHANNEL_TYPES.has(channel.type))
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((channel) => ({
        id: channel.id,
        name: channel.name,
        type: channel.type,
      }));

    const roles = rawRoles
      .filter((role) => role.id !== guildId && !role.managed)
      .sort((a, b) => b.position - a.position)
      .map((role) => ({
        id: role.id,
        name: role.name,
        color: role.color,
        position: role.position,
      }));

    return NextResponse.json({
      botInGuild: true,
      inviteUrl,
      guild: {
        id: selectedGuild.id,
        name: selectedGuild.name,
      },
      channels,
      roles,
    });
  } catch (error) {
    return jsonError(error);
  }
}
