'use client';

import { useMemo, useState } from 'react';

type RequestState = {
  loading: boolean;
  response: string;
  error: string;
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

  const payload = (await response.json()) as unknown;
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : `Request failed with ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

export default function DashboardPage() {
  const [tenantId, setTenantId] = useState('');
  const [guildId, setGuildId] = useState('');

  const [createTenantName, setCreateTenantName] = useState('');
  const [connectGuildName, setConnectGuildName] = useState('');

  const [paidLogChannelId, setPaidLogChannelId] = useState('');
  const [staffRoleIds, setStaffRoleIds] = useState('');
  const [defaultCurrency, setDefaultCurrency] = useState('USD');
  const [ticketMetadataKey, setTicketMetadataKey] = useState('isTicket');

  const [botToken, setBotToken] = useState('');

  const [wooBaseUrl, setWooBaseUrl] = useState('');
  const [wooWebhookSecret, setWooWebhookSecret] = useState('');
  const [wooConsumerKey, setWooConsumerKey] = useState('');
  const [wooConsumerSecret, setWooConsumerSecret] = useState('');

  const [productPayload, setProductPayload] = useState(`{
  "category": "Accounts",
  "name": "Starter Account",
  "description": "Initial offer",
  "active": true,
  "variants": [
    {
      "label": "Basic",
      "priceMinor": 999,
      "currency": "USD",
      "wooCheckoutPath": "/checkout"
    }
  ]
}`);
  const [formPayload, setFormPayload] = useState(`[
  {
    "key": "username",
    "label": "Username",
    "fieldType": "short_text",
    "required": true,
    "sensitive": false,
    "sortOrder": 0
  },
  {
    "key": "email",
    "label": "Email",
    "fieldType": "email",
    "required": true,
    "sensitive": true,
    "sortOrder": 1
  }
]`);

  const [state, setState] = useState<RequestState>(initialState);

  const preview = useMemo(
    () => ({
      tenantId,
      guildId,
      defaultCurrency,
    }),
    [tenantId, guildId, defaultCurrency],
  );

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

  return (
    <main className="grid" style={{ gap: '18px' }}>
      <section className="card grid" style={{ gap: '12px' }}>
        <h1>Control Center</h1>
        <p>
          Use this panel to configure tenant scope, guild sales settings, products/forms, Woo webhooks, and
          super-admin controls.
        </p>
      </section>

      <section className="grid cols-3">
        <div className="card grid" style={{ gap: '10px' }}>
          <h3>Tenant Context</h3>
          <div>
            <label>Tenant ID</label>
            <input value={tenantId} onChange={(event) => setTenantId(event.target.value)} />
          </div>
          <div>
            <label>Guild ID</label>
            <input value={guildId} onChange={(event) => setGuildId(event.target.value)} />
          </div>
          <pre className="code">{JSON.stringify(preview, null, 2)}</pre>
        </div>

        <div className="card grid" style={{ gap: '10px' }}>
          <h3>Create Tenant</h3>
          <div>
            <label>Name</label>
            <input value={createTenantName} onChange={(event) => setCreateTenantName(event.target.value)} />
          </div>
          <button
            type="button"
            onClick={() => runAction(() => apiCall('/api/tenants', 'POST', { name: createTenantName }))}
          >
            Create Tenant
          </button>
          <button type="button" className="secondary" onClick={() => runAction(() => apiCall('/api/tenants'))}>
            List Tenants
          </button>
        </div>

        <div className="card grid" style={{ gap: '10px' }}>
          <h3>Connect Guild</h3>
          <div>
            <label>Guild Name</label>
            <input value={connectGuildName} onChange={(event) => setConnectGuildName(event.target.value)} />
          </div>
          <button
            type="button"
            onClick={() =>
              runAction(() =>
                apiCall(`/api/guilds/${guildId}/connect`, 'POST', {
                  tenantId,
                  guildName: connectGuildName,
                }),
              )
            }
          >
            Connect Guild
          </button>
        </div>
      </section>

      <section className="grid cols-2">
        <div className="card grid" style={{ gap: '10px' }}>
          <h3>Guild Config</h3>
          <div>
            <label>Paid Log Channel ID</label>
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
              <input value={defaultCurrency} onChange={(event) => setDefaultCurrency(event.target.value)} />
            </div>
            <div>
              <label>Ticket Metadata Key</label>
              <input value={ticketMetadataKey} onChange={(event) => setTicketMetadataKey(event.target.value)} />
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              runAction(() =>
                apiCall(`/api/guilds/${guildId}/config`, 'PATCH', {
                  tenantId,
                  paidLogChannelId: paidLogChannelId || null,
                  staffRoleIds: staffRoleIds
                    .split(',')
                    .map((value) => value.trim())
                    .filter(Boolean),
                  defaultCurrency,
                  ticketMetadataKey,
                }),
              )
            }
          >
            Save Guild Config
          </button>
        </div>

        <div className="card grid" style={{ gap: '10px' }}>
          <h3>WooCommerce Integration</h3>
          <div>
            <label>WordPress Base URL</label>
            <input value={wooBaseUrl} onChange={(event) => setWooBaseUrl(event.target.value)} />
          </div>
          <div>
            <label>Webhook Secret</label>
            <input value={wooWebhookSecret} onChange={(event) => setWooWebhookSecret(event.target.value)} />
          </div>
          <div>
            <label>Consumer Key</label>
            <input value={wooConsumerKey} onChange={(event) => setWooConsumerKey(event.target.value)} />
          </div>
          <div>
            <label>Consumer Secret</label>
            <input value={wooConsumerSecret} onChange={(event) => setWooConsumerSecret(event.target.value)} />
          </div>
          <button
            type="button"
            onClick={() =>
              runAction(() =>
                apiCall(`/api/guilds/${guildId}/integrations/woocommerce`, 'PUT', {
                  tenantId,
                  wpBaseUrl: wooBaseUrl,
                  webhookSecret: wooWebhookSecret,
                  consumerKey: wooConsumerKey,
                  consumerSecret: wooConsumerSecret,
                }),
              )
            }
          >
            Save Woo Integration
          </button>
        </div>
      </section>

      <section className="grid cols-2">
        <div className="card grid" style={{ gap: '10px' }}>
          <h3>Product Builder</h3>
          <div>
            <label>Product JSON</label>
            <textarea value={productPayload} onChange={(event) => setProductPayload(event.target.value)} />
          </div>
          <div>
            <label>Form Fields JSON</label>
            <textarea value={formPayload} onChange={(event) => setFormPayload(event.target.value)} />
          </div>
          <button
            type="button"
            onClick={() =>
              runAction(() =>
                apiCall(`/api/guilds/${guildId}/products`, 'POST', {
                  tenantId,
                  product: JSON.parse(productPayload),
                  formFields: JSON.parse(formPayload),
                }),
              )
            }
          >
            Create Product
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => runAction(() => apiCall(`/api/guilds/${guildId}/products?tenantId=${tenantId}`))}
          >
            List Products
          </button>
        </div>

        <div className="card grid" style={{ gap: '10px' }}>
          <h3>Super Admin</h3>
          <div>
            <label>Global Bot Token</label>
            <input value={botToken} onChange={(event) => setBotToken(event.target.value)} />
          </div>
          <button type="button" onClick={() => runAction(() => apiCall('/api/admin/bot-token', 'POST', { token: botToken }))}>
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
