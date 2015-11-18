'use strict';

var path = require('path');

/*
 * @property {string} root Root directory
 */
exports.root = __dirname;

exports.assume = function (tarball) {
  return {
    dir: 'assume-1.3.0',
    tarball: path.join(__dirname, 'assume-1.3.0.tgz'),
    opts: {
      url: 'https://codeload.github.com/bigpipe/assume/tar.gz/1.3.0',
      tarball: tarball,
      path: __dirname
    },
    files: [
    ],
    paths: [
      'assume-1.3.0/',
      'assume-1.3.0/.gitignore',
      'assume-1.3.0/.npmignore',
      'assume-1.3.0/.travis.yml',
      'assume-1.3.0/LICENSE',
      'assume-1.3.0/README.md',
      'assume-1.3.0/index.js',
      'assume-1.3.0/package.json',
      'assume-1.3.0/test/',
      'assume-1.3.0/test/phantom.html',
      'assume-1.3.0/test/test.js'
    ]
  };
};

/*
 * Returns options to download broadway@2.0.0
 */
exports.broadway = function (tarball) {
  return {
    dir: 'broadway-2.0.0',
    opts: {
      url: 'https://codeload.github.com/indexzero/broadway/tar.gz/v2.0.0',
      tarball: tarball,
      path: __dirname
    },
    files: [
      '.gitignore',
      '.travis.yml',
      'LICENSE',
      'README.md',
      'examples',
      'index.js',
      'package.json',
      'test'
    ],
    paths: [
      'broadway-2.0.0/',
      'broadway-2.0.0/.gitignore',
      'broadway-2.0.0/.travis.yml',
      'broadway-2.0.0/LICENSE',
      'broadway-2.0.0/README.md',
      'broadway-2.0.0/examples/',
      'broadway-2.0.0/examples/base.js',
      'broadway-2.0.0/examples/hookable.js',
      'broadway-2.0.0/examples/mixin.js',
      'broadway-2.0.0/index.js',
      'broadway-2.0.0/package.json',
      'broadway-2.0.0/test/',
      'broadway-2.0.0/test/.jshintrc',
      'broadway-2.0.0/test/mocha.opts',
      'broadway-2.0.0/test/unit.tests.js'
    ]
  }
};
