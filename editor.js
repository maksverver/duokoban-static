"use strict"

var client = require("./client.js")

// Note: these "constants" are intended to match those in GameState.js:
var WALL = 0, OPEN = 1, GOAL = 2, GOAL1 = 3, GOAL2 = 4
var EMPTY = 0, BOX = 5, PLAYER1 = 6, PLAYER2  = 7, REFRAME = 8, LOCKED = -1
var PUSHER = 0, PULLER = 1

var S = 40          // bitmap tile size (in pixels) (see also client.js)

// Tool box contents
var tools = [ WALL,  OPEN,    REFRAME,
              GOAL,  GOAL1,   GOAL2,
              BOX,   PLAYER1, PLAYER2 ]

var selected_tool  = -1             // index in the tool box array:
var negative       = false
var reframe_active = false

function renderTools(context)
{
    for (var i = 0; i < tools.length; ++i)
    {
        var x = i%3, y = 2 - (i - x)/3
        if (i == selected_tool || (tools[i] == REFRAME && reframe_active))
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
        client.drawSpriteAt(context, (0.1 + 1.1*x)*S, (0.1 + 1.1*y)*S, tools[i])
    }
}

function selectTool(i)
{
    if (i < -1 || i >= tools.length) i = -1

    if (tools[i] == REFRAME)
    {
        reframe_active = !reframe_active
    }
    else
    {
        selected_tool = (i == selected_tool) ? -1 : i
    }
    client.redrawTools()
}

function onCellClicked(gs, x, y, dragged)
{
    var tool = tools[selected_tool]

    if (tool > OPEN)
    {
        if (!dragged) negative = (gs.get(tool >= BOX ? 1 : 0, x, y) == tool);
        if (!negative && gs.get(0, x, y) == WALL) gs.set(0, x, y, OPEN)
    }

    switch (tool)
    {
    case WALL:
    case OPEN:
        gs.set(0, x, y, tool)
        gs.set(1, x, y, EMPTY)
        break

    case GOAL:
    case GOAL1:
    case GOAL2:
        if (negative)
        {
            if (gs.get(0, x, y) == tool) gs.set(0, x, y, OPEN)
        }
        else
        {
            if (tool != GOAL)
            {
                var xy = gs.search(0, tool);
                if (xy)
                {
                    gs.set(0, xy[0], xy[1], OPEN)
                    client.redraw(xy[0], xy[1])
                }
            }
            gs.set(0, x, y, tool)
        }
        break;

    case BOX:
        if (negative)
        {
            if (gs.get(1, x, y) == BOX) gs.set(1, x, y, EMPTY)
        }
        else
        {
            gs.set(1, x, y, BOX)
        }
        break

    case PLAYER1:
    case PLAYER2:
        if (negative)
        {
            if (!dragged)
            {
                switch (gs.getRole(tool - PLAYER1))
                {
                case PUSHER:
                    gs.setRole(tool - PLAYER1, PULLER)
                    break
                default:
                    gs.setRole(tool - PLAYER1, PUSHER)
                    gs.set(1, x, y, EMPTY)
                    break
                }
            }
        }
        else
        {
            var xy = gs.search(1, tool)
            if (xy)
            {
                gs.set(1, xy[0], xy[1], EMPTY)
                client.redraw(xy[0], xy[1])
            }
            gs.set(1, x, y, tool)
        }
        break

    default:
        return
    }
    if (reframe_active && gs.reframe())
    {
        client.setLevelCode(gs.encode())
    }
    else
    {
        client.redraw(x, y)
    }
}

module.exports = {
    renderTools:    renderTools,
    selectTool:     selectTool,
    onCellClicked:  onCellClicked }
