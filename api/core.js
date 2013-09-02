var CountlyServer = require('../run/server.js'),
    common = require('./utils/common.js'),
    config = common.config.api,
    endpoints = require('./parts/endpoints.api.js');

var server = CountlyServer.Server(config, endpoints);
