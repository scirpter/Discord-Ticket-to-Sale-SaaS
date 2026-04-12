import { err, ok, type Result } from 'neverthrow';
import { ulid } from 'ulid';

import { AppError, fromUnknownError } from '../domain/errors.js';
import {
  ChannelCopyRepository,
  type ChannelCopyAuthorizedUserRecord,
  type ChannelCopyJobRecord,
  type ChannelCopyJobStatus,
} from '../repositories/channel-copy-repository.js';

export type ChannelCopyAuthorizedUserSummary = {
  authorizationId: string;
  discordUserId: string;
  grantedByDiscordUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ChannelCopyCommandAccessState = {
  locked: boolean;
  allowed: boolean;
  activated: boolean;
  authorizedUserCount: number;
};

export type ChannelCopyRuntimeAdapter = {
  getChannel(input: { channelId: string }): Promise<{
    id: string;
    guildId: string;
    kind: 'guildText' | 'guildAnnouncement';
  }>;
  assertReadableSource(input: { channelId: string }): Promise<void>;
  assertWritableDestination(input: { channelId: string }): Promise<void>;
  countDestinationMessages(input: { channelId: string }): Promise<number>;
  listSourceMessages(input: {
    channelId: string;
    afterMessageId: string | null;
    limit: number;
  }): Promise<
    Array<{
      id: string;
      content: string;
      attachments: Array<{ name: string; contentType: string | null; data: Buffer }>;
      isSystem: boolean;
    }>
  >;
  repostMessage(input: {
    channelId: string;
    content: string;
    attachments: Array<{ name: string; contentType: string | null; data: Buffer }>;
  }): Promise<{ destinationMessageId: string }>;
};

export type ChannelCopyRunSummary = {
  jobId: string;
  status: 'awaiting_confirmation' | 'completed';
  requiresConfirmToken: string | null;
  copiedMessageCount: number;
  skippedMessageCount: number;
};

type ChannelCopyRepositoryPort = Pick<
  ChannelCopyRepository,
  | 'listAuthorizedUsers'
  | 'upsertAuthorizedUser'
  | 'revokeAuthorizedUser'
  | 'findLatestIncompleteJob'
  | 'createJob'
  | 'updateJob'
>;

function mapAuthorizedUserSummary(
  authorizedUser: ChannelCopyAuthorizedUserRecord,
): ChannelCopyAuthorizedUserSummary {
  return {
    authorizationId: authorizedUser.id,
    discordUserId: authorizedUser.discordUserId,
    grantedByDiscordUserId: authorizedUser.grantedByDiscordUserId,
    createdAt: authorizedUser.createdAt.toISOString(),
    updatedAt: authorizedUser.updatedAt.toISOString(),
  };
}

function buildConfirmToken(): string {
  return `COPY-${ulid().slice(-8)}`.toUpperCase();
}

function shouldSkipMessage(message: {
  content: string;
  attachments: Array<unknown>;
  isSystem: boolean;
}): boolean {
  return message.isSystem || (message.content.trim().length === 0 && message.attachments.length === 0);
}

export class ChannelCopyService {
  constructor(
    private readonly repository: ChannelCopyRepositoryPort = new ChannelCopyRepository(),
  ) {}

  public async getCommandAccessState(input: {
    guildId: string;
    discordUserId: string;
  }): Promise<Result<ChannelCopyCommandAccessState, AppError>> {
    try {
      const authorizedUsers = await this.repository.listAuthorizedUsers({
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
      return err(new AppError('CHANNEL_COPY_ACCESS_READ_FAILED', fromUnknownError(error).message, 500));
    }
  }

  public async listAuthorizedUsers(input: {
    guildId: string;
  }): Promise<Result<ChannelCopyAuthorizedUserSummary[], AppError>> {
    try {
      const authorizedUsers = await this.repository.listAuthorizedUsers({
        guildId: input.guildId,
      });

      return ok(authorizedUsers.map(mapAuthorizedUserSummary));
    } catch (error) {
      return err(new AppError('CHANNEL_COPY_ACCESS_READ_FAILED', fromUnknownError(error).message, 500));
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
      const granted = await this.repository.upsertAuthorizedUser({
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
      return err(new AppError('CHANNEL_COPY_ACCESS_WRITE_FAILED', fromUnknownError(error).message, 500));
    }
  }

  public async revokeUserAccess(input: {
    guildId: string;
    discordUserId: string;
  }): Promise<Result<{ revoked: boolean }, AppError>> {
    try {
      const revoked = await this.repository.revokeAuthorizedUser({
        guildId: input.guildId,
        discordUserId: input.discordUserId,
      });

      return ok({ revoked });
    } catch (error) {
      return err(new AppError('CHANNEL_COPY_ACCESS_WRITE_FAILED', fromUnknownError(error).message, 500));
    }
  }

  public async startCopyRun(input: {
    sourceChannelId: string;
    destinationChannelId: string;
    requestedByDiscordUserId: string;
    destinationGuildId: string;
    confirmToken: string | null;
    adapter: ChannelCopyRuntimeAdapter;
  }): Promise<Result<ChannelCopyRunSummary, AppError>> {
    try {
      const sourceChannel = await input.adapter.getChannel({ channelId: input.sourceChannelId });
      const destinationChannel = await input.adapter.getChannel({
        channelId: input.destinationChannelId,
      });

      if (destinationChannel.guildId !== input.destinationGuildId) {
        return err(
          new AppError(
            'CHANNEL_COPY_DESTINATION_GUILD_MISMATCH',
            'Run this command from the destination server only.',
            403,
          ),
        );
      }

      await input.adapter.assertReadableSource({ channelId: input.sourceChannelId });
      await input.adapter.assertWritableDestination({ channelId: input.destinationChannelId });

      const existingJob = await this.repository.findLatestIncompleteJob({
        sourceChannelId: input.sourceChannelId,
        destinationChannelId: input.destinationChannelId,
        requestedByDiscordUserId: input.requestedByDiscordUserId,
      });

      const jobToRun = await this.resolveJobToRun({
        existingJob,
        sourceGuildId: sourceChannel.guildId,
        destinationGuildId: destinationChannel.guildId,
        sourceChannelId: input.sourceChannelId,
        destinationChannelId: input.destinationChannelId,
        requestedByDiscordUserId: input.requestedByDiscordUserId,
        confirmToken: input.confirmToken,
        adapter: input.adapter,
      });

      if (jobToRun.status === 'awaiting_confirmation') {
        return ok({
          jobId: jobToRun.id,
          status: 'awaiting_confirmation',
          requiresConfirmToken: jobToRun.confirmToken,
          copiedMessageCount: jobToRun.copiedMessageCount,
          skippedMessageCount: jobToRun.skippedMessageCount,
        });
      }

      const startedJob =
        jobToRun.status === 'running'
          ? jobToRun
          : await this.repository.updateJob({
              jobId: jobToRun.id,
              status: 'running',
              forceConfirmed: jobToRun.forceConfirmed,
              confirmToken: jobToRun.confirmToken,
              startedAt: jobToRun.startedAt ?? new Date(),
              finishedAt: null,
            });

      let afterMessageId = startedJob.lastProcessedSourceMessageId;
      let scannedMessageCount = startedJob.scannedMessageCount;
      let copiedMessageCount = startedJob.copiedMessageCount;
      let skippedMessageCount = startedJob.skippedMessageCount;

      for (;;) {
        const messages = await input.adapter.listSourceMessages({
          channelId: input.sourceChannelId,
          afterMessageId,
          limit: 100,
        });

        if (messages.length === 0) {
          break;
        }

        for (const message of messages) {
          scannedMessageCount += 1;
          afterMessageId = message.id;

          if (shouldSkipMessage(message)) {
            skippedMessageCount += 1;
          } else {
            await input.adapter.repostMessage({
              channelId: input.destinationChannelId,
              content: message.content,
              attachments: message.attachments,
            });
            copiedMessageCount += 1;
          }

          await this.repository.updateJob({
            jobId: startedJob.id,
            lastProcessedSourceMessageId: afterMessageId,
            scannedMessageCount,
            copiedMessageCount,
            skippedMessageCount,
          });
        }
      }

      const completedJob = await this.repository.updateJob({
        jobId: startedJob.id,
        status: 'completed',
        finishedAt: new Date(),
        lastProcessedSourceMessageId: afterMessageId,
        scannedMessageCount,
        copiedMessageCount,
        skippedMessageCount,
      });

      return ok({
        jobId: completedJob.id,
        status: 'completed',
        requiresConfirmToken: null,
        copiedMessageCount: completedJob.copiedMessageCount,
        skippedMessageCount: completedJob.skippedMessageCount,
      });
    } catch (error) {
      return err(new AppError('CHANNEL_COPY_RUN_FAILED', fromUnknownError(error).message, 500));
    }
  }

  private async resolveJobToRun(input: {
    existingJob: ChannelCopyJobRecord | null;
    sourceGuildId: string;
    destinationGuildId: string;
    sourceChannelId: string;
    destinationChannelId: string;
    requestedByDiscordUserId: string;
    confirmToken: string | null;
    adapter: Pick<ChannelCopyRuntimeAdapter, 'countDestinationMessages'>;
  }): Promise<ChannelCopyJobRecord> {
    if (input.existingJob && input.existingJob.status !== 'awaiting_confirmation') {
      return input.existingJob;
    }

    const destinationMessageCount = await input.adapter.countDestinationMessages({
      channelId: input.destinationChannelId,
    });

    if (destinationMessageCount > 0) {
      if (
        input.existingJob?.status === 'awaiting_confirmation' &&
        input.existingJob.confirmToken === input.confirmToken
      ) {
        return this.repository.updateJob({
          jobId: input.existingJob.id,
          status: 'queued',
          forceConfirmed: true,
        });
      }

      if (input.existingJob?.status === 'awaiting_confirmation') {
        return input.existingJob;
      }

      return this.repository.createJob({
        destinationGuildId: input.destinationGuildId,
        sourceGuildId: input.sourceGuildId,
        sourceChannelId: input.sourceChannelId,
        destinationChannelId: input.destinationChannelId,
        requestedByDiscordUserId: input.requestedByDiscordUserId,
        confirmToken: buildConfirmToken(),
        status: 'awaiting_confirmation',
        forceConfirmed: false,
      });
    }

    if (input.existingJob?.status === 'awaiting_confirmation') {
      return this.repository.updateJob({
        jobId: input.existingJob.id,
        status: 'queued',
        forceConfirmed: true,
      });
    }

    return this.repository.createJob({
      destinationGuildId: input.destinationGuildId,
      sourceGuildId: input.sourceGuildId,
      sourceChannelId: input.sourceChannelId,
      destinationChannelId: input.destinationChannelId,
      requestedByDiscordUserId: input.requestedByDiscordUserId,
      confirmToken: null,
      status: 'queued',
      forceConfirmed: false,
    });
  }
}
