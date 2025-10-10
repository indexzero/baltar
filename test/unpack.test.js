import { createReadStream } from 'node:fs';
import assume from 'assume';
import * as fixtures from './fixtures/index.js';
import { rmFixture, assumeThrows } from './helpers.js';
import * as baltar from '../index.js';

describe('baltar.unpack', function () {

  it('unpack(null, function)', assumeThrows(null));
  it('unpack({}, function)', assumeThrows({}));

  it('unpack({ path }, function)', function (done) {
    const context = fixtures.assume();
    const entries = [];

    function finish(err) {
      assume(err).equals(undefined);
      assume(entries).deep.equals(context.paths);

      if (process.env.NO_CLEANUP) {
        return done();
      }

      rmFixture('assume-1.3.0', done);
    }

    createReadStream(context.tarball)
      .pipe(baltar.unpack({ path: fixtures.root }))
      .on('entry', function (e) { entries.push(e.path); })
      .on('done', finish);
  });

  it('unpack(string) accepts string path', function (done) {
    const context = fixtures.assume();
    const entries = [];

    function finish(err) {
      assume(err).equals(undefined);
      assume(entries).deep.equals(context.paths);

      if (process.env.NO_CLEANUP) {
        return done();
      }

      rmFixture('assume-1.3.0', done);
    }

    createReadStream(context.tarball)
      .pipe(baltar.unpack(fixtures.root))
      .on('entry', function (e) { entries.push(e.path); })
      .on('done', finish);
  });
});
