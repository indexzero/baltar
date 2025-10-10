import { createWriteStream, createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createGunzip, createGzip } from 'node:zlib';
import { join } from 'node:path';
import diagnostics from 'diagnostics';
import { Agent, RetryAgent, request } from 'undici';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as tar from 'tar';
import ignore from 'ignore';
import crypto from 'node:crypto';

const debug = diagnostics('baltar');

// Base agent for connection pooling
const baseAgent = new Agent({
  connections: 10,
  keepAliveTimeout: 10000,
  keepAliveTimeoutThreshold: 1000
});

// Shared undici agent with automatic retry
const agent = new RetryAgent(baseAgent, {
  maxRetries: 3,
  minTimeout: 500,
  maxTimeout: 5000,
  timeoutFactor: 2,
  retryAfter: true,
  // Retry on network errors and 5xx status codes
  retry: (err, { state, opts }, cb) => {
    if (err?.code === 'UND_ERR_SOCKET' || err?.code === 'UND_ERR_CONNECT_TIMEOUT') {
      return cb(null, true); // Retry network errors
    }
    if (state?.statusCode >= 500) {
      return cb(null, true); // Retry server errors
    }
    return cb(null, false); // Don't retry other errors
  }
});

/**
 * TeeStream - Transform stream that writes to a destination while passing data through
 * Properly handles backpressure to avoid memory issues
 */
class TeeStream extends Transform {
  constructor(destination) {
    super();
    this.destination = destination;
    this.destinationError = null;

    destination.on('error', (err) => {
      this.destinationError = err;
    });
  }

  _transform(chunk, encoding, callback) {
    if (this.destinationError) {
      return callback(this.destinationError);
    }

    if (!this.destination.write(chunk)) {
      this.destination.once('drain', () => callback(null, chunk));
    } else {
      callback(null, chunk);
    }
  }

  _flush(callback) {
    this.destination.end();
    callback();
  }
}


/**
 * Verify file integrity using SHA-512 (or other algorithm)
 * @param {string} filepath - Path to file to verify
 * @param {string} expectedIntegrity - Integrity string in format "algorithm-hash"
 */
async function verifyIntegrity(filepath, expectedIntegrity) {
  const [algorithm, expectedHash] = expectedIntegrity.split('-');

  if (!algorithm || !expectedHash) {
    throw new Error(`Invalid integrity format: ${expectedIntegrity}`);
  }

  const hash = crypto.createHash(algorithm);

  await pipeline(
    createReadStream(filepath),
    async function* (source) {
      for await (const chunk of source) {
        hash.update(chunk);
        yield chunk;
      }
    }
  );

  const actualHash = hash.digest('base64');

  if (actualHash !== expectedHash) {
    throw new Error(
      `Integrity check failed for ${filepath}\n` +
      `Expected: ${expectedHash}\n` +
      `Actual:   ${actualHash}`
    );
  }
}

/**
 * Load ignore rules from .npmignore or .gitignore
 * @param {string} basePath - Base directory to load ignore files from
 * @returns {Promise<Object>} ignore object with filter method
 */
async function loadIgnoreRules(basePath) {
  const ig = ignore();

  // Try .npmignore first, fall back to .gitignore
  try {
    const npmignore = await readFile(join(basePath, '.npmignore'), 'utf8');
    ig.add(npmignore);
  } catch {
    try {
      const gitignore = await readFile(join(basePath, '.gitignore'), 'utf8');
      ig.add(gitignore);
    } catch {
      // No ignore files, that's fine
    }
  }

  // Always ignore these
  ig.add(['.git', 'node_modules', '.DS_Store']);

  return ig;
}

/**
 * Makes a request to `opts.url` and unpacks it to `opts.path`.
 *
 * @param {Object} opts - Options for downloading & unpacking tarball.
 *   - opts.url: {string} Location of the tarball.
 *   - opts.headers: {Object} HTTP headers to send.
 *   - opts.method: {string} HTTP Method to send.
 *   - opts.path: {string} Directory to unpack to.
 *   - opts.tarball: {string} **Optional** Path to save tarball to.
 *   - opts.integrity: {string} **Optional** Integrity hash (e.g., "sha512-base64hash")
 * @param {Object} callbackOpts - Optional callback options
 *   - callbackOpts.signal: {AbortSignal} **Optional** AbortSignal for cancellation
 * @returns {Promise<Array>} Array of extracted entries
 */
export async function pull(opts, callbackOpts = {}) {
  if (!opts?.path || !opts?.url) {
    throw new Error('opts = { path, url } is required');
  }

  const { signal } = callbackOpts;
  const method = opts.method || 'GET';
  const entries = [];

  debug('Download %s %s', method, opts.url);
  debug('Extract to %s', opts.path);

  // Fetch with automatic retry via RetryAgent
  const response = await request(opts.url, {
    method,
    headers: opts.headers || {},
    signal,
    dispatcher: agent
  });

  // Check for error status codes
  if (response.statusCode >= 400) {
    response.body.destroy();
    throw new Error(`HTTP ${response.statusCode}: ${response.statusMessage || 'Request failed'}`);
  }

  // Set up extraction using tar.extract (modern tar API)
  const extract = tar.extract({ cwd: opts.path });
  const gunzip = createGunzip();

  extract.on('entry', (entry) => {
    debug('untar', entry.path);
    entries.push(entry);
  });

  // Handle tarball save + extraction
  if (opts.tarball) {
    const writeStream = createWriteStream(opts.tarball);
    const tee = new TeeStream(writeStream);

    await pipeline(
      response.body,
      tee,
      gunzip,
      extract
    );
  } else {
    await pipeline(
      response.body,
      gunzip,
      extract
    );
  }

  // Optional integrity check
  if (opts.integrity && opts.tarball) {
    await verifyIntegrity(opts.tarball, opts.integrity);
  }

  return entries;
}

/**
 * Returns a stream which will unpack and stream into the specified `opts.path`
 *
 * @param {Object|string} opts - Options for unpacking tarball.
 *   - opts.path: Directory to unpack to
 * @returns {Stream} Gunzip and untar pipechain to `opts.path`.
 */
export function unpack(opts) {
  if (typeof opts === 'string') {
    opts = { path: opts };
  } else if (!opts || !opts.path) {
    throw new Error('opts = string, { path } is required.');
  }

  const extract = tar.extract({ cwd: opts.path });
  const gunzip = createGunzip();

  // Forward events from extract to gunzip for backward compatibility
  extract.on('error', (err) => gunzip.emit('error', err));
  extract.on('entry', (entry) => gunzip.emit('entry', entry));
  extract.on('finish', () => gunzip.emit('done'));

  // Pipe gunzip to extract
  gunzip.pipe(extract);

  return gunzip;
}

/**
 * Returns a stream representing the tar.gz packed version of `opts.path`.
 *
 * @param {string|Object} opts - Options for packing tarballs
 *   - opts.path: Directory or file to pack
 *   - opts.ignoreFiles: Extra ignore files to parse (array of patterns)
 * @returns {Stream} Tar'ed and gzip'ed `opts.path`.
 */
export function pack(opts) {
  if (typeof opts === 'string') {
    opts = { path: opts };
  } else if (!opts || !opts.path) {
    throw new Error('opts = string, { path } is required.');
  }

  const gzip = createGzip();

  // Load ignore rules asynchronously and create tar stream
  (async () => {
    try {
      const ig = await loadIgnoreRules(opts.path);

      // Add custom ignore patterns if provided
      if (opts.ignoreFiles && Array.isArray(opts.ignoreFiles)) {
        ig.add(opts.ignoreFiles);
      }

      // Create tar stream with filter function
      const tarStream = tar.create(
        {
          gzip: false, // We handle gzip separately
          cwd: opts.path,
          filter: (path, stat) => {
            // Remove leading ./ if present
            const relativePath = path.replace(/^\.\//, '');
            // Don't filter the root directory itself
            if (relativePath === '.' || relativePath === '') {
              return true;
            }
            return !ig.ignores(relativePath);
          }
        },
        ['.'] // Pack everything from current directory
      );

      tarStream.on('error', (err) => {
        debug('tar creation error: %s', err);
        gzip.emit('error', err);
      });

      tarStream.pipe(gzip);
    } catch (err) {
      debug('error reading %s: %s', opts.path, err);
      gzip.emit('error', err);
    }
  })();

  return gzip;
}

/**
 * Pushes a tarball created from `opts.path` to `opts.url`
 *
 * @param {Object} opts - Options for pushing tarballs
 *   - opts.path: Directory or file to pack
 *   - opts.ignoreFiles: Extra ignore files to parse
 *   - opts.url: {string} Location of the receiver.
 *   - opts.headers: {Object} HTTP headers to send.
 *   - opts.method: {string} HTTP Method to send (default: POST).
 *   - opts.signal: {AbortSignal} **Optional** AbortSignal for cancellation
 * @returns {Stream} HTTP request stream to `opts.url`.
 */
export function push(opts) {
  const method = opts.method || 'POST';

  debug('Upload %s %s', method, opts.url);

  // Create the pack stream
  const packStream = pack({
    path: opts.path,
    ignoreFiles: opts.ignoreFiles
  });

  // Create undici request using stream() for streaming request body
  const requestPromise = request(opts.url, {
    method,
    headers: opts.headers || {},
    body: packStream,
    dispatcher: agent,
    signal: opts.signal
  });

  // Create a passthrough stream to return to the user
  const responseStream = new Transform({
    transform(chunk, encoding, callback) {
      callback(null, chunk);
    }
  });

  // Handle the response
  requestPromise.then((response) => {
    if (response.statusCode >= 400) {
      const err = new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`);
      responseStream.emit('error', err);
      response.body.destroy();
      return;
    }

    // Pipe response body to our stream
    response.body.pipe(responseStream);
  }).catch((err) => {
    responseStream.emit('error', err);
  });

  // Forward pack stream errors
  packStream.on('error', (err) => {
    responseStream.emit('error', err);
  });

  return responseStream;
}
