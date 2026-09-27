import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildDataset, serializeAme, serializeStored, type BuildResult } from './build';
import { GENERATED_DIR, RAW_DIR, readRawSources } from './sources';
import { validate } from './validate';

const hasRaw = existsSync(join(RAW_DIR, 'nubase_4.mas20.txt'));

describe.runIf(hasRaw)('원본 전체 변환', () => {
  let result: BuildResult;
  beforeAll(() => {
    result = buildDataset(readRawSources());
  });

  it('04 §11 검증(개수 스냅샷, 무결성, 골든 레코드)을 모두 통과한다', () => {
    expect(validate(result)).toEqual([]);
  });

  it('출력이 결정적이다', () => {
    const again = buildDataset(readRawSources());
    expect(serializeStored(again.stored)).toBe(serializeStored(result.stored));
    expect(serializeAme(again.ame)).toBe(serializeAme(result.ame));
  });

  it('커밋된 생성 파일이 최신이다 (data:check와 같은 조건)', () => {
    const read = (name: string) =>
      readFileSync(join(GENERATED_DIR, name), 'utf8').replace(/\r\n/g, '\n');
    expect(read('nuclides.json') === serializeStored(result.stored)).toBe(true);
    expect(read('ame.json') === serializeAme(result.ame)).toBe(true);
  });

  it('QEC = −Qβ−(Z−1, A)를 계산하고 원문 문자열로 남긴다', () => {
    const u235 = result.dataset.nuclides.find((n) => n.id === 'U-235')!;
    const pa235 = result.dataset.nuclides.find((n) => n.id === 'Pa-235')!;
    expect(pa235.ame?.qBetaMinus?.v).toMatch(/^\d/);
    expect(u235.ame?.qEC).toEqual({ ...pa235.ame!.qBetaMinus!, v: `-${pa235.ame!.qBetaMinus!.v}` });
    expect(u235.ame?.atomicMass).toEqual({ v: '235043928.117', u: '1.198' });
  });

  it('non-exist 상태를 표시하고 들뜬 에너지를 비운다', () => {
    const cu76 = result.dataset.nuclides.find((n) => n.id === 'Cu-76')!;
    expect(cu76.excited[0]).toMatchObject({ id: 'Cu-76m', nonExistent: true });
    expect(cu76.excited[0]!.exc).toBeUndefined();
  });

  it('검증은 스냅샷이 틀리면 실패를 알린다', () => {
    const broken: BuildResult = {
      ...result,
      stats: { ...result.stats, nubaseRows: result.stats.nubaseRows - 1 },
    };
    expect(validate(broken)).toEqual([expect.stringMatching(/NUBASE 데이터 행/)]);
  });
});
