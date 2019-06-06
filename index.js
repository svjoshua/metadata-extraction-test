const express = require('express');
const uniqid = require('uniqid');
const multer = require('multer');
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads');
  },
  filename: function (req, file, cb) {
    cb(null, `${uniqid()}-${file.originalname}`);
  }
})
const upload = multer({storage: storage})
const app = express();
const port = 3000;

const ffprobe = require('ffprobe');
const ffprobeStatic = require('ffprobe-static');

const exiftool = require('node-exiftool');
const exiftoolBin = require('dist-exiftool');
const ep = new exiftool.ExiftoolProcess(exiftoolBin);

const getDocumentProperties = require('office-document-properties');

const fs = require('fs');
const pdf = require('pdf-parse');

const crypto = require('crypto');

app.get('/', (req, res) => res.send(`
	<h1>Metadata Form<h1>
	<form method='post' action'/' enctype='multipart/form-data'>
		<p><input type='file' name='file'/></p>
		<p><input type='submit' value='Parse'></p>
	</form>
`));

app.post('/', upload.single('file'), async function (req, res, next) {
	let type = 'invalid';
	let info = '';
	let exif = 'undefined';
	let misc = '';
	let error = 'none';
	let etag = '';
	
	let fileext = req.file.originalname.split('.');
	fileext = fileext[(fileext.length - 1)];

	if(req.file.mimetype.match(/video\//)){
		type = 'video';
		await ffprobe(req.file.path, { path: ffprobeStatic.path })
		.then(function (data, err) {
			if(err) { error = err.message; }
			info = JSON.stringify(data, undefined, '\t');
		});
	}if(req.file.mimetype.match(/audio\//)){
		type = 'audio';
		await ffprobe(req.file.path, { path: ffprobeStatic.path })
		.then(function (data, err) {
			if(err) { error = err.message; }
			info = JSON.stringify(data, undefined, '\t');
		});
	}else if(req.file.mimetype.match(/image\//)){
		type = 'image';
		//nothing other than xiff at this point...
	}else if(req.file.mimetype.match(/application\/vnd.openxmlformats-officedocument/)){
		type = 'office doc';
		getDocumentProperties.fromFilePath(req.file.path, function(err, data) {
			if(err) { error = err.message; }
			info = JSON.stringify(data, undefined, '\t');
		});
	}else if(req.file.mimetype.match(/application\/pdf/)){
		type = 'pdf doc';

		let dataBuffer = fs.readFileSync(req.file.path);
 
		await pdf(dataBuffer).then(function(data) {
			info = JSON.stringify(data, undefined, '\t');
		});
	}

	const readStream = fs.createReadStream(req.file.path);
	const hash = crypto.createHash('md5');
	readStream
	.on('data', function (chunk) {
		hash.update(chunk);
	})
	.on('end', function () {
		etag = hash.digest('hex');
	});

	await ep
		.open()
		.then(() => ep.readMetadata(req.file.path, ['-File:all']))
		.then((data, err) => {
			if(err) { error = err.message; }
			exif = JSON.stringify(data, undefined, '\t');
		})
		.then(() => ep.close());



	res.send(`
		<h1>Metadata</h1>
		<p>Error: ${error}</p>
		<p><a href='/'>Back</a></p>
		<h2>Type: ${type}</h2>
		<p>Ext: ${fileext}</p>
		<p>E-tag: ${etag}</p>
		<h2>File</h2>
		<div style='white-space:pre;'>${JSON.stringify(req.file, undefined, '\t')}</div>
		<h2>Exif</h2>
		<div style='white-space:pre;'>${exif}</div>
		<h2>Type specific</h2>
		<div style='white-space:pre;'>${info}</div>
		<h2>Misc</h2>
		<div style='white-space:pre;'>${misc}</div>
	`);
})

app.listen(port, () => console.log(`Example app listening on port ${port}!`));