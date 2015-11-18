# baltar
A few small utilities for working with tarballs and http. Because you need tarballs over HTTP like:

![](https://media.giphy.com/media/52HjuHsfVO69q/giphy.gif)

## Usage

### Fetch & send tarballs over the network

##### `baltar.pull(opts, callback)`

Makes a request to `opts.url` and unpacks it to `opts.path`. `baltar.pull` is the only method which accepts a callback so that it pass back all of the entries from the `tar.Extract` stream. The end of pipechain is also returned for future stream operations (if desired).

- `opts.url`: {string} Location of the receiver.
- `opts.headers`: {Object} HTTP headers to send.
- `opts.method`: {string} HTTP Method to send.
- `opts.path`: {string} Directory or file to unpack to.
- `opts.tarball`: {string} **Optional** Path to save tarball to.
- `returns`: {tar.Extract} Extraction stream for the pulled tarball.

##### `baltar.push(opts)`

- `opts.path`: Directory or file to pack
- `opts.ignoreFiles`: Extra ignore files to parse
- `opts.url`: {string} Location of the receiver.
- `opts.headers`: {Object} HTTP headers to send.
- `opts.method`: {string} HTTP Method to send.
- `returns`: {Stream} HTTP request stream to `opts.url`.

### Pack and unpack tarballs locally

##### `baltar.unpack(opts)`

- `opts`: {Object|string} Options for unpacking tarball.
- `opts.path`: Directory or file to unpack to
- `returns`: {Stream} Gunzip and untar pipechain to `opts.path`.

##### `baltar.pack(opts)`

- `opts.path`: Directory or file to pack.
- `opts.ignoreFiles`: Extra ignore files to parse.

##### LICENSE: MIT
##### AUTHOR: [Charlie Robbins](http://github.com/indexzero)
