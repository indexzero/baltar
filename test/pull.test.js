import { readdir, stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createReadStream } from 'node:fs';
import assume from 'assume';
import async from 'async';
import crypto from 'node:crypto';
import { createServer } from 'node:http';
import { createGzip } from 'node:zlib';
import * as tar from 'tar';
import { pipeline } from 'node:stream/promises';
import * as fixtures from './fixtures/index.js';
import { rmFixture, assumeError } from './helpers.js';
import * as baltar from '../index.js';

describe('baltar.pull', function () {
  it('pull(null, function)', assumeError(null));
  it('pull({}, function)', assumeError({}));
  it('pull({path}, function)', assumeError({ path: './fixtures' }));
  it('pull({url}, function)', assumeError({ url: 'google.com' }));

  it('pull({ path, url }, function) [broadway]', async function () {
    this.timeout(10000);
    const context = fixtures.broadway();
    const entries = await baltar.pull(context.opts);

    const paths = entries.map(function (e) { return e.path; });
    assume(paths).deep.equals(context.paths);

    //
    // Ensure the fixture was written to disk.
    //
    await readdir(join(fixtures.root, 'broadway-2.0.0'));

    if (!process.env.NO_CLEANUP) {
      await new Promise((resolve) => rmFixture('broadway-2.0.0', resolve));
    }
  });

  it('pull({ path, url, tarball }, function) [broadway]', async function () {
    this.timeout(10000);
    const tarball = join(fixtures.root, 'broadway-2.0.0.tgz');
    const context = fixtures.broadway(tarball);

    const entries = await baltar.pull(context.opts);

    const paths = entries.map(function (e) { return e.path; });
    assume(paths).deep.equals(context.paths);

    //
    // Ensure the fixture was written to disk
    // AND that the tarball was written to disk
    //
    const [tarballStat, files] = await Promise.all([
      stat(tarball),
      readdir(join(fixtures.root, 'broadway-2.0.0'))
    ]);

    assume(tarballStat.isFile()).true();
    assume(tarballStat.size).equals(5315);
    assume(files).deep.equals(context.files);

    if (!process.env.NO_CLEANUP) {
      await new Promise((resolve, reject) => {
        async.forEach([
          'broadway-2.0.0', 'broadway-2.0.0.tgz'
        ], rmFixture, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  });

  it('pull({ path, url, tarball, integrity }) verifies integrity', async function () {
    this.timeout(10000);
    const tarball = join(fixtures.root, 'broadway-integrity.tgz');
    const context = fixtures.broadway(tarball);

    // First download to get the actual file
    await baltar.pull(context.opts);

    // Calculate the correct hash
    const hash = crypto.createHash('sha512');
    await pipeline(
      createReadStream(tarball),
      async function* (source) {
        for await (const chunk of source) {
          hash.update(chunk);
          yield chunk;
        }
      }
    );
    const correctHash = hash.digest('base64');

    // Clean up for the next test
    if (!process.env.NO_CLEANUP) {
      await new Promise((resolve) => rmFixture('broadway-2.0.0', resolve));
    }

    // Now test with correct integrity
    const optsWithIntegrity = {
      ...context.opts,
      integrity: `sha512-${correctHash}`
    };

    const entries = await baltar.pull(optsWithIntegrity);
    assume(entries.length).gt(0);

    // Clean up
    if (!process.env.NO_CLEANUP) {
      await new Promise((resolve, reject) => {
        async.forEach([
          'broadway-2.0.0', 'broadway-integrity.tgz'
        ], rmFixture, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  });

  it('pull({ path, url, tarball, integrity }) rejects bad integrity', async function () {
    this.timeout(10000);
    const tarball = join(fixtures.root, 'broadway-bad-integrity.tgz');
    const context = fixtures.broadway(tarball);

    // Use an obviously wrong hash
    const optsWithBadIntegrity = {
      ...context.opts,
      integrity: 'sha512-badHashValueThatWillNeverMatch1234567890'
    };

    try {
      await baltar.pull(optsWithBadIntegrity);
      throw new Error('Expected integrity error but none was thrown');
    } catch (err) {
      assume(err).is.an('error');
      assume(err.message).contains('Integrity check failed');
    }

    // Clean up
    if (!process.env.NO_CLEANUP) {
      await new Promise((resolve, reject) => {
        async.forEach([
          'broadway-2.0.0', 'broadway-bad-integrity.tgz'
        ], rmFixture, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  });
});
