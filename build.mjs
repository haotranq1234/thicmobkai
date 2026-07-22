import { mkdir, copyFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const dist = join(root, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const file of ['index.html', 'styles.css', 'app.js', 'README.md']) {
  await copyFile(join(root, file), join(dist, file));
}

await mkdir(join(dist, '.openai'), { recursive: true });
await copyFile(join(root, '.openai', 'hosting.json'), join(dist, '.openai', 'hosting.json'));

await mkdir(join(dist, 'server'), { recursive: true });
await writeFile(
  join(dist, 'server', 'index.js'),
  `export default async function handler() {
  return new Response('ThicMobKai Converter is running.', {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
`,
  'utf8',
);

console.log('Built ThicMobKai Converter site into dist/');
