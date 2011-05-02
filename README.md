adproxy
=======

An advert-blocking proxy that understands AdBlock Plus filters.

Usage
-----

Download one or more filters from [this list][1], then run:

    node adproxy.js -f easylist.txt

Set your browser to use `localhost` port 8989 as a proxy.

[1]: http://adblockplus.org/en/subscriptions

Send the `USR1` signal to the proxy server to reload filter lists.

What is supported
-----------------

* Partial matching
* Wildcards
* Whitelisting
* Multiple filter lists

What is not supported
---------------------

* Anchoring
* $-expressions
* Anything to do with DOM manipulation

Extensions
----------

Site-specific referrer spoofing (for permeable paywalls):

    !ref|wsj.com/|http://www.google.com/?q=wsj

Site-specific user agent spoofing:

    !ua|example.com/|User agent string

Prerequisites
-------------

* node.js
* optparse (`npm install optparse`)
