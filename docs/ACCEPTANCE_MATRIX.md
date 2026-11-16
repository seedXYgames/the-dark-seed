# Matrice di accettazione

Stato: **OK** = verificato con la prova indicata · **Parziale** = funziona ma con il limite indicato ·
**Non verificato** = implementato, prova reale non possibile in questo ambiente.
Test in `tests/`, schermate in `docs/screenshots/`, comandi ed esiti in `docs/QA_REPORT.md`.

| # | Requisito (sezione della specifica) | Stato | Prova |
| --- | --- | --- | --- |
| A1 | Caricamento senza errori JS (13.A) | OK | Chromium headless, build di sviluppo e di produzione: zero errori di console e di pagina |
| A2 | Menu su sfondo forestale, due sole voci (2.1) | OK | `game-01-menu.png`; voci lette dal DOM: «Inizia una partita», «Impostazioni» |
| A3 | Impostazioni: lingua IT/EN e grafica, persistenti (2.2) | OK | flusso browser: cambio lingua, ritorno, ricarica della pagina; `ui.settings.test.ts`, `ui.i18n.test.ts` |
| A4 | Intro nera con seed; 0 e 1.000.000 accettati; −1, 1.000.001, decimali, testo, vuoto rifiutati (2.3) | OK | flusso browser (pulsante Play disattivato sui valori non validi); `ui.seed.test.ts`, `game.acceptance.test.ts` |
| B1 | 2–5 incarichi per turno, completi di luogo, interazione e rapporto (4) | OK | 20 seed in `sim.simulation.test.ts`; 40 seed nell'harness: 9/15/12/4 turni con 2/3/4/5 incarichi |
| B2 | Partenza presso l'auto; il turno finisce solo tornando all'auto dopo tutti i rapporti (4) | OK | `game.acceptance.test.ts`; il bot prova l'auto prima e deve fallire; fine turno con tasto E nel browser, `game-05-summary.png` |
| B3 | Entrare nell'area non completa l'incarico (4) | OK | `game.acceptance.test.ts` |
| B4 | Camminare, correre, guardare, F, T, mouse; niente morte, stamina o combattimento (5) | Parziale | tasti W, F, T, E, Esc provati nel browser headless; lo sguardo col mouse richiede il blocco del puntatore, non disponibile in headless: provato solo tramite API di sviluppo |
| C1 | Mappa 1400 × 1400 m esatti, mondi diversi per seed, uguali per stesso seed (3.1, 10) | OK | `game.acceptance.test.ts` (confronto JSON del mondo) |
| C2 | Geografia attraversabile, ponti dove servono, nessun oggetto d'incarico irraggiungibile (3.1) | OK | `validateWorld` a ogni generazione; 60 turni completi del bot a piedi (20 test + 40 harness) senza fallimenti |
| C3 | PNG e animali non bloccano il giocatore (13.C) | OK | gli attori non hanno collisione col giocatore; turni del bot completati con simulazione attiva |
| C4 | Cielo, montagne e sentieri credibili (3.2, D) | Parziale | `env-dusk-vista.png`, `env-moonlit-lake.png`, `game-02-dusk-forest.png`; chiome degli alberi ancora schematiche da vicino |
| D1 | Torcia: carica iniziale dal seed, consumo, pile, guasti; nessun blocco senza luce (5.1) | OK | `game.acceptance.test.ts` (consumo solo da accesa); il bot completa i turni a torcia spenta |
| D2 | Al buio la torcia aiuta (13.D) | OK | `game-03-night-torch-cabin.png`, `env-overcast-torch-trail.png` |
| E1 | Oggetto 3D esaminabile e ruotabile (5) | OK | `game-08-inspect.png` e `game-07-inspect-rotated.png` (stesso oggetto dopo il movimento del mouse) |
| E2 | SMS contestuali, rapporti basati sui fatti osservati, IT/EN (6) | OK | `narrative.composer.test.ts` (240 combinazioni per lingua, nessuna causa nascosta nei testi); `game.acceptance.test.ts`; `game-04-phone-report.png` |
| E3 | Personalità stabile per seed, stile diverso a parità di fatti (6) | OK | `narrative.composer.test.ts` («two personalities: different style, same facts») |
| E4 | Voce di sistema quando disponibile, sottotitoli sempre (6) | Parziale | sottotitoli e avviso «voce non disponibile» visti nel browser; `audio.tts.test.ts`; nessuna voce reale ascoltata (il browser di prova non ne ha) |
| F1 | Il mondo procede fuori vista, stati persistenti nel turno (7, 8) | OK | `sim.simulation.test.ts` («il mondo agisce da solo»); media harness: 54 eventi per turno, 24 ambientali, 12,6 della fauna |
| F2 | Catene causali dimostrabili dal registro (13.F) | OK | `sim.simulation.test.ts` («ogni conseguenza indica una causa esistente e precedente»); media 9 eventi concatenati per turno |
| F3 | Meteo che cambia in modo coerente; audio 3D; silenzi (3.3, 12A.6) | Parziale | `audio.soundscape.test.ts`, `audio.engine.test.ts`; l'audio non è stato ascoltato da una persona |
| G1 | Evento estremo ≈ 0,01% per partita, misurato (9) | OK | conteggio esatto su tutti i 1.000.001 seed: 104 predisposti (0,0104%), nel test e nell'harness |
| G2 | Forzabile solo in sviluppo; rendering, collisioni e fine turno restano funzionanti (9) | OK | `sim.simulation.test.ts` («forzato in sviluppo…»); nel browser: forzato, concluso, turno chiuso all'auto; `__tds` assente dalla build di produzione (audit) |
| G3 | Resa visiva dell'evento estremo (9) | Parziale | `env-extreme.png` e `env-extreme-restored.png` dal banco di prova grafico; nel gioco completo verificati stato e ripristino, non una schermata a effetto pieno |
| H1 | Misteri con più indizi raggiungibili e facoltativi (12A.1) | OK | `sim.simulation.test.ts` («misteri»): indizi fuori dagli edifici, appoggiati al suolo; non legati agli incarichi |
| H2 | Geografia psicologica in area fissa (12A.2) | Parziale | zone generate (`spec.zones`) e usate dalle anomalie come luoghi d'origine; nessun test dedicato alla varietà |
| H3 | Anomalie fisiche locali senza blocchi (12A.3) | Parziale | capacità `alter_local` verificata a livello di stato; pioggia verso l'alto, polvere, riflessi e ombre deviate non osservati a schermo |
| H4 | Foto dal fotogramma reale, consultabili e allegabili, entro il limite (12A.4) | OK | browser: JPEG da 10,5 kB letto dal framebuffer, miniatura nel rapporto (`game-04-phone-report.png`); limite 12 in `game.acceptance.test.ts` |
| H5 | PNG con routine motivate anche fuori vista (12A.5) | OK | `sim.simulation.test.ts` («i PNG seguono una routine…») |
| H6 | Condivisione del seed e riepilogo sobrio (12A.7) | OK | `game-05-summary.png` (seed, link `?seed=`, rapporti) |
| H7 | Mutamenti sottili solo fuori vista (12A.8) | OK | `sim.simulation.test.ts` («la deriva sottile avviene solo fuori vista») |
| I1 | Build di produzione, nessun 404, nessuna chiave (11) | OK | `npm run build`; anteprima caricata: richieste solo verso `localhost` |
| I2 | Gioco utilizzabile senza rete dopo il caricamento (allegato v2.1) | Parziale | build di produzione con rete disattivata: avvio, movimento, torcia, telefono e SMS senza errori (`game-09-offline-phone.png`); il turno completo offline non è stato giocato fino in fondo nel browser |
| I3 | Nessun endpoint AI, credenziale o asset remoto (A1) | OK | `npm run audit:static`; `docs/ASSET_LICENSES.md` |
| I4 | Prestazioni: draw call, memoria, aggiornamenti lontani (11) | Non verificato | solo rendering software (SwiftShader): 93–183 draw call per fotogramma nel banco di prova; nessuna misura su una scheda grafica reale |
| I5 | Repository aggiornata e push verificato (E.8) | Parziale | tutti i commit sono locali su `main`; il push è lasciato a Ivan per sua scelta |
