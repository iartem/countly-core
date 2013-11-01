var http = require('http'),
    express = require('express'),
    SkinStore = require('connect-mongoskin'),
    mongo = require('mongoskin'),
    request = require('request'),
    countlyConfig = require('./config'),
    connectionString = (typeof countlyConfig.mongodb === "string")? countlyConfig.mongodb : (countlyConfig.mongodb.host + ':' + countlyConfig.mongodb.port + '/' + countlyConfig.mongodb.db + '?auto_reconnect=true&safe=true'),
    connectionOptions = {
        safe:true,
        username: countlyConfig.mongodb.username || '',
        password: countlyConfig.mongodb.password || ''
    },
    countlyDb = mongo.db(connectionString, connectionOptions),
    endpoints = require('./endpoints.frontend.js')(countlyDb, countlyConfig);

var app = express();

app.configure(function () {
    app.engine('html', require('ejs').renderFile);
    app.set('views', __dirname + '/views');
    app.set('view engine', 'html');
    app.set('view options', {layout:false});
    app.use(express.bodyParser({uploadDir:__dirname + '/uploads'}));
    app.use(express.cookieParser());
    app.use(express.session({
        secret:'countlyss',
        store:new SkinStore(countlyDb)
    }));
    app.use(require('connect-flash')());
    app.use(function(req, res, next) {
        res.locals.flash = req.flash.bind(req);
        next();
    });
    app.use(express.methodOverride());
    app.use(express.csrf());
    app.use(app.router);
    var oneYear = 31557600000;
    app.use(express.static(__dirname + '/public'), { maxAge:oneYear });
});

app.configure('development', function () {
    app.use(express.errorHandler({ dumpExceptions:true, showStack:true }));
});

app.configure('production', function () {
    app.use(express.errorHandler());
});

// calls app.get / app.post for each endpoint
function setEndpoints(method, endpoints) {
    for (var i in endpoints[method]) {
        var endpoint = endpoints[method][i],
            params = [i].concat(endpoint.length ? endpoint : [endpoint]);
        app[method].apply(app, params);
    }
}

setEndpoints('get', endpoints);

setEndpoints('post', endpoints);

app.listen(countlyConfig.web.port, countlyConfig.web.host  || '');

// Fix