"use strict"

var duokoban    = require('./js/server/server.js')
var express     = require('express')
var http        = require('http')
var url         = require('url')

var port         = process.env.PORT || 8027
var app          = express()
app.use('/',          express.static(__dirname + '/html'))
app.use('/js/common', express.static(__dirname + '/js/common'))
app.use('/js/client', express.static(__dirname + '/js/client'))

app.use('/rpc', express.bodyParser())
app.use('/rpc', function(request, response, next) {

    if (url.parse(request.url).pathname != "/" || request.method != "POST")
    {
        return next()
    }

    try
    {
        switch (request.body.method)
        {
        case 'submitLevel':
            duokoban.submitLevel(request.body.code, request.body.title, request.body.author, function(error, message) {
                response.json({error: error || undefined, message:message})
            })
            break

        case 'voteLevel':
            duokoban.voteLevel(request.body.code, request.body.property, parseInt(request.body.vote), function(error, message) {
                response.json({error: error || undefined, message:message})
            })
            break

        case 'listLevels':
            duokoban.listLevels(function(error, levels) {
                response.json({error: error || undefined, levels: levels})
            })
            break

        default:
            response.send(403)
        }
    }
    catch (err)
    {
        console.log("Error caught in RPC request handler: " + err)
        response.send(500)
    }
})

var server = http.createServer(app)
duokoban.listen(server, function(error) {
    if (error)
    {
        console.log("Failed to start Duokoban server: " + error)
    }
    else
    {
        server.listen(port)
        console.log("Duokoban server listening on port " + port + ".")
    }
})
