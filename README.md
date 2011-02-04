adproxy
=======

An advert-blocking proxy that understands AdBlock Plus filters.

Usage
-----

Download one or more filters from [this list][1], then run:

    node adproxy.js -f easylist.txt

Set your browser to use `localhost` port 8989 as a proxy.

[1]: http://adblockplus.org/en/subscriptions

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
