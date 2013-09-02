var session = {},
    common = require('./../../utils/common.js'),
    async = require('./../../utils/async.min.js'),
    events = require('./events.js'),
    usage = require('./usage.js');

(function (session) {

    session.write = function(request) {
        var updateSessions = {};
        common.fillTimeObject(request, updateSessions, common.dbMap['events']);
        common.db.collection('sessions').update({'_id':request.params.app_id}, {'$inc':updateSessions}, {'upsert':true}, function(err, res){});

        if (request.params.events) {
            events.processEvents(request);
        } else if (request.config.safe) {
            request.message(200, 'Success');
        }

        if (request.params.begin_session) {
            usage.beginUserSession(request);
        } else if (request.params.end_session) {
            if (request.params.session_duration) {
                usage.processSessionDuration(request, function () {
                    usage.endUserSession(request);
                });
            } else {
                usage.endUserSession(request);
            }
        } else if (request.params.session_duration) {
            usage.processSessionDuration(request);
        } else {
            return false;
        }

    }

}(session));

module.exports = session;