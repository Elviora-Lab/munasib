import 'server-only';

import { EventEmitter } from 'node:events';

/**
 * In-process event bus — survives within a single Node runtime instance.
 *
 * For cross-instance / durable events, pair with a BullMQ queue
 * (`src/server/queues`) and emit from the queue worker.
 *
 * Domain events are emitted from services AFTER the DB transaction commits.
 * Listeners can fire-and-forget side effects (emails, analytics, cache
 * invalidation) without blocking the request.
 */
export type DomainEvents = {
  'user.registered': { userId: string; email: string; name: string };
  'order.created': { orderId: string; userId: string | null; total: number; currency: string };
  'order.paid': { orderId: string };
  'order.shipped': { orderId: string };
  'order.delivered': { orderId: string };
  'order.cancelled': { orderId: string };
  'cart.line.added': { userId: string | null; productId: string; variantId: string | null };
  'review.created': { reviewId: string; productId: string; userId: string };
  'product.viewed': { productId: string; userId: string | null };
  'newsletter.subscribed': { email: string };
};

type EventName = keyof DomainEvents;

// Pin the emitter to globalThis. Next.js bundles `instrumentation.ts` (where
// listeners are registered) separately from route/server-action code (where
// events are emitted); a module-level `new EventEmitter()` would give each
// bundle its own instance, so emits would never reach the listeners. A
// process-global singleton bridges them.
const globalForBus = globalThis as unknown as { __munasibEmitter?: EventEmitter };
const emitter = globalForBus.__munasibEmitter ?? new EventEmitter();
emitter.setMaxListeners(64);
globalForBus.__munasibEmitter = emitter;

export const events = {
  emit<E extends EventName>(event: E, payload: DomainEvents[E]) {
    emitter.emit(event, payload);
  },
  on<E extends EventName>(event: E, listener: (payload: DomainEvents[E]) => void | Promise<void>) {
    emitter.on(event, (payload: DomainEvents[E]) => {
      Promise.resolve(listener(payload)).catch((err) => {
        // eslint-disable-next-line no-console
        console.error(`[event:${event}]`, err);
      });
    });
  },
  off<E extends EventName>(event: E, listener: (payload: DomainEvents[E]) => void | Promise<void>) {
    emitter.off(event, listener as never);
  },
};
