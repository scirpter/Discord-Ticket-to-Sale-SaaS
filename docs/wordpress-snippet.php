<?php
/**
 * Persist Voodoo checkout correlation data into Woo order meta.
 */
add_action('woocommerce_checkout_create_order', function ($order, $data) {
    if (!isset($_GET['vd_order_session_id'])) {
        return;
    }

    $order_session_id = sanitize_text_field($_GET['vd_order_session_id']);
    $order->update_meta_data('vd_order_session_id', $order_session_id);

    if (isset($_GET['vd_ticket_channel_id'])) {
        $ticket_channel_id = sanitize_text_field($_GET['vd_ticket_channel_id']);
        $order->update_meta_data('vd_ticket_channel_id', $ticket_channel_id);
    }
}, 10, 2);
