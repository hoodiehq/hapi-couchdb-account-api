module.exports = getSession

var Boom = require('boom')

var getAccount = require('../account/get')

function getSession (options, callback) {
  var request = require('request').defaults({
    json: true,
    baseUrl: options.couchUrl,
    timeout: 10000 // 10 seconds
  })

  request.get({
    url: '/_session',
    headers: {
      cookie: 'AuthSession=' + options.bearerToken
    }
  }, function (error, response, body) {
    if (error) {
      return callback(Boom.wrap(error))
    }

    if (response.statusCode >= 400) {
      return callback(Boom.create(response.statusCode, body.reason))
    }

    if (body.userCtx.name === null) {
      return callback(Boom.notFound())
    }

    // TODO: it's not guratneed that the `id:<accountId>` role is 1st
    var username = body.userCtx.name
    var accountId = body.userCtx.roles[0].substr(3)
    var session = {
      id: options.bearerToken,
      account: {
        id: accountId,
        username: username
      }
    }

    if (!options.includeProfile) {
      return callback(null, session)
    }

    getAccount({
      couchUrl: options.couchUrl,
      bearerToken: options.bearerToken,
      username: session.account.username
    }, function (error, account) {
      if (error) {
        return callback(error)
      }

      session.account.profile = account.profile || {}

      callback(null, session)
    })
  })
}
