# THE DARK SEED

Horror psicologico procedurale in prima persona per browser desktop. Sei un agente di polizia in turno
notturno in un bosco di montagna di 1 × 1 km: un seed (0–1.000.000) determina mondo, cielo, meteo,
incarichi e ciò che accade attorno a te. Opera originale; tutto (grafica, suoni, testi) è generato dal codice.

Stack: TypeScript · Babylon.js · Vite · WebGL2. Sito statico: nessun backend, nessun LLM, nessuna API key,
nessuna richiesta di rete a runtime.

![Menu](docs/screenshots/game-01-menu.png)

## Avvio

1. Installa [Node.js](https://nodejs.org) 20 o superiore.
2. Nella cartella del progetto: `npm install`
3. Per giocare subito: `npm run dev` e apri `http://localhost:5173`
4. Per la versione definitiva: `npm run build`, poi `npm run preview` e apri `http://localhost:4173`
5. Per pubblicarla: carica il contenuto della cartella `dist/` su un qualsiasi hosting statico
   (GitHub Pages, Netlify, una cartella su un server). I percorsi sono relativi, funziona anche in sottocartella.

Un seed si può passare anche nell'indirizzo: `…/?seed=4242`.

## Comandi

| Tasto | Azione |
| --- | --- |
| WASD | muoversi (anche col telefono in mano) |
| Shift | correre, finché c'è fiato |
| mouse | guardare |
| clic sinistro o E | interagire, aprire porte e cassetti, raccogliere |
| F | torcia |
| T | telefono: messaggi, incarichi, fotocamera, galleria, mappa |
| M | mappa diretta |
| C | foto rapida |
| R | rispondere alla radio della centrale |
| Esc | pausa |

## Il turno

Ricevi incarichi sul telefono, vai sul posto, guardi, fotografi e mandi il rapporto. La volante parte con i
fari accesi; tornarci serve a scaldarsi e a ricaricare il telefono. I messaggi nuovi compaiono **in alto a
sinistra**, l'indicatore delle stranezze resta in alto a destra.

![Torcia nel bosco](docs/screenshots/game-03-night-torch-cabin.png)
![Rapporto dal telefono](docs/screenshots/game-04-phone-report.png)

### Il corpo

- **Fiato**: si corre per circa 16 secondi, poi serve camminare per riprendersi.
- **Freddo**: con neve, pioggia e vento il corpo si gela lentamente. Sotto una certa soglia la visuale trema e
  i passi si accorciano. Ci si scalda alla volante, dentro le case o accanto a un fuoco.
- **Telefono**: si scarica in tasca, molto di più con lo schermo acceso o la fotocamera, e più in fretta col
  freddo. Da spento niente mappa, niente foto, niente rapporti finché non lo ricarichi in macchina.

Nessuno di questi uccide: rallentano e complicano il turno.

### La radio

La centrale chiama durante il turno: controlli di routine, segnalazioni su un posto preciso, avvisi meteo.
Hai una ventina di secondi per rispondere con **R**. A volte, dopo, la centrale giura di non averti mai chiamato.

### Il bosco racconta

Ogni turno nasconde un mistero (un escursionista in ritardo, un bracconiere, un cervo malato, luci sul
crinale, qualcuno che bussa di notte…). Gli indizi stanno nei luoghi e spesso dentro le case aperte. A fine
turno quelli trovati si ricompongono in un racconto: pochi indizi danno un'ipotesi, tutti la storia completa.

### Luoghi

Il bosco è di 1 km per lato, con più lampioni vicino ai punti di interesse. Oltre a baite, rifugi, campeggi,
distributori e borghi ci sono:

- **case visitabili**: circa una porta su tre è aperta; dentro tavolo, sedie, cassetti con batterie e oggetti;
- **chiese con cimitero** e **fienili** nei borghi;
- **segherie** e **stazioni meteo** isolate;
- **pontili** con barche a remi sui laghi e sul fiume.

![Dentro una casa aperta](docs/screenshots/place-house-inside.png)
![Chiesa di notte](docs/screenshots/place-church.png)
![Segheria](docs/screenshots/place-sawmill.png)
![Stazione meteo nella neve](docs/screenshots/place-weather-station.png)

### Incontri

Alcuni seed ospitano Bigfoot, un gruppo di alieni o una setta intenta a un rito. Correre e tenere la torcia
accesa facilita l'individuazione. Bigfoot e la setta possono ucciderti se ti raggiungono; gli alieni sono
innocui e fuggono dopo 2–3,5 minuti dal primo inseguimento. Dopo una morte puoi riprovare lo stesso turno.

Un piccolo uomo col cappello può osservarti da lontano e seguirti per tutto il turno, senza attaccare.
Quando ti osserva, o percepisci una stranezza, entra una musica misteriosa e lampeggia un indicatore
in alto a destra.

![Incontro](docs/screenshots/encounter-ufo.png)

## Profilo e obiettivi

Dal menu, **Profilo** mostra il nome dell'account (per ora fisso, «Test») e il grado, che sale con i turni
completati. Sotto ci sono le statistiche divise fra *Carriera* (turni iniziati e completati, seed diversi,
seed preferito, tempo in servizio, turno più lungo) e *Sul campo* (chilometri a piedi, rapporti, foto, indizi,
chiamate risposte, turni finiti male). Seguono gli ultimi seed giocati (un clic per rigiocarli) e i
**34 obiettivi**, divisi fra sbloccati e da sbloccare; alcuni sono segreti. Finché non arriva l'account,
tutto è salvato nel browser: cambiando browser o cancellando i dati del sito si riparte da zero.

![Profilo](docs/screenshots/game-12-profile.png)

## Seed di prova

Posizioni iniziali, poi gli attori si muovono.

| Seed | Incontro | Dove cercare |
| --- | --- | --- |
| 14 | Bigfoot | circa 50 m a nord-est dei Servizi del Gufo |
| 7 | 3 membri della setta | circa 90 m a nord-est del Molo della Resina |
| 13 | 4 alieni grigi, tende e apparecchiatura | circa 90 m a est del Distributore della Brina |
| 78 | 2 alieni verdi, UFO precipitato | circa 60 m a nord-ovest della Stazione di servizio della Resina |

| Cosa | Seed |
| --- | --- |
| Osservatore | 0, 8, 16 |
| Altri Bigfoot | 14, 22, 34 |
| Altre sette | 7, 12, 38 |
| Altri alieni | 13, 21, 26 |
| UFO precipitato | 21, 40, 78 |
| Borgo | 1, 3, 4 |
| Chiesa | 1, 3, 5 |
| Segheria | 1, 5, 8 |
| Stazione meteo | 0, 1, 2 |
| Pontili | 0, 1, 2 |

## Verifiche

| Comando | Cosa fa |
| --- | --- |
| `npm run typecheck` | controllo dei tipi |
| `npm test` | 181 test automatici (logica, narrativa, audio, UI, simulazione, corpo, radio, obiettivi, accettazione) |
| `npm run harness -- 40 1000 --extreme` | gioca 40 turni completi senza grafica e conta i seed predisposti all'evento estremo |
| `npm run audit:static` | cerca chiamate di rete, endpoint AI, credenziali e casualità non deterministica |

Documentazione: `docs/ARCHITECTURE.md`, `docs/CONTRACTS.md`, `docs/ACCEPTANCE_MATRIX.md`, `docs/QA_REPORT.md`,
`docs/ASSET_LICENSES.md`, `IMPLEMENTATION_STATUS.md`, `COORDINATION_LOG.md`. Specifica: `docs/SPEC_v2_1.md`.
