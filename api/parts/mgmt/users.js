var usersApi = {},
    common = require('./../../utils/common.js'),
    mail = require('./mail.js'),
    crypto = require('crypto');

(function (usersApi) {

    usersApi.getCurrentUser = function (request) {
        delete request.params.member.password;

        request.output(request.params.member);
        return true;
    };

    usersApi.getAllUsers = function (request) {
        if (!request.params.member.global_admin) {
            request.message(401, 'User is not a global administrator');
            return false;
        }

        common.db.collection('members').find({}).toArray(function (err, members) {

            if (!members || err) {
                request.output({});
                return false;
            }

            var membersObj = {};

            for (var i = 0; i < members.length ;i++) {
                membersObj[members[i]._id] = {
                    '_id':members[i]._id,
                    'api_key':members[i].api_key,
                    'full_name':members[i].full_name,
                    'username':members[i].username,
                    'email':members[i].email,
                    'admin_of':members[i].admin_of,
                    'user_of':members[i].user_of,
                    'global_admin':(members[i].global_admin === true),
                    'is_current_user':(members[i].api_key == request.params.member.api_key)
                };
            }

            request.output(membersObj);
            return true;
        });

        return true;
    };

    usersApi.createUser = function (request) {
        if (!request.params.member.global_admin) {
            request.message(401, 'User is not a global administrator');
            return false;
        }

        var argProps = {
                'full_name':    { 'required': true, 'type': 'String' },
                'username':     { 'required': true, 'type': 'String' },
                'password':     { 'required': true, 'type': 'String' },
                'email':        { 'required': true, 'type': 'String' },
                'admin_of':     { 'required': false, 'type': 'Array' },
                'user_of':      { 'required': false, 'type': 'Array' },
                'global_admin': { 'required': false, 'type': 'Boolean' }
            },
            newMember = {};

        if (!(newMember = request.validateArgs(request.params.args, argProps))) {
            request.message(400, 'Not enough args');
            return false;
        }

        common.db.collection('members').findOne({ $or : [ {email: newMember.email}, {username: newMember.username} ] }, function(err, member) {
            if (member || err) {
                request.message(200, 'Email or username already exists');
                return false;
            } else {
                createUser();
                return true;
            }
        });

        function createUser() {
            var passwordNoHash = newMember.password;
            newMember.password = common.sha1Hash(newMember.password);
            newMember.created_at = Math.floor(((new Date()).getTime()) / 1000); //TODO: Check if UTC

            common.db.collection('members').insert(newMember, {safe: true}, function(err, member) {
                if (member && member.length && !err) {

                    member[0].api_key = common.md5Hash(member[0]._id + (new Date().getTime()));
                    common.db.collection('members').update({'_id': member[0]._id}, {$set: {api_key: member[0].api_key}});

                    mail.sendToNewMember(member[0], passwordNoHash);

                    delete member[0].password;

                    request.output(member[0]);
                } else {
                    request.message(500, 'Error creating user');
                }
            });
        }

        return true;
    };

    usersApi.updateUser = function (request) {
        var argProps = {
                'user_id':      { 'required': true, 'type': 'String', 'min-length': 24, 'max-length': 24, 'exclude-from-ret-obj': true },
                'full_name':    { 'required': false, 'type': 'String' },
                'username':     { 'required': false, 'type': 'String' },
                'password':     { 'required': false, 'type': 'String' },
                'email':        { 'required': false, 'type': 'String' },
                'admin_of':     { 'required': false, 'type': 'Array' },
                'user_of':      { 'required': false, 'type': 'Array' },
                'global_admin': { 'required': false, 'type': 'Boolean' },
                'send_notification': { 'required': false, 'type': 'Boolean', 'exclude-from-ret-obj': true }
            },
            updatedMember = {},
            passwordNoHash = "";

        if (!(updatedMember = request.validateArgs(request.params.args, argProps))) {
            request.message(400, 'Not enough args');
            return false;
        }

        if (!(request.params.member.global_admin || request.params.member._id === request.params.args.user_id)) {
            request.message(401, 'User is not a global administrator');
            return false;
        }

        if (updatedMember.password) {
            passwordNoHash = updatedMember.password;
            updatedMember.password = common.sha1Hash(updatedMember.password);
        }

        common.db.collection('members').update({'_id': common.db.ObjectID(request.params.args.user_id)}, {'$set': updatedMember}, {safe: true}, function(err, isOk) {
            common.db.collection('members').findOne({'_id': common.db.ObjectID(request.params.args.user_id)}, function(err, member) {
                if (member && !err) {
                    if (request.params.args.send_notification && passwordNoHash) {
                        mail.sendToUpdatedMember(member, passwordNoHash);
                    }
                    request.message(200, 'Success');
                } else {
                    request.message(500, 'Error updating user');
                }
            });
        });

        return true;
    };

    usersApi.deleteUser = function (request) {
        var argProps = {
                'user_ids': { 'required': true, 'type': 'Array' }
            },
            userIds = [];

        if (!request.params.member.global_admin) {
            request.message(401, 'User is not a global administrator');
            return false;
        }

        if (!(userIds = request.validateArgs(request.params.args, argProps).user_ids)) {
            request.message(400, 'Not enough args');
            return false;
        }

        for (var i = 0; i < userIds.length; i++) {
            // Each user id should be 24 chars long and a user can't delete his own account
            if (userIds[i] === request.params.member._id || userIds[i].length !== 24) {
                continue;
            } else {
                common.db.collection('members').remove({'_id': common.db.ObjectID(userIds[i])});
            }
        }

        request.message(200, 'Success');
        return true;
    };

}(usersApi));

module.exports = usersApi;