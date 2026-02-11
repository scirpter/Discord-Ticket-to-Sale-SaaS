import { desc, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { getDb } from '../infra/db/client.js';
import { appSecrets, auditLogs, webhookEvents } from '../infra/db/schema/index.js';

export class AdminRepository {
  private readonly db = getDb();

  public async setAppSecret(input: { key: string; encryptedValue: string }): Promise<void> {
    const existing = await this.db.query.appSecrets.findFirst({
      where: eq(appSecrets.secretKey, input.key),
    });

    if (existing) {
      await this.db
        .update(appSecrets)
        .set({
          valueEncrypted: input.encryptedValue,
          rotatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(appSecrets.id, existing.id));
      return;
    }

    await this.db.insert(appSecrets).values({
      id: ulid(),
      secretKey: input.key,
      valueEncrypted: input.encryptedValue,
      rotatedAt: new Date(),
    });
  }

  public async getAppSecret(key: string): Promise<string | null> {
    const row = await this.db.query.appSecrets.findFirst({
      where: eq(appSecrets.secretKey, key),
    });

    return row?.valueEncrypted ?? null;
  }

  public async appendAuditLog(input: {
    tenantId: string | null;
    userId: string | null;
    actorDiscordUserId: string | null;
    action: string;
    resourceType: string;
    resourceId: string | null;
    correlationId: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    await this.db.insert(auditLogs).values({
      id: ulid(),
      tenantId: input.tenantId,
      userId: input.userId,
      actorDiscordUserId: input.actorDiscordUserId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      correlationId: input.correlationId,
      metadata: input.metadata,
    });
  }

  public async listAuditLogs(limit = 100): Promise<
    Array<{
      id: string;
      action: string;
      resourceType: string;
      resourceId: string | null;
      actorDiscordUserId: string | null;
      createdAt: Date;
      metadata: Record<string, unknown>;
    }>
  > {
    const rows = await this.db.query.auditLogs.findMany({
      orderBy: [desc(auditLogs.createdAt)],
      limit,
    });

    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      actorDiscordUserId: row.actorDiscordUserId,
      createdAt: row.createdAt,
      metadata: row.metadata,
    }));
  }

  public async listWebhookFailures(limit = 100): Promise<
    Array<{
      id: string;
      tenantId: string;
      providerDeliveryId: string;
      topic: string;
      failureReason: string | null;
      attemptCount: number;
      nextRetryAt: Date | null;
      createdAt: Date;
    }>
  > {
    const rows = await this.db.query.webhookEvents.findMany({
      where: eq(webhookEvents.status, 'failed'),
      orderBy: [desc(webhookEvents.createdAt)],
      limit,
    });

    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      providerDeliveryId: row.providerDeliveryId,
      topic: row.topic,
      failureReason: row.failureReason,
      attemptCount: row.attemptCount,
      nextRetryAt: row.nextRetryAt,
      createdAt: row.createdAt,
    }));
  }
}
