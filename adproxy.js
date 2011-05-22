var http = require('http');
var fs = require('fs');
var url = require('url');
var sys = require('sys');
var optparse = require('optparse');

var SUPPORTED_METHODS = ['GET', 'POST', 'HEAD', 'PUT', 'DELETE'];

var config = {
  listenPort: 8989,
  filterLists: [],
  quiet: false
};

var whitelist, blacklist, refSpoof, uaSpoof;

var resetRules = function(){
  whitelist = null;
  blacklist = null;
  refSpoof  = [];
  uaSpoof   = [];
}

var log = function(ip, code, method, url, message){
  if (config.quiet) { return; }
  if (message) {
    message = "=> " + message;
  }
  console.log([ip, code, method, url, message].join(" "));
};

var callback = function(cReq, cRes) {
  var ip = cReq.connection.remoteAddress;

  if (!cReq.url.match(whitelist) && cReq.url.match(blacklist)) {
    log(ip, 403, cReq.method, cReq.url, 'Blacklisted');
    cRes.writeHead(403);
    cRes.end();
    return;
  }

  if (SUPPORTED_METHODS.indexOf(cReq.method) < 0) {
    log(ip, 501, cReq.method, cReq.url, 'Unsupported');
    cRes.writeHead(501);
    cRes.end();
    return;
  }

  var reqUrl = url.parse(cReq.url);
  var proxy = http.createClient(reqUrl.port || 80, reqUrl.hostname);
  proxy.on('error', function(err){
    log(ip, 500, cReq.method, cReq.url, err);
    cRes.writeHead(500);
    cRes.end();
  });

  var headers = cReq.headers;

  var spoof = function(rules, header){
    rules.forEach(function(r){
      if (cReq.url.match(r[0])) {
        headers[header] = r[1];
      }
    });
  };

  spoof(refSpoof, 'referer');
  spoof(uaSpoof, 'user_agent');

  var path = reqUrl.pathname + (reqUrl.search || '');
  var pReq = proxy.request(cReq.method, path, headers);
  pReq.addListener('response', function(pRes) {
    log(ip, pRes.statusCode, cReq.method, cReq.url, pRes.headers.location);
    pRes.addListener('data', function(chunk) {
      cRes.write(chunk, 'binary');
    });
    pRes.addListener('end', function() {
      cRes.end();
    });
    cRes.writeHead(pRes.statusCode, pRes.headers);
  });
  cReq.addListener('data', function(chunk) {
    pReq.write(chunk, 'binary');
  });
  cReq.addListener('end', function() {
    pReq.end();
  });
};

var regexpEscape = function(text){
  return text.replace(/[\-\[\]{}()*+?.,\\\^$|#\s]/g, "\\$&");
};

var regexpFromLine = function(line){
  return regexpEscape(line).
         replace(/\\\*/, '.*'). // * => .*
         replace(/\\\^|\\\|\\\||\\\$.*/g, ''); // ignore ^ and || and $anything
};

var parseFilterList = function(path){
  var lines = fs.readFileSync(path, 'utf-8').trim().split(/\n+/);
  var blEntries = [];
  var wlEntries = [];

  lines.forEach(function(line){
    if (line.match(/^!ref\|/)) {
      var parts = line.split(/\|/);
      refSpoof.push([parts[1], parts[2]]);
    } else if (line.match(/^!ua\|/)) {
      var parts = line.split(/\|/);
      uaSpoof.push([parts[1], parts[2]]);
    } else if (!line.match(/^[!\[]|#/)) { // ignore comments, DOM rules and whitelisting
      if (line.match(/^@@/)) {
        wlEntries.push(regexpFromLine(line.slice(2)));
      } else {
        blEntries.push(regexpFromLine(line));
      }
    }
  });

  var append = function(list, entries){
    return ((list === null) ? '' : list + '|') + entries.join('|');
  };

  blacklist = append(blacklist, blEntries);
  whitelist = append(whitelist, wlEntries);
  if (!config.quiet) { console.log('Loaded ' + path); }
};

var loadFilterLists = function(){
  resetRules();
  config.filterLists.forEach(function(list){
    parseFilterList(list);
  });
};

var switches = [
  ['-f', '--filter-list FILE', 'Use filter list file'],
  ['-h', '--help', 'Show this help'],
  ['-p', '--port NUMBER', 'Listen on specified port (default ' + config.listenPort + ')'],
  ['-q', '--quiet', 'Disable logging to stdout']
];

var parser = new optparse.OptionParser(switches);
parser.banner = 'Usage: node adproxy.js [options]';

parser.on('port', function(k, v){ config.listenPort = v; });
parser.on('filter-list', function(k, v){ config.filterLists.push(v); });
parser.on('help', function(){
  sys.puts(parser.toString());
  process.exit();
});
parser.on('quiet', function(){ config.quiet = true; });
parser.parse(process.argv);

loadFilterLists();
process.on('SIGUSR1', loadFilterLists);

http.createServer(callback).listen(config.listenPort);
