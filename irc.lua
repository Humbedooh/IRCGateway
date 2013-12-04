-- IRC test thingy
local socket = require "socket"
local IRCSocket = nil
local lastPing = os.time()

function handleMessage(r, line, usr)
    if line then
        -- Split up the sender name and his/her identity
        local sender, identity = line:match("^:([^%!]+)!.-@(%S+)")
        -- Check if this message is in a channel or a private one
        local channel = line:match("PRIVMSG (#%S+) :") or nil
        
        -- Parse line, optional command and recipient of command
        local channelLine = line:match("PRIVMSG #%S+ :(.+)") or ""
        local text = nil
        local recipient = nil
        if channel then
            recipient = channelLine:match("([^:,]+)[,:]%s+(.+)")
        end
        if not channel then recipient, text = line:match("PRIVMSG ([^ ]+) :(.+)") end
        local forMe = (sender and text and recipient:lower() == usr:lower())
        
        -- Write out as channel message or private message to browser client
        if channel then
            r:wswrite(( "CHANMSG %s %s %s"):format(channel, sender, channelLine))
        elseif sender and text then
            r:wswrite(( "PRIVMSG %s %s"):format(sender, text))
        end
    end
end

function handleInput(r, s, usr)
    local acceptedCommands = { "PRIVMSG", "JOIN", "PART", "TOPIC", "MODE", "QUIT", "NICK", "WHOIS" }
    local line = r:wsread()
    if line then
        r:wswrite("RECV " .. line)
    end
    if line and #line > 0 and line:match("^[A-Z]+") then
        line = line:gsub("[\r\n]", "")
        local cmd, params = line:match("^([A-Z]+)%s?(.*)$")
        
        
        local okay = false;
        for k, v in pairs(acceptedCommands) do
            if v == cmd then
                okay = true
                break
            end
        end        
        
        if not okay then
            r:wswrite("NOTICE Unknown or unaccepted command given!")
            return true
        end
        if cmd ~= "PRIVMSG" then
            if cmd == "JOIN" then
                r:wswrite("JOIN " .. params)
                s:send("JOIN " .. params .. "\r\n")
            elseif cmd == "PART" then
                r:wswrite("PART " .. params)
                s:send("PART " .. params .. "\r\n")
            elseif cmd == "QUIT" then
                r:wswrite("QUIT :IRCGateway with websockets and stuff! :o")
                s:send("QUIT :IRCGateway.com\r\n")
                s:close()
                IRCSocket = nil
                return false
            else
                s:send(line .. "\r\n")
            end
            return true
        end
        
        -- Messaging
        s:send(line .. "\r\n")
        
        -- Parse the input for relaying back
        local channel = params:match("^(#%S+) :") or nil
        -- Parse line, optional command and recipient of command
        local channelLine = params:match("#%S+ :(.+)") or ""
        local text = nil
        local recipient = nil
        if channel then
            recipient, text = channelLine:match("([^:,]+)[,:]%s+(.+)")
        end
        if not channel then recipient, text = params:match("([^ ]+) :(.+)") end
        if channel then
            r:wswrite(( "CHANMSG %s %s %s"):format(channel, usr, channelLine))
        elseif recipient and text then
            r:wswrite(( "PRIVMSG %s %s"):format(recipient, text))
        end
        
    -- Ping?
    elseif line and line:match("^%s+$") then
        lastPing = os.time()
        r:wswrite("PONG " .. os.time())
    -- No input? browser window closed?
    elseif not line and (lastPing < (os.time() - 10)) then
        r:wswrite("NOTICE Ping timeout, disconnecting")
        return false
    end
    return true
end

function readIRC(s, r, usr)
    while true do
        local receive, err = IRCSocket:receive('*l')
        local now = os.time()
        if receive then
            receive = receive:gsub("[\r]+", "") -- chop away \r if it somehow snuck in
            r:wswrite("RAW " .. receive)
            -- Ping? PONG!
            if string.find(receive, "PING :") then
                IRCSocket:send("PONG :" .. string.sub(receive, (string.find(receive, "PING :") + 6)) .. "\r\n\r\n")
            else
                -- private/channel messages
                if string.match(receive, ":([^!]+)!(%S+) PRIVMSG") then
                    handleMessage(r, receive, usr)
                elseif string.match(receive, "^%S+ ([A-Z]+) #%S+") then
                    local who, ident, cmd, channel, params = string.match(receive, "^:([^!]+)!(%S+) ([A-Z0-9]+) (#%S+)(.*)")
                    if params then params = params:gsub("^%s+:?", "") end
                    if cmd == "JOIN" and who == usr then
                        r:wswrite("JOIN " .. channel)
                    end
                    r:wswrite(("CMD %s %s %s %s"):format(cmd, channel, who, params or ""))
                elseif string.match(receive, "^%S+ ([A-Z]+) .+") then
                    local who, ident, cmd, params = string.match(receive, "^:([^!]+)!(%S+) ([A-Z]+) (.*)")
                    r:wswrite(("CMD %s #fakechannel %s %s"):format(cmd, who, params or ""))
                elseif string.match(receive, ":%S+ (%d+) .+") then
                    local server, code, params = string.match(receive, ":(%S+) (%d+) (.+)")
                    r:wswrite(("SRV %s %s %s"):format(server, code, params))
                else
                    r:wswrite("UNKNOWN " .. (recieve or ""))
                end
            end
        elseif err == "timeout" then
            if not handleInput(r, s, usr) then
                r:wswrite("NOTICE Bad connection?")
                break
            end
        elseif err == "closed" then
            r:wswrite("NOTICE IRC Server closed the connection.")
            break
        end
        
    end
end

function handle(r)
    if r:wsupgrade() then

        -- Get server to connect to
        local line = r:wsread() or "chat.freenode.net"
        local server, port = line:match("([-a-z0-9_.]+):?(%d*)$")
        if not port or port == "" then
            port = 6667
        end
        if not server then
            server = "chat.freenode.net"
        end
        
        -- Set up socket and outgoing IP
        local s = socket.tcp()
        IRCSocket = s
        s:settimeout(0.25)
        local b = 0
        math.randomseed(os.time())
        local okay = s:bind('46.4.102.180', math.random(1050,63000))
        while not okay do
            okay = s:bind('46.4.102.180', math.random(1050,63000))
            b = b + 1
            if b > 10 then
                break
            end
        end
        
        -- Connect to IRC
        r:wswrite(("NOTICE Connecting to %s (port %d)..."):format(server, port))
        local success, err = s:connect(socket.dns.toip(server), 6667)
        if not success then
            r:wswrite("Failed to connect: ".. err .. "\n")
            r:wsclose()
            return apache2.DONE
        end
        
        -- Fetch the username to use
        local usr = r:wsread()
        if not usr or (not usr:match("^%S+")) then
            usr = ("Guest" .. math.random(1000,99999))
        end
        s:send("USER " .. usr .. " " .. " " .. usr .. " " .. usr .. " " .. ":" .. usr .. "\r\n\r\n")
        s:send("NICK " .. usr .. "\r\n\r\n")
        
        r:wswrite("NICK " .. usr);
        r:wswrite(("NOTICE Connected as %s!"):format(usr))
        r:wswrite("NOTICE Use /join #channelname to join a channel!")
        r:wswrite("STARTPING")
        readIRC(s, r, usr)
        
        if IRCSocket then
            IRCSocket:send("QUIT :Page closed.\r\n\r\n")
            IRCSocket:close()
        end
        r:wswrite("NOTICE Thanks for using IRCGateway.com!")
        
        r:wsclose()
    else
        r.content_type = "text/plain"
        r:puts("This feature requires WebSockets!")
    end
    return apache2.DONE
end