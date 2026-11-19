import type { AstronomicalEvent } from '../physics/events';
import { findEvents } from '../physics/events';
import type { EventSearchRequest } from './eventsWorker';

/**
 * Поиск событий, не останавливающий кадр: в фоновом потоке, а где его нет -
 * в главном, но не в том же такте, что попросил.
 *
 * Поток может и не заработать: скрипт не загрузился, или расчёт в нём упал.
 * Тогда ответа не будет никогда, и список навсегда остался бы на «ищу».
 * Поэтому первая же ошибка потока переводит поиск в главный поток, вместе с
 * запросами, которые уже ушли в поток и ждут ответа.
 */

interface EventSearchReply {
  id: number;
  events: AstronomicalEvent[];
}

interface PendingSearch {
  from: number;
  to: number;
  resolve: (events: AstronomicalEvent[]) => void;
}

let worker: Worker | null | undefined;
let nextId = 0;
const pending = new Map<number, PendingSearch>();

/** Поиск в главном потоке, в следующем такте. */
function searchHere(from: number, to: number): Promise<AstronomicalEvent[]> {
  return new Promise((resolve) => setTimeout(() => resolve(findEvents(from, to)), 0));
}

/** Отказаться от потока и досчитать его запросы здесь. */
function abandonWorker(): void {
  worker?.terminate();
  worker = null;
  const waiting = [...pending.values()];
  pending.clear();
  for (const search of waiting) void searchHere(search.from, search.to).then(search.resolve);
}

function backgroundWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./eventsWorker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (message: MessageEvent<EventSearchReply>) => {
      const search = pending.get(message.data.id);
      pending.delete(message.data.id);
      search?.resolve(message.data.events);
    });
    worker.addEventListener('error', (event) => {
      // Ошибка обработана здесь. По стандарту необработанная ошибка потока
      // сообщается ещё и странице; Chromium её не показывает, другие
      // браузеры могут.
      event.preventDefault();
      abandonWorker();
    });
    worker.addEventListener('messageerror', abandonWorker);
  } catch {
    worker = null;
  }
  return worker;
}

/** События на отрезке, по времени. */
export function searchEvents(from: number, to: number): Promise<AstronomicalEvent[]> {
  const background = backgroundWorker();
  if (!background) return searchHere(from, to);

  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, { from, to, resolve });
    background.postMessage({ id, from, to } satisfies EventSearchRequest);
  });
}
