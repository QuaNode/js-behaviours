/*jslint node: true */
/*jshint esversion: 6 */

var {
    EventEmitter
} = require("events");

var AbortSignal = function () {

    this.eventEmitter = new EventEmitter();
    this.onabort = null;
    this.aborted = false;
    this.toString = function () {

        return "[object AbortSignal]";
    };
    Object.defineProperty(...[
        this,
        Symbol.toStringTag,
        {
            enumerable: true,
            get() {

                return "AbortSignal";
            }
        }
    ]);
    this.removeEventListener = function () {

        var [name, handler] = arguments;
        this.eventEmitter.removeListener(...[
            name, handler
        ]);
    };
    this.addEventListener = function () {

        var [name, handler] = arguments;
        this.eventEmitter.on(name, handler);
    };
    this.dispatchEvent = function (type) {

        var event = { type, target: this };
        var handlerName = `on${type}`;
        var typeOfH = typeof this[
            handlerName
        ];
        if (typeOfH === "function") {

            this[handlerName](event);
        }
        this.eventEmitter.emit(type, event);
    };
};

var AbortController = function () {

    this.signal = new AbortSignal();
    this.abort = function () {

        if (this.signal.aborted) {

            return;
        }
        this.signal.aborted = true;
        this.signal.dispatchEvent("abort");
    };
    this.toString = function () {

        return "[object AbortController]";
    };
    Object.defineProperty(...[
        this,
        Symbol.toStringTag,
        {
            enumerable: true,
            get() {

                return "AbortController";
            }
        }
    ]);
};

module.exports = {

    AbortController, AbortSignal
};