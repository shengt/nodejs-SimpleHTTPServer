/*jshint node:true */
/**
 * A JavaScript version SimpleHTTPServer.
 * Usage:
 *     node SimpleHTTPServer 8000
 */
'use strict';

var http = require('http'),
    urlParser = require('url'),
    fs = require('fs'),
    path = require('path'),
    current_dir = process.cwd(),
    argv = process.argv,
    port = 8000;

if (argv.length >= 3) {
    var portNum = parseInt(argv[2], 10);
    port = isNaN(portNum) ? port : portNum;
}

var cachedStat = {
    table: {},
    fileStatSync: function (fpath) {
        if (!cachedStat.table[fpath]) {
            cachedStat.table[fpath] = fs.statSync(fpath);
        }
        return cachedStat.table[fpath];
    },
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

http.createServer(function (request, response) {
    var urlObject = urlParser.parse(request.url, true),
        pathname = decodeURIComponent(urlObject.pathname);
    console.log('[' + (new Date()) + '] ' + request.connection.remoteAddress  + ': "' + request.method + ' ' + pathname + '"');
    
    var filePath = path.join(current_dir, pathname);
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
                                        // TODO: error
                                        response.end();
                                        response.removeListener("drain", readFunc);
                                    } else if (bytesRead === 0) {
                                        response.end();
                                        response.removeListener("drain", readFunc);
                                    } else {
                                        position += chunkSize;
                                        if (response.write(buffer.slice(0, bytesRead))) {
                                            readFunc();
                                        }
                                    }
                                });
                            };

                        response.writeHead(200, {
                            'Content-Length' : stats.size 
                        });

                        response.on("drain", readFunc);
                        readFunc();
                    }
                });
            } else if (stats.isDirectory()) {
                fs.readdir(filePath, function (error, files) {
                    if (!error) {
                        files.sort(function(a, b) {
                            if (a.toLowerCase() < b.toLowerCase()) return -1;
                            if (a.toLowerCase() > b.toLowerCase()) return 1;
                            return 0;
                        });

                        response.writeHead(200, {'Content-Type': 'text/html'});
                        response.write("<!DOCTYPE html>\n<html><head><meta charset='UTF-8'><title>" + filePath + "</title></head><body>");
                        response.write("<h1>" + filePath + "</h1>");
                        response.write("<ul style='list-style:none;font-family:courier new;'>");
                        files.unshift(".", "..");
                        files.forEach(function (item) {
                            var urlpath = pathname + item,
                                itemStats = cachedStat.fileStatSync(current_dir + urlpath);
                            if (itemStats.isDirectory()) {
                                urlpath += "/";
                                item += "/";
                            }
                            response.write('<li><a href="' + encodeURI(urlpath) + '">' + item + '</a></li>');
                        });
                        response.end("</ul></body></html>");
                    } else {
                        // Read dir error
                        response.writeHead(500, {});
                    }
                });
            }
        } else {
            response.writeHead(404, {});
            response.end("File not found!");
        }
    });
}).listen(port);

console.log("Server running at http://localhost" + ((port === 80) ? "" : ":") + port + "/");
console.log("Base directory at " + current_dir);
