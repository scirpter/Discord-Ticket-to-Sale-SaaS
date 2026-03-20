import { err, ok, type Result } from 'neverthrow';

import { AppError } from '../domain/errors.js';
import {
  SportsAccessRepository,
  type SportsAuthorizedUserRecord,
} from '../repositories/sports-access-repository.js';

export type SportsAuthorizedUserSummary = {
  authorizationId: string;
  discordUserId: string;
  grantedByDiscordUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SportsCommandAccessState = {
  locked: boolean;
  allowed: boolean;
  activated: boolean;
  authorizedUserCount: number;
};

export type SportsGuildActivationState = {
  activated: boolean;
  authorizedUserCount: number;
};

function mapAuthorizedUserSummary(
  authorizedUser: SportsAuthorizedUserRecord,
): SportsAuthorizedUserSummary {
  return {
    authorizationId: authorizedUser.id,
    discordUserId: authorizedUser.discordUserId,
    grantedByDiscordUserId: authorizedUser.grantedByDiscordUserId,
    createdAt: authorizedUser.createdAt.toISOString(),
    updatedAt: authorizedUser.updatedAt.toISOString(),
  };
}

export class SportsAccessService {
  private readonly sportsAccessRepository = new SportsAccessRepository();

  public async getCommandAccessState(input: {
    guildId: string;
    discordUserId: string;
  }): Promise<Result<SportsCommandAccessState, AppError>> {
    try {
      const authorizedUsers = await this.sportsAccessRepository.listAuthorizedUsers({
        guildId: input.guildId,
      });
      const authorizedUserCount = authorizedUsers.length;

      return ok({
        locked: true,
        allowed: authorizedUsers.some((user) => user.discordUserId === input.discordUserId),
        activated: authorizedUserCount > 0,
        authorizedUserCount,
      });
    } catch (error) {
      return err(
        error instanceof AppError
          ? error
          : new AppError(
              'SPORTS_ACCESS_READ_FAILED',
              'Sports access check failed due to an internal error.',
              500,
            ),
      );
    }
  }

  public async getGuildActivationState(input: {
    guildId: string;
  }): Promise<Result<SportsGuildActivationState, AppError>> {
    try {
      const authorizedUsers = await this.sportsAccessRepository.listAuthorizedUsers({
        guildId: input.guildId,
      });

      return ok({
        activated: authorizedUsers.length > 0,
        authorizedUserCount: authorizedUsers.length,
      });
    } catch (error) {
      return err(
        error instanceof AppError
          ? error
          : new AppError(
              'SPORTS_ACCESS_READ_FAILED',
              'Sports access check failed due to an internal error.',
              500,
            ),
      );
    }
  }

  public async listAuthorizedUsers(input: {
    guildId: string;
  }): Promise<Result<SportsAuthorizedUserSummary[], AppError>> {
    try {
      const authorizedUsers = await this.sportsAccessRepository.listAuthorizedUsers({
        guildId: input.guildId,
      });

      return ok(authorizedUsers.map(mapAuthorizedUserSummary));
    } catch (error) {
      return err(
        error instanceof AppError
          ? error
          : new AppError(
              'SPORTS_ACCESS_READ_FAILED',
              'Sports access check failed due to an internal error.',
              500,
            ),
      );
    }
  }

  public async grantUserAccess(input: {
    guildId: string;
    discordUserId: string;
    grantedByDiscordUserId: string;
  }): Promise<
    Result<
      {
        authorizationId: string;
        discordUserId: string;
        created: boolean;
      },
      AppError
    >
  > {
    try {
      const granted = await this.sportsAccessRepository.upsertAuthorizedUser({
        guildId: input.guildId,
        discordUserId: input.discordUserId,
        grantedByDiscordUserId: input.grantedByDiscordUserId,
      });

      return ok({
        authorizationId: granted.record.id,
        discordUserId: granted.record.discordUserId,
        created: granted.created,
      });
    } catch (error) {
      return err(
        error instanceof AppError
          ? error
          : new AppError(
              'SPORTS_ACCESS_WRITE_FAILED',
              'Sports access update failed due to an internal error.',
              500,
            ),
      );
    }
  }

  public async revokeUserAccess(input: {
    guildId: string;
    discordUserId: string;
  }): Promise<Result<{ revoked: boolean }, AppError>> {
    try {
      const revoked = await this.sportsAccessRepository.revokeAuthorizedUser({
        guildId: input.guildId,
        discordUserId: input.discordUserId,
      });

      return ok({ revoked });
    } catch (error) {
      return err(
        error instanceof AppError
          ? error
          : new AppError(
              'SPORTS_ACCESS_WRITE_FAILED',
              'Sports access update failed due to an internal error.',
              500,
            ),
      );
    }
  }
}
