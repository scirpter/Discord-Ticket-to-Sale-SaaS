'use client';

import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Globe,
  Loader2,
  Plus,
  Settings2,
  Shield,
  Store,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ModeToggle } from '@/components/mode-toggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type FieldType = 'short_text' | 'long_text' | 'email' | 'number';

type RequestState = {
  loading: boolean;
  response: string;
  error: string;
};

type TenantSummary = {
  id: string;
  name: string;
  status: string;
};

type DiscordGuildSummary = {
  id: string;
  name: string;
  iconUrl: string | null;
  owner: boolean;
  permissions: string;
};

type GuildResources = {
  botInGuild: boolean;
  inviteUrl: string;
  guild: {
    id: string;
    name: string;
  };
  channels: Array<{
    id: string;
    name: string;
    type: number;
  }>;
  roles: Array<{
    id: string;
    name: string;
    color: number;
    position: number;
  }>;
};

type ProductVariantRecord = {
  id: string;
  label: string;
  priceMinor: number;
  currency: string;
};

type ProductFormFieldRecord = {
  id: string;
  fieldKey: string;
  label: string;
  fieldType: FieldType;
  required: boolean;
  sensitive: boolean;
  sortOrder: number;
};

type ProductRecord = {
  id: string;
  category: string;
  name: string;
  description: string;
  active: boolean;
  variants: ProductVariantRecord[];
  formFields: ProductFormFieldRecord[];
};

type MeResponse = {
  me: {
    userId: string;
    isSuperAdmin: boolean;
    tenantIds: string[];
  };
  tenants: TenantSummary[];
  discordGuilds: DiscordGuildSummary[];
  discordGuildsError: string;
};

type PriceOptionDraft = {
  label: string;
  priceMajor: string;
  currency: string;
};

type QuestionDraft = {
  key: string;
  label: string;
  fieldType: FieldType;
  required: boolean;
  sensitive: boolean;
  sortOrder: number;
};

const initialState: RequestState = {
  loading: false,
  response: '',
  error: '',
};

const nativeSelectClass =
  'dark:bg-input/30 dark:border-input dark:hover:bg-input/40 flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50';

function safeJsonParse(text: string): unknown {
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function apiCall(path: string, method = 'GET', body?: unknown): Promise<unknown> {
  const response = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const responseText = await response.text();
  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? safeJsonParse(responseText) : null;

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : responseText.startsWith('<!DOCTYPE') || responseText.startsWith('<html')
          ? `Request failed with ${response.status}. Server returned HTML instead of JSON. Check Workspace ID + Discord Server ID first.`
          : responseText || `Request failed with ${response.status}`;

    throw new Error(message);
  }

  if (isJson) {
    return payload;
  }

  return {
    status: response.status,
    body: responseText,
  };
}

function parsePriceToMinor(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('Price must be a valid positive number like 9.99');
  }

  return Math.round(parsed * 100);
}

export default function DashboardPage() {
  const [tenantId, setTenantId] = useState('');
  const [guildId, setGuildId] = useState('');
  const [myTenants, setMyTenants] = useState<TenantSummary[]>([]);
  const [discordGuilds, setDiscordGuilds] = useState<DiscordGuildSummary[]>([]);
  const [discordGuildsError, setDiscordGuildsError] = useState('');
  const [guildResources, setGuildResources] = useState<GuildResources | null>(null);
  const [guildResourcesLoading, setGuildResourcesLoading] = useState(false);
  const [guildResourcesError, setGuildResourcesError] = useState('');
  const [guildLinking, setGuildLinking] = useState(false);
  const [linkedContextKeys, setLinkedContextKeys] = useState<Record<string, boolean>>({});
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState('');

  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [createTenantName, setCreateTenantName] = useState('');

  const [paidLogChannelId, setPaidLogChannelId] = useState('');
  const [selectedStaffRoleIds, setSelectedStaffRoleIds] = useState<string[]>([]);
  const [defaultCurrency, setDefaultCurrency] = useState('GBP');

  const [botToken, setBotToken] = useState('');

  const [voodooMerchantWalletAddress, setVoodooMerchantWalletAddress] = useState('');
  const [voodooCheckoutDomain, setVoodooCheckoutDomain] = useState('checkout.voodoo-pay.uk');
  const [voodooCallbackSecret, setVoodooCallbackSecret] = useState('');
  const [voodooWebhookKey, setVoodooWebhookKey] = useState('');
  const [voodooWebhookUrl, setVoodooWebhookUrl] = useState('');
  const [autoGeneratedCallbackSecret, setAutoGeneratedCallbackSecret] = useState('');

  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  const [productCategory, setProductCategory] = useState('Accounts');
  const [productName, setProductName] = useState('Starter Account');
  const [productDescription, setProductDescription] = useState('Initial offer');
  const [productActive, setProductActive] = useState(true);

  const [variantLabelInput, setVariantLabelInput] = useState('Basic');
  const [variantPriceInput, setVariantPriceInput] = useState('9.99');
  const [variants, setVariants] = useState<PriceOptionDraft[]>([
    {
      label: 'Basic',
      priceMajor: '9.99',
      currency: 'GBP',
    },
  ]);

  const [questionKeyInput, setQuestionKeyInput] = useState('username');
  const [questionLabelInput, setQuestionLabelInput] = useState('What is your username?');
  const [questionTypeInput, setQuestionTypeInput] = useState<FieldType>('short_text');
  const [questionRequiredInput, setQuestionRequiredInput] = useState(true);
  const [questionSensitiveInput, setQuestionSensitiveInput] = useState(false);
  const [questions, setQuestions] = useState<QuestionDraft[]>([
    {
      key: 'username',
      label: 'What is your username?',
      fieldType: 'short_text',
      required: true,
      sensitive: false,
      sortOrder: 0,
    },
  ]);

  const [state, setState] = useState<RequestState>(initialState);

  const selectedDiscordGuild = useMemo(
    () => discordGuilds.find((guild) => guild.id === guildId) ?? null,
    [discordGuilds, guildId],
  );
  const contextKey = useMemo(
    () => (tenantId && guildId ? `${tenantId}:${guildId}` : ''),
    [guildId, tenantId],
  );
  const serverReady = Boolean(guildResources?.botInGuild);

  const contextPreview = useMemo(
    () => ({
      workspaceId: tenantId,
      workspaceName: myTenants.find((tenant) => tenant.id === tenantId)?.name ?? '',
      discordServerId: guildId,
      discordServerName: selectedDiscordGuild?.name ?? '',
      botInstalled: Boolean(guildResources?.botInGuild),
      defaultCurrency,
    }),
    [defaultCurrency, guildId, guildResources?.botInGuild, myTenants, selectedDiscordGuild?.name, tenantId],
  );

  const runAction = useCallback(async (action: () => Promise<unknown>) => {
    setState({ loading: true, response: '', error: '' });

    try {
      const payload = await action();
      setState({ loading: false, response: JSON.stringify(payload, null, 2), error: '' });
    } catch (error) {
      setState({
        loading: false,
        response: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, []);

  const loadSession = useCallback(async () => {
    setSessionLoading(true);
    setSessionError('');

    try {
      const response = await fetch('/api/me');
      const responseText = await response.text();
      const isJson = (response.headers.get('content-type') ?? '').includes('application/json');
      const payload = isJson ? safeJsonParse(responseText) : null;

      if (!response.ok) {
        const message =
          payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
            ? payload.error
            : responseText.startsWith('<!DOCTYPE') || responseText.startsWith('<html')
              ? 'Authentication endpoint returned HTML. Verify nginx is proxying /api to Next.js.'
              : 'Please log in with Discord to continue.';

        setSessionError(message);
        return;
      }

      const mePayload = payload as MeResponse;
      const tenants = Array.isArray(mePayload.tenants) ? mePayload.tenants : [];
      const guilds = Array.isArray(mePayload.discordGuilds) ? mePayload.discordGuilds : [];

      setIsSuperAdmin(Boolean(mePayload.me.isSuperAdmin));
      setMyTenants(tenants);
      setDiscordGuilds(guilds);
      setDiscordGuildsError(mePayload.discordGuildsError || '');
      setTenantId((current) => {
        if (current && tenants.some((tenant) => tenant.id === current)) {
          return current;
        }

        if (mePayload.me.tenantIds.length === 1) {
          return mePayload.me.tenantIds[0] ?? '';
        }

        return tenants[0]?.id ?? '';
      });
      setGuildId((current) => {
        if (current && guilds.some((guild) => guild.id === current)) {
          return current;
        }

        return guilds[0]?.id ?? '';
      });
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : 'Unable to load session');
    } finally {
      setSessionLoading(false);
    }
  }, []);

  const loadGuildResources = useCallback(async (targetGuildId: string) => {
    if (!targetGuildId) {
      setGuildResources(null);
      setGuildResourcesError('');
      return;
    }

    setGuildResourcesLoading(true);
    setGuildResourcesError('');
    try {
      const payload = (await apiCall(
        `/api/discord/guilds/${encodeURIComponent(targetGuildId)}/resources`,
      )) as GuildResources;
      setGuildResources(payload);
    } catch (error) {
      setGuildResources(null);
      setGuildResourcesError(error instanceof Error ? error.message : 'Unable to load server metadata');
    } finally {
      setGuildResourcesLoading(false);
    }
  }, []);

  const hydrateContextData = useCallback(async () => {
    const selectedTenantId = tenantId.trim();
    const selectedGuildId = guildId.trim();
    if (!selectedTenantId || !selectedGuildId) {
      return;
    }

    try {
      const configPayload = (await apiCall(
        `/api/guilds/${encodeURIComponent(selectedGuildId)}/config?tenantId=${encodeURIComponent(selectedTenantId)}`,
      )) as {
        config?: {
          paidLogChannelId: string | null;
          staffRoleIds: string[];
        };
      };

      if (configPayload.config) {
        setPaidLogChannelId(configPayload.config.paidLogChannelId ?? '');
        setSelectedStaffRoleIds(Array.isArray(configPayload.config.staffRoleIds) ? configPayload.config.staffRoleIds : []);
        setDefaultCurrency('GBP');
      }
    } catch {
      setPaidLogChannelId('');
      setSelectedStaffRoleIds([]);
      setDefaultCurrency('GBP');
    }

    try {
      const integrationPayload = (await apiCall(
        `/api/guilds/${encodeURIComponent(selectedGuildId)}/integrations/voodoopay?tenantId=${encodeURIComponent(selectedTenantId)}`,
      )) as {
        integration: null | {
          merchantWalletAddress: string;
          checkoutDomain: string;
          tenantWebhookKey: string;
          webhookUrl: string;
        };
      };

      if (integrationPayload.integration) {
        setVoodooMerchantWalletAddress(integrationPayload.integration.merchantWalletAddress);
        setVoodooCheckoutDomain(integrationPayload.integration.checkoutDomain);
        setVoodooWebhookKey(integrationPayload.integration.tenantWebhookKey);
        setVoodooWebhookUrl(integrationPayload.integration.webhookUrl);
      } else {
        setVoodooWebhookKey('');
        setVoodooWebhookUrl('');
      }
    } catch {
      setVoodooWebhookKey('');
      setVoodooWebhookUrl('');
    }

    setProductsLoading(true);
    try {
      const productsPayload = (await apiCall(
        `/api/guilds/${encodeURIComponent(selectedGuildId)}/products?tenantId=${encodeURIComponent(selectedTenantId)}`,
      )) as { products?: ProductRecord[] };
      setProducts(Array.isArray(productsPayload.products) ? productsPayload.products : []);
    } catch {
      setProducts([]);
    } finally {
      setProductsLoading(false);
    }
  }, [guildId, tenantId]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    void loadGuildResources(guildId);
  }, [guildId, loadGuildResources]);

  useEffect(() => {
    setPaidLogChannelId('');
    setSelectedStaffRoleIds([]);
    setDefaultCurrency('GBP');
    setProducts([]);
    setEditingProductId(null);
    setVoodooWebhookKey('');
    setVoodooWebhookUrl('');
    setAutoGeneratedCallbackSecret('');
  }, [tenantId, guildId]);

  useEffect(() => {
    if (!contextKey || !tenantId || !guildId || !selectedDiscordGuild || !guildResources?.botInGuild) {
      return;
    }

    if (guildLinking || linkedContextKeys[contextKey]) {
      return;
    }

    let cancelled = false;
    const selectedGuildName = selectedDiscordGuild.name;

    async function autoLinkSelectedGuild(): Promise<void> {
      setGuildLinking(true);
      try {
        await apiCall(`/api/guilds/${encodeURIComponent(guildId)}/connect`, 'POST', {
          tenantId,
          guildName: selectedGuildName,
        });
        if (!cancelled) {
          setLinkedContextKeys((current) => ({ ...current, [contextKey]: true }));
        }
      } catch (error) {
        if (!cancelled) {
          setGuildResourcesError(error instanceof Error ? error.message : 'Unable to link selected server');
        }
      } finally {
        if (!cancelled) {
          setGuildLinking(false);
        }
      }
    }

    void autoLinkSelectedGuild();

    return () => {
      cancelled = true;
    };
  }, [
    contextKey,
    guildId,
    guildLinking,
    guildResources?.botInGuild,
    linkedContextKeys,
    selectedDiscordGuild,
    tenantId,
  ]);

  useEffect(() => {
    if (!contextKey || !linkedContextKeys[contextKey]) {
      return;
    }

    void hydrateContextData();
  }, [contextKey, hydrateContextData, linkedContextKeys]);

  function requireWorkspaceAndServer(options?: { requireBot?: boolean }): { workspaceId: string; discordServerId: string } {
    const workspaceId = tenantId.trim();
    const discordServerId = guildId.trim();

    if (!workspaceId) {
      throw new Error('Select a workspace first.');
    }

    if (!discordServerId) {
      throw new Error('Select a Discord server first.');
    }

    if (options?.requireBot && !guildResources?.botInGuild) {
      throw new Error('Add the bot to this server first, then try again.');
    }

    return {
      workspaceId,
      discordServerId,
    };
  }

  function addPriceOption() {
    if (!variantLabelInput.trim()) {
      setState({ loading: false, response: '', error: 'Price option label is required.' });
      return;
    }

    try {
      parsePriceToMinor(variantPriceInput);
    } catch (error) {
      setState({
        loading: false,
        response: '',
        error: error instanceof Error ? error.message : 'Invalid price',
      });
      return;
    }

    setVariants((current) => [
      ...current,
      {
        label: variantLabelInput.trim(),
        priceMajor: variantPriceInput.trim(),
        currency: 'GBP',
      },
    ]);
  }

  function removePriceOption(index: number) {
    setVariants((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  function addQuestion() {
    if (!questionKeyInput.trim() || !questionLabelInput.trim()) {
      setState({ loading: false, response: '', error: 'Question key and question label are required.' });
      return;
    }

    setQuestions((current) => [
      ...current,
      {
        key: questionKeyInput.trim(),
        label: questionLabelInput.trim(),
        fieldType: questionTypeInput,
        required: questionRequiredInput,
        sensitive: questionSensitiveInput,
        sortOrder: current.length,
      },
    ]);
  }

  function removeQuestion(index: number) {
    setQuestions((current) =>
      current
        .filter((_, currentIndex) => currentIndex !== index)
        .map((question, sortOrder) => ({ ...question, sortOrder })),
    );
  }

  async function refreshProducts(): Promise<void> {
    const context = requireWorkspaceAndServer({ requireBot: true });
    const payload = (await apiCall(
      `/api/guilds/${encodeURIComponent(context.discordServerId)}/products?tenantId=${encodeURIComponent(context.workspaceId)}`,
    )) as { products?: ProductRecord[] };
    setProducts(Array.isArray(payload.products) ? payload.products : []);
  }

  function resetProductBuilder(): void {
    setEditingProductId(null);
    setProductCategory('Accounts');
    setProductName('Starter Account');
    setProductDescription('Initial offer');
    setProductActive(true);
    setVariants([
      {
        label: 'Basic',
        priceMajor: '9.99',
        currency: 'GBP',
      },
    ]);
    setQuestions([
      {
        key: 'username',
        label: 'What is your username?',
        fieldType: 'short_text',
        required: true,
        sensitive: false,
        sortOrder: 0,
      },
    ]);
  }

  function loadProductIntoBuilder(product: ProductRecord): void {
    setEditingProductId(product.id);
    setProductCategory(product.category);
    setProductName(product.name);
    setProductDescription(product.description);
    setProductActive(product.active);
    setVariants(
      product.variants.map((variant) => ({
        label: variant.label,
        priceMajor: (variant.priceMinor / 100).toFixed(2),
        currency: variant.currency,
      })),
    );
    setQuestions(
      product.formFields
        .map((field, index) => ({
          key: field.fieldKey,
          label: field.label,
          fieldType: field.fieldType,
          required: field.required,
          sensitive: field.sensitive,
          sortOrder: field.sortOrder ?? index,
        }))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    );
  }

  if (sessionLoading) {
    return (
      <main className="relative flex min-h-screen items-center justify-center px-4">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(45rem_30rem_at_10%_-10%,rgba(56,189,248,0.25),transparent),radial-gradient(40rem_30rem_at_90%_0%,rgba(20,184,166,0.2),transparent),radial-gradient(35rem_30rem_at_50%_120%,rgba(249,115,22,0.16),transparent)]" />
        <Card className="w-full max-w-lg border-border/70 bg-card/80 shadow-2xl shadow-black/20 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Loader2 className="size-4 animate-spin" />
              Loading Dashboard
            </CardTitle>
            <CardDescription>Checking your Discord login session...</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  if (sessionError) {
    return (
      <main className="relative flex min-h-screen items-center justify-center px-4">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(45rem_30rem_at_10%_-10%,rgba(56,189,248,0.25),transparent),radial-gradient(40rem_30rem_at_90%_0%,rgba(20,184,166,0.2),transparent),radial-gradient(35rem_30rem_at_50%_120%,rgba(249,115,22,0.16),transparent)]" />
        <Card className="w-full max-w-lg border-border/70 bg-card/80 shadow-2xl shadow-black/20 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-xl">Login Required</CardTitle>
            <CardDescription>{sessionError}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <a href="/api/auth/discord/login">Login with Discord</a>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden pb-10">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(45rem_30rem_at_10%_-10%,rgba(56,189,248,0.25),transparent),radial-gradient(40rem_30rem_at_90%_0%,rgba(20,184,166,0.2),transparent),radial-gradient(35rem_30rem_at_50%_120%,rgba(249,115,22,0.16),transparent)]" />

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-3">
            <Badge variant="secondary" className="border border-border/60 bg-card/80 px-3 py-1 text-[11px] uppercase">
              Multi-Tenant Sales Dashboard
            </Badge>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Ticket Commerce Control Center</h1>
              <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
                Pick workspace, select Discord server, then configure channels, roles, Voodoo Pay, and products without
                manual IDs.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant={isSuperAdmin ? 'default' : 'outline'} className="px-3 py-1">
              {isSuperAdmin ? 'Super Admin Session' : 'Tenant Session'}
            </Badge>
            <ModeToggle />
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-1">
          <Card className="border-border/70 bg-card/75 shadow-lg shadow-black/10 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Store className="size-4 text-primary" />
                1. Workspace + Discord Server
              </CardTitle>
              <CardDescription>
                Choose workspace and Discord server. Server linking is automatic when bot is installed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="workspace-select">Workspace</Label>
                  <select
                    id="workspace-select"
                    className={nativeSelectClass}
                    value={tenantId}
                    onChange={(event) => {
                      setTenantId(event.target.value);
                      setLinkedContextKeys({});
                    }}
                    disabled={myTenants.length === 0}
                  >
                    <option value="">
                      {myTenants.length === 0 ? 'No workspaces available yet' : 'Select workspace'}
                    </option>
                    {myTenants.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.name} ({tenant.status})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="discord-server-select">Discord Server</Label>
                  <select
                    id="discord-server-select"
                    className={nativeSelectClass}
                    value={guildId}
                    onChange={(event) => {
                      setGuildId(event.target.value);
                      setLinkedContextKeys({});
                    }}
                    disabled={discordGuilds.length === 0}
                  >
                    <option value="">
                      {discordGuilds.length === 0 ? 'No manageable Discord servers found' : 'Select Discord server'}
                    </option>
                    {discordGuilds.map((guild) => (
                      <option key={guild.id} value={guild.id}>
                        {guild.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => setShowCreateWorkspace((current) => !current)}>
                  {showCreateWorkspace ? 'Cancel New Workspace' : 'Create New Workspace'}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={state.loading || !tenantId}
                  onClick={() =>
                    runAction(async () => {
                      const selectedTenant = myTenants.find((tenant) => tenant.id === tenantId);
                      if (!selectedTenant) {
                        throw new Error('Select a workspace to delete.');
                      }

                      const confirmed = window.confirm(
                        `Delete workspace "${selectedTenant.name}" and all associated data? This cannot be undone.`,
                      );
                      if (!confirmed) {
                        return { cancelled: true };
                      }

                      await apiCall(`/api/tenants/${encodeURIComponent(selectedTenant.id)}`, 'DELETE');
                      await loadSession();
                      setLinkedContextKeys({});
                      return { deletedWorkspaceId: selectedTenant.id };
                    })
                  }
                >
                  <Trash2 className="size-4" />
                  Delete Workspace
                </Button>
              </div>

              {showCreateWorkspace ? (
                <div className="rounded-lg border border-border/60 bg-secondary/35 p-3">
                  <div className="space-y-2">
                    <Label htmlFor="workspace-name">New Workspace Name</Label>
                    <Input
                      id="workspace-name"
                      value={createTenantName}
                      onChange={(event) => setCreateTenantName(event.target.value)}
                    />
                  </div>
                  <div className="mt-3">
                    <Button
                      type="button"
                      disabled={state.loading}
                      onClick={() =>
                        runAction(async () => {
                          if (!createTenantName.trim()) {
                            throw new Error('Workspace name is required.');
                          }

                          const payload = (await apiCall('/api/tenants', 'POST', {
                            name: createTenantName.trim(),
                          })) as { tenant?: { id: string } };

                          setCreateTenantName('');
                          await loadSession();
                          if (payload.tenant?.id) {
                            setTenantId(payload.tenant.id);
                          }
                          return payload;
                        })
                      }
                    >
                      Create Workspace
                    </Button>
                  </div>
                </div>
              ) : null}

              {discordGuildsError ? (
                <p className="text-xs text-destructive">
                  {discordGuildsError}{' '}
                  <a href="/api/auth/discord/login" className="underline">
                    Reconnect Discord
                  </a>
                </p>
              ) : null}

              {guildResourcesLoading ? (
                <div className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Checking bot status and loading channels/roles...
                </div>
              ) : null}

              {guildResourcesError ? <p className="text-xs text-destructive">{guildResourcesError}</p> : null}

              {guildResources && !guildResources.botInGuild ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                  <p className="text-sm text-destructive">
                    Bot is not in <strong>{guildResources.guild.name}</strong>. Add the bot first, then continue.
                  </p>
                  <div className="mt-2">
                    <Button asChild variant="destructive">
                      <a href={guildResources.inviteUrl} target="_blank" rel="noreferrer">
                        Add Bot to Server
                      </a>
                    </Button>
                  </div>
                </div>
              ) : null}

              {guildResources?.botInGuild ? (
                <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                  Bot is installed in this server.
                  {guildLinking ? ' Linking workspace...' : ' Workspace link is managed automatically.'}
                </div>
              ) : null}

              <div className="rounded-lg border border-border/60 bg-secondary/35 p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Current Context</p>
                <pre className="whitespace-pre-wrap text-[11px] text-muted-foreground">
                  {JSON.stringify(contextPreview, null, 2)}
                </pre>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Card className="border-border/70 bg-card/75 shadow-lg shadow-black/10 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Settings2 className="size-4 text-primary" />
                2. Server Sales Settings
              </CardTitle>
              <CardDescription>Choose paid-log channel and staff roles for this server.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="paid-log-channel">Paid Order Log Channel</Label>
                <select
                  id="paid-log-channel"
                  className={nativeSelectClass}
                  value={paidLogChannelId}
                  onChange={(event) => setPaidLogChannelId(event.target.value)}
                  disabled={!serverReady || !guildResources || guildResources.channels.length === 0}
                >
                  <option value="">
                    {!serverReady
                      ? 'Add bot to server first'
                      : guildResources?.channels.length
                        ? 'Select paid-log channel'
                        : 'No text channels available'}
                  </option>
                  {guildResources?.channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      #{channel.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label>Staff Roles (can run /sale)</Label>
                {!serverReady ? (
                  <p className="text-xs text-muted-foreground">Add bot to server first.</p>
                ) : guildResources?.roles.length ? (
                  <div className="max-h-52 space-y-2 overflow-auto rounded-lg border border-border/60 bg-secondary/30 p-3">
                    {guildResources.roles.map((role) => {
                      const checked = selectedStaffRoleIds.includes(role.id);
                      return (
                        <label key={role.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(next) =>
                              setSelectedStaffRoleIds((current) =>
                                next === true ? [...new Set([...current, role.id])] : current.filter((id) => id !== role.id),
                              )
                            }
                          />
                          <span>{role.name}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No selectable roles available.</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency">Default Currency</Label>
                <Input id="currency" value={defaultCurrency} readOnly />
              </div>

              <Button
                type="button"
                disabled={state.loading || !serverReady}
                onClick={() =>
                  runAction(() => {
                    const context = requireWorkspaceAndServer({ requireBot: true });

                    return apiCall(`/api/guilds/${context.discordServerId}/config`, 'PATCH', {
                      tenantId: context.workspaceId,
                      paidLogChannelId: paidLogChannelId || null,
                      staffRoleIds: selectedStaffRoleIds,
                      defaultCurrency: 'GBP',
                      ticketMetadataKey: 'isTicket',
                    });
                  })
                }
              >
                Save Server Settings
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/75 shadow-lg shadow-black/10 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Wallet className="size-4 text-primary" />
                3. Voodoo Pay Integration
              </CardTitle>
              <CardDescription>Callback secret is optional. Leave empty to auto-generate/preserve.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="wallet-address">Merchant Wallet Address (Polygon)</Label>
                <Input
                  id="wallet-address"
                  value={voodooMerchantWalletAddress}
                  onChange={(event) => setVoodooMerchantWalletAddress(event.target.value)}
                  placeholder="0x..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="checkout-domain">Checkout Domain</Label>
                <Input
                  id="checkout-domain"
                  value={voodooCheckoutDomain}
                  onChange={(event) => setVoodooCheckoutDomain(event.target.value)}
                  placeholder="checkout.voodoo-pay.uk"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="callback-secret">Callback Secret (optional override)</Label>
                <Input
                  id="callback-secret"
                  type="password"
                  value={voodooCallbackSecret}
                  onChange={(event) => setVoodooCallbackSecret(event.target.value)}
                  placeholder="Leave blank to auto-generate or keep existing"
                />
              </div>

              <Button
                type="button"
                disabled={state.loading || !serverReady}
                onClick={() =>
                  runAction(async () => {
                    const context = requireWorkspaceAndServer({ requireBot: true });
                    const payload: {
                      tenantId: string;
                      merchantWalletAddress: string;
                      checkoutDomain: string;
                      callbackSecret?: string;
                    } = {
                      tenantId: context.workspaceId,
                      merchantWalletAddress: voodooMerchantWalletAddress,
                      checkoutDomain: voodooCheckoutDomain,
                    };

                    if (voodooCallbackSecret.trim()) {
                      payload.callbackSecret = voodooCallbackSecret.trim();
                    }

                    const result = (await apiCall(
                      `/api/guilds/${context.discordServerId}/integrations/voodoopay`,
                      'PUT',
                      payload,
                    )) as {
                      webhookUrl: string;
                      tenantWebhookKey: string;
                      callbackSecretGenerated?: string | null;
                    };

                    setVoodooWebhookUrl(result.webhookUrl);
                    setVoodooWebhookKey(result.tenantWebhookKey);
                    setAutoGeneratedCallbackSecret(result.callbackSecretGenerated ?? '');
                    setVoodooCallbackSecret('');
                    await hydrateContextData();
                    return result;
                  })
                }
              >
                Save Voodoo Pay Integration
              </Button>

              {voodooWebhookUrl ? (
                <div className="rounded-lg border border-border/60 bg-secondary/35 p-3 text-sm">
                  <p className="font-medium">Webhook URL</p>
                  <p className="mt-1 break-all text-muted-foreground">{voodooWebhookUrl}</p>
                  <p className="mt-2 text-xs text-muted-foreground">Webhook Key: {voodooWebhookKey}</p>
                </div>
              ) : null}

              {autoGeneratedCallbackSecret ? (
                <div className="rounded-lg border border-amber-300/40 bg-amber-500/10 p-3 text-sm text-amber-100">
                  <p className="font-medium">Auto-generated Callback Secret</p>
                  <p className="mt-1 break-all font-mono text-xs">{autoGeneratedCallbackSecret}</p>
                  <p className="mt-2 text-xs text-amber-100/80">
                    Save this value in your Voodoo Pay callback settings if your gateway account requires a callback
                    secret.
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </section>
        <section className={cn('grid gap-6', isSuperAdmin ? 'xl:grid-cols-3' : 'xl:grid-cols-1')}>
          <Card
            className={cn(
              'border-border/70 bg-card/75 shadow-lg shadow-black/10 backdrop-blur',
              isSuperAdmin ? 'xl:col-span-2' : '',
            )}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Globe className="size-4 text-primary" />
                4. Products, Prices, and Customer Questions
              </CardTitle>
              <CardDescription>Create, edit, and delete products for this server.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Existing Products</h3>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={productsLoading || !serverReady}
                    onClick={() =>
                      runAction(async () => {
                        await refreshProducts();
                        return { productCount: products.length };
                      })
                    }
                  >
                    {productsLoading ? <Loader2 className="size-4 animate-spin" /> : null}
                    Refresh
                  </Button>
                </div>

                <div className="space-y-2">
                  {products.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No products yet for this server.</p>
                  ) : (
                    products.map((product) => (
                      <div
                        key={product.id}
                        className="rounded-lg border border-border/60 bg-secondary/35 px-3 py-3 text-sm"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{product.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {product.category} • {product.active ? 'Active' : 'Inactive'} • {product.variants.length}{' '}
                              price option(s)
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button type="button" size="sm" variant="outline" onClick={() => loadProductIntoBuilder(product)}>
                              Edit
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              onClick={() =>
                                runAction(async () => {
                                  const context = requireWorkspaceAndServer({ requireBot: true });
                                  const confirmed = window.confirm(`Delete product "${product.name}"?`);
                                  if (!confirmed) {
                                    return { cancelled: true };
                                  }

                                  await apiCall(
                                    `/api/guilds/${encodeURIComponent(context.discordServerId)}/products/${encodeURIComponent(product.id)}?tenantId=${encodeURIComponent(context.workspaceId)}`,
                                    'DELETE',
                                  );

                                  await refreshProducts();
                                  if (editingProductId === product.id) {
                                    resetProductBuilder();
                                  }
                                  return { deletedProductId: product.id };
                                })
                              }
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="product-category">Product Category</Label>
                  <Input
                    id="product-category"
                    value={productCategory}
                    onChange={(event) => setProductCategory(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="product-name">Product Name</Label>
                  <Input id="product-name" value={productName} onChange={(event) => setProductName(event.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="product-description">Description</Label>
                <Textarea
                  id="product-description"
                  value={productDescription}
                  onChange={(event) => setProductDescription(event.target.value)}
                  className="min-h-24"
                />
              </div>

              <div className="inline-flex items-center gap-2">
                <Checkbox
                  id="product-active"
                  checked={productActive}
                  onCheckedChange={(checked) => setProductActive(checked === true)}
                />
                <Label htmlFor="product-active" className="text-sm font-normal text-muted-foreground">
                  Product active
                </Label>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Price Options (GBP)</h3>
                  <Badge variant="outline">{variants.length} option(s)</Badge>
                </div>

                <div className="space-y-2">
                  {variants.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No price options yet.</p>
                  ) : (
                    variants.map((variant, index) => (
                      <div
                        key={`${variant.label}-${index}`}
                        className="flex items-center justify-between rounded-lg border border-border/60 bg-secondary/35 px-3 py-2"
                      >
                        <p className="text-sm">
                          {variant.label}: {variant.priceMajor} {variant.currency}
                        </p>
                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => removePriceOption(index)}>
                          <X className="size-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="variant-label">Price Label</Label>
                    <Input
                      id="variant-label"
                      value={variantLabelInput}
                      onChange={(event) => setVariantLabelInput(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="variant-price">Price (major unit)</Label>
                    <Input
                      id="variant-price"
                      value={variantPriceInput}
                      onChange={(event) => setVariantPriceInput(event.target.value)}
                      placeholder="9.99"
                    />
                  </div>
                </div>

                <Button type="button" variant="outline" onClick={addPriceOption}>
                  <Plus className="size-4" />
                  Add Price Option
                </Button>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Customer Questions
                  </h3>
                  <Badge variant="outline">{questions.length} question(s)</Badge>
                </div>

                <div className="space-y-2">
                  {questions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No questions yet.</p>
                  ) : (
                    questions.map((question, index) => (
                      <div
                        key={`${question.key}-${index}`}
                        className="flex items-center justify-between rounded-lg border border-border/60 bg-secondary/35 px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-medium">{question.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {question.fieldType} • {question.required ? 'Required' : 'Optional'} •{' '}
                            {question.sensitive ? 'Sensitive' : 'Not sensitive'}
                          </p>
                        </div>
                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeQuestion(index)}>
                          <X className="size-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="question-key">Question Key</Label>
                    <Input
                      id="question-key"
                      value={questionKeyInput}
                      onChange={(event) => setQuestionKeyInput(event.target.value)}
                      placeholder="email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="question-label">Question Label</Label>
                    <Input
                      id="question-label"
                      value={questionLabelInput}
                      onChange={(event) => setQuestionLabelInput(event.target.value)}
                      placeholder="What is your email?"
                    />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="question-type">Input Type</Label>
                    <select
                      id="question-type"
                      className={nativeSelectClass}
                      value={questionTypeInput}
                      onChange={(event) => setQuestionTypeInput(event.target.value as FieldType)}
                    >
                      <option value="short_text">Short text</option>
                      <option value="long_text">Long text</option>
                      <option value="email">Email</option>
                      <option value="number">Number</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2 self-end">
                    <Checkbox
                      id="question-required"
                      checked={questionRequiredInput}
                      onCheckedChange={(checked) => setQuestionRequiredInput(checked === true)}
                    />
                    <Label htmlFor="question-required" className="text-sm font-normal text-muted-foreground">
                      Required
                    </Label>
                  </div>
                  <div className="flex items-center gap-2 self-end">
                    <Checkbox
                      id="question-sensitive"
                      checked={questionSensitiveInput}
                      onCheckedChange={(checked) => setQuestionSensitiveInput(checked === true)}
                    />
                    <Label htmlFor="question-sensitive" className="text-sm font-normal text-muted-foreground">
                      Sensitive
                    </Label>
                  </div>
                </div>

                <Button type="button" variant="outline" onClick={addQuestion}>
                  <Plus className="size-4" />
                  Add Question
                </Button>
              </div>

              <div className="flex flex-col gap-2 pt-2 sm:flex-row">
                <Button
                  type="button"
                  disabled={state.loading || !serverReady}
                  className="sm:flex-1"
                  onClick={() =>
                    runAction(async () => {
                      const context = requireWorkspaceAndServer({ requireBot: true });

                      if (variants.length === 0) {
                        throw new Error('Add at least one price option.');
                      }

                      const preparedVariants = variants.map((variant) => ({
                        label: variant.label.trim(),
                        priceMinor: parsePriceToMinor(variant.priceMajor),
                        currency: 'GBP',
                      }));

                      const preparedQuestions = questions.map((question, sortOrder) => ({
                        ...question,
                        sortOrder,
                      }));

                      const productPayload = {
                        category: productCategory,
                        name: productName,
                        description: productDescription,
                        active: productActive,
                        variants: preparedVariants,
                      };

                      if (editingProductId) {
                        await apiCall(
                          `/api/guilds/${encodeURIComponent(context.discordServerId)}/products/${encodeURIComponent(editingProductId)}`,
                          'PATCH',
                          {
                            tenantId: context.workspaceId,
                            product: productPayload,
                          },
                        );
                        await apiCall(
                          `/api/guilds/${encodeURIComponent(context.discordServerId)}/forms/${encodeURIComponent(editingProductId)}`,
                          'PUT',
                          {
                            tenantId: context.workspaceId,
                            formFields: preparedQuestions,
                          },
                        );
                      } else {
                        await apiCall(`/api/guilds/${context.discordServerId}/products`, 'POST', {
                          tenantId: context.workspaceId,
                          product: productPayload,
                          formFields: preparedQuestions,
                        });
                      }

                      await refreshProducts();
                      resetProductBuilder();
                      return { mode: editingProductId ? 'updated' : 'created' };
                    })
                  }
                >
                  {editingProductId ? 'Update Product' : 'Create Product'}
                </Button>

                {editingProductId ? (
                  <Button type="button" variant="outline" className="sm:flex-1" onClick={resetProductBuilder}>
                    Cancel Edit
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
          {isSuperAdmin ? (
            <Card className="border-border/70 bg-card/75 shadow-lg shadow-black/10 backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Shield className="size-4 text-primary" />
                  Super Admin
                </CardTitle>
                <CardDescription>Global operations only visible to super-admin sessions.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="global-bot-token">Global Bot Token</Label>
                  <Input
                    id="global-bot-token"
                    value={botToken}
                    onChange={(event) => setBotToken(event.target.value)}
                    type="password"
                  />
                </div>
                <Button
                  type="button"
                  disabled={state.loading}
                  onClick={() =>
                    runAction(() => {
                      if (!botToken.trim()) {
                        throw new Error('Bot token is required.');
                      }

                      return apiCall('/api/admin/bot-token', 'POST', { token: botToken.trim() });
                    })
                  }
                >
                  Rotate Bot Token
                </Button>

                <Separator />

                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={state.loading}
                    onClick={() => runAction(() => apiCall('/api/admin/tenants'))}
                  >
                    List All Tenants
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={state.loading}
                    onClick={() => runAction(() => apiCall('/api/admin/users'))}
                  >
                    List All Users
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </section>

        <Card className="border-border/70 bg-card/75 shadow-lg shadow-black/10 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="size-4 text-primary" />
              Latest Action
            </CardTitle>
            <CardDescription>Real-time result from your last dashboard API call.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {state.loading ? (
              <div className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Processing request...
              </div>
            ) : null}

            {state.error ? (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="mt-0.5 size-4" />
                <span>{state.error}</span>
              </div>
            ) : null}

            {state.response ? (
              <div className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                <p className="mb-2 inline-flex items-center gap-2 text-emerald-200">
                  <CheckCircle2 className="size-4" />
                  Request succeeded
                </p>
                <pre className="whitespace-pre-wrap text-xs leading-relaxed text-emerald-100/90">{state.response}</pre>
              </div>
            ) : null}

            {!state.loading && !state.error && !state.response ? (
              <p className="text-sm text-muted-foreground">No actions yet in this session.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

