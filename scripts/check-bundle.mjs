import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { gzipSync } from 'node:zlib';

// 05 §7 번들 예산. ame는 첫 차트 뒤에 불러오는 AME 상세 청크라 시작 데이터 예산과 따로 잰다.
const limits = { app: 150 * 1024, data: 250 * 1024, ame: 300 * 1024 };
const kinds = [
  ['data', /^nuclides(?:[-.]|$)/],
  ['ame', /^ame(?:[-.]|$)/],
];

async function findJavaScript(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return findJavaScript(path);
      return entry.isFile() && /\.m?js$/.test(entry.name) ? [path] : [];
    }),
  );
  return files.flat();
}

try {
  const files = await findJavaScript('dist');
  const sizes = { app: 0, data: 0, ame: 0 };
  const chunks = { app: 0, data: 0, ame: 0 };

  for (const file of files) {
    const kind = kinds.find(([, pattern]) => pattern.test(basename(file)))?.[0] ?? 'app';
    sizes[kind] += gzipSync(await readFile(file)).byteLength;
    chunks[kind] += 1;
  }

  if (!chunks.app || !chunks.data || !chunks.ame) {
    throw new Error(
      '앱 JS, nuclides 데이터 청크, ame 상세 청크가 각각 필요합니다. 먼저 npm run build를 실행하세요.',
    );
  }

  for (const kind of Object.keys(limits)) {
    console.log(
      `${kind}: ${(sizes[kind] / 1024).toFixed(1)} KiB gzip / ${limits[kind] / 1024} KiB`,
    );
    if (sizes[kind] > limits[kind]) process.exitCode = 1;
  }

  if (process.exitCode) console.error('설계 문서의 gzip 번들 예산을 초과했습니다.');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
