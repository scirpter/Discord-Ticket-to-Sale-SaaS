import { err, ok, type Result } from 'neverthrow';

import { getEnv } from '../config/env.js';
import { AppError, fromUnknownError } from '../domain/errors.js';
import type { OAuthDiscordGuild, OAuthDiscordUser } from '../domain/types.js';
import { createSessionToken, verifySessionToken, type SessionPayload } from '../security/session-token.js';
import { TenantRepository } from '../repositories/tenant-repository.js';
import { UserRepository } from '../repositories/user-repository.js';

export type AuthCallbackResult = {
  sessionToken: string;
  discordAccessToken: string;
  user: {
    id: string;
    discordUserId: string;
    username: string;
    avatarUrl: string | null;
  };
  isSuperAdmin: boolean;
  tenantIds: string[];
  guilds: OAuthDiscordGuild[];
};

function avatarUrl(discordUser: OAuthDiscordUser): string | null {
  if (!discordUser.avatar) {
    return null;
  }

  return `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`;
}

export class AuthService {
  private readonly env = getEnv();
  private readonly userRepository = new UserRepository();
  private readonly tenantRepository = new TenantRepository();

  public buildLoginUrl(state: string): string {
    const scopes = ['identify', 'guilds'];
    const query = new URLSearchParams({
      client_id: this.env.DISCORD_CLIENT_ID,
      response_type: 'code',
      redirect_uri: this.env.DISCORD_REDIRECT_URI,
      scope: scopes.join(' '),
      state,
      prompt: 'consent',
    });

    return `https://discord.com/oauth2/authorize?${query.toString()}`;
  }

  public async exchangeCodeForSession(input: {
    code: string;
    state: string;
    expectedState: string;
  }): Promise<Result<AuthCallbackResult, AppError>> {
    if (input.state !== input.expectedState) {
      return err(new AppError('OAUTH_STATE_MISMATCH', 'Invalid OAuth state', 400));
    }

    if (!this.env.DISCORD_CLIENT_SECRET) {
      return err(
        new AppError('MISSING_DISCORD_CLIENT_SECRET', 'DISCORD_CLIENT_SECRET is not configured', 500),
      );
    }

    try {
      const tokenRes = await fetch(`${this.env.DISCORD_API_BASE_URL}/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: this.env.DISCORD_CLIENT_ID,
          client_secret: this.env.DISCORD_CLIENT_SECRET,
          grant_type: 'authorization_code',
          code: input.code,
          redirect_uri: this.env.DISCORD_REDIRECT_URI,
        }),
      });

      if (!tokenRes.ok) {
        return err(new AppError('DISCORD_OAUTH_FAILED', 'Discord token exchange failed', 502));
      }

      const tokenBody = (await tokenRes.json()) as {
        access_token: string;
      };

      const accessToken = tokenBody.access_token;
      if (!accessToken) {
        return err(new AppError('DISCORD_OAUTH_FAILED', 'Missing access token from Discord', 502));
      }

      const [userRes, guildsRes] = await Promise.all([
        fetch(`${this.env.DISCORD_API_BASE_URL}/users/@me`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }),
        fetch(`${this.env.DISCORD_API_BASE_URL}/users/@me/guilds`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }),
      ]);

      if (!userRes.ok || !guildsRes.ok) {
        return err(new AppError('DISCORD_OAUTH_PROFILE_FAILED', 'Failed to fetch profile from Discord', 502));
      }

      const discordUser = (await userRes.json()) as OAuthDiscordUser;
      const discordGuilds = (await guildsRes.json()) as OAuthDiscordGuild[];

      const user = await this.userRepository.upsertDiscordUser({
        discordUserId: discordUser.id,
        username: discordUser.username,
        avatarUrl: avatarUrl(discordUser),
      });

      if (this.env.superAdminDiscordIds.includes(discordUser.id)) {
        await this.userRepository.ensureSuperAdmin({ userId: user.id, discordUserId: discordUser.id });
      }

      const isSuperAdmin = await this.userRepository.isSuperAdmin(discordUser.id);
      const tenantIds = await this.userRepository.getTenantIdsForUser(user.id);

      const sessionPayload: SessionPayload = {
        userId: user.id,
        discordUserId: user.discordUserId,
        isSuperAdmin,
        tenantIds,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12,
      };

      const sessionToken = createSessionToken(sessionPayload, this.env.SESSION_SECRET);

      return ok({
        sessionToken,
        discordAccessToken: accessToken,
        user,
        isSuperAdmin,
        tenantIds,
        guilds: discordGuilds,
      });
    } catch (error) {
      return err(fromUnknownError(error, 'DISCORD_OAUTH_EXCEPTION'));
    }
  }

  public async getSession(token: string): Promise<Result<SessionPayload, AppError>> {
    try {
      const payload = verifySessionToken(token, this.env.SESSION_SECRET);
      const tenantIds = await this.userRepository.getTenantIdsForUser(payload.userId);
      return ok({
        ...payload,
        tenantIds,
      });
    } catch (error) {
      return err(fromUnknownError(error, 'INVALID_SESSION'));
    }
  }

  public async listManageableGuilds(token: string): Promise<Result<OAuthDiscordGuild[], AppError>> {
    try {
      const payload = verifySessionToken(token, this.env.SESSION_SECRET);
      const user = await this.userRepository.getByDiscordUserId(payload.discordUserId);

      if (!user) {
        return err(new AppError('USER_NOT_FOUND', 'User not found', 404));
      }

      const tenants = await this.tenantRepository.listTenantsForUser(user.id);
      const guilds: OAuthDiscordGuild[] = [];

      for (const tenant of tenants) {
        const tenantGuilds = await this.tenantRepository.listGuildsForTenant(tenant.id);
        for (const guild of tenantGuilds) {
          guilds.push({ id: guild.guildId, name: guild.guildName, owner: false });
        }
      }

      return ok(guilds);
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }

  public async listDiscordGuildsByAccessToken(
    accessToken: string,
  ): Promise<Result<OAuthDiscordGuild[], AppError>> {
    if (!accessToken.trim()) {
      return err(new AppError('DISCORD_ACCESS_TOKEN_MISSING', 'Discord access token is missing', 401));
    }

    try {
      const guildsRes = await fetch(`${this.env.DISCORD_API_BASE_URL}/users/@me/guilds`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!guildsRes.ok) {
        if (guildsRes.status === 401) {
          return err(new AppError('DISCORD_ACCESS_TOKEN_INVALID', 'Discord login has expired. Please log in again.', 401));
        }

        if (guildsRes.status === 429) {
          return err(
            new AppError(
              'DISCORD_GUILDS_RATE_LIMITED',
              'Discord rate-limited server list loading. Wait a moment and reconnect Discord.',
              429,
            ),
          );
        }

        return err(
          new AppError(
            'DISCORD_GUILDS_FETCH_FAILED',
            `Failed to load Discord servers (${guildsRes.status}). Reconnect Discord and try again.`,
            502,
          ),
        );
      }

      const guilds = (await guildsRes.json()) as OAuthDiscordGuild[];
      return ok(Array.isArray(guilds) ? guilds : []);
    } catch (error) {
      return err(fromUnknownError(error, 'DISCORD_GUILDS_FETCH_EXCEPTION'));
    }
  }
}
