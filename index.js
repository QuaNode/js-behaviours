/*jslint node: true */
/*jshint esversion: 6 */

var http = typeof axios === 'function' ? axios : require('axios');

var sourceStorage = {};
var global = typeof window === 'object' ? window : {

    location: {

        origin: ''
    },
    localStorage: {

        setItem: function (key, value) {

            sourceStorage[key] = value;
        },
        getItem: function (key) {

            return sourceStorage[key];
        }
    }
};

var getValueForParameter = function (parameter, data, key, name) {

    if (typeof data === 'object' && typeof key === 'string' && data[key] !== undefined)
        return data[key];
    else return (function () {

        if (parameter.value) return typeof parameter.value === 'function' ?
            parameter.value(name, data) : parameter.value;
        else return getParamterFromCache(parameter.source, key)[key].value;
    }());
};

var getParamterFromCache = function (source, key) {

    var getItem = function () {

        return JSON.parse(global[source].getItem('Behaviours') ||
            (key ? '{"' + key + '":{}}' : '{}'));
    };
    if (typeof source === 'string' && typeof global[source] === 'object') {

        try {

            return getItem();
        } catch (e) {

            console.log(e);
        }
        global[source].getItem = function (key) {

            return sourceStorage[key];
        };
        return getItem();
    }
    return JSON.parse(key ? '{"' + key + '":{}}' : '{}');
};

var setParameterToCache = function (parameters, key) {

    if (typeof key === 'string' && typeof parameters[key].source === 'string' &&
        typeof global[parameters[key].source] === 'object') {

        try {

            return global[parameters[key].source].setItem('Behaviours', JSON.stringify(parameters));
        } catch (e) {

            console.log(e);
        }
        global[parameters[key].source].setItem = function (key, value) {

            sourceStorage[key] = value;
        };
        global[parameters[key].source].setItem('Behaviours', JSON.stringify(parameters));
    }
};

class Behaviours {

    constructor(baseURL, errorCallback, defaults) {

        var self = this;
        var behavioursBody = null;
        var behavioursHeaders = null;
        var callbacks = [];
        if (!behavioursBody) try {

            var behaviours_request_url = (typeof baseURL === 'string' && baseURL.length > 0 ?
                typeof baseURL.split('/')[0] === 'string' &&
                    baseURL.split('/')[0].startsWith('http') ?
                    baseURL : global.location.origin + baseURL : '') + '/behaviours';
            http.get(behaviours_request_url).then(function (response) {

                behavioursBody = response.data;
                behavioursHeaders = {

                    'Content-Type': response.headers['content-type']
                };
                if (typeof behavioursBody === 'object') {

                    var keys = Object.keys(behavioursBody);
                    for (var i = 0; i < keys.length; i++) {

                        self[keys[i]] = self.getBehaviour(keys[i]);
                    }
                    for (i in callbacks) {

                        var callback = callbacks[i];
                        if (typeof callback === 'function') callback();
                    }
                } else {

                    throw new Error('Error in initializing Behaviours');
                }
            }, function (error) {

                error = error.response || error;
                error.message = (error.data && error.data.message) || error.message;
                throw new Error('Error in initializing Behaviours: ' + error.message ||
                    error.statusText || ('Error status: ' + error.status));
            });
        } catch (error) {

            throw new Error('Error in initializing Behaviours: ' + error.message);
        }
        self.getBaseUrl = self.getBaseURL = function () {

            return baseURL;
        };
        self.ready = function (cb) {

            if (typeof cb !== 'function') return;
            if (!behavioursBody) {

                callbacks.push(cb);
            } else cb();
        };
        self.getBehaviour = function (behaviourName) {

            if (typeof behaviourName !== 'string') {

                throw new Error('Invalid behaviour name');
            }
            if (!behavioursBody) {

                throw new Error('Behaviours is not ready yet');
            }
            if (behavioursBody[behaviourName]) {

                var behaviour = behavioursBody[behaviourName];
                return function (behaviourData, callback) {

                    if (typeof behaviourData !== 'object') behaviourData = {};
                    var parameters =
                        Object.assign(getParamterFromCache('localStorage'), defaults || {});
                    var params =
                        Object.keys(behaviour.parameters || {}).reduce(function (params, key) {

                            params[key] = parameters[key] || behaviour.parameters[key];
                            return params;
                        }, {});
                    var keys = Object.keys(params);
                    var headers = Object.assign({}, behavioursHeaders);
                    var data = {};
                    var url = behaviour.path;
                    for (var index in keys) {

                        var param = params[keys[index]];
                        if (typeof param !== 'object') continue;
                        var value = getValueForParameter(param, behaviourData, keys[index],
                            behaviourName);
                        var type = param.type;
                        if (value === undefined && type !== 'path') continue;
                        if (Array.isArray(param.unless) &&
                            param.unless.indexOf(behaviourName) > -1) continue;
                        if (Array.isArray(param.for) && param.for.indexOf(behaviourName) === -1)
                            continue;
                        switch (type) {

                            case 'header':
                                headers[param.key] = value;
                                break;
                            case 'body':
                                var paths = param.key.split('.');
                                var nestedData = data;
                                var lastPath = null;
                                for (var path in paths) {

                                    if (lastPath) nestedData = nestedData[lastPath];
                                    if (!nestedData[paths[path]]) nestedData[paths[path]] = {};
                                    lastPath = paths[path];
                                }
                                if (lastPath) nestedData[lastPath] = value;
                                break;
                            case 'path':
                                url = url.replace(':' + encodeURIComponent(param.key),
                                    value ? encodeURIComponent(value) : '*');
                                break;
                            case 'query':
                                var and = '&';
                                if (url.indexOf('?') === -1) {

                                    url += '?';
                                    and = '';
                                }
                                url += and + encodeURIComponent(param.key) + '=' +
                                    encodeURIComponent(value);
                                break;
                        }
                    }
                    var request = function (signature) {

                        var request_method = behaviour.method.toLowerCase();
                        var request_url = (typeof baseURL === 'string' && baseURL.length > 0 ?
                            typeof baseURL.split('/')[0] === 'string' &&
                                baseURL.split('/')[0].startsWith('http') ? baseURL :
                                global.location.origin + baseURL : '') + url;
                        var cache = sourceStorage;
                        http.request({

                            method: request_method,
                            url: request_url,
                            headers: !signature ? headers : Object.assign(headers, {

                                'Behaviour-Signature': signature
                            }),
                            data: data
                        }).then(function (response) {

                            var resBody = response.data;
                            var resHeaders = response.headers;
                            var sig = resBody && resBody.signature;
                            if (sig) return request(sig);
                            headers = {};
                            data = {};
                            if (typeof behaviour.returns === 'object' &&
                                Object.keys(behaviour.returns).filter(function (key) {

                                    var paramValue, paramKey;
                                    if (behaviour.returns[key].type === 'header')
                                        headers[paramKey = behaviour.returns[key].key || key] =
                                            paramValue = resHeaders && resHeaders[key.toLowerCase()];
                                    if (behaviour.returns[key].type === 'body' && resBody &&
                                        typeof resBody.response === 'object' && !data[key])
                                        data[paramKey = key] = paramValue = resBody &&
                                            Array.isArray(resBody.response) ?
                                            resBody.response : resBody &&
                                            resBody.response[key];
                                    var purposes = behaviour.returns[key].purpose;
                                    if (purposes && paramValue && paramKey) {

                                        var _cache = sourceStorage;
                                        sourceStorage = cache;
                                        if (!Array.isArray(purposes))
                                            purposes = behaviour.returns[key].purpose = [purposes];
                                        for (var index in purposes) {

                                            var purpose = purposes[index];
                                            switch (typeof purpose === 'object' ?
                                                purpose.as : purpose) {

                                                case 'parameter':
                                                    var param =
                                                        getParamterFromCache('localStorage');
                                                    param[paramKey] = parameters[paramKey] = {

                                                        key: key,
                                                        type: behaviour.returns[key].type
                                                    };
                                                    if (Array.isArray(purpose.unless))
                                                        param[paramKey].unless =
                                                            parameters[paramKey].unless =
                                                            purpose.unless;
                                                    if (Array.isArray(purpose.for))
                                                        param[paramKey].for =
                                                            parameters[paramKey].for = purpose.for;
                                                    if (purposes.filter(function (otherPurpose) {

                                                        return otherPurpose === 'constant' ||
                                                            otherPurpose.as === 'constant';
                                                    }).length > 0) param[paramKey].value =
                                                        parameters[paramKey].value = paramValue;
                                                    param[paramKey].source =
                                                        parameters[paramKey].source = 'localStorage';
                                                    setParameterToCache(param, paramKey);
                                                    break;
                                            }
                                        }
                                        sourceStorage = _cache;
                                    }
                                    return behaviour.returns[key].type === 'header';
                                }).length > 0) {

                                setTimeout(callback, 0, Object.assign(headers,
                                    Object.keys(data).length === 0 ? {

                                        data: resBody && resBody.response
                                    } : data));
                            } else setTimeout(callback, 0, resBody && resBody.response);
                        }).catch(function (error) {

                            error = error.response || error;
                            error.message = (error.data && error.data.message) || error.message;
                            var err = new Error(error.message || error.statusText ||
                                ('Error status: ' + error.status));
                            err.code = error.status;
                            if (errorCallback) errorCallback(err);
                            setTimeout(callback, 0, null, err);
                        });
                    };
                    return request();
                };
            } else throw new Error('This behaviour does not exist.');
        };
    }
}

if (typeof window === 'object') window.Behaviours = Behaviours;
else {

    Behaviours.prototype.setCache = function (cache) {

        if (!global._sourceStorage) global._sourceStorage = sourceStorage;
        if (typeof cache === 'object') sourceStorage = cache;
        else sourceStorage = global._sourceStorage;
    };
    Behaviours.prototype.getCache = function () {

        return global.localStorage;
    };
    module.exports = Behaviours;
}