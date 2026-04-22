import archiver from 'archiver';
import { createWriteStream } from 'fs';
import { readFile, readdir, stat } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const distDir = join(root, 'dist');

async function pathExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

if (!(await pathExists(distDir))) {
  console.error('dist/ が見つかりません。先に npm run build を実行してください。');
  process.exit(1);
}

const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const outName = `chrome-summarizer-ja-v${pkg.version}.zip`;
const outPath = join(root, outName);

async function addRecursive(archive, relDir = '') {
  const absDir = join(distDir, relDir);
  const entries = await readdir(absDir, { withFileTypes: true });
  for (const ent of entries) {
    const nameInZip = relDir ? `${relDir}/${ent.name}` : ent.name;
    const absPath = join(absDir, ent.name);
    if (ent.isDirectory()) {
      await addRecursive(archive, nameInZip);
    } else {
      archive.file(absPath, { name: nameInZip });
    }
  }
}

const output = createWriteStream(outPath);
const archive = archiver('zip', { zlib: { level: 9 } });

archive.on('warning', (err) => {
  if (err.code !== 'ENOENT') throw err;
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);

await addRecursive(archive);
await archive.finalize();

await new Promise((resolve, reject) => {
  output.on('close', resolve);
  output.on('error', reject);
});

console.log(`作成しました: ${outPath} (${archive.pointer()} bytes)`);
