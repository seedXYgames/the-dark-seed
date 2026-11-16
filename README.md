# THE DARK SEED

Horror psicologico procedurale in prima persona per browser desktop. Sei un agente di polizia in turno
notturno in un bosco di montagna di 1,4 × 1,4 km: un seed (0–1.000.000) determina mondo, cielo, meteo,
incarichi e ciò che accade attorno a te. Opera originale; tutto (grafica, suoni, testi) è generato dal codice.

Stack: TypeScript · Babylon.js · Vite · WebGL2. Sito statico: nessun backend, nessun LLM, nessuna API key,
nessuna richiesta di rete a runtime.

## Avvio

1. Installa [Node.js](https://nodejs.org) 20 o superiore.
2. Nella cartella del progetto: `npm install`
3. Per giocare subito: `npm run dev` e apri `http://localhost:5173`
4. Per la versione definitiva: `npm run build`, poi `npm run preview` e apri `http://localhost:4173`
5. Per pubblicarla: carica il contenuto della cartella `dist/` su un qualsiasi hosting statico
   (GitHub Pages, Netlify, una cartella su un server). I percorsi sono relativi, funziona anche in sottocartella.

Un seed si può passare anche nell'indirizzo: `…/?seed=4242`.

## Comandi

WASD muoversi · Shift correre · mouse guardare · clic sinistro o E interagire · F torcia · T telefono
(messaggi, incarichi, fotocamera, galleria, mappa) · C foto rapida · Esc pausa.

## Verifiche

| Comando | Cosa fa |
| --- | --- |
| `npm run typecheck` | controllo dei tipi |
| `npm test` | 134 test automatici (logica, narrativa, audio, UI, simulazione, accettazione) |
| `npm run harness -- 40 1000 --extreme` | gioca 40 turni completi senza grafica e conta i seed predisposti all'evento estremo |
| `npm run audit:static` | cerca chiamate di rete, endpoint AI, credenziali e casualità non deterministica |

Documentazione: `docs/ARCHITECTURE.md`, `docs/CONTRACTS.md`, `docs/ACCEPTANCE_MATRIX.md`, `docs/QA_REPORT.md`,
`docs/ASSET_LICENSES.md`, `IMPLEMENTATION_STATUS.md`, `COORDINATION_LOG.md`. Specifica: `docs/SPEC_v2_1.md`.
