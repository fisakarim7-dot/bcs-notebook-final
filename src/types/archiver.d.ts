// Minimal ambient types for archiver v8 (ESM, ships no TypeScript declarations).
// We only use the ZipArchive streaming API in /api/backup.
declare module "archiver" {
  import { Transform } from "stream";

  export interface ArchiveEntryData {
    name?: string;
    [key: string]: unknown;
  }

  export interface ZipOptions {
    zlib?: { level?: number };
    forceLocalTime?: boolean;
    [key: string]: unknown;
  }

  export class Archiver extends Transform {
    file(source: string | Buffer, data?: ArchiveEntryData): this;
    append(
      source: string | Buffer | NodeJS.ReadableStream,
      data?: ArchiveEntryData
    ): this;
    directory(dirpath: string, destpath?: string | false, data?: ArchiveEntryData): this;
    symlink(filepath: string, target: string, type?: string): this;
    setFormat(format: string): this;
    setModule(module: unknown): this;
    finalize(): Promise<void>;
    abort(): boolean;
  }

  export class ZipArchive extends Archiver {
    constructor(options?: ZipOptions);
  }

  export class TarArchive extends Archiver {
    constructor(options?: Record<string, unknown>);
  }

  export class JsonArchive extends Archiver {
    constructor(options?: Record<string, unknown>);
  }
}
