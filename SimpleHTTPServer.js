/*jshint node:true */
/**
 * A JavaScript version SimpleHTTPServer.
 */
'use strict';

var http = require('http'),
    urlParser = require('url'),
    fs = require('fs'),
    path = require('path'),
    util = require('util'),
    formidable = false, /* Get it later, if installed (to keep it optional) */
    querystring = require('querystring'),
    currentDir = process.cwd(),
    argv = process.argv.splice(2),
    port = 8000,
    allowUpload = false,

    cachedStat = {
        table: {},
        fileStat: function (fpath, callback) {
            if (cachedStat.table[fpath]) {
                callback(null, cachedStat.table[fpath]);
            } else {
                var cb = function (err, _stat) {
                    if (!err) {
                        cachedStat.table[fpath] = _stat;
                    }
                    callback(err, _stat);
                };
                fs.stat(fpath, cb);
            }
        }
    };

function showHelp() {
    console.log("--help, -h                 show this message");
    console.log("--port num, -p num         listen on port num");
    console.log("--upload, -u               allow upload");
}

/* parse arguments */
for(var i = 0; i < argv.length; i++) {
    switch(argv[i]) {
        case '--help':
        case '-h':
            showHelp();
            process.exit();
            break;
        case '--port':
        case '-p':
            if(argv.length > i + 1) {
                var portNum = parseInt(argv[i + 1], 10);
                if(!isNaN(portNum)) {
                    port = portNum;
                    i++;
                } else {
                    console.log("wrong parameter");
                    process.exit(1);
                }
            } else {
                console.log("missing parameter");
                process.exit(1);
            }
            break;
        case '--upload':
        case '-u':
            allowUpload = true;
            break;
        default:
            showHelp();
            process.exit(1);
            break;
    }
} 

/* if node-formidable is installed, import it */
if(allowUpload)
{
    try {
        formidable = require('formidable');
    } catch (err) {
        try {
            formidable = require('node-formidable'); /* Both names happen */
        } catch (err) {
            formidable = false
            console.log('importing node-formidable (required for uploading) failed');
        }
    }
}

http.createServer(function (request, response) {
    var urlObject = urlParser.parse(request.url, true),
        pathname = decodeURIComponent(urlObject.pathname),
        filePath = path.join(currentDir, pathname);

    console.log('[' + (new Date()) + '] ' + request.connection.remoteAddress  + ': "' + request.method + ' ' + pathname + '"');
    
    if(request.method == 'GET') {
        cachedStat.fileStat(filePath, function (err, stats) {
            if (!err) {
                if (stats.isFile()) {

                    fs.open(filePath, 'r', function (err, fd) {
                        if(!err) {
                            var chunkSize = 1024 * 1024,
                                position = 0,
                                buffer = new Buffer(chunkSize),

                                readFunc = function () {
                                    fs.read(fd, buffer, 0, chunkSize, position, function (err, bytesRead) {
                                        if (err) {
                                            response.end('File read error.');
                                            response.removeListener('drain', readFunc);
                                        } else if (bytesRead === 0) {
                                            response.end();
                                            response.removeListener('drain', readFunc);
                                        } else {
                                            position += chunkSize;
                                            response.write(buffer.slice(0, bytesRead));
                                        }
                                    });
                                };

                            response.writeHead(200, {
                                'Content-Length' : stats.size 
                            });

                            response.on('drain', readFunc);
                            readFunc();
                        }
                    });
                } else if (stats.isDirectory()) {
                    fs.readdir(filePath, function (error, files) {
                        if (!error) {
                            var count = 0;

                            files.sort(function (a, b) {
                                if (a.toLowerCase() < b.toLowerCase()) return -1;
                                if (a.toLowerCase() > b.toLowerCase()) return 1;
                                return 0;
                            });

                            response.writeHead(200, {'Content-Type': 'text/html'});
                            response.write("<!DOCTYPE html>\n<html><head><meta charset='UTF-8'><title>" + filePath + "</title></head><body>");
                            response.write("<h2>Directory listing for " + filePath + "</h2>");
                            response.write("<ul style='list-style:none;font-family:courier new;'>");

                            if(pathname != '/') {
                                files.unshift('.', '..');
                            }

                            files.forEach(function (item) {
                                var urlPath = pathname + item;
                                cachedStat.fileStat(currentDir + urlPath, function (err, itemStats) {
                                    if (!err) {
                                        if (itemStats.isDirectory()) {
                                            urlPath += '/';
                                            item += '/';
                                        }
                                        response.write('<li><a href="' + encodeURI(urlPath) + '">' + item + '</a></li>');
                                        if (++count >= files.length) {
                                            if(formidable && allowUpload) {
                                                response.write('<form action="." method="post" enctype="multipart/form-data"><input name="file" type="file"><input type="submit" value="upload file"></form>');
                                            }
                                            response.end('</ul></body></html>');
                                        }
                                    }
                                });
                            });
                        } else {
                            // Read dir error
                            response.writeHead(500, {});
                            response.end('Server Error');
                        }
                    });
                }
            } else {
                response.writeHead(404, {});
                response.end('File not found!');
            }
        });
    }
    else if(request.method == 'POST' && formidable && allowUpload) {
        var form = new formidable.IncomingForm();

        form.uploadDir = filePath;
        form.keepExtensions = true;

        form.parse(request, function(err, fields, files) {
            if(!err) {
                if(!fs.existsSync(path.join(filePath, files['file']['name']))) {
                    fs.rename(files['file']['path'], path.join(filePath, files['file']['name']));
                    filePath = path.join(filePath, files['file']['name']);
                } else {
                    /* When file exists, append .number */
                    var num = 1;
                    while(fs.existsSync(path.join(filePath, files['file']['name']) + "." + num)) {
                        num++;
                    }
                    fs.rename(files['file']['path'], path.join(filePath, files['file']['name']) + "." + num);
                    filePath = path.join(filePath, files['file']['name']) + "." + num;
                }

                response.writeHead(200, {'content-Type': 'text/html'});
                response.write("<!DOCTYPE html>\n<html><head><meta charset='UTF-8'><title>" + filePath + " uploaded</title></head><body>");
                response.write(filePath + " successfully uploaded");
                response.end('</body></html>');
                console.log('[' + (new Date()) + '] ' + request.connection.remoteAddress + ': uploaded: ' + filePath);
            } else {
                filePath = path.join(filePath, files['file']['name']);

                response.writeHead(400, {'content-Type': 'text/html'});
                response.write("<!DOCTYPE html>\n<html><head><meta charset='UTF-8'><title>uploading " + filePath + " failed</title></head><body>");
                response.write("uploading " + filePath + " failed");
                response.end('</body></html>');
                console.log('[' + (new Date()) + '] ' + request.connection.remoteAddress + ': uploading ' + filePath + " failed!");
            }
        });
    }
}).listen(port);

console.log('Server running at http://localhost' + ((port === 80) ? '' : (':' + port)) + '/');
console.log('Base directory at ' + currentDir);

if(allowUpload && formidable) {
            console.log("-- upload enabled --");
}
