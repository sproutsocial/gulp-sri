'use strict';

const bust = require('..');
const PluginError = require('plugin-error');
const Vinyl = require('vinyl');
const fileContentStr = 'foo';
const file2ContentStr = [ // Transparent.gif
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00,
  0xff, 0xff, 0xff, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x01, 0x44, 0x00, 0x3b
];
const file = new Vinyl({
  cwd: 'C:/users/ult/',
  base: 'C:/users/ult/test',
  path: 'C:/users/ult/test/file.js',
  contents: new Buffer(fileContentStr),
});
const file2 = new Vinyl({
  cwd: 'C:/users/ult/',
  base: 'C:/users/ult/test',
  path: 'C:/users/ult/test/file2.js',
  contents: new Buffer(file2ContentStr),
});
const fileBustPath = bust._relativePath(file.cwd, file.path);
const file2BustPath = bust._relativePath(file2.cwd, file2.path);
const fileHash = bust._hash(file, bust._DEFAULT_OPTIONS);
const file2Hash = bust._hash(file2, bust._DEFAULT_OPTIONS);

beforeEach(bust._reset);

describe('Configuration-independent internal methods', function () {
  describe('_error()', function () {
    it('should return an instance of PluginError', function () {
      bust._error('err').should.be.an.instanceOf(PluginError);
    });
  });

  describe('_relativePath()', function () {
    it('should return a path relative to project root', function () {
      bust._relativePath('/projectRoot/', '/projectRoot/folder/file.ext').should.equal('folder/file.ext');
    });
  });

  describe('_getType()', function () {
    it('should return the correct type for all native values', function () {
      bust._getType('').should.equal('String');
      bust._getType(0).should.equal('Number');
      bust._getType({}).should.equal('Object');
      bust._getType([]).should.equal('Array');
      bust._getType(null).should.equal('Null');
      bust._getType(undefined).should.equal('Undefined');
      bust._getType(false).should.equal('Boolean');
      bust._getType(function () {
      }).should.equal('Function');
      bust._getType(/(?:)/).should.equal('RegExp');
      bust._getType(new Date()).should.equal('Date');
      bust._getType(new Error()).should.equal('Error');
    });
  });

  describe('_assignOptions()', function () {
    it('should assign options', function () {
      const options = { algorithms: ['sha256'] };
      bust._assignOptions(options).should.eql(Object.assign({}, bust._DEFAULT_OPTIONS, options));
    });

    it('should return the default options when no options are passed', function () {
      bust._assignOptions().should.eql(bust._DEFAULT_OPTIONS);
    });

    it('should treat `options` string as `options.fileName`', function () {
      const fileName = 'customName.ext';
      bust._assignOptions(fileName).fileName.should.equal(fileName);
    });

    it('should set options whose value evaluate to `undefined` to their default value', function () {
      bust._assignOptions({ fileName: undefined }).should.eql(bust._DEFAULT_OPTIONS);
    });

    it('should not mutate the `options` argument', function () {
      const options = {};
      bust._assignOptions(options);
      options.should.eql({});
    });

    it('should throw on unsupported options', function () {
      bust._assignOptions.bind(undefined, { foo: 0 }).should.throw();
    });

    it('should throw on invalid option value', function () {
      bust._assignOptions.bind(undefined, { transform: null }).should.throw();
    });
  });
});

describe('Core', function () {
  it('should bust two files into the same output file in the same stream', function (done) {
    const stream = bust();
    stream.on('data', function (newFile) {
      newFile.should.be.an.instanceOf(Vinyl);
      newFile.should.have.property('path');
      newFile.should.have.property('relative');
      newFile.should.have.property('contents');

      newFile.relative.should.equal('sri.json');
      const expectedObj = {};
      expectedObj[fileBustPath] = fileHash;
      expectedObj[file2BustPath] = file2Hash;

      JSON.parse(newFile.contents.toString()).should.eql(expectedObj);
      Buffer.isBuffer(newFile.contents).should.be.true;
      done();
    });
    stream.write(file);
    stream.end(file2);
  });

  it('should bust two files into different output files in different streams', function (done) {
    const stream = bust('output1.json');
    const stream2 = bust('output2.json');
    let testedOutputs = 0;

    stream.on('data', function (newFile) {
      const obj = JSON.parse(newFile.contents.toString());
      obj.should.have.property(fileBustPath);
      obj.should.not.have.property(file2BustPath);
      if (++testedOutputs === 2) {
        done();
      }
    });
    stream2.on('data', function (newFile) {
      const obj = JSON.parse(newFile.contents.toString());
      obj.should.not.have.property(fileBustPath);
      obj.should.have.property(file2BustPath);
      if (++testedOutputs === 2) {
        done();
      }
    });
    stream.end(file);
    stream2.end(file2);
  });

  it('should bust two files into the same output file in different streams', function (done) {
    const stream = bust('output.json');
    const stream2 = bust('output.json');
    let testedOutputs = 0;

    function runAssertion(newFile) {
      const obj = JSON.parse(newFile.contents.toString());
      obj.should.have.property(fileBustPath);
      obj.should.have.property(file2BustPath);
      done();
    }

    function onData() {
      if (++testedOutputs === 2) {
        runAssertion.apply(this, arguments);
      }
    }

    stream.on('data', onData);
    stream2.on('data', onData);
    stream.end(file);
    stream2.end(file2);
  });

  it('should return an empty hashes object file when receiving an empty buffers stream', function (done) {
    const stream = bust();
    stream.on('data', function (newFile) {
      JSON.parse(newFile.contents.toString()).should.eql({});
      done();
    });
    stream.end();
  });
});

describe('Configuration options', function () {
  describe('fileName', function () {
    it('should allow setting the output file name', function (done) {
      const fileName = 'customName.ext';

      const stream = bust({ fileName: fileName });
      stream.on('data', function (newFile) {
        newFile.relative.should.equal(fileName);
        done();
      });
      stream.end(file);
    });
  });

  describe('algo', function () {
    it('should accept an array of algorithms', function (done) {
      const stream = bust({ algorithms: ['sha256'] });
      stream.on('data', function (newFile) {
        JSON.parse(newFile.contents.toString())[fileBustPath].should.be.exactly('sha256-LCa0a2j/xo/5m0U8HTBBNBNCLXBkg7+g+YpeiGJm564=');
        done();
      });
      stream.end(file);
    });

    it('should emit an error when the hashing algorithm is not supported', function (done) {
      const stream = bust({ algorithms: ['UltHasher9000'] });
      stream.on('error', function () {
        done();
      });
      stream.end(file);
    });

    it('should correctly generate the hash for a binary file', function (done) {
      const stream = bust({ algorithms: ['sha256'] });
      stream.on('data', function (newFile) {
        JSON.parse(newFile.contents.toString())[file2BustPath].should.be.exactly('sha256-7xlVrnV8i5ZsgySDUDMb06MPZYztEfOH+OvwWrM2hik=');
        done();
      });
      stream.end(file2);
    });
  });

  describe('transform', function () {
    it('should accept a synchronous function', function (done) {
      const suffix = '_suffix',
        options = {
          transform: function (hashes) {
            (this === undefined).should.be.true;
            return [hashes[fileBustPath] + suffix];
          },
        },
        stream = bust(options);
      stream.on('data', function (newFile) {
        JSON.parse(newFile.contents.toString())[0].should.equal(fileHash + suffix);
        done();
      });
      stream.end(file);
    });

    it('should accept an asynchronous function', function (done) {
      const suffix = '_suffix',
        options = {
          transform: function (hashes) {
            (this === undefined).should.be.true;
            return new bust._Promise(function (fulfill) {
              setTimeout(function () {
                fulfill([hashes[fileBustPath] + suffix]);
              }, 0);
            });
          },
        },
        stream = bust(options);
      stream.on('data', function (newFile) {
        JSON.parse(newFile.contents.toString())[0].should.equal(fileHash + suffix);
        done();
      });
      stream.end(file);
    });
  });

  describe('formatter', function () {
    it('should accept a synchronous function', function (done) {
      const options = {
          formatter: function (hashes) {
            (this === undefined).should.be.true;
            return hashes[fileBustPath];
          },
        },
        stream = bust(options);
      stream.on('data', function (newFile) {
        newFile.contents.toString().should.equal(fileHash);
        done();
      });
      stream.end(file);
    });

    it('should accept an asynchronous function', function (done) {
      const options = {
          formatter: function (hashes) {
            (this === undefined).should.be.true;
            return new bust._Promise(function (fulfill) {
              setTimeout(function () {
                fulfill(hashes[fileBustPath]);
              }, 0);
            });
          },
        },
        stream = bust(options);
      stream.on('data', function (newFile) {
        newFile.contents.toString().should.equal(fileHash);
        done();
      });
      stream.end(file);
    });

    it('should emit an error when function does not return a string or promise', function (done) {
      const stream = bust({
        formatter: function () {
        }
      });
      stream.on('error', function (err) {
        err.should.be.an.instanceOf(PluginError);
        done();
      });
      stream.end(file);
    });

    it('should emit an error when promise is not fulfilled with a string', function (done) {
      const stream = bust({
        formatter: function () {
          return bust._Promise.resolve();
        },
      });
      stream.on('error', function (err) {
        err.should.be.an.instanceOf(PluginError);
        done();
      });
      stream.end(file);
    });
  });
});
