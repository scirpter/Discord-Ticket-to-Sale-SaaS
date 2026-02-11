import { PermissionFlagsBits, type GuildMember } from 'discord.js';

export function canStartSale(member: GuildMember, configuredRoleIds: string[]): boolean {
  const hasAdminFallback =
    member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    member.permissions.has(PermissionFlagsBits.Administrator);

  if (hasAdminFallback) {
    return true;
  }

  if (configuredRoleIds.length === 0) {
    return false;
  }

  return member.roles.cache.some((role) => configuredRoleIds.includes(role.id));
}
