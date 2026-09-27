// Encode inspected browser captures, without recoloring course/artwork pixels.
// node scripts/generate-marketing-shots.cjs /path/to/captures
const path = require('node:path');
const sharp = require('sharp');
const source = process.argv[2];
if (!source) throw new Error('Provide the directory containing marketing-<name>.png captures.');
const shots = {
  'chrono-desktop': [1920, 1088], 'chrono-mobile': [359, 780],
  'focus-desktop': [1600, 908], 'planning-desktop': [1400, 793],
  'stats-desktop': [1355, 768], 'classement-desktop': [1100, 623],
  'social-desktop': [1400, 793], 'communautes-desktop': [1400, 793],
  'progression-mobile': [359, 780],
};
(async () => {
  for (const [name, [width, height]] of Object.entries(shots)) {
    const input = path.resolve(source, `marketing-${name}.png`);
    const metadata = await sharp(input).metadata();
    // Browser chrome/scrollbars can consume a few pixels of the requested viewport.
    // Preserve the capture exactly; reject a different breakpoint rather than stretch it.
    if (Math.abs(metadata.width / width - 1) > .02 || Math.abs(metadata.height / height - 1) > .02) throw new Error(`Unexpected dimensions: ${name}`);
    await sharp(input).webp({ quality: 88 }).toFile(path.join(__dirname, '..', 'public', 'site-web', 'opt', `${name}.webp`));
    console.log(`Encoded ${name} (${metadata.width} × ${metadata.height})`);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
