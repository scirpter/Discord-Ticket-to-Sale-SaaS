export const SETTINGS_MENU_ITEMS = [
  {
    id: 'default-currency',
    label: 'Default Currency',
    description: 'Choose the money format used across checkout and summary cards.',
    info: 'This becomes the primary dashboard currency display for the selected Discord server.',
  },
  {
    id: 'staff-roles',
    label: 'Staff Roles',
    description: 'Control which Discord roles can manage sales operations.',
    info: 'Only the roles selected here should be able to work paid-order and support flows.',
  },
  {
    id: 'paid-log-channel',
    label: 'Paid Log Channel',
    description: 'Pick where successful payment notifications should land.',
    info: 'Use a private channel that your moderators or staff can monitor without cluttering public chat.',
  },
  {
    id: 'tipping',
    label: 'Tipping',
    description: 'Turn the optional checkout tip prompt on or off.',
    info: 'When enabled, the sales flow asks whether the customer wants to add an optional GBP tip before checkout.',
  },
  {
    id: 'telegram',
    label: 'Telegram Integration',
    description: 'Enable the bridge, generate an invite, and connect a Telegram chat.',
    info: 'When disabled, Telegram connect controls stay hidden and the backend rejects new connection attempts.',
  },
] as const;

export type SettingsPanelId = (typeof SETTINGS_MENU_ITEMS)[number]['id'];
