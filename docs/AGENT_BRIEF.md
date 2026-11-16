# Brief comune per i workstream (leggere per intero prima di scrivere codice)

Progetto: **The Dark Seed** — horror psicologico procedurale in prima persona per browser
(TypeScript strict + Babylon.js `@babylonjs/core` v9 + Vite). Opera ORIGINALE: non usare nomi,
personaggi, grafica o stile di giochi/film esistenti (incluso il gioco omonimo del 1992).

Documenti vincolanti:
- `docs/SPEC_v2_1.md` — specifica integrale dell'autore (leggila tutta: è il requisito).
- `src/core/contracts.ts` — tipi condivisi.
- `src/core/api.ts` — interfacce tra moduli: implementa ESATTAMENTE le firme che ti riguardano.
- `src/core/rng.ts` — PRNG deterministico (`Rng`, `streamFor(seed, stream)`, `fork(name)`), rumore.

Regole per tutti:
1. Modifica SOLO i file di tua proprietà elencati nel tuo incarico. Non toccare `package.json`,
   `tsconfig.json`, `vite.config.ts`, `src/core/*`, né file di altri. Se ti serve una modifica a un
   contratto, NON farla: scrivila in fondo al tuo rapporto finale come richiesta.
2. Niente `Math.random()` nella logica di gioco: usa `Rng`. (`Math.random` è ammesso solo per lo
   sfondo del menu e per il pulsante "seed casuale".)
3. Nessuna rete a runtime, nessun asset di terzi, nessun font remoto, nessuna API key, nessun LLM.
   Tutto ciò che serve (mesh, texture, suoni) è generato in codice.
4. Nessun TODO, stub o placeholder nel percorso produttivo. Codice reale e funzionante.
5. TypeScript strict: `npx tsc --noEmit` non deve dare errori nei TUOI file (errori in file altrui
   ancora in lavorazione vanno ignorati e segnalati).
6. Test: scrivi test Vitest in `tests/<tuo-prefisso>.*.test.ts` ed eseguili con
   `npx vitest run tests/<file>`; devono passare. Ambiente dei test: node (niente DOM, niente WebGL),
   quindi la logica verificabile va tenuta separata da DOM/Babylon.
7. NON eseguire comandi git (commit, add, checkout, stash…): l'integrazione la fa il coordinatore.
   Non lanciare `npm install` di nuove dipendenze. Non avviare server che restino attivi.
8. Lingue: italiano e inglese completi, mai mescolati in una frase visibile.
9. Non rivelare mai al giocatore cause nascoste, probabilità, classificazioni del seed.
10. Rapporto finale (il tuo ultimo messaggio): elenco file creati, API esportate, comandi eseguiti
    con esito reale, limiti noti, richieste di modifica ai contratti. Conciso e veritiero.

Convenzioni: coordinate mondo in metri, x verso est, z verso nord, y in alto; area giocabile
x,z ∈ [-700, 700]. Angoli in radianti; `rotY`/`yaw` 0 = guarda verso +z, positivo verso +x.
Tempo di sessione `time` in secondi simulati dall'inizio turno; ora del giorno = startHour + time*6/3600.
