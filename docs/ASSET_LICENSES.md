# Asset e licenze

Il gioco non include asset di terzi, con un'eccezione scelta da Ivan: la voce neurale del narratore (vedi sotto).

| Tipo | Origine | Licenza |
| --- | --- | --- |
| Modelli 3D (terreno, alberi, edifici, veicoli, oggetti, persone, animali) | generati in codice (`src/render/*`) | parte del progetto |
| Texture (suolo, dettaglio, cielo, etichette degli oggetti) | generate in codice su canvas | parte del progetto |
| Suoni (ambiente, passi, oggetti, animali, anomalie) | sintetizzati con Web Audio (`src/audio/synth.ts`) | parte del progetto |
| Testi IT/EN (SMS, rapporti, commenti, note) | composti da grammatiche locali (`src/narrative/*`) | parte del progetto |
| Voce | voce neurale Piper offline (`public/voices`, `src/audio/neuralTts.ts`); se manca, sintesi del sistema tramite Web Speech API | vedi tabella sotto |
| Caratteri | font di sistema (`system-ui`, serif di sistema); nessun font incluso o scaricato | — |
| Icone dell'interfaccia | SVG scritti a mano nel codice (`src/ui/*`) | parte del progetto |

Librerie (solo codice, installate da npm):

| Pacchetto | Uso | Licenza |
| --- | --- | --- |
| `@babylonjs/core` | motore 3D, incluso nella build | Apache-2.0 |
| `vite`, `vitest`, `typescript`, `tsx`, `@types/node` | solo sviluppo, non inclusi nella build | MIT / Apache-2.0 |

Voce neurale (file serviti dal gioco stesso, nessun servizio esterno):

| File | Origine | Licenza |
| --- | --- | --- |
| `public/voices/it-riccardo_fasol-x-low.onnx` | Piper (rhasspy/piper, release v0.0.2), dataset M-AILABS | M-AILABS: uso libero con attribuzione (vedi MODEL_CARD e caito.de) |
| `public/voices/en-gb-alan-low.onnx` | Piper (rhasspy/piper, release v0.0.2), dati di Alan Pope (Mycroft mimic3 `en_UK/apope_low`) | la pagina del dataset riporta "All Rights Reserved" (Mycroft AI): verificare prima di una pubblicazione |
| `public/piper/ort.wasm.bundle.min.mjs`, `ort-wasm-simd-threaded.wasm` | onnxruntime-web 1.22.0 (Microsoft) | MIT |
| `public/piper/piper_phonemize.{js,wasm,data}` | @diffusionstudio/piper-wasm 1.0.0: piper-phonemize (MIT) con espeak-ng e i suoi dati | espeak-ng: GPL-3.0 |

Nessun nome, personaggio, grafica o musica proviene da altri giochi o film (incluso il videogioco omonimo del 1992).
