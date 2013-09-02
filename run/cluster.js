var cluster = require('cluster'),
    os = require('os');


module.exports = function(config, app) {

    cluster.setupMaster({
        exec: __dirname + 'server.clustered.js',
        args: app
    });

    var workerCount = config.workers || os.cpus().length;

    for (var i = 0; i < workerCount; i++) {
        cluster.fork();
    }

    cluster.on('exit', function(worker) {
        cluster.fork();
    });

};