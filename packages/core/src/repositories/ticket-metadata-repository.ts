import { and, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { getDb } from '../infra/db/client.js';
import { ticketChannelMetadata } from '../infra/db/schema/index.js';

export class TicketMetadataRepository {
  private readonly db = getDb();

  public async isTicketChannel(input: {
    tenantId: string;
    guildId: string;
    channelId: string;
  }): Promise<boolean> {
    const row = await this.db.query.ticketChannelMetadata.findFirst({
      where: and(
        eq(ticketChannelMetadata.tenantId, input.tenantId),
        eq(ticketChannelMetadata.guildId, input.guildId),
        eq(ticketChannelMetadata.channelId, input.channelId),
      ),
    });

    return row?.isTicket ?? false;
  }

  public async setTicketChannelFlag(input: {
    tenantId: string;
    guildId: string;
    channelId: string;
    isTicket: boolean;
  }): Promise<void> {
    const existing = await this.db.query.ticketChannelMetadata.findFirst({
      where: and(
        eq(ticketChannelMetadata.tenantId, input.tenantId),
        eq(ticketChannelMetadata.guildId, input.guildId),
        eq(ticketChannelMetadata.channelId, input.channelId),
      ),
    });

    if (existing) {
      await this.db
        .update(ticketChannelMetadata)
        .set({
          isTicket: input.isTicket,
          updatedAt: new Date(),
        })
        .where(eq(ticketChannelMetadata.id, existing.id));
      return;
    }

    await this.db.insert(ticketChannelMetadata).values({
      id: ulid(),
      tenantId: input.tenantId,
      guildId: input.guildId,
      channelId: input.channelId,
      isTicket: input.isTicket,
    });
  }
}
