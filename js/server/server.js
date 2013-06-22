"use strict"

// Duokoban game server implementation

var pg          = require('pg')
var database    = null

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

function voteLevel(code, property, vote, callback)
{
    if (isNaN(vote) || vote < 1 || vote > 5)
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
            database.query('UPDATE votes SET (value,sum,count) = (1.0*(sum+$3)/(count+1), sum+$3, count+1) WHERE level_id=$1 AND property=$2',
                           [level_id, property, vote], function(error) {
                if (error)
                {
                    console.log(error)
                    callback("Database error on UPDATE!")
                    return
                }
                console.log("Storing vote " + vote + " on " + property + " for level " + level_id + " (" + result.rows[0].title + ")")
                callback(null, "Thanks for your vote!")
            })
        })
    })
}

function listLevels(callback)
{
    database.query( 'SELECT code,title,author FROM levels ORDER BY created_at ASC', function(error, result) {
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
