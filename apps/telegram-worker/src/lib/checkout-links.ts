import type { SaleCheckoutOption } from '@voodoo/core';

const TELEGRAM_SAFE_TEXT_MESSAGE_LIMIT = 3900;

export type TelegramCheckoutCopyPayload =
  | {
      kind: 'message';
      label: string;
      text: string;
    }
  | {
      kind: 'file';
      label: string;
      text: string;
      fileName: string;
      caption: string;
    };

export function buildTelegramCheckoutButtonLabel(input: {
  label: string;
  index: number;
  total: number;
}): string {
  if (input.total === 1 && input.index === 0) {
    return 'Open Checkout';
  }

  return input.label;
}

export function buildTelegramCheckoutCopyPayloads(
  options: SaleCheckoutOption[],
): TelegramCheckoutCopyPayload[] {
  return options.map((option) => {
    const text = [
      `${option.label} raw checkout link:`,
      option.url,
      '',
      'If Telegram breaks checkout, copy this exact link into Chrome or Safari.',
    ].join('\n');

    if (text.length <= TELEGRAM_SAFE_TEXT_MESSAGE_LIMIT) {
      return {
        kind: 'message',
        label: option.label,
        text,
      };
    }

    return {
      kind: 'file',
      label: option.label,
      text: `${option.url}\n`,
      fileName: `${slugifyTelegramCheckoutLabel(option.label)}-checkout-link.txt`,
      caption: `${option.label} raw checkout link. Open the file, copy the exact URL, and paste it into Chrome or Safari if Telegram breaks checkout.`,
    };
  });
}

function slugifyTelegramCheckoutLabel(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');

  return slug.length > 0 ? slug : 'checkout';
}
