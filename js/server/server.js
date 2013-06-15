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

exports.listen = function(server, callback)
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
