IRCGateway
==========

Browser-based IRC Client with Javascript + WebSockets on a httpd Backend.
Watch a live demo at <http://www.ircgateway.com>

## Server requirements: ##

- httpd 2.4.7 or later with mod_lua
- Lua 5.1/5.2
- LuaSocket

## Client requirements: ##

- Web Browser with CSS3 and WebSocket support


## Installation: ##

- Copy the files to your web site
- Change the WS:// URI in irc.js to match your site
- Enable mod_lua for .lua files. (`AddHandler lua-script .lua`)

Copyright(c) 2013, Daniel Gruno.
Licensed under the Apache License, version 2.0.
