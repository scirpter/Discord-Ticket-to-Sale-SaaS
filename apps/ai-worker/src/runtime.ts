import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  GatewayIntentBits,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type AnyThreadChannel,
  type Client,
  type ClientOptions,
  type Interaction,
  type Message,
} from 'discord.js';
import {
  AiKnowledgeRepository,
  AiKnowledgeManagementService,
  logger,
  type AiReplyMode,
} from '@voodoo/core';

import {
  createAiMessageRuntimeDependencies,
  handleAiMessage,
  type AiMessageRuntimeDependencies,
  type AiRuntimeUnanswered,
} from './message-runtime.js';

export const AI_UNANSWERED_ADD_QA_CUSTOM_ID = 'ai:unanswered:add-qa';
export const AI_UNANSWERED_MODAL_CUSTOM_ID = 'ai:unanswered:qa-submit';
export const AI_ANSWER_MARK_WRONG_CUSTOM_ID_PREFIX = 'ai:answer:wrong:';
export const AI_ANSWER_CORRECTION_MODAL_CUSTOM_ID_PREFIX = 'ai:answer:correction-submit:';
const AI_UNANSWERED_QUESTION_FIELD_ID = 'question';
const AI_UNANSWERED_ANSWER_FIELD_ID = 'answer';

type AiAnswerCorrectionRef = {
  channelId: string;
  messageId: string;
};

type AiAnswerCorrectionContext = {
  question: string;
};

type AiAnswerCorrectionContextStore = {
  saveContext(input: {
    guildId: string;
    sourceChannelId: string;
    sourceMessageId: string;
    question: string;
  }): Promise<void>;
  getContext(input: {
    guildId: string;
    sourceChannelId: string;
    sourceMessageId: string;
  }): Promise<AiAnswerCorrectionContext | null>;
};

type AiWorkerRuntimeDependencies = {
  correctionContextStore?: AiAnswerCorrectionContextStore;
};

type AiAnswerCorrectionBackingRepository = {
  saveAnswerCorrectionContext(input: {
    guildId: string;
    sourceChannelId: string;
    sourceMessageId: string;
    question: string;
  }): Promise<void>;
  getAnswerCorrectionContext(input: {
    guildId: string;
    sourceChannelId: string;
    sourceMessageId: string;
  }): Promise<AiAnswerCorrectionContext | null>;
};

function createDefaultAnswerCorrectionContextStore(): AiAnswerCorrectionContextStore {
  const repository = new AiKnowledgeRepository() as unknown as AiAnswerCorrectionBackingRepository;

  return {
    saveContext(input) {
      return repository.saveAnswerCorrectionContext(input);
    },
    getContext(input) {
      return repository.getAnswerCorrectionContext(input);
    },
  };
}

export function createAiClientOptions(): ClientOptions {
  return {
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  };
}

export function mapAiWorkerError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'AI worker failed due to an internal error.';
}

type PermissionRequirement = {
  bit: bigint;
  name: string;
};

function isThreadChannel(channel: Message['channel']): channel is AnyThreadChannel {
  return 'isThread' in channel && typeof channel.isThread === 'function' && channel.isThread();
}

function getParentCategoryId(message: Message): string | null {
  if (isThreadChannel(message.channel)) {
    return message.channel.parent && 'parentId' in message.channel.parent
      ? message.channel.parent.parentId
      : null;
  }

  return 'parentId' in message.channel ? message.channel.parentId : null;
}

function getParentChannelId(message: Message): string | null {
  if (isThreadChannel(message.channel)) {
    return 'parentId' in message.channel ? message.channel.parentId : null;
  }

  return null;
}

function getRequiredPermissions(message: Message, replyMode: AiReplyMode): PermissionRequirement[] {
  const required: PermissionRequirement[] = [
    { bit: PermissionFlagsBits.ViewChannel, name: 'ViewChannel' },
  ];

  if (isThreadChannel(message.channel)) {
    required.push({
      bit: PermissionFlagsBits.SendMessagesInThreads,
      name: 'SendMessagesInThreads',
    });
    return required;
  }

  required.push({
    bit: PermissionFlagsBits.SendMessages,
    name: 'SendMessages',
  });

  if (replyMode === 'thread') {
    required.push(
      {
        bit: PermissionFlagsBits.CreatePublicThreads,
        name: 'CreatePublicThreads',
      },
      {
        bit: PermissionFlagsBits.SendMessagesInThreads,
        name: 'SendMessagesInThreads',
      },
    );
  }

  return required;
}

function getMissingPermissions(message: Message, replyMode: AiReplyMode): string[] {
  const clientUser = message.client.user;
  if (!clientUser) {
    return getRequiredPermissions(message, replyMode).map(({ name }) => name);
  }

  const permissions =
    'permissionsFor' in message.channel ? message.channel.permissionsFor(clientUser) : null;
  if (!permissions) {
    return getRequiredPermissions(message, replyMode).map(({ name }) => name);
  }

  return getRequiredPermissions(message, replyMode)
    .filter(({ bit }) => !permissions.has(bit))
    .map(({ name }) => name);
}

function truncateModalValue(value: string): string {
  return value.length > 4000 ? value.slice(0, 4000) : value;
}

function parseAnswerCorrectionRef(customId: string, prefix: string): AiAnswerCorrectionRef | null {
  if (!customId.startsWith(prefix)) {
    return null;
  }

  const [channelId, messageId] = customId.slice(prefix.length).split(':');
  if (!channelId || !messageId) {
    return null;
  }

  return { channelId, messageId };
}

function hasAdministratorPermission(interaction: Interaction): boolean {
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
}

function extractQuestionFromUnansweredLog(interaction: Interaction): string | null {
  if (!interaction.isButton()) {
    return null;
  }

  const field = interaction.message.embeds[0]?.fields.find((embedField) => embedField.name === 'Question');
  const value = field?.value.trim();
  return value && value.length > 0 ? value : null;
}

function buildUnansweredLogPayload(result: AiRuntimeUnanswered) {
  const embed = new EmbedBuilder()
    .setTitle('Unanswered AI question')
    .setDescription('No approved answer was available for this message.')
    .addFields(
      { name: 'Question', value: result.question.slice(0, 1024) },
      { name: 'Source', value: `<#${result.sourceChannelId}>`, inline: true },
      { name: 'Asked by', value: `<@${result.authorId}>`, inline: true },
      { name: 'Message ID', value: result.messageId, inline: true },
    )
    .setTimestamp(new Date());

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(AI_UNANSWERED_ADD_QA_CUSTOM_ID)
      .setLabel('Add Q&A')
      .setStyle(ButtonStyle.Primary),
  );

  return {
    embeds: [embed],
    components: [row],
  };
}

function buildCompletedUnansweredLogComponents() {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(AI_UNANSWERED_ADD_QA_CUSTOM_ID)
      .setLabel('Reply created')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
  );

  return [row];
}

function buildAnswerCorrectionComponents(ref: AiAnswerCorrectionRef) {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${AI_ANSWER_MARK_WRONG_CUSTOM_ID_PREFIX}${ref.channelId}:${ref.messageId}`)
      .setLabel('Mark wrong')
      .setStyle(ButtonStyle.Secondary),
  );

  return [row];
}

function buildCompletedAnswerCorrectionComponents(ref: AiAnswerCorrectionRef) {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${AI_ANSWER_MARK_WRONG_CUSTOM_ID_PREFIX}${ref.channelId}:${ref.messageId}`)
      .setLabel('Correction saved')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
  );

  return [row];
}

function buildAiAnswerPayload(input: { content: string; ref: AiAnswerCorrectionRef }) {
  return {
    content: input.content,
    components: buildAnswerCorrectionComponents(input.ref),
  };
}

async function postUnansweredLog(client: Client, result: AiRuntimeUnanswered): Promise<void> {
  try {
    const channel = await client.channels.fetch(result.logChannelId);
    if (!channel || !('send' in channel)) {
      logger.warn(
        {
          guildId: result.guildId,
          logChannelId: result.logChannelId,
          messageId: result.messageId,
        },
        'ai-worker unanswered log channel is unavailable',
      );
      return;
    }

    await (channel as { send(input: ReturnType<typeof buildUnansweredLogPayload>): Promise<unknown> }).send(
      buildUnansweredLogPayload(result),
    );
  } catch (error) {
    logger.warn(
      {
        err: error,
        guildId: result.guildId,
        logChannelId: result.logChannelId,
        messageId: result.messageId,
      },
      'ai-worker failed to post unanswered log',
    );
  }
}

function buildAddQaModal(question: string): ModalBuilder {
  const questionInput = new TextInputBuilder()
    .setCustomId(AI_UNANSWERED_QUESTION_FIELD_ID)
    .setLabel('Question')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setValue(truncateModalValue(question));

  const answerInput = new TextInputBuilder()
    .setCustomId(AI_UNANSWERED_ANSWER_FIELD_ID)
    .setLabel('Answer')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  return new ModalBuilder()
    .setCustomId(AI_UNANSWERED_MODAL_CUSTOM_ID)
    .setTitle('Add AI Q&A')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(questionInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(answerInput),
    );
}

function buildAnswerCorrectionModal(input: {
  ref: AiAnswerCorrectionRef;
  question?: string | null;
}): ModalBuilder {
  const questionInput = new TextInputBuilder()
    .setCustomId(AI_UNANSWERED_QUESTION_FIELD_ID)
    .setLabel('Question')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setPlaceholder('Leave blank to use the original message.');

  if (input.question) {
    questionInput.setValue(truncateModalValue(input.question));
  }

  const answerInput = new TextInputBuilder()
    .setCustomId(AI_UNANSWERED_ANSWER_FIELD_ID)
    .setLabel('Right answer')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  return new ModalBuilder()
    .setCustomId(
      `${AI_ANSWER_CORRECTION_MODAL_CUSTOM_ID_PREFIX}${input.ref.channelId}:${input.ref.messageId}`,
    )
    .setTitle('Correct AI answer')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(questionInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(answerInput),
    );
}

async function fetchOriginalMessageQuestion(
  interaction: Interaction,
  ref: AiAnswerCorrectionRef,
): Promise<string | null> {
  try {
    const channel = await interaction.client.channels.fetch(ref.channelId);
    if (!channel || !('messages' in channel)) {
      return null;
    }

    const message = await channel.messages.fetch(ref.messageId);
    const content = typeof message.content === 'string' ? message.content.trim() : '';
    return content.length > 0 ? content : null;
  } catch (error) {
    logger.warn(
      {
        err: error,
        channelId: ref.channelId,
        messageId: ref.messageId,
      },
      'ai-worker failed to fetch original message for answer correction',
    );
    return null;
  }
}

async function loadStoredAnswerCorrectionQuestion(input: {
  guildId: string;
  ref: AiAnswerCorrectionRef;
  correctionContextStore: AiAnswerCorrectionContextStore;
}): Promise<string | null> {
  try {
    const context = await input.correctionContextStore.getContext({
      guildId: input.guildId,
      sourceChannelId: input.ref.channelId,
      sourceMessageId: input.ref.messageId,
    });

    return context?.question ?? null;
  } catch (error) {
    logger.warn(
      {
        err: error,
        guildId: input.guildId,
        channelId: input.ref.channelId,
        messageId: input.ref.messageId,
      },
      'ai-worker failed to load answer correction context',
    );
    return null;
  }
}

async function saveAnswerCorrectionContext(input: {
  message: Message;
  question: string;
  correctionContextStore?: AiAnswerCorrectionContextStore;
}): Promise<void> {
  if (!input.message.guildId) {
    return;
  }

  const question = input.question.trim();
  if (!question) {
    return;
  }

  try {
    await (input.correctionContextStore ?? createDefaultAnswerCorrectionContextStore()).saveContext({
      guildId: input.message.guildId,
      sourceChannelId: input.message.channelId,
      sourceMessageId: input.message.id,
      question,
    });
  } catch (error) {
    logger.warn(
      {
        err: error,
        guildId: input.message.guildId,
        channelId: input.message.channelId,
        messageId: input.message.id,
      },
      'ai-worker failed to store answer correction context',
    );
  }
}

function extractSentMessageId(sentMessage: unknown): string | null {
  if (!sentMessage || typeof sentMessage !== 'object' || !('id' in sentMessage)) {
    return null;
  }

  const messageId = (sentMessage as { id?: unknown }).id;
  return typeof messageId === 'string' && messageId.trim().length > 0 ? messageId : null;
}

async function saveConversationTurnAfterReply(input: {
  message: Message;
  conversationChannelId?: string;
  botMessageId: string | null;
  botContent: string;
  dependencies: AiMessageRuntimeDependencies;
}): Promise<void> {
  if (!input.message.guildId) {
    return;
  }

  const userContent = input.message.content.trim();
  if (!userContent || !input.botContent.trim()) {
    return;
  }

  try {
    await input.dependencies.saveConversationTurn({
      guildId: input.message.guildId,
      channelId: input.conversationChannelId ?? input.message.channelId,
      discordUserId: input.message.author.id,
      userMessageId: input.message.id,
      botMessageId: input.botMessageId,
      userContent,
      botContent: input.botContent,
    });
  } catch (error) {
    logger.warn(
      {
        err: error,
        guildId: input.message.guildId,
        channelId: input.message.channelId,
        messageId: input.message.id,
      },
      'ai-worker failed to store conversation turn',
    );
  }
}

type AiCustomQaCreator = Pick<AiKnowledgeManagementService, 'createCustomQa'>;

export async function handleAiUnansweredLearningInteraction(
  interaction: Interaction,
  knowledgeService: AiCustomQaCreator = new AiKnowledgeManagementService(),
  correctionContextStore: AiAnswerCorrectionContextStore = createDefaultAnswerCorrectionContextStore(),
): Promise<boolean> {
  if (
    interaction.isButton() &&
    interaction.customId.startsWith(AI_ANSWER_MARK_WRONG_CUSTOM_ID_PREFIX)
  ) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: 'This correction action can only be used inside a server.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (!hasAdministratorPermission(interaction)) {
      await interaction.reply({
        content: 'You need the Discord Administrator permission to correct AI answers.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const ref = parseAnswerCorrectionRef(
      interaction.customId,
      AI_ANSWER_MARK_WRONG_CUSTOM_ID_PREFIX,
    );
    if (!ref) {
      await interaction.reply({
        content: 'This correction button is missing its original message reference.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const question = await loadStoredAnswerCorrectionQuestion({
      guildId: interaction.guildId,
      ref,
      correctionContextStore,
    });

    await interaction.showModal(buildAnswerCorrectionModal({ ref, question }));
    return true;
  }

  if (interaction.isButton() && interaction.customId === AI_UNANSWERED_ADD_QA_CUSTOM_ID) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: 'This Q&A action can only be used inside a server.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (!hasAdministratorPermission(interaction)) {
      await interaction.reply({
        content: 'You need the Discord Administrator permission to add AI Q&A entries.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const question = extractQuestionFromUnansweredLog(interaction);
    if (!question) {
      await interaction.reply({
        content: 'This unanswered item is missing its original question. Add the Q&A from the dashboard instead.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    await interaction.showModal(buildAddQaModal(question));
    return true;
  }

  if (
    interaction.isModalSubmit() &&
    interaction.customId.startsWith(AI_ANSWER_CORRECTION_MODAL_CUSTOM_ID_PREFIX)
  ) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: 'This correction action can only be used inside a server.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (!hasAdministratorPermission(interaction)) {
      await interaction.reply({
        content: 'You need the Discord Administrator permission to correct AI answers.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const ref = parseAnswerCorrectionRef(
      interaction.customId,
      AI_ANSWER_CORRECTION_MODAL_CUSTOM_ID_PREFIX,
    );
    if (!ref) {
      await interaction.reply({
        content: 'This correction modal is missing its original message reference.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    const submittedQuestion = interaction.fields
      .getTextInputValue(AI_UNANSWERED_QUESTION_FIELD_ID)
      .trim();
    const question =
      submittedQuestion.length > 0 ? submittedQuestion : await fetchOriginalMessageQuestion(interaction, ref);

    if (!question) {
      await interaction.editReply({
        content: 'Original question could not be loaded. Submit again and fill the Question field.',
      });
      return true;
    }

    const result = await knowledgeService.createCustomQa({
      guildId: interaction.guildId,
      question,
      answer: interaction.fields.getTextInputValue(AI_UNANSWERED_ANSWER_FIELD_ID),
      actorDiscordUserId: interaction.user.id,
    });

    if (result.isErr()) {
      await interaction.editReply({
        content: result.error.message,
      });
      return true;
    }

    await interaction.editReply({
      content: 'Correction saved. Future matching questions can use this answer.',
    });

    if (interaction.isFromMessage?.()) {
      try {
        await interaction.message.edit({
          components: buildCompletedAnswerCorrectionComponents(ref),
        });
      } catch (error) {
        logger.warn(
          {
            err: error,
            guildId: interaction.guildId,
            messageId: interaction.message.id,
          },
          'ai-worker failed to mark answer correction as saved',
        );
      }
    }

    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId === AI_UNANSWERED_MODAL_CUSTOM_ID) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: 'This Q&A action can only be used inside a server.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const result = await knowledgeService.createCustomQa({
      guildId: interaction.guildId,
      question: interaction.fields.getTextInputValue(AI_UNANSWERED_QUESTION_FIELD_ID),
      answer: interaction.fields.getTextInputValue(AI_UNANSWERED_ANSWER_FIELD_ID),
      actorDiscordUserId: interaction.user.id,
    });

    if (result.isErr()) {
      await interaction.reply({
        content: result.error.message,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    await interaction.reply({
      content: 'AI Q&A saved. Future matching questions can use this answer.',
      flags: MessageFlags.Ephemeral,
    });

    if (interaction.isFromMessage?.()) {
      try {
        await interaction.message.edit({
          components: buildCompletedUnansweredLogComponents(),
        });
      } catch (error) {
        logger.warn(
          {
            err: error,
            guildId: interaction.guildId,
            messageId: interaction.message.id,
          },
          'ai-worker failed to mark unanswered log reply as created',
        );
      }
    }

    return true;
  }

  return false;
}

export async function processIncomingMessage(
  client: Client,
  message: Message,
  dependencies?: AiMessageRuntimeDependencies,
  runtimeDependencies?: AiWorkerRuntimeDependencies,
): Promise<void> {
  const messageRuntimeDependencies = dependencies ?? createAiMessageRuntimeDependencies();
  const result = await handleAiMessage(
    {
      id: message.id,
      guildId: message.guildId ?? null,
      channelId: message.channelId,
      parentChannelId: getParentChannelId(message),
      parentCategoryId: getParentCategoryId(message),
      author: { bot: message.author.bot, id: message.author.id },
      content: message.content,
      memberRoleIds: message.member?.roles.cache.map((role) => role.id) ?? [],
    },
    messageRuntimeDependencies,
  );

  if (result.kind === 'ignored') {
    return;
  }

  if (result.kind === 'failed') {
    logger.warn(
      {
        guildId: message.guildId,
        channelId: message.channelId,
        messageId: message.id,
        errorMessage: result.message,
      },
      'ai-worker passive message handling failed',
    );
    return;
  }

  if (result.kind === 'unanswered') {
    await postUnansweredLog(client, result);
    return;
  }

  const missingPermissions = getMissingPermissions(message, result.replyMode);
  if (missingPermissions.length > 0) {
    logger.warn(
      {
        guildId: message.guildId,
        channelId: message.channelId,
        messageId: message.id,
        replyMode: result.replyMode,
        missingPermissions,
      },
      'ai-worker missing Discord permissions for passive reply',
    );
    return;
  }

  if (result.replyMode === 'thread') {
    const thread = isThreadChannel(message.channel)
      ? message.channel
      : await message.startThread({ name: `ai-${message.id}` });
    const sentMessage = await thread.send(
      buildAiAnswerPayload({
        content: result.content,
        ref: { channelId: message.channelId, messageId: message.id },
      }),
    );
    await saveAnswerCorrectionContext({
      message,
      question: message.content,
      correctionContextStore: runtimeDependencies?.correctionContextStore,
    });
    await saveConversationTurnAfterReply({
      message,
      conversationChannelId: thread.id,
      botMessageId: extractSentMessageId(sentMessage),
      botContent: result.content,
      dependencies: messageRuntimeDependencies,
    });
    return;
  }

  const sentMessage = await message.reply(
    buildAiAnswerPayload({
      content: result.content,
      ref: { channelId: message.channelId, messageId: message.id },
    }),
  );
  await saveAnswerCorrectionContext({
    message,
    question: message.content,
    correctionContextStore: runtimeDependencies?.correctionContextStore,
  });
  await saveConversationTurnAfterReply({
    message,
    botMessageId: extractSentMessageId(sentMessage),
    botContent: result.content,
    dependencies: messageRuntimeDependencies,
  });
}
