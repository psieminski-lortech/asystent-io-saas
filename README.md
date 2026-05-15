# Asystent.io — AI Exit-Intent Cart Recovery for WooCommerce

Production-ready SaaS system that recovers abandoned carts using AI-powered exit-intent popups.

## Architecture

| Component | Technology | Location |
|-----------|-----------|----------|
| Backend API | Node.js + Express + TypeScript | `src/` |
| Database | SQLite (better-sqlite3) | `data/asystent.db` |
| AI Engine | OpenAI GPT-4o-mini | `src/lib/ai.ts` |
| JS Snippet | Vanilla JS (<8KB) | `src/public/js/asystent.js` |
| Dashboard | HTML + CSS + JS | `src/public/dashboard/` |
| WooCommerce Plugin | PHP | `woocommerce-plugin/asystent-io/` |

## How It Works

1. Store owner installs the WooCommerce plugin and enters their API key
2. Plugin injects the JS snippet on all frontend pages
3. Snippet detects exit-intent signals (mouse leaving viewport, rapid scroll up, tab switch, back button)
4. When triggered, snippet sends cart data to the API
5. API determines the best strategy:
   - **No free shipping** → offer free shipping (default)
   - **Already has free shipping** → offer discount (default 10%)
   - AI can also use social proof or urgency
6. OpenAI generates personalized popup text referencing actual cart items
7. Popup renders with the store's custom colors
8. If user enters email → sent to Formspree endpoint
9. All events tracked for analytics dashboard

## Setup

### 1. Backend API

```bash
cd /home/ubuntu/asystent-io-saas
pnpm install
OPENAI_API_KEY=sk-xxx PORT=4000 pnpm dev
```

The API runs on port 4000 by default. For production, deploy to any Node.js host and point `api.asystent.io` to it.

### 2. Register a Store

```bash
curl -X POST https://api.asystent.io/api/v1/store/register \
  -H "Content-Type: application/json" \
  -d '{"name":"My Store","url":"https://mystore.com","formspree_endpoint":"https://formspree.io/f/xxxxx"}'
```

Response includes the `api_key` needed for the plugin.

### 3. Install WooCommerce Plugin

1. Download `asystent-io-woocommerce-plugin.zip`
2. WordPress Admin → Plugins → Add New → Upload Plugin
3. Activate the plugin
4. Go to Asystent.io in the sidebar menu
5. Enter the API key from step 2
6. Save settings

### 4. Dashboard

Access at `https://api.asystent.io/dashboard/` — log in with your API key.

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/v1/store/register` | POST | Register new store |
| `/api/v1/store/:api_key/config` | GET | Get store config |
| `/api/v1/store/:api_key/config` | PUT | Update store config |
| `/api/v1/store/:api_key/stats` | GET | Get analytics (30 days) |
| `/api/v1/popup` | POST | Generate AI popup |
| `/api/v1/event` | POST | Track popup event |

## Strategy Logic

```
IF cart has NO free shipping AND free_shipping strategy enabled:
  → Offer FREE SHIPPING

ELSE IF cart HAS free shipping AND discount strategy enabled:
  → Offer DISCOUNT (default 10%)

ELSE:
  → Pick highest-priority enabled strategy
```

## Configuration (via Dashboard or API)

- **Strategies**: Enable/disable free shipping, discount, social proof, urgency
- **Discount percentage**: 1-50%
- **Colors**: Primary, background, text (matches store design)
- **Max popups per session**: Default 1
- **Formspree endpoint**: For email lead capture
- **Branding**: Show/hide "Powered by Asystent.io"

## File Structure

```
asystent-io-saas/
├── src/
│   ├── server.ts              # Express server entry
│   ├── routes/
│   │   └── api.ts             # All API endpoints
│   ├── lib/
│   │   ├── db.ts              # SQLite database + schema
│   │   └── ai.ts              # OpenAI popup generation
│   └── public/
│       ├── js/
│       │   └── asystent.js    # Frontend snippet
│       └── dashboard/
│           └── index.html     # Client dashboard
├── woocommerce-plugin/
│   └── asystent-io/
│       ├── asystent-io.php    # WordPress plugin
│       └── readme.txt         # WP plugin readme
├── data/                      # SQLite database (auto-created)
├── ARCHITECTURE.md            # Detailed architecture docs
├── package.json
└── tsconfig.json
```
