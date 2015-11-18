'use strict';

var fs = require('fs'),
    zlib = require('zlib'),
    path = require('path'),
    diagnostics = require('diagnostics'),
    hyperquest = require('hyperquest'),
    Ignore = require('fstream-ignore'),
    once = require('once'),
    tar = require('tar');

var debug = diagnostics('baltar');

/**
 * Makes a request to `opts.url` and unpacks it to
 * `opts.path`.
 *
 * @param {Object} opts. Options for downloading & unpacking tarball.
 *   - opts.url: {string} Location of the receiver.
 *   - opts.headers: {Object} HTTP headers to send.
 *   - opts.method: {string} HTTP Method to send.
 *   - opts.path: {string} Directory or file to unpack to.
 *   - opts.tarball: {string} **Optional** Path to save tarball to.
 * @returns {tar.Extract} Extraction stream for the pulled tarball.
 */
exports.pull = function (opts, callback) {
  if (!opts || !opts.path || !opts.url) {
    return callback(new Error('opts = { path, url } is required.'));
  }

  var method = opts.method || 'GET',
      entries = [],
      done;

  done = once(function (err) {
    if (err) { return callback(err); }
    callback(null, entries);
  });

  debug('Download %s %s', method, opts.url);
  debug('Extract to %s', opts.path);

  var request = hyperquest(opts.url, {
    method: method,
    headers: opts.headers || {}
  }).on('error', done);

  if (opts.tarball) {
    request.pipe(fs.createWriteStream(opts.tarball))
      .on('error', done);
  }

  return request
    .pipe(zlib.Gunzip())
    .on('error', done)
    .pipe(tar.Extract({ path: opts.path }))
    .on('error', done)
    .on('entry', function (e) {
      debug('untar', e.path);
      entries.push(e);
    })
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
exports.unpack = function (opts) {
  if (typeof opts === 'string') {
    opts = { path: opts };
  }
  else if (!opts || !opts.path) {
    throw new Error('opts = string, { path } is required.');
  }

  var extract = tar.Extract(opts),
      gunzip = zlib.Gunzip();

  //
  // Remark: purposefully suppressing the other events
  // that are emitted by tar for ease-of-use. Would be
  // re-added if there is a significant enough reason.
  //
  gunzip
    .pipe(extract)
    .on('error', gunzip.emit.bind(gunzip, 'error'))
    .on('entry', gunzip.emit.bind(gunzip, 'entry'))
    //
    // TODO: There has to be a way to do this with a
    // through stream, but I can't think of it right now.
    //
    .on('finish', gunzip.emit.bind(gunzip, 'done'));

  return gunzip;
};

/**
 * Returns a stream representing the tar.gz packed
 * version of `opts.dir`.
 *
 * @param {string|Object} opts. Options for packing tarballs
 *   - opts.path: Directory or file to pack
 *   - opts.ignoreFiles: Extra ignore files to parse
 *
 * Adapted from `quill-tar` under MIT
 * https://github.com/opsmezzo/quill-tar
 *
 * @returns {Stream} Tar'ed and gzip'ed `opts.path`.
 */
exports.pack = function (opts) {
  if (typeof opts === 'string') {
    opts = { path: opts };
  }
  else if (!opts || !opts.path) {
    throw new Error('opts = string, { path } is required.');
  }

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
    };
  }

  return ignore
    .on('error', logErr('error reading ' + opts.path))
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
