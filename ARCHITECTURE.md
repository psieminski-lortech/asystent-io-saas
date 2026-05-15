# Asystent.io SaaS — Architecture

## Overview
AI-powered exit-intent popup system for WooCommerce stores. Detects when a first-time visitor is about to leave with items in cart, and shows a personalized popup to recover the sale.

## Components

### 1. Backend API (api.asystent.io)
- **Runtime:** Node.js + Express + TypeScript
- **Database:** SQLite (via better-sqlite3) — simple, zero-config, production-ready for this scale
- **Auth:** API key per store (generated on registration)
- **AI:** OpenAI GPT-4o-mini for real-time popup content generation

### 2. JS Snippet (loaded on client stores)
- Lightweight (<8KB gzipped)
- Exit-intent detection (cursor movement, scroll velocity, tab switch, back button)
- Reads WooCommerce cart via `wc_cart_fragments` or DOM
- Communicates with API to get personalized popup
- Renders popup with store's color scheme
- Collects email leads → sends to Formspree

### 3. WooCommerce Plugin (PHP)
- WordPress plugin installable via ZIP
- Settings page in WP Admin
- Configurable: API key, strategies (enable/disable discount, free shipping), discount %, Formspree endpoint
- Auto-injects JS snippet on frontend pages
- Exposes cart data to the snippet via wp_localize_script

### 4. Client Dashboard (part of the main asystent.io site)
- Login with API key or store URL
- View stats: popups shown, conversions, revenue recovered
- Configure strategies and popup appearance

---

## Database Schema

### stores
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (UUID) | Primary key |
| name | TEXT | Store name |
| url | TEXT | Store URL |
| api_key | TEXT | Unique API key |
| platform | TEXT | 'woocommerce' |
| formspree_endpoint | TEXT | Formspree URL for leads |
| config | TEXT (JSON) | Strategy configuration |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

### events
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (UUID) | Primary key |
| store_id | TEXT | FK to stores |
| type | TEXT | 'popup_shown', 'popup_clicked', 'popup_dismissed', 'email_captured', 'conversion' |
| session_id | TEXT | Browser session ID |
| cart_value | REAL | Cart total at time of event |
| cart_items | TEXT (JSON) | Items in cart |
| popup_strategy | TEXT | Strategy used |
| popup_content | TEXT | Generated popup text |
| created_at | TEXT | ISO timestamp |

### Store Config JSON structure:
```json
{
  "strategies": {
    "free_shipping": { "enabled": true, "priority": 1 },
    "discount": { "enabled": true, "percentage": 10, "priority": 2 },
    "social_proof": { "enabled": true, "priority": 3 },
    "urgency": { "enabled": true, "priority": 4 }
  },
  "free_shipping_threshold": 200,
  "popup_delay_seconds": 0,
  "popup_max_per_session": 1,
  "colors": {
    "primary": "#3b82f6",
    "background": "#ffffff",
    "text": "#1a1a2e"
  },
  "branding": true
}
```

---

## API Endpoints

### Public (used by JS snippet)
- `POST /api/v1/popup` — Get personalized popup for a visitor
  - Body: `{ api_key, cart_items, cart_total, page_url, session_id, has_free_shipping }`
  - Returns: `{ popup_id, strategy, headline, body, cta_text, discount_code?, show_email_field }`

- `POST /api/v1/event` — Track popup events
  - Body: `{ api_key, popup_id, type, session_id, email? }`

### Dashboard (authenticated)
- `GET /api/v1/store/:api_key/stats` — Get store statistics
- `GET /api/v1/store/:api_key/config` — Get store config
- `PUT /api/v1/store/:api_key/config` — Update store config
- `POST /api/v1/store/register` — Register new store

---

## AI Popup Generation Flow

1. JS snippet detects exit-intent
2. Sends cart data to `POST /api/v1/popup`
3. Backend determines best strategy:
   - If cart qualifies for free shipping already → use discount (default 10%)
   - If cart doesn't qualify for free shipping → offer free shipping
   - AI can override based on cart value, product types
4. OpenAI generates personalized popup text in Polish
5. Returns popup config to snippet
6. Snippet renders popup with store's colors
7. Events tracked back to API

## Exit-Intent Detection Signals
- Mouse moves toward browser chrome (top of viewport)
- Rapid scroll up (velocity > threshold)
- Tab visibility change (document.hidden)
- Back button press (popstate)
- Mobile: scroll to top + pause pattern
- Idle timeout (configurable, e.g. 30s no interaction on cart page)
