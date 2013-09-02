var CountlyServer = require('server.js');

var app = process.argv.slice(2)[0],
    endpointsProducer = require('../' + app + '/parts/endpoints.' + app + '.js');
    common = require('../api/utils/common.js');

var server = CountlyServer.Server(common.config[app], endpointsProducer)
