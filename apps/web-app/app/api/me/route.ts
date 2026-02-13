import { AuthService, TenantService, type OAuthDiscordGuild } from '@voodoo/core';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { jsonError, requireSession } from '@/lib/http';

const tenantService = new TenantService();
const authService = new AuthService();

const DISCORD_PERMISSION_ADMINISTRATOR = 1n << 3n;
const DISCORD_PERMISSION_MANAGE_GUILD = 1n << 5n;

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

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireSession(request);
    if (!auth.ok) {
      return auth.response;
    }

    const me = await tenantService.getMe(auth.session);
    if (me.isErr()) {
      return NextResponse.json({ error: me.error.message }, { status: me.error.statusCode });
    }

    const tenants = await tenantService.listTenants(auth.session);
    if (tenants.isErr()) {
      return NextResponse.json({ error: tenants.error.message }, { status: tenants.error.statusCode });
    }

    const oauthAccessToken = request.cookies.get('vd_discord_access_token')?.value ?? '';
    let discordGuilds: Array<{
      id: string;
      name: string;
      iconUrl: string | null;
      owner: boolean;
      permissions: string;
    }> = [];
    let discordGuildsError = '';

    if (oauthAccessToken) {
      const guildsResult = await authService.listDiscordGuildsByAccessToken(oauthAccessToken);
      if (guildsResult.isErr()) {
        discordGuildsError = guildsResult.error.message;
      } else {
        discordGuilds = guildsResult.value
          .filter(hasManageGuildPermissions)
          .map((guild) => ({
            id: guild.id,
            name: guild.name,
            iconUrl: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null,
            owner: Boolean(guild.owner),
            permissions: guild.permissions ?? '0',
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
      }
    } else {
      discordGuildsError = 'Discord server list unavailable. Please log in again.';
    }

    return NextResponse.json({
      me: me.value,
      tenants: tenants.value,
      discordGuilds,
      discordGuildsError,
    });
  } catch (error) {
    return jsonError(error);
  }
}
