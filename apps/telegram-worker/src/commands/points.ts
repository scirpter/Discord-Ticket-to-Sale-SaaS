import { getEnv, PointsService, toTelegramScopedId } from '@voodoo/core';
import { InlineKeyboard, type Context } from 'grammy';

import {
  createTelegramPrivateHandoff,
  getTelegramPrivateHandoff,
  removeTelegramPrivateHandoff,
} from '../flows/private-handoff-store.js';
import {
  buildTelegramBotDeepLink,
  parseTelegramPointsStartPayload,
} from '../lib/sale-links.js';
import {
  getLinkedStoreForChat,
  isTelegramGroupChat,
  parseCommandArgs,
} from '../lib/telegram.js';

const env = getEnv();
const pointsService = new PointsService();
const pendingPointsLookups = new Map<string, { tenantId: string; guildId: string }>();

function getPendingPointsKey(chatId: number | string, userId: number): string {
  return `${chatId}:${userId}`;
}

function isTelegramPrivateChat(chatType: string | undefined): boolean {
  return chatType === 'private';
}

async function replyWithPoints(input: {
  ctx: Context;
  tenantId: string;
  guildId: string;
  email: string;
}): Promise<void> {
  const balance = await pointsService.getBalanceByEmail({
    tenantId: input.tenantId,
    guildId: input.guildId,
    email: input.email,
  });

  if (balance.isErr()) {
    await input.ctx.reply(balance.error.message);
    return;
  }

  await input.ctx.reply(
    [
      `Points for ${balance.value.emailDisplay}`,
      `Balance: ${balance.value.balancePoints} point(s)`,
      `Reserved: ${balance.value.reservedPoints} point(s)`,
      `Available: ${balance.value.availablePoints} point(s)`,
    ].join('\n'),
  );
}

export async function handlePointsStartCommand(ctx: Context): Promise<boolean> {
  if (!ctx.chat || !ctx.from || !isTelegramPrivateChat(ctx.chat.type)) {
    return false;
  }

  const payload =
    'match' in ctx && typeof (ctx as Context & { match?: unknown }).match === 'string'
      ? ((ctx as Context & { match?: string }).match ?? '').trim()
      : '';
  const handoffId = parseTelegramPointsStartPayload(payload);
  if (!handoffId) {
    return false;
  }

  const handoff = getTelegramPrivateHandoff(handoffId);
  if (!handoff || handoff.kind !== 'points') {
    await ctx.reply('This points lookup link expired. Run /points again in the Telegram group.');
    return true;
  }

  if (handoff.requesterTelegramUserId !== toTelegramScopedId(String(ctx.from.id))) {
    await ctx.reply('This private points link is only valid for the person who started it.');
    return true;
  }

  removeTelegramPrivateHandoff(handoff.id);
  pendingPointsLookups.set(getPendingPointsKey(ctx.chat.id, ctx.from.id), {
    tenantId: handoff.tenantId,
    guildId: handoff.guildId,
  });

  await ctx.reply('Private points lookup started. Send the customer email as your next message.');
  return true;
}

export async function handlePointsCommand(ctx: Context): Promise<void> {
  if (!ctx.chat || !ctx.from || !ctx.message || !('text' in ctx.message)) {
    return;
  }

  const pendingKey = getPendingPointsKey(ctx.chat.id, ctx.from.id);
  const commandText = ctx.message.text ?? '';
  const args = parseCommandArgs(commandText);
  const email = args[0]?.trim() ?? '';

  if (isTelegramPrivateChat(ctx.chat.type)) {
    const pending = pendingPointsLookups.get(pendingKey);
    if (!pending) {
      await ctx.reply('Start /points in a linked Telegram group first. The bot will then continue privately here.');
      return;
    }

    if (!email) {
      await ctx.reply('Send the customer email as your next message to check their points balance.');
      return;
    }

    pendingPointsLookups.delete(pendingKey);
    await replyWithPoints({
      ctx,
      tenantId: pending.tenantId,
      guildId: pending.guildId,
      email,
    });
    return;
  }

  if (!isTelegramGroupChat(ctx.chat.type)) {
    await ctx.reply('Use /points inside a linked Telegram group. The bot will continue in DM.');
    return;
  }

  const linkedStore = await getLinkedStoreForChat(String(ctx.chat.id));
  if (!linkedStore) {
    await ctx.reply('This Telegram chat is not linked to a store yet.');
    return;
  }

  const handoff = createTelegramPrivateHandoff({
    kind: 'points',
    tenantId: linkedStore.tenantId,
    guildId: linkedStore.guildId,
    requesterTelegramUserId: toTelegramScopedId(String(ctx.from.id)),
  });

  let continueUrl: string;
  try {
    continueUrl = buildTelegramBotDeepLink(env.TELEGRAM_BOT_USERNAME, `points_${handoff.id}`);
  } catch (error) {
    removeTelegramPrivateHandoff(handoff.id);
    await ctx.reply(error instanceof Error ? error.message : 'TELEGRAM_BOT_USERNAME is required for private points lookups.');
    return;
  }

  await ctx.reply(
    'Points lookups are handled in DM so only you can see the email and balance.',
    {
      reply_markup: new InlineKeyboard().url('Continue in DM', continueUrl),
    },
  );
}

export async function handlePendingPointsMessage(ctx: Context): Promise<boolean> {
  if (!ctx.chat || !ctx.from || !ctx.message || !('text' in ctx.message) || !isTelegramPrivateChat(ctx.chat.type)) {
    return false;
  }

  const pendingKey = getPendingPointsKey(ctx.chat.id, ctx.from.id);
  const pending = pendingPointsLookups.get(pendingKey);
  if (!pending) {
    return false;
  }

  const messageText = ctx.message.text?.trim() ?? '';
  if (!messageText) {
    await ctx.reply('Email cannot be empty. Send the customer email again.');
    return true;
  }

  pendingPointsLookups.delete(pendingKey);
  await replyWithPoints({
    ctx,
    tenantId: pending.tenantId,
    guildId: pending.guildId,
    email: messageText,
  });
  return true;
}
