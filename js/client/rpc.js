"use strict"

function rpc(args, callback)
{
    var request = new XMLHttpRequest()
    request.open("POST", "/rpc", true)
    request.onreadystatechange = function() {
        if (request.readyState == 4)
        {
            var response
            try { response = JSON.parse(request.responseText) }
            catch (e) { response = null }
            if (response instanceof Object) callback(response)
            else alert("RPC failed!  Server returned: " + request.responseText)
        }
    }
    request.setRequestHeader("Content-Type", "application/json")
    request.send(JSON.stringify(args))
}

exports.rpc = rpc
