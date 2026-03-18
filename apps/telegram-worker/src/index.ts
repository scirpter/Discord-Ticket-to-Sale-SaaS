import { getEnv, logger } from '@voodoo/core';
import { Bot } from 'grammy';

import { handleConnectCommand } from './commands/connect.js';
import { handlePaidOrderFulfillmentCallback } from './commands/paid-order-fulfillment.js';
import {
  handlePointsCommand,
  handlePendingPointsMessage,
  handlePointsStartCommand,
} from './commands/points.js';
import {
  handleReferCommand,
  handlePendingReferMessage,
  handleReferStartCommand,
} from './commands/refer.js';
import {
  handleSaleCallbackQuery,
  handleSaleCommand,
  handleSaleStartCommand,
  handleSaleTextMessage,
} from './commands/sale.js';

const env = getEnv();

if (!env.TELEGRAM_BOT_TOKEN.trim()) {
  throw new Error('TELEGRAM_BOT_TOKEN is required to start telegram-worker.');
}

const bot = new Bot(env.TELEGRAM_BOT_TOKEN.trim());

bot.catch((error) => {
  logger.error({ err: error.error, update: error.ctx.update }, 'telegram-worker update failed');
});

bot.command('start', async (ctx) => {
  if (await handleSaleStartCommand(ctx)) {
    return;
  }
  if (await handlePointsStartCommand(ctx)) {
    return;
  }
  if (await handleReferStartCommand(ctx)) {
    return;
  }

  await ctx.reply(
    [
      'Telegram commerce bot is online.',
      'Commands:',
      '/connect <token> - Link this Telegram group to a dashboard store',
      '/sale - Start the sale in the group, then continue privately in DM',
      '/points - Start a private points lookup from the linked group',
      '/refer - Start a private referral submission from the linked group',
    ].join('\n'),
  );
});

bot.command('connect', async (ctx) => {
  await handleConnectCommand(ctx);
});

bot.command('sale', async (ctx) => {
  await handleSaleCommand(ctx);
});

bot.command('points', async (ctx) => {
  await handlePointsCommand(ctx);
});

bot.command('refer', async (ctx) => {
  await handleReferCommand(ctx);
});

bot.on('callback_query:data', async (ctx) => {
  if (await handleSaleCallbackQuery(ctx)) return;
  if (await handlePaidOrderFulfillmentCallback(ctx)) return;
  await ctx.answerCallbackQuery({ text: 'Unknown action.', show_alert: true });
});

bot.on('message:text', async (ctx) => {
  if (ctx.message.text.trim().startsWith('/')) return;
  if (await handleSaleTextMessage(ctx)) return;
  if (await handlePendingReferMessage(ctx)) return;
  await handlePendingPointsMessage(ctx);
});

void bot.api
  .setMyCommands([
    { command: 'connect', description: 'Link this Telegram group to a dashboard store' },
    { command: 'sale', description: 'Start the sale in the group, then continue in DM' },
    { command: 'points', description: 'Check customer points privately in DM' },
    { command: 'refer', description: 'Submit a referral privately in DM' },
  ])
  .catch((error) => {
    logger.warn({ err: error }, 'failed to register Telegram commands');
  });

void bot.start({
  onStart: (botInfo) => {
    logger.info({ botUser: botInfo.username }, 'telegram-worker ready');
  },
});
