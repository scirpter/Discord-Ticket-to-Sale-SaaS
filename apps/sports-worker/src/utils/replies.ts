import { MessageFlags, type ChatInputCommandInteraction, type InteractionReplyOptions } from 'discord.js';

type EphemeralPayload = {
  content: string;
};

function toReplyOptions(payload: EphemeralPayload): InteractionReplyOptions {
  return {
    content: payload.content,
    flags: MessageFlags.Ephemeral,
  };
}

export async function deferEphemeralReply(interaction: ChatInputCommandInteraction): Promise<void> {
  if (interaction.deferred || interaction.replied) {
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
}

export async function sendEphemeralReply(
  interaction: ChatInputCommandInteraction,
  content: string,
): Promise<void> {
  const payload = toReplyOptions({ content });

  if (interaction.deferred) {
    await interaction.editReply({ content: payload.content });
    return;
  }

  if (interaction.replied) {
    await interaction.followUp(payload);
    return;
  }

  await interaction.reply(payload);
}
