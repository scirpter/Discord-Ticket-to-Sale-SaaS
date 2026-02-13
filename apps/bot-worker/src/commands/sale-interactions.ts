import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type Interaction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { ProductRepository, SaleService, TenantRepository } from '@voodoo/core';

import { getSaleDraft, removeSaleDraft, updateSaleDraft, type SaleDraft } from '../flows/sale-draft-store.js';
import { sendCheckoutMessage, startSaleFlowFromButton } from './sale-flow.js';

const productRepository = new ProductRepository();
const saleService = new SaleService();

function canInteractWithDraft(draft: SaleDraft, userId: string): boolean {
  return draft.customerDiscordUserId === userId || draft.staffDiscordUserId === userId;
}

function normalizeCategoryLabel(category: string): string {
  const trimmed = category.trim();
  if (!trimmed) {
    return 'Uncategorized';
  }

  return trimmed;
}

function buildSelectRow(input: {
  customId: string;
  placeholder: string;
  options: Array<{ label: string; description?: string; value: string }>;
}): ActionRowBuilder<StringSelectMenuBuilder> {
  const select = new StringSelectMenuBuilder()
    .setCustomId(input.customId)
    .setPlaceholder(input.placeholder)
    .addOptions(input.options.slice(0, 25));

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

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

async function finalizeDraft(input: {
  draftId: string;
  draft: SaleDraft;
  interaction: {
    channel: ModalSubmitInteraction['channel'] | StringSelectMenuInteraction['channel'];
    editReply: (payload: { content: string; components?: [] }) => Promise<unknown>;
    inGuild: () => boolean;
  };
}): Promise<void> {
  if (!input.interaction.inGuild() || !input.interaction.channel || !input.draft.productId || !input.draft.variantId) {
    await input.interaction.editReply({
      content: 'Sale draft expired. Please start again with `/sale`.',
      components: [],
    });
    return;
  }

  const created = await saleService.createSaleSessionFromBot({
    tenantId: input.draft.tenantId,
    guildId: input.draft.guildId,
    ticketChannelId: input.draft.ticketChannelId,
    staffDiscordUserId: input.draft.staffDiscordUserId,
    customerDiscordUserId: input.draft.customerDiscordUserId,
    productId: input.draft.productId,
    variantId: input.draft.variantId,
    answers: input.draft.answers,
  });

  if (created.isErr()) {
    await input.interaction.editReply({ content: created.error.message, components: [] });
    return;
  }

  removeSaleDraft(input.draftId);

  try {
    await sendCheckoutMessage(input.interaction.channel as any, {
      checkoutUrl: created.value.checkoutUrl,
      orderSessionId: created.value.orderSessionId,
      customerDiscordUserId: input.draft.customerDiscordUserId,
    });
  } catch {
    await input.interaction.editReply({
      content: [
        'Checkout created, but I could not post the public checkout message in this channel.',
        `Order Session: \`${created.value.orderSessionId}\``,
        `Checkout URL: ${created.value.checkoutUrl}`,
      ].join('\n'),
      components: [],
    });
    return;
  }

  await input.interaction.editReply({
    content: `Checkout link generated. Order session: \`${created.value.orderSessionId}\``,
    components: [],
  });
}

async function handleCategorySelection(
  interaction: StringSelectMenuInteraction,
  draft: SaleDraft,
  selectedCategory: string,
): Promise<void> {
  const optionsResult = await saleService.getSaleOptions({
    tenantId: draft.tenantId,
    guildId: draft.guildId,
  });
  if (optionsResult.isErr()) {
    await interaction.update({ content: optionsResult.error.message, components: [] });
    return;
  }

  const category = normalizeCategoryLabel(selectedCategory);
  const products = optionsResult.value.filter((product) => {
    if (product.variants.length === 0) {
      return false;
    }

    return normalizeCategoryLabel(product.category).toLowerCase() === category.toLowerCase();
  });

  if (products.length === 0) {
    await interaction.update({
      content: `No products found for category "${category}". Start \`/sale\` again.`,
      components: [],
    });
    return;
  }

  draft.category = category;
  draft.productName = null;
  draft.productId = null;
  draft.variantId = null;
  draft.variantOptions = [];
  draft.formFields = [];
  draft.answers = {};
  updateSaleDraft(draft);

  const row = buildSelectRow({
    customId: `sale:start:${draft.id}:product`,
    placeholder: 'Select product',
    options: products
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((product) => ({
        label: product.name.slice(0, 100),
        description: `${product.variants.length} price option(s)`.slice(0, 100),
        value: product.productId,
      })),
  });

  await interaction.update({
    content: `Step 2/4: Category **${category}** selected. Now select product for <@${draft.customerDiscordUserId}>`,
    components: [row],
  });
}

async function handleProductSelection(
  interaction: StringSelectMenuInteraction,
  draft: SaleDraft,
  selectedProductId: string,
): Promise<void> {
  if (!draft.category) {
    await interaction.update({
      content: 'Category not selected. Start `/sale` again.',
      components: [],
    });
    return;
  }

  const optionsResult = await saleService.getSaleOptions({
    tenantId: draft.tenantId,
    guildId: draft.guildId,
  });
  if (optionsResult.isErr()) {
    await interaction.update({ content: optionsResult.error.message, components: [] });
    return;
  }

  const selectedProduct = optionsResult.value.find((product) => product.productId === selectedProductId);
  if (!selectedProduct) {
    await interaction.update({
      content: 'Product not found. Start `/sale` again.',
      components: [],
    });
    return;
  }

  if (normalizeCategoryLabel(selectedProduct.category).toLowerCase() !== draft.category.toLowerCase()) {
    await interaction.update({
      content: 'Selected product does not belong to the chosen category. Start `/sale` again.',
      components: [],
    });
    return;
  }

  if (selectedProduct.variants.length === 0) {
    await interaction.update({
      content: 'No variants available for this product. Start `/sale` again.',
      components: [],
    });
    return;
  }

  const fullProduct = await productRepository.getById({
    tenantId: draft.tenantId,
    guildId: draft.guildId,
    productId: selectedProduct.productId,
  });
  if (!fullProduct) {
    await interaction.update({
      content: 'Product details could not be loaded. Start `/sale` again.',
      components: [],
    });
    return;
  }

  if (fullProduct.formFields.length > 5) {
    await interaction.update({
      content:
        'This product has more than 5 form fields. Current modal flow supports up to 5 fields per sale.',
      components: [],
    });
    return;
  }

  draft.productName = selectedProduct.name;
  draft.productId = selectedProduct.productId;
  draft.variantId = null;
  draft.variantOptions = selectedProduct.variants.map((variant) => ({
    variantId: variant.variantId,
    label: variant.label,
    priceMinor: variant.priceMinor,
    currency: variant.currency,
  }));
  draft.formFields = fullProduct.formFields.map((field) => ({
    fieldKey: field.fieldKey,
    label: field.label,
    required: field.required,
    fieldType: field.fieldType,
    validation: field.validation,
  }));
  draft.answers = {};
  updateSaleDraft(draft);

  const row = buildSelectRow({
    customId: `sale:start:${draft.id}:variant`,
    placeholder: 'Select price option',
    options: draft.variantOptions.map((variant) => ({
      label: variant.label.slice(0, 100),
      description: `${(variant.priceMinor / 100).toFixed(2)} ${variant.currency}`.slice(0, 100),
      value: variant.variantId,
    })),
  });

  await interaction.update({
    content: [
      `Step 3/4: Product **${selectedProduct.name}** selected.`,
      `Category: **${draft.category}**`,
      'Now select a price option.',
    ].join('\n'),
    components: [row],
  });
}

async function handleVariantSelection(
  interaction: StringSelectMenuInteraction,
  draft: SaleDraft,
  selectedVariantId: string,
): Promise<void> {
  if (!draft.productId || !draft.productName) {
    await interaction.update({
      content: 'Product not selected. Start `/sale` again.',
      components: [],
    });
    return;
  }

  const variant = draft.variantOptions.find((item) => item.variantId === selectedVariantId);
  if (!variant) {
    await interaction.update({
      content: 'Variant not found. Please restart `/sale`.',
      components: [],
    });
    return;
  }

  if (draft.formFields.length > 5) {
    await interaction.update({
      content:
        'This product has more than 5 form fields. Current modal flow supports up to 5 fields per sale.',
      components: [],
    });
    return;
  }

  draft.variantId = selectedVariantId;
  draft.answers = {};
  updateSaleDraft(draft);

  if (draft.formFields.length === 0) {
    await interaction.deferUpdate();
    await finalizeDraft({
      draftId: draft.id,
      draft,
      interaction: {
        channel: interaction.channel,
        editReply: async (payload) => interaction.editReply(payload),
        inGuild: () => interaction.inGuild(),
      },
    });
    return;
  }

  const modal = buildFormModal(draft.id, draft.formFields, draft.answers);
  await interaction.showModal(modal);
}

export async function handleSaleSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const [, , draftId, step] = interaction.customId.split(':');
  if (!draftId || !step) {
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

  if (!canInteractWithDraft(draft, interaction.user.id)) {
    await interaction.reply({
      content: 'Only the selected customer (or the staff member who started this sale) can use this menu.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const selectedValue = interaction.values[0]?.trim();
  if (!selectedValue) {
    await interaction.update({
      content: 'Invalid selection. Start `/sale` again.',
      components: [],
    });
    return;
  }

  if (step === 'category') {
    await handleCategorySelection(interaction, draft, selectedValue);
    return;
  }

  if (step === 'product') {
    await handleProductSelection(interaction, draft, selectedValue);
    return;
  }

  if (step === 'variant') {
    await handleVariantSelection(interaction, draft, selectedValue);
    return;
  }

  await interaction.update({ content: 'Unknown sale step. Start `/sale` again.', components: [] });
}

export async function handleSaleModal(interaction: ModalSubmitInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const [, , draftId] = interaction.customId.split(':');
  if (!draftId) {
    await interaction.editReply({ content: 'Invalid sale draft.' });
    return;
  }

  const draft = getSaleDraft(draftId);
  if (!draft || !draft.productId || !draft.variantId) {
    await interaction.editReply({
      content: 'Sale draft expired. Start `/sale` again.',
    });
    return;
  }

  if (!canInteractWithDraft(draft, interaction.user.id)) {
    await interaction.editReply({
      content: 'Only the selected customer (or the staff member who started this sale) can submit this form.',
    });
    return;
  }

  for (const field of draft.formFields) {
    let value = '';

    try {
      value = interaction.fields.getTextInputValue(field.fieldKey);
    } catch {
      if (field.required) {
        await interaction.editReply({
          content: 'Form questions changed during checkout. Please restart `/sale`.',
        });
        return;
      }

      continue;
    }

    const normalizedValue = value.trim();
    if (field.required && !normalizedValue) {
      await interaction.editReply({
        content: `Required field is missing: \`${field.fieldKey}\`. Please restart \`/sale\`.`,
      });
      return;
    }

    draft.answers[field.fieldKey] = normalizedValue;
  }

  updateSaleDraft(draft);

  await finalizeDraft({
    draftId: draft.id,
    draft,
    interaction: {
      channel: interaction.channel,
      editReply: async (payload) => interaction.editReply(payload),
      inGuild: () => interaction.inGuild(),
    },
  });
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
