"use strict"

// Duokoban game server implementation

var GameState   = require("../common/GameState.js")
var pg          = require('pg')
var database    = null

function validateLevel(code)
{
    var gs = GameState(code)
    if (gs.encode() != code) return "Level code is not canonical!"
    var h = gs.getHeight(), w = gs.getWidth()
    if (h < 2 || w < 2) return "Level is too small!"
    var player1 = 0, player2 = 0
    for (var y = 0; y < gs.getHeight(); ++y)
    {
        for (var x = 0; x < gs.getWidth(); ++x)
        {
            var a = gs.get(0, x, y)
            var b = gs.get(1, x, y)
            if (a > GOAL2)   return "Invalid layer0 value!"
            if (b > PLAYER2) return "Invalid layer1 value!"
            if (b == PLAYER1) ++player1
            if (b == PLAYER2) ++player2
        }
    }
    if (player1 == 0) return "Missing player 1!"
    if (player2 == 0) return "Missing player 2!"
    if (player1 > 1) return "Too many player 1s!"
    if (player2 > 1) return "Too many player 2s!"
}

function propagateError(callback, onSuccess)
{
    return function(err, result) {
        if (err) callback(err)
        else onSuccess(result)
    }
}

function listen(server, callback)
{
    database = new pg.native.Client(process.env.DATABASE_URL)
    database.connect(function(error) {
        if (error)
        {
            console.log("WARNING: falling back to non-native Postgres client library")
            database = new pg.Client(process.env.DATABASE_URL)
            database.connect(callback)
        }
        else
        {
            callback(null)
        }
    })
}

function submitLevel(code, title, author, callback)
{
    var problem = validateLevel(code)
    if (problem)
    {
        callback(problem)
        return
    }

    database.query( 'SELECT 1 FROM levels WHERE code=$1', [code], function(error, result) {
        if (error)
        {
            console.log(error)
            callback("Database error on SELECT!")
            return
        }
        if (result.rows.length > 0)
        {
            callback("Game already exists!")
            return
        }
        database.query( 'INSERT INTO levels (code, title, author) VALUES ($1,$2,$3) RETURNING(level_id)', [code,title,author], function(error, result) {
            if (error)
            {
                console.log(error)
                callback("Database error on INSERT!")
                return
            }
            var level_id = result.rows[0].level_id
            console.log("Accepted level " + level_id + ".")
            callback(null, "Thanks for your submission!")
        })
    })
}

function voteLevel(code, property, vote, oldVote, callback)
{
    if (isNaN(vote) || vote < 1 || vote > 5 || oldVote > 5)
    {
        callback("Invalid vote!")
        return
    }
    if (property != "difficulty" && property != "fun")
    {
        callback("Invalid property!")
        return
    }
    database.query('SELECT level_id,title FROM levels WHERE code=$1', [code], function(error, result) {
        if (error)
        {
            console.log(error)
            callback("Database error on SELECT!")
            return
        }
        if (result.rows.length < 1)
        {
            callback("Level not found!")
            return
        }
        var level_id = result.rows[0].level_id
        database.query('INSERT INTO votes (level_id, property, value) VALUES ($1, $2, $3)', [level_id, property, 2.5], function() {
            // if the above query failed, it is probably because the row already existed, so try to update anyway:

            function queryCallback(error) {
                if (error)
                {
                    console.log(error)
                    callback("Database error on UPDATE!")
                    return
                }
                callback(null, "Thanks for your vote!")
            }

            if (oldVote > 0)
            {
                console.log("Changing vote from " + oldVote + " to " + vote + " on " + property +
                            " for level " + level_id + " (" + result.rows[0].title + ")")
                database.query('UPDATE votes SET (value,sum,count) = (1.0*(sum+$3)/(count+1), sum+$3, count) WHERE level_id=$1 AND property=$2 AND count > 0',
                               [level_id, property, (vote - oldVote)], queryCallback )
            }
            else
            {
                console.log("Storing vote " + vote + " on " + property +
                            " for level " + level_id + " (" + result.rows[0].title + ")")
                database.query('UPDATE votes SET (value,sum,count) = (1.0*(sum+$3)/(count+1), sum+$3, count+1) WHERE level_id=$1 AND property=$2',
                               [level_id, property, vote], queryCallback)
            }
        })
    })
}

function listLevels(callback)
{
    database.query( 'SELECT code,title,author FROM levels ORDER BY created_at ASC, level_id ASC', function(error, result) {
        if (error)
        {
            console.log(error)
            callback("Database error on SELECT!")
            return
        }
        callback(null, result.rows)
    })
}

module.exports = {
    listen:         listen,
    submitLevel:    submitLevel,
    voteLevel:      voteLevel,
    listLevels:     listLevels }
