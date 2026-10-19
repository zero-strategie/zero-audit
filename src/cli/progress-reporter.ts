const CLEAR_LINE = '\r\u001B[2K';

/** Rewrites one line on a terminal; on a pipe or file it only writes the final line. */
export class ProgressReporter {
  private last: string | null = null;

  constructor(
    private readonly write: (text: string) => void,
    private readonly rewritesLine: boolean,
  ) {}

  update(crawled: number, limit: number): void {
    this.last = `${String(crawled)}/${String(limit)}`;
    if (this.rewritesLine) this.write(`${CLEAR_LINE}${this.last}`);
  }

  finish(): void {
    if (this.last === null) return;
    this.write(this.rewritesLine ? '\n' : `${this.last}\n`);
  }
}
