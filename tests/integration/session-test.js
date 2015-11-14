var nock = require('nock')
var test = require('tap').test
var lodash = require('lodash')

var getServer = require('./utils/get-server')
var couchdbErrorTests = require('./utils/couchdb-error-tests')
var authorizationHeaderNotAllowedErrorTest = require('./utils/authorization-header-not-allowed-error')

getServer(function (error, server) {
  if (error) {
    return test.fail(error)
  }

  var jsonAPIHeaders = {
    accept: 'application/vnd.api+json',
    'content-type': 'application/vnd.api+json'
  }

  var headersWithAuth = lodash.merge({authorization: 'Bearer sessionid123'}, jsonAPIHeaders)

  test('PUT /session', function (group) {
    var postSessionRouteOptions = {
      method: 'PUT',
      url: '/session',
      headers: jsonAPIHeaders,
      payload: {
        data: {
          type: 'session',
          attributes: {
            username: 'pat-doe',
            password: 'secret'
          }
        }
      }
    }
    function postSessionResponseMock () {
      return nock('http://localhost:5984').post('/_session', {
        name: postSessionRouteOptions.payload.data.attributes.username,
        password: postSessionRouteOptions.payload.data.attributes.password
      })
    }

    authorizationHeaderNotAllowedErrorTest(server, group, postSessionRouteOptions, headersWithAuth)

    group.test('Invalid credentials', function (t) {
      var couchdb = postSessionResponseMock()
        .reply(401, {
          error: 'unauthorized',
          reason: 'Name or password is incorrect.'
        })

      server.inject(postSessionRouteOptions, function (response) {
        t.doesNotThrow(couchdb.done, 'CouchDB received request')
        t.is(response.statusCode, 401, 'returns 401 status')
        t.is(response.result.errors.length, 1, 'returns one error')
        t.is(response.result.errors[0].title, 'Unauthorized', 'returns "Unauthorized" error')
        t.is(response.result.errors[0].detail, 'Name or password is incorrect.', 'returns "Name or password is incorrect." message')
        t.end()
      })
    })

    couchdbErrorTests(server, group, postSessionResponseMock, postSessionRouteOptions)

    group.test('Session was created', function (t) {
      postSessionResponseMock().reply(201, {
        ok: true,
        // name is null when user is also a CouchDB admin, so we work around it
        // https://issues.apache.org/jira/browse/COUCHDB-1356
        name: null,
        roles: [
          'id:abc1234'
        ]
      }, {
        'Set-Cookie': ['AuthSession=sessionid123; Version=1; Expires=Tue, 08-Sep-2015 00:35:52 GMT; Max-Age=1209600; Path=/; HttpOnly']
      })

      var sessionResponse = require('./fixtures/session-response.json')

      server.inject(postSessionRouteOptions, function (response) {
        delete response.result.meta
        t.is(response.statusCode, 201, 'returns 201 status')
        t.deepEqual(response.result, sessionResponse, 'returns the right content')
        t.end()
      })
    })

    group.test('Session was created, but user is CouchDB admin', function (t) {
      // TODO: unclear how to handle CouchDB admins. A _users doc is optional for CouchDB admins.
      t.end()
    })

    couchdbErrorTests(server, group, postSessionResponseMock, postSessionRouteOptions)

    group.end()
  })

  // > Because compound documents require full linkage, intermediate
  //   resources in a multi-part path must be returned along with the leaf
  //   nodes. For example, a response to a request for comments.author should
  //   include comments as well as the author of each of those comments.
  // — http://jsonapi.org/format/#fetching-includes
  test('PUT /session?include=account.profile', function (group) {
    var postSessionRouteOptions = {
      method: 'PUT',
      url: '/session?include=account.profile',
      headers: jsonAPIHeaders,
      payload: {
        data: {
          type: 'session',
          attributes: {
            username: 'pat-doe',
            password: 'secret'
          }
        }
      }
    }

    group.test('Session was created', function (t) {
      t.plan(1)

      nock('http://localhost:5984')
        .post('/_session', {
          name: 'pat-doe',
          password: 'secret'
        })
        .reply(201, {
          ok: true,
          name: null,
          roles: [
            'id:abc1234'
          ]
        }, {
          'Set-Cookie': ['AuthSession=sessionid123; Version=1; Expires=Tue, 08-Sep-2015 00:35:52 GMT; Max-Age=1209600; Path=/; HttpOnly']
        })
        .get('/_users/org.couchdb.user:pat-doe')
        .reply(200, {
          profile: {
            fullName: 'pat Doe',
            email: 'pat@example.com'
          }
        })

      var sessionWitProfileResponse = require('./fixtures/session-with-profile-response.json')

      server.inject(postSessionRouteOptions, function (response) {
        delete response.result.meta
        t.deepEqual(response.result, sessionWitProfileResponse, 'returns the right content')
      })
    })

    group.end()
  })

  test('GET /session', function (group) {
    var getSessionRouteOptions = {
      method: 'GET',
      url: '/session',
      headers: headersWithAuth
    }

    function getSessionResponseMock () {
      return nock('http://localhost:5984').get('/_session')
    }

    group.test('No Authorization header sent', function (t) {
      server.inject({
        method: 'GET',
        url: '/session',
        headers: {}
      }, function (response) {
        t.is(response.statusCode, 403, 'returns 403 status')
        t.end()
      })
    })

    group.test('CouchDB Session does no exist', function (t) {
      var couchdb = getSessionResponseMock()
        .reply(200, {
          userCtx: { name: null }
        })

      server.inject(getSessionRouteOptions, function (response) {
        t.is(response.statusCode, 404, 'returns 404 status')
        t.is(response.result.errors.length, 1, 'returns one error')
        t.is(response.result.errors[0].title, 'Not Found', 'returns "Not Found" error')
        t.doesNotThrow(couchdb.done, 'CouchDB received request')
        t.end()
      })
    })

    group.test('CouchDB Session does exist', function (t) {
      getSessionResponseMock().reply(200, {
        userCtx: {
          name: 'pat-doe',
          roles: [
            'id:abc1234'
          ]
        }
      })

      var sessionResponse = require('./fixtures/session-response.json')

      server.inject(getSessionRouteOptions, function (response) {
        delete response.result.meta
        t.is(response.statusCode, 200, 'returns 200 status')
        t.deepEqual(response.result, sessionResponse, 'returns the right content')
        t.end()
      })
    })

    couchdbErrorTests(server, group, getSessionResponseMock, getSessionRouteOptions)

    group.end()
  })

  test('GET /session?include=account.profile', function (t) {
    t.plan(1)

    var getSessionRouteOptions = {
      method: 'GET',
      url: '/session?include=account.profile',
      headers: headersWithAuth
    }

    nock('http://localhost:5984')
      .get('/_session')
      .reply(200, {
        ok: true,
        userCtx: {
          name: 'pat-doe',
          roles: [
            'id:abc1234'
          ]
        }
      })
      .get('/_users/org.couchdb.user:pat-doe')
      .reply(200, {
        profile: {
          fullName: 'pat Doe',
          email: 'pat@example.com'
        }
      })

    var sessionWitProfileResponse = require('./fixtures/session-with-profile-response.json')

    server.inject(getSessionRouteOptions, function (response) {
      delete response.result.meta
      t.deepEqual(response.result, sessionWitProfileResponse, 'returns the right content')
    })
  })

  test('GET /session?include=foobar', function (t) {
    t.plan(1)

    var getSessionRouteOptions = {
      method: 'GET',
      url: '/session?include=foobar',
      headers: headersWithAuth
    }

    server.inject(getSessionRouteOptions, function (response) {
      t.is(response.statusCode, 403, 'returns 403 status')
    })
  })

  test('DELETE /session', function (group) {
    var deleteSessionRouteOptions = {
      method: 'DELETE',
      url: '/session',
      headers: headersWithAuth
    }
    function deleteSessionResponseMock () {
      return nock('http://localhost:5984').delete('/_session')
    }

    // CouchDB response is the same, no matter if session existed or not
    group.test('CouchDB responds', function (t) {
      var couchdb = deleteSessionResponseMock()
        .reply(200, {
          ok: true
        }, {
          'Set-Cookie': 'AuthSession=; Version=1; Path=/; HttpOnly'
        })

      server.inject(deleteSessionRouteOptions, function (response) {
        t.is(response.statusCode, 204, 'returns 204 status')
        t.doesNotThrow(couchdb.done, 'CouchDB received request')
        t.end()
      })
    })

    couchdbErrorTests(server, group, deleteSessionResponseMock, deleteSessionRouteOptions)

    group.end()
  })

  test('DELETE /session?include=account', function (t) {
    t.plan(2)

    var postSessionRouteOptions = {
      method: 'DELETE',
      url: '/session?include=account',
      headers: headersWithAuth
    }

    nock('http://localhost:5984')
       .get('/_session')
       .reply(200, {
         ok: true,
         userCtx: {
           name: 'pat-doe',
           roles: [
             'id:abc1234'
           ]
         }
       })
      .get('/_users/org.couchdb.user:pat-doe')
      .reply(200, {
        profile: {
          fullName: 'pat Doe',
          email: 'pat@example.com'
        }
      })
      .delete('/_session')
      .reply(200, {
        ok: true
      }, {
        'Set-Cookie': 'AuthSession=; Version=1; Path=/; HttpOnly'
      })

    var sessionResponse = require('./fixtures/session-response.json')

    server.inject(postSessionRouteOptions, function (response) {
      delete response.result.meta
      t.is(response.statusCode, 200, 'returns 200 status')
      t.deepEqual(response.result, sessionResponse, 'returns the right content')
    })
  })

  test('DELETE /session?include=account.profile', function (t) {
    t.plan(2)

    var postSessionRouteOptions = {
      method: 'DELETE',
      url: '/session?include=account.profile',
      headers: headersWithAuth
    }

    nock('http://localhost:5984')
       .get('/_session')
       .reply(200, {
         ok: true,
         userCtx: {
           name: 'pat-doe',
           roles: [
             'id:abc1234'
           ]
         }
       })
      .get('/_users/org.couchdb.user:pat-doe')
      .reply(200, {
        profile: {
          fullName: 'pat Doe',
          email: 'pat@example.com'
        }
      })
      .delete('/_session')
      .reply(200, {
        ok: true
      }, {
        'Set-Cookie': 'AuthSession=; Version=1; Path=/; HttpOnly'
      })

    var sessionWitProfileResponse = require('./fixtures/session-with-profile-response.json')

    server.inject(postSessionRouteOptions, function (response) {
      delete response.result.meta
      t.is(response.statusCode, 200, 'returns 200 status')
      t.deepEqual(response.result, sessionWitProfileResponse, 'returns the right content')
    })
  })
})
