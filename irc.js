var server_URL = "www.ircgateway.com/irc.lua";

var wsUri = (window.location.protocol == "https:" ? "wss" : "ws") + "://" + server_URL;
var eMsg = "";
var output;
var pInput = "";
var bSent = 0;
var bReceived = 0;
var bURL = "Console";
var bSecs = 0;
var channels = new Array();
var currentChannel = "@server";
var online = false;
var username;
var isReady = 0;

Date.prototype.format = function(format)
{
  var o = {
    "M+" : this.getMonth()+1, //month
    "d+" : this.getDate(),    //day
    "h+" : this.getHours(),   //hour
    "m+" : this.getMinutes(), //minute
    "s+" : this.getSeconds(), //second
  }

  if(/(y+)/.test(format)) format=format.replace(RegExp.$1,
    (this.getFullYear()+"").substr(4 - RegExp.$1.length));
  for(var k in o)if(new RegExp("("+ k +")").test(format))
    format = format.replace(RegExp.$1,
      RegExp.$1.length==1 ? o[k] :
        ("00"+ o[k]).substr((""+ o[k]).length));
  return format;
}

function nameSort(a, b) {
    if (a.class !== undefined) {
        if (a.class < b.class) return 1;
        else if (a.class > b.class) return -1;
        else {
            if (a['name'].toLowerCase() < b['name'].toLowerCase()) return -1;
            if (a['name'].toLowerCase() > b['name'].toLowerCase()) return 1;
            return 0;
        }
    }
    if (a.type !== undefined) {
        if (a.type < b.type) return 1;
        else if (a.type > b.type) return -1;
        else {
            if (a['name'].toLowerCase() < b['name'].toLowerCase()) return -1;
            if (a['name'].toLowerCase() > b['name'].toLowerCase()) return 1;
            return 0;
        }
    }
    else {
        if (a['name'].toLowerCase() < b['name'].toLowerCase()) return -1;
        if (a['name'].toLowerCase() > b['name'].toLowerCase()) return 1;
        return 0;
    }
  }

function getChannel(name) {
  name = name.toLowerCase()
  for (c in channels) {
    if (channels[c].lname == name) {
      //writeToScreen("Found " + channels[c].name + " in list of channels");
      return channels[c];
    }
  }
  //writeToScreen(name + " wasn't in the channels list :(");
  return null;
}

function addChannel(name) {
  var channel = getChannel(name);
  if (channel == null) {
    var cl = 0;
    if (name.match(/^#/)) cl = 1;
    if (name.match(/^@/)) cl = 2;
    channel = {
                'name': name,
                'lname': name.toLowerCase(),
                'topic': null,
                'active': true,
                'ping': 0,
                'users': new Array(),
                'lines': new Array(),
                'class': cl
              };
    channels.push(channel);
    //writeToScreen("Added " + channel.name + " to list of channels");
  }
  return channel;
}

function removeChannel(name) {
  name = name.toLowerCase()
  for (c in channels) {
    if (channels[c].lname == name) {
      channels.splice(c, 1);
    }
  }
}

function partChannel(name) {
  var channel = getChannel(name);
  if (channel) {
    channel.active = false;
  }
}

function renameChannel(oldName, newName) {
  var channel = getChannel(oldName);
  if (channel) {
    channel.name = newName;
    channel.lname = newName.toLowerCase();
  }
}

function joinChannel(name) {
  var channel = getChannel(name);
  if (!channel) {
    channel = addChannel(name);
  }
  if (channel) {
    channel.active = true;
    channel.ping = 0;
    channel.users = new Array();
  }
}

function addUser(chan, name, flags) {
  var channel = getChannel(chan);
  if (!channel) {
    channel = addChannel(chan);
  }
  var lname = name.toLowerCase()
  //writeToScreen("Going to add " + name + " to the list on " + channel.name);
  if (channel) {
    var found = false;
    for (u in channel.users) {
      if (channel.users[u].lname == lname) {
        found = true;
        if (flags && flags != "") {
          setUserFlags(chan, name, flags);
        }
        break;
      }
    }
    if (found == false) {
      var cl = 0;
      if (flags.match(/v/i)) cl = 1;
      if (flags.match(/o/i)) cl = 2;
      var user = {
        'name': name,
        'lname': lname,
        'id': '@',
        'flags': flags ? flags : "",
        'class': cl
      }
      channel.users.push(user);
      //writeToScreen("Pushed " + user.name + " to the list on " + channel.name);
    }
  }
}

function setUserFlags(chan, name, flags) {
  var channel = getChannel(chan);
  var lname = name.toLowerCase()
  if (channel) {
    var found = false;
    for (u in channel.users) {
      if (channel.users[u].lname == lname) {
        var user = channel.users[u];
        var minus = flags.match(/-([a-zA-Z]+)/);
        if (minus) {
          var letters = minus[1];
          for (l in letters) {
            user.flags.replace(l, "");
          }
        }
        var plus = flags.match(/\+([a-zA-Z]+)/);
        if (plus) user.flags += plus[1];
        var cl = 0;
        if (flags.match(/v/i)) cl = 1;
        if (flags.match(/o/i)) cl = 2;
        user.class = cl;
      }
    }
  }
}

function removeUser(chan, name) {
  var channel = getChannel(chan);
  var lname = name.toLowerCase()
  if (channel) {
    for (u in channel.users) {
      if (channel.users[u].lname == lname) {
        channel.users.splice(u, 1);
        break;
      }
    }
  }
}

function renameUser(oldName, newName) {
  var lname = oldName.toLowerCase();
  for (c in channels) {
    var channel = channels[c];
    for (u in channel.users) {
      if (channel.users[u].lname == lname) {
        channel.users[u].name = newName;
        channel.users[u].lname = newName.toLowerCase();
        break;
      }
    }
  }
}


function changeChannelClick(event) {
  if (event.target.getAttribute('data-irc')) {
    currentChannel = event.target.getAttribute('data-irc');
    var channel = getChannel(currentChannel);
    if (!channel) {
      channel = addChannel(currentChannel);
      channel.ping = 0;
    }
  }
  updateView();
  document.getElementById('inputBox').focus();
}

function updateView(ignoreMessages) {
  var channelListObject = document.getElementById('channels');
  var userListObject = document.getElementById('users');
  
  // Get the channel object, abort if not found
  var channel = getChannel(currentChannel);
  if (!channel) {
    return;
  }
  channel.ping = 0;
  
  // Reset channel and user lists
  channelListObject.innerHTML = "";
  userListObject.innerHTML = "";
  
  // If this is a channel being updated, also update the user list object
  if (currentChannel.match(/^#/)) {
    channel.users.sort(nameSort); // Sort user list
    var list = document.createElement('ul');
    for (u in channel.users) {
      var user = channel.users[u];
      var el = document.createElement('li');
      el.innerHTML = user.name;
      el.className = "user_normal";
      if (user.class == 2) {
          el.className = "user_operator";
      }
      if (user.class == 1) {
          el.className = "user_voiced";
      }
      el.style.cursor = "pointer";
      el.setAttribute('data-irc', user.name);
      el.onclick = changeChannelClick;
      el.title = user.id;
      list.appendChild(el);
    }
    userListObject.appendChild(list);
  }
  
  // Update the list of channels/users
  channels.sort(nameSort);
  var list = document.createElement('ul');
  for (c in channels) {
    var channel = channels[c];
    if (channel.class < 3 && channel.active == 1) {
      var el = document.createElement('li');
      el.innerHTML = channel.name;
      el.setAttribute('data-irc', channel.name);
      if (channel.class == 2) { el.className = "server"; el.innerHTML = bURL; }
      if (channel.class == 1) el.className = "user_channel";
      if (channel.class == 0) el.className = "user_normal";
      if (channel.lname == currentChannel.toLowerCase()) {
        el.className += "_selected";
      }
      el.style.cursor = "pointer";
      el.onclick = changeChannelClick;
      el.tooltip = channel.name;
      if (channel.ping == 1) el.style.color = "blue";
      if (channel.ping == 2) { el.style.color = "orange"; el.style['font-weight'] = "bold"; }
      list.appendChild(el);
    }
  }
  channelListObject.appendChild(list);
  

  // Update title
  var channel = getChannel(currentChannel);
  var caption = document.getElementById('caption');
  var topic = (channel.topic != null) ? channel.topic : "(fetching topic and user list, please wait...)";
  if (channel.name.match(/^#/)) {
      caption.innerHTML = "<h4>Speaking in " + channel.name + ": " + topic + "</h4>";
  }
  else {
      caption.innerHTML = "<h4>Private query with " + channel.name + ":</h4>";
  }
  
  // Update messages unless told not to
  if (!ignoreMessages) {
    var html = document.getElementById('messages');
    html.innerHTML = "";
    var channel = getChannel(currentChannel);
    html.innerHTML = channel.lines.join("<br/>\n") + "<br/>";
    html.scrollTop = html.scrollHeight;
  }
}
    
function updateStats() {
  var stats = document.getElementById('stats');
  var diff = ((new Date()).getTime() - bSecs)/1000;
  var kbsent = Math.floor(bSent/1024);
  var kbrec = Math.floor(bReceived/1024);
  var kbsec = Math.floor((bSent+bReceived) / diff);
  stats.innerHTML = "<small><kbd>Connected to " + bURL + " as " + username + " (via " + wsUri + ") - sent: " + kbsent + "kb, received: " + kbrec + "kb (" + kbsec + " bytes/sec)</kbd></small>";
}
  
function connectToIRC(form) {
  isReady = 0;
  currentChannel = "@server";

  websocket = new WebSocket(wsUri);
  websocket.onopen = function(evt) { onOpen(evt, form) };
  websocket.onclose = function(evt) { onClose(evt) };
  websocket.onmessage = function(evt) { onMessage(evt) };
  websocket.onerror = function(evt) { onError(evt) };
  bURL = form.server.value;
  bSent = 0;
  bReceived = 0;
  bSecs = (new Date()).getTime();
}

function onOpen(evt, form) {
  pushToScreen("@server", 'NOTICE', null, "CONNECTED TO " + wsUri);
  sendToSocket(form.server.value);
  sendToSocket(form.username.value);
}

function onClose(evt) {
  pushToScreen("@server", 'NOTICE', null, "DISCONNECTED FROM " + wsUri);
  document.getElementById('light').style.display='block';
  document.getElementById('fade').style.display='block';
  document.getElementById('emsg').innerHTML = eMsg;
}

function sendToSocket(args) {
  websocket.send(args);
  bSent += args.length;
  updateStats();
}

function pingBack() {
  sendToSocket("    ");
}

var mIRC = new Array('white', 'black', 'navy', 'green', 'red', 'maroon', 'purple', 'orange', 'yellow', 'lime', 'teal', 'aqua', 'blue', 'pink', 'grey', 'silver');

function colorise(str, color) {
    color = mIRC[parseInt(color)];
    return "<span style='color: " + color + "';>";
}
function toURL(str, url) {
    return '<a href="' + url + '" target="_blank">' + url + '</a>';
}

function pushToScreen(chan, type, sender, msg) {
  var now = new Date().format("<kbd>[hh:mm:ss]</kbd>");
  var fmsg = "";
  var colors = new Array('#e90d7f','#8e55e9', '#b30e0e', '#17b339', '#58afb3', '#9d54b3', '#b39775', '#3176b3', '#e90d7f', '#8e55e9', '#b30e0e');
  chan = (chan ? chan : "@server").toLowerCase();
  var channel = getChannel(chan);
  if (!channel) {
    channel = getChannel("@server");
  }
  
  // Color nick names
  if (sender) {
      var color = 1;
      for (i in sender) {
          color = (color + sender.charCodeAt(i)) % colors.length;
      }
      sender = '&lt;<font color="' + colors[color] + '"><kbd>' + sender + "</kbd></font>&gt;";
  }
  
  // Actions
  if (msg.match(/^\x01?ACTION/)) {
      type = "ACTION";
      msg = msg.replace(/^\x01?ACTION\s/, "");
  }
  
  // Colorise messages
  if (msg) {
      msg = msg.replace(/</, "&lt;");
      msg = msg.replace(/(([a-z]+):\/\/[\w\-_]+(\.[\w\-_]+)+([\w\-\.,@?^=%&amp;:/~\+#]*[\w\-\@?^=%&amp;/~\+#])?)/, toURL);
      msg = msg.replace(/\x03(\d+)/g, colorise);
      msg = msg.replace(/\x03/g, "</span>");
      msg = msg.replace(/\x02/g, "<span style='font-weight: bold;'>");
      msg = msg.replace(/\x1f/g, "<span style='text-decoration: underline;'>");
      msg = msg.replace(/\x0f/g, "</span>");
  }
  
  // Self notifications
  if (new RegExp("\\b" + username + "\\b", "g").test(msg) && (!sender || sender != username)) {
    channel.ping = 2;
      var ping = document.getElementById('ping');
      if (ping) {
          ping.play();
      }
      msg = "<span style='border: 1px dashed #E70; color: orange; font-weight: bold;'>" + msg + "</span>";
  }
  
  if (type == "NOTICE") {
      fmsg = '<div style="width: 85px; float: left;">'+now+'</div><div style=" float: left;width: 150px; padding-right: 5px;">&nbsp;</div><div style="width: calc(100% - 250px);float: left;"><kbd><span style="color: blue;"> ' + msg + '</span></kbd></div>';
  }
  else if (type == "JOIN") {
      fmsg = '<div style="width: 85px; float: left;">'+now+'</div><div style=" float: left;width: 150px; padding-right: 5px;">&nbsp;</div><div style="width: calc(100% - 250px);float: left;"><kbd><span style="color: green;">You joined the channel</span></kbd></div>';
  }
  else if (type == "MISC") {
      fmsg = '<div style="width: 85px; float: left;">'+now+'</div><div style=" float: left;width: 150px;" padding-right: 5px;>&nbsp;</div><div style="width: calc(100% - 250px);float: left;"><kbd><span style="color: green;">' + msg + '</span></kbd></div>';
  }
  else if (type == "ACTION") {
      fmsg = '<div style="width: 85px; float: left;">'+now+'</div><div style=" float: left;width: 150px; padding-right: 5px;">&nbsp;</div><div style="width: calc(100% - 250px);float: left;"><kbd><span style="color: teal;"><b><i>' + sender + ' ' + msg + '</i></b></span></kbd></div>';
  }
  else if (type == "PART") {
      fmsg = '<div style="width: 85px; float: left;">'+now+'</div><div style=" float: left;width: 150px; padding-right: 5px;">&nbsp;</div><div style="width: calc(100% - 250px);float: left;"><kbd><span style="color: purple;">Left ' + msg + '</span></kbd></div>';
  }
  else if (type == "CHANMSG") {
      fmsg = '<div style="width: 85px; float: left;">'+now+'</div><div style=" float: left;width: 150px; text-align: right; padding-right: 5px;">'+sender+'</div><div style="width: calc(100% - 250px);float: left;"><kbd><span style="color: black;">' + msg + '</span></kbd></div>';
  }
  else if (type == "PRIVMSG") {
      fmsg = '<div style="width: 85px; float: left;">'+now+'</div><div style=" float: left;width: 150px; text-align: right; padding-right: 5px;">'+sender+'</div><div style="width: calc(100% - 250px);float: left;"><kbd><span style="color: red;">' + msg + '</span></kbd></div>';
  }
  fmsg = '<div style="float: left; clear: both; width: 100%;">' + fmsg + "</div>\n";
  
  
  channel.lines.push('<kbd>' + fmsg + '</kbd>');
  if (chan == currentChannel) { writeToScreen(fmsg); }
  
  
  
}


function onMessage(evt) {
  bReceived += evt.data.length;
  updateStats();
  
  // Add to the raw message view unless it's something we already knew about
  if (!evt.data.match(/^(   |RECV   |PONG)/)) {
      document.getElementById('raw').value += evt.data + "\n";
  }
  
  // Split into message type and the message itself
  var type, msg;
  var arr = evt.data.match(/^([A-Z]+) (.+)$/);
  if (arr) {
      type = arr[1];
      msg = arr[2];
  }
  
  // Start doing the pings to keep the connection alive
  if (evt.data == 'STARTPING') {
      online = true;
      setInterval(pingBack, 2000);
      return;
  }
  
  // We joined a channel, yay
  if (type && type == 'JOIN') {
      currentChannel = msg;
      joinChannel(msg);
      pushToScreen(currentChannel, 'JOIN', null, currentChannel);
      updateView();
  }
  
  // Nick change
  if (type && type == 'NICK') {
      username = msg;
  }
  
  // We parted a channel
  if (type && type == 'PART') {
    if (msg != "@server") {
      partChannel(msg);
      if (msg == currentChannel) {
        currentChannel = "@server";
      }
      updateView();
      pushToScreen(null, 'PART', null, msg);
    }
  }
  
  // A server notice
  if (type && type == "NOTICE") {
      pushToScreen(null, 'NOTICE', null, msg);
  }
  
  // A message for a channel
  if (type && type == "CHANMSG") {
      var chan, sender, text;
      var arr = msg.match(/^(\S+) (\S+) (.+)$/);
      chan = arr[1];
      sender = arr[2];
      text = arr[3];
      var channel = getChannel(chan);
      if (!channel) {
        channel = addChannel(chan);
        pushToScreen(chan, 'JOIN', null, chan);
      }
      pushToScreen(chan, 'CHANMSG', sender, text);
      if (channel.ping == 0) channel.ping = 1;
      if (new RegExp("\\b" + username + "\\b", "g").test(text)) channel.ping = 2;
      updateView(true);
  }
  
  // A private message
  if (type && type == "PRIVMSG") {
      var chan, sender, text;
      var arr = msg.match(/^(\S+) (.+)$/);
      sender = arr[1];
      text = arr[2];
      var channel = getChannel(sender);
      if (channel && channel.name != sender) renameChannel(sender, sender);      
      if (!channel) {
          channel = addChannel(sender);
      }
      pushToScreen(sender, 'CHANMSG', sender, text);
      if (channel.ping == 0) channel.ping = 1;
      if (new RegExp("\\b" + username + "\\b", "g").test(text)) channel.ping = 2;
      updateView(true);
  }
  
  // A private message from us to another
  if (type && type == "TO") {
      var recipient, text;
      var arr = msg.match(/^(\S+) (.+)$/);
      recipient = arr[1];
      text = arr[2];
      var channel = getChannel(recipient);
      if (!channel) channel = addChannel(recipient);
      pushToScreen(recipient, 'CHANMSG', username, text);
      updateView();
  }
  
  // A server command
  if (type && type == "CMD") {
      var arr = msg.match(/^(\S+) (\S+) (\S+)\s?(.*)$/);
      var cmd = arr[1];
      var chan = arr[2];
      var usr = arr[3];
      var params = arr[4];
      var channel = getChannel(chan);
      if (!channel) {
        channel = getChannel("@server");
      }
      if (channel) {
        
        // Topic change
        if (cmd == 'TOPIC') {
            params = params.replace(/^:/, "");
            pushToScreen(chan, 'MISC', null, usr + " changed the topic to: " + params);
            channel.topic = params;
            updateView(true);
            return;
        }
        
        // Someone joined
        if (cmd == 'JOIN') {
            pushToScreen(chan, 'MISC', null, usr + " joined the channel.");
            addUser(chan, usr, "");
            updateView(true);
            return;
        }
        
        // Someone left
        if (cmd == 'PART') {
            params = params.replace(/^:/, "");
            pushToScreen(chan, 'MISC', null, usr + " left the channel (" + params + ").");
            removeUser(chan, usr);
            updateView(true);
            return;
        }
        
        // Someone got kicked (was it us?)
        if (cmd == 'KICK') {
            var arr = params.match(/(\S+)\s:?(.*)$/)
            var target = arr[1];
            var reason = arr[2];
            pushToScreen(chan, 'MISC', null, usr + " kicked " + target + " from the channel (" + reason + ").");
            removeUser(chan, target);
            if (target == username) {
              var channel = getChannel(chan);
              if (chan) {
                channel.active = false;
                pushToScreen("@server", 'NOTICE', null, usr + " kicked you from the " + chan + " (" + reason + ").");
                updateView();
              }
            }
            updateView(true);
            return;
        }
        
        // A server notice
        if (cmd == 'NOTICE') {
            pushToScreen(currentChannel, 'NOTICE', null, params);
            pushToScreen("@server", 'NOTICE', null, params);
        }
        
        // Mode change for a user
        if (cmd == 'MODE') {
            pushToScreen(chan, 'MISC', null, usr + " set mode " + params);
            var arr = params.match(/([+-][vob]+) (\S+)/i);
            if (arr) {
                var flags = arr[1].toLowerCase();
                var usr = arr[2];
                setUserFlags(chan, usr, flags);
            }
            updateView(true);
            return;
        }
        
        // Someone quit
        if (cmd == 'QUIT') {
            params = params.replace(/^:/, "");
            for (c in channels) {
                var channel = channels[c];
                for (u in channel.users) {
                  if (channel.users[u].lname == usr.toLowerCase()) {
                      removeUser(channel.name, usr);
                      pushToScreen(channel.name, 'MISC', null, usr + " quit (" + params + ").");
                      break;
                  }
              }
            }
            updateView(true);
            return;
        }
        
        // Nick change
        if (cmd == 'NICK') {
          params = params.replace(/^:/, "");
          if (usr == username) {
              username = params;
              pushToScreen(currentChannel, 'MISC', null, "You are now known as " + params);
              pushToScreen("@server", 'MISC', null, "You are now known as " + params);
          }
          for (c in channels) {
            var cname = channels[c].lname;
            if (cname.match(/^#/)) {
              for (i in channels[c].users) {
                var user = channels[c].users[i];
                if (user.name == usr && user.name != username) {
                  pushToScreen(cname, 'MISC', null, usr + " changed name to " + params);
                }
              }
            } 
          }
          renameUser(usr, params);
          if (currentChannel == usr) {
            currentChannel = params;
          }
          updateView(true);
          return;
        }
    }
  }
  
  // Server code stuffs
  if (type && type == "SRV") {
      var arr = msg.match(/(\S+) (\d+) (.+)$/);
      var srv = arr[1];
      var code = arr[2];
      var params = arr[3];
      if (code == '372') {
          params = params.replace(/^\s*\S+ :/, "");
          pushToScreen("@server", 'NOTICE', null, params);
      }
      if (code == '433') {
          params = params.replace(/^\s*\S+ :/, "");
          pushToScreen(null, 'NOTICE', null, "Nickname already in use! Please use /nick [newnickname] to change to a different nick.");
      }
      if (code == '404') {
          params = params.replace(/^\s*\S+ :/, "");
          pushToScreen(null, 'NOTICE', null, params);
      }
      if (code == '432') {
          params = params.replace(/^\s*\S+ :/, "");
          pushToScreen(null, 'NOTICE', null, "Erroneous nickname used! Please use /nick [newnickname] to change to a different nick.");
      }
      if (code == '353') {
          var ulist = params.match(/(#\S+) :?(.+)$/);
          var chan = ulist[1];
          var theList = ulist[2];
          var users = theList.split(/ /);
          for (i in users) {
              var arr = users[i].match(/^([@+]*)/);
              var flags = ""
              if (arr) {
                flags = arr[1];
                flags = flags.replace(/\+/, "v");
                flags = flags.replace(/@/, "o");
              }
              var usr = users[i].replace(/^[@+]/, "");
              addUser(chan, usr, flags);
          }
          updateView(true);
      }
      if (code == "332") {
          var ulist = params.match(/(#\S+) :(.+)$/);
          var chan = ulist[1];
          var topic = ulist[2];
          var channel = getChannel(chan);
          if (channel) {
            channel.topic = topic;
          }
          updateView(true);
      }
      if (code == "376" && isReady == 0) {
          sendToSocket("JOIN #IRCGateway");
          isReady = 1;
      }
  }
  if (type && type == "RAW") {
    var arr = msg.match(/^\:([^!]+)\!(\S+) [A-Z]+/);
    if (arr) {
      var nick = arr[1].toLowerCase();
      var id = arr[2];
      for (c in channels) {
        for (u in channels[c].users) {
          if (channels[c].users[u].lname == nick) {
            channels[c].users[u].id = id;
          }
        }
      }
      updateView(true);
    }
  }
}

  function onError(evt)
  {
    for (c in channels) {
      if (channels[c].name != "@server") {
        channels[c].active = false;
      }
    }
    writeToScreen('<span style="color: red;">ERROR:</span> ' + evt.data);
  }

  function doSend(message)
  {
    
    var tmpc = currentChannel;
    if (!online) {
        sendToSocket(message);
        return;
    }
    var passThrough = true;
    if (message.match(/^\//)) {
        var arr = message.match(/^\/([a-z]+)/i);
        if (arr) {
            var cmd = arr[1];
            if (cmd == 'me') {
                message = message.replace(/^\/me\s/i, "");
                message = "\x01" + "ACTION " + message + "\x01";
            }
            // CS and NS aliases
            else if (cmd == 'cs') {
                message = message.replace(/^\/cs\s/i, "");
                tmpc = "ChanServ";
            }
            else if (cmd == 'ns') {
                message = message.replace(/^\/ns\s/i, "");
                tmpc = "NickServ";
            }
            
            else if (cmd == 'raw') {
                document.getElementById('raw').style.display = "block";
                document.getElementById('raw').style.height = "100px";
                return;
            }
            else if (cmd == 'msg') {
                var arr = message.match(/^\/msg (\S+) (.+)$/);
                if (arr) {
                    message = message.replace(/^\/msg (\S+) /, "");
                    tmpc = arr[1];
                }
            }
            else if (cmd == 'topic') {
                var arr = message.match(/^\/topic (.+)$/);
                if (arr) {
                    message = message.replace(/^\/topic\s/, "");
                    sendToSocket("TOPIC " + currentChannel + " :" + message);
                    return;
                }
            }
            else if (cmd == 'join') {
                var arr = message.match(/^\/join (\S+)/);
                if (arr) {
                    var channel = getChannel(arr[1]);
                    if (channel && channel.active == 1) {
                      pushToScreen(channel, 'NOTICE', null, "You are already in that channel!");
                      return;
                    }
                    sendToSocket("JOIN " + arr[1]);
                    return;
                }
            }
            else {
              if (cmd == 'server') {
                var arr = message.match(/^\/server\s?([^:]+):?/)
                if (arr) {
                  bURL = arr[1];
                }
                for (c in channels) {
                  if (channels[c].name != "@server") {
                    channels[c].active = false;
                  }
                }
                currentChannel = "@server";
                updateView();
              }
                var arr = message.match(/^\/([a-zA-Z]+)\s?(.*)$/)
                if (arr) {
                    cmd = arr[1].toUpperCase();
                    var params = arr[2];
                    if (cmd == 'PART' && (!params || params == "")) {
                        params = tmpc;
                    }
                    sendToSocket(cmd + " " + params);
                }
                return;
            }
        }
    }
    message = "PRIVMSG " + tmpc + " :" + message;
    sendToSocket(message);
  }

  function writeToScreen(message)
  {
    var output = document.getElementById('messages');
    var pre = document.createElement("kbd");
    pre.style.wordWrap = "break-word";
    pre.innerHTML = message + "<br/>";
    output.appendChild(pre);
    output.scrollTop = output.scrollHeight;
  }

var form = document.getElementById('cmd');

function processForm(e) {
    if (e.preventDefault) e.preventDefault();
    pInput = form.line.value;
    doSend(form.line.value);
    form.line.value = ""
    form.line.focus();
    return false;
}

if (form.attachEvent) {
    form.attachEvent("submit", processForm);
} else {
    form.addEventListener("submit", processForm);
}

function keyHandler(obj,e) {
    var TABKEY = 9;
    if(e.keyCode == TABKEY) {
        var lastWord = obj.value.match(/(\S+)$/);
        var channel = getChannel(currentChannel);
        if (lastWord && channel) {
            var word = lastWord[1].toLowerCase();
            obj.value = obj.value.substring(0, obj.value.length - word.length);
            for (i in channel.users) {
                var usr = channel.users[i].lname;
                if (usr.length >= word.length && usr.substring(0, word.length) == word) {
                    obj.value += channel.users[i].name;
                    break;
                }
            }
        }
        if(e.preventDefault) {
            e.preventDefault();
        }
        return false;
    }
    // up key: show last message
    if(e.keyCode == 38) {
        obj.value = pInput;
    }
    return true;
}
    
addChannel("@server");
//updateView();