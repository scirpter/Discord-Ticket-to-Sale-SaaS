import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';

import { AppError, fromUnknownError, validationError } from '../domain/errors.js';
import type { SessionPayload } from '../security/session-token.js';
import { ProductRepository } from '../repositories/product-repository.js';
import { AuthorizationService } from './authorization-service.js';

const variantSchema = z.object({
  label: z.string().min(1).max(80),
  priceMinor: z.number().int().nonnegative(),
  currency: z.string().length(3).transform((value) => value.toUpperCase()),
  wooProductId: z.string().max(64).optional(),
  wooCheckoutPath: z.string().max(255).optional(),
});

const productSchema = z.object({
  category: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(2000),
  active: z.boolean().default(true),
  variants: z.array(variantSchema).min(1),
});

const fieldValidationSchema = z
  .object({
    minLength: z.number().int().nonnegative().optional(),
    maxLength: z.number().int().nonnegative().optional(),
    regex: z.string().optional(),
    minValue: z.number().optional(),
    maxValue: z.number().optional(),
  })
  .optional();

const formFieldSchema = z.object({
  key: z.string().min(1).max(64),
  label: z.string().min(1).max(120),
  fieldType: z.enum(['short_text', 'long_text', 'email', 'number']),
  required: z.boolean(),
  sensitive: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
  validation: fieldValidationSchema,
});

const formFieldsSchema = z.array(formFieldSchema).max(100);

export class ProductService {
  private readonly productRepository = new ProductRepository();
  private readonly authorizationService = new AuthorizationService();

  public async listProducts(
    actor: SessionPayload,
    input: { tenantId: string; guildId: string },
  ): Promise<Result<Awaited<ReturnType<ProductRepository['listByGuild']>>, AppError>> {
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

      const products = await this.productRepository.listByGuild(input);
      return ok(products);
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }

  public async createProduct(
    actor: SessionPayload,
    input: {
      tenantId: string;
      guildId: string;
      product: unknown;
      formFields: unknown;
    },
  ): Promise<Result<Awaited<ReturnType<ProductRepository['create']>>, AppError>> {
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

      const parsedProduct = productSchema.safeParse(input.product);
      if (!parsedProduct.success) {
        return err(validationError(parsedProduct.error.issues));
      }

      const parsedFields = formFieldsSchema.safeParse(input.formFields);
      if (!parsedFields.success) {
        return err(validationError(parsedFields.error.issues));
      }

      const created = await this.productRepository.create({
        tenantId: input.tenantId,
        guildId: input.guildId,
        product: parsedProduct.data,
        formFields: parsedFields.data,
      });

      return ok(created);
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }

  public async updateProduct(
    actor: SessionPayload,
    input: {
      tenantId: string;
      guildId: string;
      productId: string;
      product: unknown;
    },
  ): Promise<Result<void, AppError>> {
    try {
      const roleCheck = await this.authorizationService.ensureTenantRole(actor, {
        tenantId: input.tenantId,
        minimumRole: 'admin',
      });
      if (roleCheck.isErr()) {
        return err(roleCheck.error);
      }

      const parsedProduct = productSchema.safeParse(input.product);
      if (!parsedProduct.success) {
        return err(validationError(parsedProduct.error.issues));
      }

      await this.productRepository.update({
        tenantId: input.tenantId,
        guildId: input.guildId,
        productId: input.productId,
        product: parsedProduct.data,
      });

      return ok(undefined);
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }

  public async deleteProduct(
    actor: SessionPayload,
    input: { tenantId: string; guildId: string; productId: string },
  ): Promise<Result<void, AppError>> {
    try {
      const roleCheck = await this.authorizationService.ensureTenantRole(actor, {
        tenantId: input.tenantId,
        minimumRole: 'admin',
      });
      if (roleCheck.isErr()) {
        return err(roleCheck.error);
      }

      await this.productRepository.delete(input);
      return ok(undefined);
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }

  public async getFormFields(
    actor: SessionPayload,
    input: { tenantId: string; guildId: string; productId: string },
  ): Promise<Result<Array<{ key: string; label: string; fieldType: string; required: boolean; sensitive: boolean; sortOrder: number; validation: Record<string, unknown> | null }>, AppError>> {
    try {
      const roleCheck = await this.authorizationService.ensureTenantRole(actor, {
        tenantId: input.tenantId,
        minimumRole: 'member',
      });
      if (roleCheck.isErr()) {
        return err(roleCheck.error);
      }

      const product = await this.productRepository.getById(input);
      if (!product) {
        return err(new AppError('PRODUCT_NOT_FOUND', 'Product not found', 404));
      }

      return ok(
        product.formFields.map((field) => ({
          key: field.fieldKey,
          label: field.label,
          fieldType: field.fieldType,
          required: field.required,
          sensitive: field.sensitive,
          sortOrder: field.sortOrder,
          validation: field.validation,
        })),
      );
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }

  public async replaceFormFields(
    actor: SessionPayload,
    input: {
      tenantId: string;
      guildId: string;
      productId: string;
      formFields: unknown;
    },
  ): Promise<Result<void, AppError>> {
    try {
      const roleCheck = await this.authorizationService.ensureTenantRole(actor, {
        tenantId: input.tenantId,
        minimumRole: 'admin',
      });
      if (roleCheck.isErr()) {
        return err(roleCheck.error);
      }

      const parsedFields = formFieldsSchema.safeParse(input.formFields);
      if (!parsedFields.success) {
        return err(validationError(parsedFields.error.issues));
      }

      await this.productRepository.replaceFormFields({
        tenantId: input.tenantId,
        guildId: input.guildId,
        productId: input.productId,
        formFields: parsedFields.data,
      });

      return ok(undefined);
    } catch (error) {
      return err(fromUnknownError(error));
    }
  }
}

