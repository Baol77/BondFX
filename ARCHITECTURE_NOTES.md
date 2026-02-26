# BondFX — Engineering Onboarding Notes

Questa nota serve per velocizzare modifiche e test futuri.

## 1) Mappa architettura (high-level)

- **Runtime**: Spring Boot 3.2.5 su Java 17 (packaging `jar`).
- **UI rendering**: FreeMarker templates (`bond-report.ftl`, `analyzer.ftl`, `capital-growth.ftl`).
- **Data sources esterne**:
  - Bond list scraping da SimpleToolsForInvestors.
  - FX spot da ECB XML.
  - Rating sovrani da TradingEconomics (+ fallback locale).
  - Benchmark storici via proxy Yahoo Finance.

### 1.1 Backend modules

- `bond.BondApp`: bootstrap Spring.
- `bond.controller.BondController` (MVC):
  - `/` = refresh scraping + render tabella principale.
  - `/analyzer` = render portfolio analyzer.
  - `/capital-growth` = render simulatore crescita.
- `bond.controller.BondApiController` (REST):
  - `/api/bond/{isin}`
  - `/api/bonds/search`
  - `/api/fx-rates`
  - `/api/benchmark`
- `bond.controller.FxMultiplierController` (REST):
  - `/api/fx-multipliers`
  - `/api/fx-multipliers/refresh`

### 1.2 Core domain/services

- `BondService`:
  - cache in-memory dei bond (`bondIndex`) + FX rates usate nello scrape.
  - lock (`ReentrantLock`) sul refresh per evitare race.
  - se cache vuota, API triggerano scrape on-demand.
- `BondScraper`:
  - aggrega 3 sorgenti HTML, applica filtri business, deduplica ISIN.
- `BondCalculator`:
  - costruzione `Bond` + cutoff maturità (`<=1y` => `null`).
- `BondScoreEngine`:
  - calcolo `finalCapitalToMat` e `simpleAnnualYield` usando FX multipliers by phase.
- `FxService`:
  - singleton + cache TTL rate ECB.
  - modello haircut OU/VaR (BUY/COUPON/MATURITY).
- `RatingService`:
  - map fallback hardcoded + refresh web con TTL.

### 1.3 Frontend modules

- `bond-report.js`: tabella principale, filtri/sort, wishlist/basket, base currency UI.
- `portfolio-analyzer.js`: ricerca live API, portfolio localStorage, CSV import/export.
- `capital-growth.js`: simulazioni, benchmark chart, fx multipliers, scenari per-ISIN.

## 2) Flussi critici da conoscere prima di modificare

1. **Refresh principale su homepage**
   - Ogni `GET /` esegue scrape live + scoring + cache update.
   - Impatto: latenza e dipendenza rete esterna.

2. **API dipendenti da cache condivisa**
   - Se chiamate API arrivano prima di `/`, `BondService.ensureCacheLoaded()` forza scrape.
   - Impatto: primo hit API può essere lento.

3. **Calcolo rendimenti e coerenza metrica**
   - SAY dipende da formula Java nel `BondScoreEngine` + multipliers FX.
   - UI analyzer/capital-growth replica in parte logiche net/gross: attenzione alla consistenza.

4. **Configuration-driven behavior**
   - Profili, tax, coupon frequency, benchmark sono in YAML.
   - Modifiche apparentemente “frontend” possono essere risolte via config.

## 3) Dipendenze e failure modes

- **SimpleToolsForInvestors**: se cambia HTML table, scraper può degradare silenziosamente (row skip).
- **ECB FX**: in caso failure, alcuni endpoint fanno fallback conservativo (es. EUR-only map / 1.0).
- **TradingEconomics**: refresh rating può fallire, ma fallback evita blocco app.
- **Yahoo proxy**: endpoint benchmark può restituire 502 con payload errore JSON.

## 4) Edge cases utili per test regressione

- Bond con maturità breve (<=1y) esclusi a monte.
- Coupon 0 escluso dallo scraper (ma costruibile da test unitari manuali).
- Deduplica ISIN “first source wins” (ordine sorgenti conta).
- Rating non riconosciuto => default `BBB`.
- Query search mista testo+percentuale (tokenizzazione in `BondService.search`).

## 5) Playbook pratico per future modifiche

1. **Touch backend math/scoring**
   - Verificare `BondScoreEngine`, `FxService`, e qualsiasi ricalcolo JS in analyzer/capital-growth.
2. **Touch scraping/parsing**
   - Testare almeno con una fetch reale e controllare cardinalità bond + campi essenziali.
3. **Touch API contracts**
   - Controllare le chiavi JSON attese da `portfolio-analyzer.js` e `capital-growth.js`.
4. **Touch UI/templating**
   - Verificare sincronizzazione ID/class tra `.ftl` e JS.

## 6) Comandi rapidi utili

- Elenco file: `rg --files`
- Traccia chiamate API frontend: `rg -n "fetch\(|/api/" src/main/resources/static/js/*.js`
- Test unitari (quando rete Maven disponibile): `mvn test`

## 7) Nota ambiente CI/dev

In questo ambiente specifico, `mvn test` può fallire per risoluzione dipendenze da Maven Central (HTTP 403), quindi i check Java potrebbero richiedere mirror/repo interno o rete diversa.
