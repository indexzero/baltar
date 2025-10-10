import { createWriteStream, createReadStream, readFileSync, existsSync, mkdirSync } from 'node:fs';
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

// Production-grade agent configuration
const agentOptions = {
  bodyTimeout: 600_000,
  headersTimeout: 600_000,
  keepAliveMaxTimeout: 1_200_000,
  keepAliveTimeout: 600_000,
  keepAliveTimeoutThreshold: 30_000,
  connect: {
    timeout: 600_000,
    keepAlive: true,
    keepAliveInitialDelay: 30_000,
    sessionTimeout: 600,
  },
  connections: 128,
  pipelining: 10
};

// Base agent for connection pooling
const baseAgent = new Agent(agentOptions);

// Shared undici agent with automatic retry
const agent = new RetryAgent(baseAgent, {
  maxRetries: 3,
  timeoutFactor: 2,
  minTimeout: 0,
  maxTimeout: 30_000,
  retryAfter: true,
  errorCodes: [
    'ECONNREFUSED',
    'ECONNRESET',
    'EHOSTDOWN',
    'ENETDOWN',
    'ENETUNREACH',
    'ENOTFOUND',
    'EPIPE',
    'UND_ERR_SOCKET',
  ],
  // Retry on network errors and 5xx status codes
  retry: (err, { state }, cb) => {
    // Retry on specific error codes (already handled by errorCodes)
    if (err?.code && agent.errorCodes?.includes(err.code)) {
      return cb(null, true);
    }
    // Retry on 5xx server errors
    if (state?.statusCode >= 500) {
      return cb(null, true);
    }
    return cb(null, false);
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
 * Load ignore rules from .npmignore or .gitignore synchronously
 * @param {string} basePath - Base directory to load ignore files from
 * @returns {Object} ignore object with filter method
 */
function loadIgnoreRulesSync(basePath) {
  const ig = ignore();
  const npmIgnorePath = join(basePath, '.npmignore');
  const gitIgnorePath = join(basePath, '.gitignore');

  // Try .npmignore first, fall back to .gitignore
  if (existsSync(npmIgnorePath)) {
    ig.add(readFileSync(npmIgnorePath, 'utf8'));
  } else if (existsSync(gitIgnorePath)) {
    ig.add(readFileSync(gitIgnorePath, 'utf8'));
  }

  // Always ignore these
  ig.add(['.git', 'node_modules', '.DS_Store']);

  return ig;
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
 *   - opts.strip: {number} **Optional** Number of leading directory components to strip (default: 0)
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

  // Ensure the target directory exists
  mkdirSync(opts.path, { recursive: true });

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

  // Set up extraction using tar.x() (shorthand for extract)
  const extract = tar.x({
    cwd: opts.path,
    strip: opts.strip ?? 0  // Default to 0 if not specified
  });
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

  try {
    // Load ignore rules synchronously
    const ig = loadIgnoreRulesSync(opts.path);

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
    // Emit error on next tick to allow stream to be returned first
    process.nextTick(() => {
      debug('error reading %s: %s', opts.path, err);
      gzip.emit('error', err);
    });
  }

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
