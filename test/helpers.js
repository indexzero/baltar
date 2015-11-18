'use strict';

var path = require('path'),
    assume = require('assume'),
    rimraf = require('rimraf'),
    retry = require('retry'),
    fixtures = require('./fixtures'),
    baltar = require('../');

/*
 * Helper function to assume an error with
 * the given arguments.
 */
exports.assumeError = function assumeError(opts, method) {
  method = method || 'pull';
  return function () {
    baltar[method](opts, function (err) {
      assume(err).is.an('error');
      assume(err.message).is.a('string');
      assume(err.message).contains('is required.');
    });
  };
};

/*
 * Helper function to assume an error with
 * the given arguments.
 */
exports.assumeThrows = function assumeThrows(opts, method) {
  method = method || 'unpack';
  return function () {
    assume(function () {
      baltar[method](opts)
    }).throws(/is required/);
  };
};

/*
 * Attempts to remove a test fixture directory
 * logging (and ignoring) any errors.
 */
exports.rmFixture = function rmFixture(dir, done) {
  var force = retry.operation({
    retries: 2,
    minTimeout: 10
  });

  force.attempt(function () {
    rimraf(path.join(fixtures.root, dir), function (err) {
      if (force.retry(err)) {
        return;
      } else if (err) {
        console.warn("Can't remove artifact: %s", err.message);
      }

      done();
    });
  });
};
