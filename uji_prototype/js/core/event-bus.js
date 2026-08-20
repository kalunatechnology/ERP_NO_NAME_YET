/**
 * Lightweight Pub/Sub Event Bus for decoupled communication
 */

class EventBus {
  constructor() {
    this.events = new Map();
  }

  on(event, callback) {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this.events.has(event)) {
      this.events.get(event).delete(callback);
    }
  }

  emit(event, data) {
    if (this.events.has(event)) {
      this.events.get(event).forEach(cb => {
        try {
          cb(data);
        } catch (err) {
          console.error(`[EventBus] Error in event listener for "${event}":`, err);
        }
      });
    }
  }
}

export const eventBus = new EventBus();
