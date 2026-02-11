import crypto from 'node:crypto';

export function createWooWebhookSignature(rawBody: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
}

export function verifyWooWebhookSignature(options: {
  rawBody: string;
  secret: string;
  providedSignature: string | null;
}): boolean {
  if (!options.providedSignature) {
    return false;
  }

  const expected = createWooWebhookSignature(options.rawBody, options.secret);
  const provided = options.providedSignature.trim();

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
  } catch {
    return false;
  }
}

export function isPaidWooStatus(status: string): boolean {
  return status === 'processing' || status === 'completed';
}
