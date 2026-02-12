'use client';

import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Globe,
  Link2,
  Loader2,
  Plus,
  Settings2,
  Shield,
  Store,
  Wallet,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { ModeToggle } from '@/components/mode-toggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

type MeResponse = {
  me: {
    userId: string;
    isSuperAdmin: boolean;
    tenantIds: string[];
  };
  tenants: TenantSummary[];
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
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState('');

  const [createTenantName, setCreateTenantName] = useState('');
  const [connectGuildName, setConnectGuildName] = useState('');

  const [paidLogChannelId, setPaidLogChannelId] = useState('');
  const [staffRoleIds, setStaffRoleIds] = useState('');
  const [defaultCurrency, setDefaultCurrency] = useState('USD');
  const [ticketMetadataKey, setTicketMetadataKey] = useState('isTicket');

  const [botToken, setBotToken] = useState('');

  const [voodooMerchantWalletAddress, setVoodooMerchantWalletAddress] = useState('');
  const [voodooCheckoutDomain, setVoodooCheckoutDomain] = useState('checkout.voodoo-pay.uk');
  const [voodooCallbackSecret, setVoodooCallbackSecret] = useState('');

  const [productCategory, setProductCategory] = useState('Accounts');
  const [productName, setProductName] = useState('Starter Account');
  const [productDescription, setProductDescription] = useState('Initial offer');
  const [productActive, setProductActive] = useState(true);

  const [variantLabelInput, setVariantLabelInput] = useState('Basic');
  const [variantPriceInput, setVariantPriceInput] = useState('9.99');
  const [variantCurrencyInput, setVariantCurrencyInput] = useState('USD');
  const [variants, setVariants] = useState<PriceOptionDraft[]>([
    {
      label: 'Basic',
      priceMajor: '9.99',
      currency: 'USD',
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

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
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

          if (!cancelled) {
            setSessionError(message);
          }

          return;
        }

        const mePayload = payload as MeResponse;
        if (!cancelled) {
          setIsSuperAdmin(Boolean(mePayload.me.isSuperAdmin));
          setMyTenants(Array.isArray(mePayload.tenants) ? mePayload.tenants : []);
          if (mePayload.me.tenantIds.length === 1) {
            const onlyTenantId = mePayload.me.tenantIds[0];
            if (onlyTenantId) {
              setTenantId((current) => current || onlyTenantId);
            }
          }
        }
      } catch (error) {
        if (!cancelled) {
          setSessionError(error instanceof Error ? error.message : 'Unable to load session');
        }
      } finally {
        if (!cancelled) {
          setSessionLoading(false);
        }
      }
    }

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const contextPreview = useMemo(
    () => ({
      workspaceId: tenantId,
      discordServerId: guildId,
      defaultCurrency,
    }),
    [defaultCurrency, guildId, tenantId],
  );

  function requireWorkspaceAndServer(): { workspaceId: string; discordServerId: string } {
    const workspaceId = tenantId.trim();
    const discordServerId = guildId.trim();

    if (!workspaceId) {
      throw new Error('Workspace ID is required. Create or select a workspace first.');
    }

    if (!discordServerId) {
      throw new Error('Discord Server ID is required.');
    }

    return {
      workspaceId,
      discordServerId,
    };
  }

  async function runAction(action: () => Promise<unknown>) {
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
        currency: variantCurrencyInput.trim().toUpperCase() || 'USD',
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
                Workspace means tenant account. Discord Server ID means guild ID. Configure integration, products,
                prices, and customer questions from one place.
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

        <section className="grid gap-6 lg:grid-cols-3">
          <Card className="border-border/70 bg-card/75 shadow-lg shadow-black/10 backdrop-blur lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Store className="size-4 text-primary" />
                Workspace + Server
              </CardTitle>
              <CardDescription>Select workspace and target Discord server before saving config.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {myTenants.length > 0 ? (
                <div className="space-y-2">
                  <Label htmlFor="workspace-select">Your Workspace</Label>
                  <select
                    id="workspace-select"
                    className={nativeSelectClass}
                    value={tenantId}
                    onChange={(event) => setTenantId(event.target.value)}
                  >
                    <option value="">Select workspace</option>
                    {myTenants.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.name} ({tenant.status})
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="workspace-id">Workspace ID (manual)</Label>
                <Input
                  id="workspace-id"
                  value={tenantId}
                  onChange={(event) => setTenantId(event.target.value)}
                  placeholder="tenant_..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="guild-id">Discord Server ID</Label>
                <Input
                  id="guild-id"
                  value={guildId}
                  onChange={(event) => setGuildId(event.target.value)}
                  placeholder="1234567890"
                />
              </div>

              <div className="rounded-lg border border-border/60 bg-secondary/35 p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Current Context</p>
                <pre className="whitespace-pre-wrap text-[11px] text-muted-foreground">
                  {JSON.stringify(contextPreview, null, 2)}
                </pre>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/70 bg-card/75 shadow-lg shadow-black/10 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-lg">Create Workspace</CardTitle>
              <CardDescription>Each merchant account should have its own workspace.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="workspace-name">Workspace Name</Label>
                <Input
                  id="workspace-name"
                  value={createTenantName}
                  onChange={(event) => setCreateTenantName(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  className="sm:flex-1"
                  disabled={state.loading}
                  onClick={() =>
                    runAction(() => {
                      if (!createTenantName.trim()) {
                        throw new Error('Workspace name is required.');
                      }

                      return apiCall('/api/tenants', 'POST', { name: createTenantName.trim() });
                    })
                  }
                >
                  Create Workspace
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="sm:flex-1"
                  disabled={state.loading}
                  onClick={() => runAction(() => apiCall('/api/tenants'))}
                >
                  List My Workspaces
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/75 shadow-lg shadow-black/10 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Link2 className="size-4 text-primary" />
                Link Discord Server
              </CardTitle>
              <CardDescription>Bind the selected workspace to your Discord server ID.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="guild-name">Server Name</Label>
                <Input
                  id="guild-name"
                  value={connectGuildName}
                  onChange={(event) => setConnectGuildName(event.target.value)}
                />
              </div>
              <Button
                type="button"
                disabled={state.loading}
                onClick={() =>
                  runAction(() => {
                    const context = requireWorkspaceAndServer();

                    if (!connectGuildName.trim()) {
                      throw new Error('Server name is required.');
                    }

                    return apiCall(`/api/guilds/${context.discordServerId}/connect`, 'POST', {
                      tenantId: context.workspaceId,
                      guildName: connectGuildName.trim(),
                    });
                  })
                }
              >
                Link Server
              </Button>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Card className="border-border/70 bg-card/75 shadow-lg shadow-black/10 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Settings2 className="size-4 text-primary" />
                Server Sales Settings
              </CardTitle>
              <CardDescription>
                Configure paid logs, staff roles, default currency, and ticket metadata key.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="paid-log-channel">Paid Order Log Channel ID</Label>
                <Input
                  id="paid-log-channel"
                  value={paidLogChannelId}
                  onChange={(event) => setPaidLogChannelId(event.target.value)}
                  placeholder="1234567890"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="staff-role-ids">Staff Role IDs (comma-separated)</Label>
                <Input
                  id="staff-role-ids"
                  value={staffRoleIds}
                  onChange={(event) => setStaffRoleIds(event.target.value)}
                  placeholder="1111,2222"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Input
                    id="currency"
                    value={defaultCurrency}
                    maxLength={3}
                    onChange={(event) => setDefaultCurrency(event.target.value.toUpperCase().slice(0, 3))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ticket-key">Ticket Flag Key (advanced)</Label>
                  <Input
                    id="ticket-key"
                    value={ticketMetadataKey}
                    onChange={(event) => setTicketMetadataKey(event.target.value)}
                  />
                </div>
              </div>

              <Button
                type="button"
                disabled={state.loading}
                onClick={() =>
                  runAction(() => {
                    const context = requireWorkspaceAndServer();

                    if (defaultCurrency.trim().length !== 3) {
                      throw new Error('Currency must be a 3-letter code, for example GBP.');
                    }

                    return apiCall(`/api/guilds/${context.discordServerId}/config`, 'PATCH', {
                      tenantId: context.workspaceId,
                      paidLogChannelId: paidLogChannelId || null,
                      staffRoleIds: staffRoleIds
                        .split(',')
                        .map((value) => value.trim())
                        .filter(Boolean),
                      defaultCurrency: defaultCurrency.trim().toUpperCase(),
                      ticketMetadataKey,
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
                Voodoo Pay Integration
              </CardTitle>
              <CardDescription>
                Multi-provider checkout mode where users select provider on Voodoo Pay.
              </CardDescription>
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
                <Label htmlFor="callback-secret">Callback Secret</Label>
                <Input
                  id="callback-secret"
                  type="password"
                  value={voodooCallbackSecret}
                  onChange={(event) => setVoodooCallbackSecret(event.target.value)}
                  placeholder="at least 16 characters"
                />
                <p className="text-xs text-muted-foreground">
                  Use a random secret (32+ characters recommended). This app stores it and uses it to verify callback
                  authenticity.
                </p>
              </div>

              <Button
                type="button"
                disabled={state.loading}
                onClick={() =>
                  runAction(() => {
                    const context = requireWorkspaceAndServer();

                    return apiCall(`/api/guilds/${context.discordServerId}/integrations/voodoopay`, 'PUT', {
                      tenantId: context.workspaceId,
                      merchantWalletAddress: voodooMerchantWalletAddress,
                      checkoutDomain: voodooCheckoutDomain,
                      callbackSecret: voodooCallbackSecret,
                    });
                  })
                }
              >
                Save Voodoo Pay Integration
              </Button>
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
                Products, Prices, and Customer Questions
              </CardTitle>
              <CardDescription>
                Create structured products without JSON editing. This data powers the ticket sale flow.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
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

              <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={productActive}
                  onChange={(event) => setProductActive(event.target.checked)}
                  className="size-4 rounded border border-border bg-background"
                />
                Product active
              </label>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Price Options</h3>
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

                <div className="grid gap-3 md:grid-cols-3">
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
                  <div className="space-y-2">
                    <Label htmlFor="variant-currency">Currency</Label>
                    <Input
                      id="variant-currency"
                      value={variantCurrencyInput}
                      maxLength={3}
                      onChange={(event) => setVariantCurrencyInput(event.target.value.toUpperCase().slice(0, 3))}
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
                  <label className="flex items-center gap-2 self-end text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={questionRequiredInput}
                      onChange={(event) => setQuestionRequiredInput(event.target.checked)}
                      className="size-4 rounded border border-border bg-background"
                    />
                    Required
                  </label>
                  <label className="flex items-center gap-2 self-end text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={questionSensitiveInput}
                      onChange={(event) => setQuestionSensitiveInput(event.target.checked)}
                      className="size-4 rounded border border-border bg-background"
                    />
                    Sensitive
                  </label>
                </div>

                <Button type="button" variant="outline" onClick={addQuestion}>
                  <Plus className="size-4" />
                  Add Question
                </Button>
              </div>

              <div className="flex flex-col gap-2 pt-2 sm:flex-row">
                <Button
                  type="button"
                  disabled={state.loading}
                  className="sm:flex-1"
                  onClick={() =>
                    runAction(async () => {
                      const context = requireWorkspaceAndServer();

                      if (variants.length === 0) {
                        throw new Error('Add at least one price option.');
                      }

                      const preparedVariants = variants.map((variant) => {
                        const currency = variant.currency.trim().toUpperCase();

                        if (currency.length !== 3) {
                          throw new Error(`Currency for variant "${variant.label}" must be 3 letters.`);
                        }

                        return {
                          label: variant.label.trim(),
                          priceMinor: parsePriceToMinor(variant.priceMajor),
                          currency,
                        };
                      });

                      const preparedQuestions = questions.map((question, sortOrder) => ({
                        ...question,
                        sortOrder,
                      }));

                      return apiCall(`/api/guilds/${context.discordServerId}/products`, 'POST', {
                        tenantId: context.workspaceId,
                        product: {
                          category: productCategory,
                          name: productName,
                          description: productDescription,
                          active: productActive,
                          variants: preparedVariants,
                        },
                        formFields: preparedQuestions,
                      });
                    })
                  }
                >
                  Create Product
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  disabled={state.loading}
                  className="sm:flex-1"
                  onClick={() =>
                    runAction(() => {
                      const context = requireWorkspaceAndServer();

                      return apiCall(
                        `/api/guilds/${context.discordServerId}/products?tenantId=${encodeURIComponent(context.workspaceId)}`,
                      );
                    })
                  }
                >
                  List Products
                </Button>
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

