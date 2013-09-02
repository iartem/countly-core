var CountlyServer = require('../run/server.js'),
    cluster = require('../run/cluster.js'),
    common = require('./utils/common.js'),
    config = common.config.api,
    endpoints = require('./parts/endpoints.api.js');

var server = cluster(config, 'api');
