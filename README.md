# baltar
A few small utilities for working with tarballs and http. Because you need tarballs over HTTP like:

![](https://i.giphy.com/media/52HjuHsfVO69q/giphy-downsized.gif)

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

``` js
baltar.pull({
  url: 'https://example.com/path/to/any/file.tgz',
  path: 'location/to/untar/into',
}, function (err, entries) {
  //
  // Unpacked tarball now exists in
  // 'location/to/untar/into'. All
  // tar entries are returned to work with
  //
  var filenames = entries.map(function (entry) {
    return e.path;
  });

  console.log(filenames);
});
```

##### `baltar.push(opts)`

Pushes a tarball created from `opts.path` to `opts.url`
optionally accepting a `opts.method` and returns a stream
that represents the response.

- `opts.path`: Directory or file to pack
- `opts.ignoreFiles`: Extra ignore files to parse
- `opts.url`: {string} Location of the receiver.
- `opts.headers`: {Object} HTTP headers to send.
- `opts.method`: {string} HTTP Method to send.
- `returns`: {hyperquest} HTTP request stream to `opts.url`.

``` js
baltar.push({
  path: 'directory/or/file/to/pack',
  url: 'http://example.com/path/to/tarball/uploaded.tgz'
})
.on('error', function (err) {
  // Handle any HTTP errors (e.g. Internet is down, etc.)
  console.dir(err);
})
.on('finish', function () {
  console.log('HTTP request finished.')
});
```

The stream returned is an instance of [`hyperquest`](https://github.com/substack/hyperquest), so you can perform any additional stream operations on it.

### Pack and unpack tarballs locally

##### `baltar.unpack(opts)`

Returns a stream which will unpack and stream into the specified `opts.path`.

- `opts`: {Object|string} Options for unpacking tarball.
- `opts.path`: Directory or file to unpack to
- `returns`: {Stream} Gunzip and untar pipechain to `opts.path`.

``` js
fs.createReadStream('path/to/any/file.tgz')
  .pipe(baltar.unpack({ path: 'location/to/untar/into' }))
  .on('error', function (err) {
    // Handle any HTTP errors (e.g. bad tarball, etc.)
    console.dir(err);
  })
  .on('entry', function (e) { entries.push(e.path); })
  .on('done', function () {
    //
    // Unpacked tarball now exists in
    // 'location/to/untar/into'.
    //
  });
```

##### `baltar.pack(opts)`

Returns a stream representing the tar.gz packed version of `opts.dir`.

- `opts`: {Object|string} Options for packing tarball.
- `opts.path`: Directory or file to pack.
- `opts.ignoreFiles`: Extra ignore files to parse.

``` js
baltar.pack('just/a/path/also/works')
  .pipe(hyperquest.post('http://example.com/tarball/uploaded.tgz'))
```

##### LICENSE: MIT
##### AUTHOR: [Charlie Robbins](http://github.com/indexzero)
