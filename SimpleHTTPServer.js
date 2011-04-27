/**
 * A JavaScript version SimpleHTTPServer.
 */
var http = require('http'),
	port = 8000,
	urlParser = require('url'),
	fs = require('fs');

var cachedStat = {
    table: {},
    fileStatSync: function(path) {
        if (!cachedStat.table[path]) {
            cachedStat.table[path] = fs.statSync(path);
        }
        return cachedStat.table[path];
    },
    fileStat: function(path, callback) {
        if (cachedStat.table[path]) {
            callback(null, cachedStat.table[path]);
        } else {
            var cb = function(err, _stat) {
                if (!err) {
                    cachedStat.table[path] = _stat;
                    callback(err, _stat);
                }
            }
            fs.stat(path, cb);
        }
    }
};

http.createServer(function(request, response) {
	var urlObject = urlParser.parse(request.url, true);
	console.log("[" + (new Date()).toUTCString() + "] " + '"' + request.method + " " + urlObject.pathname + "\"");
	
	var filePath = __dirname + urlObject.pathname;
	cachedStat.fileStat(filePath, function(err, stats) {
		if (!err) {
			if (stats.isFile()) {
			    fs.readFile(filePath, function(err, data) {
			        if (!err) {
        				response.writeHead(200, {});
        				response.write(data);
        				response.end();
			        }
			    });
			} else if (stats.isDirectory()) {
				fs.readdir(filePath, function(error, files) {
					if (!error) {
            			response.writeHead(200, {'Content-Type': 'text/html'});
            			response.write("<!DOCTYPE html>\n<html><head><meta charset='UTF-8'><title>" + filePath + "</title></head><body>");
            			response.write("<h1>" + filePath + "</h1>");
            			response.write("<ul style='list-style:none;font-family:courier new;'>");
					    files.unshift(".", "..");
						files.forEach(function(item) {
						    var path = urlObject.pathname + item,
						        itemStats = cachedStat.fileStatSync(__dirname + path);
						    if (itemStats.isDirectory()) {
						        path += "/";
						        item += "/";
						    }
							response.write("<li><a href='" + path + "'>" + item + "</a></li>")
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
console.log("Base directory at " + __dirname);