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
    listLevels:     listLevels }
