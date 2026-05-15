# Asystent.io — Analiza kosztów utrzymania

## Podsumowanie

Główny koszt operacyjny to **OpenAI API** — każdy popup generowany w czasie rzeczywistym to jedno wywołanie GPT-4o-mini. Poniżej szczegółowa kalkulacja dla różnych scenariuszy skali.

---

## Koszty per-request (jeden popup)

| Element | Koszt |
|---------|-------|
| OpenAI GPT-4o-mini — input (~400 tokenów: system prompt + koszyk) | $0.000060 |
| OpenAI GPT-4o-mini — output (~100 tokenów: JSON z popupem) | $0.000040 |
| **Łącznie per popup** | **~$0.0001** (0.01 centa) |

Ceny GPT-4o-mini (maj 2026): $0.15 / 1M input tokens, $0.60 / 1M output tokens.

---

## Scenariusze skali

### Scenariusz A: 1 sklep, mały ruch (10 000 wizyt/mies.)

| Metryka | Wartość |
|---------|---------|
| Wizyty miesięcznie | 10 000 |
| % z koszykiem (add-to-cart rate) | 10% = 1 000 |
| % exit-intent triggered | ~30% = 300 |
| Popupy wygenerowane/mies. | **300** |
| Koszt OpenAI | 300 × $0.0001 = **$0.03/mies.** |
| Railway (Hobby plan) | **$5/mies.** |
| **Łączny koszt** | **~$5/mies.** |

### Scenariusz B: 10 sklepów, średni ruch (łącznie 200 000 wizyt/mies.)

| Metryka | Wartość |
|---------|---------|
| Wizyty łącznie | 200 000 |
| Popupy wygenerowane | ~6 000/mies. |
| Koszt OpenAI | 6 000 × $0.0001 = **$0.60/mies.** |
| Railway (Pro plan) | **$20/mies.** |
| **Łączny koszt** | **~$21/mies.** |

### Scenariusz C: 50 sklepów, duży ruch (łącznie 2 000 000 wizyt/mies.)

| Metryka | Wartość |
|---------|---------|
| Wizyty łącznie | 2 000 000 |
| Popupy wygenerowane | ~60 000/mies. |
| Koszt OpenAI | 60 000 × $0.0001 = **$6/mies.** |
| Railway (Pro + więcej RAM) | **$30-50/mies.** |
| **Łączny koszt** | **~$40-55/mies.** |

### Scenariusz D: 200 sklepów, masowa skala (łącznie 10 000 000 wizyt/mies.)

| Metryka | Wartość |
|---------|---------|
| Wizyty łącznie | 10 000 000 |
| Popupy wygenerowane | ~300 000/mies. |
| Koszt OpenAI | 300 000 × $0.0001 = **$30/mies.** |
| Railway / VPS (dedykowany) | **$50-100/mies.** |
| **Łączny koszt** | **~$80-130/mies.** |

---

## Dlaczego koszty są tak niskie?

Kluczowe decyzje architektoniczne, które minimalizują koszty:

1. **Popup generowany TYLKO przy exit-intent** — nie przy każdej wizycie. Typowo 2-5% wizyt triggeruje popup (klient musi mieć coś w koszyku I próbować wyjść).

2. **Max 1 popup per sesja** — nawet jeśli klient triggeruje exit-intent wielokrotnie, API jest wywoływane tylko raz.

3. **GPT-4o-mini** — najtańszy model OpenAI, wystarczająco dobry do generowania 2-3 zdań popupu. Koszt jest 100x niższy niż GPT-4.

4. **SQLite** — zero kosztów bazy danych (nie potrzebujemy PostgreSQL/MySQL na Railway).

5. **Brak real-time monitoringu zachowań** — snippet JS działa lokalnie w przeglądarce klienta. Nie wysyła danych do API dopóki nie wykryje exit-intent. To oznacza zero kosztów serwera dla 95%+ wizyt.

---

## Co NIE generuje kosztów API

| Działanie | Koszt API |
|-----------|-----------|
| Użytkownik przegląda stronę | $0 (JS działa lokalnie) |
| Użytkownik dodaje do koszyka | $0 (dane czytane z WooCommerce lokalnie) |
| Użytkownik scrolluje | $0 (exit-intent detection w JS) |
| Użytkownik zamyka popup | $0 (event tracking to prosty POST, bez AI) |
| Użytkownik kupuje produkt | $0 |

**Jedyny moment generujący koszt AI:** użytkownik MA coś w koszyku I triggeruje exit-intent → 1 wywołanie GPT-4o-mini.

---

## Porównanie z konkurencją

| Rozwiązanie | Koszt miesięczny | Co oferuje |
|-------------|-----------------|------------|
| **Asystent.io (Twoje)** | $5-130 (zależnie od skali) | AI personalizacja, exit-intent, auto-kupony |
| OptinMonster | $19-49/sklep | Statyczne popupy, brak AI |
| Privy | $30-70/sklep | Email capture, basic targeting |
| Justuno | $29-99/sklep | A/B testing, segmentacja |
| CartStack | $39-249/sklep | Email retargeting (po fakcie) |

**Twoja przewaga:** koszty rosną liniowo z ruchem, nie z liczbą sklepów. Konkurencja pobiera per-sklep.

---

## Model cenowy (sugestia)

Na podstawie kosztów, sugerowany pricing SaaS:

| Plan | Cena | Limit popupów/mies. | Twój koszt | Marża |
|------|------|---------------------|------------|-------|
| Starter | 99 zł/mies. | 1 000 | ~$5.10 | 95% |
| Growth | 249 zł/mies. | 10 000 | ~$6 | 97% |
| Scale | 499 zł/mies. | 50 000 | ~$10 | 98% |
| Enterprise | Custom | Unlimited | Zależy | 90%+ |

---

## Ryzyka i mitygacja

| Ryzyko | Prawdopodobieństwo | Mitygacja |
|--------|-------------------|-----------|
| OpenAI podniesie ceny | Niskie (trend spadkowy) | Fallback na tańsze modele (Gemini Flash, Claude Haiku) |
| DDoS na API | Średnie | Rate limiting per API key (już zaimplementowane w logice max_per_session) |
| Nadużycie przez klienta | Niskie | Limity popupów w planie cenowym |
| Railway downtime | Niskie | Multi-region deploy lub migracja na Fly.io |

---

## Wnioski

Przy obecnej architekturze, **koszt utrzymania jest marginalny** — nawet przy 200 sklepach i 10M wizyt miesięcznie, łączny koszt to ~$130/mies. To oznacza, że już przy **2 klientach na planie Starter (2 × 99 zł = 198 zł ≈ $50)** pokrywasz koszty infrastruktury z zapasem.

Główny koszt to Twój czas na support i onboarding klientów, nie infrastruktura.
