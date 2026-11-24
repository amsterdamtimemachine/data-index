/**
 * A file of one JSON value per line, written as the rows come, with a count of the
 * rows written and of those left out by reason, for the closing summary.
 */
import { createWriteStream } from 'fs';

export interface JsonlWriter<T> {
  write(row: T): void;
  skip(reason: string): void;
  readonly written: number;
  /** "40153 rows → out.jsonl; skipped 2 without coordinates" */
  summary(): string;
  close(): Promise<void>;
}

export function jsonlWriter<T>(path: string): JsonlWriter<T> {
  const stream = createWriteStream(path);
  const skipped = new Map<string, number>();
  let written = 0;
  return {
    write(row) {
      stream.write(JSON.stringify(row) + '\n');
      written++;
    },
    skip(reason) {
      skipped.set(reason, (skipped.get(reason) ?? 0) + 1);
    },
    get written() {
      return written;
    },
    summary() {
      const line = `${written} rows → ${path}`;
      if (skipped.size === 0) {
        return line;
      }
      return `${line}; skipped ${[...skipped].map(([reason, n]) => `${n} ${reason}`).join(', ')}`;
    },
    close() {
      return new Promise<void>((resolve, reject) => {
        stream.on('error', reject);
        stream.end(() => resolve());
      });
    },
  };
}
