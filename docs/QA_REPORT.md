# Rapporto di verifica

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
