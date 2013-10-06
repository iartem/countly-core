var express = require('express'),
    expose = require('express-expose'),
    crypto = require('crypto'),
    fs = require('fs'),
    im = require('imagemagick'),
    request = require('request'),
    countlyMail = require('../../api/parts/mgmt/mail.js'),
    countlyStats = require('../../api/parts/data/stats.js');

function sha1Hash(str, addSalt) {
    var salt = (addSalt) ? new Date().getTime() : "";
    return crypto.createHmac('sha1', salt + "").update(str + "").digest('hex');
}

function md5Hash(str) {
    return crypto.createHash('md5').update(str + "").digest('hex');
}

function isGlobalAdmin(req) {
    return (req.session.gadm);
}

function sortBy(arrayToSort, sortList) {
    if (!sortList.length) {
        return arrayToSort;
    }

    var tmpArr = [],
        retArr = [];

    for (var i = 0; i < arrayToSort.length; i++) {
        var objId = arrayToSort[i]["_id"] + "";
        if (sortList.indexOf(objId) !== -1) {
            tmpArr[sortList.indexOf(objId)] = arrayToSort[i];
        }
    }

    for (var i = 0; i < tmpArr.length; i++) {
        if (tmpArr[i]) {
            retArr[retArr.length] = tmpArr[i];
        }
    }

    for (var i = 0; i < arrayToSort.length; i++) {
        if (retArr.indexOf(arrayToSort[i]) === -1) {
            retArr[retArr.length] = arrayToSort[i];
        }
    }

    return retArr;
}

var auth = express.basicAuth(function(user, pass, callback) {
    var password = sha1Hash(pass);
    countlyDb.collection('members').findOne({"username":user, "password":password}, function (err, member) {
        callback(null, member);
    });
});

module.exports = function(countlyDb, countlyConfig, params) {
    var routes = {
        view: function(name, path){
            return name;
        },
        get: {
            '/': function(req, res, next) {
                 res.redirect('/login');
            },

            '/dashboard': function (req, res, next) {
                if (!req.session.uid) {
                    res.redirect('/login');
                } else {
                    countlyDb.collection('members').findOne({"_id":countlyDb.ObjectID(req.session.uid)}, function (err, member) {
                        if (member) {
                            var adminOfApps = [],
                                userOfApps = [],
                                countlyGlobalApps = {},
                                countlyGlobalAdminApps = {};

                            member.user_id = crypto.createHash('md5').update(member._id + member.email).digest('hex');
                            member.user_hash = crypto.createHash('sha1').update('xuiee4eb' + member.user_id).digest('hex');

                            if (member['global_admin']) {
                                countlyDb.collection('apps').find({}).toArray(function (err, apps) {
                                    adminOfApps = apps;
                                    userOfApps = apps;

                                    for (var i = 0; i < apps.length; i++) {
                                        countlyGlobalApps['' + apps[i]["_id"]] = apps[i];
                                        countlyGlobalApps['' + apps[i]["_id"]]['_id'] += "";
                                    }

                                    countlyGlobalAdminApps = countlyGlobalApps;
                                    renderDashboard();
                                });
                            } else {
                                var adminOfAppIds = [],
                                    userOfAppIds = [];

                                if (member.admin_of.length == 1 && member.admin_of[0] == "") {
                                    member.admin_of = [];
                                }

                                for (var i = 0; i < member.admin_of.length; i++) {
                                    if (member.admin_of[i] == "") {
                                        continue;
                                    }

                                    adminOfAppIds[adminOfAppIds.length] = countlyDb.ObjectID(member.admin_of[i]);
                                }

                                for (var i = 0; i < member.user_of.length; i++) {
                                    if (member.user_of[i] == "") {
                                        continue;
                                    }

                                    userOfAppIds[userOfAppIds.length] = countlyDb.ObjectID(member.user_of[i]);
                                }

                                countlyDb.collection('apps').find({ _id:{ '$in':adminOfAppIds } }).toArray(function (err, admin_of) {

                                    for (var i = 0; i < admin_of.length; i++) {
                                        countlyGlobalAdminApps['' + admin_of[i]["_id"]] = admin_of[i];
                                        countlyGlobalAdminApps['' + admin_of[i]["_id"]]['_id'] += '';
                                    }

                                    countlyDb.collection('apps').find({ _id:{ '$in':userOfAppIds } }).toArray(function (err, user_of) {
                                        adminOfApps = admin_of;
                                        userOfApps = user_of;

                                        for (var i = 0; i < user_of.length; i++) {
                                            countlyGlobalApps['' + user_of[i]["_id"]] = user_of[i];
                                            countlyGlobalApps['' + user_of[i]["_id"]]['_id'] += '';
                                        }

                                        renderDashboard();
                                    });
                                });
                            }

                            function renderDashboard() {
                                countlyDb.collection('settings').findOne({}, function (err, settings) {

                                    req.session.uid = member["_id"];
                                    req.session.gadm = (member["global_admin"] == true);
                                    res.header('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');

                                    delete member["password"];

                                    res.expose({
                                        apps:countlyGlobalApps,
                                        admin_apps:countlyGlobalAdminApps,
                                        csrf_token:req.session._csrf,
                                        member:member
                                    }, 'countlyGlobal');

                                    if (settings && !err) {
                                        adminOfApps = sortBy(adminOfApps, settings.appSortList);
                                        userOfApps = sortBy(userOfApps, settings.appSortList);
                                    }

                                    res.render(routes.view('dashboard', req.path), {
                                        adminOfApps:adminOfApps,
                                        userOfApps:userOfApps,
                                        countlyVersion:"13.06",
                                        member:member
                                    });
                                });
                            }
                        } else {
                            if (req.session) {
                                req.session.uid = null;
                                req.session.gadm = null;
                                res.clearCookie('uid');
                                res.clearCookie('gadm');
                                req.session.destroy(function () {
                                });
                            }
                            res.redirect('/login');
                        }
                    });
                }
            },

            '/setup': function (req, res, next) {
                countlyDb.collection('members').count({}, function (err, memberCount) {
                    if (memberCount) {
                        res.redirect('/login');
                    } else {
                        res.render('setup', { "csrf":req.session._csrf });
                    }
                });
            },

            '/login': function (req, res, next) {
                if (req.session.uid) {
                    res.redirect('/dashboard');
                } else {
                    countlyDb.collection('members').count({}, function (err, memberCount) {
                        if (memberCount) {
                            res.render('login', { "message":req.flash('info'), "csrf":req.session._csrf });
                        } else {
                            res.redirect('/setup');
                        }
                    });
                }
            },

            '/forgot': function (req, res, next) {
                if (req.session.uid) {
                    res.redirect('/dashboard');
                } else {
                    res.render('forgot', { "csrf":req.session._csrf, "message":req.flash('info') });
                }
            },

            '/reset/:prid': function (req, res, next) {
                if (req.params.prid) {
                    countlyDb.collection('password_reset').findOne({prid:req.params.prid}, function (err, passwordReset) {
                        var timestamp = Math.round(new Date().getTime() / 1000);

                        if (passwordReset && !err) {
                            if (timestamp > (passwordReset.timestamp + 600)) {
                                req.flash('info', 'reset.invalid');
                                res.redirect('/forgot');
                            } else {
                                res.render('reset', { "csrf":req.session._csrf, "prid":req.params.prid, "message":"" });
                            }
                        } else {
                            req.flash('info', 'reset.invalid');
                            res.redirect('/forgot');
                        }
                    });
                } else {
                    req.flash('info', 'reset.invalid');
                    res.redirect('/forgot');
                }
            },

            '/api-key': [auth, function (req, res, next) {
                if (req.user) {
                    res.send(req.user.api_key);
                } else {
                    res.send("-1");
                }
            }]
        },

        post: {
            '/reset': function (req, res, next) {
                if (req.body.password && req.body.again && req.body.prid) {
                    var password = sha1Hash(req.body.password);

                    countlyDb.collection('password_reset').findOne({prid:req.body.prid}, function (err, passwordReset) {
                        countlyDb.collection('members').update({_id:passwordReset.user_id}, {'$set':{ "password":password }}, function (err, member) {
                            req.flash('info', 'reset.result');
                            res.redirect('/login');
                        });

                        countlyDb.collection('password_reset').remove({prid:req.body.prid}, function () {});
                    });
                } else {
                    res.render('reset', { "csrf":req.session._csrf, "prid":req.body.prid, "message":"" });
                }
            },

            '/forgot': function (req, res, next) {
                if (req.body.email) {
                    countlyDb.collection('members').findOne({"email":req.body.email}, function (err, member) {
                        if (member) {
                            var timestamp = Math.round(new Date().getTime() / 1000),
                                prid = sha1Hash(member.username + member.full_name, timestamp);

                            countlyDb.collection('password_reset').insert({"prid":prid, "user_id":member._id, "timestamp":timestamp}, {safe:true}, function (err, password_reset) {
                                countlyMail.sendPasswordResetInfo(member, prid);

                                res.render('forgot', { "message":"forgot.result", "csrf":req.session._csrf });
                            });
                        } else {
                            res.render('forgot', { "message":"forgot.result", "csrf":req.session._csrf });
                        }
                    });
                } else {
                    res.redirect('/forgot');
                }
            },

            '/setup': function (req, res, next) {
                countlyDb.collection('members').count({}, function (err, memberCount) {
                    if (memberCount) {
                        res.redirect('/login');
                    } else {
                        if (req.body.full_name && req.body.username && req.body.password && req.body.email) {
                            var password = sha1Hash(req.body.password);

                            countlyDb.collection('members').insert({"full_name":req.body.full_name, "username":req.body.username, "password":password, "email":req.body.email, "global_admin":true}, {safe:true}, function (err, member) {
                                var options = {
                                    uri: 'https://cloud.count.ly/s',
                                    method: 'POST',
                                    timeout: 4000,
                                    json: {
                                        "email": req.body.email,
                                        "full_name": req.body.full_name,
                                        "v": "13.06"
                                    }
                                };

                                request(options, function (error, response, body) {
                                    var newMember = {};

                                    newMember.api_key = md5Hash(member[0]._id + (new Date().getTime()));

                                    if (body) {
                                        if (body.in_user_id) {
                                            newMember.in_user_id = body.in_user_id;
                                        }

                                        if (body.in_user_hash) {
                                            newMember.in_user_hash = body.in_user_hash;
                                        }
                                    }

                                    countlyDb.collection('members').update({'_id':member[0]._id}, {$set:newMember}, function () {
                                        req.session.uid = member[0]["_id"];
                                        req.session.gadm = true;
                                        res.redirect('/dashboard');
                                    });
                                });
                            });
                        } else {
                            res.redirect('/setup');
                        }
                    }
                });
            },

            '/login': function (req, res, next) {
                if (req.body.username && req.body.password) {
                    var password = sha1Hash(req.body.password);

                    countlyDb.collection('members').findOne({"username":req.body.username, "password":password}, function (err, member) {
                        if (member) {
                            countlyStats.totalUsers(function(userCount, appCount) {
                                countlyStats.totalEvents(function(eventCount) {
                                    countlyStats.totalReqs(function(reqCount) {
                                        var options = {
                                            uri: 'https://cloud.count.ly/s',
                                            method: 'POST',
                                            timeout: 4000,
                                            json: {
                                                "email": member.email,
                                                "full_name": member.full_name,
                                                "v": "13.06",
                                                "u": userCount,
                                                "e": eventCount,
                                                "r": reqCount,
                                                "a": appCount
                                            }
                                        };

                                        request(options, function (error, response, body) {
                                            var updatedMember = {};

                                            if (body) {
                                                if (body.in_user_id && !member.in_user_id) {
                                                    updatedMember.in_user_id = body.in_user_id;
                                                }

                                                if (body.in_user_hash && !member.in_user_hash) {
                                                    updatedMember.in_user_hash = body.in_user_hash;
                                                }
                                            }

                                            if (Object.keys(updatedMember).length) {
                                                countlyDb.collection('members').update({'_id':member._id}, {$set:updatedMember}, function () {});
                                            }
                                        });
                                    });
                                });
                            });

                            if (!member.api_key) {
                                var apiKey = md5Hash(member._id + (new Date().getTime()));

                                countlyDb.collection('members').update({'_id':member._id}, {$set:{'api_key': apiKey}}, function () {
                                    req.session.uid = member["_id"];
                                    req.session.gadm = (member["global_admin"] == true);
                                    res.redirect('/dashboard');
                                });
                            } else {
                                req.session.uid = member["_id"];
                                req.session.gadm = (member["global_admin"] == true);
                                res.redirect('/dashboard');
                            }
                        } else {
                            res.render('login', { "message":"login.result", "csrf":req.session._csrf });
                        }
                    });
                } else {
                    res.render('login', { "message":"login.result", "csrf":req.session._csrf });
                    res.end();
                }
            },

            '/dashboard/settings': function (req, res, next) {
                if (!req.session.uid) {
                    res.end();
                    return false;
                }

                if (!isGlobalAdmin(req)) {
                    res.end();
                    return false;
                }

                var newAppOrder = req.body.app_sort_list;

                if (!newAppOrder || newAppOrder.length == 0) {
                    res.end();
                    return false;
                }

                countlyDb.collection('settings').update({}, {'$set':{'appSortList':newAppOrder}}, {'upsert':true});
            },

            '/apps/icon': function (req, res) {
                if (!req.files.app_image || !req.body.app_image_id) {
                    res.end();
                    return true;
                }

                var tmp_path = req.files.app_image.path,
                    target_path = __dirname + '/public/files/' + req.body.app_image_id + ".png",
                    type = req.files.app_image.type;

                if (type != "image/png" && type != "image/gif" && type != "image/jpeg") {
                    fs.unlink(tmp_path, function () {});
                    res.send(false);
                    return true;
                }

                fs.rename(tmp_path, target_path, function (err) {
                    fs.unlink(tmp_path, function () {});
                    im.crop({
                        srcPath:target_path,
                        dstPath:target_path,
                        format:'png',
                        width:72,
                        height:72
                    }, function (err, stdout, stderr) {});

                    res.send("/files/" + req.body.app_image_id + ".png");
                });
            },

            '/user/settings': function (req, res, next) {
                if (!req.session.uid) {
                    res.end();
                    return false;
                }

                var updatedUser = {};

                if (req.body.username) {
                    updatedUser.username = req.body["username"];

                    countlyDb.collection('members').findOne({username:req.body.username}, function (err, member) {
                        if ((member && member._id != req.session.uid) || err) {
                            res.send("username-exists");
                        } else {
                            if (req.body.old_pwd) {
                                var password = sha1Hash(req.body.old_pwd),
                                    newPassword = sha1Hash(req.body.new_pwd);

                                updatedUser.password = newPassword;

                                countlyDb.collection('members').update({"_id":countlyDb.ObjectID(req.session.uid), "password":password}, {'$set':updatedUser}, {safe:true}, function (err, member) {
                                    if (member && !err) {
                                        res.send(true);
                                    } else {
                                        res.send(false);
                                    }
                                });
                            } else {
                                countlyDb.collection('members').update({"_id":countlyDb.ObjectID(req.session.uid)}, {'$set':updatedUser}, {safe:true}, function (err, member) {
                                    if (member && !err) {
                                        res.send(true);
                                    } else {
                                        res.send(false);
                                    }
                                });
                            }
                        }
                    });
                } else {
                    res.send(false);
                    return false;
                }
            },

            '/users/check/email': function (req, res, next) {
                if (!req.session.uid || !isGlobalAdmin(req) || !req.body.email) {
                    res.send(false);
                    return false;
                }

                countlyDb.collection('members').findOne({email:req.body.email}, function (err, member) {
                    if (member || err) {
                        res.send(false);
                    } else {
                        res.send(true);
                    }
                });
            },

            '/users/check/username': function (req, res, next) {
                if (!req.session.uid || !isGlobalAdmin(req) || !req.body.username) {
                    res.send(false);
                    return false;
                }

                countlyDb.collection('members').findOne({username:req.body.username}, function (err, member) {
                    if (member || err) {
                        res.send(false);
                    } else {
                        res.send(true);
                    }
                });
            },

            '/events/map/edit': function (req, res, next) {
                if (!req.session.uid || !req.body.app_id) {
                    res.end();
                    return false;
                }

                if (!isGlobalAdmin(req)) {
                    countlyDb.collection('members').findOne({"_id":countlyDb.ObjectID(req.session.uid)}, function (err, member) {
                        if (!err && member.admin_of && member.admin_of.indexOf(req.body.app_id) != -1) {
                            countlyDb.collection('events').update({"_id":countlyDb.ObjectID(req.body.app_id)}, {'$set':{"map":req.body.event_map, "order":req.body.event_order}}, function (err, events) {
                            });
                            res.send(true);
                            return true;
                        } else {
                            res.send(false);
                            return false;
                        }
                    });
                } else {
                    countlyDb.collection('events').update({"_id":countlyDb.ObjectID(req.body.app_id)}, {'$set':{"map":req.body.event_map, "order":req.body.event_order}}, function (err, events) {
                    });
                    res.send(true);
                    return true;
                }
            },

            '/events/delete': function (req, res, next) {
                if (!req.session.uid || !req.body.app_id || !req.body.event_key) {
                    res.end();
                    return false;
                }

                var updateThese = {
                    "$unset": {},
                    "$pull": {
                        "list": req.body.event_key,
                        "order": req.body.event_key
                    }
                };

                updateThese["$unset"]["map." + req.body.event_key] = 1;
                updateThese["$unset"]["segments." + req.body.event_key] = 1;

                if (!isGlobalAdmin(req)) {
                    countlyDb.collection('members').findOne({"_id":countlyDb.ObjectID(req.session.uid)}, function (err, member) {
                        if (!err && member.admin_of && member.admin_of.indexOf(req.body.app_id) != -1) {
                            countlyDb.collection('events').update({"_id":countlyDb.ObjectID(req.body.app_id)}, updateThese, function (err, events) {});
                            countlyDb.collection(req.body.event_key + req.body.app_id).drop();

                            res.send(true);
                            return true;
                        } else {
                            res.send(false);
                            return false;
                        }
                    });
                } else {
                    countlyDb.collection('events').update({"_id":countlyDb.ObjectID(req.body.app_id)}, updateThese, function (err, events) {});
                    countlyDb.collection(req.body.event_key + req.body.app_id).drop();

                    res.send(true);
                    return true;
                }
            }
        }
    };
    return routes;
}