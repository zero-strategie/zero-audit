import type {
  AuditEvents,
  AuditFinished,
  AuditStarted,
} from '../application/ports/audit-events.js';
import type { Clock } from '../application/ports/clock.js';

export interface TextSink {
  write(text: string): unknown;
}

/** One JSON object per line, so `docker logs` output stays machine-readable. */
export class JsonLinesAuditEvents implements AuditEvents {
  constructor(
    private readonly sink: TextSink,
    private readonly clock: Clock,
  ) {}

  started(event: AuditStarted): void {
    this.emit('audit.started', event);
  }

  finished(event: AuditFinished): void {
    this.emit('audit.finished', event);
  }

  failed(event: AuditStarted): void {
    this.emit('audit.failed', event);
  }

  private emit(name: string, payload: AuditStarted): void {
    const timestamp = new Date(this.clock.now()).toISOString();
    this.sink.write(`${JSON.stringify({ event: name, timestamp, ...payload })}\n`);
  }
}
