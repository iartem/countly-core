var countlyConfig = {
    mongodb: {
        host: "localhost",
        db: "countly",
        port: 27017,
        max_pool_size: 1000,
        username: '',
        password: ''
    },
    api: {
        workers: 0,
        port: 3001,
        host: "localhost",
        safe: true,
        session_duration_limit: 120,
        max_sockets: 1024,
        city_data: true,
        users: {
            dimensions: false,                          // User (device) dimensions, see below
            dimensionsWhitelist: []
        }
    },
    apps: {
        country: "TR",
        timezone: "Europe/Istanbul",
        category: "6"
    }
};

// Set your host IP or domain to be used in the emails sent
// countlyConfig.host = "YOUR_IP_OR_DOMAIN";

module.exports = countlyConfig;

/* User dimensions
 * This feature enables tracking of ad campaigns performance, A/B testing and even enables basic cohort analysis.
 * User dimensions is effectively splitting ALL Countly metrics between dimensions.
 * You'll have one big number (as without user dimensions) and several segmented numbers for each Countly metric
 * like session counter and frequency, devices, carriers, etc. It's like event segmentation, but much cooler.
 *
 * To use user dimensions you need to specify 'dimensions' parameter like {a: 1, b: 'seg1', c: 'newsletter'}
 * with API request. There is no need to pass it with every request, it's stored in database on device level.
 * Whenever you need to change parameter, just pass changed dimensions, like {a: 2}, starting from this point
 * this user will be counted in new dimension.
 *
 * Note that when user (device) has 2 or more dimensions, Countly can store cartesian product of this dimensions' metrics.
 * This is required if you need to analyze intersections of different segments.
 * For example, if user has dimensions {a: 1, b: 2, c: 3}, Countly can store 7 different dimensional metrics (a; b; c; a,b;
 * a,c; b,c; a,b,c) for each metric: sessions, OS versions, etc. So you'll be able to get such metrics as
 * "Session number of devices with a = 1 AND b = 2" or "Event A number with event segmentation X for all devices
 * where campaign = 'newsletter' AND ab_test = 'A' AND signed_up = 'june2012'".
 *
 * All this goodness comes at price. Even 3 dimensions per user with cartesian = true is actually 7x times more
 * database records with something around twice as much database CPU load and a bit more Node.js CPU load.
 * Also note, though Countly will optimize database queries as much as it can, database load will increase exponentially
 * with growth of user dimensions number.
 *
 * This is EXPERIMENTAL feature, no warranty.
 *
 */
