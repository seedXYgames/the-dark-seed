# Registro di coordinamento

Sviluppo coordinato da un agente principale con sotto-agenti per flussi di lavoro indipendenti. Le regole
comuni stanno in `docs/AGENT_BRIEF.md`: ogni flusso tocca solo i propri file, dipende solo da
`src/core/contracts.ts` e `src/core/api.ts`, non usa git e non lascia server accesi.

| Flusso | File | Chi | Esito |
| --- | --- | --- | --- |
| Contratti, PRNG, seed | `src/core/*` | coordinatore | completato |
| Mondo e modello fisico | `src/world/*` | coordinatore | completato; 20/20 turni del bot dopo l'introduzione dei cancelli dei POI |
| Incarichi, sessione, bot | `src/sim/missions.ts`, `src/game/*` | coordinatore | completato |
| Narrativa | `src/narrative/*` | sotto-agente | completato, 21 test |
| Audio e voce | `src/audio/*` | sotto-agente | completato, 38 test |
| Interfaccia e telefono | `src/ui/*`, `src/i18n/*`, `index.html` | sotto-agente | completato, 38 test |
| Rendering dell'ambiente | `src/render/environment.ts` e moduli collegati | sotto-agente | completato, 11 test, 8 schermate |
| Rendering degli oggetti | `src/render/worldObjects.ts` e moduli collegati | sotto-agente | completato; fermato dai limiti d'uso prima di scrivere test e banco di prova propri |
| Simulazione autonoma | `src/sim/simulation.ts`, `mysteries.ts`, `extreme.ts`, `analysis.ts` | coordinatore | il sotto-agente non è partito per i limiti d'uso; scritta dal coordinatore, 16 test |
| Integrazione, prove nel browser, documentazione | `src/main.ts`, `tools/*`, `docs/*` | coordinatore | completato |

## Decisioni

- **Niente push dall'agente** (Ivan, 15 novembre 2026): commit locali su `main`, push a cura di Ivan.
- **Logica pura separata dal rendering**, per poter giocare migliaia di turni senza grafica.
- **Cancelli dei POI**: i sentieri collegano punti d'ingresso ai margini dei luoghi e non i centri, perché i
  primi percorsi attraversavano gli edifici.
- **Ponti nel controllo di raggiungibilità**: la griglia a 5 m non vedeva ponti larghi 2,8 m; i punti entro
  3,6 m da un ponte sono considerati percorribili.
- **Predisposizione all'evento estremo dal solo seed**, così la frequenza si conta esattamente su tutti i seed.
- **Oggetti aggiunti dai misteri appoggiati al terreno dopo la costruzione del modello** (`y = NaN` come segnale).

## Problemi incontrati

- Limiti d'uso esauriti più volte con i sotto-agenti in parallelo: lavoro ripreso a ogni finestra.
- Alberi invisibili e poi con colori errati nel rendering (ritaglio e buffer delle istanze condivisi): corretti
  dal flusso dell'ambiente.
- Soggetti delle foto che includevano oggetti dietro le pareti: ora esclusi se il giocatore è all'esterno.
