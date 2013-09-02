var cluster = require('cluster'),
    os = require('os');


module.exports = function(config, app) {

    cluster.setupMaster({
        exec: __dirname + '/server.clustered.js',
        args: [app]
    });

    var workerCount = config.workers || os.cpus().length;

    for (var i = 0; i < workerCount; i++) {
        cluster.fork();
    }

    cluster.on('fork', function(worker) {
        console.log('Forked new worker: ' + worker.id)
    });

    cluster.on('online', function(worker) {
        console.log('New worker is online: ' + worker.id);
    });

    cluster.on('listening', function(worker, address) {
        console.log('Listening new worker: ' + worker.id + ' on address ' + address)
    });

    cluster.on('exit', function(worker) {
        cluster.fork();
    });

};