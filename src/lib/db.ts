import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "../../data/asystent.db");

// Ensure data directory exists
import fs from "fs";
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS stores (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    api_key TEXT NOT NULL UNIQUE,
    platform TEXT NOT NULL DEFAULT 'woocommerce',
    formspree_endpoint TEXT DEFAULT '',
    config TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    store_id TEXT NOT NULL,
    type TEXT NOT NULL,
    session_id TEXT NOT NULL,
    cart_value REAL DEFAULT 0,
    cart_items TEXT DEFAULT '[]',
    popup_strategy TEXT DEFAULT '',
    popup_content TEXT DEFAULT '',
    email TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (store_id) REFERENCES stores(id)
  );

  CREATE INDEX IF NOT EXISTS idx_events_store_id ON events(store_id);
  CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
  CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
  CREATE INDEX IF NOT EXISTS idx_stores_api_key ON stores(api_key);
`);

export default db;

// Helper types
export interface Store {
  id: string;
  name: string;
  url: string;
  api_key: string;
  platform: string;
  formspree_endpoint: string;
  config: string;
  created_at: string;
  updated_at: string;
}

export interface StoreConfig {
  strategies: {
    free_shipping: { enabled: boolean; priority: number };
    discount: { enabled: boolean; percentage: number; priority: number };
    social_proof: { enabled: boolean; priority: number };
    urgency: { enabled: boolean; priority: number };
  };
  free_shipping_threshold: number;
  popup_delay_seconds: number;
  popup_max_per_session: number;
  colors: {
    primary: string;
    background: string;
    text: string;
  };
  branding: boolean;
}

export const DEFAULT_CONFIG: StoreConfig = {
  strategies: {
    free_shipping: { enabled: true, priority: 1 },
    discount: { enabled: true, percentage: 10, priority: 2 },
    social_proof: { enabled: true, priority: 3 },
    urgency: { enabled: true, priority: 4 },
  },
  free_shipping_threshold: 200,
  popup_delay_seconds: 0,
  popup_max_per_session: 1,
  colors: {
    primary: "#3b82f6",
    background: "#ffffff",
    text: "#1a1a2e",
  },
  branding: true,
};

export interface EventRow {
  id: string;
  store_id: string;
  type: string;
  session_id: string;
  cart_value: number;
  cart_items: string;
  popup_strategy: string;
  popup_content: string;
  email: string;
  created_at: string;
}
