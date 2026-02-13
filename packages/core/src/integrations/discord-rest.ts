import { AppError } from '../domain/errors.js';

export async function postMessageToDiscordChannel(input: {
  botToken: string;
  channelId: string;
  content: string;
}): Promise<void> {
  const response = await fetch(`https://discord.com/api/v10/channels/${input.channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${input.botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: input.content,
      allowed_mentions: {
        parse: [],
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new AppError(
      'DISCORD_LOG_POST_FAILED',
      `Failed to post paid-order log message (${response.status})`,
      502,
      { body, discordStatus: response.status },
    );
  }
}
