import { err, ok, type Result } from 'neverthrow';
import { ulid } from 'ulid';

import { getEnv } from '../config/env.js';
import { AppError, fromUnknownError } from '../domain/errors.js';
import { encryptSecret, decryptSecret } from '../security/encryption.js';
import type { SessionPayload } from '../security/session-token.js';
import { AdminRepository } from '../repositories/admin-repository.js';
import { TenantRepository } from '../repositories/tenant-repository.js';
import { UserRepository } from '../repositories/user-repository.js';

const BOT_TOKEN_SECRET_KEY = 'global_discord_bot_token';

export class AdminService {
  private readonly env = getEnv();
  private readonly adminRepository = new AdminRepository();
  private readonly tenantRepository = new TenantRepository();
  private readonly userRepository = new UserRepository();

  private ensureSuperAdmin(actor: SessionPayload): Result<void, AppError> {
    if (!actor.isSuperAdmin) {
      return err(new AppError('SUPER_ADMIN_REQUIRED', 'Super admin permission required', 403));
    }

    return ok(undefined);
  }

  public async setGlobalBotToken(
    actor: SessionPayload,
    token: string,
  ): Promise<Result<{ rotatedAt: string }, AppError>> {
    const superAdminCheck = this.ensureSuperAdmin(actor);
    if (superAdminCheck.isErr()) {
      return err(superAdminCheck.error);
    }

    if (!token || token.trim().length < 20) {
      return err(new AppError('INVALID_BOT_TOKEN', 'Invalid bot token format', 422));
    }

    try {
      const encrypted = encryptSecret(token.trim(), this.env.ENCRYPTION_KEY);
      await this.adminRepository.setAppSecret({ key: BOT_TOKEN_SECRET_KEY, encryptedValue: encrypted });

      const correlationId = ulid();
      await this.adminRepository.appendAuditLog({
        tenantId: null,
        userId: actor.userId,
        actorDiscordUserId: actor.discordUserId,
        action: 'admin.bot_token.rotate',
        resourceType: 'app_secret',
        resourceId: BOT_TOKEN_SECRET_KEY,
        correlationId,
        metadata: {},
      });

      return ok({ rotatedAt: new Date().toISOString() });
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }

  public async getResolvedBotToken(): Promise<Result<string, AppError>> {
    try {
      const encrypted = await this.adminRepository.getAppSecret(BOT_TOKEN_SECRET_KEY);
      if (encrypted) {
        return ok(decryptSecret(encrypted, this.env.ENCRYPTION_KEY));
      }

      if (this.env.DISCORD_TOKEN) {
        return ok(this.env.DISCORD_TOKEN);
      }

      return err(new AppError('BOT_TOKEN_MISSING', 'Bot token not configured', 500));
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }

  public async listTenants(
    actor: SessionPayload,
  ): Promise<Result<Array<{ id: string; name: string; status: string }>, AppError>> {
    const superAdminCheck = this.ensureSuperAdmin(actor);
    if (superAdminCheck.isErr()) {
      return err(superAdminCheck.error);
    }

    try {
      const tenants = await this.tenantRepository.listAllTenants();
      return ok(tenants.map((tenant) => ({ id: tenant.id, name: tenant.name, status: tenant.status })));
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }

  public async listUsers(
    actor: SessionPayload,
  ): Promise<Result<Array<{ id: string; discordUserId: string; username: string }>, AppError>> {
    const superAdminCheck = this.ensureSuperAdmin(actor);
    if (superAdminCheck.isErr()) {
      return err(superAdminCheck.error);
    }

    try {
      const users = await this.userRepository.listUsers();
      return ok(
        users.map((user) => ({
          id: user.id,
          discordUserId: user.discordUserId,
          username: user.username,
        })),
      );
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }

  public async enableTenant(
    actor: SessionPayload,
    tenantId: string,
  ): Promise<Result<void, AppError>> {
    const superAdminCheck = this.ensureSuperAdmin(actor);
    if (superAdminCheck.isErr()) {
      return err(superAdminCheck.error);
    }

    try {
      await this.tenantRepository.setTenantStatus({ tenantId, status: 'active' });
      await this.adminRepository.appendAuditLog({
        tenantId,
        userId: actor.userId,
        actorDiscordUserId: actor.discordUserId,
        action: 'admin.tenant.enable',
        resourceType: 'tenant',
        resourceId: tenantId,
        correlationId: ulid(),
        metadata: {},
      });
      return ok(undefined);
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }

  public async disableTenant(
    actor: SessionPayload,
    tenantId: string,
  ): Promise<Result<void, AppError>> {
    const superAdminCheck = this.ensureSuperAdmin(actor);
    if (superAdminCheck.isErr()) {
      return err(superAdminCheck.error);
    }

    try {
      await this.tenantRepository.setTenantStatus({ tenantId, status: 'disabled' });
      await this.adminRepository.appendAuditLog({
        tenantId,
        userId: actor.userId,
        actorDiscordUserId: actor.discordUserId,
        action: 'admin.tenant.disable',
        resourceType: 'tenant',
        resourceId: tenantId,
        correlationId: ulid(),
        metadata: {},
      });
      return ok(undefined);
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }

  public async getSuperAdminOverview(actor: SessionPayload): Promise<
    Result<
      {
        webhookFailures: Awaited<ReturnType<AdminRepository['listWebhookFailures']>>;
        auditLogs: Awaited<ReturnType<AdminRepository['listAuditLogs']>>;
      },
      AppError
    >
  > {
    const superAdminCheck = this.ensureSuperAdmin(actor);
    if (superAdminCheck.isErr()) {
      return err(superAdminCheck.error);
    }

    try {
      const [webhookFailures, auditLogs] = await Promise.all([
        this.adminRepository.listWebhookFailures(100),
        this.adminRepository.listAuditLogs(100),
      ]);

      return ok({
        webhookFailures,
        auditLogs,
      });
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }
}

