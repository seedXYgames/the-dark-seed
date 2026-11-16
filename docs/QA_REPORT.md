# Rapporto di verifica

## Verifica degli ultimi aggiornamenti — 16 novembre 2026

Aggiornamento successivo: osservatore persistente, musica e indicatore. 160 test totali (10 nuovi
su persistenza, distanza, immobilità sotto osservazione, riposizionamento fuori campo, fine turno,
percezione, dissolvenze, SMS e anomalie locali). La ricetta musicale passa anche i test Web Audio
su sorgenti, programmazione e arresto dei loop. Build e audit ripetuti. Nel browser, seed 0:
osservatore presente a circa 71 m dallo spawn; dopo l'attivazione compare «Ti senti osservato»,
con animazione `tds-event-pulse`, e il livello musicale sale gradualmente. Screenshot:
`docs/screenshots/watcher-indicator.png`. Nessun errore shader o nuova eccezione; audio non ascoltato.

Eseguita sulla copia locale macOS, con i cambiamenti di torcia, fauna, incontri e comandi:

- `npm test`: 12 file, 150 test superati. I dieci nuovi test coprono gruppi/seed, generazione raggiungibile,
  stealth, luce/corsa/rumori, occlusione, perdita delle tracce, morte e fuga innocua degli alieni.
- `npm run build`: riuscito, controllo TypeScript incluso; pacchetto principale circa 1,74 MB.
- `npm run audit:static`: superato su sorgenti e nuova build; `git diff --check -- src tests tools`: pulito.
- `npm run harness -- 40 1000`: 39 turni completati, una morte causata dalla setta (seed 1000), zero errori
  di percorso. L'harness ora distingue le morti dai fallimenti di navigazione; non considera la morte una vittoria.
- Browser Chromium: nuova intro, M apre la scheda Mappa; W tenuto per 0,9 s muove il giocatore di circa
  2,25 m con mappa aperta. Verificati fari iniziali accesi.
- Rendering osservato nei seed 7, 13, 14 e 78; screenshot in `docs/screenshots/encounter-*.png`.
  Animale confrontato nello stesso punto con e senza fascio in `fauna-dark.png` e `fauna-torch.png`:
  silhouette scura senza torcia, mantello leggibile sotto il fascio. Nessun errore di compilazione shader.
- Browser: Bigfoot raggiunge il giocatore, appare «Sei stato ucciso»; «Riprova lo stesso turno» avvia
  una nuova sessione con lo stesso seed e stato non terminato.
- Le verifiche ravvicinate usano il teletrasporto di sviluppo; il confronto della fauna sposta e ferma
  un cervo soltanto nella pagina di prova. Nessuna modifica alla generazione di produzione per i test visivi.
- Nessuna eccezione JavaScript osservata; un 404 del favicon già presente, estraneo al gioco.

Limiti: nuova sintesi audio verificata automaticamente, non ascoltata; inseguimento con aggiramento locale
degli ostacoli, senza pianificazione globale attraverso edifici e ponti. Le misure non certificano il target FPS.

## Rapporto della consegna precedente

Ambiente: container Linux, Node.js 22.23, Chromium headless (Playwright) con rendering software SwiftShader
(`--use-gl=angle --use-angle=swiftshader`). Nessuna scheda grafica, nessuna uscita audio, nessuna voce di sistema.
Data: 16 novembre 2026.

## Comandi eseguiti ed esiti

| Comando | Esito |
| --- | --- |
| `npx tsc --noEmit -p .` | 0 errori |
| `npx vitest run` | 11 file, 134 test, tutti superati (circa 35 s) |
| `npm run build` | riuscita in circa 11 s; pacchetto principale 1,7 MB (461 kB compresso) |
| `npx tsx tools/harness.ts 40 1000 --extreme` | 40/40 turni completati dall'auto all'auto in 9,8 s; 104 seed predisposti su 1.000.001 (0,0104%) |
| `npx tsx tools/audit.ts` | nessuna chiamata di rete, endpoint AI, credenziale o casualità non deterministica nei sorgenti; `__tds` assente da `dist/` |

Medie dell'harness su 40 turni (seed 1000–1039): 54 eventi del mondo per turno (24 ambiente, 12,6 fauna,
8,8 giocatore, 3,5 anomalie, 2,2 misteri, 1,5 PNG, 1,3 illusioni), 9,3 eventi con causa registrata,
7,8 SMS, 3,9 derive sottili, 1,65 misteri, 16 osservazioni, 11 minuti simulati.

## Flussi provati nel browser

1. **Menu e impostazioni** (sviluppo): due voci; cambio IT→EN applicato subito e conservato dopo la ricarica.
2. **Seed**: vuoto, `abc`, `-1`, `1000001`, `12.5` tengono Play disattivato; `0` e `1000000` lo attivano.
3. **Partita** (seed 55, notte): torcia con F; incarico «controllo baita» completato provando la porta;
   foto dal framebuffer (JPEG, 10,5 kB, soggetti: porta, lampada, interruttore, sedia…); telefono con T;
   rapporto composto, foto allegabile, invio; stato dell'incarico `reported`.
4. **Fine turno**: completati i quattro incarichi, tasto E davanti all'auto → riepilogo con seed, link e rapporti.
5. **Ispezione 3D**: targhetta raccolta con E, testo leggibile, ruotata muovendo il mouse.
6. **Evento estremo** (solo sviluppo): forzato, attivo, concluso; stato tornato a zero; turno chiuso dopo.
7. **Produzione** (`vite preview`): `window.__tds` non esiste; richieste solo verso `localhost`.
8. **Senza rete** (produzione, rete disattivata dopo il caricamento del menu): avvio del seed 4242, torcia,
   movimento, telefono con il briefing; nessun errore e nessuna richiesta fallita.

In tutti i flussi: zero errori di console, zero eccezioni.

## Cosa non è stato possibile verificare

- **Scheda grafica reale**: fluidità, memoria e resa finale non misurate. In rendering software il gioco gira
  a pochi fotogrammi al secondo, cosa attesa e non indicativa.
- **Audio**: i suoni sono sintetizzati e coperti da test sui parametri, ma nessuno li ha ascoltati.
- **Voce**: il browser di prova non ha voci; verificato solo il ripiego sui sottotitoli.
- **Mouse con blocco del puntatore**: non disponibile in headless; lo sguardo è stato pilotato dall'API di
  sviluppo. Nei flussi 3–6 gli spostamenti lunghi sono teletrasporti di sviluppo; il percorso a piedi
  completo è coperto dal bot headless, che usa lo stesso movimento e le stesse collisioni del giocatore.
- **Altri browser**: provato solo Chromium.
- **Effetti locali delle anomalie** (pioggia verso l'alto, polvere sospesa, riflessi, ombre deviate), fulmini,
  nastro del fiume, preset grafici basso/alto: scritti, non osservati a schermo.

## Stringhe di rete nel pacchetto

Babylon.js contiene come testo alcuni indirizzi (`cdn.babylonjs.com`, `assets.babylonjs.com`,
`snippet.babylonjs.com`, `doc.babylonjs.com`, `unpkg.com`) usati da funzioni che il gioco non chiama.
Durante le prove non è partita alcuna richiesta verso di essi.
