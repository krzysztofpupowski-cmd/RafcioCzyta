---
project: "RafcioCzyta"
version: 1
status: draft
created: 2026-05-18
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

## Vision & Problem Statement

Tradycyjna nauka czytania w szkole lub zerówce jest zbyt wolna dla dziecka, które potrzebuje szybko przejść od liter do materiałów dających poczucie postępu. Zanim dziecko nauczy się czytać na tyle sprawnie, żeby książki były atrakcyjne, telefon staje się ciekawszy.

Wgląd: materiały do nauki czytania muszą trafiać dokładnie w aktualny poziom dziecka, inaczej są zbyt nudne albo zbyt trudne i wzmacniają utratę motywacji.

## User & Persona

Primary persona: rodzic uczący własne dziecko czytania w domu.

Moment użycia: dziecko jest na etapie liter, sylab, prostych słów lub prostych zdań, a rodzic musi dobrać następny materiał do ćwiczeń.

Koszt dzisiaj: rodzic musi sam decydować, co przygotować dalej, a dziecko traci zainteresowanie książkami, bo czytanie nie staje się wystarczająco szybko satysfakcjonujące.

## Success Criteria

### Primary

- Rodzic wybiera poziom dziecka, aplikacja generuje fiszki, rodzic akceptuje co najmniej 75% wygenerowanych fiszek, a dziecko ćwiczy zaakceptowany materiał w gotowym algorytmie powtórek.
- Po miesiącu pracy z materiałem dziecko zna co najmniej 95% prostych zdań objętych ćwiczeniami.

### Secondary

- Brak dodatkowego kryterium pobocznego dla MVP po przeniesieniu kart pracy poza zakres pierwszej wersji.

### Guardrails

- Materiały nie mogą regularnie trafiać powyżej poziomu dziecka, bo zbyt trudne ćwiczenia wzmacniają utratę motywacji.

## User Stories

### US-01: Rodzic akceptuje fiszki do ćwiczeń

- **Given** rodzic jest zalogowany i zna obecny poziom dziecka albo wybiera najprostszy start
- **When** wybiera poziom i prosi o wygenerowanie fiszek
- **Then** widzi fiszki do akceptacji, może zatwierdzać lub odrzucać je partiami, a zaakceptowane fiszki trafiają do powtórek

#### Acceptance Criteria

- Rodzic może rozpocząć od poziomu dziecka albo opcji „nie wiem / najprostszy start”.
- Fiszki wygenerowane przez AI nie trafiają do ćwiczeń bez akceptacji rodzica.
- Zaakceptowane fiszki są dostępne w prostym trybie powtórek.
- Rodzic widzi prosty wskaźnik opanowania materiału wynikający z powtórek.

## Functional Requirements

### Konto i poziom dziecka

- FR-001: Rodzic może zalogować się na konto. Priority: must-have

  > Socratic: Counter-argument considered: "Profil lokalny wystarczyłby na start, a logowanie opóźnia pierwszą wartość." Resolution: kept; konto rodzica jest potrzebne do zachowania postępu.

- FR-002: Rodzic może wybrać poziom czytania dziecka, w tym opcję „nie wiem / najprostszy start”. Priority: must-have
  > Socratic: Counter-argument considered: "Rodzic może nie umieć trafnie ocenić poziomu dziecka." Resolution: revised; wybór poziomu obejmuje bezpieczną opcję startową dla niepewnych rodziców.

### Generowanie i akceptacja fiszek

- FR-003: Rodzic może wygenerować fiszki dopasowane do wybranego poziomu czytania dziecka. Priority: must-have

  > Socratic: Counter-argument considered: "Jeśli generowane fiszki są nietrafione, produkt traci zaufanie zanim pokaże wartość." Resolution: kept; ryzyko jakości ogranicza obowiązkowa akceptacja rodzica.

- FR-004: Rodzic może zaakceptować albo odrzucić partię fiszek przygotowanych przez AI przed dopuszczeniem ich do ćwiczeń. Priority: must-have

  > Socratic: Counter-argument considered: "Akceptacja każdej fiszki może być zbyt dużym obciążeniem dla rodzica." Resolution: revised; akceptacja powinna działać partiami.

- FR-005: Rodzic może przeglądać przygotowane i zaakceptowane fiszki bez pełnej edycji treści w MVP. Priority: must-have
  > Socratic: Counter-argument considered: "Na start wystarczyłoby zaakceptuj/odrzuć, bez pełnej edycji." Resolution: revised; pełna edycja fiszek nie należy do MVP.

### Powtórki i opanowanie materiału

- FR-006: Rodzic może uruchomić prosty tryb ćwiczeń na zaakceptowanych fiszkach w gotowym algorytmie powtórek. Priority: must-have

  > Socratic: Counter-argument considered: "Tryb ćwiczeń może być trudniejszy niż generowanie fiszek i stać się głównym ryzykiem MVP." Resolution: kept; prosty tryb powtórek jest częścią dowodu wartości MVP.

- FR-007: Rodzic może zobaczyć prosty wskaźnik opanowania materiału wynikający z powtórek. Priority: must-have
  > Socratic: Counter-argument considered: "Na start wystarczyłaby obserwacja rodzica poza aplikacją." Resolution: revised; wskaźnik ma być prosty, nie precyzyjną diagnozą czytania.

## Non-Functional Requirements

- Rodzic widzi typową partię wygenerowanych fiszek do akceptacji w czasie krótszym niż 10 sekund.
- Pojedyncza sesja ćwiczeń może być zakończona w mniej niż 10 minut.
- Produkt jest używalny na telefonie rodzica w aktualnych wersjach głównych przeglądarek.

## Business Logic

Aplikacja dobiera i dopuszcza do ćwiczeń tylko taki materiał czytelniczy, który pasuje do wybranego poziomu dziecka oraz został zaakceptowany przez rodzica.

Reguła konsumuje poziom czytania wybrany przez rodzica, ewentualną opcję bezpiecznego startu oraz decyzje akceptacji/odrzucenia fiszek. Wynikiem jest zestaw materiałów dopuszczonych do ćwiczeń i powtórek.

Rodzic doświadcza tej reguły podczas generowania fiszek: propozycje AI nie są jeszcze materiałem ćwiczeniowym, dopóki nie przejdą kontroli rodzica.

## Access Control

MVP używa logowania do konta rodzica, żeby zachować materiały i postęp dziecka między sesjami.

Model ról jest płaski: jedna rola rodzica może zarządzać fiszkami, kartami pracy i postępem dziecka. Osobna rola dziecka nie jest wymagana w MVP.

## Non-Goals

- MVP nie sprawdza głosem, czy dziecko poprawnie przeczytało tekst; ocena wymowy i odczytu pozostaje poza zakresem pierwszej wersji.
- MVP nie zawiera pełnego edytora treści fiszek; pierwsza wersja ogranicza się do przeglądania oraz akceptacji lub odrzucenia.
- MVP nie buduje własnego algorytmu powtórek; zaakceptowane fiszki trafiają do gotowego algorytmu powtórek.

## Open Questions

No open questions captured.
