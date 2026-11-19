/**
 * Поиск событий в отдельном потоке.
 *
 * Поиск на пять лет вперёд идёт сотни миллисекунд на настольной машине и
 * секунды на телефоне. В главном потоке всё это время стоял бы кадр: первое
 * открытие списка выглядело как зависание, а на высокой скорости времени,
 * когда список устаревает каждую секунду, сцена дёргалась непрерывно.
 *
 * Здесь только числа: момент, участники и мера. Названия и подсказки
 * пишутся в главном потоке - там язык интерфейса.
 */

import { findEvents } from '../physics/events';

export interface EventSearchRequest {
  id: number;
  from: number;
  to: number;
}

self.addEventListener('message', (message: MessageEvent<EventSearchRequest>) => {
  const { id, from, to } = message.data;
  self.postMessage({ id, events: findEvents(from, to) });
});
