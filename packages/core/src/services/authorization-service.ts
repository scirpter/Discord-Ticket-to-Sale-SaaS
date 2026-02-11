import { err, ok, type Result } from 'neverthrow';

import { AppError, fromUnknownError } from '../domain/errors.js';
import type { SessionPayload } from '../security/session-token.js';
import { TenantRepository } from '../repositories/tenant-repository.js';
import { UserRepository } from '../repositories/user-repository.js';

export class AuthorizationService {
  private readonly userRepository = new UserRepository();
  private readonly tenantRepository = new TenantRepository();

  public async ensureTenantRole(
    actor: SessionPayload,
    input: { tenantId: string; minimumRole: 'owner' | 'admin' | 'member' },
  ): Promise<Result<void, AppError>> {
    if (actor.isSuperAdmin) {
      return ok(undefined);
    }

    try {
      const role = await this.userRepository.getMemberRole({ tenantId: input.tenantId, userId: actor.userId });

      if (!role) {
        return err(new AppError('TENANT_ACCESS_DENIED', 'You do not have access to this tenant', 403));
      }

      const hierarchy: Record<'owner' | 'admin' | 'member', number> = {
        owner: 3,
        admin: 2,
        member: 1,
      };

      if (hierarchy[role] < hierarchy[input.minimumRole]) {
        return err(new AppError('TENANT_ROLE_DENIED', 'Insufficient tenant role', 403));
      }

      return ok(undefined);
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }

  public async ensureGuildBoundToTenant(input: {
    tenantId: string;
    guildId: string;
  }): Promise<Result<void, AppError>> {
    try {
      const guild = await this.tenantRepository.getTenantGuild(input);
      if (!guild) {
        return err(new AppError('GUILD_NOT_CONNECTED', 'Guild is not connected to the tenant', 404));
      }

      return ok(undefined);
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }

  public async ensureTenantIsActive(tenantId: string): Promise<Result<void, AppError>> {
    try {
      const tenant = await this.tenantRepository.getTenantById(tenantId);
      if (!tenant) {
        return err(new AppError('TENANT_NOT_FOUND', 'Tenant not found', 404));
      }

      if (tenant.status !== 'active') {
        return err(new AppError('TENANT_DISABLED', 'Tenant is disabled', 403));
      }

      return ok(undefined);
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }
}
