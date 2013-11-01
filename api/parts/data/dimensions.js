var dimensions = {},
    common = require('./../../utils/common.js'),
    async = require('./../../utils/async.min.js');

(function (dimensions) {

    dimensions.toStore = common.config.api.users && common.config.api.users.dimensions ? (common.config.api.users.dimensionsWhitelist || []) : undefined;
    dimensions.doCartesian = common.config.api.users && common.config.api.users.cartesian;

    // Update _id_ record of _collection_ along with all dimensions from request.dimensions with _update_ and update _options_
    dimensions.updateAppIdWithDimensions = function(request, collection, id, update, options){
        var query = {_id: id};
        if (request.dimensions && request.dimensions.length) {
            query = {'$or': [{_id: id}]};
            for (var i = 0; i < request.dimensions.length; i++){
                query['$or'].push({_id: request.dimensions[i].id});
            }

            // We cannot upsert these because of $or query, we also do not like N+1.
            // Instead we switch to async checking of number of updated records and running the query again
            // if some record hasn't been processed. Far from ideal, but the only solution
            // when user have, say, 3 dimensions (7 cartesian dimensions x 5-10 updates per request = mongo chokes pretty fast).
            if (options.upsert){
                common.db.collection(collection).update(query, update, {multi: true, safe: true}, function(err, count){
                    if (count != (request.dimensions.length + 1)){
                        if (count == 0) common.db.collection(collection).update({_id: id}, update, {upsert: true});
                        request.dimensions.forEach(function(d){
                            common.db.collection(collection).findOne(d.id, function(err, record){
                                if (!record) common.db.collection(collection).update({_id: d.id}, update, {upsert: true});
                            });
                        });
                    }
                });
            } else {
                common.db.collection(collection).update(query, update, {multi: true});
            }

        } else {
            common.db.collection(collection).update(query, update, options);
        }
    };

    // Update event collections
    dimensions.updateEventsWithDimensions = function(request, collection, segment, update, options, callback){
        if (request.dimensions && request.dimensions.length) {
            async.parallel([
                function(cl){
                    // main event collection
                    common.db.collection(collection).update({'_id': segment}, update, options, cl);
                }, function(cl){
                    // dimensions event collections
                    async.map(request.dimensions, function(dim, clb){
                        var collectionName = collection.indexOf(request.params.app_id) !== -1 ? collection.replace(request.params.app_id, dim.id) : collection + dim;
                        common.db.collection(collectionName).update({'_id': segment}, update, options, clb);
                    }, function(err, results){
                        cl(err, results);
                    });
                }], callback);
//            common.db.collection(collection).update({'_id': segment}, update, options, cl);
//            for (var i = 0; i < request.dimensions.length; i++){
//                var collectionName = collection.replace(request.params.app_id, request.dimensions[i].id);
//                common.db.collection(collectionName).update({'_id': segment}, update, options);
//            }
        } else {
            common.db.collection(collection).update({'_id': segment}, update, options, callback);
        }
    };

    // Process user dimensions
    // - add nonexistent dimensions to apps collection
    // - find existing dimensions (key = value) ids and store in request.dimensions for future use
    // - construct cartesian product of user dimensions
    // - update app_users with new dimensions if new added or existing changed
    dimensions.findOrUpdateAppUserDimensions = function(request){
        if (dimensions.toStore === undefined) return;

        if (request.params.dimensions){
            // Convert to array of simple one-key dimensions
            try {
                var parsed = JSON.parse(request.params.dimensions);
                request.params.dimensions = {};
                for (var p in parsed){
                    if (dimensions.toStore.length == 0 || dimensions.toStore.indexOf(p) !== -1) {
                        // Mongodb field names can't start with $ or contain .
                        var key = (p + "").replace(/^\$/, "").replace(/\./g, ":");
                        request.params.dimensions[key] = parsed[p] + "";
                    }
                }
            } catch (SyntaxError) {
                delete request.dimensions;
                console.log('User dimensions JSON parsing failed');
            }

            var dims = [];
            for (var key in request.params.dimensions) {
                var dimension = {};
                dimension[key] = request.params.dimensions[key];
                dims.push(dimension);
            }

            // Find other one-key dimensions assigned to the user before
            var userDimensions = request.user ? request.user[common.dbUserMap.dimensions] || [] : [],
                filtered = dimensions.filterDimensionsByLevel(userDimensions, 1),
                userNeedsUpdate = request.user ? false : true;
            for (var i = 0; i < filtered.length; i++){
                var existing = dimensions.findDimension(dims, filtered[i], 1);
                if (!existing) {
                    dims.push(filtered[i]);
                } else {
                    var equal = false;
                    for (var key in existing) if (key != 'id') {
                        // only one key in this loop
                        if (existing[key] != filtered[i][key]) {
                            userNeedsUpdate = true;
                        }
                    }
                }
            }

            // Construct cartesian product
            if (dimensions.doCartesian) dims = dimensions.cartesian(dims);

            // If dimension already exists, we need to find its id
            // If not, we need to add it
            if (!request.app.dimensions) request.app.dimensions = [];
            var count = 0, newAppDimensions = [];
            for (var i = 0; i < dims.length; i++){
                var existing = dimensions.findDimension(request.app.dimensions, dims[i], 0, true);
                if (existing){
                    dims[i].id = existing.id;
                } else {
                    dims[i].id = new common.db.ObjectID();
                    newAppDimensions.push(dims[i]);
                }
            }

            // Update app if needed
            if (newAppDimensions.length) {
                common.db.collection('apps').update({'_id': request.app['_id']}, {'$pushAll': {dimensions: newAppDimensions}});
            }

            // Update user if needed
            if (userDimensions.length < dims.length) userNeedsUpdate = true;
            if (userNeedsUpdate) {
                common.db.collection('app_users' + request.params.app_id).update({'_id': request.params.app_user_id}, {'$set': {'dm': dims}}, {upsert: true});
            }

            // Save dimensions for future updates
            request.dimensions = dims;

        } else if (request.user && request.user[common.dbUserMap.dimensions]) {
            // Save dimensions for future updates
            request.dimensions = request.user[common.dbUserMap.dimensions];
        }
    };

    // Return only dimensions of a particular level (keys number)
    dimensions.filterDimensionsByLevel = function(arr, level){
        var ret = [];
        for (var i = 0; i < arr.length; i++){
            var keysInDimension = 0;
            for (var ak in arr[i]) if (ak != 'id') {
                keysInDimension++;
            }
            if (level == keysInDimension) ret.push(arr[i]);
        }
        return ret;
    };

    // Find a dimension in array of dimensions
    dimensions.findDimension = function(arr, dimension, level, checkValue){
        var array = level ? dimensions.filterDimensionsByLevel(arr, level) : arr;

        for (var i = 0; i < array.length; i++){
            var keysEqual = 0, keysInDimension = 0;

            for (var dk in dimension) if (dk != 'id') {
                keysInDimension++;

                var keysInArrayDimension = 0;
                for (var ak in array[i]) if (ak != 'id') {
                    keysInArrayDimension++;

                    if (ak == dk && (!checkValue || (checkValue && array[i][ak] == dimension[dk]))) {
                        keysEqual++;
                    }
                }
            }

            if (keysInDimension == keysInArrayDimension && keysInDimension == keysEqual && (!level || level == keysInDimension)) return arr[i];
        }

        return null;
    };

    // Almost Cartesian product (also returns partial multiplications):
    // cartesian([a, b, c]) = [a; b; c; a,b; a,c; b,c; a,b,c]
    dimensions.cartesian = function(a){
        var combined = combine(a);
        for (var i = 0; i < combined.length; i++){
            var replacement = {};
            for (var c = 0; c < combined[i].length; c++) {
                for (var k in combined[i][c]) replacement[k] = combined[i][c][k];
            }
            combined[i] = replacement;
        }
        return combined;
    };

    dimensions.combine = function(a) {
        var fn = function(n, src, got, all) {
            if (n == 0) {
                if (got.length > 0) {
                    all[all.length] = got;
                }
                return;
            }
            for (var j = 0; j < src.length; j++) {
                fn(n - 1, src.slice(j + 1), got.concat([src[j]]), all);
            }
        };
        var all = [];
        for (var i=0; i < a.length; i++) {
            fn(i, a, [], all);
        }
        all.push(a);
        return all;
    };


})(dimensions);    


module.exports = dimensions;