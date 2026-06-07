import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const coverageInputs = [
  {
    label: 'backend',
    file: resolve('packages/backend/coverage/coverage-summary.json'),
    stripPrefix: resolve('packages/backend') + '/',
  },
  {
    label: 'frontend',
    file: resolve('packages/frontend/coverage/coverage-summary.json'),
    stripPrefix: resolve('packages/frontend') + '/',
  },
];

function pct(block) {
  return typeof block?.pct === 'number' ? block.pct.toFixed(2) : '0.00';
}

function relabelPath(fullPath, stripPrefix) {
  return fullPath.startsWith(stripPrefix) ? fullPath.slice(stripPrefix.length) : fullPath;
}

const rows = [];

for (const input of coverageInputs) {
  const raw = await readFile(input.file, 'utf8');
  const summary = JSON.parse(raw);

  for (const [file, data] of Object.entries(summary)) {
    if (file === 'total') continue;
    rows.push({
      area: input.label,
      file: relabelPath(file, input.stripPrefix),
      statements: pct(data.statements),
      branches: pct(data.branches),
      functions: pct(data.functions),
      lines: pct(data.lines),
    });
  }
}

rows.sort((a, b) => a.area.localeCompare(b.area) || a.file.localeCompare(b.file));

const header = [
  '# Coverage Table',
  '',
  '| Area | File | Statements % | Branches % | Functions % | Lines % |',
  '| --- | --- | ---: | ---: | ---: | ---: |',
];

const body = rows.map((row) =>
  `| ${row.area} | \`${row.file}\` | ${row.statements} | ${row.branches} | ${row.functions} | ${row.lines} |`,
);

const output = `${header.concat(body).join('\n')}\n`;
const outFile = resolve('coverage/coverage-table.md');
await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, output, 'utf8');
process.stdout.write(`Wrote ${outFile}\n`);
