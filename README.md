# Multer S3

Streaming multer storage engine for AWS S3.

This project is mostly an integration piece for existing code samples from Multer's [storage engine documentation](https://github.com/expressjs/multer/blob/master/StorageEngine.md) with a call to `s3.upload` (see the [aws-sdk docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#upload-property)) as the substitution piece for file system.  Existing solutions I found required buffering the multipart uploads into the actual filesystem which is difficult to scale.

## Modifications for Infurnia

The latest version (v3) of the AWS S3 api does not support the `.upload` function on the S3 client object. We have instead used the `PutObjectCommand`.

There was an issue while passing the incoming file stream directly to `PutObject`. The error was related to the `Content-Length` of the stream not being defined. So, that has been modified. First, the stream is read a `Buffer` object and then this `Buffer` object is easily uploaded using the `PutObject`. This is still faster than the content being written into a temporary file say and then being read back to upload.

The `PutObject` function has many over-ridden forms and the one with callbacks is used to ensure the compatibility with the existing code.

## Installation

```sh
npm install --save multer-s3
```

## Usage

```javascript
var aws = require('aws-sdk')
var express = require('express')
var multer = require('multer')
var multerS3 = require('multer-s3')

var app = express()
var s3 = new aws.S3({ /* ... */ })

var upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: 'some-bucket',
    metadata: function (req, file, cb) {
      cb(null, {fieldName: file.fieldname});
    },
    key: function (req, file, cb) {
      cb(null, Date.now().toString())
    }
  })
})

app.post('/upload', upload.array('photos', 3), function(req, res, next) {
  res.send('Successfully uploaded ' + req.files.length + ' files!')
})
```

### File information

Each file contains the following information exposed by `multer-s3`:

| Key                    | Description                                                                  | Note          |
| ---------------------- | ---------------------------------------------------------------------------- | ------------- |
| `size`               | Size of the file in bytes                                                    |               |
| `bucket`             | The bucket used to store the file                                            | `S3Storage` |
| `key`                | The name of the file                                                         | `S3Storage` |
| `acl`                | Access control for the file                                                  | `S3Storage` |
| `contentType`        | The `mimetype` used to upload the file                                     | `S3Storage` |
| `metadata`           | The `metadata` object to be sent to S3                                     | `S3Storage` |
| `location`           | The S3 `url` to access the file                                            | `S3Storage` |
| `etag`               | The `etag`of the uploaded file in S3                                       | `S3Storage` |
| `contentDisposition` | The `contentDisposition` used to upload the file                           | `S3Storage` |
| `storageClass`       | The `storageClass` to be used for the uploaded file in S3                  | `S3Storage` |
| `versionId`          | The `versionId` is an optional param returned by S3 for versioned buckets. | `S3Storage` |
| `contentEncoding`    | The `contentEncoding` used to upload the file                              | `S3Storage` |

### Setting ACL

[ACL values](http://docs.aws.amazon.com/AmazonS3/latest/dev/acl-overview.html#canned-acl) can be set by passing an optional `acl` parameter into the `multerS3` object.

```javascript
var upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: 'some-bucket',
    acl: 'public-read',
    key: function (req, file, cb) {
      cb(null, Date.now().toString())
    }
  })
})
```

Available options for canned ACL.

| ACL Option                    | Permissions added to ACL                                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `private`                   | Owner gets `FULL_CONTROL`. No one else has access rights (default).                                                                                         |
| `public-read`               | Owner gets `FULL_CONTROL`. The `AllUsers` group gets `READ` access.                                                                                     |
| `public-read-write`         | Owner gets `FULL_CONTROL`. The `AllUsers` group gets `READ` and `WRITE` access. Granting this on a bucket is generally not recommended.               |
| `aws-exec-read`             | Owner gets `FULL_CONTROL`. Amazon EC2 gets `READ` access to `GET` an Amazon Machine Image (AMI) bundle from Amazon S3.                                  |
| `authenticated-read`        | Owner gets `FULL_CONTROL`. The `AuthenticatedUsers` group gets `READ` access.                                                                           |
| `bucket-owner-read`         | Object owner gets `FULL_CONTROL`. Bucket owner gets `READ` access. If you specify this canned ACL when creating a bucket, Amazon S3 ignores it.           |
| `bucket-owner-full-control` | Both the object owner and the bucket owner get `FULL_CONTROL` over the object. If you specify this canned ACL when creating a bucket, Amazon S3 ignores it. |
| `log-delivery-write`        | The `LogDelivery` group gets `WRITE` and `READ_ACP` permissions on the bucket. For more information on logs.                                            |

## Setting Metadata

The `metadata` option is a callback that accepts the request and file, and returns a metadata object to be saved to S3.

Here is an example that stores all fields in the request body as metadata, and uses an `id` param as the key:

```javascript
var opts = {
    s3: s3,
    bucket: config.originalsBucket,
    metadata: function (req, file, cb) {
      cb(null, Object.assign({}, req.body));
    },
    key: function (req, file, cb) {
      cb(null, req.params.id + ".jpg");
    }
  };
```

## Setting Cache-Control header

The optional `cacheControl` option sets the `Cache-Control` HTTP header that will be sent if you're serving the files directly from S3. You can pass either a string or a function that returns a string.

Here is an example that will tell browsers and CDNs to cache the file for one year:

```javascript
var upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: 'some-bucket',
    cacheControl: 'max-age=31536000',
    key: function (req, file, cb) {
      cb(null, Date.now().toString())
    }
  })
})
```

## Setting Custom Content-Type

The optional `contentType` option can be used to set Content/mime type of the file. By default the content type is set to `application/octet-stream`. If you want multer-s3 to automatically find the content-type of the file, use the `multerS3.AUTO_CONTENT_TYPE` constant. Here is an example that will detect the content type of the file being uploaded.

```javascript
var upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: 'some-bucket',
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: function (req, file, cb) {
      cb(null, Date.now().toString())
    }
  })
})
```

You may also use a function as the `contentType`, which should be of the form `function(req, file, cb)`.

## Setting StorageClass

[storageClass values](https://aws.amazon.com/s3/storage-classes/) can be set by passing an optional `storageClass` parameter into the `multerS3` object.

```javascript
var upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: 'some-bucket',
    acl: 'public-read',
    storageClass: 'REDUCED_REDUNDANCY',
    key: function (req, file, cb) {
      cb(null, Date.now().toString())
    }
  })
})
```

## Setting Content-Disposition

The optional `contentDisposition` option can be used to set the `Content-Disposition` header for the uploaded file. By default, the `contentDisposition` isn't forwarded. As an example below, using the value `attachment` forces the browser to download the uploaded file instead of trying to open it.

```javascript
var upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: 'some-bucket',
    acl: 'public-read',
    contentDisposition: 'attachment',
    key: function (req, file, cb) {
      cb(null, Date.now().toString())
    }
  })
})
```

## Using Server-Side Encryption

*An overview of S3's server-side encryption can be found in the [S3 Docs] (http://docs.aws.amazon.com/AmazonS3/latest/dev/serv-side-encryption.html); be advised that customer-managed keys (SSE-C) is not implemented at this time.*

You may use the S3 server-side encryption functionality via the optional `serverSideEncryption` and `sseKmsKeyId` parameters. Full documentation of these parameters in relation to the S3 API can be found [here] (http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#upload-property) and [here] (http://docs.aws.amazon.com/AmazonS3/latest/dev/UsingServerSideEncryption.html).

`serverSideEncryption` has two valid values: 'AES256' and 'aws:kms'. 'AES256' utilizes the S3-managed key system, while 'aws:kms' utilizes the AWS KMS system and accepts the optional `sseKmsKeyId` parameter to specify the key ID of the key you wish to use. Leaving `sseKmsKeyId` blank when 'aws:kms' is specified will use the default KMS key. **Note:** *You must instantiate the S3 instance with `signatureVersion: 'v4'` in order to use KMS-managed keys [[Docs]] (http://docs.aws.amazon.com/AmazonS3/latest/dev/UsingAWSSDK.html#specify-signature-version), and the specified key must be in the same AWS region as the S3 bucket used.*

```javascript
var upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: 'some-bucket',
    acl: 'authenticated-read',
    contentDisposition: 'attachment',
    serverSideEncryption: 'AES256',
    key: function(req, file, cb) {
      cb(null, Date.now().toString())
    }
  })
})
```

## Setting Content-Encoding

The optional `contentEncoding` option can be used to set the `Content-Encoding` header for the uploaded file. By default, the `contentEncoding` isn't forwarded. As an example below, using the value `gzip`, a file can be uploaded as a gzip file - and when it is downloaded, the browser will uncompress it automatically.

```javascript
var upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: 'some-bucket',
    acl: 'public-read',
    contentEncoding: 'gzip',
    key: function (req, file, cb) {
      cb(null, Date.now().toString())
    }
  })
})
```

You may also use a function as the `contentEncoding`, which should be of the form `function(req, file, cb)`.

## Testing

The tests mock all access to S3 and can be run completely offline.

```sh
npm test
```
