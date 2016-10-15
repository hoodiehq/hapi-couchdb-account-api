module.exports = hapiAccount
hapiAccount.attributes = {
  name: 'account'
}

// var getApi = require('../api')
var getApi = require('@hoodie/account-server-api')
var _ = require('lodash')

var routePlugins = [
  require('../routes/account'),
  require('../routes/accounts'),
  require('../routes/profile'),
  require('../routes/requests'),
  require('../routes/session')
]

var TIMEOUT_14_DAYS = 1209600
function hapiAccount (server, options, next) {
  var routeOptions = _.cloneDeep({}, options)
  routeOptions.sessionTimeout = options.sessionTimeout || TIMEOUT_14_DAYS

  options.usersDb.constructor.plugin(require('pouchdb-admins'))

  var users = getApi({
    db: options.usersDb,
    secret: options.secret,
    sessionTimeout: routeOptions.sessionTimeout
  })
  routeOptions.admins = options.usersDb.admins({
    secret: options.secret,
    admins: options.admins,
    sessionTimeout: routeOptions.sessionTimeout
  })
  delete routeOptions.secret

  routeOptions.notifications = options.notifications

  server.expose({
    api: users
  })

  var plugins = [{
    register: require('@gar/hapi-json-api'),
    options: {}
  }, {
    register: require('./remove-cookie-header'),
    options: {'sandbox': 'plugin'}
  }].concat(routePlugins.map(function (plugin) {
    return {
      register: plugin,
      options: routeOptions
    }
  }))

  server.register(plugins, next)
}
