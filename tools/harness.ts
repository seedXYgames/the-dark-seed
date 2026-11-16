// Harness statistico headless: gioca N turni completi con il bot e la simulazione attiva.
// Uso: npm run harness -- [numeroSeed=20] [primoSeed=1]
import { Bot } from '../src/game/bot';
import { GameSession } from '../src/game/session';
import { diagnose } from '../src/sim/analysis';
import { isExtremeSeed } from '../src/sim/extreme';
import { seedMysteries } from '../src/sim/mysteries';
import { createSimulation } from '../src/sim/simulation';

const n = Number(process.argv[2] ?? 20), first = Number(process.argv[3] ?? 1);
let ok = 0, killed = 0;
const agg: Record<string, number> = {}, missions: Record<number, number> = {};
const add = (k: string, v: number) => { agg[k] = (agg[k] ?? 0) + v; };
const t0 = Date.now();
for (let seed = first; seed < first + n; seed++) {
  const s = new GameSession({ seed, lang: 'it', simFactory: createSimulation, postProcess: seedMysteries });
  const r = new Bot(s).playShift();
  const d = diagnose(s.state);
  if (r.ok) ok++;
  else if (s.state.death) killed++;
  missions[s.state.missions.length] = (missions[s.state.missions.length] ?? 0) + 1;
  add('events', d.events); add('chained', d.chained); add('sms', d.sms); add('smsWithCause', d.smsWithCause); add('drift', d.drift);
  add('mysteries', d.mysteries); add('observations', s.state.observations.length); add('simMinutes', s.state.time / 60);
  for (const [k, v] of Object.entries(d.byOrigin)) add(`origin.${k}`, v);
  for (const [k, v] of Object.entries(d.actors)) add(`actors.${k}`, v);
  console.log(`seed ${seed}: ${r.ok ? 'ok' : s.state.death ? 'KILLED ' + r.reason : 'FAIL ' + r.reason} missions=${s.state.missions.length} t=${(s.state.time / 60).toFixed(1)}min events=${d.events} chain=${d.maxChain} sms=${d.sms} actors=${JSON.stringify(d.actors)}`);
}
console.log(`\ncompleted ${ok}/${n} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`killed: ${killed}; navigation/gameplay failures: ${n - ok - killed}`);
console.log('missions per shift:', missions);
console.log('averages per shift:', Object.fromEntries(Object.entries(agg).map(([k, v]) => [k, +(v / n).toFixed(2)])));
if (process.argv.includes('--extreme')) {
  let c = 0;
  for (let s = 0; s <= 1_000_000; s++) if (isExtremeSeed(s)) c++;
  console.log(`extreme-predisposed seeds in 0..1,000,000: ${c} (${((c / 1_000_001) * 100).toFixed(4)}%)`);
}
if (ok + killed !== n) process.exit(1);
