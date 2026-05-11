#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const GEO_COORDINATE_PATTERN =
  '([+-]?\\d+(?:\\.\\d+)?),\\s*([+-]?\\d+(?:\\.\\d+)?)';
const INLINE_LOCATION_RE = new RegExp(
  `^(\\s*Location::\\s*)(?!.*\\]\\(\\s*geo:)(.+?)\\s+geo:\\s*${GEO_COORDINATE_PATTERN}(\\s*)$`,
  'i'
);
const FRONTMATTER_LOCATION_RE = new RegExp(
  `^(\\s*location:\\s*)(?!.*\\]\\(\\s*geo:)(.+?)\\s+geo:\\s*${GEO_COORDINATE_PATTERN}(\\s*)$`,
  'i'
);
const RESTORED_GEO_LINK_RE = new RegExp(
  `\\]\\(\\s*geo:\\s*${GEO_COORDINATE_PATTERN}\\s*\\)`,
  'gi'
);

function restoreGeoLinksInContent(content) {
  let replacements = 0;
  const lines = content.split('\n');
  const restoredLines = lines.map(line => {
    const restored = restoreGeoLinkLine(line);
    if (restored !== line) {
      replacements += 1;
    }
    return restored;
  });

  return {
    content: restoredLines.join('\n'),
    replacements,
  };
}

function restoreGeoLinkLine(line) {
  const normalizedGeoLink = line.replace(
    RESTORED_GEO_LINK_RE,
    (_match, latitude, longitude) => `](geo:${latitude},${longitude})`
  );
  if (normalizedGeoLink !== line) {
    return normalizedGeoLink;
  }

  const match =
    line.match(INLINE_LOCATION_RE) ?? line.match(FRONTMATTER_LOCATION_RE);
  if (!match) {
    return line;
  }

  const [, prefix, label, latitude, longitude, trailing] = match;
  return `${prefix}[${label.trim()} ](geo:${latitude},${longitude})${trailing}`;
}

function walkMarkdownFiles(root) {
  const files = [];
  const entries = fs.readdirSync(root, {withFileTypes: true});

  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') {
      continue;
    }

    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

function parseArgs(argv) {
  const args = {
    root: undefined,
    write: false,
  };

  for (const arg of argv) {
    if (arg === '--write') {
      args.write = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (!args.root) {
      args.root = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage: node tools/restore-geo-links.cjs <vault-path> [--write]

Scans markdown files for corrupted location geo links like:
  Location:: Rennes, Bretagne, France geo:48.1113387, -1.6800198

and restores them to:
  Location:: [Rennes, Bretagne, France ](geo:48.1113387,-1.6800198)

Dry-run is the default. Add --write to modify files.`);
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || !args.root) {
    printHelp();
    return args.help ? 0 : 1;
  }

  const root = path.resolve(args.root);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`Vault path is not a directory: ${root}`);
  }

  let changedFiles = 0;
  let totalReplacements = 0;

  for (const file of walkMarkdownFiles(root)) {
    const original = fs.readFileSync(file, 'utf8');
    const restored = restoreGeoLinksInContent(original);
    if (restored.replacements === 0) {
      continue;
    }

    changedFiles += 1;
    totalReplacements += restored.replacements;
    console.log(
      `${args.write ? 'fixed' : 'would fix'} ${restored.replacements} ${path.relative(root, file)}`
    );

    if (args.write) {
      fs.writeFileSync(file, restored.content, 'utf8');
    }
  }

  console.log(
    `${args.write ? 'Fixed' : 'Would fix'} ${totalReplacements} location line(s) in ${changedFiles} file(s).`
  );

  if (!args.write && totalReplacements > 0) {
    console.log('Re-run with --write to apply these changes.');
  }

  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

module.exports = {
  restoreGeoLinksInContent,
  restoreGeoLinkLine,
};
