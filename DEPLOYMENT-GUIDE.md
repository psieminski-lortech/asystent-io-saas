# Asystent.io — Instrukcja wdrożenia krok po kroku

Poniższa instrukcja przeprowadzi Cię przez cały proces uruchomienia systemu Asystent.io: od deploy backendu na Railway, przez podpięcie domeny api.asystent.io, po instalację wtyczki WooCommerce na sklepie klienta.

---

## Krok 1: Utwórz konto na Railway

Przejdź na [railway.app](https://railway.app/) i załóż konto (można przez GitHub). Railway oferuje darmowy tier z $5 kredytu miesięcznie, co w zupełności wystarczy na start.

---

## Krok 2: Utwórz nowy projekt na Railway

Po zalogowaniu kliknij **"New Project"** w dashboardzie Railway, a następnie wybierz **"Deploy from GitHub repo"**. Jeśli jeszcze nie masz repozytorium, wykonaj najpierw krok 2a.

### Krok 2a: Wypchnij kod na GitHub

Otwórz terminal na swoim komputerze i wykonaj poniższe komendy. Folder `asystent-io-saas` to ten, który dostarczyłem w ZIP.

```bash
cd asystent-io-saas
git init
git add .
git commit -m "Initial commit — Asystent.io SaaS backend"
gh repo create asystent-io-saas --private --source=. --push
```

Jeśli nie masz `gh` CLI, możesz ręcznie utworzyć repo na GitHub i użyć standardowych komend `git remote add origin` i `git push`.

---

## Krok 3: Skonfiguruj Railway

Po połączeniu repozytorium Railway automatycznie wykryje projekt Node.js. Musisz ustawić kilka rzeczy:

### 3a: Zmienne środowiskowe

W dashboardzie Railway przejdź do **Variables** i dodaj:

| Zmienna | Wartość | Opis |
|---------|---------|------|
| `OPENAI_API_KEY` | `sk-proj-rp3Pe9...` (Twój klucz) | Klucz API OpenAI do generowania popupów |
| `PORT` | `4000` | Port serwera (Railway automatycznie mapuje) |
| `NODE_ENV` | `production` | Tryb produkcyjny |

### 3b: Build & Start commands

W ustawieniach projektu na Railway ustaw:

| Ustawienie | Wartość |
|------------|---------|
| **Build Command** | `pnpm install && pnpm build` |
| **Start Command** | `pnpm start` |

Railway powinien automatycznie wykryć te komendy z `package.json`, ale warto to zweryfikować.

### 3c: Persistent Volume (dla bazy SQLite)

W Railway przejdź do **Settings → Volumes** i dodaj volume:

| Ustawienie | Wartość |
|------------|---------|
| **Mount Path** | `/app/data` |
| **Size** | 1 GB (wystarczy) |

Następnie dodaj zmienną środowiskową:

| Zmienna | Wartość |
|---------|---------|
| `DB_PATH` | `/app/data/asystent.db` |

To zapewni, że baza danych przetrwa redeploymenty.

---

## Krok 4: Podepnij domenę api.asystent.io

### 4a: W Railway

Przejdź do **Settings → Networking → Custom Domain** i wpisz: `api.asystent.io`

Railway pokaże Ci rekord DNS do ustawienia (zazwyczaj CNAME).

### 4b: W panelu DNS domeny asystent.io

Zaloguj się do panelu zarządzania domeną asystent.io i dodaj rekord:

| Typ | Nazwa | Wartość | TTL |
|-----|-------|---------|-----|
| CNAME | `api` | (wartość z Railway, np. `xxx.up.railway.app`) | 300 |

Poczekaj 5-15 minut na propagację DNS. Możesz sprawdzić status komendą:

```bash
dig api.asystent.io CNAME
```

### 4c: Weryfikacja

Po propagacji DNS otwórz w przeglądarce:

```
https://api.asystent.io/health
```

Powinieneś zobaczyć:

```json
{"status":"ok","service":"asystent.io-api","version":"1.0.0"}
```

---

## Krok 5: Zarejestruj pierwszy sklep

Użyj curl lub Postmana, żeby zarejestrować sklep klienta:

```bash
curl -X POST https://api.asystent.io/api/v1/store/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Nazwa Sklepu Klienta",
    "url": "https://sklep-klienta.pl",
    "formspree_endpoint": "https://formspree.io/f/XXXXXXX"
  }'
```

Odpowiedź zawiera `api_key` — zapisz go, będzie potrzebny w następnym kroku.

---

## Krok 6: Zainstaluj wtyczkę WooCommerce

### 6a: Upload wtyczki

W panelu WordPress klienta przejdź do **Wtyczki → Dodaj nową → Wyślij wtyczkę na serwer** i wybierz plik `asystent-io-woocommerce-plugin.zip`. Kliknij **Zainstaluj teraz**, a następnie **Aktywuj**.

### 6b: Konfiguracja

Po aktywacji w menu bocznym WordPress pojawi się pozycja **Asystent.io**. Kliknij ją i wypełnij:

| Pole | Wartość |
|------|---------|
| **Włączona** | Zaznacz checkbox |
| **Klucz API** | Klucz `ask_xxx...` z kroku 5 |
| **URL API** | `https://api.asystent.io` |

Kliknij **Zapisz ustawienia**.

### 6c: Weryfikacja

Otwórz sklep klienta w trybie incognito (żeby nie być zalogowanym jako admin), dodaj produkt do koszyka, a następnie przesuń kursor do paska adresu przeglądarki. Popup powinien się pojawić.

---

## Krok 7: Skonfiguruj strategie w dashboardzie

Otwórz **https://api.asystent.io/dashboard/** i zaloguj się kluczem API z kroku 5. W dashboardzie możesz:

- Włączyć/wyłączyć poszczególne strategie (darmowa dostawa, rabat, social proof, urgency)
- Ustawić procent rabatu (domyślnie 10%)
- Podać endpoint Formspree do zbierania emaili
- Dopasować kolory popupu do sklepu klienta
- Ustawić limit popupów na sesję

---

## Krok 8: Skonfiguruj Formspree dla klienta

Każdy klient powinien mieć własny formularz na Formspree:

1. Przejdź na [formspree.io](https://formspree.io/) i utwórz nowy formularz
2. Skopiuj endpoint (np. `https://formspree.io/f/xyzabc123`)
3. Wklej go w dashboardzie Asystent.io w polu "Endpoint Formspree"
4. Zapisz zmiany

Teraz gdy klient zostawi email w popupie, właściciel sklepu dostanie powiadomienie na maila.

---

## Krok 9: Monitoruj wyniki

W dashboardzie (**https://api.asystent.io/dashboard/**) widoczne są:

- Liczba wyświetlonych popupów
- Liczba konwersji (kliknięć CTA)
- Wskaźnik konwersji (%)
- Odzyskany przychód
- Lista ostatnich zdarzeń z typem, strategią, wartością koszyka i emailem

---

## Jak działają automatyczne kupony rabatowe

Gdy AI wybierze strategię rabatową, system automatycznie:

1. Generuje unikalny kod rabatowy (np. `ASYSTENTG4ZMZY`)
2. Wysyła żądanie AJAX do WordPress, które tworzy kupon WooCommerce
3. Kupon jest ważny **15 minut**, może być użyty **tylko raz**
4. Wygasłe kupony są automatycznie usuwane raz dziennie (WP-Cron)

Klient widzi kod w popupie i może go od razu użyć przy kasie — kupon jest już aktywny w WooCommerce.

---

## Podsumowanie kroków

| Krok | Akcja | Czas |
|------|-------|------|
| 1 | Konto Railway | 2 min |
| 2 | Push kodu na GitHub | 5 min |
| 3 | Konfiguracja Railway (env vars, volume) | 10 min |
| 4 | Podpięcie domeny api.asystent.io | 15 min (+ propagacja DNS) |
| 5 | Rejestracja sklepu | 1 min |
| 6 | Instalacja wtyczki WooCommerce | 5 min |
| 7 | Konfiguracja strategii | 5 min |
| 8 | Formspree setup | 3 min |
| 9 | Monitoring | ciągły |

**Łączny czas wdrożenia: ok. 45 minut** (plus czas na propagację DNS).

---

## Troubleshooting

**Popup się nie wyświetla:**
- Sprawdź czy nie jesteś zalogowany jako admin (wtyczka ukrywa popup dla adminów)
- Sprawdź czy koszyk nie jest pusty
- Sprawdź konsolę przeglądarki (F12) — szukaj logów `[Asystent.io]`
- Sprawdź czy API odpowiada: `curl https://api.asystent.io/health`

**Kupon nie działa:**
- Sprawdź w WooCommerce → Marketing → Kupony czy kupon został utworzony
- Sprawdź czy kupon nie wygasł (15 min)
- Sprawdź konsolę przeglądarki — powinien być log `[Asystent.io] Coupon created: XXXX`

**Railway deploy nie działa:**
- Sprawdź logi w Railway dashboard
- Upewnij się że `OPENAI_API_KEY` jest ustawiony
- Upewnij się że volume jest podpięty pod `/app/data`
