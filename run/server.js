var http = require('http'),
    url = require('url'),
    common = require('../api/utils/common.js'),
    _ = require('underscore'),
    CountlyServer = {};

(function (CountlyServer) {
// Checks app_key from the http request against "apps" collection.
// This is the first step of every write request to API.
    CountlyServer.validateAppForWriteAPI = function(callback, request) {
        common.db.collection('apps').findOne({'key':request.params.app_key}, function (err, app) {
            if (!app) {
                if (request.config.safe) {
                    request.message(400, 'App does not exist');
                }

                return false;
            }

            request.app = app;
            request.params.app_id = app['_id'];
            request.params.app_cc = app['country'];
            request.params.appTimezone = app['timezone'];
            request.params.time = common.initTimeObj(request.params.appTimezone, request.params.timestamp);

            callback(request);
        });
    };

    CountlyServer.validateUserForMgmtWriteAPI = function(callback, request) {
        common.db.collection('members').findOne({'api_key':request.params.api_key}, function (err, member) {
            if (!member || err) {
                request.message(401, 'User does not exist');
                return false;
            }

            request.params.member = member;
            callback(request);
        });
    };

    CountlyServer.validateUserForDataReadAPI = function(request, callback, callbackParam) {
        common.db.collection('members').findOne({'api_key':request.params.api_key}, function (err, member) {
            if (!member || err) {
                request.message(401, 'User does not exist');
                return false;
            }

            if (!((member.user_of && member.user_of.indexOf(request.params.app_id) != -1) || member.global_admin)) {
                request.message(401, 'User does not have view right for this application');
                return false;
            }

            common.db.collection('apps').findOne({'_id':common.db.ObjectID(request.params.app_id + "")}, function (err, app) {
                if (!app) {
                    request.message(401, 'App does not exist');
                    return false;
                }

                request.app = app;
                request.dimension = app['_id'];
                request.params.app_id = app['_id'];
                request.params.appTimezone = app['timezone'];
                request.params.time = common.initTimeObj(request.params.appTimezone, request.params.timestamp);

                // Change dimension id if it's correct dimension
                if (request.params.dimensions && app.dimensions) {
                    app.dimensions.forEach(function(d){
                        if (("" + d.id) == request.params.dimensions) request.dimension = d.id;
//                        if (("" + d.id) == request.params.dimensions[0]) request.dimension = d.id;
                    });
                }

                if (callbackParam) {
                    callback(callbackParam, request);
                } else {
                    callback(request);
                }
            });
        });
    };

    CountlyServer.validateUserForMgmtReadAPI = function(callback, request) {
        common.db.collection('members').findOne({'api_key':request.params.api_key}, function (err, member) {
            if (!member || err) {
                request.message(401, 'User does not exist');
                return false;
            }

            request.params.member = member;
            callback(request);
        });
    };

    CountlyServer.addEndpoints = function(newEndpoints) {
        CountlyServer.endpoints = (CountlyServer.endpoints || []).join(newEndpoints);
    };

    CountlyServer.returnMessage = function (request, returnCode, message) {
        request.res.writeHead(returnCode, {'Content-Type': 'application/json; charset=utf-8'});
        if (request.params.callback) {
            request.res.write(request.params.callback + '(' + JSON.stringify({result: message}) + ')');
        } else {
            request.res.write(JSON.stringify({result: message}));
        }
        request.res.end();
    };

    CountlyServer.returnOutput = function (request, output) {
        request.res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
        if (request.params.callback) {
            request.res.write(request.params.callback + '(' + JSON.stringify(output) + ')');
        } else {
            request.res.write(JSON.stringify(output));
        }

        request.res.end();
    };

    /*
     argProperties = { argName: { required: true, type: 'String', max-length: 25, min-length: 25, exclude-from-ret-obj: false }};
     */
    CountlyServer.validateArgs = function (args, argProperties) {

        var returnObj = {};

        if (!args) {
            return false;
        }

        for (var arg in argProperties) {
            if (argProperties[arg].required) {
                if (args[arg] === void 0) {
                    return false;
                }
            }

            if (args[arg] !== void 0) {
                if (argProperties[arg].type) {
                    if (args[arg] == null) {
                        // do nothing
                    } else if (argProperties[arg].type === 'Number' || argProperties[arg].type === 'String') {
                        if (toString.call(args[arg]) !== '[object ' + argProperties[arg].type + ']') {
                            return false;
                        }
                    } else if (argProperties[arg].type === 'URL') {
                        if (toString.call(args[arg]) !== '[object String]') {
                            return false;
                        } else if (args[arg] && args[arg].indexOf('http://') != 0 && args[arg].indexOf('https://') != 0) return false;
                    } else if (argProperties[arg].type === 'Boolean') {
                        if (!(args[arg] !== true || args[arg] !== false || toString.call(args[arg]) !== '[object Boolean]')) {
                            return false;
                        }
                    } else if (argProperties[arg].type === 'Array') {
                        if (!Array.isArray(args[arg])) {
                            return false;
                        }
                    } else {
                        return false;
                    }
                } else {
                    if (toString.call(args[arg]) !== '[object String]') {
                        return false;
                    }
                }

                /*
                 if (toString.call(args[arg]) === '[object String]') {
                 args[arg] = args[arg].replace(/([.$])/mg, '');
                 }
                 */

                if (argProperties[arg]['max-length']) {
                    if (args[arg].length > argProperties[arg]['max-length']) {
                        return false;
                    }
                }

                if (argProperties[arg]['min-length']) {
                    if (args[arg].length < argProperties[arg]['min-length']) {
                        return false;
                    }
                }

                if (!argProperties[arg]['exclude-from-ret-obj']) {
                    returnObj[arg] = args[arg];
                }
            }
        }

        return returnObj;
    };

    // Pipe output of original endpoint to onResult before returning to the client
    CountlyServer.pipeEndpoint = function(apiPath, onResult) {
        for (var path in CountlyServer.endpoints) if (apiPath == path) {
            var instructions = CountlyServer.endpoints[path];
            if (_.isArray(instructions)) {
                if (instructions.length == 2 && _.isObject(instructions[0]) && _.isFunction(instructions[1])) {
                    instructions[1] = pipedEndpoint(instructions[1], onResult);
                }
            } else {
                CountlyServer.endpoints[path] = pipedEndpoint(instructions, onResult);
            }
            return;
        }

        throw new Error('Endpoint for ' + apiPath + ' cannot be piped because there is no such endpoint');

        function pipedEndpoint(endpoint, onResult) {
            return function(request) {
                request.onResult = onResult;
                endpoint(request);
            }
        }
    };

    CountlyServer.Server = function(config, endpointsProducer, onStart){
        CountlyServer.config = config;
        CountlyServer.endpoints = endpointsProducer(CountlyServer);

        http.Server(function (req, res) {

            var urlParts = url.parse(req.url, true),
                paths = urlParts.pathname.split("/"),
                apiPath = "";

            for (var i = 1; i < paths.length; i++) {
                if (i > 2) {
                    break;
                }

                apiPath += "/" + paths[i];
            }

            var request = {
                apiPath:        apiPath,
                method:         paths[3],
                params:         urlParts.query,
                headers:        req.headers,
                ip:             (req.headers['x-forwarded-for'] || req.connection.remoteAddress).split(",")[0],
                config:         CountlyServer.config,
                res:            res,
                message: function(code, message){
                    this.status = code;

                    if (this.onResult) {
                        var f = this.onResult;
                        this.onResult = undefined;
                        f.call(this, this.status, message);
                    } else CountlyServer.returnMessage(this, code, message);
                },
                output: function(output) {
                    this.status = 200;
                    if (this.onResult) {
                        var f = this.onResult;
                        this.onResult = undefined;
                        f.call(this, this.status, output);
                    } else CountlyServer.returnOutput(this, output);
                },
                validate: function(rules) {
                    return CountlyServer.validateArgs(this.params, rules);
                },
                validateArgs: function(params, rules) {
                    return CountlyServer.validateArgs(params, rules);
                }
            };

            for (var path in CountlyServer.endpoints) if (apiPath == path) {
                var instructions = CountlyServer.endpoints[path];
                if (_.isArray(instructions)) {
                    if (instructions.length == 2 && _.isObject(instructions[0]) && _.isFunction(instructions[1])) {
                        if (request.validate(instructions[0])) instructions[1](request);
                        else request.message(400, 'Validation error');
                    } else {
                        request.message(500, 'Invalid endpoints for ' + path)
                    }
                } else {
                    instructions(request);
                }
                return;
            }

            request.message(404, 'Not found');

        }).listen(CountlyServer.config.port, CountlyServer.config.host || '');

        if (CountlyServer.postprocessing) CountlyServer.postprocessing();

        if (onStart) onStart();

        console.log('Server started');
    };
}(CountlyServer));

module.exports = CountlyServer;
