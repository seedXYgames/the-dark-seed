import type { MysteryMood } from '../core/api';
import { encounterSight } from './encounters';
import type { SimHost } from './host';

/** Stessa sorgente per musica e indicatore: le stranezze lontane e non percepite non sono un radar. */
export class MysteryMoodDirector {
  private cursor = 0;
  private holdUntil = -100;
  private nextScan = 0;
  private level = 0;
  private watched = false;
  private messageId = 0;
  private observationCursor = 0;
  constructor(private h: SimHost) {}
  step(dt: number) {
    const h = this.h, st = h.state;
    if (st.ended || st.abandoned) { this.level = 0; this.watched = false; return; }
    this.watched = st.actors.some(a => a.present && a.archetype === 'watcher' && a.data.watching === true);
    let strange = this.watched;
    for (; this.observationCursor < st.observations.length; this.observationCursor++) {
      if (st.observations[this.observationCursor].kind === 'changed') strange = true;
    }
    for (const m of st.messages) if (m.id > this.messageId) {
      if (m.from === 'unknown' || m.from === 'self') strange = true;
      this.messageId = Math.max(this.messageId, m.id);
    }
    for (; this.cursor < st.log.length; this.cursor++) {
      const e = st.log[this.cursor];
      if (!e.perceivedByPlayer) continue;
      if (['anomaly', 'illusion', 'mystery'].includes(e.origin) || e.tags.some(t => ['drift', 'extreme', 'unidentified'].includes(t)) ||
        e.type === 'encounter_alert' || e.type === 'encounter_sound' ||
        (e.type === 'item_inspected' && e.objectId && h.object(e.objectId)?.item?.mysteryId !== undefined)) strange = true;
    }
    if (st.time >= this.nextScan) {
      this.nextScan = st.time + 0.5;
      for (const a of st.actors) {
        if (!a.present) continue;
        if (a.kind === 'anomaly' && h.playerDistance(a.pos) < 45 && a.capabilities.some(c => c.id === 'alter_local' || c.id === 'interfere')) { strange = true; break; }
        if (!a.visible || Number(a.data.alpha ?? 1) < 0.04 || (a.kind === 'illusion' && Number(a.data.reveal ?? 0) > 0.6)) continue;
        if (!['encounter', 'anomaly', 'illusion'].includes(a.kind)) continue;
        if (h.playerDistance(a.pos) < 110 && h.playerCanSee(a.pos) && encounterSight(h.model, st.player.pos, a.pos)) { strange = true; break; }
      }
      const al = h.state.extreme;
      if (al.startedAt !== undefined && !al.done) strange = true;
    }
    if (strange) this.holdUntil = st.time + 6;
    const target = st.time < this.holdUntil ? 1 : 0;
    this.level += (target - this.level) * Math.min(1, dt / (target ? 1.4 : 3.5));
    if (this.level < 0.002) this.level = 0;
  }
  view(): MysteryMood { return { active: this.level > 0.06, intensity: this.level, watched: this.watched }; }
}
