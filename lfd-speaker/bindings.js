/**
 * Module dependencies.
 */

var fs = require('fs')
var path = require('path')
var fileURLToPath = require('file-uri-to-path')
var join = path.join
var dirname = path.dirname
var exists =
   (fs.accessSync &&
     function (path) {
       try {
         fs.accessSync(path)
       } catch (e) {
         return false
       }
       return true
     }) ||
   fs.existsSync ||
   path.existsSync
var defaults = {
  arrow: process.env.NODE_BINDINGS_ARROW || ' → ',
  compiled: process.env.NODE_BINDINGS_COMPILED_DIR || 'compiled',
  platform: process.platform,
  arch: process.arch,
  nodePreGyp:
     'node-v' +
     process.versions.modules +
     '-' +
     process.platform +
     '-' +
     process.arch,
  version: process.versions.node,
  bindings: 'bindings.node',
  try: [
    // node-gyp's linked version in the "build" dir
    ['module_root', 'build', 'bindings'],
    // node-waf and gyp_addon (a.k.a node-gyp)
    ['module_root', 'build', 'Debug', 'bindings'],
    ['module_root', 'build', 'Release', 'bindings'],
    // Debug files, for development (legacy behavior, remove for node v0.9)
    ['module_root', 'out', 'Debug', 'bindings'],
    ['module_root', 'Debug', 'bindings'],
    // Release files, but manually compiled (legacy behavior, remove for node v0.9)
    ['module_root', 'out', 'Release', 'bindings'],
    ['module_root', 'Release', 'bindings'],
    // Legacy from node-waf, node <= 0.4.x
    ['module_root', 'build', 'default', 'bindings'],
    // Production "Release" buildtype binary (meh...)
    ['module_root', 'compiled', 'version', 'platform', 'arch', 'bindings'],
    // node-qbs builds
    ['module_root', 'addon-build', 'release', 'install-root', 'bindings'],
    ['module_root', 'addon-build', 'debug', 'install-root', 'bindings'],
    ['module_root', 'addon-build', 'default', 'install-root', 'bindings'],
    // node-pre-gyp path ./lib/binding/{node_abi}-{platform}-{arch}
    ['module_root', 'lib', 'binding', 'nodePreGyp', 'bindings']
  ]
}

/**
* The main `bindings()` function loads the compiled bindings for a given module.
* It uses V8's Error API to determine the parent filename that this function is
* being invoked from, which is then used to find the root directory.
*/

function bindings (opts) {
  // Argument surgery
  if (typeof opts === 'string') {
    opts = { bindings: opts }
  } else if (!opts) {
    opts = {}
  }

  // maps `defaults` onto `opts` object
  Object.keys(defaults).map(function (i) {
    if (!(i in opts)) opts[i] = defaults[i]
  })

  // Get the module root
  if (!opts.module_root) {
    opts.module_root = exports.getRoot(exports.getFileName())
  }

  // Ensure the given bindings name ends with .node
  if (path.extname(opts.bindings) !== '.node') {
    opts.bindings += '.node'
  }

  // https://github.com/webpack/webpack/issues/4175#issuecomment-342931035
  /* eslint-disable */
  var requireFunc =
   typeof __webpack_require__ === 'function'
     ? __non_webpack_require__
     : require
  /* eslint-disable */

  var tries = []
  var i = 0
  var l = opts.try.length
  var n
  var b
  var err

  for (; i < l; i++) {
    n = join.apply(
      null,
      opts.try[i].map(function (p) {
        return opts[p] || p
      })
    )
    tries.push(n)
    try {
      b = opts.path ? requireFunc.resolve(n) : requireFunc(n)
      if (!opts.path) {
        b.path = n
      }
      return b
    } catch (e) {
      if (e.code !== 'MODULE_NOT_FOUND' &&
         e.code !== 'QUALIFIED_PATH_RESOLUTION_FAILED' &&
         !/not find/i.test(e.message)) {
        throw e
      }
    }
  }

  err = new Error(
    'Could not locate the bindings file. Tried:\n' +
     tries
       .map(function (a) {
         return opts.arrow + a
       })
       .join('\n')
  )
  err.tries = tries
  throw err
}
module.exports = exports = bindings

/**
* Gets the filename of the JavaScript file that invokes this function.
* Used to help find the root directory of a module.
* Optionally accepts an filename argument to skip when searching for the invoking filename
*/

exports.getFileName = function getFileName (callingFile) {
  if (callingFile) return callingFile

  const err = new Error()

  Error.prepareStackTrace = (_, stack) => stack

  const stack = err.stack

  Error.prepareStackTrace = undefined

  let fileName = stack[1].getFileName()

  try {
    if (fileName) {
      if (fileName.includes('file://')) fileName = fileURLToPath(fileName)
    }
  }
  catch(e) {}

  return fileName
}

/**
* Gets the root directory of a module, given an arbitrary filename
* somewhere in the module tree. The "root directory" is the directory
* containing the `package.json` file.
*
*   In:  /home/nate/node-native-module/lib/index.js
*   Out: /home/nate/node-native-module
*/

exports.getRoot = function getRoot (file) {
  var dir = dirname(file)
  var prev
  while (true) {
    if (dir === '.') {
      // Avoids an infinite loop in rare cases, like the REPL
      dir = process.cwd()
    }
    if (
      exists(join(dir, 'package.json')) ||
     exists(join(dir, 'node_modules'))
    ) {
      // Found the 'package.json' file or 'node_modules' dir; we're done
      return dir
    }
    if (prev === dir) {
      // Got to the top
      throw new Error(
        'Could not find module root given file: "' +
         file +
         '". Do you have a `package.json` file? '
      )
    }
    // Try the parent dir next
    prev = dir
    dir = join(dir, '..')
  }
}
