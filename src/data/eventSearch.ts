import type { AstronomicalEvent } from '../physics/events';
import { findEvents } from '../physics/events';
import type { EventSearchRequest } from './eventsWorker';

/**
 * Поиск событий, не останавливающий кадр: в фоновом потоке, а где его нет -
 * в главном, но не в том же такте, что попросил.
 */

interface EventSearchReply {
  id: number;
  events: AstronomicalEvent[];
}

let worker: Worker | null | undefined;
let nextId = 0;
const pending = new Map<number, (events: AstronomicalEvent[]) => void>();

function backgroundWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./eventsWorker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (message: MessageEvent<EventSearchReply>) => {
      const resolve = pending.get(message.data.id);
      pending.delete(message.data.id);
      resolve?.(message.data.events);
    });
  } catch {
    worker = null;
  }
  return worker;
}

/** События на отрезке, по времени. */
export function searchEvents(from: number, to: number): Promise<AstronomicalEvent[]> {
  const background = backgroundWorker();
  if (!background) {
    return new Promise((resolve) => setTimeout(() => resolve(findEvents(from, to)), 0));
  }

  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    background.postMessage({ id, from, to } satisfies EventSearchRequest);
  });
}
