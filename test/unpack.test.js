'use strict';

var fs = require('fs'),
    path = require('path'),
    assume = require('assume'),
    async = require('async'),
    fixtures = require('./fixtures'),
    helpers = require('./helpers'),
    baltar = require('../');

var rmFixture = helpers.rmFixture,
    assumeThrows = helpers.assumeThrows;

describe('baltar.unpack', function () {

  it('unpack(null, function)', assumeThrows(null));
  it('unpack({}, function)', assumeThrows({}));

  it('unpack({ path }, function)', function (done) {
    var context = fixtures.assume(),
        entries = [];

    function finish(err) {
      assume(err).equals(undefined);
      assume(entries).deep.equals(context.paths);

      if (process.env.NO_CLEANUP) {
        return done();
      }

      rmFixture('assume-1.3.0', done);
    }

    fs.createReadStream(context.tarball)
      .pipe(baltar.unpack({ path: fixtures.root }))
      .on('entry', function (e) { entries.push(e.path); })
      .on('done', finish);
  });
});
