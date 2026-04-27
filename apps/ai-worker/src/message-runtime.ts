import {
  AiAccessService,
  AiAnswerService,
  AiConfigService,
  AiKnowledgeRepository,
  type AiAnswerResult,
  type AiAnswerConversationTurn,
  type AiReplyFrequency,
  type AiReplyMode,
  type AiRoleMode,
  type AiTonePreset,
} from '@voodoo/core';

const AI_CONVERSATION_TURN_LIMIT = 6;
const AI_CONVERSATION_MEMORY_WINDOW_MS = 30 * 60 * 1000;

export type AiRuntimeMessage = {
  id: string;
  guildId: string | null;
  channelId: string;
  author: {
    bot: boolean;
    id: string;
  };
  content: string;
  memberRoleIds: string[];
  parentChannelId?: string | null;
  parentCategoryId?: string | null;
};

export type AiRuntimeGuildState = {
  activated: boolean;
  enabled: boolean;
  tonePreset: AiTonePreset;
  toneInstructions: string;
  roleMode: AiRoleMode;
  defaultReplyMode: AiReplyMode;
  replyFrequency: AiReplyFrequency;
  unansweredLoggingEnabled: boolean;
  unansweredLogChannelId: string | null;
  replyChannels: Array<{
    channelId: string;
    replyMode: AiReplyMode;
  }>;
  replyChannelCategories: Array<{
    categoryId: string;
    replyMode: AiReplyMode;
  }>;
  roleIds: string[];
};

export type AiRuntimeReply = {
  kind: 'reply';
  replyMode: AiReplyMode;
  content: string;
};

export type AiRuntimeConversationTurn = AiAnswerConversationTurn;

export type AiRuntimeUnanswered = {
  kind: 'unanswered';
  guildId: string;
  logChannelId: string;
  sourceChannelId: string;
  authorId: string;
  messageId: string;
  question: string;
};

export type AiRuntimeResult =
  | { kind: 'ignored' }
  | { kind: 'failed'; message: string }
  | AiRuntimeReply
  | AiRuntimeUnanswered;

export type AiMessageRuntimeDependencies = {
  loadGuildState(input: { guildId: string }): Promise<AiRuntimeGuildState>;
  answerMessage(input: {
    guildId: string;
    question: string;
    tonePreset: AiTonePreset;
    toneInstructions: string;
    replyFrequency: AiReplyFrequency;
    conversationTurns?: AiRuntimeConversationTurn[];
  }): ReturnType<AiAnswerService['answerMessage']>;
  loadConversationTurns(input: {
    guildId: string;
    channelId: string;
    discordUserId: string;
  }): Promise<AiRuntimeConversationTurn[]>;
  saveConversationTurn(input: {
    guildId: string;
    channelId: string;
    discordUserId: string;
    userMessageId: string;
    botMessageId: string | null;
    userContent: string;
    botContent: string;
  }): Promise<void>;
};

function normalizeMessageContent(content: string): string {
  return content.trim();
}

function mapRuntimeError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'AI worker failed due to an internal error.';
}

function isRoleAllowed(input: {
  roleMode: AiRoleMode;
  allowedRoleIds: string[];
  memberRoleIds: string[];
}): boolean {
  if (input.allowedRoleIds.length === 0) {
    return true;
  }

  const matchedConfiguredRole = input.memberRoleIds.some((roleId) =>
    input.allowedRoleIds.includes(roleId),
  );

  return input.roleMode === 'allowlist' ? matchedConfiguredRole : !matchedConfiguredRole;
}

export function createAiMessageRuntimeDependencies(input?: {
  accessService?: AiAccessService;
  configService?: AiConfigService;
  answerService?: AiAnswerService;
  knowledgeRepository?: AiKnowledgeRepository;
}): AiMessageRuntimeDependencies {
  const accessService = input?.accessService ?? new AiAccessService();
  const configService = input?.configService ?? new AiConfigService();
  const answerService = input?.answerService ?? new AiAnswerService();
  const knowledgeRepository = input?.knowledgeRepository ?? new AiKnowledgeRepository();

  return {
    async loadGuildState({ guildId }) {
      const [activationResult, settingsResult] = await Promise.all([
        accessService.getGuildActivationState({ guildId }),
        configService.getGuildSettingsSnapshot({ guildId }),
      ]);

      if (activationResult.isErr()) {
        throw activationResult.error;
      }

      if (settingsResult.isErr()) {
        throw settingsResult.error;
      }

      return {
        activated: activationResult.value.activated,
        enabled: settingsResult.value.enabled,
        tonePreset: settingsResult.value.tonePreset,
        toneInstructions: settingsResult.value.toneInstructions,
        roleMode: settingsResult.value.roleMode,
        defaultReplyMode: settingsResult.value.defaultReplyMode,
        replyFrequency: settingsResult.value.replyFrequency,
        unansweredLoggingEnabled: settingsResult.value.unansweredLoggingEnabled,
        unansweredLogChannelId: settingsResult.value.unansweredLogChannelId,
        replyChannels: settingsResult.value.replyChannels,
        replyChannelCategories: settingsResult.value.replyChannelCategories,
        roleIds: settingsResult.value.roleIds,
      };
    },
    answerMessage({
      guildId,
      question,
      tonePreset,
      toneInstructions,
      replyFrequency,
      conversationTurns,
    }) {
      return answerService.answerMessage({
        guildId,
        question,
        tonePreset,
        toneInstructions,
        replyFrequency,
        conversationTurns,
      });
    },
    async loadConversationTurns({ guildId, channelId, discordUserId }) {
      const turns = await knowledgeRepository.listConversationTurns({
        guildId,
        channelId,
        discordUserId,
        since: new Date(Date.now() - AI_CONVERSATION_MEMORY_WINDOW_MS),
        limit: AI_CONVERSATION_TURN_LIMIT,
      });

      return turns.map((turn) => ({
        userContent: turn.userContent,
        botContent: turn.botContent,
      }));
    },
    async saveConversationTurn(input) {
      await knowledgeRepository.saveConversationTurn(input);
    },
  };
}

function resolveReplyMode(input: {
  state: AiRuntimeGuildState;
  channelId: string;
  parentChannelId?: string | null;
  parentCategoryId?: string | null;
}): AiReplyMode | null {
  const replyChannel = input.state.replyChannels.find(
    (channel) =>
      channel.channelId === input.channelId ||
      (input.parentChannelId ? channel.channelId === input.parentChannelId : false),
  );

  if (replyChannel) {
    return replyChannel.replyMode;
  }

  if (!input.parentCategoryId) {
    return null;
  }

  const replyChannelCategory = input.state.replyChannelCategories.find(
    (category) => category.categoryId === input.parentCategoryId,
  );

  return replyChannelCategory?.replyMode ?? null;
}

function mapAnswerToReply(input: {
  message: AiRuntimeMessage;
  question: string;
  state: AiRuntimeGuildState;
  replyMode: AiReplyMode;
  answer: AiAnswerResult;
}): AiRuntimeReply | AiRuntimeUnanswered | { kind: 'ignored' } {
  if (input.answer.kind === 'refusal') {
    if (input.state.unansweredLoggingEnabled && input.state.unansweredLogChannelId) {
      return {
        kind: 'unanswered',
        guildId: input.message.guildId ?? '',
        logChannelId: input.state.unansweredLogChannelId,
        sourceChannelId: input.message.channelId,
        authorId: input.message.author.id,
        messageId: input.message.id,
        question: input.question,
      };
    }

    return { kind: 'ignored' };
  }

  return {
    kind: 'reply',
    replyMode: input.replyMode,
    content: input.answer.content,
  };
}

export async function handleAiMessage(
  message: AiRuntimeMessage,
  dependencies: AiMessageRuntimeDependencies = createAiMessageRuntimeDependencies(),
): Promise<AiRuntimeResult> {
  const normalizedContent = normalizeMessageContent(message.content);
  if (message.author.bot || !message.guildId || normalizedContent.length === 0) {
    return { kind: 'ignored' };
  }

  let state: AiRuntimeGuildState;
  try {
    state = await dependencies.loadGuildState({ guildId: message.guildId });
  } catch (error) {
    return {
      kind: 'failed',
      message: mapRuntimeError(error),
    };
  }

  if (!state.activated || !state.enabled) {
    return { kind: 'ignored' };
  }

  const replyMode = resolveReplyMode({
    state,
    channelId: message.channelId,
    parentChannelId: message.parentChannelId,
    parentCategoryId: message.parentCategoryId,
  });
  if (!replyMode) {
    return { kind: 'ignored' };
  }

  if (
    !isRoleAllowed({
      roleMode: state.roleMode,
      allowedRoleIds: state.roleIds,
      memberRoleIds: message.memberRoleIds,
    })
  ) {
    return { kind: 'ignored' };
  }

  let conversationTurns: AiRuntimeConversationTurn[];
  try {
    conversationTurns = await dependencies.loadConversationTurns({
      guildId: message.guildId,
      channelId: message.channelId,
      discordUserId: message.author.id,
    });
  } catch (error) {
    return {
      kind: 'failed',
      message: mapRuntimeError(error),
    };
  }

  const answerResult = await dependencies.answerMessage({
    guildId: message.guildId,
    question: normalizedContent,
    tonePreset: state.tonePreset,
    toneInstructions: state.toneInstructions,
    replyFrequency: state.replyFrequency,
    conversationTurns,
  });

  if (answerResult.isErr()) {
    return {
      kind: 'failed',
      message: answerResult.error.message,
    };
  }

  return mapAnswerToReply({
    message,
    question: normalizedContent,
    state,
    replyMode,
    answer: answerResult.value,
  });
}
