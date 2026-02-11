export function maskSensitiveValue(value: string): string {
  if (value.length <= 2) {
    return '*'.repeat(value.length || 1);
  }

  const visible = Math.min(2, Math.floor(value.length / 2));
  const prefix = value.slice(0, visible);
  const suffix = value.slice(-visible);
  const hiddenLength = Math.max(3, value.length - visible * 2);

  return `${prefix}${'*'.repeat(hiddenLength)}${suffix}`;
}

export function maskAnswers(
  answers: Record<string, string>,
  sensitiveKeys: Set<string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(answers)) {
    out[key] = sensitiveKeys.has(key) ? maskSensitiveValue(value) : value;
  }
  return out;
}
