// input normalization

import { observable, observableArray, pureComputed } from 'knockout'

const keyboardArray = observable({})
const gamepadArray = observable([])
const gamepads = observableArray([])

const gamepadHandler = function(event, connecting) {
    const gamepad = event.gamepad
    if (connecting) {
      gamepads()[gamepad.index] = function () {
        return navigator.getGamepads()[gamepad.index]
      }
      gamepads(gamepads())
    } else {
      delete gamepads[gamepad.index]
      gamepads(gamepads())
    }
}

window.addEventListener("gamepadconnected", function (e) { 
    gamepadHandler(e, true);
}, false);
window.addEventListener("gamepaddisconnected", (e) => {
    gamepadHandler(e, false)
}, false);

const gamepadListeners = observable({})

setInterval(function () {
    let gpads = gamepads()
    
    let listenerKeys = Object.keys(gamepadListeners())
    for (let k = 0; k < listenerKeys.length; k++) {
        let listeners = gamepadListeners()[listenerKeys[k]]()
        if (listenerKeys[k].indexOf('axis') === -1) {
            let buttonIndex = listenerKeys[k]
            let isButtonPressed = listeners.length !== 0 && gpads.length !== 0
            let i
            for (i = 0; i < gpads.length; i++) {
                let gamepad = gpads[i]()
                isButtonPressed = isButtonPressed && gamepad.buttons[buttonIndex].pressed
            }
            for (i = 0; i < listeners.length; i++) {
                listeners[i](isButtonPressed)
            }
        } else {
            // axis listener
            let axisIndex = parseInt(listenerKeys[k].split('axis')[1])
            let axis = [0, 0]
            let i
            for (i = 0; i < gpads.length; i++) {
                let gamepad = gpads[i]()
                // deadzone
                axis[0] += Math.floor(gamepad.axes[axisIndex * 2] * 100) / 100
                axis[1] += Math.floor(gamepad.axes[axisIndex * 2 + 1] * 100) / 100
            }
            for (i = 0; i < listeners.length; i++) {
                listeners[i](axis)
            }
        }
    }
}, 0)

const listenForGamepadButtonPress = function (buttonIndex, listener) {
    let listenerKeys = Object.keys(gamepadListeners())
    if (listenerKeys.indexOf(buttonIndex) === -1) {
        gamepadListeners()[buttonIndex] = observableArray([])
    }
    gamepadListeners()[buttonIndex].push(listener)
}

const listenForGamepadAxis = function (axisIndex, listener) {
    return listenForGamepadButtonPress(`axis${axisIndex}`, listener)
}

const getButtonObservable = function (buttonIndex) {
    if (Object.keys(gamepadArray()).indexOf(buttonIndex) !== -1) {
        return gamepadArray()[buttonIndex]
    } else {
        let buttonObservable = observable(false)
        listenForGamepadButtonPress(buttonIndex, function (value) {
            buttonObservable(value)
        })
        return buttonObservable
    }
}

const getAxisObservable = function (axisIndex) {
    if (Object.keys(gamepadArray()).indexOf(`axis${axisIndex}`) !== -1) {
        return gamepadArray()[`axis${axisIndex}`]
    } else {
        let axisObservable = observable([0, 0])
        listenForGamepadAxis(axisIndex, function (value) {
            if (value[0] !== axisObservable()[0] && value[1] !== axisObservable()[1]) {
                axisObservable(value)
            }
        })
        return axisObservable
    }
}

window.addEventListener('keydown', function (e) {
    let key = e.key.toLowerCase()
    let array = keyboardArray()
    if (Object.keys(array).indexOf(key) === -1) {
        array[key] = observable()
    }
    array[key](true)
    keyboardArray(array)
})

window.addEventListener('keyup', function (e) {
    let key = e.key.toLowerCase()
    let array = keyboardArray()
    if (Object.keys(array).indexOf(key) === -1) {
        array[key] = observable()
    }
    array[key](false)
    keyboardArray(array)
})

let listenForKeyChanged = function (key, listener) {
    key = key.toLowerCase()
    let array = keyboardArray()
    let keys = Object.keys(array)
    if (keys.indexOf(key) !== -1) {
        array[key].subscribe(listener)
    } else {
        let waitUntilFirstPress = keyboardArray.subscribe(function (value) {
            if (Object.keys(value).indexOf(key) !== -1) {
                listener(value[key]())
                value[key].subscribe(listener)
                waitUntilFirstPress.dispose()
            }
        })
    }
}

let getKeyObservable = function (key) {
    if (Object.keys(keyboardArray()).indexOf(key) !== -1) {
        return keyboardArray()[key]
    } else {
        let keyObservable = observable(false)
        listenForKeyChanged(key, function (value) {
            keyObservable(value)
        })
        return keyObservable
    }
}

let firstInteractionListeners = []
let hasInteracted = false

let onFirstInteraction = function (listener, wait = true) {

    if (hasInteracted) {
        listener()
    } else if (wait) {
        firstInteractionListeners.push(listener)
    }
}

let listenForFirstAction = function () {
    if (!hasInteracted) {
        hasInteracted = true
        for (let i = 0; i < firstInteractionListeners.length; i++) {
            firstInteractionListeners[i]()
        }
        document.body.removeEventListener('click', listenForFirstAction);
        document.body.removeEventListener('touchstart', listenForFirstAction);
    }
}
document.body.addEventListener('click', listenForFirstAction);
document.body.addEventListener('touchstart', listenForFirstAction);

export {
    getKeyObservable,
    getButtonObservable,
    getAxisObservable,
    onFirstInteraction
}