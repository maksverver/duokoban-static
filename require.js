"use strict"

var required_modules = {}

/* node.js-like module system based around a single function: require().

   Note: this implementation supports relative URLs only; in particular,
         cross-origin requests are imposible.
*/
function require(url, parent)
{
    var src = parent ? parent.filename : document.location.toString()

    // Create absolute URL from relative path:
    url = src.replace(/[^/]*(#.*)?$/, "") + url
    while (url.indexOf("/./") >= 0)  url = url.replace("/./", "/")
    while (url.indexOf("/../") >= 0) url = url.replace(/\/[^/]*\/\.\.\//, "/")

    // Check module registry for loaded module::
    if (required_modules[url]) return required_modules[url].exports
    var module = required_modules[url] = {
        id: url, filename: url, parent: parent, loaded: false, exports: {} }

    // Retrieve the source file with a synchronous XMLHttpRequest
    var http = new XMLHttpRequest()
    http.open("GET", url, false)
    http.send()
    if (http.status != 200)
    {
        alert("Failed to retrieve required URL:\n" + url)
        return
    }

    var func = eval("(function(module,exports,require){" + http.responseText + "})")
    func(module, module.exports, function(arg){return require(arg, module)})
    module.loaded = true
    return module.exports
}
