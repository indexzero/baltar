'use strict';

var fs = require('fs'),
    zlib = require('zlib'),
    path = require('path'),
    diagnostics = require('diagnostics'),
    hyperquest = require('hyperquest'),
    once = require('once'),
    tar = require('tar');

var debug = diagnostics('baltar');

/**
 * Makes a request to `opts.url` and unpacks it to
 * `opts.path`.
 *
 * @param {Object} opts. Options for downloading & unpacking tarball.
 *   - opts.url {string} Location of the receiver.
 *   - opts.headers {Object} HTTP headers to send.
 *   - opts.method {string} HTTP Method to send.
 *   - opts.path: Directory or file to unpack to.
 */
exports.pull = function (opts, callback) {
  var entries = [],
      method = opts.method || 'GET',
      done;

  done = once(function (err) {
    if (err) { return callback(err); }
    callback(null, entries);
  });

  debug('Download %s %s', method, opts.url);
  debug('Extract to %s', opts.path);

  hyperquest(opts.url, {
    method: method,
    headers: opts.headers || {}
  })
  .on('error', done)
  .pipe(exports.unpack(opts.path))
  .on('entry', function (e) {
    debug('untar', e.path);
    entries.push(e);
  })
  .on('error', done)
  .on('finish', done);
};

/**
 * Returns a stream which will unpack and stream into
 * the specified `opts.path`
 *
 * @param {Object|string} opts. Options for unpacking tarball.
 *   - opts.path: Directory or file to unpack to
 *
 * @returns {Stream} Gunzip and untar pipechain to `opts.path`.
 */
exports.unpack = function (opts, callback) {
  if (typeof opts === 'string') {
    opts = { path: opts };
  }

  var extract = tar.Extract(opts);
  return zlib.Gunzip()
    .on('error', extract.emit.bind(extract, 'error'))
    .pipe(extract);
};

/**
 * Returns a stream representing the tar.gz packed
 * version of `opts.dir`.
 *
 * @param {Object} opts. Options for packing tarballs
 *   - opts.path: Directory or file to pack
 *   - opts.ignoreFiles: Extra ignore files to parse
 *
 * Adapted from `quill-tar` under MIT
 * https://github.com/opsmezzo/quill-tar
 *
 * @returns {Stream} Tar'ed and gzip'ed `opts.path`.
 */
exports.pack = function (opts) {
  var gzip = zlib.Gzip(),
      ignore;

  ignore = new Ignore({
    path: opts.path,
    ignoreFiles: opts.ignoreFiles
  });

  function logErr(msg) {
    return function (err) {
      //
      // Log and then re-emit the error on the gzip
      // stream that is returned by this function.
      //
      debug('%s: %s', msg, err);
      gzip.emit('error', err);
    }
  }

  return ignore
    .on('error', logErr('error reading ' + options.path))
    .pipe(tar.Pack({ noProprietary: true }))
    .on('error', logErr('tar creation error'))
    .pipe(gzip);
};

/**
 * Pushes a tarball created from `opts.path` to `opts.url`
 * optionally accepting a `opts.method` and returns a stream
 * that represents the response.
 *
 * @param {Object} opts. Options for pushing tarballs
 *   - opts.path: Directory or file to pack
 *   - opts.ignoreFiles: Extra ignore files to parse
 *   - opts.url {string} Location of the receiver.
 *   - opts.headers {Object} HTTP headers to send.
 *   - opts.method {string} HTTP Method to send.
 *
 * @returns {Stream} HTTP request stream to `opts.url`.
 */
exports.push = function (opts, callback) {
  var request = hyperquest(opts.url, {
    method: opts.method || 'POST',
    headers: opts.headers || {}
  });

  return exports.pack({
    path: opts.path,
    ignoreFiles: opts.ignoreFiles
  })
  .on('error', request.emit.bind(request, 'error'))
  .pipe(request);
};
