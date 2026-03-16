const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const url = require("url");

const PORT = process.env.PORT || 3000;

// Persist 24PetConnect session cookies across proxy requests so the server
// honours stateful parameters like Miles (radius).
var petConnectCookies = {};

function mergeCookies(setCookieHeaders) {
  if (!setCookieHeaders) return;
  var list = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  list.forEach(function(hdr) {
    var pair = hdr.split(";")[0].trim();
    var eq = pair.indexOf("=");
    if (eq > 0) petConnectCookies[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  });
}

function buildCookieHeader() {
  return Object.keys(petConnectCookies).map(function(k) { return k + "=" + petConnectCookies[k]; }).join("; ");
}

function proxy(targetUrl, method, headers, body, res, isPetConnect) {
  const parsed = new URL(targetUrl);
  const fwdHeaders = Object.assign({}, headers);

  fwdHeaders.host = parsed.hostname;
  fwdHeaders.origin = "https://" + parsed.hostname;
  fwdHeaders.referer = "https://" + parsed.hostname + "/";

  ["sec-fetch-dest","sec-fetch-mode","sec-fetch-site","sec-ch-ua","sec-ch-ua-mobile","sec-ch-ua-platform","accept-encoding"]
    .forEach(function(h) { delete fwdHeaders[h]; });

  if (isPetConnect) {
    var cookieStr = buildCookieHeader();
    if (cookieStr) fwdHeaders.cookie = cookieStr;
  }

  const opts = {
    hostname: parsed.hostname, port: 443,
    path: parsed.pathname + parsed.search,
    method: method, headers: fwdHeaders,
  };

  const pReq = https.request(opts, function(pRes) {
    if (isPetConnect) mergeCookies(pRes.headers["set-cookie"]);
    res.writeHead(pRes.statusCode, {
      "Content-Type": pRes.headers["content-type"] || "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    });
    pRes.pipe(res);
  });
  pReq.on("error", function(err) {
    console.error("Proxy error:", err.message);
    res.writeHead(502, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ error: err.message }));
  });
  if (body) pReq.write(body);
  pReq.end();
}

http.createServer(function(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    });
    return res.end();
  }

  var parsed = url.parse(req.url, true);

  if (parsed.pathname === "/" || parsed.pathname === "/index.html") {
    return fs.readFile(path.join(__dirname, "index.html"), function(err, data) {
      if (err) { res.writeHead(404); return res.end("Not found"); }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(data);
    });
  }

  if (parsed.pathname === "/api/geocode") {
    var zip = parsed.query && parsed.query.zip;
    if (!zip) {
      res.writeHead(400, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      return res.end(JSON.stringify({ error: "Missing zip parameter" }));
    }
    var geoUrl = "https://nominatim.openstreetmap.org/search?postalcode=" + encodeURIComponent(zip) + "&country=US&format=json&limit=1";
    var geoHeaders = { "user-agent": "PawSwipe/1.0 (adopt-dogs local dev)", "accept": "application/json" };
    proxy(geoUrl, "GET", geoHeaders, null, res);
    return;
  }

  if (parsed.pathname.indexOf("/api/petconnect/") === 0) {
    var ep = parsed.pathname.replace("/api/petconnect/", "");
    var body = "";
    req.on("data", function(c) { body += c; });
    return req.on("end", function() {
      proxy("https://24petconnect.com/" + ep, req.method, req.headers, body, res, true);
    });
  }

  if (parsed.pathname === "/get_animals.js") {
    return fs.readFile(path.join(__dirname, "get_animals.js"), function(err, data) {
      if (err) { res.writeHead(404); return res.end("Not found"); }
      res.writeHead(200, { "Content-Type": "application/javascript" });
      res.end(data);
    });
  }

  if (parsed.pathname === "/breeds.json") {
    return fs.readFile(path.join(__dirname, "breeds.json"), function(err, data) {
      if (err) { res.writeHead(404); return res.end("Not found"); }
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(data);
    });
  }

  res.writeHead(404);
  res.end("Not found");

}).listen(PORT, function() {
  console.log("Server running at http://localhost:" + PORT);
});
