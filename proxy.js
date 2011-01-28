var http = require('http'),
    fs   = require('fs'),
    url  = require('url');

var config = {
  listenPort: 8989,
  lists: []
};

var blacklist = null;

var logColors = {
  1: 36, // cyan
  2: 32, // green
  3: 33, // yellow
  4: 35, // magenta
  5: 31  // red
};

var log = function(ip, code, method, url, message){
  var statusClass = parseInt(code / 100, 10);
  var msg = "";
  if (message) {
    msg = "=> " + message;
  }
  console.log(
    "\033[" + logColors[statusClass] + "m" +
    [ip, code, method, url, msg].join(" ") +
    "\033[0m"
  );
};

var callback = function(uReq, uRes) {
  var ip = uReq.connection.remoteAddress;

  if (uReq.url.match(blacklist)) {
    log(ip, 403, uReq.method, uReq.url, 'Blacklisted');
    uRes.writeHead(403);
    uRes.end();
    return;
  }

  var reqUrl = url.parse(uReq.url);
  var proxy = http.createClient(reqUrl.port || 80, reqUrl.hostname);
  proxy.on('error', function(err){
    log(ip, 500, uReq.method, uReq.url, err);
    uRes.writeHead(500);
    uRes.end();
  });

  var headers = uReq.headers;
  var path = reqUrl.pathname + (reqUrl.search || '');
  var dReq = proxy.request(uReq.method, path, headers);
  dReq.addListener('response', function(dRes) {
    log(ip, dRes.statusCode, uReq.method, uReq.url, dRes.headers.location);
    dRes.addListener('data', function(chunk) {
      uRes.write(chunk, 'binary');
    });
    dRes.addListener('end', function() {
      uRes.end();
    });
    uRes.writeHead(dRes.statusCode, dRes.headers);
  });
  uReq.addListener('data', function(chunk) {
    dReq.write(chunk, 'binary');
  });
  uReq.addListener('end', function() {
    dReq.end();
  });
};

var regexpEscape = function(text){
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

var parseList = function(path){
  var lines = fs.readFileSync(path, 'utf-8').trim().split(/\n/);
  var entries = [];
  for (var i=0; i < lines.length; i++) {
    var line = lines[i];
    if (!line.match(/^[!\[]|#|@@/)) { // ignore comments, DOM rules and whitelisting
      var re = regexpEscape(lines[i]).
               replace(/\\\*/, '.*'). // * => .*
               replace(/\\\^|\\\|\\\||\\\$.*/g, ''); // ignore ^ and || and $anything
      entries.push(re);
    }
  }
  if (blacklist === null) {
    blacklist = entries.join('|');
  } else {
    blacklist += '|' + entries.join('|');
  }
};

parseList("easylist.txt");

http.createServer(callback).listen(config.listenPort);
