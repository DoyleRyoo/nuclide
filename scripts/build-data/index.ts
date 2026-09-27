/**
 * data/raw/*.txt → src/data/generated/{nuclides,ame}.json (04 §10).
 *   npm run data:build   변환 후 검증하고 파일을 쓴다.
 *   npm run data:check   다시 만든 결과가 커밋된 파일과 같은지 확인한다 (CI).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { buildDataset, serializeAme, serializeStored } from './build';
import { GENERATED_DIR, ROOT, readRawSources } from './sources';
import { validate } from './validate';

const check = process.argv.includes('--check');
const result = buildDataset(readRawSources());
const failures = validate(result);
console.log(
  Object.entries(result.stored.meta.counts)
    .map(([k, v]) => `  ${k.padEnd(20)} ${v}`)
    .join('\n'),
);
for (const warning of result.warnings) console.warn(`경고: ${warning}`);
if (failures.length) {
  console.error(`\n검증 실패 ${failures.length}건:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\n검증 통과 (개수 스냅샷, 무결성, 골든 레코드)');

const outputs = [
  { path: join(GENERATED_DIR, 'nuclides.json'), json: serializeStored(result.stored) },
  { path: join(GENERATED_DIR, 'ame.json'), json: serializeAme(result.ame) },
];
let stale = false;
for (const { path, json } of outputs) {
  const name = relative(ROOT, path).replaceAll('\\', '/');
  const size = `${Math.round(json.length / 1024)} KB, gzip ${Math.round(gzipSync(json).length / 1024)} KB`;
  if (check) {
    // Windows 체크아웃의 CRLF 변환은 차이로 보지 않는다.
    const committed = existsSync(path) ? readFileSync(path, 'utf8').replace(/\r\n/g, '\n') : '';
    if (committed === json) {
      console.log(`  최신: ${name} (${size})`);
    } else {
      console.error(`  다름: ${name}`);
      stale = true;
    }
  } else {
    mkdirSync(GENERATED_DIR, { recursive: true });
    writeFileSync(path, json);
    console.log(`  작성: ${name} (${size})`);
  }
}
if (stale) {
  console.error(
    '\n커밋된 파일이 원본에서 다시 만든 결과와 다릅니다. npm run data:build를 실행하세요.',
  );
  process.exit(1);
}
