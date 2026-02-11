import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type Interaction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { ProductRepository, SaleService, TenantRepository } from '@voodoo/core';

import { getSaleDraft, removeSaleDraft, updateSaleDraft } from '../flows/sale-draft-store.js';
import { sendCheckoutMessage, startSaleFlowFromButton } from './sale-flow.js';

const productRepository = new ProductRepository();
const saleService = new SaleService();

function buildFormModal(
  draftId: string,
  productFields: Array<{
    fieldKey: string;
    label: string;
    required: boolean;
    fieldType: 'short_text' | 'long_text' | 'email' | 'number';
    validation: Record<string, unknown> | null;
  }>,
  existingAnswers: Record<string, string>,
): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(`sale:modal:${draftId}`).setTitle('Customer Details');

  for (const field of productFields) {
    const validation = field.validation ?? {};
    const input = new TextInputBuilder()
      .setCustomId(field.fieldKey)
      .setLabel(field.label.slice(0, 45))
      .setRequired(field.required)
      .setStyle(field.fieldType === 'long_text' ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setMaxLength(
        typeof validation.maxLength === 'number' ? Math.max(1, Number(validation.maxLength)) : 1000,
      );

    if (typeof validation.minLength === 'number') {
      input.setMinLength(Math.max(0, Number(validation.minLength)));
    }

    const existing = existingAnswers[field.fieldKey];
    if (existing) {
      input.setValue(existing);
    }

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  }

  return modal;
}

async function finalizeDraft(interaction: ModalSubmitInteraction, draftId: string): Promise<void> {
  const draft = getSaleDraft(draftId);
  if (!draft || !draft.productId || !draft.variantId || !interaction.channel || !interaction.inGuild()) {
    await interaction.editReply({
      content: 'Sale draft expired. Please start again with `/sale`.',
    });
    return;
  }

  const created = await saleService.createSaleSessionFromBot({
    tenantId: draft.tenantId,
    guildId: draft.guildId,
    ticketChannelId: draft.ticketChannelId,
    staffDiscordUserId: draft.staffDiscordUserId,
    customerDiscordUserId: draft.customerDiscordUserId,
    productId: draft.productId,
    variantId: draft.variantId,
    answers: draft.answers,
  });

  if (created.isErr()) {
    await interaction.editReply({ content: created.error.message });
    return;
  }

  removeSaleDraft(draftId);

  await sendCheckoutMessage(interaction.channel as any, {
    checkoutUrl: created.value.checkoutUrl,
    orderSessionId: created.value.orderSessionId,
    customerDiscordUserId: draft.customerDiscordUserId,
  });

  await interaction.editReply({
    content: `Checkout link generated. Order session: \`${created.value.orderSessionId}\``,
  });
}

export async function handleSaleSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const [, , draftId] = interaction.customId.split(':');
  if (!draftId) {
    await interaction.update({ content: 'Invalid sale draft.', components: [] });
    return;
  }

  const draft = getSaleDraft(draftId);
  if (!draft) {
    await interaction.update({
      content: 'Sale draft expired. Start `/sale` again.',
      components: [],
    });
    return;
  }

  const [productId, variantId] = (interaction.values[0] ?? '').split('|');
  if (!productId || !variantId) {
    await interaction.update({
      content: 'Invalid product selection. Start `/sale` again.',
      components: [],
    });
    return;
  }

  const product = await productRepository.getById({
    tenantId: draft.tenantId,
    guildId: draft.guildId,
    productId,
  });

  if (!product) {
    await interaction.update({
      content: 'Product not found. Please restart `/sale`.',
      components: [],
    });
    return;
  }

  if (product.formFields.length > 5) {
    await interaction.update({
      content:
        'This product has more than 5 form fields. Current modal flow supports up to 5 fields per sale.',
      components: [],
    });
    return;
  }

  draft.productId = productId;
  draft.variantId = variantId;
  updateSaleDraft(draft);

  const modal = buildFormModal(draft.id, product.formFields, draft.answers);
  await interaction.showModal(modal);
}

export async function handleSaleModal(interaction: ModalSubmitInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const [, , draftId] = interaction.customId.split(':');
  if (!draftId) {
    await interaction.editReply({ content: 'Invalid sale draft.' });
    return;
  }

  const draft = getSaleDraft(draftId);
  if (!draft || !draft.productId) {
    await interaction.editReply({
      content: 'Sale draft expired. Start `/sale` again.',
    });
    return;
  }

  const product = await productRepository.getById({
    tenantId: draft.tenantId,
    guildId: draft.guildId,
    productId: draft.productId,
  });

  if (!product) {
    await interaction.editReply({
      content: 'Product not found. Restart `/sale`.',
    });
    return;
  }

  for (const field of product.formFields) {
    const value = interaction.fields.getTextInputValue(field.fieldKey);
    draft.answers[field.fieldKey] = value;
  }

  updateSaleDraft(draft);

  await finalizeDraft(interaction, draft.id);
}

export async function handleSaleCancel(interaction: Interaction): Promise<void> {
  if (!interaction.isButton() || !interaction.inGuild() || !interaction.guildId || !interaction.channel) {
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const tenantRepo = new TenantRepository();
  const tenant = await tenantRepo.getTenantByGuildId(interaction.guildId);
  if (!tenant) {
    await interaction.editReply({
      content: 'No tenant is connected for this guild.',
    });
    return;
  }

  const cancelled = await saleService.cancelLatestPendingSession({
    tenantId: tenant.tenantId,
    guildId: interaction.guildId,
    ticketChannelId: interaction.channel.id,
  });

  if (cancelled.isErr()) {
    await interaction.editReply({
      content: cancelled.error.message,
    });
    return;
  }

  await interaction.editReply({
    content: `Cancelled pending sale session: \`${cancelled.value.orderSessionId}\``,
  });
}

export async function handleSaleButtonStart(interaction: Interaction): Promise<void> {
  if (!interaction.isButton()) {
    return;
  }

  await startSaleFlowFromButton(interaction);
}

