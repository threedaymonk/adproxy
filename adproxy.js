var http = require('http'),
    fs = require('fs'),
    url = require('url'),
    sys = require('sys'),
    optparse = require('optparse');

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
  console.log(
    [ip, code, method, url, message].join(" ")
  );
};

var callback = function(uReq, uRes) {
  var ip = uReq.connection.remoteAddress;

  if (!uReq.url.match(whitelist) && uReq.url.match(blacklist)) {
    log(ip, 403, uReq.method, uReq.url, 'Blacklisted');
    uRes.writeHead(403);
    uRes.end();
    return;
  }

  if (["GET", "POST", "HEAD", "PUT", "DELETE"].indexOf(uReq.method) < 0) {
    log(ip, 501, uReq.method, uReq.url, 'Unsupported');
    uRes.writeHead(501);
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

  var spoof = function(rules, header){
    rules.forEach(function(r){
      if (uReq.url.match(r[0])) {
        headers[header] = r[1];
      }
    });
  };

  spoof(refSpoof, 'referer');
  spoof(uaSpoof, 'user_agent');

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

  var regexpFromLine = function(line){
    return regexpEscape(line).
           replace(/\\\*/, '.*'). // * => .*
           replace(/\\\^|\\\|\\\||\\\$.*/g, ''); // ignore ^ and || and $anything
  };

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
