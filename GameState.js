"use strict"

// Layer 0 values:
var WALL  = 0
var OPEN  = 1
var GOAL  = 2  // goal for a box
var GOAL1 = 3  // goal for player 1
var GOAL2 = 4  // goal for player 2

// Layer 1 values:
var LOCKED   = -1
var EMPTY    =  0
var BOX      =  5
var PLAYER1  =  6
var PLAYER2  =  7

// Player roles:
var PUSHER = 0
var PULLER = 1

var base64digits = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

function createGrid(value, width, height)
{
    var grid = []
    for (var y = 0; y < height; ++y)
    {
        grid.push([])
        for (var x = 0; x < width; ++x)
        {
            grid[y].push(value)
        }
    }
    return grid
}

function GameState(arg)
{
    if (typeof(arg) == 'object')
    {
        // Copy previous GameState object
        var width  = arg.getWidth()
        var height = arg.getHeight()
        var layers = []
        for (var l = 0; l < 2; ++l)
        {
            layers[l] = []
            for (var y = 0; y < height; ++y)
            {
                layers[l][y] = []
                for (var x = 0; x < width; ++x)
                {
                    layers[l][y][x] = arg.get(l, x, y)
                }
            }
        }
        var roles = [ arg.getRole(0), arg.getRole(1) ]
    }
    else
    if (typeof(arg) == 'string')
    {
        // Decode stringified game state:
        decode(arg)
    }
    else
    {
        // Initialize some sensible default values:
        var width  = 2
        var height = 2
        var layers = [ createGrid(WALL, width, height),
                       createGrid(EMPTY, width, height) ]
        var roles  = [ PUSHER, PUSHER ]
    }

    function inBounds(x, y)
    {
        return 0 <= x && x < width && 
               0 <= y && y < height
    }

    function onBoundary(x, y)
    {
        return x == 0 || y == 0 || x == width - 1 || y == height - 1
    }

    function isWinning()
    {
        var winning = true, have_goals = false
        for (var y = 0; y < height; ++y)
        {
            for (var x = 0; x < width; ++x)
            {
                if (layers[0][y][x] >= GOAL)
                {
                    have_goals = true
                    if (layers[1][y][x] - BOX != layers[0][y][x] - GOAL) winning = false
                }
            }
        }
        return winning && have_goals
    }

    function reframe()
    {
        var x1 = width, y1 = height, x2 = 0, y2 = 0
        for (var x = 0; x < width; ++x)
        {
            for (var y = 0; y < height; ++y)
            {
                if (layers[0][y][x] != WALL)
                {
                    if (x < x1) x1 = x
                    if (x > x2) x2 = x
                    if (y < y1) y1 = y
                    if (y > y2) y2 = y
                }
            }
        }
        if (x1 > x2  || y1 > y2) return false

        height = y2 - y1 + 3
        width  = x2 - x1 + 3
        var old_layers = layers
        layers = [ createGrid(WALL, width, height),
                   createGrid(EMPTY, width, height) ]
        for (var x = x1; x <= x2; ++x)
        {
            for (var y = y1; y <= y2; ++y)
            {
                layers[0][y - y1 + 1][x - x1 + 1] = old_layers[0][y][x]
                layers[1][y - y1 + 1][x - x1 + 1] = old_layers[1][y][x]
            }
        }
        return true
    }

    function encode()
    {
        var res = "", val = 0, bits = 0
        function append(i, n)
        {
            val |= i<<bits
            bits += n
            while (bits >= 6)
            {
                res += base64digits[val&63]
                val >>>= 6
                bits -= 6
            }
        }
        function appendUnary(i)
        {
            append((1 << i) - 1, i + 1)
        }
        append(height, 6)
        append(width,  6)
        append(4, 6)  // Version 2
        for (var y = 0; y < height; ++y)
        {
            for (var x = 0; x < width; ++x)
            {
                appendUnary(layers[0][y][x])
                if (layers[0][y][x] != WALL)
                {
                    var i = layers[1][y][x]
                    appendUnary(i < BOX ? 0 : i - BOX + 1)
                    if (i >= PLAYER1) append(roles[i - PLAYER1], 1)
                }
            }
        }
        if (bits > 0) append(0, 6 - bits%6)
        return res.replace(/A*$/, "")
    }

    function decode(arg)
    {
        var pos = 0, val = 0, bits = 0 
        function get(n)
        {
            while (bits < n && pos < arg.length)
            {
                var i = base64digits.indexOf(arg.charAt(pos++))
                if (i >= 0)
                {
                    val |= i << bits
                    bits += 6
                }
            }
            var res = val&((1<<n) - 1)
            val >>>= n
            bits -= n
            return res
        }
        function getUnary()
        {
            var i = 0
            while (get(1)) ++i
            return i
        }
        height = get(6)
        width  = get(6)
        layers = [ createGrid(WALL, width, height),
                   createGrid(EMPTY, width, height) ]
        roles = [ PUSHER, PUSHER ]
        var info = get(6)
        if (info < 4)
        {
            // Version 1 format:
            roles = [ (info & 1), ((info&2) >> 1) ]
            for (var y = 0; y < height; ++y)
            {
                for (var x = 0; x < width; ++x)
                {
                    layers[0][y][x] = get(2)
                    var i = get(2)
                    layers[1][y][x] = i > 0 ? i - 1 + BOX : 0
                }
            }
        }
        else  // assumes byte read was `4`
        {
            // Version 2 format:
            for (var y = 0; y < height; ++y)
            {
                for (var x = 0; x < width; ++x)
                {
                    layers[0][y][x] = getUnary()
                    var i = (layers[0][y][x] == WALL) ? EMPTY : getUnary()
                    if (i > 0) i += BOX -1
                    layers[1][y][x] = i
                    if (i >= PLAYER1) roles[i - PLAYER1] = get(1)
                }
            }
        }
    }

    function invertTo(original)
    {
        for (var y = 0; y < height; ++y)
        {
            for (var x = 0; x < width; ++x)
            {
                if (layers[0][y][x] == WALL) continue
                switch (original.get(1, x, y))
                {
                case BOX:     layers[0][y][x] = GOAL; break
                case PLAYER1: layers[0][y][x] = GOAL1; break;
                case PLAYER2: layers[0][y][x] = GOAL2; break;
                case EMPTY:   layers[0][y][x] = OPEN; break
                }
            }
        }
        for (var i = 0; i < 2; ++i)
        {
            roles[i] = 1 - original.getRole(i)
        }
    }

    function search(layer, val)
    {
        var grid = (layer == 0) ? layers[0] : layers[1]
        for (var y = 0; y < height; ++y)
        {
            for (var x = 0; x < width; ++x)
            {
                if (grid[y][x] == val) return [x,y]
            }
        }
    }

    return {
        inBounds:   inBounds,
        onBoundary: onBoundary,
        isWinning:  isWinning,
        reframe:    reframe,
        encode:     encode,
        decode:     decode,
        invertTo:   invertTo,
        search:     search,
        get:        function(l, x, y, v) { return inBounds(x,y) ? layers[l][y][x] : v},
        set:        function(l, x, y, v) { if (inBounds(x,y)) layers[l][y][x] = v },
        getRole:    function(player) { return roles[player] },
        setRole:    function(player, value) { roles[player] = value },
        getWidth:   function() { return width },
        getHeight:  function() { return height } }
}

module.exports = GameState
