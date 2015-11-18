'use strict';

var fs = require('fs'),
    path = require('path'),
    assume = require('assume'),
    async = require('async'),
    fixtures = require('./fixtures'),
    helpers = require('./helpers'),
    baltar = require('../');

var rmFixture = helpers.rmFixture,
    assumeError = helpers.assumeError;

describe('baltar.pull', function () {
  it('pull(null, function)', assumeError(null));
  it('pull({}, function)', assumeError({}));
  it('pull({path}, function)', assumeError({ path: './fixtures' }));
  it('pull({url}, function)', assumeError({ url: 'google.com' }));

  it('pull({ path, url }, function) [broadway]', function (done) {
    var context = fixtures.broadway();
    baltar.pull(context.opts, function (err, entries) {
      assume(err).equals(null);

      var paths = entries.map(function (e) { return e.path; });
      assume(paths).deep.equals(context.paths);

      //
      // Ensure the fixture was written to disk.
      //
      fs.readdir(path.join(fixtures.root, 'broadway-2.0.0'), function (err) {
        assume(err).equals(null);
        if (process.env.NO_CLEANUP) {
          return done();
        }

        rmFixture('broadway-2.0.0', done);
      });
    });
  });

  it('pull({ path, url, tarball }, function) [broadway]', function (done) {
    var tarball = path.join(fixtures.root, 'broadway-2.0.0.tgz'),
        context = fixtures.broadway(tarball);

    baltar.pull(context.opts, function (err, entries) {
      assume(err).equals(null);

      var paths = entries.map(function (e) { return e.path; });
      assume(paths).deep.equals(context.paths);

      //
      // Ensure the fixture was written to disk
      // AND that the tarball was written to disk
      //
      async.parallel({
        tarball: async.apply(fs.stat, tarball),
        files: async.apply(fs.readdir, path.join(fixtures.root, 'broadway-2.0.0'))
      }, function (err, res) {
        assume(err).equals(null);
        assume(res.tarball.isFile()).true();
        assume(res.tarball.size).equals(5315);
        assume(res.files).deep.equals(context.files);

        if (process.env.NO_CLEANUP) {
          return done();
        }

        async.forEach([
          'broadway-2.0.0', 'broadway-2.0.0.tgz'
        ], rmFixture, done);
      });
    });
  });
});
