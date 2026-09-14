/* Minimal ICO writer. ICO allows PNG payloads inside (every browser that
   matters has supported that since IE11), so we just wrap the PNGs we already
   rendered. No dependency, and no surprise re-encoding softening the edges. */

function buildIco(images) {
  // images: [{ size, png: <Buffer> }] - sorted small to large
  const n = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);   // reserved
  header.writeUInt16LE(1, 2);   // type: icon
  header.writeUInt16LE(n, 4);   // count

  const dir = Buffer.alloc(16 * n);
  let offset = 6 + 16 * n;
  const parts = [];

  images.forEach((img, i) => {
    const b = i * 16;
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, b + 0);      // width  (0 = 256)
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, b + 1);      // height
    dir.writeUInt8(0, b + 2);                                    // palette
    dir.writeUInt8(0, b + 3);                                    // reserved
    dir.writeUInt16LE(1, b + 4);                                 // colour planes
    dir.writeUInt16LE(32, b + 6);                                // bits per pixel
    dir.writeUInt32LE(img.png.length, b + 8);                    // payload size
    dir.writeUInt32LE(offset, b + 12);                           // payload offset
    offset += img.png.length;
    parts.push(img.png);
  });

  return Buffer.concat([header, dir, ...parts]);
}

module.exports = { buildIco };
