import { join } from 'node:path';
import assume from 'assume';
import { rimraf } from 'rimraf';
import retry from 'retry';
import * as fixtures from './fixtures/index.js';
import * as baltar from '../index.js';

/*
 * Helper function to assume an error with
 * the given arguments.
 */
export function assumeError(opts, method) {
  method = method || 'pull';
  return async function () {
    try {
      await baltar[method](opts);
      throw new Error('Expected an error but none was thrown');
    } catch (err) {
      assume(err).is.an('error');
      assume(err.message).is.a('string');
      assume(err.message).contains('is required');
    }
  };
}

/*
 * Helper function to assume an error with
 * the given arguments.
 */
export function assumeThrows(opts, method) {
  method = method || 'unpack';
  return function () {
    assume(function () {
      baltar[method](opts)
    }).throws(/is required/);
  };
}

/*
 * Attempts to remove a test fixture directory
 * logging (and ignoring) any errors.
 */
export function rmFixture(dir, done) {
  const force = retry.operation({
    retries: 2,
    minTimeout: 10
  });

  force.attempt(async function () {
    try {
      await rimraf(join(fixtures.root, dir));
      done();
    } catch (err) {
      if (force.retry(err)) {
        return;
      }
      console.warn("Can't remove artifact: %s", err.message);
      done();
    }
  });
}
