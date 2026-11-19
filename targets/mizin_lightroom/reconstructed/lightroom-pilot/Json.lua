-- Small data-only JSON codec. Never evaluates Lua or invokes a shell.
-- Size ceiling for the plugin's own job/session files. Large enough for any real selection
-- (hundreds of thousands of photos); it only rejects corrupted or runaway files.
local Json = { null = {}, MAX_BYTES = 512 * 1024 * 1024 }

local function utf8(code)
    if code < 128 then return string.char(code) end
    if code < 2048 then return string.char(192 + math.floor(code / 64), 128 + code % 64) end
    if code < 65536 then return string.char(224 + math.floor(code / 4096), 128 + math.floor(code / 64) % 64, 128 + code % 64) end
    return string.char(240 + math.floor(code / 262144), 128 + math.floor(code / 4096) % 64, 128 + math.floor(code / 64) % 64, 128 + code % 64)
end

function Json.encode(value)
    local active = {}
    local function encode(item, depth)
        if depth > 40 then error('JSON muito profundo') end
        if item == Json.null or item == nil then return 'null' end
        local kind = type(item)
        if kind == 'boolean' then return tostring(item) end
        if kind == 'number' then
            if item ~= item or math.abs(item) == math.huge then error('Numero JSON invalido') end
            return string.format('%.17g', item)
        end
        if kind == 'string' then
            return '"' .. item:gsub('[%z\1-\31\\"]', function(c)
                if c == '"' then return '\\"' end
                if c == '\\' then return '\\\\' end
                return string.format('\\u%04x', string.byte(c))
            end) .. '"'
        end
        if kind ~= 'table' or active[item] then error('Valor JSON invalido') end
        active[item] = true
        local count, maximum, array = 0, 0, true
        for key in pairs(item) do
            count = count + 1
            if type(key) ~= 'number' or key < 1 or key % 1 ~= 0 then array = false
            else maximum = math.max(maximum, key) end
        end
        array = array and count > 0 and maximum == count
        local parts = {}
        if array then
            for i = 1, count do parts[#parts + 1] = encode(item[i], depth + 1) end
        else
            for key, v in pairs(item) do
                if type(key) ~= 'string' then error('Chave JSON invalida') end
                parts[#parts + 1] = encode(key, depth + 1) .. ':' .. encode(v, depth + 1)
            end
        end
        active[item] = nil
        return (array and '[' or '{') .. table.concat(parts, ',') .. (array and ']' or '}')
    end
    return encode(value, 0)
end

function Json.decode(text)
    if type(text) ~= 'string' or #text > Json.MAX_BYTES then error('JSON invalido ou muito grande') end
    local position = 1
    local function skip()
        while text:sub(position, position):match('[ \t\r\n]') do position = position + 1 end
    end
    local function expect(char)
        if text:sub(position, position) ~= char then error('JSON invalido na posicao ' .. position) end
        position = position + 1
    end
    local function hex4()
        local value = text:sub(position, position + 3)
        if #value ~= 4 or not value:match('^%x%x%x%x$') then error('Escape Unicode invalido') end
        position = position + 4
        return tonumber(value, 16)
    end
    local function stringValue()
        expect('"')
        local parts = {}
        while position <= #text do
            -- Copy plain runs at once: big job files are decoded in seconds, not minutes.
            local stop = text:find('["\\%z\1-\31]', position)
            if not stop then break end
            if stop > position then parts[#parts + 1] = text:sub(position, stop - 1); position = stop end
            local c = text:sub(position, position)
            position = position + 1
            if c == '"' then return table.concat(parts) end
            if c == '\\' then
                c = text:sub(position, position)
                position = position + 1
                local escapes = { ['"'] = '"', ['\\'] = '\\', ['/'] = '/', b = '\b', f = '\f', n = '\n', r = '\r', t = '\t' }
                if c == 'u' then
                    local code = hex4()
                    if code >= 55296 and code <= 56319 then
                        expect('\\'); expect('u')
                        local low = hex4()
                        if low < 56320 or low > 57343 then error('Par Unicode invalido') end
                        code = 65536 + (code - 55296) * 1024 + low - 56320
                    elseif code >= 56320 and code <= 57343 then error('Par Unicode incompleto') end
                    parts[#parts + 1] = utf8(code)
                elseif escapes[c] then parts[#parts + 1] = escapes[c]
                else error('Escape JSON invalido') end
            else
                if string.byte(c) < 32 then error('Controle nao escapado') end
                parts[#parts + 1] = c
            end
        end
        error('String JSON incompleta')
    end
    local parse
    parse = function(depth)
        if depth > 40 then error('JSON muito profundo') end
        skip()
        local char = text:sub(position, position)
        if char == '"' then return stringValue() end
        if char == '{' or char == '[' then
            position = position + 1
            local object, closing = {}, char == '{' and '}' or ']'
            skip()
            if text:sub(position, position) == closing then position = position + 1; return object end
            while true do
                skip()
                if char == '{' then
                    local key = stringValue()
                    if object[key] ~= nil then error('Chave JSON duplicada') end
                    skip(); expect(':')
                    object[key] = parse(depth + 1)
                else object[#object + 1] = parse(depth + 1) end
                skip()
                local nextChar = text:sub(position, position)
                position = position + 1
                if nextChar == closing then return object end
                if nextChar ~= ',' then error('Separador JSON invalido') end
            end
        end
        for literal, value in pairs({ ['true'] = true, ['false'] = false, ['null'] = Json.null }) do
            if text:sub(position, position + #literal - 1) == literal then
                position = position + #literal
                return value
            end
        end
        local start = position
        if char == '-' then position = position + 1 end
        char = text:sub(position, position)
        if char == '0' then position = position + 1
        elseif char:match('[1-9]') then repeat position = position + 1 until not text:sub(position, position):match('%d')
        else error('Numero JSON invalido') end
        if text:sub(position, position) == '.' then
            position = position + 1
            if not text:sub(position, position):match('%d') then error('Decimal incompleto') end
            repeat position = position + 1 until not text:sub(position, position):match('%d')
        end
        if text:sub(position, position):match('[eE]') then
            position = position + 1
            if text:sub(position, position):match('[+-]') then position = position + 1 end
            if not text:sub(position, position):match('%d') then error('Expoente incompleto') end
            repeat position = position + 1 until not text:sub(position, position):match('%d')
        end
        local value = tonumber(text:sub(start, position - 1))
        if not value or value ~= value or math.abs(value) == math.huge then error('Numero JSON fora do limite') end
        return value
    end
    local result = parse(0)
    skip()
    if position <= #text then error('Dados extras apos JSON') end
    return result
end

return Json
