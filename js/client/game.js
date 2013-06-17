"use strict"

var DX = [ +1,  0, -1,  0 ]
var DY = [  0, +1,  0, -1 ]

var control_scheme = 1

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

// Other values which have associated sprites:
var REFRAME  =  8

var base64digits = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

var params = {}

var S = 40          // bitmap tile size (in pixels)
var W = 10          // grid width (in tiles)
var H = 10          // grid height (in tiles)

var layer0 = createGrid(WALL)
var layer1 = createGrid(EMPTY)

var move_dir        = [ -1, -1 ]
var grab_dir        = [ -2, -1 ]   // -1: no grab.  -2: can't grab.
var explicit_move   = [ false, false ]

var selected_tool   = -1
var animations      = []
var post_animations = []
var winning_time    = -1
var swap_controls   = 0

var tools = [ WALL,  OPEN,    REFRAME,
              GOAL,  GOAL1,   GOAL2,
              BOX,   PLAYER1, PLAYER2 ]

function reframe()
{
    var x1 = W, y1 = H, x2 = 0, y2 = 0
    for (var x = 0; x < W; ++x)
    {
        for (var y = 0; y < H; ++y)
        {
            if (layer0[y][x] != WALL || layer1[y][x] != EMPTY)
            {
                if (x < x1) x1 = x
                if (x > x2) x2 = x
                if (y < y1) y1 = y
                if (y > y2) y2 = y
            }
        }
    }
    if (x1 > x2  || y1 > y2) return
    H = y2 - y1 + 3
    W = x2 - x1 + 3
    var new_layer0 = createGrid(WALL)
    var new_layer1 = createGrid(EMPTY)
    for (var x = x1; x <= x2; ++x)
    {
        for (var y = y1; y <= y2; ++y)
        {
            new_layer0[y - y1 + 1][x - x1 + 1] = layer0[y][x]
            new_layer1[y - y1 + 1][x - x1 + 1] = layer1[y][x]
        }
    }
    layer0 = new_layer0
    layer1 = new_layer1
    updateHashFromState()
    redraw()
}

function layersToString()
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
    append(H, 6)
    append(W, 6)
    append(4, 6)  // version 1
    for (var y = 0; y < H; ++y)
    {
        for (var x = 0; x < W; ++x)
        {
            appendUnary(layer0[y][x])
            if (layer0[y][x] != WALL)
            {
                var i = layer1[y][x]
                appendUnary(i < BOX ? 0 : i - BOX + 1)
                if (i >= PLAYER1) append((grab_dir[i - PLAYER1] > -2)|0, 1)
            }
        }
    }
    if (bits > 0) append(0, 6 - bits%6)
    return res.replace(/A*$/, "")
}

function decodeGameString(arg)
{
    var pos = 0, val = 0, bits = 0 
    function get(n)
    {
        while (bits < n)
        {
            val |= base64digits.indexOf(arg.charAt(pos++)) << bits
            bits += 6
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
    var H = get(6)
    var W = get(6)
    var layer0 = createGrid(WALL, W, H)
    var layer1 = createGrid(EMPTY, W, H)
    var grab_dir = [ -2, -2 ]
    var info = get(6)
    if (info < 4)
    {
        // Version 1 format:
        grab_dir = [ -2 + (info & 1), -2 + ((info&2) >> 1) ]
        for (var y = 0; y < H; ++y)
        {
            for (var x = 0; x < W; ++x)
            {
                layer0[y][x] = get(2)
                var i = get(2)
                layer1[y][x] = i > 0 ? i - 1 + BOX : 0
            }
        }
    }
    else  // assumes byte read was `4`
    {
        // Version 2 format:
        for (var y = 0; y < H; ++y)
        {
            for (var x = 0; x < W; ++x)
            {
                layer0[y][x] = getUnary()
                var i = (layer0[y][x] == WALL) ? EMPTY : getUnary()
                if (i > 0) i += BOX -1
                layer1[y][x] = i
                if (i >= PLAYER1) grab_dir[i - PLAYER1] = -2 + get(1)
            }
        }
    }
    return { height: H, width: W, layer0: layer0, layer1: layer1, grab_dir: grab_dir }
}

function stringToLayers(arg)
{
    var obj = decodeGameString(arg)
    W = obj.width
    H = obj.height
    layer0 = obj.layer0
    layer1 = obj.layer1
    grab_dir = obj.grab_dir
    var canvas = document.getElementById("GameCanvas")
    canvas.width  = W*S
    canvas.height = H*S
}

function invertGame()
{
    queuePostAnimation(function() {

        // Only invert in winning position.
        if (!checkWinning()) return

        var initial = decodeGameString(params.game)
        for (var y = 0; y < H; ++y)
        {
            for (var x = 0; x < W; ++x)
            {
                if (layer0[y][x] == WALL) continue
                switch (initial.layer1[y][x])
                {
                case BOX:     layer0[y][x] = GOAL; break
                case PLAYER1: layer0[y][x] = GOAL1; break;
                case PLAYER2: layer0[y][x] = GOAL2; break;
                case EMPTY:   layer0[y][x] = OPEN; break
                }
            }
        }
        for (var i = 0; i < 2; ++i)
        {
            grab_dir[i] = (initial.grab_dir[i] == -2) ? -1 : -2
        }
        setLevelCode(layersToString())
    })
}

var frame_requested = false

function redraw()
{
    // Seriously, browser-makers, get your act together!
    var requestAnimationFrame = window.requestAnimationFrame ||
                                window.webkitRequestAnimationFrame ||
                                window.mozRequestAnimationFrame ||
                                window.msRequestAnimationFrame ||
                                window.oRequestAnimationFrame ||
                                function(f) { return setTimeout(f, 50) }

    if (!frame_requested)
    {
        requestAnimationFrame(render)
        frame_requested = true
    }
}

function inBounds(x, y)
{
    return 0 <= x && x < W && 
           0 <= y && y < H
}

function createGrid(value, w, h)
{
    if (typeof w == 'undefined') w = W
    if (typeof h == 'undefined') h = H
    var grid = []
    for (var y = 0; y < h; ++y)
    {
        grid.push([])
        for (var x = 0; x < w; ++x)
        {
            grid[y].push(value)
        }
    }
    return grid
}

function findOnGrid(grid, val)
{
    for (var y = 0; y < H; ++y)
    {
        for (var x = 0; x < W; ++x)
        {
            if (grid[y][x] == val) return [x,y]
        }
    }
}

function replaceOnGrid(grid, src, dest)
{
    for (var y = 0; y < H; ++y)
    {
        for (var x = 0; x < W; ++x)
        {
            if (grid[y][x] == src) grid[y][x] = dest
        }
    }
}

function onCellClicked(x,y)
{
    if (!inBounds(x, y)) return

    var tool = tools[selected_tool]

    switch (tool)
    {
    case WALL:
    case OPEN:
        layer0[y][x] = tool; layer1[y][x] = EMPTY; break
    case GOAL:
    case GOAL1:
    case GOAL2:
        if (layer0[y][x] == tool) { layer0[y][x] = OPEN; break; }
        if (tool != GOAL) replaceOnGrid(layer0, tool, OPEN);
        layer0[y][x] = tool;
        break;
    case BOX:
    case PLAYER1:
    case PLAYER2:
        if (layer1[y][x] == tool) { layer1[y][x] = EMPTY; break; }
        if (tool != BOX) replaceOnGrid(layer1, tool, EMPTY);
        if (layer0[y][x] == WALL) layer0[y][x] = OPEN;
        layer1[y][x] = tool;
        break
    default:
        return
    }
    updateHashFromState()
}

function checkWinning()
{
    var winning = true, have_goals = false
    for (var y = 0; y < H; ++y)
    {
        for (var x = 0; x < W; ++x)
        {
            if (layer0[y][x] >= GOAL)
            {
                have_goals = true
                if (layer1[y][x] - BOX != layer0[y][x] - GOAL) winning = false
            }
        }
    }
    if (winning && have_goals)
    {
        if (winning_time < 0) winning_time = new Date().getTime()
    }
    else
    {
        winning_time = -1
    }
    document.getElementById('Winning').style.display = (winning_time < 0 || getEditMode()) ? "none" : "block"
    return winning_time >= 0
}

function movePlayer(player, new_dir, walking)
{
    if (typeof(new_dir) != "undefined")
    {
        // Keyboard repeat may cause another keydown event to be sent before key goes up.
        // IMO this is the wrong behaviour (keyboard repeat should affect only keypress,
        // not keydown/keyup) so just ignore those:
        if (move_dir[player] == new_dir) return

        // If new_dir is negative, a key has been released.
        if (new_dir < 0)
        {
            // Only cancel direction if the same key is currently held down, so we
            // don't cancel a movement if the old key is released after the new key
            // is pressed.
            if (move_dir[player] != ~new_dir) return
            new_dir = -1
        }
        move_dir[player] = new_dir
        explicit_move[player] = true
    }

    var cur_dir = move_dir[player]
    if (cur_dir < 0) return

    var dx = DX[cur_dir]
    var dy = DY[cur_dir]
    var p = player + PLAYER1
    var xy = findOnGrid(layer1, p)
    if (!xy) return
    var x1 = xy[0], x2 = x1 + dx, x3 = x2 + dx, x0 = x1 - dx
    var y1 = xy[1], y2 = y1 + dy, y3 = y2 + dy, y0 = y1 - dy

    function addAnimation(delay, onRender, onComplete)
    {
        var start = new Date().getTime()
        animations.push(function(context, time) {
            var dt = (time - start)/delay
            if (dt >= 1)
            {
                onRender(context, 1)
                onComplete()
                return false
            }
            else
            {
                onRender(context, dt)
                return true
            }
        })
        redraw()
    }

    function lock(x,y)
    {
        layer1[y][x] = LOCKED
        var other = 1 - player
        var dir = grab_dir[other]
        if (dir >= 0)
        {
            var xx = x - DX[dir]
            var yy = y - DY[dir]
            if (inBounds(xx, yy) && layer1[yy][xx] == PLAYER1 + other) grab_dir[other] = -1
        }
    }

    function onMoveComplete(walking)
    {
        checkWinning()
        for (var i = 0; i < 2; ++i)
        {
            if (grab_dir[i] != move_dir[i]) movePlayer(i, undefined, walking)
        }
    }

    var new_grab_dir = -1

    if (control_scheme == 1)
    {
        if (inBounds(x2, y2) && layer0[y2][x2] != WALL)
        {
            if (layer1[y2][x2] == EMPTY)
            {
                if (grab_dir[player] == (move_dir[player] + 2)%4 &&
                    inBounds(x0, y0) && layer1[y0][x0] > EMPTY)
                {
                    // Pull!
                    var o = layer1[y0][x0]
                    lock(x0,y0); lock(x1,y1); lock(x2,y2)
                    addAnimation(375, function(context, dt) {
                        var x = S*(x0 + dt*(x1 - x0))
                        var y = S*(y0 + dt*(y1 - y0))
                        drawSpriteAt(context, parseInt(x), parseInt(y), o)
                        var x = S*(x1 + dt*(x2 - x1))
                        var y = S*(y1 + dt*(y2 - y1))
                        drawSpriteAt(context, parseInt(x), parseInt(y), p, grab_dir[player])
                    }, function() {
                        layer1[y0][x0] = EMPTY
                        layer1[y1][x1] = o
                        layer1[y2][x2] = p
                        onMoveComplete(false)
                    })
                    new_grab_dir = grab_dir[player]  // hold onto pulled block
                }
                else
                {
                    // Just walk.
                    lock(x1,y1); lock(x2,y2)
                    addAnimation(250, function(context, dt) {
                        var x = S*(x1 + dt*(x2 - x1))
                        var y = S*(y1 + dt*(y2 - y1))
                        drawSpriteAt(context, parseInt(x), parseInt(y), p)
                    }, function() {
                        layer1[y1][x1] = EMPTY
                        layer1[y2][x2] = p
                        onMoveComplete(true)
                    })
                }
            }
            else
            if (layer1[y2][x2] > EMPTY && (!walking || explicit_move[player]))
            {
                if (grab_dir[player] == -2 && inBounds(x3, y3) && layer0[y3][x3] != WALL && layer1[y3][x3] == EMPTY)
                {
                    // Push!
                    var o = layer1[y2][x2]
                    lock(x1,y1); lock(x2,y2); lock(x3,y3)
                    addAnimation(375, function(context, dt) {
                        var x = S*(x1 + dt*(x2 - x1))
                        var y = S*(y1 + dt*(y2 - y1))
                        drawSpriteAt(context, parseInt(x), parseInt(y), p)
                        var x = S*(x2 + dt*(x3 - x2))
                        var y = S*(y2 + dt*(y3 - y2))
                        drawSpriteAt(context, parseInt(x), parseInt(y), o)
                    }, function() {
                        layer1[y1][x1] = EMPTY
                        layer1[y2][x2] = p
                        layer1[y3][x3] = o
                        onMoveComplete(false)
                    })
                }
                if (grab_dir[player] != move_dir[player]) new_grab_dir = move_dir[player]
            }
        }

        if (grab_dir[player] > -2 && new_grab_dir != grab_dir[player])
        {
            grab_dir[player] = new_grab_dir
            redraw()
        }
    }
    else
    {
        if (inBounds(x2, y2) && layer0[y2][x2] != WALL)
        {
            if (layer1[y2][x2] == EMPTY)
            {
                // Just walk.
                lock(x1,y1); lock(x2,y2)
                addAnimation(250, function(context, dt) {
                    var x = S*(x1 + dt*(x2 - x1))
                    var y = S*(y1 + dt*(y2 - y1))
                    drawSpriteAt(context, parseInt(x), parseInt(y), p)
                }, function() {
                    layer1[y1][x1] = EMPTY
                    layer1[y2][x2] = p
                    onMoveComplete(true)
                })
            }
            else
            if (layer1[y2][x2] > EMPTY && (!walking || explicit_move[player]))
            {
                if (grab_dir[player] == -2 && inBounds(x3, y3) && layer0[y3][x3] != WALL && layer1[y3][x3] == EMPTY)
                {
                    // Push!
                    var o = layer1[y2][x2]
                    lock(x1,y1); lock(x2,y2); lock(x3,y3)
                    addAnimation(375, function(context, dt) {
                        var x = S*(x1 + dt*(x2 - x1))
                        var y = S*(y1 + dt*(y2 - y1))
                        drawSpriteAt(context, parseInt(x), parseInt(y), p)
                        var x = S*(x2 + dt*(x3 - x2))
                        var y = S*(y2 + dt*(y3 - y2))
                        drawSpriteAt(context, parseInt(x), parseInt(y), o)
                    }, function() {
                        layer1[y1][x1] = EMPTY
                        layer1[y2][x2] = p
                        layer1[y3][x3] = o
                        onMoveComplete(false)
                    })
                }
                if (grab_dir[player] == -1 && inBounds(x0, y0) && layer0[y0][x0] != WALL && layer1[y0][x0] == EMPTY)
                {
                    // Pull!
                    var o = layer1[y2][x2]
                    lock(x0,y0); lock(x1,y1); lock(x2,y2)
                    addAnimation(375, function(context, dt) {
                        var x = S*(x1 + dt*(x0 - x1))
                        var y = S*(y1 + dt*(y0 - y1))
                        drawSpriteAt(context, parseInt(x), parseInt(y), p)
                        var x = S*(x2 + dt*(x1 - x2))
                        var y = S*(y2 + dt*(y1 - y2))
                        drawSpriteAt(context, parseInt(x), parseInt(y), o)
                    }, function() {
                        layer1[y0][x0] = p
                        layer1[y1][x1] = o
                        layer1[y2][x2] = EMPTY
                        onMoveComplete(false)
                    })
                }
            }
        }
    }
    explicit_move[player] = false
}

function parseHash(hash)
{
    hash = hash.substr(hash.indexOf('#') + 1)
    var params = {}, i = 0
    while (i < hash.length)
    {
        var j = hash.indexOf('&', i)
        if (j < 0) j = hash.length
        var k = hash.indexOf('=', i)
        if (k >= i && k < j)
        {
            try
            {
                params[decodeURIComponent(hash.substring(i, k))] = 
                    decodeURIComponent(hash.substring(k + 1, j))
            }
            catch (e)
            {
                // silently ignored!
            }
        }
        i = j + 1
    }
    return params
}

function formatHash(obj)
{
    var hash = "#"
    for (var key in obj)
    {
        if (hash != "#") hash += "&"
        hash += encodeURIComponent(key) + '=' + encodeURIComponent(obj[key])
    }
    return hash
}

function queuePostAnimation(f)
{
    if (animations.length == 0) f()
    else post_animations.push(f)
}

function updateStateFromHash()
{
    params = parseHash(document.location.hash)
    stringToLayers(params.game || "KK")
    if (params.edit)
    {
        document.getElementById("ToolCanvas").style.display = "inline-block"
    }
    else
    {
        document.getElementById("ToolCanvas").style.display = "none"
        selected_tool = -1
    }
    checkWinning()
    redraw()
}

function updateHashFromState()
{
    params.game = layersToString()
    document.location.hash = formatHash(params)
}

function getLevelCode()
{
    return params.game
}

function setLevelCode(arg)
{
    if (arg)
    {
        queuePostAnimation(function(){
            stringToLayers(arg)
            updateHashFromState()
         })
    }
}

function getEditMode()
{
    return !!params.edit
}

function setEditMode(arg)
{
    if (arg == getEditMode()) return
    updateStateFromHash()
    if (arg) params.edit = 1
    else delete params.edit
    updateHashFromState()
    updateStateFromHash()
}

function restart()
{
    queuePostAnimation(updateStateFromHash)
}

function selectTool(i)
{
    if (i < -1 || i >= tools.length || !params.edit) return

    if (tools[i] >= PLAYER1 && tools[i] <= PLAYER2)
    {
        if (i == selected_tool)
        {
            var player = tools[i] - PLAYER1
            grab_dir[player] = -2 + (grab_dir[player] == -2)
            updateHashFromState()
        }
        selected_tool = -1
    }
    if (tools[i] == REFRAME)
    {
        reframe()
        redraw()
        return
    }
    selected_tool = (i == selected_tool) ? -1 : i
    redraw()
}

function initialize(level_code)
{
    function fixEventOffset(event, element)
    {
        // This is retarded. JavaScript in the browser fucking sucks.
        if (!event.hasOwnProperty('offsetX'))
        {
            event.offsetX = event.layerX - element.offsetLeft
            event.offsetY = event.layerY - element.offsetTop
            /* `element` has an attribute `offsetParent` too,
            but apparently adding offsets recusively doesn't work! */
        }
    }

    var leftButtonDown = false
    document.addEventListener("mousedown", function(event) {
        if (event.which == 1) leftButtonDown = true
    })
    document.addEventListener("mouseup", function(event) {
        if (event.which == 1) leftButtonDown = false
    })

    var click_x = -1, click_y = -1

    var canvas = document.getElementById("GameCanvas")
    canvas.addEventListener("mousedown", function(event) {
        event.preventDefault(event)
        fixEventOffset(event, canvas)
        queuePostAnimation(function() {
            click_x = parseInt(event.offsetX/S)
            click_y = parseInt(event.offsetY/S)
            onCellClicked(click_x, click_y, false)
        })
    })
    canvas.addEventListener("mousemove", function(event) {
        if (leftButtonDown)
        {
            event.preventDefault(event)
            fixEventOffset(event, canvas)
            queuePostAnimation(function() {
                var x = parseInt(event.offsetX/S)
                var y = parseInt(event.offsetY/S)
                if (x != click_x || y != click_y)
                {
                    // Only process drag event if it visits a different cell
                    click_x = x
                    click_y = y
                    onCellClicked(click_x, click_y, true)
                }
            })
        }
    })

    var tool_canvas = document.getElementById("ToolCanvas")
    tool_canvas.addEventListener("mousedown", function(event) {
        event.preventDefault(event)
        fixEventOffset(event, tool_canvas)
        var x = parseInt((event.offsetX/S - 0.05)/1.1)
        var y = parseInt((event.offsetY/S - 0.05)/1.1)
        selectTool(3*(2 - y) + x)
    })

    document.addEventListener("keydown", function(event) {

        // Don't steal browser's keyboard shortcuts
        if (event.altKey || event.ctrlKey) return

        var handled = true

        switch (event.keyCode)
        {
        case 9: swap_controls = !swap_controls; redraw(); break  // tab

        case 48: case  96:  // 0
        case 49: case  97:  // 1
        case 50: case  98:  // etc.
        case 51: case  99:
        case 52: case 100:
        case 53: case 101:
        case 54: case 102:
        case 55: case 103:
        case 56: case 104:
        case 57: case 105: selectTool((event.keyCode - 48)%48 - 1); break

        case 37: movePlayer(0 + swap_controls, 2); break  // <-
        case 38: movePlayer(0 + swap_controls, 3); break  //  ^
        case 39: movePlayer(0 + swap_controls, 0); break  // ->
        case 40: movePlayer(0 + swap_controls, 1); break  // v

        case 87: movePlayer(1 - swap_controls, 3); break  // W
        case 65: movePlayer(1 - swap_controls, 2); break  // A
        case 83: movePlayer(1 - swap_controls, 1); break  // S
        case 68: movePlayer(1 - swap_controls, 0); break  // D

        case 82: restart(); break  // R

        default: return
        }
        event.preventDefault()
    })
    document.addEventListener("keyup", function(event) {
        switch (event.keyCode)
        {
        case 37: movePlayer(0 + swap_controls, ~2); break  // <-
        case 38: movePlayer(0 + swap_controls, ~3); break  //  ^
        case 39: movePlayer(0 + swap_controls, ~0); break  // ->
        case 40: movePlayer(0 + swap_controls, ~1); break  // v

        case 87: movePlayer(1 - swap_controls, ~3); break  // W
        case 65: movePlayer(1 - swap_controls, ~2); break  // A
        case 83: movePlayer(1 - swap_controls, ~1); break  // S
        case 68: movePlayer(1 - swap_controls, ~0); break  // D
        }
    })

    if (document.location.hash) updateStateFromHash()
    else setLevelCode(level_code)
    window.onhashchange = function() { queuePostAnimation(updateStateFromHash) }
}

function getFillStyle(what, a)
{
    if (!a) a = 1
    if (what == PLAYER1 + swap_controls) return 'rgba(255,0,0,' + a + ')'
    if (what == PLAYER2 - swap_controls) return 'rgba(0,96,255,' + a + ')'
}

function getStrokeStyle(what, a)
{
    if (!a) a = 1
    if (what == PLAYER1 + swap_controls) return 'rgba(160,0,0,' + a + ')'
    if (what == PLAYER2 - swap_controls) return 'rgba(0,0,160,' + a + ')'
}

function drawSpriteAt(context, x, y, what, offset_dir)
{
    function drawStripes()
    {
        context.beginPath()
        for (var i = -4; i <= 4; ++i)
        {
            context.moveTo(x + i*0.25*S - 0.1*S, y + S + 0.1*S)
            context.lineTo(x + S + i*0.25*S + 0.1*S, y - 0.1*S)
        }
        context.lineWidth   = 0.1*S
        context.stroke()
    }

    context.save()
    switch (what)
    {
    case GOAL:
        /*
        context.lineWidth   = S/10
        context.strokeStyle = '#40ff40'
        context.strokeRect(x + 0.05*S, y + 0.05*S, 0.9*S, 0.9*S)
        */
        context.rect(x, y, S, S)
        context.clip()
        context.strokeStyle = 'rgba(64,255,64,0.75)'
        drawStripes()
        break

    case GOAL1:
    case GOAL2:
        /*
        context.lineWidth   = S/10
        context.strokeStyle = getFillStyle(what - GOAL1 + PLAYER1)
        context.strokeRect(x + 0.05*S, y + 0.05*S, 0.9*S, 0.9*S)
        */
        /*
        context.beginPath()
        context.arc(x + S/2, y + S/2, 0.5*S, 0, Math.PI*2)
        context.closePath()
        context.clip()
        */
        context.rect(x, y, S, S)
        context.clip()
        context.strokeStyle = getFillStyle(what - GOAL1 + PLAYER1, 0.5)
        drawStripes()
        break

    case WALL:
        context.fillStyle = '#a0a0a0'
        context.fillRect(x, y, S, S)
        break

    case BOX:
        context.fillStyle   = '#00a000'
        context.fillRect(x + 0.15*S, y + 0.15*S, 0.7*S, 0.7*S)
        context.strokeStyle = '#008000'
        context.lineWidth   = S/10
        context.strokeRect(x + 0.15*S, y + 0.15*S, 0.7*S, 0.7*S)
        break

    case PLAYER1:
    case PLAYER2:
        var player = what - PLAYER1
        if (typeof(offset_dir) != 'undefined' && offset_dir >= 0)
        {
            x += 0.2*S*DX[offset_dir]
            y += 0.2*S*DY[offset_dir]
        }
        context.beginPath()
        context.arc(x + S/2, y + S/2, 0.4*S, 0, Math.PI*2)
        context.closePath()
        context.fillStyle = getFillStyle(what)
        context.fill()
        context.strokeStyle = getStrokeStyle(what)
        context.lineWidth = S/20
        context.stroke()
        if (grab_dir[what - PLAYER1] > -2)
        {
            context.clip()
            context.beginPath()
            context.moveTo(x, y + S)
            context.lineTo(x + S, y)
            context.lineWidth = 0.25*S
            context.closePath()
            context.stroke()
        }
        break

    case REFRAME:
        // FIXME: it might be faster to pre-calculate the points for this polygon
        context.beginPath()
        var endpoints = [ [  0.050,   0.0 ],
                          [  0.050,   0.2 ],
                          [  0.125,   0.2 ],
                          [  0.000,   0.4 ],
                          [ -0.125,   0.2 ],
                          [ -0.050,   0.2 ],
                          [ -0.050,   0.0 ] ]
        for (var i = 0; i < 4; ++i)
        {
            for (var j = 0; j < endpoints.length; ++j)
            {
                var dx = endpoints[j][0],
                    dy = endpoints[j][1]
                context.lineTo(x + 0.5*S + S*dx, y + 0.5*S + S*dy)
                endpoints[j][0] =  dy
                endpoints[j][1] = -dx
            }
        }
        context.strokeStyle = '#804000'
        context.lineWidth = 3
        context.stroke()
        context.fillStyle = '#ff8000'
        context.fill()
        break
    }
    context.restore()
}

function render()
{
    frame_requested = false

    if (animations.length == 0 && post_animations.length > 0)
    {
        // Process post-animation events
        for (var i = 0; i < post_animations.length; ++i) post_animations[i]()
        post_animations = []
    }

    var canvas = document.getElementById("GameCanvas")
    var context = canvas.getContext("2d")
    context.clearRect(0, 0, canvas.width, canvas.height)

    // Draw ground layer:
    for (var x = 0; x < W; ++x)
    {
        for (var y = 0; y < H; ++y)
        {
            if (layer0[y][x] == OPEN)
            {
                context.save()
                context.strokeStyle = '#c0c0c0'
                // if (layer1[y][x] == LOCKED) context.strokeStyle = 'red'
                context.strokeRect(S*x, S*y, S, S)
                context.restore()
            }
            else
            {
                drawSpriteAt(context, S*x, S*y, layer0[y][x])
            }
        }
    }

    // Draw object layer:
    for (var x = 0; x < W; ++x)
    {
        for (var y = 0; y < H; ++y)
        {
            if (layer1[y][x] > EMPTY)
            {
                var what = layer1[y][x]
                drawSpriteAt(context, S*x, S*y, layer1[y][x],
                    what >= PLAYER1 && what <= PLAYER2 ? grab_dir[what - PLAYER1] : -1 )
            }
        }
    }

    // Draw active animations:
    if (animations.length > 0)
    {
        var time = new Date().getTime()
        for (var i = 0; i < animations.length; ++i)
        {
            var anim = animations[i]
            if (!animations[i](context, time)) animations.splice(i--, 1)
        }
        redraw()
    }

    if (winning_time >= 0)
    {
        var dt = (new Date().getTime() - winning_time)/2000
        if (dt > 1) dt = 1
        var msg = "You won!"
        context.save()
        context.font = "bold " + S + "px sans-serif";
        context.strokeStyle = "rgba(255,255,255," + dt + ")";
        context.lineWidth = 4*dt
        context.strokeText(msg, 10, H*S - 10);
        context.fillStyle = "rgba(255,0,255," + dt + ")";
        context.fillText(msg, 10, H*S - 10);
        context.restore()
        if (dt < 1) redraw()
    }

    var canvas = document.getElementById("ToolCanvas")
    var context = canvas.getContext("2d")
    context.clearRect(0, 0, canvas.width, canvas.height)

    for (var i = 0; i < tools.length; ++i)
    {
        var x = i%3, y = 2 - (i - x)/3
        if (i == selected_tool)
        {
            context.fillStyle = '#8000ff'
            context.fillRect((1.1*x)*S, (1.1*y)*S, 1.2*S, 1.2*S)
            context.clearRect((0.1 + 1.1*x)*S, (0.1 + 1.1*y)*S, S, S)
        }
        else
        {
            context.strokeStyle = '#c0c0c0'
            context.strokeRect((0.1 + 1.1*x)*S, (0.1 + 1.1*y)*S, S, S)
        }
        drawSpriteAt(context, (0.1 + 1.1*x)*S, (0.1 + 1.1*y)*S, tools[i])
    }
    context.restore()
}

module.exports = {
    initialize:   initialize,
    invertGame:   invertGame,
    getEditMode:  getEditMode,
    setEditMode:  setEditMode,
    getLevelCode: getLevelCode,
    setLevelCode: setLevelCode,
    getControlScheme: function() { return control_scheme },   // TEMP: for testing
    setControlScheme: function(val) { control_scheme = val }  // TEMP: for testing
}
