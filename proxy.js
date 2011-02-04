var http = require('http'),
    fs   = require('fs'),
    url  = require('url');

var config = {
  listenPort: 8989,
  filterLists: ['easylist.txt']
};

var whitelist = null;
var blacklist = null;

var logColors = {
  1: 36, // cyan
  2: 32, // green
  3: 33, // yellow
  4: 35, // magenta
  5: 31  // red
};

var colorize = function(color, str){
  return "\u001b[" + color + "m" + str + "\u001b[0m";
};

var log = function(ip, code, method, url, message){
  var statusClass = parseInt(code / 100, 10);
  if (message) {
    message = "=> " + message;
  }
  console.log(colorize(logColors[statusClass],
    [ip, code, method, url, message].join(" ")
  ));
};

var callback = function(uReq, uRes) {
  var ip = uReq.connection.remoteAddress;

  if (!uReq.url.match(whitelist) && uReq.url.match(blacklist)) {
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
  return text.replace(/[\-\[\]{}()*+?.,\\\^$|#\s]/g, "\\$&");
};

var parseFilterList = function(path){
  var lines = fs.readFileSync(path, 'utf-8').trim().split(/\n+/);
  var blEntries = [];
  var wlEntries = [];
  for (var i=0; i < lines.length; i++) {
    var line = lines[i];
    if (!line.match(/^[!\[]|#/)) { // ignore comments, DOM rules and whitelisting
      var isWl = false;
      if (line.match(/^@@/)) {
        line = line.slice(2);
        isWl = true;
      }
      var re = regexpEscape(line).
               replace(/\\\*/, '.*'). // * => .*
               replace(/\\\^|\\\|\\\||\\\$.*/g, ''); // ignore ^ and || and $anything
      if (isWl) {
        wlEntries.push(re);
      } else {
        blEntries.push(re);
      }
    }
  }
  var append = function(list, entries){
    return ((list === null) ? '' : list + '|') + entries.join('|');
  };
  blacklist = append(blacklist, blEntries);
  whitelist = append(whitelist, wlEntries);
  console.log('Loaded ' + path);
};

var loadFilterLists = function(){
  blacklist = null;
  whitelist = null;
  for (var i = 0; i < config.filterLists.length; i++) {
    parseFilterList(config.filterLists[i]);
  }
};

http.createServer(callback).listen(config.listenPort);

loadLists();
process.on('SIGUSR1', function(){
  loadLists();
  console.log('Reloaded lists');
});
loadFilterLists();
process.on('SIGUSR1', loadFilterLists);

http.createServer(callback).listen(config.listenPort);
