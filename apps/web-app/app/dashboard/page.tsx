'use client';

import { useEffect, useMemo, useState } from 'react';

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
  let payload: unknown = null;

  if (isJson && responseText.length > 0) {
    payload = JSON.parse(responseText) as unknown;
  }

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
        const payload = isJson && responseText.length > 0 ? (JSON.parse(responseText) as unknown) : null;

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

  const preview = useMemo(
    () => ({
      workspaceId: tenantId,
      discordServerId: guildId,
      defaultCurrency,
    }),
    [tenantId, guildId, defaultCurrency],
  );

  function requireWorkspaceAndServer(): { workspaceId: string; discordServerId: string } {
    const workspaceId = tenantId.trim();
    const discordServerId = guildId.trim();

    if (!workspaceId) {
      throw new Error('Workspace ID is required.');
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

  function addPriceOption(): void {
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

  function removePriceOption(index: number): void {
    setVariants((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  function addQuestion(): void {
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

  function removeQuestion(index: number): void {
    setQuestions((current) =>
      current
        .filter((_, currentIndex) => currentIndex !== index)
        .map((question, sortOrder) => ({ ...question, sortOrder })),
    );
  }

  if (sessionLoading) {
    return (
      <main className="grid" style={{ gap: '18px' }}>
        <section className="card grid" style={{ gap: '12px' }}>
          <h1>Loading Dashboard</h1>
          <p>Checking your Discord login session...</p>
        </section>
      </main>
    );
  }

  if (sessionError) {
    return (
      <main className="grid" style={{ gap: '18px' }}>
        <section className="card grid" style={{ gap: '12px' }}>
          <h1>Login Required</h1>
          <p>{sessionError}</p>
          <a href="/api/auth/discord/login">
            <button type="button">Login with Discord</button>
          </a>
        </section>
      </main>
    );
  }

  return (
    <main className="grid" style={{ gap: '18px' }}>
      <section className="card grid" style={{ gap: '12px' }}>
        <h1>Sales Dashboard</h1>
        <p>
          Plain language mapping: Workspace = tenant account, and Discord Server ID = guild ID.
          Use this dashboard to set up products, prices, questions, and API payment integration.
        </p>
      </section>

      <section className="card grid" style={{ gap: '8px' }}>
        <h3>Quick Setup Order</h3>
        <p>
          1) Pick your workspace and server. 2) Save server settings + payment integration. 3) Add product,
          prices, and customer questions.
        </p>
      </section>

      <section className="grid cols-3">
        <div className="card grid" style={{ gap: '10px' }}>
          <h3>Workspace + Server Context</h3>
          {myTenants.length > 0 ? (
            <div>
              <label>Your Workspace</label>
              <select value={tenantId} onChange={(event) => setTenantId(event.target.value)}>
                <option value="">Select workspace</option>
                {myTenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name} ({tenant.status})
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div>
            <label>Workspace ID (manual)</label>
            <input
              value={tenantId}
              onChange={(event) => setTenantId(event.target.value)}
              placeholder="tenant_..."
            />
          </div>
          <div>
            <label>Discord Server ID</label>
            <input value={guildId} onChange={(event) => setGuildId(event.target.value)} placeholder="1234567890" />
          </div>
          <pre className="code">{JSON.stringify(preview, null, 2)}</pre>
        </div>

        <div className="card grid" style={{ gap: '10px' }}>
          <h3>Create Workspace</h3>
          <div>
            <label>Workspace Name</label>
            <input value={createTenantName} onChange={(event) => setCreateTenantName(event.target.value)} />
          </div>
          <button
            type="button"
            onClick={() => runAction(() => apiCall('/api/tenants', 'POST', { name: createTenantName }))}
          >
            Create Workspace
          </button>
          <button type="button" className="secondary" onClick={() => runAction(() => apiCall('/api/tenants'))}>
            List My Workspaces
          </button>
        </div>

        <div className="card grid" style={{ gap: '10px' }}>
          <h3>Link Discord Server</h3>
          <div>
            <label>Server Name</label>
            <input value={connectGuildName} onChange={(event) => setConnectGuildName(event.target.value)} />
          </div>
          <button
            type="button"
            onClick={() =>
              runAction(() => {
                const context = requireWorkspaceAndServer();
                return apiCall(`/api/guilds/${context.discordServerId}/connect`, 'POST', {
                  tenantId: context.workspaceId,
                  guildName: connectGuildName,
                });
              })
            }
          >
            Link Server
          </button>
        </div>
      </section>

      <section className="grid cols-2">
        <div className="card grid" style={{ gap: '10px' }}>
          <h3>Server Sales Settings</h3>
          <div>
            <label>Paid Order Log Channel ID</label>
            <input
              value={paidLogChannelId}
              onChange={(event) => setPaidLogChannelId(event.target.value)}
              placeholder="1234567890"
            />
          </div>
          <div>
            <label>Staff Role IDs (comma-separated)</label>
            <input value={staffRoleIds} onChange={(event) => setStaffRoleIds(event.target.value)} />
          </div>
          <div className="grid cols-2">
            <div>
              <label>Currency</label>
              <input
                value={defaultCurrency}
                onChange={(event) => setDefaultCurrency(event.target.value.toUpperCase().slice(0, 3))}
                maxLength={3}
              />
            </div>
            <div>
              <label>Ticket Flag Key (advanced)</label>
              <input value={ticketMetadataKey} onChange={(event) => setTicketMetadataKey(event.target.value)} />
            </div>
          </div>
          <button
            type="button"
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
          </button>
        </div>

        <div className="card grid" style={{ gap: '10px' }}>
          <h3>Voodoo Pay Integration</h3>
          <p>Multi-provider checkout mode. Customer selects provider on hosted Voodoo Pay page.</p>
          <div>
            <label>Merchant Wallet Address (Polygon)</label>
            <input
              value={voodooMerchantWalletAddress}
              onChange={(event) => setVoodooMerchantWalletAddress(event.target.value)}
              placeholder="0x..."
            />
          </div>
          <div>
            <label>Checkout Domain</label>
            <input
              value={voodooCheckoutDomain}
              onChange={(event) => setVoodooCheckoutDomain(event.target.value)}
              placeholder="checkout.voodoo-pay.uk"
            />
          </div>
          <div>
            <label>Callback Secret</label>
            <input
              type="password"
              value={voodooCallbackSecret}
              onChange={(event) => setVoodooCallbackSecret(event.target.value)}
              placeholder="at least 16 characters"
            />
            <p style={{ marginTop: '6px', fontSize: '0.85rem', opacity: 0.85 }}>
              Use a random secret (32+ characters recommended). This app stores it and uses it to verify callback authenticity.
            </p>
          </div>
          <button
            type="button"
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
          </button>
        </div>
      </section>

      <section className={isSuperAdmin ? 'grid cols-2' : 'grid'}>
        <div className="card grid" style={{ gap: '10px' }}>
          <h3>Products, Prices, and Customer Questions</h3>
          <div>
            <label>Product Category</label>
            <input value={productCategory} onChange={(event) => setProductCategory(event.target.value)} />
          </div>
          <div>
            <label>Product Name</label>
            <input value={productName} onChange={(event) => setProductName(event.target.value)} />
          </div>
          <div>
            <label>Description</label>
            <input value={productDescription} onChange={(event) => setProductDescription(event.target.value)} />
          </div>
          <label>
            <input type="checkbox" checked={productActive} onChange={(event) => setProductActive(event.target.checked)} />{' '}
            Product active
          </label>

          <div className="card grid" style={{ gap: '8px' }}>
            <h3>Price Options</h3>
            {variants.length === 0 ? <p>No price options yet.</p> : null}
            {variants.map((variant, index) => (
              <div key={`${variant.label}-${index}`} className="grid cols-2">
                <p>
                  {variant.label}: {variant.priceMajor} {variant.currency}
                </p>
                <button type="button" className="secondary" onClick={() => removePriceOption(index)}>
                  Remove
                </button>
              </div>
            ))}
            <div className="grid cols-2">
              <div>
                <label>Price Label</label>
                <input value={variantLabelInput} onChange={(event) => setVariantLabelInput(event.target.value)} />
              </div>
              <div>
                <label>Price (major unit)</label>
                <input
                  value={variantPriceInput}
                  onChange={(event) => setVariantPriceInput(event.target.value)}
                  placeholder="9.99"
                />
              </div>
            </div>
            <div>
              <label>Currency</label>
              <input
                value={variantCurrencyInput}
                onChange={(event) => setVariantCurrencyInput(event.target.value.toUpperCase().slice(0, 3))}
                maxLength={3}
              />
            </div>
            <button type="button" className="secondary" onClick={addPriceOption}>
              Add Price Option
            </button>
          </div>

          <div className="card grid" style={{ gap: '8px' }}>
            <h3>Questions for Customer</h3>
            {questions.length === 0 ? <p>No questions yet.</p> : null}
            {questions.map((question, index) => (
              <div key={`${question.key}-${index}`} className="grid cols-2">
                <p>
                  {question.label} ({question.fieldType})
                </p>
                <button type="button" className="secondary" onClick={() => removeQuestion(index)}>
                  Remove
                </button>
              </div>
            ))}
            <div className="grid cols-2">
              <div>
                <label>Question Key</label>
                <input
                  value={questionKeyInput}
                  onChange={(event) => setQuestionKeyInput(event.target.value)}
                  placeholder="email"
                />
              </div>
              <div>
                <label>Question Label</label>
                <input
                  value={questionLabelInput}
                  onChange={(event) => setQuestionLabelInput(event.target.value)}
                  placeholder="What is your email?"
                />
              </div>
            </div>
            <div className="grid cols-2">
              <div>
                <label>Input Type</label>
                <select
                  value={questionTypeInput}
                  onChange={(event) => setQuestionTypeInput(event.target.value as FieldType)}
                >
                  <option value="short_text">Short text</option>
                  <option value="long_text">Long text</option>
                  <option value="email">Email</option>
                  <option value="number">Number</option>
                </select>
              </div>
              <div className="grid cols-2">
                <label>
                  <input
                    type="checkbox"
                    checked={questionRequiredInput}
                    onChange={(event) => setQuestionRequiredInput(event.target.checked)}
                  />{' '}
                  Required
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={questionSensitiveInput}
                    onChange={(event) => setQuestionSensitiveInput(event.target.checked)}
                  />{' '}
                  Sensitive
                </label>
              </div>
            </div>
            <button type="button" className="secondary" onClick={addQuestion}>
              Add Question
            </button>
          </div>

          <button
            type="button"
            onClick={() =>
              runAction(async () => {
                const context = requireWorkspaceAndServer();
                const preparedVariants = variants.map((variant) => ({
                  label: variant.label.trim(),
                  priceMinor: parsePriceToMinor(variant.priceMajor),
                  currency: variant.currency.trim().toUpperCase(),
                }));

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
          </button>
          <button
            type="button"
            className="secondary"
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
          </button>
        </div>

        {isSuperAdmin ? (
          <div className="card grid" style={{ gap: '10px' }}>
            <h3>Super Admin</h3>
            <div>
              <label>Global Bot Token</label>
              <input value={botToken} onChange={(event) => setBotToken(event.target.value)} />
            </div>
            <button
              type="button"
              onClick={() => runAction(() => apiCall('/api/admin/bot-token', 'POST', { token: botToken }))}
            >
              Rotate Bot Token
            </button>
            <div className="grid cols-2">
              <button type="button" className="secondary" onClick={() => runAction(() => apiCall('/api/admin/tenants'))}>
                List All Tenants
              </button>
              <button type="button" className="secondary" onClick={() => runAction(() => apiCall('/api/admin/users'))}>
                List All Users
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="card grid" style={{ gap: '8px' }}>
        <h3>Latest Action</h3>
        {state.loading ? <p>Processing request...</p> : null}
        {state.error ? <p style={{ color: '#fca5a5' }}>{state.error}</p> : null}
        {state.response ? <pre className="code">{state.response}</pre> : null}
      </section>
    </main>
  );
}
