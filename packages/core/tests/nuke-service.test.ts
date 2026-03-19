import { afterEach, describe, expect, it, vi } from 'vitest';

import { NukeService } from '../src/services/nuke-service.js';

describe('NukeService scheduler loop', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs a due-schedule poll immediately when the worker starts', async () => {
    vi.useFakeTimers();

    const service = new NukeService();
    const serviceForSpy = service as unknown as { runDueSchedules: () => Promise<void> };
    const runDueSchedulesSpy = vi
      .spyOn(serviceForSpy, 'runDueSchedules')
      .mockResolvedValue(undefined);

    service.startSchedulerLoop(null, { pollIntervalMs: 30_000 });
    await Promise.resolve();

    expect(runDueSchedulesSpy).toHaveBeenCalledTimes(1);

    service.stopSchedulerLoop();
  });

  it('does not overlap scheduler polls while a run is still in flight', async () => {
    vi.useFakeTimers();

    const service = new NukeService();
    const serviceForSpy = service as unknown as { runDueSchedules: () => Promise<void> };

    let resolveRun: (() => void) | null = null;
    const runDueSchedulesSpy = vi
      .spyOn(serviceForSpy, 'runDueSchedules')
      .mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveRun = resolve;
          }),
      );

    service.startSchedulerLoop(null, { pollIntervalMs: 30_000 });
    await Promise.resolve();

    expect(runDueSchedulesSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(runDueSchedulesSpy).toHaveBeenCalledTimes(1);

    resolveRun?.();
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(runDueSchedulesSpy).toHaveBeenCalledTimes(2);

    service.stopSchedulerLoop();
  });
});

describe('NukeService access control', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('treats an empty authorized-user list as locked until a super admin activates the server', async () => {
    const service = new NukeService();
    const repository = (service as unknown as { nukeRepository: { listAuthorizedUsers: (input: unknown) => Promise<unknown[]> } })
      .nukeRepository;

    vi.spyOn(repository, 'listAuthorizedUsers').mockResolvedValue([]);

    const result = await service.getCommandAccessState({
      tenantId: 'tenant-1',
      guildId: 'guild-1',
      discordUserId: 'user-1',
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }

    expect(result.value).toEqual({
      locked: true,
      allowed: false,
      authorizedUserCount: 0,
    });
  });

  it('allows a Discord user when they are on the guild access list', async () => {
    const service = new NukeService();
    const repository = (service as unknown as { nukeRepository: { listAuthorizedUsers: (input: unknown) => Promise<unknown[]> } })
      .nukeRepository;

    vi.spyOn(repository, 'listAuthorizedUsers').mockResolvedValue([
      {
        id: 'auth-1',
        tenantId: 'tenant-1',
        guildId: 'guild-1',
        discordUserId: 'user-2',
        grantedByDiscordUserId: 'owner-1',
        createdAt: new Date('2026-03-17T12:00:00.000Z'),
        updatedAt: new Date('2026-03-17T12:00:00.000Z'),
      },
    ]);

    const result = await service.getCommandAccessState({
      tenantId: 'tenant-1',
      guildId: 'guild-1',
      discordUserId: 'user-2',
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }

    expect(result.value).toEqual({
      locked: true,
      allowed: true,
      authorizedUserCount: 1,
    });
  });

  it('can delete a channel without cloning and disables any stored schedule for that channel', async () => {
    const service = new NukeService();
    const repository = (
      service as unknown as {
        nukeRepository: {
          tryAcquireLock: (input: unknown) => Promise<boolean>;
          renewLockLease: (input: unknown) => Promise<boolean>;
          createRun: (input: unknown) => Promise<{ created: boolean; runId: string }>;
          markRunStarted: (runId: string) => Promise<void>;
          disableScheduleByChannel: (input: unknown) => Promise<boolean>;
          markRunSuccess: (input: unknown) => Promise<void>;
          releaseLock: (input: unknown) => Promise<void>;
        };
        fetchChannel: (channelId: string) => Promise<unknown>;
        cloneChannel: (channel: unknown) => Promise<unknown>;
        deleteChannel: (channelId: string) => Promise<void>;
      }
    ).nukeRepository;
    const serviceForSpy = service as unknown as {
      fetchChannel: (channelId: string) => Promise<unknown>;
      cloneChannel: (channel: unknown) => Promise<unknown>;
      deleteChannel: (channelId: string) => Promise<void>;
    };

    vi.spyOn(repository, 'tryAcquireLock').mockResolvedValue(true);
    vi.spyOn(repository, 'renewLockLease').mockResolvedValue(true);
    vi.spyOn(repository, 'createRun').mockResolvedValue({ created: true, runId: 'run-1' });
    vi.spyOn(repository, 'markRunStarted').mockResolvedValue(undefined);
    const disableScheduleByChannelSpy = vi
      .spyOn(repository, 'disableScheduleByChannel')
      .mockResolvedValue(true);
    const markRunSuccessSpy = vi.spyOn(repository, 'markRunSuccess').mockResolvedValue(undefined);
    vi.spyOn(repository, 'releaseLock').mockResolvedValue(undefined);
    vi.spyOn(serviceForSpy, 'fetchChannel').mockResolvedValue({
      id: 'channel-1',
      guild_id: 'guild-1',
      name: 'general',
      type: 0,
      parent_id: null,
    });
    const cloneChannelSpy = vi.spyOn(serviceForSpy, 'cloneChannel').mockResolvedValue({
      id: 'unused',
    });
    const deleteChannelSpy = vi.spyOn(serviceForSpy, 'deleteChannel').mockResolvedValue(undefined);

    const result = await service.runDeleteNow({
      tenantId: 'tenant-1',
      guildId: 'guild-1',
      channelId: 'channel-1',
      actorDiscordUserId: 'user-1',
      reason: 'manual',
      idempotencyKey: 'delete-1',
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }

    expect(deleteChannelSpy).toHaveBeenCalledWith('channel-1');
    expect(cloneChannelSpy).not.toHaveBeenCalled();
    expect(disableScheduleByChannelSpy).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      guildId: 'guild-1',
      channelId: 'channel-1',
      updatedByDiscordUserId: 'user-1',
    });
    expect(markRunSuccessSpy).toHaveBeenCalledWith({
      runId: 'run-1',
      oldChannelId: 'channel-1',
      newChannelId: null,
    });
    expect(result.value).toEqual({
      status: 'success',
      oldChannelId: 'channel-1',
      newChannelId: null,
      oldChannelDeleted: true,
      message:
        'Channel deleted successfully. No replacement channel was created. Any stored nuke schedule for this channel was disabled.',
    });
  });
});
