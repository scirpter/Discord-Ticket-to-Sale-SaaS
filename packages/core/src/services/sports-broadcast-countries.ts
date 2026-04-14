export const DEFAULT_SHARED_BROADCAST_COUNTRIES = [
  'United Kingdom',
  'United States',
] as const;

export function normalizeBroadcastCountries(
  input: readonly string[] | null | undefined,
): string[] {
  const normalized = [...new Set((input ?? []).map((value) => value.trim()).filter((value) => value.length > 0))];

  return normalized.length > 0 ? normalized : [...DEFAULT_SHARED_BROADCAST_COUNTRIES];
}

export function formatBroadcastCountriesLabel(input: readonly string[] | null | undefined): string {
  return normalizeBroadcastCountries(input).join(' + ');
}
