var crypto = require('crypto')
var stream = require('stream')
var fileType = require('file-type')
var htmlCommentRegex = require('html-comment-regex')
var parallel = require('run-parallel')

function staticValue (value) {
  return function (req, file, cb) {
    cb(null, value)
  }
}

var defaultAcl = staticValue('private')
var defaultContentType = staticValue('application/octet-stream')

var defaultMetadata = staticValue(null)
var defaultCacheControl = staticValue(null)
var defaultContentDisposition = staticValue(null)
var defaultContentEncoding = staticValue(null)
var defaultStorageClass = staticValue('STANDARD')
var defaultSSE = staticValue(null)
var defaultSSEKMS = staticValue(null)

var defaultPriorityLevel = staticValue(1)

// Regular expression to detect svg file content, inspired by: https://github.com/sindresorhus/is-svg/blob/master/index.js
// It is not always possible to check for an end tag if a file is very big. The firstChunk, see below, might not be the entire file.
var svgRegex = /^\s*(?:<\?xml[^>]*>\s*)?(?:<!doctype svg[^>]*>\s*)?<svg[^>]*>/i

function isSvg (svg) {
  // Remove DTD entities
  svg = svg.replace(/\s*<!Entity\s+\S*\s*(?:"|')[^"]+(?:"|')\s*>/img, '')
  // Remove DTD markup declarations
  svg = svg.replace(/\[?(?:\s*<![A-Z]+[^>]*>\s*)*\]?/g, '')
  // Remove HTML comments
  svg = svg.replace(htmlCommentRegex, '')

  return svgRegex.test(svg)
}

function defaultKey (req, file, cb) {
  crypto.randomBytes(16, function (err, raw) {
    cb(err, err ? undefined : raw.toString('hex'))
  })
}

function autoContentType (req, file, cb) {
  file.stream.once('data', function (firstChunk) {
    var type = fileType(firstChunk)
    var mime = 'application/octet-stream' // default type

    // Make sure to check xml-extension for svg files.
    if ((!type || type.ext === 'xml') && isSvg(firstChunk.toString())) {
      mime = 'image/svg+xml'
    } else if (type) {
      mime = type.mime
    }

    var outStream = new stream.PassThrough()

    outStream.write(firstChunk)
    file.stream.pipe(outStream)

    cb(null, mime, outStream)
  })
}

function collect (storage, req, file, cb) {
  parallel([
    storage.getBucketNamesAndRegions.bind(storage, req, file),
    storage.getPriorityLevel.bind(storage, req, file),
    storage.getKey.bind(storage, req, file),
    storage.getAcl.bind(storage, req, file),
    storage.getMetadata.bind(storage, req, file),
    storage.getCacheControl.bind(storage, req, file),
    storage.getContentDisposition.bind(storage, req, file),
    storage.getStorageClass.bind(storage, req, file),
    storage.getSSE.bind(storage, req, file),
    storage.getSSEKMS.bind(storage, req, file),
    storage.getContentEncoding.bind(storage, req, file)
  ], function (err, values) {
    if (err) return cb(err)

    storage.getContentType(req, file, function (err, contentType, replacementStream) {
      if (err) return cb(err)

      cb.call(storage, null, {
        bucket_names_and_regions: values[0],
        priorityLevel: values[1],
        key: values[2],
        acl: values[3],
        metadata: values[4],
        cacheControl: values[5],
        contentDisposition: values[6],
        storageClass: values[7],
        contentType: contentType,
        replacementStream: replacementStream,
        serverSideEncryption: values[8],
        sseKmsKeyId: values[9],
        contentEncoding: values[10]
      })
    })
  })
}

function S3Storage (opts) {
  switch (typeof opts.s3s) {
    case 'object': this.s3s = opts.s3s; break;
    default: throw new TypeError('Expected opts.s3s to be object')
  }

  switch (typeof opts.bucket_names_and_regions) {
    case 'function': this.getBucketNamesAndRegions = opts.bucket_names_and_regions; break
    case 'object': this.getBucketNamesAndRegions = staticValue(opts.bucket_names_and_regions); break;
    default: throw new TypeError('Expected opts.bucket_names_and_regions to be undefined or array of objects')
  }

  switch (typeof opts.priorityLevel) {
    case 'function': this.getPriorityLevel = opts.priorityLevel; break;
    case 'number': this.getPriorityLevel = staticValue(opts.priorityLevel); break;
    case 'undefined': this.getPriorityLevel = defaultPriorityLevel; break;
    default: throw new TypeError(`Expected opts.priorityLevel to be number or function or undefined`);
  }

  switch (typeof opts.key) {
    case 'function': this.getKey = opts.key; break
    case 'undefined': this.getKey = defaultKey; break
    default: throw new TypeError('Expected opts.key to be undefined or function')
  }

  switch (typeof opts.acl) {
    case 'function': this.getAcl = opts.acl; break
    case 'string': this.getAcl = staticValue(opts.acl); break
    case 'undefined': this.getAcl = defaultAcl; break
    default: throw new TypeError('Expected opts.acl to be undefined, string or function')
  }

  switch (typeof opts.contentType) {
    case 'function': this.getContentType = opts.contentType; break
    case 'undefined': this.getContentType = defaultContentType; break
    default: throw new TypeError('Expected opts.contentType to be undefined or function')
  }

  switch (typeof opts.metadata) {
    case 'function': this.getMetadata = opts.metadata; break
    case 'undefined': this.getMetadata = defaultMetadata; break
    default: throw new TypeError('Expected opts.metadata to be undefined or function')
  }

  switch (typeof opts.cacheControl) {
    case 'function': this.getCacheControl = opts.cacheControl; break
    case 'string': this.getCacheControl = staticValue(opts.cacheControl); break
    case 'undefined': this.getCacheControl = defaultCacheControl; break
    default: throw new TypeError('Expected opts.cacheControl to be undefined, string or function')
  }

  switch (typeof opts.contentDisposition) {
    case 'function': this.getContentDisposition = opts.contentDisposition; break
    case 'string': this.getContentDisposition = staticValue(opts.contentDisposition); break
    case 'undefined': this.getContentDisposition = defaultContentDisposition; break
    default: throw new TypeError('Expected opts.contentDisposition to be undefined, string or function')
  }

  switch (typeof opts.contentEncoding) {
    case 'function': this.getContentEncoding = opts.contentEncoding; break
    case 'string': this.getContentEncoding = staticValue(opts.contentEncoding); break
    case 'undefined': this.getContentEncoding = defaultContentEncoding; break
    default: throw new TypeError('Expected opts.contentEncoding to be undefined, string or function')
  }

  switch (typeof opts.storageClass) {
    case 'function': this.getStorageClass = opts.storageClass; break
    case 'string': this.getStorageClass = staticValue(opts.storageClass); break
    case 'undefined': this.getStorageClass = defaultStorageClass; break
    default: throw new TypeError('Expected opts.storageClass to be undefined, string or function')
  }

  switch (typeof opts.serverSideEncryption) {
    case 'function': this.getSSE = opts.serverSideEncryption; break
    case 'string': this.getSSE = staticValue(opts.serverSideEncryption); break
    case 'undefined': this.getSSE = defaultSSE; break
    default: throw new TypeError('Expected opts.serverSideEncryption to be undefined, string or function')
  }

  switch (typeof opts.sseKmsKeyId) {
    case 'function': this.getSSEKMS = opts.sseKmsKeyId; break
    case 'string': this.getSSEKMS = staticValue(opts.sseKmsKeyId); break
    case 'undefined': this.getSSEKMS = defaultSSEKMS; break
    default: throw new TypeError('Expected opts.sseKmsKeyId to be undefined, string, or function')
  }
}

S3Storage.prototype._handleFile = function (req, file, cb) {
  collect(this, req, file, function (err, opts) {
    if (err) return cb(err)

    //put the input stream into a buffer
    let inputStream = (opts.replacementStream || file.stream);
    let chunks = [];
    let fileBuffer ; 
    //define the events on the stream
    //1. error event
    inputStream.on('error', (err) => {
      throw err;
    });
    //2. data event 
    inputStream.on('data', (chunk) => {
      chunks.push(chunk);
    });
    //3. end event
    inputStream.on('end', ()=> {
      
      fileBuffer = Buffer.concat(chunks);

      //array which holds the PutObject promises
      let primary_put_object_promises = [];
      let secondary_put_object_promises = [];

      // console.info('bucket_names_and_regions', opts.bucket_names_and_regions);

      //loop over the bucket_names_and_regions (primary only)
      for (let i=0; i<opts.bucket_names_and_regions.length; i++) {
        let bucket_name_and_region = opts.bucket_names_and_regions[i];
        let params = {
          Bucket: bucket_name_and_region.bucket_name,
          Key: opts.key,
          ACL: opts.acl,
          CacheControl: opts.cacheControl,
          ContentType: opts.contentType,
          Metadata: opts.metadata,
          StorageClass: opts.storageClass,
          ServerSideEncryption: opts.serverSideEncryption,
          SSEKMSKeyId: opts.sseKmsKeyId,
        };
        //set the remaining options
        if (opts.contentDisposition) {
          params.ContentDisposition = opts.contentDisposition
        }
        if (opts.contentEncoding) {
          params.ContentEncoding = opts.contentEncoding
        }
        //set the body of the s3 putobject request to the buffer just created
        params.Body = fileBuffer;

        //put the object
        if (i<opts.priorityLevel) {
          primary_put_object_promises.push(this.s3s[bucket_name_and_region.region].putObject(params));
        }
        else {
          secondary_put_object_promises.push(this.s3s[bucket_name_and_region.region].putObject(params));
        }
      }

      //define a promise.all the secondary upload
      if (secondary_put_object_promises.length>0) {
        Promise.all(secondary_put_object_promises).then(secondaryPutObjectResponses=> {
          let result = secondaryPutObjectResponses.map((x, idx)=> {
            return {
              bucket_name: opts.bucket_names_and_regions[idx+opts.priorityLevel].bucket_name,
              region: opts.bucket_names_and_regions[idx+opts.priorityLevel].region,
              key: opts.key,
              path: opts.key,
              acl: opts.acl,
              contentType: opts.contentType,
              contentDisposition: opts.contentDisposition,
              contentEncoding: opts.contentEncoding,
              storageClass: opts.storageClass,
              serverSideEncryption: opts.serverSideEncryption,
              metadata: opts.metadata,
              etag: x.ETag,
              versionId: x.VersionId 
            }
          });
        }).catch(err=> {
            console.error(`@infurnia/s3-multer/secondaryPutObject===> `, err);
            throw err;
        });
      }

      //define promise.all on the primary uploads
      Promise.all(primary_put_object_promises).then(primaryPutObjectResponses=> {
        let result = primaryPutObjectResponses.map((x, idx)=> {
          return {
            bucket_name: opts.bucket_names_and_regions[idx].bucket_name,
            region: opts.bucket_names_and_regions[idx].region,
            key: opts.key,
            path: opts.key,
            acl: opts.acl,
            contentType: opts.contentType,
            contentDisposition: opts.contentDisposition,
            contentEncoding: opts.contentEncoding,
            storageClass: opts.storageClass,
            serverSideEncryption: opts.serverSideEncryption,
            metadata: opts.metadata,
            etag: x.ETag,
            versionId: x.VersionId 
          }
        });
        //execute the callback
        cb(null, {'s3_uploads': result, 'path': opts.key});
      }).catch(err=> {
        console.error(`@infurnia/s3-multer/primaryPutObject===> `, err);
        return cb(err);
      }); 

    });
  })
}

// S3Storage.prototype._removeFile = function (req, file, cb) {
//   this.s3.deleteObject({ Bucket: file.bucket, Key: file.key }, cb)
// }

module.exports = function (opts) {
  return new S3Storage(opts)
}

module.exports.AUTO_CONTENT_TYPE = autoContentType
module.exports.DEFAULT_CONTENT_TYPE = defaultContentType
