import { and, asc, eq, inArray } from 'drizzle-orm';
import { ulid } from 'ulid';

import type {
  ProductFormFieldInput,
  ProductInput,
  ProductVariantInput,
} from '../domain/types.js';
import { getDb } from '../infra/db/client.js';
import { productFormFields, productVariants, products } from '../infra/db/schema/index.js';

const REQUIRED_EMAIL_FIELD_KEY = 'email';
const REQUIRED_EMAIL_FIELD_LABEL = 'What is your email?';

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
    referralRewardMinor: number;
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

type ProductAggregateField = ProductAggregate['formFields'][number];

function ensureRequiredEmailField(fields: ProductAggregateField[]): ProductAggregateField[] {
  const sorted = [...fields].sort((a, b) => a.sortOrder - b.sortOrder);
  const existingEmailField = sorted.find(
    (field) => field.fieldKey.trim().toLowerCase() === REQUIRED_EMAIL_FIELD_KEY,
  );

  const nonEmailFields = sorted.filter(
    (field) => field.fieldKey.trim().toLowerCase() !== REQUIRED_EMAIL_FIELD_KEY,
  );

  const requiredEmailField: ProductAggregateField = {
    id: existingEmailField?.id ?? 'system-email',
    fieldKey: REQUIRED_EMAIL_FIELD_KEY,
    label: REQUIRED_EMAIL_FIELD_LABEL,
    fieldType: 'email',
    required: true,
    sensitive: false,
    sortOrder: 0,
    validation: null,
  };

  return [requiredEmailField, ...nonEmailFields].map((field, index) => ({
    ...field,
    sortOrder: index,
  }));
}

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
          referralRewardMinor: variant.referralRewardMinor,
          currency: variant.currency,
          wooProductId: variant.wooProductId,
          wooCheckoutPath: variant.wooCheckoutPath,
        })),
        formFields: ensureRequiredEmailField(
          fields.map((field) => ({
            id: field.id,
            fieldKey: field.fieldKey,
            label: field.label,
            fieldType: field.fieldType,
            required: field.required,
            sensitive: field.sensitive,
            sortOrder: field.sortOrder,
            validation: (field.validation ?? null) as Record<string, unknown> | null,
          })),
        ),
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
        referralRewardMinor: variant.referralRewardMinor,
        currency: variant.currency,
        wooProductId: variant.wooProductId,
        wooCheckoutPath: variant.wooCheckoutPath,
      })),
      formFields: ensureRequiredEmailField(
        fields.map((field) => ({
          id: field.id,
          fieldKey: field.fieldKey,
          label: field.label,
          fieldType: field.fieldType,
          required: field.required,
          sensitive: field.sensitive,
          sortOrder: field.sortOrder,
          validation: (field.validation ?? null) as Record<string, unknown> | null,
        })),
      ),
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
            referralRewardMinor: variant.referralRewardMinor ?? 0,
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
            referralRewardMinor: variant.referralRewardMinor ?? 0,
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
    await this.replaceFormFieldsForProducts({
      tenantId: input.tenantId,
      guildId: input.guildId,
      productIds: [input.productId],
      formFields: input.formFields,
    });
  }

  public async listProductIdsByCategory(input: {
    tenantId: string;
    guildId: string;
    category: string;
  }): Promise<string[]> {
    const rows = await this.db.query.products.findMany({
      where: and(
        eq(products.tenantId, input.tenantId),
        eq(products.guildId, input.guildId),
        eq(products.category, input.category),
      ),
      orderBy: [asc(products.createdAt)],
    });

    return rows.map((row) => row.id);
  }

  public async getCategoryFormFieldsTemplate(input: {
    tenantId: string;
    guildId: string;
    category: string;
  }): Promise<ProductFormFieldInput[]> {
    const categoryProducts = await this.db.query.products.findMany({
      where: and(
        eq(products.tenantId, input.tenantId),
        eq(products.guildId, input.guildId),
        eq(products.category, input.category),
      ),
      orderBy: [asc(products.createdAt)],
    });

    for (const categoryProduct of categoryProducts) {
      const fields = await this.db.query.productFormFields.findMany({
        where: eq(productFormFields.productId, categoryProduct.id),
        orderBy: [asc(productFormFields.sortOrder)],
      });

      if (fields.length > 0) {
        return fields.map((field) => ({
          key: field.fieldKey,
          label: field.label,
          fieldType: field.fieldType,
          required: field.required,
          sensitive: field.sensitive,
          sortOrder: field.sortOrder,
          validation: (field.validation ?? undefined) as
            | {
                minLength?: number;
                maxLength?: number;
                regex?: string;
                minValue?: number;
                maxValue?: number;
              }
            | undefined,
        }));
      }
    }

    return [];
  }

  public async replaceFormFieldsForProducts(input: {
    tenantId: string;
    guildId: string;
    productIds: string[];
    formFields: ProductFormFieldInput[];
  }): Promise<void> {
    if (input.productIds.length === 0) {
      return;
    }

    await this.db.transaction(async (tx) => {
      await tx
        .delete(productFormFields)
        .where(
          and(
            eq(productFormFields.tenantId, input.tenantId),
            eq(productFormFields.guildId, input.guildId),
            inArray(productFormFields.productId, input.productIds),
          ),
        );

      if (input.formFields.length > 0) {
        const rows = input.productIds.flatMap((productId) =>
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

        await tx.insert(productFormFields).values(rows);
      }
    });
  }

  public async renameCategory(input: {
    tenantId: string;
    guildId: string;
    category: string;
    newCategory: string;
  }): Promise<number> {
    const productIds = await this.listProductIdsByCategory({
      tenantId: input.tenantId,
      guildId: input.guildId,
      category: input.category,
    });

    if (productIds.length === 0) {
      return 0;
    }

    await this.db
      .update(products)
      .set({
        category: input.newCategory,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(products.tenantId, input.tenantId),
          eq(products.guildId, input.guildId),
          inArray(products.id, productIds),
        ),
      );

    return productIds.length;
  }

  public async deleteCategory(input: {
    tenantId: string;
    guildId: string;
    category: string;
  }): Promise<number> {
    const productIds = await this.listProductIdsByCategory({
      tenantId: input.tenantId,
      guildId: input.guildId,
      category: input.category,
    });

    if (productIds.length === 0) {
      return 0;
    }

    await this.db.transaction(async (tx) => {
      await tx
        .delete(productFormFields)
        .where(
          and(
            eq(productFormFields.tenantId, input.tenantId),
            eq(productFormFields.guildId, input.guildId),
            inArray(productFormFields.productId, productIds),
          ),
        );

      await tx
        .delete(productVariants)
        .where(
          and(
            eq(productVariants.tenantId, input.tenantId),
            eq(productVariants.guildId, input.guildId),
            inArray(productVariants.productId, productIds),
          ),
        );

      await tx
        .delete(products)
        .where(
          and(
            eq(products.tenantId, input.tenantId),
            eq(products.guildId, input.guildId),
            inArray(products.id, productIds),
          ),
        );
    });

    return productIds.length;
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
