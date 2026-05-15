import OpenAI from "openai";
import type { StoreConfig } from "./db.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface CartItem {
  name: string;
  price: number;
  quantity: number;
  image_url?: string;
}

export interface PopupRequest {
  cart_items: CartItem[];
  cart_total: number;
  page_url: string;
  has_free_shipping: boolean;
  store_name: string;
  config: StoreConfig;
}

export interface PopupResponse {
  strategy: string;
  headline: string;
  body: string;
  cta_text: string;
  discount_code?: string;
  discount_percentage?: number;
  show_email_field: boolean;
  secondary_cta?: string;
}

function determineStrategy(req: PopupRequest): string {
  const { config, has_free_shipping, cart_total } = req;
  const strategies = config.strategies;

  // Core logic per user requirements:
  // - Default: free shipping
  // - If already qualifies for free shipping: discount (default 10%)
  // - AI can pick social_proof or urgency as alternatives

  if (!has_free_shipping && strategies.free_shipping.enabled) {
    return "free_shipping";
  }

  if (has_free_shipping && strategies.discount.enabled) {
    return "discount";
  }

  // Fallback: pick highest priority enabled strategy
  const available = Object.entries(strategies)
    .filter(([_, s]) => s.enabled)
    .sort((a, b) => a[1].priority - b[1].priority);

  if (available.length > 0) {
    return available[0][0];
  }

  return "free_shipping"; // ultimate fallback
}

function generateDiscountCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "ASYSTENT";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function generatePopup(req: PopupRequest): Promise<PopupResponse> {
  const strategy = determineStrategy(req);
  const discountPct = req.config.strategies.discount.percentage || 10;
  const discountCode = strategy === "discount" ? generateDiscountCode() : undefined;

  const cartDescription = req.cart_items
    .map((item) => `${item.name} (${item.quantity}x, ${item.price} zł)`)
    .join(", ");

  const strategyInstructions: Record<string, string> = {
    free_shipping: `Zaoferuj DARMOWĄ DOSTAWĘ. Klient ma w koszyku produkty ale nie kwalifikuje się na darmową dostawę. Przekonaj go, że darmowa dostawa to świetna okazja żeby dokończyć zakup teraz.`,
    discount: `Zaoferuj RABAT ${discountPct}% z kodem: ${discountCode}. Klient już ma darmową dostawę, więc potrzebuje dodatkowej motywacji. Kod rabatowy jest ważny przez 15 minut.`,
    social_proof: `Użyj SOCIAL PROOF. Powiedz że inne osoby kupują te same produkty, że są popularne, że klienci je polecają. Nie wymyślaj konkretnych liczb — użyj ogólnych sformułowań.`,
    urgency: `Stwórz poczucie PILNOŚCI. Powiedz że oferta jest ograniczona czasowo, że produkty szybko się wyprzedają, że warto dokończyć zakup teraz. Nie kłam — użyj subtelnej pilności.`,
  };

  const systemPrompt = `Jesteś ekspertem od konwersji w e-commerce. Generujesz treść popup'u exit-intent dla sklepu "${req.store_name}".

ZASADY:
- Pisz po polsku, naturalnie, bez sztucznego entuzjazmu
- Bądź zwięzły — popup ma max 2-3 zdania
- Odwołuj się do KONKRETNYCH produktów z koszyka klienta
- Nie używaj wykrzykników na końcu każdego zdania
- Ton: profesjonalny ale przyjazny, jak dobry sprzedawca

STRATEGIA: ${strategyInstructions[strategy] || strategyInstructions.free_shipping}

Koszyk klienta: ${cartDescription}
Wartość koszyka: ${req.cart_total} zł

Odpowiedz WYŁĄCZNIE w JSON (bez markdown):
{
  "headline": "krótki nagłówek (max 8 słów)",
  "body": "treść popup'u (1-2 zdania, max 30 słów)",
  "cta_text": "tekst przycisku CTA (max 4 słowa)",
  "secondary_cta": "tekst drugiego przycisku np. 'Nie teraz' (max 3 słowa)"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Wygeneruj popup." },
      ],
      max_tokens: 300,
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content || "";
    const parsed = JSON.parse(
      content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
    );

    return {
      strategy,
      headline: parsed.headline || "Nie odchodź z pustymi rękami",
      body: parsed.body || "Masz świetne produkty w koszyku. Dokończ zakup teraz.",
      cta_text: parsed.cta_text || "Dokończ zakup",
      discount_code: discountCode,
      discount_percentage: strategy === "discount" ? discountPct : undefined,
      show_email_field: true,
      secondary_cta: parsed.secondary_cta || "Nie teraz",
    };
  } catch (error: any) {
    console.error("AI generation error:", error.message);

    // Fallback — static popup
    const fallbacks: Record<string, PopupResponse> = {
      free_shipping: {
        strategy: "free_shipping",
        headline: "Darmowa dostawa czeka na Ciebie",
        body: "Dokończ zakup teraz i skorzystaj z darmowej dostawy. Twój koszyk jest gotowy.",
        cta_text: "Dokończ zakup",
        show_email_field: true,
        secondary_cta: "Nie teraz",
      },
      discount: {
        strategy: "discount",
        headline: `Mamy dla Ciebie ${discountPct}% rabatu`,
        body: `Użyj kodu ${discountCode} przy kasie. Oferta ważna 15 minut.`,
        cta_text: "Wykorzystaj rabat",
        discount_code: discountCode,
        discount_percentage: discountPct,
        show_email_field: true,
        secondary_cta: "Nie teraz",
      },
      social_proof: {
        strategy: "social_proof",
        headline: "Dobry wybór",
        body: "Te produkty cieszą się dużym zainteresowaniem. Nie przegap okazji.",
        cta_text: "Dokończ zakup",
        show_email_field: true,
        secondary_cta: "Nie teraz",
      },
      urgency: {
        strategy: "urgency",
        headline: "Twój koszyk czeka",
        body: "Produkty w Twoim koszyku mogą niedługo być niedostępne. Dokończ zakup teraz.",
        cta_text: "Kup teraz",
        show_email_field: true,
        secondary_cta: "Nie teraz",
      },
    };

    return fallbacks[strategy] || fallbacks.free_shipping;
  }
}
