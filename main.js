'use strict';

const _ = require('lodash');
const crypto = require('crypto');
const path = require('path');
const sriToolbox = require('sri-toolbox');
const through = require('through');
const PluginError = require('plugin-error');
const Vinyl = require('vinyl');

const DEFAULT_OPTIONS = {
  fileName: 'sri.json',
  transform: Object,
  formatter: JSON.stringify,
};
const OPTION_TYPES = {
  fileName: ['String'],
  algorithms: ['Array'],
  transform: ['Function'],
  formatter: ['Function'],
};
let hashesStore = {}; // options.fileName: { relativePath: hash }

function error(msg) {
  return new PluginError('gulp-sri', msg);
}

function hash(file, options) {
  return sriToolbox.generate({
    algorithms: options.algorithms
  }, file.contents);
}

function sliceHash(hash, options) {
  // positive length = leading characters; negative = trailing
  return options.length
    ? options.length > 0
      ? hash.slice(0, options.length)
      : hash.slice(options.length)
    : hash;
}

function relativePath(projectPath, filePath) {
  return path.relative(projectPath, filePath).replace(/\\/g, '/');
}

function getType(value) {
  return {}.toString.call(value).slice(8, -1);
}

function assignOptions(options) {
  if (typeof options === 'string') {
    options = { fileName: options };
  }
  options = options || {};

  Object.keys(options).forEach(function (option) {
    if (!OPTION_TYPES.hasOwnProperty(option)) {
      throw error(`Unsupported option: ${option}`);
    }
    if (options[option] !== undefined && !~OPTION_TYPES[option].indexOf(getType(options[option]))) {
      throw error(`options.${option} must be of type ${OPTION_TYPES[option].join(' or ')}`);
    }
  });

  return _.defaults({}, options, DEFAULT_OPTIONS);
}

module.exports = exports = function (options) {
  options = assignOptions(options);
  const hashes = hashesStore[options.fileName] = hashesStore[options.fileName] || {};
  const hashingPromises = [];

  function hashFile(file) {
    if (file.isNull()) {
      return;
    } // ignore
    if (file.isStream()) {
      return this.emit('error', error('Streaming not supported'));
    }

    // start hashing files as soon as they are received for maximum concurrency
    hashingPromises.push(
      new Promise((resolve, reject) => {
        try {
          resolve(hash(file, options));
        } catch(e) {
          reject(error(e));
        }
      })
      .then((hashed) => {
        if (typeof hashed !== 'string') {
          throw error('Return/fulfill value must be a string');
        }
        hashes[relativePath(file.cwd, file.path)] = sliceHash(hashed, options);
      })
    );
  }

  function endStream() {
    Promise.all(hashingPromises)
    .then(function () {
      return options.transform.call(undefined, Object.assign({}, hashes));
    })
    .then(function (transformed) {
      return options.formatter.call(undefined, transformed);
    })
    .then((formatted) => {
      if (typeof formatted !== 'string') {
        throw error('Return/fulfill value of `options.formatter` must be a string');
      }

      this.emit('data', new Vinyl({
        path: path.join(process.cwd(), options.fileName),
        contents: new Buffer(formatted),
      }));
      this.emit('end');
    })
    .catch((err) => {
      this.emit('error', err instanceof PluginError ? err : error(err));
    });
  }

  return through(hashFile, endStream);
};

// for testing. Don't use, may be removed or changed at anytime
Object.assign(exports, {
  _Promise: Promise,
  _DEFAULT_OPTIONS: DEFAULT_OPTIONS,
  _error: error,
  _hash: hash,
  _relativePath: relativePath,
  _getType: getType,
  _assignOptions: assignOptions,
  _reset: function () {
    hashesStore = {};
  },
});
