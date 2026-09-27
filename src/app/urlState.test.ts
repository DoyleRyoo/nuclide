import { describe, it, expect } from 'vitest';
import { readUrl } from './urlState';
describe('URL state', () => {
  it('restores a valid nuclide camera and color', () =>
    expect(readUrl('?nuclide=U-235&color=halflife&view=143.5,92.5,96')).toEqual({
      id: 'U-235',
      color: 'halflife',
      view: { cx: 143.5, cy: 92.5, s: 96 },
    }));
  it.each(['NaN,2,3', ',2,3', '1,2,0', '1,2,999', '1,Infinity,3', '900,2,3'])(
    'rejects invalid camera %s',
    (view) => expect(readUrl(`?view=${view}`).view).toBeNull(),
  );
});
