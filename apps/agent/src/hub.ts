import { EventEmitter } from "node:events";

/** Per-server broadcast channel for console lines that don't come from container logs. */
class ConsoleHub {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish(serverId: string, lines: string[]) {
    if (lines.length) this.emitter.emit(serverId, lines);
  }

  system(serverId: string, message: string) {
    this.publish(serverId, [`[Loadstone] ${message}`]);
  }

  subscribe(serverId: string, fn: (lines: string[]) => void) {
    this.emitter.on(serverId, fn);
    return () => this.emitter.off(serverId, fn);
  }
}

export const hub = new ConsoleHub();
