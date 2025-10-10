import { createWriteStream } from 'node:fs';
import { stat, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import assume from 'assume';
import * as fixtures from './fixtures/index.js';
import { assumeThrows } from './helpers.js';
import * as baltar from '../index.js';
import { rimraf } from 'rimraf';

describe('baltar.pack', function () {
  it('pack(null)', assumeThrows(null, 'pack'));
  it('pack({})', assumeThrows({}, 'pack'));

  it('pack(string) creates a gzip stream', function (done) {
    this.timeout(5000);
    const testDir = join(fixtures.root, 'test-pack-dir');
    const outputPath = join(fixtures.root, 'test-pack.tgz');

    // Clean up first
    rimraf(testDir).then(() => rimraf(outputPath)).then(() => {
      // Create a simple test directory
      mkdir(testDir, { recursive: true })
        .then(() => writeFile(join(testDir, 'test.txt'), 'hello world'))
        .then(() => {
          const packStream = baltar.pack(testDir);
          const writeStream = createWriteStream(outputPath);

          packStream.pipe(writeStream);

          writeStream.on('finish', async () => {
            try {
              const fileStat = await stat(outputPath);
              assume(fileStat.isFile()).true();
              assume(fileStat.size).gt(0);

              // Clean up
              if (!process.env.NO_CLEANUP) {
                await rimraf(testDir);
                await rimraf(outputPath);
              }
              done();
            } catch (err) {
              done(err);
            }
          });

          packStream.on('error', done);
          writeStream.on('error', done);
        })
        .catch(done);
    });
  });

  it('pack({ path, ignoreFiles }) adds custom ignore patterns', function (done) {
    this.timeout(5000);
    const testDir = join(fixtures.root, 'test-pack-custom-ignore');
    const outputPath = join(fixtures.root, 'test-pack-custom.tgz');

    rimraf(testDir).then(() => rimraf(outputPath)).then(() => {
      mkdir(testDir, { recursive: true })
        .then(() => Promise.all([
          writeFile(join(testDir, 'keep.txt'), 'keep'),
          writeFile(join(testDir, 'skip.log'), 'skip')
        ]))
        .then(() => {
          const packStream = baltar.pack({
            path: testDir,
            ignoreFiles: ['*.log']
          });

          const writeStream = createWriteStream(outputPath);
          packStream.pipe(writeStream);

          writeStream.on('finish', async () => {
            try {
              const fileStat = await stat(outputPath);
              assume(fileStat.isFile()).true();
              assume(fileStat.size).gt(0);

              if (!process.env.NO_CLEANUP) {
                await rimraf(testDir);
                await rimraf(outputPath);
              }
              done();
            } catch (err) {
              done(err);
            }
          });

          packStream.on('error', done);
          writeStream.on('error', done);
        })
        .catch(done);
    });
  });
});
