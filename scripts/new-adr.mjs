#!/usr/bin/env node
// Cria um novo ADR em docs/decisoes/ a partir do template e adiciona ao índice.
// Uso: npm run docs:adr -- "Título da decisão"
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'decisoes');
const title = process.argv.slice(2).join(' ').trim();

if (!title) {
  console.error('Uso: npm run docs:adr -- "Título da decisão"');
  process.exit(1);
}

const numbers = readdirSync(dir)
  .map((f) => /^(\d{4})-/.exec(f)?.[1])
  .filter(Boolean)
  .map(Number);
const num = String(Math.max(0, ...numbers) + 1).padStart(4, '0');

const slug = title
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 60);

const file = `${num}-${slug}.md`;
const today = new Date().toISOString().slice(0, 10);

const content = readFileSync(join(dir, '0000-template.md'), 'utf8')
  .replace('# NNNN. Título da decisão', `# ${num}. ${title}`)
  .replace('AAAA-MM-DD', today);
writeFileSync(join(dir, file), content);

const indexPath = join(dir, 'README.md');
const marker = '<!-- adr-index:fim';
const index = readFileSync(indexPath, 'utf8');
if (index.includes(marker)) {
  writeFileSync(indexPath, index.replace(marker, `| [${num}](${file}) | ${title} | Proposto |\n${marker}`));
}

console.log(`Criado: docs/decisoes/${file}`);
