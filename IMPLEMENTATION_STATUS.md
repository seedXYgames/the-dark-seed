# Stato dell'implementazione

Aggiornato al 16 novembre 2026. Prove e comandi: `docs/QA_REPORT.md`. Requisito per requisito: `docs/ACCEPTANCE_MATRIX.md`.

## Implementato e verificato

- Menu con due voci su sfondo forestale, impostazioni (lingua IT/EN e grafica) persistenti, intro nera con
  validazione del seed 0–1.000.000, pausa, riepilogo di fine turno con seed e link condivisibile.
- Mondo procedurale di 1400 × 1400 m: terreno, lago e fiume, 13 tipi di luogo, sentieri, ponti, edifici con
  interni, oggetti con stato. Mondi validati e riparati automaticamente; stesso seed, stesso mondo.
- Turno completo: partenza dall'auto, 2–5 incarichi di 10 tipi con interazione reale, rapporti, ritorno
  fisico all'auto. 60 turni giocati per intero dal bot a piedi, senza fallimenti.
- Torcia con carica dal seed, consumo, pile di scorta, guasti; il turno resta completabile al buio.
- Telefono: messaggi, incarichi, rapporti, fotocamera, galleria (12 foto), mappa.
- Foto lette dal fotogramma reale e allegabili ai rapporti.
- Ispezione 3D degli oggetti con rotazione e zoom.
- NarrativeComposer locale IT/EN con cinque personalità: briefing, SMS, commenti, rapporti, battute dei PNG,
  note sugli oggetti; i testi usano solo fatti osservati.
- Cielo con ora, luna in fase e stelle; meteo che evolve (nuvole, nebbia, pioggia, neve, vento).
- Simulazione autonoma: PNG con routine, fauna, ambiente, catene causali registrate, anomalie da capacità,
  illusioni, deriva sottile, misteri con indizi, SMS inattesi, evento estremo con frequenza misurata.
- Sito statico senza rete a runtime; nessun asset di terzi.

## Implementato, verificato solo in parte

- **Resa grafica e prestazioni**: viste solo in rendering software. Mai provate su una scheda grafica.
- **Audio**: motore, sintesi e paesaggio sonoro scritti e coperti da test; mai ascoltati.
- **Voce**: usa le voci del sistema quando ci sono; provato solo il ripiego sui sottotitoli.
- **Evento estremo nel gioco completo**: stato, durata e ripristino verificati; l'effetto pieno è stato
  fotografato solo nel banco di prova grafico (`docs/screenshots/env-extreme.png`).
- **Alterazioni locali delle anomalie** (pioggia verso l'alto, polvere, riflessi, ombre): collegate dalla
  simulazione al rendering, non osservate a schermo.
- **Sguardo col mouse**: scritto con blocco del puntatore, non provabile in headless.

## Limiti reali

- I PNG sono al più tre per turno e hanno un repertorio breve: una battuta su scopo e cose viste, nessun
  dialogo a scelte. Camminano; non guidano veicoli.
- La simulazione è a regole: gli attori reagiscono a suoni, vicinanza, meteo e ad altri attori, e le catene
  sono reali e registrate, ma sono corte (di solito due o tre anelli).
- I misteri lasciano indizi e conseguenze ma non hanno una risoluzione giocabile: per scelta non vengono spiegati.
- Lo strascico «stelle» dell'evento estremo è registrato nel registro ma non cambia il cielo.
- Chiome degli alberi schematiche da vicino; cambio di dettaglio degli alberi senza dissolvenza; bordi dei
  sentieri morbidi (0,78 m per texel); oltre 420 m il terreno non ha alberi e sfuma nella foschia.
- L'acqua non riflette le lampade dei luoghi; il fascio della torcia non è occluso dagli oggetti vicini.
- Pensato per desktop con tastiera e mouse; nessun supporto a touch o gamepad.
- Provato solo in Chromium.
- I commit sono solo locali: il push su GitHub spetta a Ivan.
