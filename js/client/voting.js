"use strict"

var rpc = require("./rpc.js")

var current_level
var votes = {}

function getCurrentVote(property)
{
    return votes[current_level + '-' + property]
}

function setCurrentVote(property, vote)
{
    votes[current_level + '-' + property] = vote
}

function vote(property, vote)
{
    if (!current_level || getCurrentVote(property)) return

    if (confirm("Do you want to rate this level " + vote + " on " + property + "?"))
    {
        rpc.rpc({ method: 'voteLevel', code: current_level,
                  property: property, vote: vote }, function(response) {
            if (response.error)
            {
                alert("The server reported an error: " + response.error)
            }
            else
            {
                setCurrentVote(property, vote)
                updateWidget(current_level)
                if (response.message) alert(response.message)
            }
        })
    }
}

function updateWidget(code)
{
    current_level = code
    var properties = ["fun", "difficulty"]
    for (var i in properties)
    {
        var property = properties[i]
        var vote = getCurrentVote(property)
        for (var i = 1; i <= 5; ++i)
        {
            var elem = document.getElementById(property + i)
            elem.className = "star " + (vote ? (vote < i ? "open" : "closed") : "open clickable")
        }
    }
}

exports.vote         = vote
exports.updateWidget = updateWidget
