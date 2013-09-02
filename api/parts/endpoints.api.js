var common = require('./../utils/common.js'),
    countlyApi = {
        data:{
            session:    require('./data/session.js'),
            usage:      require('./data/usage.js'),
            fetch:      require('./data/fetch.js'),
            events:     require('./data/events.js')
        },
        mgmt:{
            users:      require('./mgmt/users.js'),
            apps:       require('./mgmt/apps.js')
        }
    };

module.exports = function(CountlyServer){ return {
    '/i/bulk': function(request){
        var requests = request.params.requests,
            appKey = request.params.app_key;

        if (requests) {
            try {
                requests = JSON.parse(requests);
            } catch (SyntaxError) {
                console.log('Parse bulk JSON failed');
            }
        } else {
            request.message(400, 'Missing parameter "requests"');
            return false;
        }

        for (var i = 0; i < requests.length; i++) {

            if (!requests[i].app_key && !appKey) {
                continue;
            }

            request.params = {
                'app_id':'',
                'app_cc':'',
                'ip_address':requests[i].ip_address,
                'user':{
                    'country':requests[i].country_code || 'Unknown',
                    'city':requests[i].city || 'Unknown'
                },
                'queryString':{
                    'app_key':requests[i].app_key || appKey,
                    'device_id':requests[i].device_id,
                    'metrics':requests[i].metrics,
                    'events':requests[i].events,
                    'session_duration':requests[i].session_duration,
                    'begin_session':requests[i].begin_session,
                    'end_session':requests[i].end_session,
                    'timestamp':requests[i].timestamp
                }
            };

            if (!request.params.queryString.device_id) {
                continue;
            } else {
                request.params.app_user_id = common.crypto.createHash('sha1').update(request.params.queryString.app_key + request.params.queryString.device_id + "").digest('hex');
            }

            if (request.params.queryString.metrics) {
                if (request.params.queryString.metrics["_carrier"]) {
                    request.params.queryString.metrics["_carrier"] = request.params.queryString.metrics["_carrier"].replace(/\w\S*/g, function (txt) {
                        return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
                    });
                }

                if (request.params.queryString.metrics["_os"] && request.params.queryString.metrics["_os_version"]) {
                    request.params.queryString.metrics["_os_version"] = request.params.queryString.metrics["_os"][0].toLowerCase() + request.params.queryString.metrics["_os_version"];
                }
            }

            CountlyServer.validateAppForWriteAPI(countlyApi.data.session.write, request);
        }

        request.message(200, 'Success');

    },
    '/i/users': [{'api_key': {required: true}}, function(request){
        if (request.params.args) {
            try {
                request.params.args = JSON.parse(request.params.args);
            } catch (SyntaxError) {
                console.log('Parse /i/users JSON failed');
            }
        }

        switch (request.method) {
            case 'create':
                CountlyServer.validateUserForMgmtWriteAPI(countlyApi.mgmt.users.createUser, request);
                break;
            case 'update':
                CountlyServer.validateUserForMgmtWriteAPI(countlyApi.mgmt.users.updateUser, request);
                break;
            case 'delete':
                CountlyServer.validateUserForMgmtWriteAPI(countlyApi.mgmt.users.deleteUser, request);
                break;
            default:
                request.message(400, 'Invalid path, must be one of /create, /update or /delete');
                break;
        }

    }],
    '/i/apps': [{'api_key': {required: true}}, function(request){
        if (request.params.args) {
            try {
                request.params.args = JSON.parse(request.params.args);
            } catch (SyntaxError) {
                console.log('Parse /i/apps JSON failed');
            }
        }

        switch (request.method) {
            case 'create':
                CountlyServer.validateUserForMgmtWriteAPI(countlyApi.mgmt.apps.createApp, request);
                break;
            case 'update':
                CountlyServer.validateUserForMgmtWriteAPI(countlyApi.mgmt.apps.updateApp, request);
                break;
            case 'delete':
                CountlyServer.validateUserForMgmtWriteAPI(countlyApi.mgmt.apps.deleteApp, request);
                break;
            case 'reset':
                CountlyServer.validateUserForMgmtWriteAPI(countlyApi.mgmt.apps.resetApp, request);
                break;
            default:
                request.message(400, 'Invalid path, must be one of /create, /update, /delete or /reset');
                break;
        }
    }],
    '/i': [{'app_key': {required: true}, 'device_id': {required: true}}, function(request){
        request.params.user = {
            'country':'Unknown',
            'city':'Unknown'
        };

        // Set app_user_id that is unique for each user of an application.
        request.params.app_user_id = common.crypto.createHash('sha1').update(request.params.app_key + request.params.device_id + "").digest('hex');

        if (request.params.metrics) {
            try {
                request.params.metrics = JSON.parse(request.params.metrics);

                if (request.params.metrics["_carrier"]) {
                    request.params.metrics["_carrier"] = request.params.metrics["_carrier"].replace(/\w\S*/g, function (txt) {
                        return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
                    });
                }

                if (request.params.metrics["_os"] && request.params.metrics["_os_version"]) {
                    request.params.metrics["_os_version"] = request.params.metrics["_os"][0].toLowerCase() + request.params.metrics["_os_version"];
                }

            } catch (SyntaxError) {
                console.log('Parse metrics JSON failed');
            }
        }

        if (request.params.events) {
            try {
                request.params.events = JSON.parse(request.params.events);
            } catch (SyntaxError) {
                console.log('Parse events JSON failed');
            }
        }

        CountlyServer.validateAppForWriteAPI(countlyApi.data.session.write, request);

        if (!request.config.safe) {
            request.message(200, 'Success');
        }
    }],
    '/o/users': [{'api_key': {required: true}}, function(request){
        switch (request.method) {
            case 'all':
                CountlyServer.validateUserForMgmtReadAPI(countlyApi.mgmt.users.getAllUsers, request);
                break;
            case 'me':
                CountlyServer.validateUserForMgmtReadAPI(countlyApi.mgmt.users.getCurrentUser, request);
                break;
            default:
                request.message(400, 'Invalid path, must be one of /all or /me');
                break;
        }
    }],
    '/o/apps': [{'api_key': {required: true}}, function(request){
        switch (request.method) {
            case 'all':
                CountlyServer.validateUserForMgmtReadAPI(countlyApi.mgmt.apps.getAllApps, request);
                break;
            case 'mine':
                CountlyServer.validateUserForMgmtReadAPI(countlyApi.mgmt.apps.getCurrentUserApps, request);
                break;
            default:
                request.message(400, 'Invalid path, must be one of /all or /mine');
                break;
        }
    }],
    '/o': [{'api_key': {required: true}, 'app_id': {required: true}}, function(request){
        switch (request.params.method) {
            case 'locations':
            case 'sessions':
            case 'users':
            case 'devices':
            case 'device_details':
            case 'carriers':
            case 'app_versions':
                CountlyServer.validateUserForDataReadAPI(request, countlyApi.data.fetch.fetchTimeData, request.params.method);
                break;
            case 'cities':
                if (request.config.city_data === true) {
                    CountlyServer.validateUserForDataReadAPI(request, countlyApi.data.fetch.fetchTimeData, request.params.method);
                } else {
                    request.output({});
                }
                break;
            case 'events':
                if (request.params.events) {
                    try {
                        request.params.events = JSON.parse(request.params.events);
                    } catch (SyntaxError) {
                        console.log('Parse events array failed');
                    }

                    CountlyServer.validateUserForDataReadAPI(request, countlyApi.data.fetch.fetchMergedEventData);
                } else {
                    CountlyServer.validateUserForDataReadAPI(request, countlyApi.data.fetch.prefetchEventData, request.params.method);
                }
                break;
            case 'get_events':
                CountlyServer.validateUserForDataReadAPI(request, countlyApi.data.fetch.fetchCollection, 'events');
                break;
            default:
                request.message(400, 'Invalid method');
                break;
        }
    }],
    '/o/analytics': [[{'api_key': {required: true}}, {'app_id': {required: true}}], function(request){
        switch (request.method) {
            case 'dashboard':
                CountlyServer.validateUserForDataReadAPI(request, countlyApi.data.fetch.fetchDashboard);
                break;
            case 'countries':
                CountlyServer.validateUserForDataReadAPI(request, countlyApi.data.fetch.fetchCountries);
                break;
            default:
                request.message(400, 'Invalid path, must be one of /dashboard or /countries');
                break;
        }
    }]
}};