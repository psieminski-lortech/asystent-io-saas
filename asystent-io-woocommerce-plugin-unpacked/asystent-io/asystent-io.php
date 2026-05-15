<?php
/**
 * Plugin Name: Asystent.io — AI Exit-Intent Cart Recovery
 * Plugin URI: https://asystent.io
 * Description: Odzyskuj porzucone koszyki dzięki AI. Wykrywa intencję wyjścia klienta i wyświetla spersonalizowany popup z ofertą.
 * Version: 1.1.0
 * Author: Asystent.io
 * Author URI: https://asystent.io
 * License: GPL-2.0+
 * Text Domain: asystent-io
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * WC requires at least: 5.0
 */

if (!defined('ABSPATH')) exit;

define('ASYSTENT_VERSION', '1.1.0');
define('ASYSTENT_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('ASYSTENT_PLUGIN_URL', plugin_dir_url(__FILE__));

// ─── WooCommerce Check ──────────────────────────────────────

function asystent_check_woocommerce() {
    if (!class_exists('WooCommerce')) {
        add_action('admin_notices', function() {
            echo '<div class="error"><p><strong>Asystent.io</strong> wymaga zainstalowanego i aktywnego WooCommerce.</p></div>';
        });
        return false;
    }
    return true;
}

// ─── Initialize ─────────────────────────────────────────────

add_action('plugins_loaded', function() {
    if (!asystent_check_woocommerce()) return;

    add_action('admin_menu', 'asystent_admin_menu');
    add_action('admin_init', 'asystent_register_settings');
    add_action('wp_footer', 'asystent_inject_script');
    add_action('wp_enqueue_scripts', 'asystent_enqueue_cart_data');

    // REST API endpoint for coupon creation
    add_action('rest_api_init', 'asystent_register_rest_routes');

    // AJAX fallback for coupon creation (no auth needed for frontend)
    add_action('wp_ajax_asystent_create_coupon', 'asystent_ajax_create_coupon');
    add_action('wp_ajax_nopriv_asystent_create_coupon', 'asystent_ajax_create_coupon');

    // Cleanup expired coupons daily
    if (!wp_next_scheduled('asystent_cleanup_coupons')) {
        wp_schedule_event(time(), 'daily', 'asystent_cleanup_coupons');
    }
    add_action('asystent_cleanup_coupons', 'asystent_delete_expired_coupons');
});

// ─── Admin Menu & Settings ──────────────────────────────────

function asystent_admin_menu() {
    add_menu_page(
        'Asystent.io',
        'Asystent.io',
        'manage_options',
        'asystent-io',
        'asystent_settings_page',
        'dashicons-cart',
        56
    );
}

function asystent_register_settings() {
    register_setting('asystent_settings', 'asystent_api_key', [
        'type' => 'string',
        'sanitize_callback' => 'sanitize_text_field',
        'default' => '',
    ]);
    register_setting('asystent_settings', 'asystent_api_url', [
        'type' => 'string',
        'sanitize_callback' => 'esc_url_raw',
        'default' => 'https://api.asystent.io',
    ]);
    register_setting('asystent_settings', 'asystent_enabled', [
        'type' => 'boolean',
        'default' => true,
    ]);
}

function asystent_settings_page() {
    $api_key = get_option('asystent_api_key', '');
    $api_url = get_option('asystent_api_url', 'https://api.asystent.io');
    $enabled = get_option('asystent_enabled', true);

    // Count active coupons
    $coupon_count = 0;
    $coupons = get_posts([
        'post_type' => 'shop_coupon',
        'meta_key' => '_asystent_coupon',
        'meta_value' => '1',
        'post_status' => 'publish',
        'numberposts' => -1,
    ]);
    $coupon_count = count($coupons);
    ?>
    <div class="wrap">
        <h1>
            <span style="display:inline-flex;align-items:center;gap:8px;">
                <span style="width:28px;height:28px;border-radius:6px;background:linear-gradient(135deg,#3b82f6,#6366f1);display:inline-flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:13px;">A</span>
                Asystent.io — Ustawienia
            </span>
        </h1>

        <form method="post" action="options.php">
            <?php settings_fields('asystent_settings'); ?>
            <table class="form-table">
                <tr>
                    <th scope="row"><label for="asystent_enabled">Włączona</label></th>
                    <td>
                        <input type="checkbox" id="asystent_enabled" name="asystent_enabled" value="1" <?php checked($enabled); ?>>
                        <p class="description">Włącz/wyłącz popup exit-intent na stronie sklepu.</p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="asystent_api_key">Klucz API</label></th>
                    <td>
                        <input type="text" id="asystent_api_key" name="asystent_api_key" value="<?php echo esc_attr($api_key); ?>" class="regular-text" placeholder="ask_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx">
                        <p class="description">Klucz API z panelu <a href="https://api.asystent.io/dashboard/" target="_blank">Asystent.io Dashboard</a>.</p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="asystent_api_url">URL API</label></th>
                    <td>
                        <input type="url" id="asystent_api_url" name="asystent_api_url" value="<?php echo esc_attr($api_url); ?>" class="regular-text">
                        <p class="description">Domyślnie: https://api.asystent.io</p>
                    </td>
                </tr>
            </table>
            <?php submit_button('Zapisz ustawienia'); ?>
        </form>

        <?php if ($api_key): ?>
        <hr>
        <h2>Status</h2>
        <p>✅ Wtyczka skonfigurowana. Popup exit-intent jest <?php echo $enabled ? '<strong style="color:green;">aktywny</strong>' : '<strong style="color:red;">wyłączony</strong>'; ?>.</p>
        <p>🎟️ Aktywne kupony Asystent.io: <strong><?php echo $coupon_count; ?></strong></p>
        <p>Zarządzaj strategiami w <a href="<?php echo esc_url($api_url); ?>/dashboard/" target="_blank">panelu Asystent.io →</a></p>

        <hr>
        <h2>Jak działają kupony rabatowe</h2>
        <p>Gdy AI wybierze strategię rabatową, wtyczka <strong>automatycznie tworzy kupon WooCommerce</strong> z wygenerowanym kodem. Kupon:</p>
        <ul style="list-style:disc;padding-left:20px;">
            <li>Jest ważny przez <strong>15 minut</strong> od utworzenia</li>
            <li>Może być użyty <strong>tylko raz</strong></li>
            <li>Stosuje rabat procentowy (konfigurowalny w dashboardzie)</li>
            <li>Jest automatycznie usuwany po wygaśnięciu (codzienne czyszczenie)</li>
        </ul>
        <?php else: ?>
        <hr>
        <h2>Pierwsze kroki</h2>
        <ol>
            <li>Zarejestruj swój sklep na <a href="https://asystent.io" target="_blank">asystent.io</a></li>
            <li>Skopiuj klucz API z panelu</li>
            <li>Wklej klucz powyżej i zapisz</li>
            <li>Gotowe! Popup exit-intent będzie automatycznie wyświetlany klientom.</li>
        </ol>
        <?php endif; ?>
    </div>
    <?php
}

// ─── REST API: Coupon Creation ──────────────────────────────

function asystent_register_rest_routes() {
    register_rest_route('asystent/v1', '/create-coupon', [
        'methods' => 'POST',
        'callback' => 'asystent_rest_create_coupon',
        'permission_callback' => 'asystent_verify_api_key',
    ]);
}

/**
 * Verify that the request comes from our API (via shared API key)
 */
function asystent_verify_api_key($request) {
    $provided_key = $request->get_header('X-Asystent-Key');
    $stored_key = get_option('asystent_api_key', '');
    return !empty($stored_key) && $provided_key === $stored_key;
}

/**
 * REST endpoint: Create a WooCommerce coupon
 */
function asystent_rest_create_coupon($request) {
    $code = sanitize_text_field($request->get_param('code'));
    $discount_percentage = floatval($request->get_param('percentage'));
    $expires_minutes = intval($request->get_param('expires_minutes')) ?: 15;

    if (empty($code) || $discount_percentage <= 0) {
        return new WP_Error('invalid_params', 'code and percentage are required', ['status' => 400]);
    }

    $result = asystent_create_wc_coupon($code, $discount_percentage, $expires_minutes);

    if (is_wp_error($result)) {
        return $result;
    }

    return rest_ensure_response([
        'success' => true,
        'coupon_code' => $code,
        'discount' => $discount_percentage . '%',
        'expires_at' => $result['expires_at'],
    ]);
}

/**
 * AJAX endpoint: Create coupon from JS snippet (no auth — uses nonce from page)
 */
function asystent_ajax_create_coupon() {
    // Verify the request has our API key
    $provided_key = isset($_POST['api_key']) ? sanitize_text_field($_POST['api_key']) : '';
    $stored_key = get_option('asystent_api_key', '');

    if (empty($stored_key) || $provided_key !== $stored_key) {
        wp_send_json_error(['message' => 'Unauthorized'], 403);
        return;
    }

    $code = isset($_POST['code']) ? sanitize_text_field($_POST['code']) : '';
    $percentage = isset($_POST['percentage']) ? floatval($_POST['percentage']) : 10;
    $expires_minutes = isset($_POST['expires_minutes']) ? intval($_POST['expires_minutes']) : 15;

    if (empty($code) || $percentage <= 0) {
        wp_send_json_error(['message' => 'Invalid parameters'], 400);
        return;
    }

    $result = asystent_create_wc_coupon($code, $percentage, $expires_minutes);

    if (is_wp_error($result)) {
        wp_send_json_error(['message' => $result->get_error_message()], 500);
        return;
    }

    wp_send_json_success([
        'coupon_code' => $code,
        'discount' => $percentage . '%',
        'expires_at' => $result['expires_at'],
    ]);
}

/**
 * Core function: Create a WooCommerce coupon programmatically
 */
function asystent_create_wc_coupon($code, $percentage, $expires_minutes = 15) {
    // Check if coupon already exists
    $existing = wc_get_coupon_id_by_code($code);
    if ($existing) {
        return ['expires_at' => get_post_meta($existing, 'date_expires', true)];
    }

    $expiry_date = date('Y-m-d H:i:s', time() + ($expires_minutes * 60));

    $coupon = new WC_Coupon();
    $coupon->set_code($code);
    $coupon->set_discount_type('percent');
    $coupon->set_amount($percentage);
    $coupon->set_individual_use(true);
    $coupon->set_usage_limit(1);
    $coupon->set_date_expires(strtotime($expiry_date));
    $coupon->set_description('Automatycznie wygenerowany przez Asystent.io — exit-intent popup');

    $coupon_id = $coupon->save();

    if (!$coupon_id) {
        return new WP_Error('coupon_creation_failed', 'Failed to create coupon');
    }

    // Mark as Asystent.io coupon for cleanup
    update_post_meta($coupon_id, '_asystent_coupon', '1');
    update_post_meta($coupon_id, '_asystent_created_at', current_time('mysql'));

    return [
        'coupon_id' => $coupon_id,
        'expires_at' => $expiry_date,
    ];
}

/**
 * Cleanup: Delete expired Asystent.io coupons
 */
function asystent_delete_expired_coupons() {
    $coupons = get_posts([
        'post_type' => 'shop_coupon',
        'meta_key' => '_asystent_coupon',
        'meta_value' => '1',
        'post_status' => 'publish',
        'numberposts' => 100,
    ]);

    $now = time();
    foreach ($coupons as $coupon_post) {
        $coupon = new WC_Coupon($coupon_post->ID);
        $expires = $coupon->get_date_expires();

        if ($expires && $expires->getTimestamp() < $now) {
            wp_delete_post($coupon_post->ID, true);
        }
    }
}

// ─── Frontend: Inject Script ────────────────────────────────

function asystent_inject_script() {
    $api_key = get_option('asystent_api_key', '');
    $api_url = get_option('asystent_api_url', 'https://api.asystent.io');
    $enabled = get_option('asystent_enabled', true);

    if (!$enabled || empty($api_key)) return;
    if (current_user_can('manage_options')) return;

    // Main snippet
    echo '<script src="' . esc_url($api_url . '/js/asystent.js') . '" data-api-key="' . esc_attr($api_key) . '" data-api-url="' . esc_url($api_url) . '" defer></script>' . "\n";

    // Coupon creation endpoint for the snippet
    echo '<script>window.asystent_coupon_endpoint = "' . esc_url(admin_url('admin-ajax.php')) . '";</script>' . "\n";
}

// ─── Frontend: Cart Data ────────────────────────────────────

function asystent_enqueue_cart_data() {
    $api_key = get_option('asystent_api_key', '');
    $enabled = get_option('asystent_enabled', true);

    if (!$enabled || empty($api_key)) return;
    if (current_user_can('manage_options')) return;
    if (!function_exists('WC') || !WC()->cart) return;

    $cart = WC()->cart;
    $items = [];

    foreach ($cart->get_cart() as $cart_item) {
        $product = $cart_item['data'];
        $items[] = [
            'name' => $product->get_name(),
            'price' => (float) $product->get_price(),
            'quantity' => (int) $cart_item['quantity'],
            'image_url' => wp_get_attachment_url($product->get_image_id()) ?: '',
        ];
    }

    $free_shipping = false;
    $packages = $cart->get_shipping_packages();
    if (!empty($packages)) {
        $shipping_zone = WC_Shipping_Zones::get_zone_matching_package(reset($packages));
        foreach ($shipping_zone->get_shipping_methods(true) as $method) {
            if ($method->id === 'free_shipping') {
                $min_amount = $method->get_option('min_amount', 0);
                if ($cart->get_subtotal() >= (float) $min_amount) {
                    $free_shipping = true;
                }
                break;
            }
        }
    }

    $cart_data = [
        'items' => $items,
        'total' => (float) $cart->get_total('edit'),
        'subtotal' => (float) $cart->get_subtotal(),
        'has_free_shipping' => $free_shipping,
        'currency' => get_woocommerce_currency(),
        'api_key' => $api_key,
    ];

    wp_add_inline_script('jquery', 'window.asystent_cart_data = ' . wp_json_encode($cart_data) . ';', 'before');
}

// ─── Plugin Action Links ────────────────────────────────────

add_filter('plugin_action_links_' . plugin_basename(__FILE__), function($links) {
    $settings_link = '<a href="admin.php?page=asystent-io">Ustawienia</a>';
    array_unshift($links, $settings_link);
    return $links;
});

// ─── Deactivation: Unschedule cron ─────────────────────────

register_deactivation_hook(__FILE__, function() {
    wp_clear_scheduled_hook('asystent_cleanup_coupons');
});
