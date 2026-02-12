export default function HomePage() {
  return (
    <main className="grid" style={{ gap: '18px' }}>
      <section className="card grid" style={{ gap: '12px' }}>
        <h1>Voodoo Ticket-to-Sale Dashboard</h1>
        <p>
          Multi-tenant SaaS control panel for Discord ticket sales, Voodoo Pay callbacks, and paid-order
          logging.
        </p>
        <a href="/api/auth/discord/login">
          <button type="button">Login with Discord</button>
        </a>
      </section>
      <section className="card grid" style={{ gap: '8px' }}>
        <h2>Quick Start</h2>
        <p>
          Login with Discord, connect your workspace to your Discord server, add your Voodoo Pay integration,
          then create products with pricing and customer questions.
        </p>
      </section>
    </main>
  );
}
