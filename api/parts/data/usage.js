var usage = {},
    common = require('./../../utils/common.js'),
    geoip = require('geoip-lite');

(function (usage) {

    // Performs geoip lookup for the IP address of the app user
    usage.beginUserSession = function (request, clb) {
        // Location of the user is retrieved using geoip-lite module from her IP address.
        var locationData = geoip.lookup(request.params.ip);

        if (locationData) {
            if (locationData.country) {
                request.params.user.country = locationData.country;
            }

            if (locationData.city) {
                request.params.user.city = locationData.city;
            } else {
                request.params.user.city = 'Unknown';
            }

            // Coordinate values of the user location has no use for now
            if (locationData.ll) {
                request.params.user.lat = locationData.ll[0];
                request.params.user.lng = locationData.ll[1];
            }
        }

        common.db.collection('app_users' + request.params.app_id).findOne({'_id': request.params.app_user_id }, function (err, dbAppUser){
            processUserSession(dbAppUser, request);
            clb();
        });
    };

    usage.endUserSession = function (request, clb) {
        common.db.collection('app_users' + request.params.app_id).findOne({'_id': request.params.app_user_id }, function (err, dbAppUser){

            // If the user does not exist in the app_users collection or she does not have any
            // previous session duration stored than we dont need to calculate the session
            // duration range for this user.
            if (!dbAppUser || !dbAppUser[common.dbUserMap['session_duration']]) {
                clb(404);
                return false;
            }

            processSessionDurationRange(dbAppUser[common.dbUserMap['session_duration']], request);
            clb();
        });
    };

    usage.processSessionDuration = function (request, callback) {

        var updateSessions = {},
            session_duration = parseInt(request.params.session_duration);

        if (session_duration == (session_duration | 0)) {
            if (request.config.session_duration_limit && session_duration > request.config.session_duration_limit) {
                session_duration = request.config.session_duration_limit;
            }

            common.fillTimeObject(request, updateSessions, common.dbMap['duration'], session_duration);

            common.db.collection('sessions').update({'_id': request.params.app_id}, {'$inc': updateSessions}, {'upsert': false});

            // sd: session duration, tsd: total session duration. common.dbUserMap is not used here for readability purposes.
            common.db.collection('app_users' + request.params.app_id).update({'_id': request.params.app_user_id}, {'$inc': {'sd': session_duration, 'tsd': session_duration}}, {'upsert': true}, function() {
                if (callback) {
                    callback();
                }
            });
        }
    };

    function processSessionDurationRange(totalSessionDuration, request) {
        var durationRanges = [
                [0,10],
                [11,30],
                [31,60],
                [61,180],
                [181,600],
                [601,1800],
                [1801,3600]
            ],
            durationMax = 3601,
            calculatedDurationRange,
            updateSessions = {};

        if (totalSessionDuration >= durationMax) {
            calculatedDurationRange = (durationRanges.length) + '';
        } else {
            for (var i=0; i < durationRanges.length; i++) {
                if (totalSessionDuration <= durationRanges[i][1] && totalSessionDuration >= durationRanges[i][0]) {
                    calculatedDurationRange = i + '';
                    break;
                }
            }
        }

        common.fillTimeObject(request, updateSessions, common.dbMap['durations'] + '.' + calculatedDurationRange);
        common.db.collection('sessions').update({'_id': request.params.app_id}, {'$inc': updateSessions, '$addToSet': {'meta.d-ranges': calculatedDurationRange}}, {'upsert': false});

        // sd: session duration. common.dbUserMap is not used here for readability purposes.
        common.db.collection('app_users' + request.params.app_id).update({'_id': request.params.app_user_id}, {'$set': {'sd': 0}}, {'upsert': true});
    }

    function processUserSession(dbAppUser, request) {
        var updateSessions = {},
            updateUsers = {},
            updateLocations = {},
            updateCities = {},
            userRanges = {},
            loyaltyRanges = [
                [0,1],
                [2,2],
                [3,5],
                [6,9],
                [10,19],
                [20,49],
                [50,99],
                [100,499]
            ],
            sessionFrequency = [
                [0,1],
                [1,24],
                [24,48],
                [48,72],
                [72,96],
                [96,120],
                [120,144],
                [144,168],
                [168,192],
                [192,360],
                [360,744]
            ],
            sessionFrequencyMax = 744,
            calculatedFrequency,
            loyaltyMax = 500,
            calculatedLoyaltyRange,
            uniqueLevels = [],
            isNewUser = false;

        common.fillTimeObject(request, updateSessions, common.dbMap['total']);
        common.fillTimeObject(request, updateLocations, request.params.user.country + '.' + common.dbMap['total']);

        if (request.config.city_data === true) {
            common.fillTimeObject(request, updateCities, request.params.user.city + '.' + common.dbMap['total']);
        }

        if (dbAppUser) {
            var userLastSeenTimestamp = dbAppUser[common.dbUserMap['last_seen']],
                currDate = common.getDate(request.params.time.timestamp, request.params.appTimezone),
                userLastSeenDate = common.getDate(userLastSeenTimestamp, request.params.appTimezone),
                secInMin = (60 * (currDate.getMinutes())) + currDate.getSeconds(),
                secInHour = (60 * 60 * (currDate.getHours())) + secInMin,
                secInMonth = (60 * 60 * 24 * (currDate.getDate() - 1)) + secInHour;

            // Calculate the frequency range of the user

            if ((request.params.time.timestamp - userLastSeenTimestamp) >= (sessionFrequencyMax * 60 * 60)) {
                calculatedFrequency = sessionFrequency.length + '';
            } else {
                for (var i=0; i < sessionFrequency.length; i++) {
                    if ((request.params.time.timestamp - userLastSeenTimestamp) < (sessionFrequency[i][1] * 60 * 60) &&
                        (request.params.time.timestamp - userLastSeenTimestamp) >= (sessionFrequency[i][0] * 60 * 60)) {
                        calculatedFrequency = i + '';
                        break;
                    }
                }
            }

            // Calculate the loyalty range of the user

            var userSessionCount = dbAppUser[common.dbUserMap['session_count']] + 1;

            if (userSessionCount >= loyaltyMax) {
                calculatedLoyaltyRange = loyaltyRanges.length + '';
            } else {
                for (var i = 0; i < loyaltyRanges.length; i++) {
                    if (userSessionCount <= loyaltyRanges[i][1] && userSessionCount >= loyaltyRanges[i][0]) {
                        calculatedLoyaltyRange = i + '';
                        break;
                    }
                }
            }

            if (userLastSeenDate.getFullYear() == request.params.time.yearly &&
                Math.ceil(common.moment(userLastSeenDate).format("DDD") / 7) < request.params.time.weekly) {
                uniqueLevels[uniqueLevels.length] = request.params.time.yearly + ".w" + request.params.time.weekly;
            }

            if (userLastSeenTimestamp <= (request.params.time.timestamp - secInMin)) {
                // We don't need to put hourly fragment to the unique levels array since
                // we will store hourly data only in sessions collection
                updateSessions[request.params.time.hourly + '.' + common.dbMap['unique']] = 1;
            }

            if (userLastSeenTimestamp <= (request.params.time.timestamp - secInHour)) {
                uniqueLevels[uniqueLevels.length] = request.params.time.daily;
            }

            if (userLastSeenTimestamp <= (request.params.time.timestamp - secInMonth)) {
                uniqueLevels[uniqueLevels.length] = request.params.time.monthly;
            }

            if (userLastSeenTimestamp < (request.params.time.timestamp - secInMonth)) {
                uniqueLevels[uniqueLevels.length] = request.params.time.yearly;
            }

            for (var i = 0; i < uniqueLevels.length; i++) {
                updateSessions[uniqueLevels[i] + '.' + common.dbMap['unique']] = 1;
                updateLocations[uniqueLevels[i] + '.' + request.params.user.country + '.' + common.dbMap['unique']] = 1;
                updateUsers[uniqueLevels[i] + '.' + common.dbMap['frequency'] + '.' + calculatedFrequency] = 1;
                updateUsers[uniqueLevels[i] + '.' + common.dbMap['loyalty'] + '.' + calculatedLoyaltyRange] = 1;

                if (request.config.city_data === true) {
                    updateCities[uniqueLevels[i] + '.' + request.params.user.city + '.' + common.dbMap['unique']] = 1;
                }
            }

            if (uniqueLevels.length != 0) {
                userRanges['meta.' + 'f-ranges'] = calculatedFrequency;
                userRanges['meta.' + 'l-ranges'] = calculatedLoyaltyRange;
                common.db.collection('users').update({'_id': request.params.app_id}, {'$inc': updateUsers, '$addToSet': userRanges}, {'upsert': true});
            }
        } else {
            isNewUser = true;

            // User is not found in app_users collection so this means she is both a new and unique user.
            common.fillTimeObject(request, updateSessions, common.dbMap['new']);
            common.fillTimeObject(request, updateSessions, common.dbMap['unique']);
            common.fillTimeObject(request, updateLocations, request.params.user.country + '.' + common.dbMap['new']);
            common.fillTimeObject(request, updateLocations, request.params.user.country + '.' + common.dbMap['unique']);

            if (request.config.city_data === true) {
                common.fillTimeObject(request, updateCities, request.params.user.city + '.' + common.dbMap['new']);
                common.fillTimeObject(request, updateCities, request.params.user.city + '.' + common.dbMap['unique']);
            }

            // First time user.
            calculatedLoyaltyRange = '0';
            calculatedFrequency = '0';

            common.fillTimeObject(request, updateUsers, common.dbMap['frequency'] + '.' + calculatedFrequency);
            userRanges['meta.' + 'f-ranges'] = calculatedFrequency;

            common.fillTimeObject(request, updateUsers, common.dbMap['loyalty'] + '.' + calculatedLoyaltyRange);
            userRanges['meta.' + 'l-ranges'] = calculatedLoyaltyRange;

            common.db.collection('users').update({'_id': request.params.app_id}, {'$inc': updateUsers, '$addToSet': userRanges}, {'upsert': true});
        }

        common.db.collection('sessions').update({'_id': request.params.app_id}, {'$inc': updateSessions}, {'upsert': true});
        common.db.collection('locations').update({'_id': request.params.app_id}, {'$inc': updateLocations, '$addToSet': {'meta.countries': request.params.user.country}}, {'upsert': true});

        if (request.config.city_data === true && request.params.app_cc == request.params.user.country) {
            common.db.collection('cities').update({'_id': request.params.app_id}, {'$inc': updateCities, '$set': {'country': request.params.user.country}, '$addToSet': {'meta.cities': request.params.user.city}}, {'upsert': true});
        }

        processMetrics(dbAppUser, uniqueLevels, request);
    }

    function processMetrics(user, uniqueLevels, request) {

        var userProps = {},
            isNewUser = (user)? false : true;

        if (isNewUser) {
            userProps[common.dbUserMap['first_seen']] = request.params.time.timestamp;
            userProps[common.dbUserMap['last_seen']] = request.params.time.timestamp;
            userProps[common.dbUserMap['device_id']] = request.params.device_id;
            userProps[common.dbUserMap['country_code']] = request.params.user.country;
            userProps[common.dbUserMap['city']] = request.params.user.city;
        } else {
            if (parseInt(user[common.dbUserMap['last_seen']], 10) < request.params.time.timestamp) {
                userProps[common.dbUserMap['last_seen']] = request.params.time.timestamp;
            }

            if (user[common.dbUserMap['city']] != request.params.user.city) {
                userProps[common.dbUserMap['city']] = request.params.user.city;
            }

            if (user[common.dbUserMap['country_code']] != request.params.user.country) {
                userProps[common.dbUserMap['country_code']] = request.params.user.country;
            }

            if (user[common.dbUserMap['device_id']] != request.params.device_id) {
                userProps[common.dbUserMap['device_id']] = request.params.device_id;
            }
        }

        if (!request.params.metrics) {
            // sc: session count. common.dbUserMap is not used here for readability purposes.
            common.db.collection('app_users' + request.params.app_id).update({'_id':request.params.app_user_id}, {'$inc':{'sc':1}, '$set':userProps}, {'upsert':true}, function () {
            });
            return false;
        }

        var predefinedMetrics = [
            { db: "devices", metrics: [{ name: "_device", set: "devices", short_code: common.dbUserMap['device'] }] },
            { db: "carriers", metrics: [{ name: "_carrier", set: "carriers", short_code: common.dbUserMap['carrier'] }] },
            { db: "device_details", metrics: [{ name: "_os", set: "os", short_code: common.dbUserMap['platform'] }, { name: "_os_version", set: "os_versions", short_code: common.dbUserMap['platform_version'] }, { name: "_resolution", set: "resolutions" }] },
            { db: "app_versions", metrics: [{ name: "_app_version", set: "app_versions", short_code: common.dbUserMap['app_version'] }] }
        ];

        for (var i=0; i < predefinedMetrics.length; i++) {
            var tmpTimeObj = {},
                tmpSet = {},
                needsUpdate = false;

            for (var j=0; j < predefinedMetrics[i].metrics.length; j++) {
                var tmpMetric = predefinedMetrics[i].metrics[j],
                    recvMetricValue = request.params.metrics[tmpMetric.name];

                if (recvMetricValue) {
                    var escapedMetricVal = recvMetricValue.replace(/^\$/, "").replace(/\./g, ":");
                    needsUpdate = true;
                    tmpSet["meta." + tmpMetric.set] = escapedMetricVal;
                    common.fillTimeObject(request, tmpTimeObj, escapedMetricVal + '.' + common.dbMap['total']);

                    if (isNewUser) {
                        common.fillTimeObject(request, tmpTimeObj, escapedMetricVal + '.' + common.dbMap['new']);
                        common.fillTimeObject(request, tmpTimeObj, escapedMetricVal + '.' + common.dbMap['unique']);
                    } else if (tmpMetric.short_code && user[tmpMetric.short_code] != escapedMetricVal) {
                        common.fillTimeObject(request, tmpTimeObj, escapedMetricVal + '.' + common.dbMap['unique']);
                    } else {
                        for (var k=0; k < uniqueLevels.length; k++) {
                            tmpTimeObj[uniqueLevels[k] + '.' + escapedMetricVal + '.' + common.dbMap['unique']] = 1;
                        }
                    }

                    // Assign properties to app_users document of the current user
                    if (tmpMetric.short_code) {
                        if (isNewUser || (!isNewUser && user[tmpMetric.short_code] != escapedMetricVal)) {
                            userProps[tmpMetric.short_code] = escapedMetricVal;
                        }
                    }
                }
            }

            if (needsUpdate) {
                common.db.collection(predefinedMetrics[i].db).update({'_id': request.params.app_id}, {'$inc': tmpTimeObj, '$addToSet': tmpSet}, {'upsert': true});
            }
        }

        // sc: session count. common.dbUserMap is not used here for readability purposes.
        common.db.collection('app_users' + request.params.app_id).update({'_id':request.params.app_user_id}, {'$inc':{'sc':1}, '$set':userProps}, {'upsert':true}, function () {
        });
    }

}(usage));

module.exports = usage;