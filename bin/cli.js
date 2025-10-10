#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { pull, push } from '../index.js';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const helpText = `
baltar - Stream tarballs over HTTP

Usage:
  baltar pull <url> <path> [options]
  baltar push <path> <url> [options]

Commands:
  pull <url> <path>    Download and extract tarball from URL
  push <path> <url>    Pack and upload tarball to URL

Options:
  --strip <n>          Strip n leading directory components (pull only, default: 0)
                       Use --strip 1 for npm tarballs
  --tarball <path>     Save tarball to path (pull only)
  --integrity <hash>   Verify integrity (pull only, e.g., sha512-base64hash)
  --method <method>    HTTP method (default: GET for pull, POST for push)
  --header <header>    Add HTTP header (can be repeated)
  --ignore <pattern>   Add ignore pattern (push only, can be repeated)
  --help, -h           Show this help message

Examples:
  # Pull npm package tarball (requires strip 1)
  baltar pull https://registry.npmjs.org/express/-/express-4.18.2.tgz ./express --strip 1

  # Pull and save tarball
  baltar pull https://example.com/archive.tar.gz ./extracted --tarball archive.tar.gz

  # Push with custom headers
  baltar push ./myproject https://example.com/upload --header "Authorization: Bearer token"

  # Push with ignore patterns
  baltar push ./dist https://example.com/deploy --ignore "*.test.js" --ignore "docs/*"
`;

function parseHeaders(headers) {
  if (!headers) return {};

  const headerObj = {};
  const headerArray = Array.isArray(headers) ? headers : [headers];

  for (const header of headerArray) {
    const colonIndex = header.indexOf(':');
    if (colonIndex > 0) {
      const key = header.slice(0, colonIndex).trim();
      const value = header.slice(colonIndex + 1).trim();
      headerObj[key] = value;
    }
  }

  return headerObj;
}

async function main() {
  const args = process.argv.slice(2);

  // Check for help
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(helpText);
    process.exit(0);
  }

  // Get command
  const command = args[0];
  if (command !== 'pull' && command !== 'push') {
    console.error(`Unknown command: ${command}`);
    console.error('Use "baltar --help" for usage information');
    process.exit(1);
  }

  // Parse arguments based on command
  try {
    if (command === 'pull') {
      const { values, positionals } = parseArgs({
        args: args.slice(1),
        options: {
          strip: {
            type: 'string',
            default: '0'
          },
          tarball: {
            type: 'string'
          },
          integrity: {
            type: 'string'
          },
          method: {
            type: 'string',
            default: 'GET'
          },
          header: {
            type: 'string',
            multiple: true
          }
        },
        allowPositionals: true
      });

      if (positionals.length !== 2) {
        console.error('Pull command requires <url> and <path> arguments');
        console.error('Usage: baltar pull <url> <path> [options]');
        process.exit(1);
      }

      const [url, path] = positionals;
      const strip = parseInt(values.strip, 10);

      if (isNaN(strip) || strip < 0) {
        console.error(`Invalid strip value: ${values.strip}`);
        process.exit(1);
      }

      const opts = {
        url,
        path: resolve(path),
        strip,
        method: values.method,
        headers: parseHeaders(values.header)
      };

      if (values.tarball) {
        opts.tarball = resolve(values.tarball);
      }

      if (values.integrity) {
        opts.integrity = values.integrity;
      }

      console.log(`Pulling ${url} to ${path}`);
      if (strip > 0) {
        console.log(`Stripping ${strip} directory component${strip > 1 ? 's' : ''}`);
      }

      const entries = await pull(opts);
      console.log(`Extracted ${entries.length} entries`);

      if (values.integrity) {
        console.log('Integrity verified successfully');
      }
    } else if (command === 'push') {
      const { values, positionals } = parseArgs({
        args: args.slice(1),
        options: {
          method: {
            type: 'string',
            default: 'POST'
          },
          header: {
            type: 'string',
            multiple: true
          },
          ignore: {
            type: 'string',
            multiple: true
          }
        },
        allowPositionals: true
      });

      if (positionals.length !== 2) {
        console.error('Push command requires <path> and <url> arguments');
        console.error('Usage: baltar push <path> <url> [options]');
        process.exit(1);
      }

      const [path, url] = positionals;
      const resolvedPath = resolve(path);

      if (!existsSync(resolvedPath)) {
        console.error(`Path does not exist: ${resolvedPath}`);
        process.exit(1);
      }

      const opts = {
        path: resolvedPath,
        url,
        method: values.method,
        headers: parseHeaders(values.header)
      };

      if (values.ignore) {
        opts.ignoreFiles = values.ignore;
      }

      console.log(`Pushing ${path} to ${url}`);

      const stream = push(opts);

      // Collect response
      let responseData = '';
      stream.on('data', (chunk) => {
        responseData += chunk.toString();
      });

      await new Promise((resolve, reject) => {
        stream.on('end', () => {
          console.log('Upload complete');
          if (responseData) {
            console.log('Response:', responseData);
          }
          resolve();
        });

        stream.on('error', (err) => {
          console.error('Push failed:', err.message);
          reject(err);
        });
      });
    }
  } catch (err) {
    console.error('Error:', err.message);
    if (err.stack && process.env.DEBUG) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  if (err.stack && process.env.DEBUG) {
    console.error(err.stack);
  }
  process.exit(1);
});