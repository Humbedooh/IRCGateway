-- IRC test thingy
local socket = require "socket"
local IRCSocket = nil
local provider = "example.com"
local lastPing = os.time()
_G.usr = "Foo"
local nick = ""

function handleMessage(r, line)
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
        
        -- Write out as channel message or private message to browser client
        if channel then
            r:wswrite(( "CHANMSG %s %s %s"):format(channel, sender, channelLine))
        elseif sender and text then
            r:wswrite(( "PRIVMSG %s %s"):format(sender, text))
        end
    end
end

function handleInput(r, s)
    local acceptedCommands = { "PRIVMSG", "JOIN", "PART", "TOPIC", "MODE", "QUIT", "NICK", "WHOIS", "QUOTE", "SERVER" }
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
                r:wswrite("JOIN " .. params:lower())
                s:send("JOIN " .. params:lower() .. "\r\n")
            elseif cmd == "QUOTE" then
                s:send(params:gsub("^%s+", "") .. "\r\n")
                r:wswrite("SENT " .. params:gsub("^%s+", ""))
                return true
            elseif cmd == "PART" then
                r:wswrite("PART " .. params:lower())
                s:send("PART " .. params .. "\r\n")
            elseif cmd == "QUIT" then
                r:wswrite(("QUIT :%s"):format(provider))
                s:send(("QUIT :%s\r\n"):format(provider))
                s:close()
                IRCSocket = nil
                return false
            elseif cmd == "SERVER" then
                s = server(r, params)
                return true
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
            r:wswrite(( "TO %s %s"):format(recipient, text))
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

function readIRC(s, r)
    while true do
        local receive, err = IRCSocket:receive('*l')
        local now = os.time()
        if receive then
            receive = receive:gsub("[\r]+", "") -- chop away \r if it somehow snuck in
            r:wswrite("RAW " .. receive)
            -- Ping? PONG!
            if string.find(receive, "PING :") then
                IRCSocket:send("PONG :" .. string.sub(receive, (string.find(receive, "PING :") + 6)) .. "\r\n\r\n")
            elseif receive:match("^%S+%s+NOTICE%s+") then
                r:wswrite(receive:match("^%S+%s+(.+)$"))
            else
                -- private/channel messages
                if string.match(receive, ":([^!]+)!(%S+) PRIVMSG") then
                    handleMessage(r, receive, usr)
                elseif string.match(receive, "^%S+ ([A-Z]+) #%S+") then
                    local who, ident, cmd, channel, params = string.match(receive, "^:([^!]+)!(%S+) ([A-Z0-9]+) (#%S+)(.*)")
                    -- server did something, not a user?
                    if not who then
                        who, cmd, channel, params = string.match(receive, "^:(%S+) ([A-Z0-9]+) (#%S+)(.*)")
                    end
                    if params then params = params:gsub("^%s+:?", "") end
                    if cmd == "JOIN" and who == usr then
                        --r:wswrite("JOIN " .. channel)
                    end
                    r:wswrite(("CMD %s %s %s %s"):format(cmd, channel, who, params or ""))
                elseif string.match(receive, "^%S+ ([A-Z]+) .+") then
                    local who, ident, cmd, params = string.match(receive, "^:([^!]+)!(%S+) ([A-Z]+) (.*)")
                    r:wswrite(("CMD %s #fakechannel %s %s"):format(cmd, who, params or ""))
                    if cmd == "NICK" and who == usr then
                        usr = params:gsub("^:", "")
                    end
                elseif string.match(receive, ":%S+ (%d+) .+") then
                    local server, code, params = string.match(receive, ":(%S+) (%d+) (.+)")
                    r:wswrite(("SRV %s %s %s"):format(server, code, params))
                    if code == "001" then
                        usr = params:match("(%S+)")
                    end
                    if code == "376" then
                        r:wswrite("NICK " .. usr)
                    end
                else
                    r:wswrite("UNKNOWN " .. (recieve or ""))
                end
            end
        elseif err == "timeout" then
            if not handleInput(r, IRCSocket, usr) then
                break
            end
        elseif err == "closed" then
            r:wswrite("NOTICE IRC Server closed the connection.")
            break
        end
        
    end
end

function server(r, line)
    if IRCSocket then
        IRCSocket:send("QUIT\r\n")
        IRCSocket:close()
    end
    local server, port = line:match("([-a-z0-9_.]+):?(%d*)$")
    if not port or port == "" then
        port = 6667
    end
    if not server then
        server = "chat.freenode.net"
    end
    local s = socket.tcp()
    IRCSocket = s
    s:settimeout(0.25)
    
    -- Connect to IRC
    r:wswrite(("NOTICE Connecting to %s (port %d)..."):format(server, port))
    local success, err = s:connect(socket.dns.toip(server), port)
    if not success then
        r:wswrite("Failed to connect: ".. err .. "\n")
        r:wsclose()
        return apache2.DONE
    end
    
    IRCSocket:send("USER " .. usr .. " " .. " " .. usr .. " " .. usr .. " " .. ":" .. usr .. "\r\n")
    IRCSocket:send("NICK " .. usr .. "\r\n")
    r:wswrite(("NOTICE Connected as %s!"):format(usr))
    r:wswrite("NOTICE Use /nick [nickname] to set your nick name before joining any channels!")
    return IRCSocket
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

        -- Connect to IRC
        
        r:wswrite(("NOTICE Connecting to %s (port %d)..."):format(server, port))
        local success, err = s:connect(socket.dns.toip(server), 6667)
        if not success then
            r:wswrite("Failed to connect: ".. err .. "\n")
            r:wsclose()
            return apache2.DONE
        end
        
        -- Fetch the username to use
        usr = r:wsread()
        if not usr or (not usr:match("^%S+")) then
            usr = ("Guest" .. math.random(1000,99999))
        end
        IRCSocket:send("USER " .. usr .. " " .. " " .. usr .. " " .. usr .. " " .. ":" .. usr .. "\r\n")
        IRCSocket:send("NICK " .. usr .. "\r\n")

        r:wswrite("NICK " .. usr);
        r:wswrite(("NOTICE Connected as %s!"):format(usr))
        r:wswrite("NOTICE Use /join #channelname to join a channel!")
        r:wswrite("STARTPING")
        readIRC(s, r)
        
        if IRCSocket then
            IRCSocket:send("QUIT :Page closed.\r\n\r\n")
            IRCSocket:close()
        end
        r:wswrite(("NOTICE Thanks for using %s!"):format(provider))
        
        r:wsclose()
    else
        r.content_type = "text/plain"
        r:puts("This feature requires WebSockets!")
    end
    return apache2.DONE
end
