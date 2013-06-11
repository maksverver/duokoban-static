"use strict"

/* TODO:

    Smoother player movement!
    (Should queue moves or check if movement keys are down or something.)

 */

var S = 40          // bitmap tile size (in pixels)
var W = 10          // grid width (in tiles)
var H = 10          // grid height (in tiles)

var OPEN = 0
var GOAL = 1
var WALL = 2

var LOCKED   = -1
var EMPTY    =  0
var BOX      =  3
var PLAYER1  =  4
var PLAYER2  =  5

var layer0 = createGrid(WALL)
var layer1 = createGrid(EMPTY)

var selectedTool = 0
var animations = []

function redraw()
{
    // Seriously, browser-makers, get your act together!
    var requestAnimationFrame = window.requestAnimationFrame ||
                                window.webkitRequestAnimationFrame ||
                                window.mozRequestAnimationFrame ||
                                window.msRequestAnimationFrame ||
                                window.oRequestAnimationFrame ||
                                function(f) { return setTimeout(f, 50) }

    requestAnimationFrame(render)
}

function inBounds(x, y)
{
    return 0 <= x && x < W && 
           0 <= y && y < H
}

function createGrid(value)
{
    var grid = []
    for (var y = 0; y < H; ++y)
    {
        grid.push([])
        for (var x = 0; x < W; ++x)
        {
            grid[y].push(value)
        }
    }
    return grid
}

function findOnGrind(grid, val)
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

function onCellClicked(x,y, dragged)
{
    if (!inBounds(x, y) || (dragged && selectedTool > 2)) return
    switch (selectedTool)
    {
    case 1:
        if (layer0[y][x] == OPEN && layer1[y][x] == EMPTY) layer0[y][x] = WALL; break
    case 2:
        if (layer0[y][x] == WALL) layer0[y][x] = OPEN; break
    case 3:
        if (layer0[y][x] == OPEN) layer0[y][x] = GOAL; else
        if (layer0[y][x] == GOAL) layer0[y][x] = OPEN; break
    case 4:
        if (layer0[y][x] != WALL && layer1[y][x] == EMPTY) layer1[y][x] = BOX; else
        if (layer1[y][x] == BOX) layer1[y][x] = EMPTY; break
    case 5:
    case 6:
        var p = PLAYER1 + (selectedTool - 5)
        if (layer0[y][x] != WALL && layer1[y][x] == EMPTY)
        {
            replaceOnGrid(layer1, p, EMPTY)
            layer1[y][x] = p;
        }
        else if (layer1[y][x] == p && !dragged) layer1[y][x] = EMPTY;
        break
    }
    redraw()
}

function movePlayer(p, dx, dy)
{
    p += PLAYER1
    var xy = findOnGrind(layer1, p)
    if (!xy) return
    var x1 = xy[0], x2 = x1 + dx, x3 = x2 + dx
    var y1 = xy[1], y2 = y1 + dy, y3 = y2 + dy
    if (inBounds(x2, y2) && layer0[y2][x2] != WALL)
    {
        if (layer1[y2][x2] == OPEN)
        {
            var start = new Date().getTime()
            layer1[y1][x1] = LOCKED
            layer1[y2][x2] = LOCKED
            animations.push(function(context, time) {
                var dt = (time - start)/250
                if (dt >= 1)
                {
                    layer1[y1][x1] = EMPTY
                    layer1[y2][x2] = p
                    dt = 1
                }
                var x = S*(x1 + dt*(x2 - x1))
                var y = S*(y1 + dt*(y2 - y1))
                drawSpriteAt(context, parseInt(x), parseInt(y), p)
                return dt < 1
            })
            redraw()
        }
        else
        if (inBounds(x3, y3) && layer0[y3][x3] != WALL && layer1[y3][x3] == OPEN)
        {
            var start = new Date().getTime()
            var o = layer1[y2][x2]
            layer1[y1][x1] = LOCKED
            layer1[y2][x2] = LOCKED
            layer1[y3][x3] = LOCKED
            animations.push(function(context, time) {
                var dt = (time - start)/250
                if (dt >= 1)
                {
                    layer1[y1][x1] = EMPTY
                    layer1[y2][x2] = p
                    layer1[y3][x3] = o
                    dt = 1
                }
                var x = S*(x1 + dt*(x2 - x1))
                var y = S*(y1 + dt*(y2 - y1))
                drawSpriteAt(context, parseInt(x), parseInt(y), p)
                var x = S*(x2 + dt*(x3 - x2))
                var y = S*(y2 + dt*(y3 - y2))
                drawSpriteAt(context, parseInt(x), parseInt(y), o)
                return dt < 1
            })
            redraw()
        }
    }
}

function initialize()
{
    layer0 = createGrid(WALL)
    layer1 = createGrid(EMPTY)

    // TEMP -- for testing!
    for (var y = 1; y <= 3; ++y)
    {
        for (var x = 1; x <= 5; ++x) layer0[y][x] = OPEN
        layer1[y][3] = BOX
        layer0[y][3] = GOAL
    }
    layer1[2][1] = PLAYER1
    layer1[2][5] = PLAYER2

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

    var canvas = document.getElementById("GameCanvas")

    canvas.addEventListener("mousedown", function(event) {
        event.preventDefault(event)
        fixEventOffset(event, canvas)
        onCellClicked(parseInt(event.offsetX/S), parseInt(event.offsetY/S), false)
    })
    canvas.addEventListener("mousemove", function(event) {
        if (leftButtonDown)
        {
            event.preventDefault(event)
            fixEventOffset(event, canvas)
            onCellClicked(parseInt(event.offsetX/S), parseInt(event.offsetY/S), true)
        }
    })

    document.addEventListener("keydown", function(event) {
        var handled = true
        switch (event.keyCode)
        {
        case 48: selectedTool = 0; break // 0
        case 49: selectedTool = 1; break // 1
        case 50: selectedTool = 2; break // 2
        case 51: selectedTool = 3; break // 3
        case 52: selectedTool = 4; break // 4
        case 53: selectedTool = 5; break // 5
        case 54: selectedTool = 6; break // 6

        case 37: movePlayer(0, -1,  0); break // <-
        case 38: movePlayer(0,  0, -1); break //  ^
        case 39: movePlayer(0, +1,  0); break // ->
        case 40: movePlayer(0,  0, +1); break // v

        case 87: movePlayer(1,  0, -1); break // w
        case 65: movePlayer(1, -1,  0); break // a
        case 83: movePlayer(1,  0, +1); break // s
        case 68: movePlayer(1, +1,  0); break // d

        default: handled = false
        }
        if (handled) event.preventDefault()
    })
    redraw()
}

function drawSpriteAt(context, x, y, what)
{
    context.save()
    switch (what)
    {
    case GOAL:
        context.lineWidth   = S/10
        context.strokeStyle = '#40ff40'
        context.strokeRect(x + 0.05*S, y + 0.05*S, 0.9*S, 0.9*S)
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
        context.beginPath()
        context.arc(x + S/2, y + S/2, 0.4*S, 0, Math.PI*2)
        context.closePath()
        context.fillStyle = what == PLAYER1 ? '#ff0000' :  '#0000ff'
        context.fill()
        context.strokeStyle = what == PLAYER1 ? '#a00000' :  '#0000a0'
        context.lineWidth = S/20
        context.stroke()
        break
    }
    context.restore()
}

function render()
{
    var canvas = document.getElementById("GameCanvas")
    var context = canvas.getContext("2d")
    context.clearRect(0, 0, W*S, H*S)

    // Draw ground layer:
    for (var x = 0; x < W; ++x)
    {
        for (var y = 0; y < H; ++y)
        {
            if (layer0[y][x] == OPEN)
            {
                context.save()
                context.strokeStyle = '#c0c0c0'
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
            if (layer1[y][x] != EMPTY)
            {
                drawSpriteAt(context, S*x, S*y, layer1[y][x])
            }
        }
    }

    if (animations.length > 0)
    {
        var time = new Date().getTime()
        for (var i = 0; i < animations.length; ++i)
        {
            var anim = animations[i]
            if (!animations[i](context, time))
            {
                animations.splice(i--, 1)
            }
        }
        redraw()
    }
}
