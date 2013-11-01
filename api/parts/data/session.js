var session = {},
    common = require('./../../utils/common.js'),
    async = require('./../../utils/async.min.js'),
    dims = require('./dimensions.js'),
    events = require('./events.js'),
    usage = require('./usage.js');

(function (session) {

    session.write = function(request) {
        var updateSessions = {};
        common.fillTimeObject(request, updateSessions, common.dbMap['events']);

        common.db.collection('app_users' + request.params.app_id).findOne({'_id': request.params.app_user_id}, function(err, dbAppUser){
            request.user = dbAppUser;

            dims.findOrUpdateAppUserDimensions(request);

            dims.updateAppIdWithDimensions(request, 'sessions', request.params.app_id, {'$inc': updateSessions}, {upsert: true});

            async.parallel([
                function(clb){
                    if (request.params.events) events.processEvents(request, clb);
                    else clb();
                },
                function(clb){
                    if (request.params.begin_session) {
                        usage.beginUserSession(request, clb);
                    } else if (request.params.end_session) {
                        if (request.params.session_duration) {
                            usage.processSessionDuration(request, function () {
                                usage.endUserSession(request, clb);
                            });
                        } else {
                            usage.endUserSession(request, clb);
                        }
                    } else if (request.params.session_duration) {
                        usage.processSessionDuration(request, clb);
                    } else {
                        clb();
                    }
                }
            ], function(err){
                if (err) request.message(err, 'Internal Error');
                else request.message(200, 'Success');
            });

        });

        return true;

//        if (request.params.events) {
//            events.processEvents(request);
//        } else if (request.config.safe) {
//            request.message(200, 'Success');
//        }
//
//        if (request.params.begin_session) {
//            usage.beginUserSession(request);
//        } else if (request.params.end_session) {
//            if (request.params.session_duration) {
//                usage.processSessionDuration(request, function () {
//                    usage.endUserSession(request);
//                });
//            } else {
//                usage.endUserSession(request);
//            }
//        } else if (request.params.session_duration) {
//            usage.processSessionDuration(request);
//        } else {
//            return false;
//        }

    }

}(session));

module.exports = session;