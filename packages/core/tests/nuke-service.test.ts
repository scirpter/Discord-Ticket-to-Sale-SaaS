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

  it('treats an empty authorized-user list as unlocked', async () => {
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
      locked: false,
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
});
