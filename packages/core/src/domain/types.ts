export type ActorRole = 'super_admin' | 'owner' | 'admin' | 'member';

export type TenantStatus = 'active' | 'disabled';

export type FormFieldType = 'short_text' | 'long_text' | 'email' | 'number';

export type OrderSessionStatus = 'pending_payment' | 'cancelled' | 'paid';

export type WebhookEventStatus = 'received' | 'processed' | 'failed' | 'duplicate';

export type TenantMemberRole = 'owner' | 'admin' | 'member';

export type FormFieldValidation = {
  minLength?: number;
  maxLength?: number;
  regex?: string;
  minValue?: number;
  maxValue?: number;
};

export type ProductFormFieldInput = {
  key: string;
  label: string;
  fieldType: FormFieldType;
  required: boolean;
  sensitive: boolean;
  sortOrder: number;
  validation?: FormFieldValidation;
};

export type ProductVariantInput = {
  label: string;
  priceMinor: number;
  currency: string;
  referralRewardMinor?: number;
  wooProductId?: string;
  wooCheckoutPath?: string;
};

export type ProductInput = {
  category: string;
  name: string;
  description: string;
  active: boolean;
  variants: ProductVariantInput[];
};

export type CheckoutTokenPayload = {
  orderSessionId: string;
  exp: number;
};

export type OAuthDiscordUser = {
  id: string;
  username: string;
  avatar: string | null;
};

export type OAuthDiscordGuild = {
  id: string;
  name: string;
  icon?: string | null;
  owner?: boolean;
  permissions?: string;
};

export type WooOrderPayload = {
  id: number;
  status: string;
  number?: string;
  total?: string;
  currency?: string;
  meta_data?: Array<{
    id?: number;
    key: string;
    value: string | number | boolean | null;
  }>;
};

export type WooOrderNote = {
  id: number;
  note: string;
  customer_note: boolean;
};

export type PaidLogNoteSummary = {
  latestInternal: string | null;
  latestCustomer: string | null;
};
