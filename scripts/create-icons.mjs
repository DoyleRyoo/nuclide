import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

// 파비콘과 같은 네 칸을 PNG로 만든다. 외부 이미지/네트워크 의존성이 없다.
const crcTable = Array.from({ length: 256 }, (_, i) => {
  let c = i;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function chunk(type, data) {
  const tag = Buffer.from(type);
  const joined = Buffer.concat([tag, data]);
  let crc = 0xffffffff;
  for (const b of joined) crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8);
  const header = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  const trailer = Buffer.alloc(4);
  trailer.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([header, joined, trailer]);
}
function png(size, maskable) {
  const pixels = Buffer.alloc((size * 4 + 1) * size);
  const tiles = [
    [8, 36, [37, 99, 235]],
    [24, 20, [17, 24, 39]],
    [40, 4, [220, 38, 38]],
    [40, 20, [250, 204, 21]],
  ];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let px = (x / size) * 64,
        py = (y / size) * 64;
      if (maskable) {
        px = (px - 32) / 0.72 + 32;
        py = (py - 32) / 0.72 + 32;
      }
      let rgb = [243, 244, 246];
      for (const [tx, ty, c] of tiles)
        if (px >= tx && px < tx + 16 && py >= ty && py < ty + 16) rgb = c;
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      pixels.set([...rgb, 255], offset);
    }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
mkdirSync('public/icons', { recursive: true });
for (const size of [192, 512]) writeFileSync(`public/icons/icon-${size}.png`, png(size, false));
writeFileSync('public/icons/maskable-512.png', png(512, true));
