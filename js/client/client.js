"use strict"

var GameState = require("./GameState.js")
var editor = null  // loaded on demand
var hash = require("./hash.js")
var rpc = require("./rpc.js")

var DX = [ +1,  0, -1,  0 ]
var DY = [  0, +1,  0, -1 ]

// Note: these "constants" are intended to match those in GameState.js:
var WALL = 0, OPEN = 1, GOAL = 2, GOAL1 = 3, GOAL2 = 4
var EMPTY = 0, BOX = 5, PLAYER1 = 6, PLAYER2  = 7, REFRAME = 8, LOCKED = -1
var PUSHER = 0, PULLER = 1

var S = 40          // bitmap tile size (in pixels)

var gs         = GameState()
var level_code = null
var edit_mode  = false

var move_dir        = [ -1, -1 ]
var grab_dir        = [ -1, -1 ]
var explicit_move   = [ false, false ]

var animations      = []
var post_animations = []
var winning_time    = -1
var swap_controls   = 0
var control_scheme  = 1

// Redrawing state:
var frame_requested = false
var dirty           = null           // redraw marked game cells only
var game_dirty      = false          // redraw entire game canvas 
var tools_dirty     = false          // redraw entire tool canvas

function stringToLayers(arg)
{
    gs.decode(arg)
    for (var i = 0; i < 2; ++i) grab_dir[i] = -1
    var width  = gs.getWidth()
    var height = gs.getHeight()
    var canvas = document.getElementById("GameCanvas")
    if (canvas.width != width*S || canvas.height != height*S)
    {
        // Only write to canvas width/height when the size has actually changed,
        // because browsers will recreate the surface unconditionally when
        // the width/height properties are written, causing ugly flickering.
        canvas.width  = width*S
        canvas.height = height*S
    }
    dirty = []
    for (var y = 0; y < height; ++y)
    {
        dirty[y] = []
        for (var x = 0; x < width; ++x)
        {
            dirty[y][x] = false
        }
    }
    checkWinning()
    redraw()
}

function checkWinning()
{
    if (gs.isWinning())
    {
        if (winning_time < 0)
        {
            winning_time = new Date().getTime()
        }
    }
    else
    {
        winning_time = -1
    }
    document.getElementById('InstructionsPlayMode').style.display = (winning_time >= 0 ||  edit_mode) ? "none" : "block"
    document.getElementById('InstructionsEditMode').style.display = (winning_time >= 0 || !edit_mode) ? "none" : "block"
    document.getElementById('WinningPlayMode').style.display = (winning_time < 0 ||  edit_mode) ? "none" : "block"
    document.getElementById('WinningEditMode').style.display = (winning_time < 0 || !edit_mode) ? "none" : "block"
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
    var xy = gs.search(1, p)
    if (!xy) return
    var x1 = xy[0], x2 = x1 + dx, x3 = x2 + dx, x0 = x1 - dx
    var y1 = xy[1], y2 = y1 + dy, y3 = y2 + dy, y0 = y1 - dy

    function addAnimation(delay, points, onRender, onComplete)
    {
        var start = new Date().getTime()
        function redrawPoints()
        {
            for (var i in points) redraw(points[i][0], points[i][1])
        }
        function animate(context, time)
        {
            var dt = (time - start)/delay
            onRender(context, dt < 1 ? dt : 1)
            redrawPoints()
            if (dt < 1) return true
            onComplete()
            return false
        }
        animations.push(animate)
        redrawPoints()
    }

    function lock(x,y, new_val)
    {
        var other = 1 - player
        var dir = grab_dir[other]
        if (dir >= 0)
        {
            if (gs.get(1, x,y) == PLAYER1 + other)
            {
                redraw(x, y)
                redraw(x + DX[dir], y + DY[dir])
                grab_dir[other] = -1
            }
            else
            if (gs.get(1, x - DX[dir], y - DY[dir], EMPTY) == PLAYER1 + other)
            {
                redraw(x, y)
                redraw(x - DX[dir], y - DY[dir])
                grab_dir[other] = -1
            }
        }
        gs.set(1, x,y, new_val)
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

    if ((control_scheme&1) == 1)
    {
        if (gs.get(0, x2, y2, WALL) != WALL)
        {
            if (gs.get(1, x2, y2) == EMPTY)
            {
                if (grab_dir[player] == (move_dir[player] + 2)%4 && gs.get(1, x0, y0, EMPTY) > EMPTY)
                {
                    // Pull!
                    var o = gs.get(1, x0, y0)
                    lock(x0,y0,EMPTY); lock(x1,y1,LOCKED); lock(x2,y2,LOCKED)
                    addAnimation(375, [[x0,y0],[x1,y1],[x2,y2]], function(context, dt) {
                        var x = S*(x0 + dt*(x1 - x0))
                        var y = S*(y0 + dt*(y1 - y0))
                        drawSpriteAt(context, parseInt(x), parseInt(y), o)
                        var x = S*(x1 + dt*(x2 - x1))
                        var y = S*(y1 + dt*(y2 - y1))
                        drawSpriteAt(context, parseInt(x), parseInt(y), p, grab_dir[player])
                    }, function() {
                        gs.set(1, x1, y1, o)
                        gs.set(1, x2, y2, p)
                        onMoveComplete(false)
                    })
                    new_grab_dir = grab_dir[player]  // hold onto pulled block
                }
                else
                {
                    // Just walk.
                    lock(x1,y1,EMPTY); lock(x2,y2,LOCKED)
                    addAnimation(250, [[x1,y1],[x2,y2]], function(context, dt) {
                        var x = S*(x1 + dt*(x2 - x1))
                        var y = S*(y1 + dt*(y2 - y1))
                        drawSpriteAt(context, parseInt(x), parseInt(y), p)
                    }, function() {
                        gs.set(1, x2, y2, p)
                        onMoveComplete(true)
                    })
                }
            }
            else
            if (gs.get(1, x2, y2) > EMPTY && ((control_scheme&2) == 0 || !walking || explicit_move[player]))
            {
                if (gs.getRole(player) == PUSHER && gs.get(0, x3, y3, WALL) != WALL && gs.get(1, x3, y3) == EMPTY)
                {
                    // Push!
                    var o = gs.get(1, x2, y2)
                    lock(x1,y1,EMPTY); lock(x2,y2,LOCKED); lock(x3,y3,LOCKED)
                    addAnimation(375, [[x1,y1],[x2,y2],[x3,y3]], function(context, dt) {
                        var x = S*(x1 + dt*(x2 - x1))
                        var y = S*(y1 + dt*(y2 - y1))
                        drawSpriteAt(context, parseInt(x), parseInt(y), p)
                        var x = S*(x2 + dt*(x3 - x2))
                        var y = S*(y2 + dt*(y3 - y2))
                        drawSpriteAt(context, parseInt(x), parseInt(y), o)
                    }, function() {
                        gs.set(1, x2, y2, p)
                        gs.set(1, x3, y3, o)
                        onMoveComplete(false)
                    })
                }
                if (grab_dir[player] != move_dir[player]) new_grab_dir = move_dir[player]
            }
        }

        if (gs.getRole(player) == PULLER && new_grab_dir != grab_dir[player])
        {
            if (grab_dir[player] >= 0)
            {
                redraw(x1 + DX[grab_dir[player]], y1 + DY[grab_dir[player]])
                grab_dir[player] = -1
            }
            else
            {
                grab_dir[player] = new_grab_dir
            }
            redraw(x1, y1)
        }
    }
    else  // (control_scheme&1) == 0
    {
        if (gs.get(0, x2, y2, WALL) != WALL)
        {
            if (gs.get(1, x2, y2) == EMPTY)
            {
                // Just walk.
                lock(x1,y1,EMPTY); lock(x2,y2,LOCKED)
                addAnimation(250, [[x1,y1],[x2,y2]], function(context, dt) {
                    var x = S*(x1 + dt*(x2 - x1))
                    var y = S*(y1 + dt*(y2 - y1))
                    drawSpriteAt(context, parseInt(x), parseInt(y), p)
                }, function() {
                    gs.set(1, x2, y2, p)
                    onMoveComplete(true)
                })
            }
            else
            if (gs.get(1, x2, y2) > EMPTY && ((control_scheme&2) == 0 || !walking || explicit_move[player]))
            {
                if (gs.getRole(player) == PUSHER && gs.get(0, x3, y3, WALL) != WALL && gs.get(1, x3, y3) == EMPTY)
                {
                    // Push!
                    var o = gs.get(1, x2, y2)
                    lock(x1,y1,EMPTY); lock(x2,y2,LOCKED); lock(x3,y3,LOCKED)
                    addAnimation(375, [[x1,y1],[x2,y2],[x3,y3]], function(context, dt) {
                        var x = S*(x1 + dt*(x2 - x1))
                        var y = S*(y1 + dt*(y2 - y1))
                        drawSpriteAt(context, parseInt(x), parseInt(y), p)
                        var x = S*(x2 + dt*(x3 - x2))
                        var y = S*(y2 + dt*(y3 - y2))
                        drawSpriteAt(context, parseInt(x), parseInt(y), o)
                    }, function() {
                        gs.set(1, x2, y2, p)
                        gs.set(1, x3, y3, o)
                        onMoveComplete(false)
                    })
                }
                if (gs.getRole(player) == PULLER && gs.get(0, x0, y0, WALL) != WALL && gs.get(1, x0, y0) == EMPTY)
                {
                    // Pull!
                    var o = gs.get(1, x2, y2)
                    lock(x0,y0,LOCKED); lock(x1,y1,LOCKED); lock(x2,y2,EMPTY)
                    addAnimation(375, [[x0,y0],[x1,y1],[x2,y2]], function(context, dt) {
                        var x = S*(x1 + dt*(x0 - x1))
                        var y = S*(y1 + dt*(y0 - y1))
                        drawSpriteAt(context, parseInt(x), parseInt(y), p)
                        var x = S*(x2 + dt*(x1 - x2))
                        var y = S*(y2 + dt*(y1 - y2))
                        drawSpriteAt(context, parseInt(x), parseInt(y), o)
                    }, function() {
                        gs.set(1, x0, y0, p)
                        gs.set(1, x1, y1, o)
                        onMoveComplete(false)
                    })
                }
            }
        }
    }
    explicit_move[player] = false
}

function queuePostAnimation(f)
{
    if (animations.length == 0) f()
    else post_animations.push(f)
}

function updateStateFromHash()
{
    var params = hash.parse(document.location.hash)
    var new_level_code = params.game || "KKE"
    if (new_level_code != level_code)
    {
        level_code = new_level_code
        stringToLayers(level_code)
    }
}

function updateHashFromState()
{
    level_code = gs.encode()
    document.location.hash = hash.format({game: level_code})
}

function getLevelCode()
{
    return level_code
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
    return edit_mode
}

function setEditMode(arg)
{
    arg = !!arg
    queuePostAnimation(function() {
        if (arg != getEditMode())
        {
            edit_mode = arg
            if (!editor) editor = require("./editor.js")
            document.getElementById("ToolCanvas").style.display = edit_mode ? "inline-block" : "none" 
            editor.selectTool(-1)
            stringToLayers(getLevelCode())
            updateHashFromState()
        }
    })
}

function restart()
{
    queuePostAnimation(function() {
        stringToLayers(getLevelCode())
    } )
}

function initialize()
{
    rpc.rpc({ method: 'listLevels' }, function(result) {
        if (result.error) alert(result.error)

        // Initialize level selection box:
        if (result.levels && result.levels.length > 0)
        {
            var select = document.getElementById("LevelSelect")
            while (select.firstChild) select.removeChild(select.firstChild)
            for (var i in result.levels)
            {
                var level = result.levels[i]
                var option = document.createElement("option")
                option.value = level.code
                option.appendChild(document.createTextNode(
                    (level.title || "Untitled") + " by " +
                    (level.author || "Anonymous") ))
                select.appendChild(option)
                if (level.code == level_code) option.selected = true
            }
            // Add blank template:
            var option = document.createElement("option")
            select.appendChild(option)
            var option = document.createElement("option")
            option.value="KKEAgkkkESSSSIJJJhkkkESSSSIJJJhkkkESSSS"
            option.appendChild(document.createTextNode("Blank Template"))
            select.appendChild(option)
        }
    })
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

    function ungrabPlayers()
    {
        for (var player = 0; player < 2; ++player)
        {
            if (grab_dir[player] < 0) continue
            var xy = gs.search(1, PLAYER1 + player)
            if (xy)
            {
                var x = xy[0], y = xy[1]
                client.redraw(x, y)
                client.redraw(x + DX[grab_dir[player]], y + DY[grab_dir[player]])
                grab_dir[player] = -1
            }
        }
    }

    var canvas = document.getElementById("GameCanvas")
    canvas.addEventListener("mousedown", function(event) {
        event.preventDefault(event)
        fixEventOffset(event, canvas)
        queuePostAnimation(function() {
            ungrabPlayers()
            click_x = parseInt(event.offsetX/S)
            click_y = parseInt(event.offsetY/S)
            if (edit_mode) editor.onCellClicked(gs, click_x, click_y, false)
            updateHashFromState()
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
                    ungrabPlayers()
                    click_x = x
                    click_y = y
                    if (edit_mode) editor.onCellClicked(gs, click_x, click_y, true)
                    updateHashFromState()
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
        editor.selectTool(3*(2 - y) + x)
    })

    document.addEventListener("keydown", function(event) {

        // Don't steal browser's keyboard shortcuts
        if (event.altKey || event.ctrlKey) return

        // Don't steal input from form elements:
        if (document.activeElement && ( document.activeElement.tagName == "INPUT" ||
                                        document.activeElement.tagName == "SELECT" )) return

        var handled = true

        switch (event.keyCode)
        {
        case 80: swap_controls = !swap_controls; redraw(); break  // P

        case 48: case  96:  // 0
        case 49: case  97:  // 1
        case 50: case  98:  // etc.
        case 51: case  99:
        case 52: case 100:
        case 53: case 101:
        case 54: case 102:
        case 55: case 103:
        case 56: case 104:
        case 57: case 105:
            if (edit_mode) editor.selectTool((event.keyCode - 48)%48 - 1); break

        case 37: movePlayer(0 + swap_controls, 2); break  // <-
        case 38: movePlayer(0 + swap_controls, 3); break  //  ^
        case 39: movePlayer(0 + swap_controls, 0); break  // ->
        case 40: movePlayer(0 + swap_controls, 1); break  // v

        case 87: movePlayer(1 - swap_controls, 3); break  // gs.getWidth()
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

        case 87: movePlayer(1 - swap_controls, ~3); break  // gs.getWidth()
        case 65: movePlayer(1 - swap_controls, ~2); break  // A
        case 83: movePlayer(1 - swap_controls, ~1); break  // S
        case 68: movePlayer(1 - swap_controls, ~0); break  // D
        }
    })

    if (document.location.hash) updateStateFromHash()
    else setLevelCode(document.getElementById('LevelSelect').value)
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
    if (what == PLAYER1 + swap_controls) return 'rgba(128,0,0,' + a + ')'
    if (what == PLAYER2 - swap_controls) return 'rgba(0,0,160,' + a + ')'
}

function drawSpriteAt(context, x, y, what, offset_dir)
{
    function drawCellOutline()
    {
        context.beginPath()
        context.rect(x, y, S, S)
        context.clip()
        context.strokeStyle = '#d0d0d0'
        context.lineWidth   = 1  // FIXME: should be dependent on S?
        // if (layer1[y][x] == LOCKED) context.strokeStyle = 'red'
        context.strokeRect(x + 0.5, y + 0.5, S - 0.5, S - 0.5)
    }

    context.save()
    switch (what)
    {
    case OPEN:
        drawCellOutline()
        break

    case GOAL:
        context.beginPath()
        context.rect(x, y, S, S)
        context.clip()
        context.beginPath()
        for (var i = -4; i <= 4; ++i)
        {
            context.moveTo(x + i*0.25*S - 0.1*S, y + S + 0.1*S)
            context.lineTo(x + S + i*0.25*S + 0.1*S, y - 0.1*S)
        }
        context.lineWidth   = 0.1*S
        context.strokeStyle = 'rgba(64,255,64,0.75)'
        context.stroke()
        break

    case GOAL1:
    case GOAL2:
        drawCellOutline()
        context.strokeStyle = getFillStyle(what - GOAL1 + PLAYER1, "0.5")
        context.lineWidth   = 0.1*S
        for (var i = 1; i <= 3; ++i)
        {
            context.beginPath()
            context.arc(x + S/2, y + S/2, 0.15*S*i, 0, Math.PI*2)
            context.closePath()
            context.stroke()
        }
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
        if (gs.getRole(what - PLAYER1) == PULLER)
        {
            context.clip()
            context.beginPath()
            context.moveTo(x, y + S)
            context.lineTo(x + S, y)
            context.lineWidth = 0.25*S
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

function renderGame(context)
{
    if (game_dirty)
    {
        console.log("Full redraw!")  // TEMP: for debugging
        context.clearRect(0, 0, gs.getWidth()*S, gs.getHeight()*S)
    }
    else
    {
        for (var y = 0; y < gs.getHeight(); ++y)
        {
            for (var x = 0; x < gs.getWidth(); ++x)
            {
                // Always redraw grabbing players:
                var i = gs.get(1, x, y) - PLAYER1
                if (i >= 0 && i < 2 && grab_dir[i] >= 0) dirty[y][x] = true

                if (dirty[y][x]) context.clearRect(S*x, S*y, S, S)
            }
        }
    }

    // Draw ground layer:
    for (var y = 0; y < gs.getHeight(); ++y)
    {
        for (var x = 0; x < gs.getWidth(); ++x)
        {
            if (game_dirty || dirty[y][x])
            {
                drawSpriteAt(context, S*x, S*y, gs.get(0, x, y))
            }
        }
    }

    // Draw object layer:
    for (var y = 0; y < gs.getHeight(); ++y)
    {
        for (var x = 0; x < gs.getWidth(); ++x)
        {
            if (game_dirty || dirty[y][x])
            {
                var what = gs.get(1, x, y)
                if (what > EMPTY)
                {
                    var player = what - PLAYER1
                    drawSpriteAt( context, S*x, S*y, gs.get(1, x, y),
                        player >= 0 && player < 2 &&
                        gs.getRole(player) == PULLER ? grab_dir[player] : -1 )
                }
                dirty[y][x] = false
            }
        }
    }
    game_dirty = false

    // Draw active animations:
    if (animations.length > 0)
    {
        var time = new Date().getTime()
        for (var i = 0; i < animations.length; ++i)
        {
            var anim = animations[i]
            if (!animations[i](context, time)) animations.splice(i--, 1)
        }
    }
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
    context.save()
    renderGame(context)
    context.restore()

    if (getEditMode())
    {
        var canvas = document.getElementById("ToolCanvas")
        var context = canvas.getContext("2d")
        context.save()
        context.clearRect(0, 0, canvas.width, canvas.height)
        editor.renderTools(context)
        context.restore()
    }
}


// Seriously, browser-makers, get your act together!
var requestAnimationFrame = window.requestAnimationFrame ||
                            window.webkitRequestAnimationFrame ||
                            window.mozRequestAnimationFrame ||
                            window.msRequestAnimationFrame ||
                            window.oRequestAnimationFrame ||
                            function(f) { return setTimeout(f, 50) }

function redraw(x, y)
{
    if (!frame_requested)
    {
        requestAnimationFrame(render)
        frame_requested = true
    }
    if (typeof(x) != 'undefined')
    {
        dirty[y][x] = true
    }
    else
    {
        game_dirty  = true
        tools_dirty = true
    }
}

function redrawTools()
{
    if (!frame_requested)
    {
        requestAnimationFrame(render)
        frame_requested = true
    }
    tools_dirty = true
}

function onSubmitLevel()
{
    rpc.rpc({
        method: 'submitLevel',
        code:   getLevelCode(),
        title:  document.getElementById('Title').value || "Untitled",
        author: document.getElementById('Author').value || "Anonymous"
    }, function(result) {
        if (result.error)
        {
            alert(result.error)
        }
        else
        {
            document.getElementById('Title').value = ''
            document.getElementById('Author').value = ''
            if (result.message) alert(result.message)
        }
    })
    return false  // suppress form submission
}

module.exports = {
    initialize:         initialize,
    getEditMode:        getEditMode,
    setEditMode:        setEditMode,
    getLevelCode:       getLevelCode,
    setLevelCode:       setLevelCode,
    onSubmitLevel:      onSubmitLevel,
    getControlScheme:   function() { return control_scheme },   // TEMP: for testing
    setControlScheme:   function(val) { control_scheme = val }, // TEMP: for testing
    getGameState:       function() { return gs },
    drawSpriteAt:       drawSpriteAt,       // used by editor
    redraw:             redraw,             // used by editor
    redrawTools:        redrawTools }       // used by editor
