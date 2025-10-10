import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import assume from 'assume';
import { createServer } from 'node:http';
import * as fixtures from './fixtures/index.js';
import * as baltar from '../index.js';
import { rimraf } from 'rimraf';

describe('baltar.push', function () {
  let server;
  let serverUrl;

  beforeEach(function (done) {
    server = createServer();
    server.listen(0, () => {
      const port = server.address().port;
      serverUrl = `http://localhost:${port}`;
      done();
    });
  });

  afterEach(function (done) {
    if (server) {
      server.close(done);
    } else {
      done();
    }
  });

  it('push({ path, url }) uploads tarball', function (done) {
    this.timeout(5000);
    const testDir = join(fixtures.root, 'test-push-dir');

    rimraf(testDir).then(() => {
      mkdir(testDir, { recursive: true })
        .then(() => writeFile(join(testDir, 'upload.txt'), 'test data'))
        .then(() => {
          let receivedData = false;

          server.on('request', (req, res) => {
            assume(req.method).equals('POST');
            assume(req.headers['content-type']).is.falsy(); // No content-type set by default

            let chunks = [];
            req.on('data', (chunk) => {
              chunks.push(chunk);
              receivedData = true;
            });

            req.on('end', () => {
              res.writeHead(200);
              res.end(JSON.stringify({ ok: true }));
            });
          });

          const pushStream = baltar.push({
            path: testDir,
            url: serverUrl
          });

          let responseData = '';
          pushStream.on('data', (chunk) => {
            responseData += chunk.toString();
          });

          pushStream.on('end', async () => {
            try {
              assume(receivedData).true();
              assume(responseData).contains('ok');

              if (!process.env.NO_CLEANUP) {
                await rimraf(testDir);
              }
              done();
            } catch (err) {
              done(err);
            }
          });

          pushStream.on('error', done);
        })
        .catch(done);
    });
  });

  it('push({ path, url, method }) uses custom HTTP method', function (done) {
    this.timeout(5000);
    const testDir = join(fixtures.root, 'test-push-method');

    rimraf(testDir).then(() => {
      mkdir(testDir, { recursive: true })
        .then(() => writeFile(join(testDir, 'data.txt'), 'content'))
        .then(() => {
          server.on('request', (req, res) => {
            assume(req.method).equals('PUT');
            req.on('data', () => {});
            req.on('end', () => {
              res.writeHead(200);
              res.end('OK');
            });
          });

          const pushStream = baltar.push({
            path: testDir,
            url: serverUrl,
            method: 'PUT'
          });

          pushStream.on('data', () => {});
          pushStream.on('end', async () => {
            if (!process.env.NO_CLEANUP) {
              await rimraf(testDir);
            }
            done();
          });

          pushStream.on('error', done);
        })
        .catch(done);
    });
  });

  it('push handles HTTP errors', function (done) {
    this.timeout(5000);
    const testDir = join(fixtures.root, 'test-push-error');

    rimraf(testDir).then(() => {
      mkdir(testDir, { recursive: true })
        .then(() => writeFile(join(testDir, 'fail.txt'), 'data'))
        .then(() => {
          server.on('request', (req, res) => {
            req.on('data', () => {});
            req.on('end', () => {
              res.writeHead(500, 'Internal Server Error');
              res.end();
            });
          });

          const pushStream = baltar.push({
            path: testDir,
            url: serverUrl
          });

          pushStream.on('error', async (err) => {
            try {
              assume(err).is.an('error');
              // The error message contains HTTP status code and message
              assume(err.message).matches(/500|Internal Server Error|Request failed/);

              if (!process.env.NO_CLEANUP) {
                await rimraf(testDir);
              }
              done();
            } catch (e) {
              done(e);
            }
          });

          pushStream.on('data', () => {});
        })
        .catch(done);
    });
  });

  it('push({ path, url, headers }) sends custom headers', function (done) {
    this.timeout(5000);
    const testDir = join(fixtures.root, 'test-push-headers');

    rimraf(testDir).then(() => {
      mkdir(testDir, { recursive: true })
        .then(() => writeFile(join(testDir, 'header-test.txt'), 'data'))
        .then(() => {
          server.on('request', (req, res) => {
            assume(req.headers['x-custom-header']).equals('test-value');
            req.on('data', () => {});
            req.on('end', () => {
              res.writeHead(200);
              res.end();
            });
          });

          const pushStream = baltar.push({
            path: testDir,
            url: serverUrl,
            headers: {
              'x-custom-header': 'test-value'
            }
          });

          pushStream.on('data', () => {});
          pushStream.on('end', async () => {
            if (!process.env.NO_CLEANUP) {
              await rimraf(testDir);
            }
            done();
          });

          pushStream.on('error', done);
        })
        .catch(done);
    });
  });
});
