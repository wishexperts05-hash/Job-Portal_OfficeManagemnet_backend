import { EventEmitter } from 'events';

type RealtimePayload = {
  type: string;
  notification?: unknown;
  unreadCount?: number;
};

const bus = new EventEmitter();
bus.setMaxListeners(100);

export function publishUserEvent(userId: string, payload: RealtimePayload) {
  bus.emit(`user:${userId}`, payload);
}

export function subscribeUserEvents(
  userId: string,
  listener: (payload: RealtimePayload) => void,
) {
  const event = `user:${userId}`;
  bus.on(event, listener);
  return () => bus.off(event, listener);
}
