# THE DARK SEED — PROMPT ONE-SHOT DI IMPLEMENTAZIONE v2.1 — CLAUDE FABLE 5.2

> **ISTRUZIONE PER CLAUDE (coordinatore principale).** Questo singolo messaggio è il mandato completo per **realizzare materialmente** il videogioco *The Dark Seed*, non per scrivere un'altra specifica. Usa gli strumenti di modifica file, terminale, Git, GitHub e browser realmente disponibili nel tuo ambiente. Inizia dalle operazioni di setup e prosegui fino a codice integrato, build verificata, gameplay completabile, test e repository aggiornato. **L'utente non scriverà una sola riga di codice e non coordinerà thread.**
>
> **Modello desiderato: Claude Fable 5.2 (`claude-fable-5-2`).** Il modello deve essere selezionato nell'interfaccia o nella configurazione che esegue questo prompt: **scrivere un nome nel prompt non cambia il modello attivo**. Se puoi controllare il modello dei sottagenti, usa Fable 5.2 dove disponibile e utile; altrimenti lavora con i modelli effettivamente consentiti e segnala il limite. Il progetto può essere eseguito in un ambiente locale o remoto: **non assumere l'esistenza di un cloud**, né l'accesso automatico al Desktop o a GitHub.
>
> **VINCOLO ECONOMICO NON NEGOZIABILE:** *The Dark Seed* deve essere completamente giocabile gratis, senza acquisto di token, API key, abbonamenti, account per giocare, backend a pagamento, software da installare, Ollama o modelli da scaricare manualmente. Nessun LLM remoto o locale è richiesto durante il gameplay. Ogni asset incluso (3D, texture, cielo, audio, immagini, font) deve essere creato in proprio o avere una licenza gratuita verificata che consenta la redistribuzione nel gioco; privilegia CC0. Nessun servizio gratuito soggetto a quote può essere un requisito di funzionamento. **Distingui il costo di sviluppo con Claude dal costo runtime del videogioco: il vincolo zero spese si riferisce al giocare e distribuire l’applicazione, non al costo eventuale dell’agente incaricato dello sviluppo.**
>
> **Decisione tecnica già presa:** priorità assoluta al browser desktop, TypeScript + Babylon.js + Vite con WebGL2 come base. Non spostare il progetto su un engine nativo, non creare prima una versione 2D/pixelata, non richiedere un LLM online durante il gameplay. Se incontri un impedimento dimostrabile, documentalo e scegli il compromesso minimo che preserva il gameplay 3D nel browser.

## A. CONTRATTO DI ESECUZIONE — ISTRUZIONI A PRIORITÀ MASSIMA

1. **Output = software reale**: file scritti nel repository, non pseudocodice, architettura teorica, TODO o screenshot spacciati per un gioco. Nessun requisito della specifica sottostante può essere scartato di nascosto. Le milestone interne non sono il risultato finale.
2. **Operatività continua e verificabile**: esegui setup → implementazione → integrazione → test → correzioni → build → verifica visiva reale (se browser disponibile) → push. Non fermarti ad aspettare un'altra richiesta per proseguire fasi interne. Chiedi intervento umano **solo** quando manchi un permesso/autenticazione che non puoi ottenere con strumenti autorizzati; nel frattempo svolgi il resto.
3. **Requisiti vs. metodologia**: la sezione “Specifica completa” qui sotto contiene il contenuto approvato dell'autore; preservane tutti i vincoli funzionali, narrativi, visivi, statistici e tecnici. Le nuove sezioni A–F servono a **renderli implementabili, integrabili e testabili**, non a ridurne l'ambizione. Se due indicazioni sembrano confliggere, prevalgono: sicurezza e integrità del workspace → conclusione del turno possibile → browser funzionante → requisiti espliciti dell'autore → dettagli implementativi suggeriti.
4. **Ottimizza per *giocabilità*, non per quantità di codice**: preferisci un sistema realmente operante a una larga collezione di classi decorative. Nessun mock o stub nel percorso produttivo per funzionamenti obbligatori. I test devono verificare anche l'effettiva interazione in scena.
5. **Non inventare esecuzioni**: registra ciò che è stato provato, i risultati e gli ambienti usati. Se non puoi accedere a GitHub/Desktop/browser, non dichiarare di averlo fatto. Le limitazioni devono essere puntuali, non una scusa per fermare il resto.
6. **One-shot significa una sola richiesta dell'utente, non un solo passaggio interno**: puoi programmare ed eseguire iterazioni, usare thread/sottagenti, scrivere test, rifattorizzare e correggere finché gli strumenti e il tempo della sessione lo permettono. Evita risposte intermedie che chiedono approvazioni progettuali già date.

## A1. POLITICA COSTO ZERO, TESTI GENERATIVI, VOCE, ASSET — OBBLIGATORIA

**Obiettivo:** nessun giocatore deve acquistare token, inserire una propria API key, scaricare modelli di gigabyte o installare Ollama per avviare The Dark Seed. La build deve funzionare come applicazione web statica e risultare giocabile anche se nessun provider AI risponde, se si raggiunge una quota gratuita o se l'utente non possiede un account presso un provider.

1. **Architettura generativa senza LLM runtime:** implementa il mondo generativo mediante PRNG, regole, entità autonome, simulazione causale, memory state e primitive combinabili. Non usare un LLM per decidere se un fenomeno possa accadere, per salvare lo stato o per sbloccare missioni. La qualità emergente deve dipendere dalla simulazione vera, non da chiamate cloud di completamento testuale. Gli eventuali moduli LLM opzionali devono essere isolati, disattivati per default e sostituibili senza cambiare le regole del mondo.
2. **Testi generativi a costo zero:** crea un *NarrativeComposer* bilingue IT/EN che componga SMS, commenti del poliziotto e rapporti da fatti osservati, tipo di incarico, luogo, oggetti ispezionati, cronologia, conoscenza effettiva del personaggio e semantica degli eventi. Usa grammatiche, slot tipizzati, segmenti variabili, regole di concordanza, filtri di ripetizione e memoria delle frasi recenti, non un insieme minuscolo di battute fisse. Le frasi devono risultare grammaticalmente corrette, coerenti e diverse senza inventare fatti non osservati. Non richiedere servizio online per generarle.
3. **Personalità vocale:** assegna al poliziotto un profilo narrativo deterministico basato sul seed, mantenendolo coerente per l'intera partita (es. riservato, pragmatico, leggermente ironico, scettico o nervoso). Personalità significa lessico, brevità, livello di commento, pause e tono testuale, **non** voci umane clonate o caricature. I fatti registrati nel rapporto restano oggettivi; il commento parlato può essere più personale. Evita che il narratore commenti ogni singolo rumore o sveli cause nascoste.
4. **Sintesi vocale gratuita nel browser:** implementa `window.speechSynthesis` / `SpeechSynthesisUtterance` con riconoscimento delle voci realmente disponibili tramite `getVoices()` e `voiceschanged`, mappatura IT/EN, rate/pitch moderati, coda e gestione delle sovrapposizioni, fallback ai sottotitoli. Preferisci `SpeechSynthesisVoice.localService===true` per evitare dipendenze remote quando presente; non promettere identiche voci su Mac/Windows o tra browser. Una voce sintetica/robotica è accettabile; **la presenza della voce nelle due lingue va testata** almeno nei browser realmente disponibili, e l'assenza di una voce locale va segnalata con eleganza senza rompere il gameplay. Nessuna chiave TTS, backend di sintesi o spesa obbligatoria.
5. **Servizi AI opzionali, non necessari:** non introdurre hard dependency da un free tier (inclusi Gemini o provider di inferenza gratuiti): limiti, policy e disponibilità cambiano. Non includere chiavi nel bundle JS. Se si desidera in futuro un provider remoto, predisponi al massimo un'interfaccia di estensione disattivata, che non comprometta privacy, seed e gioco offline. Non proporre come requisito il download di un modello con Transformers.js: è tecnicamente possibile ma contrario alla semplicità di accesso richiesta.
6. **Licenze asset:** puoi creare asset originali proceduralmente oppure integrare risorse **gratuitamente redistribuibili** (preferenza CC0) di Poly Haven, ambientCG, Kenney e font/audio con licenza equivalente verificata. Non presumere che ogni asset di una piattaforma sia CC0; verifica la licenza del singolo file. Salva le risorse necessarie dentro il progetto, non usare hotlink o download runtime. Crea `docs/ASSET_LICENSES.md` con origine, URL, autore (se noto), versione/download, licenza verificata e obblighi di attribuzione per ogni asset di terzi. Escludi materiale "free for personal use" o con divieti di ridistribuzione. Non usare asset riconoscibili presi da Alan Wake, Voices of the Void, Twin Peaks o Gone Home.
7. **Costo e rete verificati:** aggiungi test/controlli che dimostrino che nessuna meccanica fondamentale effettua richieste a endpoint di AI, non richiede token o licenze pagate e che il gameplay prosegue senza rete dopo il caricamento/caching degli asset. Documenta precisamente se un servizio di hosting statico gratuito ha quote proprie e non impegnare l'utente a costi ricorrenti.
8. **Trade-off esplicito:** preferisci un sistema narrativo locale valido e una voce imperfetta ma realmente funzionante a una promessa di generazione LLM illimitata che dipenda da servizi terzi. Non sacrificare varietà e memoria narrativa; ottienile tramite composizione, conoscenza osservata e stato simulato.

## B. PIANO DI COORDINAMENTO MULTI-THREAD OBBLIGATORIO QUANDO SUPPORTATO

- Sei il **lead integrator**. Prima di delegare, crea nel repository `docs/ARCHITECTURE.md`, `docs/CONTRACTS.md` e `docs/ACCEPTANCE_MATRIX.md` con gli schemi condivisi e i criteri di pass/fail, poi apri sottagenti/thread per workstream *realmente indipendenti*. Se lo strumento per aprire thread non esiste, esegui lo stesso piano in sequenza, senza fingere di aver delegato.
- Delega preferibilmente: (1) worldgen e navigabilità; (2) rendering, sky, meteo, vegetazione e performance; (3) player, missioni e interazioni; (4) simulazione causale, NPC, misteri ed eventi; (5) UI, SMS, rapporti, foto, audio, TTS e i18n; (6) QA, benchmark, harness statistici e packaging. È una ripartizione adattabile: **non aprire thread inutili** se causano conflitti o duplicazioni.
- Ogni incarico a un thread deve includere: deliverable precisi, file di proprietà, contratti/API, test minimi, dipendenze, criteri di accettazione e divieto di modificare file di altri senza accordo. Fornisci accesso alla **specifica integrale** e ai contratti correnti, non solo a un riassunto.
- Usa coordinamento leggero: branch/worktree isolati se disponibili, merge controllati e commit incrementali. Evita che più thread modifichino `package.json`, bootstrap, tipi comuni o scene root simultaneamente. Il coordinatore approva e integra interfacce comuni prima di lavori divergenti.
- **Ordine delle dipendenze**: seed/config world spec → contratti/mappa/POI → rendering base e player → ciclo compiti auto→POI→rapporti→auto → simulazione ambientale → narrazione ed anomalie → polish/performance. Parti dalle interfacce condivise, ma mantieni i lavori paralleli quando non confliggono.
- A ogni merge: TypeScript check, unit test, build e un controllo del loop di gioco. Se un modulo rompe il resto, riparalo prima di incorporarne altri. Non ridurre il lavoro dei thread a documentazione o rami incompleti.

## C. CONTRATTI TECNICI DA DEFINIRE SUBITO (SCHEMI INDICATIVI)

Definisci tipi TypeScript effettivi e centralizzati, in un modulo di contratti, per queste nozioni. Puoi migliorarne la forma, ma **non perdere alcun campo semanticamente necessario**:

- `Seed`: intero 0…1_000_000; `generatorVersion` e PRNG deterministico con stream indipendenti per worldgen, meteorologia, NPC, missioni, misteri, anomalia rara, UI. Il seed di menu random è separato dai PRNG di simulazione. Nessuna dipendenza da `Math.random()` per il gameplay dopo la creazione del seed.
- `WorldSpec`: bounding square 1400×1400 m, terrain/chunks, rete percorribile, POI tipizzati, nodi stradali/sentieri, edifici/oggetti posizionati, spawn auto, posizione agente, punti scenografici, stati iniziali cielo/meteo e metadati versione.
- `Mission`: ID stabile, tipo, POI, interazione concreta richiesta, prerequisiti, stato (`pending`, `inspected`, `reported`), osservazioni supportate e testo localizzato. Devono esistere sempre 2–5 missioni effettivamente completabili.
- `WorldEvent`: ID, tempo simulato, posizione/area, causa o origine (nota solo alla simulazione), attore, proprietà, precondizioni, stato prima/dopo, conseguenze persistenti, pubblico potenziale, percezione effettiva e tagging esclusivamente diagnostico.
- `Observation`: cosa agente/telecamera/telefono ha veramente visto o sentito, luogo, tempo, confidenza e fonte, indipendentemente da `WorldEvent`. Evita che rapporti o narratore conoscano cause nascoste.
- `ActorState`: NPC, fauna, fenomeni ambientali/anomali, posizione o posizione astratta fuori vista, scopo/routine, percezioni disponibili, stato e azioni possibili. La simulazione lontana produce lo stesso tipo di conseguenze persistenti della simulazione vicina.
- `AnomalyCapability`: primitive di luce, moto, audio, apparizione/scomparsa, interferenza elettronica, alterazione locale di ombre/pioggia/riflessi, spostamento oggetti, variazione percettiva; componi regole e stati, non una tabella di jumpscare ciclici.
- `SessionState`: seed/versione, tempo, posizione giocatore, batteria e pile, missioni, osservazioni, foto, SMS, rapporti, cambi di oggetti, entità e log; chiusura sessione solo all'auto e dopo tutti i rapporti.

**Invarianti da rendere testabili:** mappa logica fissa; POI e auto raggiungibili per percorsi validi; ogni missione ha un'interazione reale; nessuna entità/blocco/torcia scarica può rendere impossibile terminare; nessun danno, morte, stamina, combattimento; probabilità di anomaly-extreme per *partita*, non per minuto; eventi offscreen persistenti; lingua coerente; niente spoiler sulle cause.

## D. QUALITÀ VISIVA E PLAYTEST: NON ACCETTARE UN “3D VUOTO”

- La prima build già giocabile deve avere un **bosco riconoscibile e gradevole**, non solo un piano con cilindri e cubi: terreno con variazioni, alberi differenziati con instancing, sentieri visibili, POI credibili, almeno qualche edificio modulare, silhouette montane, cielo, materiali armonici, luci calde puntuali, torcia con fascio percepibile, nebbia e una composizione suggestiva. Stile leggero e intenzionale > numero di poligoni.
- Produci **almeno tre catture reali dal browser, se possibile**, con: (a) menu con foresta notturna; (b) turno serale/tramonto con paesaggio; (c) notte, torcia, POI e telefono/rapporto. Non usare rendering esterni scollegati dal gioco come prova di qualità. Se non puoi catturare screenshot, spiega cosa hai davvero visto/testato e come riprodurlo.
- Testa la visibilità ai due estremi ambientali: sereno/luna e coperto/buio. L'ambientazione deve poter essere realmente scura ma non illeggibile; la luminosità grafica non deve rendere irrilevante la torcia. Testa accesso agli oggetti anche senza batteria.
- Rendering efficiente: istanze, chunk, culling, ombre selettive, meteo scalabile, limite di draw calls e AI astratta a distanza. Non sacrificare l'illuminazione atmosferica per mostrare 1,96 km² interamente con alto dettaglio.
- Se gli asset di terzi non sono legalmente e tecnicamente recuperabili, crea asset stilizzati in codice o includi piccoli asset con licenza compatibile; **non lasciare placeholder** o download obbligatori all'utente.

## E. DEFINITION OF DONE / PROVE DI FUNZIONAMENTO

La consegna è accettabile soltanto se il coordinatore è in grado di dimostrare almeno questi flussi reali, oltre ai test dettagliati nella specifica:

1. Dal menu forestale: aprire Settings, cambiare IT/EN e parametri grafici, tornare indietro, aprire intro seed, provare `0`, `1000000` e input invalidi, avviare Play.
2. Muovere l'agente dalla volante verso 2–5 POI, **ispezionare oggetti 3D con rotazione**, compiere l'interazione richiesta, registrare i rapporti e rientrare fisicamente alla macchina per concludere. Prima di ciò l'auto non deve chiudere il turno.
3. Cielo e meteo diversi tra seed; stessa mappa/configurazione iniziale per stesso seed/versione. Determinismo dei sottosistemi anche se cambia l'ordine di creazione di elementi indipendenti.
4. Torcia con carica iniziale seeded, consumo, pile in luoghi plausibili, ricarica e guasti; missione ancora concludibile senza luce artificiale.
5. Azione fuori vista che cambia un oggetto e lascia conseguenze visibili; mistero con più indizi coerenti e facoltativi; NPC che segue almeno una routine plausibile; SMS/rapporti che riflettono fatti osservati.
6. Audio spaziale e ambientale con silenzi naturali; NarrativeComposer locale contestuale IT/EN e personalità seed-stabile; voce TTS locale preferita quando disponibile, sottotitoli sempre; foto scattata dal framebuffer/stato renderizzato reale e consultabile/allegabile, senza superare il budget di memoria.
7. Harness separato che testa una popolazione ampia di seed, rileva mappe invalide, campiona le frequenze degli eventi estremi intorno all'ordine di grandezza **0,01% per partita** e forza *solo in ambiente di sviluppo* la visualizzazione dell'effetto estremo per provarne la resa e il ripristino.
8. `npm install`, typecheck, test, build e preview senza errori bloccanti; niente errori in console, asset rotti, overlay di sviluppo o dead end evidenti; repository Git aggiornata, push verificato quando accessibile.

**Artefatti di prova in repo**: `docs/ARCHITECTURE.md`, `docs/CONTRACTS.md`, `docs/ACCEPTANCE_MATRIX.md` (riga per ogni requisito approvato, stato e test/prova), `docs/QA_REPORT.md` (comandi reali, esiti, browser e limiti), `IMPLEMENTATION_STATUS.md`, `README.md`, `COORDINATION_LOG.md`. Evita documentazione duplicata e autocelebrativa: deve rinviare a file, test o immagini verificabili. Mantieni screenshots di QA solo se realmente catturati.

## F. RENDICONTAZIONE FINALE AL COMMITTENTE

Rispondi in modo conciso, **dopo** avere sviluppato e testato: (1) dove si trova il progetto e URL GitHub verificato (oppure blocker esatto); (2) comandi minimi per avviare e buildare, senza scrivere codice; (3) cosa è realmente funzionante con evidenze; (4) test eseguiti e loro risultati; (5) limiti o lacune residui dichiarati specificamente. Non presentare un piano per il futuro come se fosse un prodotto consegnato; non dire che una repository è stata creata senza esito reale della creazione.

---

# SPECIFICA COMPLETA — REQUISITI APPROVATI DA PRESERVARE INTEGRALMENTE

Le sezioni seguenti mantengono **tutti** i requisiti funzionali, atmosferici, narrativi e tecnici già concordati. Le indicazioni A–F sopra sono istruzioni esecutive supplementari di pari forza; non sostituiscono né semplificano questi requisiti.

# SPECIFICA COMPLETA DEL GIOCO — THE DARK SEED (requisiti approvati dalla v1.3)

> Questo documento è **un unico prompt autosufficiente** da consegnare a un LLM con capacità di modificare file, eseguire comandi e testare un progetto. Lo scopo è ottenere **il videogioco funzionante**, non un concept, un mockup, una presentazione o una semplice architettura. Nessuna domanda all'utente e nessuna partecipazione alla scrittura del codice devono essere necessarie. Le scelte progettuali non specificate vanno risolte autonomamente e motivate nel README. L'utente non vuole scrivere neppure una riga di codice.

## ISTRUZIONI ORIGINALI AL COORDINATORE — LEGGERE PRIMA DI QUALSIASI ATTIVITÀ

**Modello richiesto: Claude Fable 5.2 (`claude-fable-5-2`).** Questo prompt viene fornito al **coordinatore principale di un progetto multi-thread/multi-agente**, non a un singolo agente che debba fare tutto in sequenza. Se la piattaforma permette di selezionare il modello per i thread, usa Claude Fable 5.2 come modello principale e per i sottoprocessi che richiedono architettura, codice e integrazione; se l'ambiente non consente tale scelta, dichiara il limite e non fingere di aver cambiato modello.

**Mandato del coordinatore:** assumiti la responsabilità dell'intero risultato. Non fermarti alla pianificazione: crea e verifica il progetto, coordina i thread disponibili, integra i contributi, risolvi conflitti e bug e consegna un gioco funzionante. I requisiti seguenti costituiscono la specifica comune e devono essere disponibili integralmente a tutti i thread coinvolti. Non scaricare sull'utente attività di scrittura codice, fusione di branch, debugging o coordinamento.

**Avvio e organizzazione del lavoro:**

1. Leggi tutta la specifica, identifica i moduli e stabilisci contratti chiari tra loro (seed e RNG, coordinate del mondo, schema eventi, stato missioni, API UI, asset condivisi). Registra decisioni e interfacce in documentazione versionata.
2. Esegui la Fase Zero: crea l'ambiente Git/GitHub effettivamente accessibile. Il progetto e il repository remoto sono la fonte di verità condivisa; non presumere che un filesystem di esecuzione sia il Desktop del Mac dell'utente.
3. **Apri thread/agenti di lavoro specializzati quando la piattaforma li supporta**, in modo parallelo dove possibile. Ripartizione suggerita: (a) core architecture, seed e generazione mappa; (b) rendering 3D, asset, paesaggio, luci e meteo; (c) movimento, interazioni, torcia, incarichi e macchina; (d) simulazione emergente, memoria, NPC e anomalie rare; (e) telefono, SMS, rapporti, audio, TTS e localizzazione; (f) QA, test deterministici, performance, build e deployment. Puoi accorpare o suddividere i thread in base ai limiti reali dell'ambiente, ma preserva i confini dei moduli.
4. I thread devono produrre **codice e test integrabili**, non solo proposte. Definisci ownership dei file, API concordate e modalità di integrazione; evita modifiche simultanee non coordinate agli stessi file. Usa branch e pull request quando disponibili, altrimenti commit piccoli e revisionati in un workspace condiviso.
5. Integra progressivamente: prima una vertical slice 3D giocabile dall'auto all'auto, poi generazione ambientale e sistemi autonomi, infine raffinatezza narrativa, anomalie estreme e polish. La vertical slice è un checkpoint interno, **non un sostituto del prodotto finale**.
6. Esegui effettivamente build, test e, se disponibili, controlli in browser reale. Correggi regressioni e soft lock, documenta test falliti e lacune residue senza spacciare componenti incompleti per completati.
7. Mantieni `README.md`, `IMPLEMENTATION_STATUS.md` e un breve `COORDINATION_LOG.md` con thread, proprietari, dipendenze, decisioni, commit integrati, test e limitazioni. Esegui commit e push verificati quando permessi e autenticazione lo consentono.

**Regola sui permessi:** non inventare accessi ad account, browser, Desktop o servizi esterni. Per la creazione della repository GitHub usa soltanto l'account dell'utente già autenticato o un'autorizzazione esplicita. Richiedi l'intervento dell'utente esclusivamente per autorizzazioni indispensabili che non puoi effettuare autonomamente; l'utente non deve scrivere codice.

---

## FASE ZERO OBBLIGATORIA — CARTELLA LOCALE E REPOSITORY GITHUB (PRIMA DI IMPLEMENTARE)

**Prima di scrivere il codice del gioco**, prepara il workspace del progetto cloud e il repository GitHub. Se hai anche accesso effettivo al Desktop dell'utente, crea la cartella locale richiesta e collegala allo stesso repository. Non limitarti a descrivere operazioni disponibili: esegui e verifica. Non dichiarare accessi, cartelle o repository che non puoi dimostrare di aver creato.

1. **Workspace cloud e cartella Desktop:** crea un workspace di progetto `TheDarkSeed` accessibile al coordinatore e ai thread. Se è disponibile un accesso reale al computer dell'utente, individua il Desktop macOS/Windows e crea anche `TheDarkSeed` lì, evitando sovrascritture e cancellazioni. Se non hai accesso al Desktop, **non considerare la cartella remota equivalente**: prepara la repository per un successivo clone/sync locale, documentandone il comando o la procedura più semplice possibile. Non bloccare lo sviluppo per una cartella locale inaccessibile.
2. **Git locale:** verifica la disponibilità di Git, inizializza il repository nella cartella, usa il branch `main` e configura un `.gitignore` adeguato a TypeScript/Vite/Babylon.js (ad esempio `node_modules`, `dist`, file temporanei, segreti e file locali dell'editor). Non inserire credenziali, token, file `.env` privati o materiale sensibile nei commit.
3. **Account GitHub dell'utente:** verifica se il computer dispone già di un'autenticazione GitHub valida, per esempio tramite GitHub CLI (`gh auth status`) oppure un'integrazione GitHub disponibile e autorizzata. **Non presumere username, indirizzi email o accessi. Non chiedere mai di incollare token o password nel prompt, nel codice o nei log.** Se manca l'autorizzazione, avvia il flusso ufficiale di accesso/browser o richiedi soltanto l'azione di autorizzazione indispensabile da parte dell'utente; nessuna riga di codice deve essere scritta dall'utente.
4. **Repository remota:** crea nell'account GitHub autenticato una repository denominata `the-dark-seed`, **privata per impostazione predefinita**, salvo esplicita diversa preferenza dell'utente. Evita duplicati: se esiste già, controlla proprietà, remote e contenuto prima di collegarla o modificarla; non effettuare force push né cancellazioni. Crea il collegamento `origin` con l'URL effettivo della repository.
5. **Primo commit:** aggiungi un `README.md` con nome, descrizione sintetica, stack tecnologico e istruzioni iniziali; includi il prompt/spec di progetto in `docs/` se disponibile, oltre a `.gitignore`. Effettua un commit iniziale significativo e pubblicalo su `main`, verificando che il push sia riuscito. I commit successivi devono accompagnare le fasi di sviluppo: implementazione, test, correzioni e miglioramenti; pusha le modifiche quando l'accesso remoto è disponibile.
6. **Verifica e trasparenza:** documenta il percorso locale utilizzato, l'URL GitHub reale, il nome del branch e lo stato di commit/push. **Non inventare un URL** e non spacciare per riuscita un'operazione non eseguita. In mancanza dell'accesso al Desktop o di permessi/autenticazione GitHub, procedi con le parti locali effettivamente disponibili e identifica precisamente l'unico blocco esterno che richiede intervento; non tentare di aggirare la sicurezza o scegliere un account alternativo.

**Ordine vincolante:** workspace disponibile → inizializzazione Git → verifica/autorizzazione GitHub → creazione/collegamento della repository → commit iniziale → avvio dei thread e implementazione del gioco. **In parallelo o successivamente**, prepara la cartella `TheDarkSeed` sul Desktop solo se il Desktop è realmente accessibile; altrimenti rendi disponibile una procedura di sincronizzazione dalla repository. Se l'accesso remoto è temporaneamente indisponibile, il lavoro tecnico può proseguire nel workspace disponibile con commit Git, ma la mancata creazione della repository remota deve essere dichiarata esplicitamente.

---

## 0. MANDATO OPERATIVO — LEGGI PRIMA DI TUTTO

Realizza **The Dark Seed**, videogioco **3D in prima persona, horror psicologico procedurale** pensato prioritariamente per **browser desktop su macOS e Windows**. Devi **scrivere effettivamente i file**, produrre un progetto completo, installabile con comandi standard, avviabile localmente e distribuibile come sito statico. Non limitarti a proporre uno stack, disegnare diagrammi o produrre pseudo-codice. Esegui build, test automatici e smoke test quando l'ambiente lo consente; risolvi gli errori. Fornisci istruzioni di avvio minime, chiare e riproducibili. Se non hai strumenti per eseguire comandi, consegna comunque tutti i file in struttura completa, senza sostenere di avere eseguito test che non hai svolto.

La **priorità è il gioco nel browser**: non sostituirlo con eseguibili nativi perché più comodi da sviluppare. Un fallback nativo Mac/Windows è ammissibile solo in caso di impossibilità tecnica dimostrata e documentata, non come scelta predefinita. Non produrre come soluzione finale un prototipo 2D/pixel art o una schermata con cubi. Lo stile deve essere da subito un 3D leggero ma suggestivo, compatibile con web; una rappresentazione molto grezza è ammessa *solo* come passaggio interno e temporaneo per verificare algoritmi.

**Tecnologia di riferimento:** TypeScript, Babylon.js, Vite, WebGL 2 come baseline con eventuale WebGPU opzionale con fallback verificato. Usa librerie complementari solo quando necessarie. App client-side distribuibile staticamente; non richiedere backend, account, API key, servizi a pagamento, modelli cloud, generatori di immagini esterni, asset con licenze incerte o dipendenze online per il normale gameplay. Web Audio per gli effetti 3D; Web Speech API (`speechSynthesis`) per TTS best-effort, con sottotitoli sempre disponibili e fallback deterministico senza voce quando una voce richiesta non è installata. Evita di promettere che tutte le installazioni browser dispongano di identica voce sintetica o perfetta parità di TTS.

Se l'ambiente o un limite di output impediscono di completare tutto in una sola risposta, lavora direttamente nel repository e continua attraverso passaggi interni fino al massimo completamento consentito. **Non dichiarare «completo» un sistema fittizio o non funzionante.** Segnala esplicitamente eventuali lacune residue in un report finale; in ogni caso consegna il miglior progetto realmente avviabile.

## 1. VISIONE NON NEGOZIABILE

**The Dark Seed** è un'esperienza in prima persona in cui il giocatore è **sempre un agente di polizia** assegnato a un turno serale/notturno in una zona montana isolata. Riceve via SMS da un collega 2–5 incarichi ordinari, esce dalla macchina di servizio, percorre un piccolo mondo boschivo generato proceduralmente, esamina luoghi e oggetti, redige rapporti e **ritorna fisicamente alla macchina per terminare con successo**.

Il gioco è principalmente **visivo, sonoro, esplorativo e atmosferico**. Il bosco dev'essere piacevole da esplorare anche senza elementi paranormali. La tensione e la paranoia sono spesso presenti, ma nessun evento soprannaturale è obbligatorio. Alcuni turni sono completamente normali; altri hanno piccoli segnali ambigui, picchi brevissimi terrificanti, coincidenze, situazioni assurde, entità o — in casi estremamente rari — rotture surreali della realtà. Non deve esistere una curva horror uniforme né un'etichetta del tipo «seed ordinario», «seed inquietante», «seed terrificante».

Riferimenti di *atmosfera e sensazioni*, NON materiali o scene da copiare: isolamento e mondo enigmatico di **Voices of the Void**; paesaggi, luci e foreste di **Alan Wake**; cittadina e mistero di **Twin Peaks**; manipolazione 3D degli oggetti in **Gone Home**. Non utilizzare nomi di personaggi, trame, loghi, audio o asset protetti di tali opere.

**Frase guida da preservare:** «Il giocatore deve poter trascorrere cento partite senza assistere a nessuna anomalia estrema, per poi incontrare qualcosa nella centunesima che metta in discussione tutto ciò che credeva di conoscere del gioco». È una metafora di rarità: non creare un contatore che garantisce l'evento al turno 101. **La rarità delle anomalie estreme NON significa cento partite prive di atmosfera horror**: inquietudine, suoni ambigui e tensione devono restare abituali.

## 2. ESPERIENZA DI AVVIO E MENU

**Titolo ufficiale:** THE DARK SEED.

### 2.1 Menu principale

- Sfondo: bosco scuro 3D, panoramica o inquadratura suggestiva, generata/variata indipendentemente a ogni apertura del menu (non deve rivelare il seed di gioco).
- Interfaccia minimalista, prevalentemente nera, tipografia leggibile, titolo evidente.
- **Solo due voci principali:** «Inizia una partita» / «Start Game» e «Impostazioni» / «Settings». **Nessun pulsante Esci.**
- Menu e interfacce localizzati completamente in italiano e inglese.

### 2.2 Impostazioni

- Scelta lingua: **Italiano / English**.
- **Solo opzioni linguistiche e grafiche**: luminosità/calibrazione display, preset qualità, risoluzione interna/render scale, ombre, antialiasing, distanza di disegno, effetti/nebbia se opportuni. Evita opzioni di difficoltà, gameplay, probabilità anomalie o invulnerabilità.
- La calibrazione luminosa del display non deve trasformare la notte in giorno né alterare luna, meteo o logica del mondo; preserva la rilevanza della torcia. Mantieni valori utilizzabili sullo schermo e non generare schermate illeggibili.
- Salva preferenze locali quando consentito, senza account; ripristina impostazioni sensate se lo storage non è disponibile.

### 2.3 Schermata introduttiva prima del Play

- Al clic su «Inizia una partita», mostra **schermo nero con testo bianco** (non lanciare ancora il turno).
- Spiega brevemente: sei un agente di polizia; svolgi interventi di routine in un bosco montano; il numero scelto determina la configurazione del turno; devi completare gli incarichi, scrivere i rapporti e tornare alla macchina. **Non anticipare cataloghi, probabilità o natura degli eventi.**
- Input seed intero compreso tra **0 e 1.000.000 inclusi**; tasto per generarne casualmente uno nello stesso intervallo; convalida input (niente frazioni, negativi, stringhe o fuori range).
- Pulsante **Play / Gioca** avvia la simulazione usando il seed scelto.
- Visualizza il seed attivo in modo discreto durante pausa o riepilogo finale, per poterlo condividere.
- Non mettere in questa schermata controlli superflui, classificazioni dei seed o spoiler.

## 3. MONDO, GEOGRAFIA E ARTE

### 3.1 Dimensioni e geografia

- **Area giocabile rigorosamente fissa 1.400 x 1.400 metri = 1,96 km²**. I confini sono naturali e credibili: pendii impraticabili, pareti, fiumi profondi, vegetazione fitta, recinzioni plausibili. Nessuna fuga accidentale dalla mappa.
- L'interno cambia radicalmente in funzione del seed: altimetria moderata, sentieri, stradine, vallate, boschi di conifere, radure, aree picnic, campeggi, tende, baite e qualche edificio; possono apparire laghi, fiumi, ruscelli, ponti, piccoli parcheggi, distributore di carburante e una **piccola cittadina montana** con poche case in stile nordamericano/Twin Peaks. Gli elementi opzionali non devono essere tutti presenti in ogni partita.
- Usa una grammatica spaziale con POI coerenti, percorsi e connessioni garantite. Gli edifici e gli oggetti necessari agli incarichi esistono sempre in posizioni fisicamente accessibili. I percorsi devono rimanere attraversabili senza saltare, nuotare, arrampicarsi o guidare.
- Il seed cambia disposizione, orientamento, piccole caratteristiche degli edifici, vie di accesso e oggetti, evitando mappe identiche con sole decorazioni spostate.
- Ai bordi mostra **paesaggi lontani non esplorabili**: montagne, foreste e valli, orizzonte, luci di case distanti. Il mondo percepito deve sembrare più grande del mondo giocabile.
- **Non costruire 1,96 km² di geometria pesante tutta con la stessa densità.** Usa terreno a tasselli, LOD/distanza, istanze di alberi e rocce, culling, oggetti aggregati e simulazione a granularità variabile.

### 3.2 Stile visivo

- Target: **3D stilizzato/semi-low-poly di qualità atmosferica**, non pixel art, non fotorealismo 4K e non primitive lasciate senza cura. Materiali, palette, silhouette di vegetazione, texture procedurali o asset ridistribuibili, luci, skybox, nebbiolina, ombre e composizione devono trasmettere isolamento e bellezza inquietante.
- Il paesaggio è protagonista: tramonto arancione/viola, blue hour, notte, luci calde occasionali, profili delle montagne, foreste scure, cieli stellati, luna variabile. La cittadina può essere visibile da lontano.
- Armonia stilistica e dettagli significativi (segnaletica, tavoli picnic, tende, recinzioni, legname, finestre, elettricità, strade) hanno priorità rispetto alla risoluzione delle texture.

### 3.3 Cielo, luce, meteo e orario

- Orario iniziale dal **tramonto alle prime luci dell'alba**, determinato dal seed; se il turno dura abbastanza, il tempo può progredire in modo credibile.
- Luna possibile o assente alla vista; fase, posizione e angolo coerenti e dipendenti dal seed; stelle, nuvolosità e colori del cielo variabili. Non serve simulazione astronomica di precisione, ma evita contraddizioni grossolane (stelle in cielo coperto, luna sempre fissa, neve col caldo tropicale).
- Condizioni iniziali variabili: sereno, nuvoloso, pioggia, nebbia, vento, neve e combinazioni coerenti; **meteo dinamico durante il turno**. Sulle superfici possono comparire segni plausibili di precipitazioni o vento in modo leggero.
- La visibilità naturale dipende da luce ambientale, luna, orario, copertura delle nuvole, nebbia e vegetazione. Non aumentare automaticamente la luminosità per facilitare il percorso, ma garantisci comunque che gli incarichi siano completabili.
- Il clima non è un indicatore del paranormale: tramonto bellissimo e fenomeno inquietante possono coesistere; bufera terrificante può accompagnare un turno del tutto normale.

## 4. STRUTTURA DI OGNI PARTITA (OBBLIGATORIA)

1. Genera da seed una configurazione valida del mondo, un **nome e cognome plausibili dell'agente**, la macchina, meteo, oggetti, NPC/animali, potenziali fenomeni e **2–5 incarichi**.
2. **Spawn sempre a piedi, accanto alla propria auto della polizia**. Auto facilmente riconoscibile e destinazione di ritorno. Non chiedere al giocatore di guidare.
3. Telefono con **SMS del collega** che presenta gli incarichi in linguaggio naturale, realistico e nella lingua scelta. Il telefono serve a leggere compiti e comunicazioni inattese.
4. Raggiungi ciascun punto richiesto e **interagisci fisicamente con almeno un elemento rilevante**: porta, interruttore, cassetto, tenda, generatore, pannello, veicolo parcheggiato, segnaletica, oggetto da esaminare. Entrare in un trigger di zona non basta.
5. Effettua l'azione e **redigi/attiva un rapporto** per ogni incarico. Anche un «tutto regolare» è una conclusione valida. Non sono obbligatori enigmi complessi.
6. Quando tutti gli incarichi e i relativi rapporti sono completati, si attiva la possibilità di concludere il turno **solo rientrando fisicamente presso la macchina e interagendo con essa**. Mostra breve riepilogo finale con seed, nome agente, durata e rapporti, senza spoiler sullo stato nascosto di eventuali fenomeni.
7. **Unica sconfitta:** il giocatore interrompe volontariamente o lascia la partita prima di tornare alla macchina. Non esiste morte, danno, arresto, boss fight, game over per mostri, fame, stamina, salute o timer di fallimento.

Le partite possono essere molto brevi (**~10–15 minuti**) o arrivare a **~60 minuti**, senza timer forzato. Geografia, numero incarichi e condizioni incidono sulla durata; intensità horror e durata non sono correlate rigidamente. Turni semplici e completamente ordinari sono esperienze valide e devono essere interessanti grazie ad ambientazione, interazioni e paesaggio.

### 4.1 Libreria di obiettivi generativi

Implementa **tipi di compiti con parametri**, non una sequenza di livelli fissi: verificare una tenda abbandonata, controllare una baita o porta, spegnere luci, riavviare/spegnere un generatore, controllare una zona picnic, ispezionare un'auto ferma, fare un controllo su un ponte o un quadro elettrico, verificare segnalazioni di fumo/luci, sorvegliare una struttura e documentare risultato. Gli incarichi variano per POI, ragione della segnalazione, oggetto interattivo, stato iniziale, esito possibile e formulazione linguistica. Alcuni luoghi saranno normali, altri sospetti; **l'assenza di anomalie non impedisce la chiusura dell'incarico**. Ogni task deve avere precondizioni, target raggiungibile, validazione di interazione e stato di rapporto completato.

## 5. CONTROLLI E OGGETTI

- **WASD** movimento, mouse per guardare, **Shift** corsa illimitata (nessuna stamina); **clic sinistro** o tasto interazione contestuale per usare il mondo; **F** torcia; **T** telefono; **Esc** pausa/ritorno al menu; comandi di ispezione esplicitati in brevi suggerimenti. Permetti configurazione ragionevole di sensibilità mouse solo se non contrasta con i Settings esclusivamente grafici/lingua: altrimenti usa un default sensato.
- Pointer lock dopo gesto esplicito del giocatore; mostra feedback al ritorno dal focus o dalla pausa. Non intrappolare il mouse nelle schermate menu.
- Movimento con collisioni e gravità credibili, piedi sul terreno, senza attraversare alberi/edifici, senza salti necessari per progredire. Nessuna meccanica di combattimento, stealth obbligatorio o crafting.
- **Oggetti 3D realmente ispezionabili**: afferrare, ingrandire, ruotare liberamente e osservare i dettagli (foto, biglietti, chiavi, radio, strumenti, carte, oggetti trovati). Non simulare il 3D con una semplice immagine 2D. Restituisci oggetti al loro stato/luogo quando opportuno.
- Interazione contestuale con oggetti del mondo: porte, interruttori, generatori, cassetti, lampade, fari dell'auto ecc. Feedback visivo discreto, nessun HUD invasivo.

### 5.1 Torcia e pile

- Il protagonista parte **sempre** con una torcia e una **carica iniziale variabile in funzione del seed**.
- Accensione/spegnimento, consumo progressivo e possibile scaricamento completo. Guasti, tremolii o interruzioni possono essere ordinari o anomalie; non associare sempre un guasto a un fantasma.
- Pile recuperabili con **spawn probabilistico per tipologia di luogo**: cassetti, baite, campeggi, servizi, veicoli, distributore; non distribuite uniformemente nel bosco. La ricarica o sostituzione è semplice, senza inventario survival complesso.
- L'oscurità deve essere intensa quando manca luce naturale. Ma batteria esaurita, malfunzionamenti e meteo avverso **non devono creare soft lock**, impedire fisicamente i rapporti o rendere impossibile trovare la strada verso l'auto. Usa riferimenti visivi naturali, percorsi e recupero tecnico non invasivo quando necessario.

## 6. NARRAZIONE, LOCALIZZAZIONE, VOCE E RAPPORTI

- Il protagonista è un agente di polizia dal **nome e cognome derivati deterministicamente dal seed**. Nome coerente con ambientazione, senza cambiare ruolo o identità durante il turno.
- Telefono: schermata SMS autentica e leggibile, con messaggi del collega e comunicazioni spontanee inaspettate. Alcuni aggiornamenti sono banali, alcuni contraddittori, alcuni potrebbero essere inspiegabili. Non trasformare ogni SMS in un jumpscare.
- **Voce sintetica contestuale**: l'agente commenta saltuariamente arrivo, osservazione, verifica e rapporto con frasi brevi e naturali. La generazione delle frasi deve dipendere dai fatti osservati (non può commentare un fantasma mai visto). La voce parla nella lingua scelta; frasi visualizzate anche come testo/sottotitoli. Utilizza TTS browser best-effort e fallback se non disponibile. Il mondo deve continuare a funzionare senza connessione o senza supporto TTS.
- Durante i rapporti, inserisci un suono pertinente (scrittura, foglio, tastiera/dispositivo in base all'interfaccia scelta). **Ogni incarico genera un rapporto contestuale** con esito reale dell'interazione e informazioni *osservate* dal protagonista, non informazioni segrete della simulazione.
- Implementa un piccolo registro di osservazioni per agent/player, separato dallo stato reale del mondo: il sistema sa che un cervo ha spostato un bidone; il protagonista che non l'ha visto non può dichiararlo con certezza.
- **Italiano e inglese completi**: menu, SMS, obiettivi, interazioni, rapporti, messaggi e sottotitoli. Nessuna miscela accidentale di lingue nelle frasi visibili. TTS deve pronunciare correttamente la lingua scelta quando il browser dispone della relativa voce.

## 7. HORROR EMERGENTE — NON UN CATALOGO DI JUMPSCARE

Il gioco evita salti di paura classici e inseguimenti obbligatori; preferisce paranoia, incertezza, solitudine, silenzi, fenomeni naturali plausibili e stranezze anche assurde. I fenomeni possono essere sonori (passi, richiami, metallo, voci lontane), luminosi (bagliori, luci in movimento), visivi (figure, ombre, presenze simili ad alieni, possibili fantasmi), fisici (oggetti spostati, levitazione rara, porte che cambiano stato), elettronici (torcia/radio/telefono), atmosferici/spaziali e percettivi. Una figura può essere un animale o una persona; il sistema non deve sempre esplicitare una spiegazione.

**Non creare un catalogo di scene complete ripetute ciclicamente** e non usare un timer del tipo «ogni cinque minuti spaventa il giocatore». È ammissibile una **libreria di capacità primitive** (muoversi, emettere luce, apparire, svanire, suonare, interagire, reagire, persistere, lasciare tracce, cambiare stato) che si combinano mediante regole, cause, contesto e agenti. Lo stesso meccanismo deve produrre risultati differenti in base a posizione, orario, percorso, meteo, stato degli oggetti, NPC e scelte del giocatore.

**Autonomia rispetto alla telecamera:** gli eventi possono verificarsi non osservati, proseguire mentre il giocatore è altrove e lasciare tracce. Non serve che ogni fenomeno venga notato. Distingui tra *evento realmente accaduto nella simulazione*, *evento osservabile* ed *evento effettivamente osservato*.

**Variabilità temporale:** un turno perlopiù tranquillo può avere un picco violentissimo seguito da normalità; un turno con tensione diffusa può non avere alcun fenomeno reale; un'intera partita può essere ordinaria. Non usare profili fissi di intensità per seed.

## 8. DIECI SISTEMI APPROVATI E OBBLIGATORI

Devono essere **implementati e collegati**, non soltanto nominati in un documento.

1. **Memoria del bosco:** stati persistenti durante il turno di porte, sedie, tende, lampade, generatori, tracce, oggetti e possibili conseguenze di azioni in assenza del giocatore. Persistenza di stato e log degli eventi; il reset avviene a nuova partita, salvo preferenze grafiche.
2. **Causalità e coincidenze:** catene di causa-effetto rappresentate nella simulazione e avvenimenti indipendenti che sembrano legati; evita rivelazioni automatiche.
3. **Comunicazioni inattese:** SMS realistici e talvolta misteriosi che riflettono stato del mondo, errori umani plausibili o osservazioni/false segnalazioni; non devono bloccare la quest principale.
4. **NPC umani occasionali:** pochi escursionisti, campeggiatori, automobilisti, residenti; percorsi e routine credibili, anche se l'utente non li incontra. Non sono sempre anomalie. Dialoghi complessi non necessari.
5. **Combinazioni estremamente rare:** esiti insoliti emergenti dall'incrocio di più processi, non solo da un elenco di scene ultra rare; consentire anche manifestazioni cosmiche/surreali radicali.
6. **Meteo dinamico:** vento, pioggia, neve, nuvole, nebbia, suono, luce e visibilità si evolvono coerentemente.
7. **Auto come luogo familiare:** spawn e finale presso l'auto, fari/sportelli o piccole interazioni; nessuna guida richiesta. Punto di riferimento emotivo e spaziale.
8. **Audio spaziale:** fauna, vento, acqua, passi, veicoli e anomalie con volume/distanza/direzione plausibili e audio di fondo ricco; non tutti i suoni sono segnali paranormali.
9. **Rapporti contestuali:** sempre su azione del giocatore e basati su osservazioni reali; voci e suoni di scrittura, più riepilogo senza spoiler.
10. **Mondo autonomo:** animali, NPC, oggetti, meteo e potenziali fenomeni agiscono anche fuori vista. Semplifica fisica e AI delle zone lontane, mantenendo gli stati risultanti coerenti.

## 9. ANOMALIE ESTREME / ROTTURA DELLA REALTÀ

Ammetti fenomeni che possono alterare **radicalmente e persino «distruttivamente» l'apparenza della realtà simulata**: cieli che diventano impossibili, geometrie che si scompongono, perdita controllata dei materiali, spazio bianco, strutture astratte, segnali visivi simili a codice di una simulazione, audio innaturale, deformazioni temporanee del paesaggio. **Esempio ispiratore, non copione obbligatorio:** il giocatore sembra intravedere «il codice della Matrix», le texture spariscono e il mondo diventa completamente bianco, come se la simulazione fosse stata scoperta. Non copiare contenuti grafici/codice di opere protette.

La **classe più estrema** deve essere *eccezionalmente rara*, con ordine di grandezza desiderato **0,01% per partita (circa una su 10.000)**; questo NON è un tasso per minuto né per frame e non è una promessa che ogni 10.000 partite ne avvenga esattamente una. Il generatore deve rappresentare la probabilità in modo esplicito e statisticamente testabile. Non confondere questi eventi con anomalie sottili, che possono essere molto più comuni, o con l'atmosfera inquietante, quasi sempre presente.

Gli eventi estremi devono essere **controllati**, mai crash reali, modifiche al sistema operativo, falsi allarmi di sicurezza, corruzione dei dati del browser o impossibilità di terminare il turno. Dopo un'alterazione radicale, ripristina percorsi, collisioni e condizioni di completamento, preservando eventualmente conseguenze narrative. Anche qui **il giocatore non può morire**. Il gioco deve poter sorprendere anche il proprio autore, ma non diventare tecnicamente imprevedibile o instabile.

**IMPORTANTE SULLA DISTRIBUZIONE STATISTICA:** i seed disponibili sono 1.000.001 e una probabilità di 0,01% equivale, in media, a circa 100 seed predisposti alla classe estrema per una versione del generatore. La manifestazione/visibilità effettiva può dipendere anche dall'azione e dalla posizione del giocatore. Non promettere un'infinità letterale di seed: è il numero di combinazioni e di evoluzioni a dare varietà.

## 10. ARCHITETTURA GENERATIVA E DETERMINISMO

**Principio:** il seed determina il *destino iniziale*, mentre le azioni del giocatore e la simulazione deterministica determinano lo svolgimento. Lo stesso seed e la stessa versione del gioco devono riprodurre lo stesso setup, se possibile anche gli stessi eventi a parità di sequenza di input/tempo simulato.

- Usa PRNG seeded stabile con **sottostream indipendenti per subsistemi** (geografia, POI, missioni, cielo/meteo, flora, fauna, NPC, fenomeni, SMS, rare flags). Evita `Math.random()` per logica di gioco una volta scelto il seed; consentito solo per sfondo menu e creazione del seed.
- Genera una **world specification** serializzabile (inclusa versione del generatore) distinta dal rendering. Più seed devono produrre mappe varie e valide.
- Prima genera geografia, connettività e POI; poi assegna missioni compatibili con i luoghi realmente disponibili; poi oggetti/interazioni, stato ambientale, NPC e fenomeni. Esegui validazioni/riparazioni di mappe per raggiungibilità di ogni obiettivo e auto.
- Usa **simulazione a timestep fisso**, stato e log eventi, con sottosistemi a diversa frequenza/distanza. Per la parte fuori vista usa aggiornamenti di stato astratti e non rendering/fisica completa.
- Componi comportamenti da primitive con regole, pesi contestuali, limiti di causa, persistenza e obiettivi locali; una regia minimale può impedire casi impossibili o eccessiva ripetizione, ma **non deve garantire uno spavento dopo X minuti**.
- Considera **entità naturali, umane e anomale** e, se utile, *illusioni percettive* come sottosistema distinto: non tutte le ombre sono entità fisiche. Distingui fatti oggettivi, percezioni, deduzioni del protagonista e rapporti.
- Introduci invarianti e controlli anti-softlock: sentieri, missioni, interazioni, collisioni e auto sempre accessibili anche in caso di buio, guasti, meteo, NPC, deformazioni estreme.
- **LLM nel runtime non obbligatorio e sconsigliato per il nucleo:** niente API key, chiamate cloud, costi e nondeterminismo per rendere giocabile la partita. Usa template composizionali, grammatiche e sistemi locali per testi e fenomeni. Puoi prevedere un'interfaccia opzionale per generazione AI in futuro, ma il gioco completo deve funzionare senza.
- Fornisci **strumenti di test per lo sviluppatore** separati dalla UI del giocatore: ispezione log, simulazione veloce di molti seed, conteggi eventi rari, test di raggiungibilità, osservazioni e verifica delle anomalie. Non rivelare ai giocatori le modalità interne del seed.

## 11. REALIZZAZIONE WEB E PRESTAZIONI

**Target primario:** desktop browser moderni su Mac/Windows; supporto mouse/tastiera. Non serve il supporto mobile come prerequisito, ma l'interfaccia non deve rompersi su viewport più piccole. Prediligi WebGL2 con fallback controllato quando disponibile; non rendere WebGPU obbligatorio.

- Progetto TypeScript + Babylon.js + Vite, dipendenze dichiarate, sorgenti e risorse versionabili.
- `npm install`, `npm run dev`, `npm run build`, `npm run preview` funzionanti (o equivalenti esatti e documentati). Produci `dist/` compatibile con hosting statico e un README chiaro; nessuna necessità di avviare un server applicativo dedicato per giocare. In locale si usa il dev server, non l'apertura diretta di `file://` se non supportata.
- Preferisci asset **procedurali realizzati in codice** (terreno, alberi, rocce, sentieri, edifici modulari, cielo, segnaletica) oppure asset open license inclusi nel repository con provenienza/licenze. NON demandare la riuscita del gioco all'utente che deve cercare e importare manualmente decine di asset.
- Ottimizzazione: instancing/thin instances, chunking del mondo, LOD, distance culling, frustum culling, livelli di dettaglio per ombre, limitazione draw calls, pooling di particelle, fisica leggera e AI in prossimità, nessuna allocazione massiccia per frame.
- Degradazione visiva tramite preset grafici, **senza disattivare il ciclo di gameplay o la simulazione di base**. Target orientativo **~30 FPS su notebook desktop di fascia media con preset medio**, da misurare e non dichiarare raggiunto senza test hardware.
- Audio browser: avviare/riprendere AudioContext dopo azione utente, gestire mute/browser throttling; TTS browser con fallback sottotitoli.
- I progressi della partita possono restare in memoria; un salvataggio completo non è richiesto. Preferenze grafiche e lingua persisteranno localmente. Non salvare o trasmettere dati personali.
- Se necessario, limita strategicamente distanza di dettaglio e uso GPU, non la grandezza logica 1,4 x 1,4 km.

## 12. UI IN-GAME E FINE TURNO

- HUD minimo, nessun indicatore di nemici o metri di terrore, niente marcatori che rendano il bosco troppo guidato. Mostra suggerimento di interazione soltanto vicino a oggetti validi; mini feedback per missione, carica torcia consultabile in modo discreto.
- Telefono con SMS e incarichi, layout credibile e leggibile in IT/EN.
- Rapporti compilabili con pochi clic dopo l'ispezione; contenuto generato sullo stato osservato; ogni rapporto associato a missione.
- Menu pausa essenziale (Riprendi, torna al menu con conferma di abbandono). Niente pulsante «Esci» nel menu iniziale.
- Riepilogo turno soltanto dopo **2–5 incarichi, interazioni e rapporti** e ritorno + interazione presso auto. Opzionale visualizzare messaggio sobrio «Turno terminato»; niente etichette di seed o reveal degli eventi paranormali.

## 12A. SISTEMI AGGIUNTIVI APPROVATI — OBBLIGATORI

Le otto idee seguenti sono **requisiti ufficiali**, non suggerimenti opzionali. Implementale riutilizzando interazioni, oggetti e sistemi già esistenti. Non aggiungere combattimento, morte, stamina o nuove interfacce complesse. Un sistema non è considerato implementato se consiste soltanto in una scena scriptata che si ripete uguale in ogni seed.

### 12A.1 Misteri persistenti, seminati dal seed

Ogni mondo deve poter ospitare uno o più **misteri locali coerenti**: un'origine latente (umana, naturale, non identificata o genuinamente anomala), segnali distribuiti in diversi luoghi, oggetti collegati e conseguenze temporali. Un mistero non deve diventare automaticamente una quest obbligatoria né richiedere che tutti gli indizi siano scoperti. Deve poter restare parzialmente o totalmente ignoto. La generazione deve verificare la coerenza causale e spaziale degli indizi ed evitare elementi che contraddicano la storia del mondo. Alcune partite possono non avere misteri secondari evidenti. L'agente deve poter finire comunque il turno ordinario.

### 12A.2 Geografia psicologica all'interno di 1,4 × 1,4 km

La dimensione giocabile resta **esattamente 1.400 × 1.400 metri**. Il generatore deve comporre aree aperte panoramiche, zone di bosco fitto, sentieri stretti, radure, pendii, strutture illuminate e luoghi isolati, distribuiti per creare contrasti percettivi e punti di riferimento senza imporre una sequenza lineare di paura. Viste su montagne e città lontane possono essere scenografia esterna alla zona giocabile. Nessuna disposizione deve compromettere la percorribilità degli incarichi o il ritorno all'auto.

### 12A.3 Anomalie locali delle regole fisiche e percettive

Oltre a luci, presenze e suoni, consenti **deviazioni temporanee e contestuali**: pioggia che sembra andare verso l'alto, ombre incoerenti con la luna, riflessi discordanti, audio che sembra provenire dal luogo sbagliato e altri cambiamenti compatibili con le primitive grafiche/audio disponibili. Non ridurle a una lista di sequenze fisse: componi proprietà, cause, intensità, localizzazione e durata. Queste anomalie non implicano necessariamente un evento estremo; la grandissima maggioranza del mondo resta credibile. Mantieni gli eventi tipo Matrix/bianco totale eccezionalmente rari (ordine di grandezza illustrativo 0,01% delle partite), senza renderli obbligatori o associati a uno specifico momento.

### 12A.4 Fotocamera di servizio minimale

Integra nel **telefono già esistente** la possibilità di scattare una fotografia in prima persona, con un unico comando/interazione, e di consultare un piccolo archivio di immagini dello stesso turno, allegabili ai rapporti. La funzione non richiede crafting, equipaggiamento complesso o servizi cloud. La foto deve catturare lo stato visibile del mondo al momento dello scatto, non generare un'immagine arbitraria scollegata dalla scena. Alcune anomalie visive possono essere registrate, altre possono non risultare sulla foto solo se il sistema di percezione/cattura lo giustifica coerentemente. Non usare automaticamente la fotografia per certificare il paranormale. Considera limiti ragionevoli a numero, dimensione e memoria delle immagini nel browser.

### 12A.5 NPC con routine motivate e plausibili

Gli esseri umani occasionali hanno **obiettivi locali e routine** (campeggiare, attraversare un sentiero, osservare il lago, raggiungere il distributore, spostarsi tra due luoghi), preferenze e conoscenza parziale. Devono agire anche fuori vista tramite simulazione astratta e produrre tracce o conseguenze. Non ogni comportamento insolito è paranormale. Evita dialoghi estesi obbligatori, combattimento e corpi solidi che blocchino passaggi cruciali. Le coincidenze con altri sistemi possono creare situazioni sorprendenti senza diventare eventi precompilati.

### 12A.6 Silenzio ambientale dinamico

Simula **presenza e assenza** di suono: fauna notturna, vento, insetti, acqua e attività umane mutano secondo ora, meteo, posizione e stati del mondo. È possibile che una zona diventi improvvisamente silenziosa, per ragioni naturali o ignote, per poi tornare normale. Un silenzio non deve innescare per forza un'apparizione o uno spavento; la sua forza è l'ambiguità. Audio spaziale e sfumature/transizioni sono preferibili a tagli audio tecnicamente bruschi e ripetitivi.

### 12A.7 Condivisione del seed e riepilogo sobrio

Dopo il completamento del turno, mostra un riepilogo con **seed, nome dell'agente, durata, numero di incarichi completati** e possibilità di copiare facilmente il seed; se praticabile, aggiungi un link condivisibile che precompili il seed senza avviare automaticamente la partita. Non mostrare conteggi di anomalie, presenza di fantasmi, classificazioni del seed, classifiche di terrore o rivelazioni sulle cause degli eventi. La riproducibilità richiede identica configurazione iniziale e flusso deterministico per stessi input/azioni; non promettere esiti identici quando le azioni del giocatore differiscono. Nessuna funzionalità multiplayer o account è necessaria.

### 12A.8 Mutamenti ambientali sottili e dubbi di memoria

Consenti piccole modifiche persistenti in punti non osservati: una tenda dal colore differente, una sedia spostata, un oggetto sul tavolo ruotato, un dettaglio della segnaletica mutato. Possono derivare da NPC, animali, condizioni ambientali o anomalie percettive; la causalità interna deve essere tracciabile nei log di sviluppo, **non rivelata nel gioco**. Il sistema deve essere parsimonioso, non cambiare continuamente tutto e non falsificare salvataggi o il contenuto dei rapporti già prodotti. Non modificare arbitrariamente oggetti essenziali rendendo impossibile un incarico.

### 12A.9 Integrazione dei sistemi e requisiti trasversali

- Mantieni una struttura di eventi con causa, attore/fenomeno, luogo, tempo, stato prima/dopo, osservabilità e persistenza. Il generatore può comporre **misteri, anomalie, NPC, meteo, audio e piccoli mutamenti** in catene causali; può anche produrre coincidenze indipendenti che sembrano collegate.
- Separa verità del mondo, ciò che il giocatore ha effettivamente percepito, ciò che compare nelle fotografie e ciò che l'agente può dichiarare nei rapporti.
- I nuovi sistemi non introducono una frequenza minima di eventi soprannaturali; **atmosfera e paranoia frequenti**, manifestazioni ambigue possibili, anomalie estreme rarissime. Non classificare seed in categorie esplicite.
- Mantieni i costi compatibili con il browser: simulazione fuori vista per eventi e stati, non rendering completo; caching, pooling e gestione della memoria per immagini e audio.
- Tutto deve funzionare **offline a runtime dopo il caricamento dei file di gioco**, senza LLM remoto, chiavi API o servizi obbligatori. Eventuali componenti generativi testuali devono avere fallback procedurale locale.

---

## 13. TEST DI ACCETTAZIONE — DEVONO ESSERE ESEGUITI, NON SOLO DESCRITTI

A. Avvio: caricamento browser senza errori JS bloccanti; background forestale menu; due sole voci principali; impostazioni IT/EN + grafica; schermata seed nera/bianca; input 0 e 1.000.000 accettati, -1, 1.000.001, decimali e testo rifiutati; Play funziona.

B. Loop: 20 seed campione generano **2–5 compiti**, tutti completi di POI/interazione/rapporto; spawn presso auto; si può camminare, correre, guardare, usare F/T e mouse; il turno non termina finché non si torna fisicamente all'auto; nessuna morte/stamina/combat.

C. Mappa: dimensione logica esatta; differenze osservabili tra seed; geografia attraversabile; ponti quando necessari; nessun oggetto obbligatorio irraggiungibile; NPC/animali non possono bloccare il giocatore; visuale con cielo, montagne e sentieri credibili.

D. Torcia: cariche iniziali variabili; consumo e scarica; pile spawn plausibili, ricarica; nel buio la torcia aiuta; esaurimento e guasto non creano blocco permanente.

E. Oggetti e narrativa: almeno un oggetto 3D esaminabile e ruotabile; compito non completato solo per trigger di zona; SMS contestuali; rapporti basati su azioni osservate; testo bilingue; voce dove supportata o sottotitoli con fallback.

F. Simulazione: eventi/stati del mondo progrediscono anche fuori vista; stati persistono nel turno; catene causali e coincidenze possibili; meteo cambia in modo coerente; audio 3D; almeno alcune combinazioni non scripted dimostrabili tramite log.

G. Eventi estremi: probabilità testata tramite **simulazione headless di moltissimi seed** (se non si possono testare almeno decine di migliaia, documentare il limite); eventi attivati via harness developer senza manipolare la probabilità di produzione; assicurarsi che rendering, collisioni e fine partita restino funzionanti dopo l'effetto. Il test harness NON rende gli eventi comuni in gameplay.

H. Otto sistemi aggiuntivi: test automatici o harness dimostrano misteri coerenti con indizi spazialmente raggiungibili ma non obbligatori; varietà nella geometria psicologica con area fissa; anomalie fisiche localizzate senza softlock; fotografie acquisite dalla scena, consultabili e allegabili; NPC con routine anche fuori vista; cambiamenti coerenti di soundscape e silenzio; riepilogo con seed copiabile senza spoiler; modifiche sottili persistenti e registrate in log. Campionare seed differenti e controllare che i risultati non siano semplicemente lo stesso evento a coordinate diverse. Verificare limiti di memoria e performance della galleria immagini.

I. Prestazioni e distribuzione: build di produzione riuscita; test web almeno in un browser reale se ambiente disponibile; asset inclusi, nessun 404, nessuna chiave mancante; istruzioni di deploy statico; controllo memoria, draw calls e update lontani in test ragionevoli.

## 14. COSA CONSEGNARE

1. **Codice sorgente completo** con struttura di progetto comprensibile e modularità minima (rendering, generatore seeded, POI/missions, player/interactions, torcia, telefono/rapporti, meteo/cielo, NPC/animali, misteri persistenti, anomalie/event log, fotografia, audio, UI/localization, tests).
2. **Gioco avviabile e costruibile**, non soltanto file di configurazione o un video di concept.
3. **Asset effettivamente presenti** o generati in codice; liste di licenze, ove applicabili.
4. README con 3–5 istruzioni chiare per l'utente: requisiti Node.js, installazione, avvio, build e hosting; nessuna modifica al codice richiesta all'utente.
5. Test automatici sulla validazione seed, determinismo, accessibilità degli incarichi, completamento turno, probabilità degli eventi rari, assenza di soft lock nelle condizioni testate.
6. Un file `IMPLEMENTATION_STATUS.md` che separi funzioni implementate e verificate, funzioni parziali e limiti reali. Non dichiarare realizzata una simulazione emergente se hai implementato solo una manciata di animazioni con timer.

## 15. VINCOLI DI QUALITÀ E CRITERI DI PRIORITÀ IN CASO DI COMPROMESSI

Non ridurre il progetto a un menu funzionante con una scena vuota. Quando devi decidere come usare tempo e risorse, ordina il lavoro nel seguente modo:

1. Un turno effettivamente giocabile **dall'auto all'auto**, con 2–5 incarichi, oggetti interattivi, rapporti e seed.
2. Un bosco **visivamente atmosferico** con mappa 1,4 x 1,4 km, buio credibile, torcia, meteo e cieli suggestivi.
3. Un **motore seeded di simulazione autonoma** con memoria del mondo, cause e coincidenze, fenomeni non ciclici.
4. Telefoni, SMS contestuali, NPC, audio spaziale, voce e localizzazione completa.
5. Misteri persistenti, geografia psicologica, anomalie delle regole fisiche, fotocamera, NPC plausibili, silenzi dinamici, riepilogo seed e mutamenti sottili; anomalie eccezionali e strumenti di test statistico.
6. Rifiniture artistiche, ottimizzazione e bug fixing fino al migliore livello tecnicamente realizzabile.

Questa è una sequenza di sviluppo **interna**, non l'autorizzazione a consegnare come prodotto finale una versione impoverita. Non cambiare le decisioni concordate con l'autore senza ragione tecnica documentata.

## 16. REGOLE FINALI PER L'AGENTE SVILUPPATORE

- **Implementa, non spiegare soltanto come implementeresti.** Non chiedere all'utente di scrivere codice, installare un game engine grafico, cercare asset o scegliere tra tecnologie. Il progetto deve essere autosufficiente.
- Non aggiungere jumpscare standard frequenti, combattimenti, morte, stamina, fame, crafting, guida obbligatoria, multiplayer, classificazioni dei seed, missioni completate solo attraversando checkpoint o durata forzata.
- Mantieni sempre differenza tra *atmosfera spesso inquietante*, *anomalie possibili e ambigue* e *rotture estreme rarissime*.
- Non usare un LLM online obbligatorio dentro al gioco. La sofisticazione generativa deve provenire da combinazione di sistemi, causalità, simulazione e buona progettazione, non da una dipendenza di rete fragile.
- Fai in modo che l'utente possa semplicemente aprire il gioco nel browser (dopo deploy) e premere Play.
- Riporta con precisione quali parti hai realmente implementato e testato. Non creare false aspettative di un gioco AAA da un solo prompt.

**Risultato richiesto: un progetto funzionante di THE DARK SEED, non una nuova proposta progettuale. Sei il coordinatore responsabile: predisponi repository e thread, crea e integra i file, verifica il gioco e riporta prove di funzionamento.**


## ALLEGATO v2.1 — PROVE DI ACCETTAZIONE ECONOMICA E NARRATIVA

- Con la rete disabilitata **dopo il caricamento/cache della build**, avvia un seed, completa almeno due incarichi, genera SMS/rapporti, ascolta la voce quando il sistema dispone di una voce locale e termina tornando alla macchina. In assenza di TTS locale, verifica che sottotitoli e progresso funzionino senza eccezioni.
- Verifica che nessuna schermata richieda account, installazione di Ollama, download manuale di modelli, carta di credito, token a pagamento o API key.
- Esegui test automatici su almeno 100 combinazioni di osservazioni/missioni per ciascuna lingua, controllando sintassi, riferimenti ai fatti e non-divulgazione delle cause ignote. Testa due profili di personalità sullo stesso contesto, verificando la differenza di stile senza cambiare i fatti.
- Verifica i file sorgenti e la build distribuita cercando credenziali, endpoint AI runtime, asset remoti e licenze mancanti; nessun asset di terzi senza registrazione in `docs/ASSET_LICENSES.md`.
- Se un limite dell'ambiente impedisce un test reale o l'uso di una voce IT/EN, documenta l'esito preciso senza dichiarare il requisito verificato.
