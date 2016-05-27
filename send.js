/**
 * Module dependencies.
 */

var debug = require('debug')('koa-better-static:send');
var assert = require('assert');
var extname = require('path').extname;
var fs = require('fs');
var PassThrough = require('stream').PassThrough;

/**
 * Expose `send()`.
 */

module.exports = send;

/**
 * Send file at `path` with the
 * given `options` to the koa `ctx`.
 *
 * @param {Context} ctx
 * @param {String} root
 * @param {String} path
 * @param {Object} [opts]
 * @return {Function}
 * @api public
 */


function stat(path) {
  return new Promise(function(resolve, reject) {
    fs.stat(path, function(err, data) {
      if (err) return reject(err);
      resolve(data);
    })
  });
}

function readFile(path) {
    return new Promise(function (resolve, reject) {
            fs.readFile(path, function (err,  data) {
                if (err) return reject(err);
                resolve(data);
            })
    });
}



function* send(ctx, path, opts) {
    assert(ctx, 'koa context required');
    assert(path, 'pathname required');
    assert(opts, 'opts required');

    // options
    debug('send "%s" %j', path, opts);
    var index = opts.index;
    var maxage = opts.maxage;
    var format = opts.format;
    var ifModifiedSinceSupport = opts.ifModifiedSinceSupport;

    var requestUrl = ctx.request.url;
    try {
        decodeURIComponent(requestUrl);       // could not decode path
        var malliciousPathReg = /%\w+/g;
        if (malliciousPathReg.test(requestUrl)) {
            throw new Error("恶意路径(malicious path)")
        }
    } catch (err) {
        if (err) {
            return;
        }
    }

    // stat
    var stats;
    try {
      stats = yield stat(path);
    } catch (err) {
      var notfound = ['ENOENT', 'ENAMETOOLONG', 'ENOTDIR'];
      if (~notfound.indexOf(err.code)) return;
      err.status = 500;
      throw err;
    }


    // Format the path to serve static file servers
    // and not require a trailing slash for directories,
    // so that you can do both `/directory` and `/directory/`
    if (stats.isDirectory()) {
      if (format && index) {
        path += '/' + index;
        stats = yield stat(path);
      } else {
        return;
      }
    }

    ctx.set('Cache-Control', 'max-age=' + (maxage / 1000 | 0));

    // Check if we can return a cache hit
    if (ifModifiedSinceSupport) {
      var ims = ctx.get('If-Modified-Since');

      var ms = Date.parse(ims);

      if (ms && Math.floor(ms/1000) === Math.floor(stats.mtime.getTime()/1000)) {
        ctx.status = 304; // not modified
        return path;i
      }
    }

    // stream
    ctx.set('Last-Modified', stats.mtime.toUTCString());
    ctx.set('Content-Length', stats.size);
    ctx.type = extname(path);

    var socket = ctx.req.socket;
    if (socket.readable && socket.writable) {
        ctx.body = yield readFile(path);
        ctx.req.once('close', function () {
            ctx.res.end();
        });
        ctx.req.once('error', function () {
            ctx.res.end();
        })
    }
    return path;
}


