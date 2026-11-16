# Architettura

Principio: **tutta la logica di gioco è pura** (niente Babylon, niente DOM) e gira identica nel browser e nei
test. Babylon.js compare solo in `src/render/*` e `src/main.ts`.

```
src/core        contratti (contracts.ts, api.ts), PRNG a stream (rng.ts), seed (seed.ts)
src/world       generazione procedurale: terreno, POI, sentieri, ponti, edifici, oggetti (worldgen, terrain,
                layouts, names) e modello fisico interrogabile (model.ts: quote, collisioni, percorsi)
src/sim         cielo/meteo (environment), incarichi (missions), regole degli oggetti (objects),
                simulazione autonoma (simulation), misteri (mysteries), evento estremo (extreme),
                diagnostica (analysis), contratto host↔simulazione (host)
src/game        GameSession: stato del turno, movimento, interazioni, percezione, torcia, foto, rapporti,
                telefono, riepilogo; Bot che gioca un turno intero con le stesse regole del giocatore
src/narrative   NarrativeComposer IT/EN: grammatiche, lessici, personalità
src/audio       motore Web Audio, sintesi dei suoni, paesaggio sonoro e silenzi, TTS
src/ui          schermate DOM (menu, impostazioni, intro, pausa, riepilogo), telefono, mappa, effetti
src/i18n        stringhe dell'interfaccia IT/EN
src/render      EnvironmentRenderer (terreno, foresta, cielo, acqua, meteo, luci) e WorldObjectsRenderer
                (edifici, veicoli, oggetti, attori, oggetti da ispezionare)
src/main.ts     collega tutto nel browser: input, ciclo di gioco, foto dal framebuffer, audio, UI
tools/          harness.ts (turni headless in massa), audit.ts (audit statico), sandbox/ (banchi di prova grafici)
tests/          Vitest, tutti headless
```

## Determinismo

- `streamFor(seed, nome)` crea uno stream PRNG indipendente per sottosistema (`worldgen`, `poi`, `objects`,
  `sky`, `weather`, `npc`, `fauna`, `missions`, `mysteries`, `anomaly`, `rare`, `sms`, `drift`, `illusion`, …).
  Aggiungere estrazioni in un sottosistema non altera gli altri. `Rng.fork(nome)` deriva sotto-stream.
- Nessun `Math.random`/`Date.now` nella logica (verificato da `npm run audit:static`). Fa eccezione il seed
  dello sfondo del menu, che non è gioco.
- Passo di simulazione fisso `SIM_DT = 0,1 s`; il rendering interpola. Stesso seed + stessi input = stesso
  registro eventi (test «stesso seed e stessi input»).
- `GENERATOR_VERSION` entra nella chiave degli stream: una versione futura non cambia i mondi di quella attuale
  senza che il numero cambi.

## Mondo

Heightfield 321×321 (passo 5 m) da rumore frattale, rilievo di confine, lago/fiume scavati, spianate per i POI.
I POI sono collegati da un albero di copertura; i sentieri sono cammini A* tra i «cancelli» dei POI; dove un
sentiero attraversa il fiume nasce un ponte. `validateWorld` rifiuta mondi con spawn bloccato, oggetti
d'incarico irraggiungibili o ponti ostruiti e riprova con un sotto-stream diverso (fino a 10 tentativi).

## Verità, percezione, racconto

Tre registri separati:

1. **Eventi del mondo** (`state.log`): cosa è successo davvero, con origine e causa. Mai mostrato.
2. **Osservazioni** (`state.observations`): cosa l'agente ha visto, sentito, letto o fotografato, con un
   soggetto percepito («figura», «luce», «suono») e una confidenza.
3. **Testi** (SMS, commenti, rapporti): composti solo dalle osservazioni.

`GameSession.emit` decide per ogni evento chi lo percepisce (distanza, vento, pioggia, linea di vista).

## Simulazione autonoma (`src/sim/simulation.ts`)

- **PNG** (0–3 per turno): escursionista, campeggiatore, automobilista, residente. Routine di passi
  (`goto`, `wait`, `use`, `wander`, `leave`) lungo i sentieri veri; usano oggetti non essenziali (porte,
  interruttori, generatori, sedie, bidoni); si fermano se l'agente è vicino; ricordano cosa hanno visto.
- **Fauna**: cervi in branco, volpe, procioni, gufi, corvi. Pascolano, fuggono dal giocatore, dalla volpe e
  dai rumori forti; il procione rovescia i bidoni e lascia rifiuti.
- **Ambiente**: il vento sbatte porte, piega cartelli, fa cadere rami; la pioggia spegne i fuochi; i generatori
  consumano carburante; lampade con guasti brevi; tuoni; veicoli lontani.
- **Catene**: ogni evento sonoro raggiunge gli attori nel suo raggio, che reagiscono generando altri eventi
  con `causeEventId` (procione → bidone → cervi in fuga → un PNG chiama la centrale → SMS).
- **Anomalie** (0–2): non un catalogo ma combinazioni di 2–4 capacità su nove (`light`, `motion`, `audio`,
  `appear`, `vanish`, `interfere`, `alter_local`, `displace`, `perceptual`) con intensità e quattro pulsioni
  (curiosità, timidezza, territorialità, irrequietezza) che decidono dove e quanto si manifestano.
- **Illusioni**: sagome ambigue ai lati dei sentieri che da vicino o alla luce si rivelano ceppi; rari rumori
  senza sorgente nel bosco fitto.
- **Deriva sottile**: al massimo 6 piccoli cambiamenti per turno, solo fuori dalla vista del giocatore.
- **Misteri** (`mysteries.ts`): 1–3 per mondo, con origine (umana, naturale, non identificata, anomala),
  indizi fisici in più luoghi e conseguenze programmate nel tempo. Mai spiegati.
- **SMS inattesi**: pianificati dal seed; le segnalazioni dei cittadini nascono da eventi reali non percepiti.
- **Evento estremo** (`extreme.ts`): un seed su circa diecimila è predisposto; piano di fasi sovrapposte
  (pioggia di codice, spogliazione, cielo, decomposizione, audio, scatti) che torna esattamente a zero.

Gli oggetti bersaglio degli incarichi sono `essential`: nessun attore può rimuoverli, spostarli o usarli.

## Rendering

Low-poly con colori per vertice, generato in codice. Foresta in thin instances per tasselli con due livelli
di dettaglio; texture del suolo 2048² generata dal modello (sentieri, neve, bagnato); cielo procedurale con
luna in fase, stelle e montagne lontane; nebbia, pioggia e neve; torcia come spot con caduta morbida.
Ogni materiale usa al più 8 luci (ambiente, luna, torcia, telefono, 4 lampade vicine).
Le foto sono lette dal framebuffer dopo il rendering e salvate come JPEG a 480 px (massimo 12).
