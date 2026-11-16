# Contratti

I tipi condivisi stanno in due file; ogni modulo dipende solo da questi.

## `src/core/contracts.ts` — dati

| Tipo | Contenuto |
| --- | --- |
| `WorldSpec` | mondo generato: terreno, POI, sentieri, ponti, edifici, oggetti, cielo e meteo iniziali, nomi, misteri |
| `WorldObjectSpec` / `ObjState` | oggetto del mondo e suo stato mutabile serializzabile (la «memoria del bosco») |
| `Mission` | incarico: POI, oggetto bersaglio, azione richiesta, motivo, stato `pending → inspected → reported` |
| `WorldEvent` | evento reale: tipo, posizione, origine, causa, prima/dopo, pubblico, percepito o no |
| `Observation` | percezione dell'agente: tipo, soggetto percepito, confidenza, fatti |
| `ActorState` | attore: tipo, archetipo, routine, capacità, pulsioni, conoscenze, fotografabile |
| `AnomalyCapability` | primitiva di anomalia con intensità e proprietà alterata |
| `Mystery` | origine, tema, indizi, cronologia, indizi scoperti |
| `ExtremePlan` | fasi, innesco, durata, strascico |
| `SessionState` | tutto lo stato di un turno |
| `Settings` | lingua e grafica |

Costanti: `GENERATOR_VERSION = 1`, `WORLD_SIZE = 1400`, `SEED_MIN = 0`, `SEED_MAX = 1_000_000`,
`EXTREME_PROBABILITY = 1e-4`, `CLOCK_SCALE = 6`.

Convenzioni: metri; x est, z nord, y alto; area giocabile x,z ∈ [−700, 700]; imbardata 0 = nord, positiva
verso est; `state.time` in secondi simulati; ora locale = ora d'inizio + `time × 6 / 3600`.

## `src/core/api.ts` — interfacce tra moduli

| Interfaccia | Implementata da | Usata da |
| --- | --- | --- |
| `IWorldModel` | `world/model.ts` | sessione, simulazione, rendering |
| `INarrativeComposer` | `narrative/composer.ts` | sessione |
| `IAudioEngine`, `ITts` | `audio/engine.ts`, `audio/tts.ts` | `main.ts` |
| `IUi` + `UiCallbacks` | `ui/ui.ts` | `main.ts` |
| `IEnvironmentRenderer` | `render/environment.ts` | `main.ts` |
| `IWorldObjectsRenderer` | `render/worldObjects.ts` | `main.ts` |
| `WeatherState`, `SkyState`, `LocalAlterations`, `ExtremeRenderState`, `ActorView`, `TorchRender` | — | dati scambiati a ogni fotogramma |

## `src/sim/host.ts` — sessione ↔ simulazione

`SimHost` è ciò che la simulazione può fare al mondo: `emit`, `setObjectState`, `moveObject`,
`addDynamicObject`, `sendSms`, più letture (`playerCanSee`, `weather`, `sky`, `objects`, `pose`, `rng`).
Le protezioni stanno nell'host: porte chiuse a chiave, oggetti essenziali e auto di servizio non sono
modificabili da cause diverse dal giocatore.

`ISimulation` è ciò che la sessione chiede alla simulazione: `step`, `actorViews`, `localAlterations`,
`hushSources`, `interference`, `extremeState`, `npcTalk`, `devForceExtreme` (solo sviluppo e test).

## Stato degli oggetti (chiavi usate)

`door.state` (`open`/`closed`/`locked`) · `switch.on` · `lamp.on`, `lamp.power` (id generatore),
`lamp.breaker` (id quadro) · `generator.running`, `fuel` · `panel.open`, `breaker` (`ok`/`tripped`) ·
`tent.flap` · `campfire.state` (`cold`/`embers`/`burning`) · `bin.tipped` · `sign.tilt` · `cooler.open` ·
`item.taken` · `trace.type`, `age` · `logbox.signed`.
