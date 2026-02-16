import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';

import { AppError, fromUnknownError, validationError } from '../domain/errors.js';
import type { SessionPayload } from '../security/session-token.js';
import { CouponRepository } from '../repositories/coupon-repository.js';
import { AuthorizationService } from './authorization-service.js';

const couponPayloadSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/, 'Coupon code can only include letters, numbers, "_" and "-".')
    .transform((value) => value.toUpperCase()),
  discountMinor: z.number().int().positive(),
  active: z.boolean().default(true),
});

export class CouponService {
  private readonly couponRepository = new CouponRepository();
  private readonly authorizationService = new AuthorizationService();

  public async listCoupons(
    actor: SessionPayload,
    input: { tenantId: string; guildId: string },
  ): Promise<
    Result<
      Array<{
        id: string;
        code: string;
        discountMinor: number;
        active: boolean;
      }>,
      AppError
    >
  > {
    try {
      const roleCheck = await this.authorizationService.ensureTenantRole(actor, {
        tenantId: input.tenantId,
        minimumRole: 'member',
      });
      if (roleCheck.isErr()) {
        return err(roleCheck.error);
      }

      const guildCheck = await this.authorizationService.ensureGuildBoundToTenant(input);
      if (guildCheck.isErr()) {
        return err(guildCheck.error);
      }

      const coupons = await this.couponRepository.listByGuild(input);
      return ok(
        coupons.map((coupon) => ({
          id: coupon.id,
          code: coupon.code,
          discountMinor: coupon.discountMinor,
          active: coupon.active,
        })),
      );
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }

  public async createCoupon(
    actor: SessionPayload,
    input: { tenantId: string; guildId: string; coupon: unknown },
  ): Promise<
    Result<
      {
        id: string;
        code: string;
        discountMinor: number;
        active: boolean;
      },
      AppError
    >
  > {
    try {
      const roleCheck = await this.authorizationService.ensureTenantRole(actor, {
        tenantId: input.tenantId,
        minimumRole: 'admin',
      });
      if (roleCheck.isErr()) {
        return err(roleCheck.error);
      }

      const guildCheck = await this.authorizationService.ensureGuildBoundToTenant(input);
      if (guildCheck.isErr()) {
        return err(guildCheck.error);
      }

      const parsed = couponPayloadSchema.safeParse(input.coupon);
      if (!parsed.success) {
        return err(validationError(parsed.error.issues));
      }

      try {
        const created = await this.couponRepository.create({
          tenantId: input.tenantId,
          guildId: input.guildId,
          code: parsed.data.code,
          discountMinor: parsed.data.discountMinor,
          active: parsed.data.active,
        });

        return ok({
          id: created.id,
          code: created.code,
          discountMinor: created.discountMinor,
          active: created.active,
        });
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          (error as { code?: string }).code === 'ER_DUP_ENTRY'
        ) {
          return err(new AppError('COUPON_ALREADY_EXISTS', 'Coupon code already exists for this server', 409));
        }

        throw error;
      }
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }

  public async updateCoupon(
    actor: SessionPayload,
    input: { tenantId: string; guildId: string; couponId: string; coupon: unknown },
  ): Promise<Result<void, AppError>> {
    try {
      const roleCheck = await this.authorizationService.ensureTenantRole(actor, {
        tenantId: input.tenantId,
        minimumRole: 'admin',
      });
      if (roleCheck.isErr()) {
        return err(roleCheck.error);
      }

      const guildCheck = await this.authorizationService.ensureGuildBoundToTenant(input);
      if (guildCheck.isErr()) {
        return err(guildCheck.error);
      }

      const parsed = couponPayloadSchema.safeParse(input.coupon);
      if (!parsed.success) {
        return err(validationError(parsed.error.issues));
      }

      try {
        await this.couponRepository.update({
          tenantId: input.tenantId,
          guildId: input.guildId,
          couponId: input.couponId,
          code: parsed.data.code,
          discountMinor: parsed.data.discountMinor,
          active: parsed.data.active,
        });
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          (error as { code?: string }).code === 'ER_DUP_ENTRY'
        ) {
          return err(new AppError('COUPON_ALREADY_EXISTS', 'Coupon code already exists for this server', 409));
        }

        throw error;
      }

      return ok(undefined);
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }

  public async deleteCoupon(
    actor: SessionPayload,
    input: { tenantId: string; guildId: string; couponId: string },
  ): Promise<Result<void, AppError>> {
    try {
      const roleCheck = await this.authorizationService.ensureTenantRole(actor, {
        tenantId: input.tenantId,
        minimumRole: 'admin',
      });
      if (roleCheck.isErr()) {
        return err(roleCheck.error);
      }

      const guildCheck = await this.authorizationService.ensureGuildBoundToTenant(input);
      if (guildCheck.isErr()) {
        return err(guildCheck.error);
      }

      await this.couponRepository.delete(input);
      return ok(undefined);
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }
}
