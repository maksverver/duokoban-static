"use strict"

var rpc = require("./rpc.js")

var current_level = null
var vote_in_progress = false
var storage = localStorage || {}

function getCurrentVote(property)
{
    return storage["vote-" + current_level + '-' + property]
}

function setCurrentVote(property, vote)
{
    storage["vote-" + current_level + '-' + property] = vote
}

function vote(property, vote)
{
    if (!current_level || vote_in_progress) return
    vote_in_progress = true
    rpc.rpc({ method: 'voteLevel', code: current_level, property: property,
              vote: vote, oldVote: getCurrentVote(property) },
            function(response) {
        vote_in_progress = false
        if (response.error)
        {
            alert("The server reported an error: " + response.error)
        }
        else
        {
            console.log("The server said: " + response.message)
            setCurrentVote(property, vote)
            updateWidget(current_level)
        }
    })
}

function updateWidget(code)
{
    current_level = code
    var properties = ["fun", "difficulty"]
    for (var i in properties)
    {
        var property = properties[i]
        var vote = getCurrentVote(property) || 0
        for (var i = 1; i <= 5; ++i)
        {
            var elem = document.getElementById(property + i)
            elem.className = "star " + (vote < i ? "open" : "closed") + " clickable"
        }
    }
}

exports.vote         = vote
exports.updateWidget = updateWidget
