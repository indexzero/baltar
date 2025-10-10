# baltar

[![CI](https://github.com/indexzero/baltar/actions/workflows/ci.yaml/badge.svg)](https://github.com/indexzero/baltar/actions/workflows/ci.yaml)
[![npm version](https://badge.fury.io/js/baltar.svg)](https://www.npmjs.com/package/baltar)
[![node](https://img.shields.io/node/v/baltar.svg)](https://www.npmjs.com/package/baltar)

A few small utilities for working with tarballs and http. Because you need tarballs over HTTP like:

![](https://i.giphy.com/media/52HjuHsfVO69q/giphy-downsized.gif)

## Installation

```bash
npm install baltar
```

Requires Node.js >= 20.0.0

## CLI Usage

```bash
# Pull and extract a tarball
baltar pull https://example.com/archive.tar.gz ./extracted

# Pull npm package (requires --strip 1)
baltar pull https://registry.npmjs.org/express/-/express-4.18.2.tgz ./express --strip 1

# Push a directory as tarball
baltar push ./myproject https://example.com/upload

# Get help
baltar --help
```

### CLI Options

- `--strip <n>`: Strip n leading directory components (pull only, use 1 for npm tarballs)
- `--tarball <path>`: Save tarball to path (pull only)
- `--integrity <hash>`: Verify integrity (pull only)
- `--method <method>`: HTTP method (default: GET for pull, POST for push)
- `--header <header>`: Add HTTP header (can be repeated)
- `--ignore <pattern>`: Add ignore pattern (push only, can be repeated)

## API Usage

### Fetch & send tarballs over the network

##### `baltar.pull(opts, callback)`

Makes a request to `opts.url` and unpacks it to `opts.path`. Returns extracted entries via callback.

- `opts.url`: {string} Location of the tarball
- `opts.headers`: {Object} HTTP headers to send
- `opts.method`: {string} HTTP method (default: GET)
- `opts.path`: {string} Directory to unpack to
- `opts.tarball`: {string} Optional path to save tarball to
- `opts.integrity`: {string} Optional SRI hash for verification
- `opts.strip`: {number} Optional number of leading directory components to strip (default: 0)

```js
import { pull } from 'baltar';

// Promise-based (modern)
const entries = await pull({
  url: 'https://example.com/path/to/any/file.tgz',
  path: 'location/to/untar/into'
});

// Callback-based (legacy compatibility)
pull({
  url: 'https://example.com/path/to/any/file.tgz',
  path: 'location/to/untar/into'
}, (err, entries) => {
  if (err) throw err;
  const filenames = entries.map(e => e.path);
  console.log(filenames);
});
```

##### `baltar.push(opts)`

Pushes a tarball created from `opts.path` to `opts.url`. Returns a stream representing the response.

- `opts.path`: Directory or file to pack
- `opts.ignoreFiles`: Extra ignore patterns
- `opts.url`: {string} Upload destination
- `opts.headers`: {Object} HTTP headers
- `opts.method`: {string} HTTP method (default: POST)
- `opts.signal`: {AbortSignal} Optional abort signal

```js
import { push } from 'baltar';

push({
  path: 'directory/or/file/to/pack',
  url: 'http://example.com/path/to/tarball/uploaded.tgz'
})
.on('error', err => console.error(err))
.on('finish', () => console.log('Upload complete'));
```

### Pack and unpack tarballs locally

##### `baltar.unpack(opts)`

Returns a stream which unpacks into the specified `opts.path`.

- `opts`: {Object|string} Options or path string
- `opts.path`: Directory to unpack to

```js
import { createReadStream } from 'node:fs';
import { unpack } from 'baltar';

createReadStream('path/to/any/file.tgz')
  .pipe(unpack({ path: 'location/to/untar/into' }))
  .on('entry', e => console.log('Extracting:', e.path))
  .on('done', () => console.log('Complete'));
```

##### `baltar.pack(opts)`

Returns a stream representing the tar.gz packed version of `opts.path`.

- `opts`: {Object|string} Options or path string
- `opts.path`: Directory or file to pack
- `opts.ignoreFiles`: Extra ignore patterns

```js
import { createWriteStream } from 'node:fs';
import { pack } from 'baltar';

pack('directory/to/pack')
  .pipe(createWriteStream('output.tgz'));
```

## License

MIT

## Author

[Charlie Robbins](http://github.com/indexzero)
