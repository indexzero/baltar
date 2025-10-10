/// <reference types="node" />

import { Readable, Writable, Transform } from 'stream';

/**
 * Options for pulling (downloading and extracting) a tarball
 */
export interface PullOptions {
  /** URL of the tarball to download */
  url: string;
  /** Directory path where the tarball should be extracted */
  path: string;
  /** HTTP method to use (default: 'GET') */
  method?: string;
  /** HTTP headers to send with the request */
  headers?: Record<string, string>;
  /** Optional path to save the downloaded tarball file */
  tarball?: string;
  /** Optional integrity hash in format "algorithm-hash" (e.g., "sha512-base64hash") */
  integrity?: string;
}

/**
 * Options for callback-based operations (e.g., cancellation)
 */
export interface PullCallbackOptions {
  /** AbortSignal for canceling the operation */
  signal?: AbortSignal;
}

/**
 * Options for unpacking a tarball stream
 */
export interface UnpackOptions {
  /** Directory path where the tarball should be extracted */
  path: string;
}

/**
 * Options for packing a directory into a tarball
 */
export interface PackOptions {
  /** Directory path to pack into a tarball */
  path: string;
  /** Additional ignore patterns to exclude from the tarball */
  ignoreFiles?: string[];
}

/**
 * Options for pushing (packing and uploading) a tarball
 */
export interface PushOptions extends PackOptions {
  /** URL to upload the tarball to */
  url: string;
  /** HTTP method to use (default: 'POST') */
  method?: string;
  /** HTTP headers to send with the request */
  headers?: Record<string, string>;
  /** AbortSignal for canceling the operation */
  signal?: AbortSignal;
}

/**
 * Entry object returned by tar extraction
 */
export interface TarEntry {
  /** Path of the extracted file relative to extraction directory */
  path: string;
  /** Additional tar entry properties */
  [key: string]: any;
}

/**
 * Downloads a tarball from a URL and extracts it to a local directory.
 * Optionally saves the tarball file and verifies integrity.
 *
 * @param opts - Options for downloading and extracting the tarball
 * @param callbackOpts - Optional callback options (e.g., abort signal)
 * @returns Promise that resolves to an array of extracted entries
 *
 * @example
 * ```typescript
 * const entries = await pull({
 *   url: 'https://registry.npmjs.org/express/-/express-4.18.2.tgz',
 *   path: './output',
 *   tarball: './output/express.tgz',
 *   integrity: 'sha512-5/PsL6iGPdfQ/lKM1UuielYgv3BUoJfz1aUwU9vHZ+J7gyvwdQXFEBIEIaxeGf0GIcreATNyBExtalisDbuMqQ=='
 * });
 * ```
 *
 * @example With AbortController
 * ```typescript
 * const controller = new AbortController();
 * setTimeout(() => controller.abort(), 5000);
 *
 * await pull(
 *   { url: 'https://example.com/file.tgz', path: './output' },
 *   { signal: controller.signal }
 * );
 * ```
 */
export function pull(opts: PullOptions, callbackOpts?: PullCallbackOptions): Promise<TarEntry[]>;

/**
 * Returns a writable stream that unpacks a gzipped tarball to the specified directory.
 * The returned stream accepts tar.gz data and extracts it on the fly.
 *
 * @param opts - Directory path (string) or options object with path
 * @returns Writable stream for unpacking tarball data
 *
 * @example
 * ```typescript
 * const unpackStream = unpack('./output');
 * fs.createReadStream('archive.tar.gz').pipe(unpackStream);
 *
 * unpackStream.on('entry', (entry) => {
 *   console.log('Extracted:', entry.path);
 * });
 *
 * unpackStream.on('done', () => {
 *   console.log('Extraction complete');
 * });
 * ```
 */
export function unpack(opts: string | UnpackOptions): Writable;

/**
 * Returns a readable stream that packs a directory into a gzipped tarball.
 * Respects .npmignore and .gitignore files in the directory.
 *
 * @param opts - Directory path (string) or options object with path and ignore patterns
 * @returns Readable stream of the gzipped tarball data
 *
 * @example
 * ```typescript
 * const packStream = pack('./my-package');
 * packStream.pipe(fs.createWriteStream('output.tar.gz'));
 * ```
 *
 * @example With custom ignore patterns
 * ```typescript
 * const packStream = pack({
 *   path: './my-package',
 *   ignoreFiles: ['*.log', 'test/**']
 * });
 * ```
 */
export function pack(opts: string | PackOptions): Readable;

/**
 * Packs a directory into a gzipped tarball and uploads it to a URL.
 * Returns a stream that represents the HTTP response.
 *
 * @param opts - Options for packing and uploading
 * @returns Stream representing the HTTP response
 *
 * @example
 * ```typescript
 * const responseStream = push({
 *   url: 'https://example.com/upload',
 *   path: './my-package',
 *   method: 'PUT',
 *   headers: { 'Authorization': 'Bearer token' }
 * });
 *
 * responseStream.on('error', (err) => {
 *   console.error('Upload failed:', err);
 * });
 *
 * responseStream.on('finish', () => {
 *   console.log('Upload complete');
 * });
 * ```
 *
 * @example With AbortController
 * ```typescript
 * const controller = new AbortController();
 * const responseStream = push({
 *   url: 'https://example.com/upload',
 *   path: './my-package',
 *   signal: controller.signal
 * });
 *
 * // Cancel upload after 10 seconds
 * setTimeout(() => controller.abort(), 10000);
 * ```
 */
export function push(opts: PushOptions): Transform;
