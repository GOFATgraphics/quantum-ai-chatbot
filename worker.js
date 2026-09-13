/**
 * Render Background Worker.
 * Polls due agent_schedules every minute and runs them (Gmail digest, later others).
 */
import { tickDueSchedules } from './api/lib/agentTick.js';

const INTERVAL_MS = Number(process.env.AGENT_TICK_MS) || 60_000;

async function loop() {
  try {
    const out = await tickDueSchedules();
    if (out.ran) console.log('agent tick', JSON.stringify(out));
  } catch (err) {
    console.error('agent tick failed', err?.message || err);
  }
}

console.log(`Quantumy agent worker ticking every ${INTERVAL_MS}ms`);
await loop();
setInterval(loop, INTERVAL_MS);
