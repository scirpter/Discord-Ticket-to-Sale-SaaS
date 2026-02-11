export default function HomePage() {
  return (
    <main className="grid" style={{ gap: '18px' }}>
      <section className="card grid" style={{ gap: '12px' }}>
        <h1>Voodoo Ticket-to-Sale Dashboard</h1>
        <p>
          Multi-tenant SaaS control panel for Discord ticket sales, WooCommerce webhooks, and paid-order
          logging.
        </p>
        <a href="/api/auth/discord/login">
          <button type="button">Login with Discord</button>
        </a>
      </section>
      <section className="card grid" style={{ gap: '8px' }}>
        <h2>WordPress Setup Snippet</h2>
        <p>Add this plugin/snippet to persist our order session ID into Woo order meta.</p>
        <pre className="code">{`<?php
add_action('woocommerce_checkout_create_order', function($order, $data) {
    if (!isset($_GET['vd_order_session_id'])) {
        return;
    }
    $session_id = sanitize_text_field($_GET['vd_order_session_id']);
    $order->update_meta_data('vd_order_session_id', $session_id);

    if (isset($_GET['vd_ticket_channel_id'])) {
        $order->update_meta_data('vd_ticket_channel_id', sanitize_text_field($_GET['vd_ticket_channel_id']));
    }
}, 10, 2);
`}</pre>
      </section>
    </main>
  );
}
