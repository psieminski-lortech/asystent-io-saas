import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import db, { DEFAULT_CONFIG, type Store, type StoreConfig } from "../lib/db.js";
import { generatePopup, type CartItem } from "../lib/ai.js";

const router = Router();

// ─── Helpers ───────────────────────────────────────────────

function getStoreByApiKey(apiKey: string): Store | undefined {
  return db.prepare("SELECT * FROM stores WHERE api_key = ?").get(apiKey) as Store | undefined;
}

function parseConfig(store: Store): StoreConfig {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(store.config) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

// ─── POST /api/v1/store/register ───────────────────────────

router.post("/store/register", (req: Request, res: Response) => {
  const { name, url, platform, formspree_endpoint } = req.body;

  if (!name || !url) {
    return res.status(400).json({ error: "name and url are required" });
  }

  // Check if store already exists
  const existing = db.prepare("SELECT * FROM stores WHERE url = ?").get(url) as Store | undefined;
  if (existing) {
    return res.status(409).json({
      error: "Store already registered",
      api_key: existing.api_key,
    });
  }

  const id = uuidv4();
  const api_key = "ask_" + uuidv4().replace(/-/g, "");

  db.prepare(`
    INSERT INTO stores (id, name, url, api_key, platform, formspree_endpoint, config)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, url, api_key, platform || "woocommerce", formspree_endpoint || "", JSON.stringify(DEFAULT_CONFIG));

  return res.status(201).json({
    id,
    api_key,
    name,
    url,
    config: DEFAULT_CONFIG,
    message: "Store registered successfully. Use the api_key in your WooCommerce plugin settings.",
  });
});

// ─── GET /api/v1/store/:api_key/config ─────────────────────

router.get("/store/:api_key/config", (req: Request, res: Response) => {
  const store = getStoreByApiKey(req.params.api_key);
  if (!store) {
    return res.status(404).json({ error: "Store not found" });
  }

  return res.json({
    id: store.id,
    name: store.name,
    url: store.url,
    platform: store.platform,
    formspree_endpoint: store.formspree_endpoint,
    config: parseConfig(store),
  });
});

// ─── PUT /api/v1/store/:api_key/config ─────────────────────

router.put("/store/:api_key/config", (req: Request, res: Response) => {
  const store = getStoreByApiKey(req.params.api_key);
  if (!store) {
    return res.status(404).json({ error: "Store not found" });
  }

  const currentConfig = parseConfig(store);
  const newConfig = { ...currentConfig, ...req.body.config };

  // Also allow updating formspree_endpoint
  const formspree = req.body.formspree_endpoint ?? store.formspree_endpoint;

  db.prepare(`
    UPDATE stores SET config = ?, formspree_endpoint = ?, updated_at = datetime('now')
    WHERE api_key = ?
  `).run(JSON.stringify(newConfig), formspree, req.params.api_key);

  return res.json({ config: newConfig, formspree_endpoint: formspree });
});

// ─── GET /api/v1/store/:api_key/stats ──────────────────────

router.get("/store/:api_key/stats", (req: Request, res: Response) => {
  const store = getStoreByApiKey(req.params.api_key);
  if (!store) {
    return res.status(404).json({ error: "Store not found" });
  }

  const days = parseInt(req.query.days as string) || 30;
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const stats = db.prepare(`
    SELECT
      type,
      COUNT(*) as count,
      SUM(cart_value) as total_cart_value
    FROM events
    WHERE store_id = ? AND created_at >= ?
    GROUP BY type
  `).all(store.id, since) as { type: string; count: number; total_cart_value: number }[];

  const statsMap: Record<string, { count: number; total_cart_value: number }> = {};
  for (const row of stats) {
    statsMap[row.type] = { count: row.count, total_cart_value: row.total_cart_value || 0 };
  }

  const popupsShown = statsMap["popup_shown"]?.count || 0;
  const conversions = statsMap["conversion"]?.count || 0;
  const emailsCaptured = statsMap["email_captured"]?.count || 0;
  const dismissed = statsMap["popup_dismissed"]?.count || 0;
  const conversionRate = popupsShown > 0 ? ((conversions / popupsShown) * 100).toFixed(1) : "0.0";
  const recoveredRevenue = statsMap["conversion"]?.total_cart_value || 0;

  // Recent events
  const recentEvents = db.prepare(`
    SELECT type, session_id, cart_value, popup_strategy, email, created_at
    FROM events
    WHERE store_id = ? AND created_at >= ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(store.id, since);

  return res.json({
    period_days: days,
    popups_shown: popupsShown,
    conversions,
    emails_captured: emailsCaptured,
    dismissed,
    conversion_rate: parseFloat(conversionRate),
    recovered_revenue: Math.round(recoveredRevenue),
    recent_events: recentEvents,
  });
});

// ─── POST /api/v1/popup ────────────────────────────────────

router.post("/popup", async (req: Request, res: Response) => {
  const { api_key, cart_items, cart_total, page_url, session_id, has_free_shipping } = req.body;

  if (!api_key) {
    return res.status(400).json({ error: "api_key is required" });
  }

  const store = getStoreByApiKey(api_key);
  if (!store) {
    return res.status(404).json({ error: "Store not found" });
  }

  const config = parseConfig(store);

  // Check if we already showed a popup to this session
  if (session_id) {
    const sessionPopups = db.prepare(`
      SELECT COUNT(*) as count FROM events
      WHERE store_id = ? AND session_id = ? AND type = 'popup_shown'
    `).get(store.id, session_id) as { count: number };

    if (sessionPopups.count >= config.popup_max_per_session) {
      return res.json({ show: false, reason: "max_popups_reached" });
    }
  }

  // No cart items = no popup
  if (!cart_items || cart_items.length === 0 || !cart_total || cart_total <= 0) {
    return res.json({ show: false, reason: "empty_cart" });
  }

  try {
    const popup = await generatePopup({
      cart_items: cart_items as CartItem[],
      cart_total,
      page_url: page_url || store.url,
      has_free_shipping: has_free_shipping || false,
      store_name: store.name,
      config,
    });

    const popupId = uuidv4();

    // Record popup_shown event
    db.prepare(`
      INSERT INTO events (id, store_id, type, session_id, cart_value, cart_items, popup_strategy, popup_content)
      VALUES (?, ?, 'popup_shown', ?, ?, ?, ?, ?)
    `).run(
      popupId,
      store.id,
      session_id || "unknown",
      cart_total,
      JSON.stringify(cart_items),
      popup.strategy,
      JSON.stringify(popup)
    );

    return res.json({
      show: true,
      popup_id: popupId,
      ...popup,
      colors: config.colors,
      branding: config.branding,
      formspree_endpoint: store.formspree_endpoint,
    });
  } catch (error: any) {
    console.error("Popup generation error:", error.message);
    return res.status(500).json({ show: false, error: "Failed to generate popup" });
  }
});

// ─── POST /api/v1/event ────────────────────────────────────

router.post("/event", (req: Request, res: Response) => {
  const { api_key, popup_id, type, session_id, email, cart_value } = req.body;

  if (!api_key || !type) {
    return res.status(400).json({ error: "api_key and type are required" });
  }

  const store = getStoreByApiKey(api_key);
  if (!store) {
    return res.status(404).json({ error: "Store not found" });
  }

  const validTypes = ["popup_clicked", "popup_dismissed", "email_captured", "conversion"];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: `Invalid event type. Valid: ${validTypes.join(", ")}` });
  }

  const id = uuidv4();

  db.prepare(`
    INSERT INTO events (id, store_id, type, session_id, cart_value, email)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, store.id, type, session_id || "unknown", cart_value || 0, email || "");

  return res.json({ success: true, event_id: id });
});

export default router;
