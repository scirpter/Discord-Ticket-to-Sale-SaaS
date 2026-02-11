import { and, asc, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import type {
  ProductFormFieldInput,
  ProductInput,
  ProductVariantInput,
} from '../domain/types.js';
import { getDb } from '../infra/db/client.js';
import { productFormFields, productVariants, products } from '../infra/db/schema/index.js';

export type ProductAggregate = {
  id: string;
  tenantId: string;
  guildId: string;
  category: string;
  name: string;
  description: string;
  active: boolean;
  variants: Array<{
    id: string;
    label: string;
    priceMinor: number;
    currency: string;
    wooProductId: string | null;
    wooCheckoutPath: string | null;
  }>;
  formFields: Array<{
    id: string;
    fieldKey: string;
    label: string;
    fieldType: 'short_text' | 'long_text' | 'email' | 'number';
    required: boolean;
    sensitive: boolean;
    sortOrder: number;
    validation: Record<string, unknown> | null;
  }>;
};

export class ProductRepository {
  private readonly db = getDb();

  public async listByGuild(input: { tenantId: string; guildId: string }): Promise<ProductAggregate[]> {
    const productRows = await this.db.query.products.findMany({
      where: and(eq(products.tenantId, input.tenantId), eq(products.guildId, input.guildId)),
      orderBy: [asc(products.createdAt)],
    });

    const output: ProductAggregate[] = [];

    for (const product of productRows) {
      const variants = await this.db.query.productVariants.findMany({
        where: eq(productVariants.productId, product.id),
        orderBy: [asc(productVariants.createdAt)],
      });

      const fields = await this.db.query.productFormFields.findMany({
        where: eq(productFormFields.productId, product.id),
        orderBy: [asc(productFormFields.sortOrder)],
      });

      output.push({
        id: product.id,
        tenantId: product.tenantId,
        guildId: product.guildId,
        category: product.category,
        name: product.name,
        description: product.description,
        active: product.active,
        variants: variants.map((variant) => ({
          id: variant.id,
          label: variant.label,
          priceMinor: variant.priceMinor,
          currency: variant.currency,
          wooProductId: variant.wooProductId,
          wooCheckoutPath: variant.wooCheckoutPath,
        })),
        formFields: fields.map((field) => ({
          id: field.id,
          fieldKey: field.fieldKey,
          label: field.label,
          fieldType: field.fieldType,
          required: field.required,
          sensitive: field.sensitive,
          sortOrder: field.sortOrder,
          validation: (field.validation ?? null) as Record<string, unknown> | null,
        })),
      });
    }

    return output;
  }

  public async getById(input: {
    tenantId: string;
    guildId: string;
    productId: string;
  }): Promise<ProductAggregate | null> {
    const product = await this.db.query.products.findFirst({
      where: and(
        eq(products.id, input.productId),
        eq(products.tenantId, input.tenantId),
        eq(products.guildId, input.guildId),
      ),
    });

    if (!product) {
      return null;
    }

    const variants = await this.db.query.productVariants.findMany({
      where: eq(productVariants.productId, product.id),
      orderBy: [asc(productVariants.createdAt)],
    });

    const fields = await this.db.query.productFormFields.findMany({
      where: eq(productFormFields.productId, product.id),
      orderBy: [asc(productFormFields.sortOrder)],
    });

    return {
      id: product.id,
      tenantId: product.tenantId,
      guildId: product.guildId,
      category: product.category,
      name: product.name,
      description: product.description,
      active: product.active,
      variants: variants.map((variant) => ({
        id: variant.id,
        label: variant.label,
        priceMinor: variant.priceMinor,
        currency: variant.currency,
        wooProductId: variant.wooProductId,
        wooCheckoutPath: variant.wooCheckoutPath,
      })),
      formFields: fields.map((field) => ({
        id: field.id,
        fieldKey: field.fieldKey,
        label: field.label,
        fieldType: field.fieldType,
        required: field.required,
        sensitive: field.sensitive,
        sortOrder: field.sortOrder,
        validation: (field.validation ?? null) as Record<string, unknown> | null,
      })),
    };
  }

  public async create(input: {
    tenantId: string;
    guildId: string;
    product: ProductInput;
    formFields: ProductFormFieldInput[];
  }): Promise<ProductAggregate> {
    const productId = ulid();

    await this.db.transaction(async (tx) => {
      await tx.insert(products).values({
        id: productId,
        tenantId: input.tenantId,
        guildId: input.guildId,
        category: input.product.category,
        name: input.product.name,
        description: input.product.description,
        active: input.product.active,
      });

      if (input.product.variants.length > 0) {
        await tx.insert(productVariants).values(
          input.product.variants.map((variant: ProductVariantInput) => ({
            id: ulid(),
            tenantId: input.tenantId,
            guildId: input.guildId,
            productId,
            label: variant.label,
            priceMinor: variant.priceMinor,
            currency: variant.currency,
            wooProductId: variant.wooProductId ?? null,
            wooCheckoutPath: variant.wooCheckoutPath ?? null,
          })),
        );
      }

      if (input.formFields.length > 0) {
        await tx.insert(productFormFields).values(
          input.formFields.map((field) => ({
            id: ulid(),
            tenantId: input.tenantId,
            guildId: input.guildId,
            productId,
            fieldKey: field.key,
            label: field.label,
            fieldType: field.fieldType,
            required: field.required,
            sensitive: field.sensitive,
            sortOrder: field.sortOrder,
            validation: field.validation ?? null,
          })),
        );
      }
    });

    const created = await this.getById({
      tenantId: input.tenantId,
      guildId: input.guildId,
      productId,
    });

    if (!created) {
      throw new Error('Failed to create product');
    }

    return created;
  }

  public async update(input: {
    tenantId: string;
    guildId: string;
    productId: string;
    product: ProductInput;
  }): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(products)
        .set({
          category: input.product.category,
          name: input.product.name,
          description: input.product.description,
          active: input.product.active,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(products.id, input.productId),
            eq(products.tenantId, input.tenantId),
            eq(products.guildId, input.guildId),
          ),
        );

      await tx.delete(productVariants).where(eq(productVariants.productId, input.productId));

      if (input.product.variants.length > 0) {
        await tx.insert(productVariants).values(
          input.product.variants.map((variant: ProductVariantInput) => ({
            id: ulid(),
            tenantId: input.tenantId,
            guildId: input.guildId,
            productId: input.productId,
            label: variant.label,
            priceMinor: variant.priceMinor,
            currency: variant.currency,
            wooProductId: variant.wooProductId ?? null,
            wooCheckoutPath: variant.wooCheckoutPath ?? null,
          })),
        );
      }
    });
  }

  public async replaceFormFields(input: {
    tenantId: string;
    guildId: string;
    productId: string;
    formFields: ProductFormFieldInput[];
  }): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(productFormFields).where(eq(productFormFields.productId, input.productId));

      if (input.formFields.length > 0) {
        await tx.insert(productFormFields).values(
          input.formFields.map((field) => ({
            id: ulid(),
            tenantId: input.tenantId,
            guildId: input.guildId,
            productId: input.productId,
            fieldKey: field.key,
            label: field.label,
            fieldType: field.fieldType,
            required: field.required,
            sensitive: field.sensitive,
            sortOrder: field.sortOrder,
            validation: field.validation ?? null,
          })),
        );
      }
    });
  }

  public async delete(input: {
    tenantId: string;
    guildId: string;
    productId: string;
  }): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(productFormFields).where(eq(productFormFields.productId, input.productId));
      await tx.delete(productVariants).where(eq(productVariants.productId, input.productId));
      await tx
        .delete(products)
        .where(
          and(
            eq(products.id, input.productId),
            eq(products.tenantId, input.tenantId),
            eq(products.guildId, input.guildId),
          ),
        );
    });
  }

  public async getSensitiveFieldKeys(productId: string): Promise<Set<string>> {
    const rows = await this.db.query.productFormFields.findMany({
      where: and(eq(productFormFields.productId, productId), eq(productFormFields.sensitive, true)),
    });

    return new Set(rows.map((row) => row.fieldKey));
  }
}
