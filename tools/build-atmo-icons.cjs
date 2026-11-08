// Rasterize the supplied vector mascot; no generated or redrawn brand artwork.
const sharp = require('sharp');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const mascot = fs.readFileSync(path.join(root, 'assets/brand/atmo-mascot.svg'), 'utf8');
const interior = mascot.replace(/^.*?<svg[^>]*>/s, '').replace(/<\/svg>\s*$/, '');
function icon(maskable = false) {
  const size = maskable ? 348 : 512;
  const inset = (512 - size) / 2;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#f5f5f7"/><svg x="${inset}" y="${inset}" width="${size}" height="${size}" viewBox="1490 0 800 800">${interior}</svg></svg>`);
}
(async () => {
  for (const size of [32, 48, 180, 192, 512]) {
    await sharp(icon()).resize(size, size).png().toFile(path.join(root, `assets/icons/atmo-${size}.png`));
  }
  await sharp(icon(true)).png().toFile(path.join(root, 'assets/icons/atmo-maskable-512.png'));
  // ICO directory wrapping a PNG image, supported by modern browsers and Windows.
  const png = await sharp(icon()).resize(48, 48).png().toBuffer();
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  header[6] = 48; header[7] = 48;
  header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
  fs.writeFileSync(path.join(root, 'favicon.ico'), Buffer.concat([header, png]));
  console.log('Built Atmo PWA, Apple touch, favicon and maskable icons.');
})().catch(error => { console.error(error); process.exitCode = 1; });
