import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RawFile, RawSources } from './build';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const RAW_DIR = join(ROOT, 'data', 'raw');
export const GENERATED_DIR = join(ROOT, 'src', 'data', 'generated');

export const SOURCES: Record<keyof RawSources, { name: string; file: string }> = {
  nubase: { name: 'NUBASE2020', file: 'nubase_4.mas20.txt' },
  mass: { name: 'AME2020 mass', file: 'mass_1.mas20.txt' },
  rct1: { name: 'AME2020 rct1', file: 'rct1.mas20.txt' },
  rct2: { name: 'AME2020 rct2', file: 'rct2_1.mas20.txt' },
};

/** 원본 바이트 그대로 해시를 내고, ASCII 파일이므로 latin1로 읽는다. */
export function readRawSources(dir = RAW_DIR): RawSources {
  const read = ({ name, file }: { name: string; file: string }): RawFile => {
    const bytes = readFileSync(join(dir, file));
    return {
      name,
      file,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      text: bytes.toString('latin1'),
    };
  };
  return {
    nubase: read(SOURCES.nubase),
    mass: read(SOURCES.mass),
    rct1: read(SOURCES.rct1),
    rct2: read(SOURCES.rct2),
  };
}
