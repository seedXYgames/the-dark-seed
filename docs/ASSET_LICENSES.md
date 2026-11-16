# Asset e licenze

Il gioco non include asset di terzi.

| Tipo | Origine | Licenza |
| --- | --- | --- |
| Modelli 3D (terreno, alberi, edifici, veicoli, oggetti, persone, animali) | generati in codice (`src/render/*`) | parte del progetto |
| Texture (suolo, dettaglio, cielo, etichette degli oggetti) | generate in codice su canvas | parte del progetto |
| Suoni (ambiente, passi, oggetti, animali, anomalie) | sintetizzati con Web Audio (`src/audio/synth.ts`) | parte del progetto |
| Testi IT/EN (SMS, rapporti, commenti, note) | composti da grammatiche locali (`src/narrative/*`) | parte del progetto |
| Voce | sintesi vocale del sistema operativo tramite Web Speech API, se presente; nessun file audio | — |
| Caratteri | font di sistema (`system-ui`, serif di sistema); nessun font incluso o scaricato | — |
| Icone dell'interfaccia | SVG scritti a mano nel codice (`src/ui/*`) | parte del progetto |

Librerie (solo codice, installate da npm):

| Pacchetto | Uso | Licenza |
| --- | --- | --- |
| `@babylonjs/core` | motore 3D, incluso nella build | Apache-2.0 |
| `vite`, `vitest`, `typescript`, `tsx`, `@types/node` | solo sviluppo, non inclusi nella build | MIT / Apache-2.0 |

Nessun nome, personaggio, grafica o musica proviene da altri giochi o film (incluso il videogioco omonimo del 1992).
