/*!
 * jquery.analytics.js
 * API Analytics agent for jQuery
 * https://github.com/Mashape/analytics-jquery-agent
 *
 * Copyright (c) 2015, Mashape (https://www.mashape.com)
 * Released under the @LICENSE license
 * https://github.com/Mashape/analytics-jquery-agent/blob/master/LICENSE
 *
 * @version @VERSION
 * @date @DATE
 */

(function (factory) {
  if (typeof define === 'function' && define.amd) {
    define(['jquery'], factory)
  } else if (typeof exports === 'object') {
    // Node/CommonJS
    module.exports = factory(require('jquery'));
  } else {
    factory(jQuery)
  }
})(function (jQuery) {
  'use strict'

  // Default Constants
  var PLUGIN_NAME = 'Analytics'
  var PLUGIN_VERSION = '@VERSION'
  var PLUGIN_AGENT_NAME = 'jQuery Analytics Agent'
  var ANALYTICS_HOST = 'http://socket.apianalytics.com/'
  var FALLBACK_IP = '127.0.0.1'
  var HTTP_VERSION = 'HTTP/1.1'
  var DEBUG = false

  // Globals
  var $document = jQuery(document)

  // Log related Globals
  var clientIp = FALLBACK_IP

  /**
   * Plugin constructor
   *
   * @param {String} token
   * @param {Object} options
   */
  function Plugin (token, options) {
    // Constants configuration
    ANALYTICS_HOST = options.analyticsHost || ANALYTICS_HOST
    HTTP_VERSION = options.httpVersion || HTTP_VERSION
    FALLBACK_IP = options.fallbackIp || FALLBACK_IP
    DEBUG = options.debug || DEBUG

    // Service token
    this.serviceToken = token
    this.fetchClientIp = typeof options.fetchClientIp === 'undefined' ? true : options.fetchClientIp

    // Initialize
    this.init()
  }

  /**
   * Returns client ip
   *
   * @return {String}
   */
  Plugin.getClientIp = function () {
    return clientIp
  }

  // Extend
  jQuery.extend(Plugin.prototype, {
    init: function () {
      if (this.fetchClientIp) {
        jQuery.ajax({
          url: 'http://httpconsole.com/ip',
          type: 'GET',
          headers: {'Accept':'yaml'},
          global: false,
          success: function (data) {
            clientIp = data.origin
          }
        })
      }

      $document.ajaxSend(this.onSend.bind(this))
      $document.ajaxComplete(this.onComplete.bind(this))
    },

    onSend: function (event, xhr, options) {
      // Save start time
      options._startTime = +(new Date())
      options._sendTime = options._startTime - event.timeStamp
    },

    onComplete: function (event, xhr, options, data) {
      // Start new alf object
      var alf = new Plugin.Alf(this.serviceToken, {
        name: PLUGIN_AGENT_NAME,
        version: PLUGIN_VERSION
      })

      // Type
      options.type = options.type.toUpperCase()

      // Modifiers
      var start = options._startTime
      var end = event.timeStamp
      var difference = end - start
      var url = options.url
      var responseHeaders = Plugin.getResponseHeaderObject(xhr)
      var headers = options.headers
      var query = options.type === 'GET' ? options.data : {}
      var responseBodySize
      var bodySize
      var body

      // Obtain body
      try {
        body = options.type === 'GET' ? typeof options.data === 'string' ?
          options.data : JSON.stringify(options.data) : ''
      } catch (e) {
        body = ''
      }

      // Obtain bytesize of body
      bodySize = Plugin.getStringByteSize(body || '')
      responseBodySize = Plugin.getStringByteSize(xhr.responseText || '')

      // Handle Querystring
      if (typeof query === 'string') {
        query = Plugin.parseQueryString(query)
      }

      // Get Querystring from URL
      if (url.indexOf('?') !== -1) {
        jQuery.extend(query, Plugin.parseQueryString(url))
      }

      // Convert query to alf style
      query = Plugin.marshalObjectToArray(query)

      // Convert headers to alf style
      headers = Plugin.marshalObjectToArray(headers)
      responseHeaders = Plugin.marshalObjectToArray(responseHeaders)

      // Insert entry
      alf.entry({
        startedDateTime: new Date(start).toISOString(),
        serverIpAddress: FALLBACK_IP,
        clientIpAddress: Plugin.getClientIp(),
        time: difference,
        request: {
          method: options.type,
          url: options.url,
          httpVersion: HTTP_VERSION,
          queryString: query,
          headers: headers,
          headersSize: -1,
          bodySize: bodySize
        },
        response: {
          status: xhr.status,
          statusText: xhr.statusText,
          httpVersion: HTTP_VERSION,
          headers: responseHeaders,
          headersSize: -1,
          bodySize: responseBodySize
        },
        timings: {
          blocked: 0,
          dns: 0,
          connect: 0,
          send: options._sendTime,
          wait: difference,
          receive: 0,
          ssl: 0
        }
      })

      // DEBUG
      if (DEBUG) {
        options._alf = alf
        alf.send(options)
      } else {
        alf.send()
      }
    }
  })

  /**
   * Alf Constructor
   */
  Plugin.Alf = function Alf (serviceToken, creator) {
    this.output = {
      serviceToken: serviceToken,
      har: {
        log: {
          version: '1.2',
          creator: creator,
          entries: []
        }
      }
    }
  }

  /**
   * Push ALF Har-esque entry to entries list
   *
   * @param  {Object} item
   */
  Plugin.Alf.prototype.entry = function (item) {
    this.output.har.log.entries.push(item)
  }

  /**
   * Send ALF Object to ANALYTICS_HOST
   */
  Plugin.Alf.prototype.send = function (options) {
    var request = {
      url: ANALYTICS_HOST,
      global: false,
      type: 'POST',
      data: JSON.stringify(this.output),
      dataType: 'json',
      contentType: 'application/json'
    }

    if (!DEBUG) {
      jQuery.ajax(request)
    }

    if (options) {
     options._alfRequest = request
    }
  }

  /**
   * Parses XMLHttpRequest getAllResponseHeaders into a key-value map
   *
   * @param {Object} xhrObject
   */
  Plugin.getResponseHeaderObject = function getResponseHeaderObject (xhrObject) {
    var headers = xhrObject.getAllResponseHeaders()
    var list = {}
    var pairs

    if (!headers) {
      return list
    }

    pairs = headers.split('\u000d\u000a')

    for (var i = 0, length = pairs.length; i < length; i++) {
      var pair = pairs[i]

      // Can't use split() here because it does the wrong thing
      // if the header value has the string ": " in it.
      var index = pair.indexOf('\u003a\u0020')

      if (index > 0) {
        var key = pair.substring(0, index)
        var val = pair.substring(index + 2)
        list[key] = val
      }
    }

    return list
  }

  /**
   * Returns the specified string as a key-value object.
   * Reoccuring keys become array values.
   *
   * @param  {String} string
   * @return {Object}
   */
  Plugin.parseQueryString = function parseQueryString (string) {
    if (!string) {
      return {}
    }

    string = decodeURIComponent(string)

    var index = string.indexOf('?')
    var result = {}
    var pairs

    string = (index !== -1 ? string.slice(0, index) : string)
    string = string.replace(/&+/g, '&').replace(/^\?*&*|&+$/g, '')

    if (!string) {
      return result
    }

    for (var i = 0, length = pairs.length; i < length; i++) {
      var pair = pairs[i].split('=')
      var key = pair[0]
      var value = pair[1]

      if (key.length) {
        if (result[key]) {
          if (!result[key].push) {
            result[key] = [result[key]]
          }

          result[key].push(value || '')
        }
      } else {
        result[key] = value || ''
      }
    }

    return result
  }

  /**
   * Returns an Array of Objects containing the properties name, and value.
   *
   * @param  {Object} object Object to be marshalled to an Array
   * @return {Array}
   */
  Plugin.marshalObjectToArray = function marshalObjectToArray (object) {
    var output = []

    for (var key in object) {
      if (object.hasOwnProperty(key)) {
        output.push({
          name: key,
          value: object[key]
        })
      }
    }

    return output
  }

  /**
   * Returns the bytesize of the specified UTF-8 string
   *
   * @param  {String} string UTF-8 string to run bytesize calculations on
   * @return {Number} Bytesize of the specified string
   */
  Plugin.getStringByteSize = function getStringByteSize (string) {
    return encodeURI(string).split(/%(?:u[0-9A-F]{2})?[0-9A-F]{2}|./).length-1
  }

  // Export plugin
  jQuery[PLUGIN_NAME] = function (token, options) {
    // Support object style initialization
    if (typeof token === 'object') {
      options = token
      token = options.serviceToken
    }

    // Setup options
    options = options || {}

    // Check service token
    if (typeof token !== 'string' || token.length === 0) {
      throw {
        name: 'MissingArgument',
        message: 'Service token is missing'
      }
    }

    // Initialize plugin
    return new Plugin(token, options)
  }

  return Plugin
})