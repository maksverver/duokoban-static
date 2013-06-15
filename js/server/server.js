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

exports.listen = function(server, store)
{
    try
    {
        // First, try native client:
        database = new pg.native.Client(process.env.DATABASE_URL)
        database.connect()
    }
    catch (e)
    {
        // Fall back to JavaScript client:
        database = new pg.Client(process.env.DATABASE_URL)
        database.connect()
        console.log("WARNING: using non-native Postgres client library")
    }
}
