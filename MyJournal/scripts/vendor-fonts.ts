import { FONTS } from '../src/fonts/fonts.ts';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// Build-time vendoring only. Deployed pages request fonts from their own origin.
const output = 'public/fonts';
const families = [...new Set([...FONTS.map((font) => font.family), 'Noto Sans KR'])];
const extra: Record<string, string[]> = {
  Caveat: ['600'], Gaegu: ['700'], Nunito: ['600','700','800'],
  'Noto Sans KR': ['700'], Lora: ['400-italic'], 'Playfair Display': ['400-italic'],
};
const manifest: { family: string; package: string; version: string; files: string[] }[] = [];
const temporary = await mkdtemp(join(tmpdir(), 'dear-days-fonts-'));
try {
  await mkdir(output, { recursive: true });
  let next = 0;
  async function vendor() {
    while (next < families.length) {
      const family = families[next++];
      const slug = family.toLowerCase().replace(/\s+/g, '-');
      const name = `@fontsource/${slug}`;
      const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`);
      if (!response.ok) throw new Error(`Font package unavailable: ${name}`);
      const metadata = await response.json() as { version: string; dist: { tarball: string; integrity: string } };
      if (new URL(metadata.dist.tarball).hostname !== 'registry.npmjs.org') throw new Error('Unexpected font archive host');
      const archiveResponse = await fetch(metadata.dist.tarball);
      if (!archiveResponse.ok) throw new Error(`Font download failed: ${name}`);
      const bytes = Buffer.from(await archiveResponse.arrayBuffer());
      const [algorithm, expected] = metadata.dist.integrity.split('-');
      if (createHash(algorithm).update(bytes).digest('base64') !== expected) throw new Error(`Font integrity mismatch: ${name}`);
      const work = join(temporary, slug); await mkdir(work);
      const archive = join(work, 'font.tgz'); await writeFile(archive, bytes);
      execFileSync('tar', ['-xzf', archive, '-C', work]);
      const source = join(work, 'package'); const destination = join(output, slug);
      await mkdir(destination, { recursive: true });
      let css = '';
      for (const style of ['400', ...(extra[family] ?? [])]) css += await readFile(join(source, `${style}.css`), 'utf8') + '\n';
      // Current browsers use WOFF2; omit legacy WOFF fallback files from the bundle.
      css = css.replace(/,\s*url\(['"]?\.\/files\/[^)'"\s]+\.woff['"]?\)\s*format\(['"]woff['"]\)/g, '');
      const files = [...new Set([...css.matchAll(/url\(['"]?\.\/files\/([^)'"\s]+)['"]?\)/g)].map((match) => match[1]))];
      if (!files.length || files.some((name) => !/^[a-z0-9_.-]+\.woff2$/.test(name))) throw new Error(`Unexpected font files: ${family}`);
      for (const file of files) await copyFile(join(source, 'files', file), join(destination, file));
      await copyFile(join(source, 'LICENSE'), join(destination, 'LICENSE.txt'));
      await writeFile(join(destination, 'index.css'), `/* ${family} — vendored from ${name}@${metadata.version}; see LICENSE.txt. */\n` + css.replaceAll('./files/', './'));
      manifest.push({ family, package: name, version: metadata.version, files });
      console.log(`Vendored ${family}: ${files.length} WOFF2 files`);
    }
  }
  const results = await Promise.allSettled(Array.from({ length: 4 }, vendor));
  const failed = results.find((result) => result.status === 'rejected');
  if (failed?.status === 'rejected') throw failed.reason;
  manifest.sort((a,b) => a.family.localeCompare(b.family));
  await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(join(output, 'CREDITS.md'), '# Dear Days — bundled fonts\n\nThese open-source font files are self-hosted by Dear Days. Each family directory\ncontains its original license. Package versions and files are recorded in manifest.json.\nSources: https://fontsource.org/ and the corresponding @fontsource packages on npm.\n\n' + manifest.map((font) => `- ${font.family}: ${font.package}@${font.version}; license in ${font.family.toLowerCase().replace(/\s+/g,'-')}/LICENSE.txt`).join('\n') + '\n');
} finally { await rm(temporary, { recursive: true, force: true }); }
