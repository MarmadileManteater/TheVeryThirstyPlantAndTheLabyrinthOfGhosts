
// ENTRY POINT

import { observable, pureComputed } from 'knockout'
import { State } from './state'
import { loadAudio, loadMapData, loadImageTag, MapNode } from './assets'
import css from './index.css'
import { getAxisObservable, getButtonObservable, getKeyObservable, onFirstInteraction } from './input'
import { invert } from './direction'

const shade = observable("black")
const color = observable(1)
const areaCount = 20

const maps = pureComputed(function () {
    let result = []
    for (var i = 0; i < areaCount; i++) {
        let mapData = loadMapData(`area${i + 1}`)
        if (mapData.properties.exit !== "none" && mapData.properties.exit.indexOf(',') === -1) {
            let entrance = mapData.properties.entrance
            let exit = mapData.properties.exit
            let reverseMap = loadMapData(`area${i + 1}`)
            reverseMap.properties.entrance = exit
            reverseMap.properties.exit = entrance
            result.push(reverseMap)
        } else if (mapData.properties.exit.indexOf(',') !== -1) {
            // this is a little more complicated
            let exitDirections = mapData.properties.exit.split(',')
            for (let k = 0; k < exitDirections.length; k++) {
                let direction = exitDirections[k]
                let exitFields = mapData.properties.exit.toString().replace(direction, mapData.properties.entrance)
                let reverseMap = loadMapData(`area${i + 1}`)
                reverseMap.properties.entrance = direction
                reverseMap.properties.exit = exitFields
                result.push(reverseMap)
            }
        }
        result.push(mapData)
    }
    return result
})

const gameDefinition = { map: observable("start"), position: observable([4, 4]), player: { direction: 'north', animationStep: 0, position: { x: 4.515000000000009, y: 5.950000000000014, dx: 0, dy: 0 }, image: 'kenney_rpgurbanpack_tilemap_packed_monochrome.png', spriteData: { x: 24, y: 3, width: 16, height: 16 }}, message: "", "message-opacity": 0 }

// Define our state
const state = new State(gameDefinition)
state.currentNode(new MapNode(state.map().uri))
state.treeOfMaps(state.currentNode())
const direction = state.player().direction
const animationStep = state.player().animationStep
const playerPosition = state.player().position
const walkingSpeed = 0.035

// #region set up our DOM
let style = document.createElement('style')
style.innerHTML = css
document.head.appendChild(style)
const canvas = document.getElementById('game')
document.body.appendChild(canvas)
let context = canvas.getContext("2d")
// setting the scale for the canvas
const scale = observable()
scale.subscribe(function (value) {
    canvas.setAttribute('width', value * (800/5))
    canvas.setAttribute('height', value * (800/5))
    context = canvas.getContext("2d")
    // allow our pixel art to be scaled correctly
    context.mozImageSmoothingEnabled = false
    context.webkitImageSmoothingEnabled = false
    context.msImageSmoothingEnabled = false
    context.imageSmoothingEnabled = false
})
let resize = function () {
    let smallestComponent = window.innerHeight
    if (window.innerHeight > window.innerWidth) {
        smallestComponent = window.innerWidth - 15
    }
    canvas.style.width = `${smallestComponent}px`
    canvas.style.height = `${smallestComponent}px`
    scale(5)
}
window.addEventListener('resize', resize)
resize()
// #endregion

let splashScreenCounter = 0

let gameOverAudioTrack = undefined
// #region Game loop

// #region Platform ambigious controls
const keys = {
    'up': getKeyObservable('arrowup'),
    'down': getKeyObservable('arrowdown'),
    'left': getKeyObservable('arrowleft'),
    'right': getKeyObservable('arrowright'),
    'w': getKeyObservable('w'),
    'a': getKeyObservable('a'),
    's': getKeyObservable('s'),
    'd': getKeyObservable('d'),
    'p': getKeyObservable('p'),
    'space':getKeyObservable('spacebar'),
    'enter':getKeyObservable('enter'),
    'e':getKeyObservable('e'),
    'r':getKeyObservable('r')
}
const buttons = {
    'a': getButtonObservable(0),
    'b': getButtonObservable(1),
    'x': getButtonObservable(2),
    'y': getButtonObservable(3),
    'share': getButtonObservable(8),
    'option': getButtonObservable(9),
    'down': getButtonObservable(13),
    'up': getButtonObservable(12),
    'left': getButtonObservable(14),
    'right': getButtonObservable(15),
    'leftstick': getAxisObservable(0),
    'rightstick': getAxisObservable(1)
}
const deadzone = 0.5
buttons['axisleft'] = pureComputed(function () {
    let leftStick = buttons['leftstick']()
    let rightStick = buttons['rightstick']()
    return leftStick[0] <= -1 + deadzone  || rightStick[0] <= -1 + deadzone
})
buttons['axisright'] = pureComputed(function () {
    let leftStick = buttons['leftstick']()
    let rightStick = buttons['rightstick']()
    return leftStick[0] >= 1 - deadzone || rightStick[0] >= 1 - deadzone
})
buttons['axisup'] = pureComputed(function () {
    let leftStick = buttons['leftstick']()
    let rightStick = buttons['rightstick']()
    return leftStick[1] <= -1 + deadzone || rightStick[1] <= -1 + deadzone
})
buttons['axisdown'] = pureComputed(function () {
    let leftStick = buttons['leftstick']()
    let rightStick = buttons['rightstick']()
    return leftStick[1] >= 1 - deadzone || rightStick[1] >= 1 - deadzone
})
const up = pureComputed(function () {
    return keys['up']() || keys['w']() || buttons['up']() || buttons['axisup']()
})
const down = pureComputed(function () {
    return keys['down']() || keys['s']() || buttons['down']() || buttons['axisdown']()
})
const left = pureComputed(function () {
    return keys['left']() || keys['a']() || buttons['left']() || buttons['axisleft']()
})
const right = pureComputed(function () {
    return keys['right']() || keys['d']() || buttons['right']() || buttons['axisright']()
})
const action = pureComputed(function () {
    return keys['enter']() || keys['e']() || buttons['a']()
})
const pause = pureComputed(function () {
    return buttons['share']() || keys['p']()
})
pause.subscribe(function (value) {
    if (value) {
        state.paused(!state.paused())
    }
})
const restart = pureComputed(function () {
    return keys['r']() || buttons['option']()
})

restart.subscribe(function (value) {
    if (value && state.health() < 1 && gameOverAudioTrack !== undefined) {// if the game is in game over, and the player presses "ESC", restart the state to initial conditions
        state.reset()
    } else {
        setTimeout(function () {
            if (restart()) {
                state.reset()
            }
        }, 1000)
    }
})
const isStepping = pureComputed(function () {
    return (up() || left() || down() || right()) && state.gameStarted()
})

let clearMessage = function () {
    if (state.gameStarted() && state.message().content() !== "") {
        if (state.message().fadeDirection() == "none" && state.message().opacity() !== 0) {
            state.message().toggle()// dismiss the message when a key is pressed
        }
        state.message().notify()
    }
}
let handleControls = function () {
    let collidedObject
    if ((collidedObject = state.player().wouldBeCollidingWith(state.map(), ['objects'], state.player().position().dx, state.player().position().dy, true, walkingSpeed / 2)) !== false) {
        if (typeof collidedObject.properties.trigger === 'string' && collidedObject.properties.text === undefined && collidedObject.properties.trigger !== 'plant') {
            let triggerActions = []
            let triggerText = collidedObject.properties.trigger
            if (triggerText.indexOf(",") !== -1) {
                triggerActions = triggerText.split(",")
            } else {
                triggerActions.push(triggerText)
            }
            for (let i = triggerActions.length - 1; i >= 0; i--) {
                let actionName = triggerActions[i]
                let triggerNames = Object.keys(triggers)
                if (triggerNames.indexOf(actionName) !== -1) {
                    triggers[actionName](collidedObject)
                }
            }
        }
    }
    if (state.gameStarted()) {
        if (up()) {
            direction('north')
            playerPosition().dy = -walkingSpeed
            playerPosition(playerPosition())
            clearMessage()
        } else if (down()) {
            direction('south')
            playerPosition().dy = walkingSpeed
            playerPosition(playerPosition())
            clearMessage()
        } else if (Math.abs(playerPosition().dy) > 0) {
            playerPosition(playerPosition())
        }
        if (right()) {
            direction('east')
            playerPosition().dx = walkingSpeed
            playerPosition(playerPosition())
            clearMessage()
        } else if (left()) {
            direction('west')
            playerPosition().dx = -walkingSpeed
            playerPosition(playerPosition())
            clearMessage()
        }
    }
    if (action()) {
        if (state.gameStarted() && state.message().content() === "") {// this is kind of hard to explain, but basically, don't trigger another enter event when exiting from a message
            let dx = 0
            let dy = 0
            switch (state.player().direction()) {
                case 'north':
                    dy = -walkingSpeed
                    break;
                case 'south':
                    dy = walkingSpeed
                    break;
                case 'east':
                    dx = walkingSpeed
                    break;
                case 'west':
                    dx = -walkingSpeed
                    break;
            }
            collidedObject = state.player().wouldBeCollidingWith(state.map(), ["objects"], dx, dy, true)
            if (collidedObject !== false) {
                let triggerEvents = function (opacity) {
                    if (opacity <= 0) {
                        if (typeof collidedObject.properties.trigger === 'string') {
                            let triggerActions = []
                            let triggerText = collidedObject.properties.trigger
                            if (triggerText.indexOf(",") !== -1) {
                                triggerActions = triggerText.split(",")
                            } else {
                                triggerActions.push(triggerText)
                            }
                            for (let i = triggerActions.length - 1; i >= 0; i--) {
                                let actionName = triggerActions[i]
                                let triggerNames = Object.keys(triggers)
                                if (triggerNames.indexOf(actionName) !== -1) {
                                    triggers[actionName](collidedObject)
                                }
                            }
                        }
                    }
                }
                if (typeof collidedObject.properties.text === 'string') {
                    state.message().afterDismiss(function () {
                        triggerEvents(0)
                    })
                    state.message().content(collidedObject.properties.text)
                    state.message().toggle()
                } else {
                    triggerEvents(0)
                }
            }
        } else if (state.gameStarted() && state.message().content() !== "") {
            clearMessage()
        }
    }
    if (up() || down() || left() || right() || action()) {
        if (!state.gameStarted()) {
            // start the game
            state.gameStarted(true)
        }
    }
}
// #endregion

var game = function () {
    let map = state.map()
    context.fillStyle = "black"
    context.fillRect(0, 0, canvas.width, canvas.height)
    state.draw(context, scale, canvas)
   
    

    if (!state.paused()) {
        state.update(canvas, scale)
    }
    handleControls()
    if (state.player().position().dx > 0) {
        state.player().position().dx -= 0.005
        state.player().position(state.player().position())
    } else if (state.player().position().dx < 0) {
        state.player().position().dx += 0.005
        state.player().position(state.player().position())
    }

    if (state.player().position().dy > 0) {
        state.player().position().dy -= 0.005
        state.player().position(state.player().position())
    } else if (state.player().position().dy < 0) {
        state.player().position().dy += 0.005
        state.player().position(state.player().position())
    }

    if (Math.abs(state.player().position().dy) <= 0.005) {
        state.player().position().dy = 0
        state.player().position(state.player().position())
    }
    if (Math.abs(state.player().position().dx) <= 0.005) {
        state.player().position().dx = 0
        state.player().position(state.player().position())
    }
    if (Math.abs(state.player().position().dx) > 5) {
        state.player().position().dx = 5 * ((Math.abs(state.player().position().dx)) / state.player().position().dx)
        state.player().position(state.player().position())
    }
    if (Math.abs(state.player().position().dy) > 5) {
        state.player().position().dy = 5 * ((Math.abs(state.player().position().dy)) / state.player().position().dy)
        state.player().position(state.player().position())
    }

    if (state.paused()) {
        context.font = `${scale()*20}px Kenney-Pixel`
        context.fillStyle = "white"
        context.fillRect(scale() * 16 * 2.5, scale() * 16 * 4, scale() * 16 * 5, scale() * 16)
        context.fillStyle = "black"
        context.fillText("Paused", scale() * 16 * 3.7, scale() * 16 * 4.8)
    }
    context.globalAlpha = 1 / (10 - map.properties.color?parseInt(map.properties.color):color())
    context.fillStyle = map.properties.shade?map.properties.shade:shade()
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.globalAlpha = 1
    if (state.health() < 1 && previousAudioTrack !== undefined) {
        previousAudioTrack.pause()
        previousAudioTrack = undefined
        let jingle = loadAudio('strange_retrosfx04_fall1', false)
        jingle.onended = function () {
            gameOverAudioTrack = loadAudio('game_over', false)
            gameOverAudioTrack.play()
        }
        jingle.play()
    }
    if (state.health() > 1 && gameOverAudioTrack !== undefined) {
        gameOverAudioTrack.pause()
        gameOverAudioTrack = undefined
    }
    if (splashScreenCounter < 200) {
        context.fillStyle = 'black'
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.drawImage(loadImageTag('jamlogo.png'), (canvas.width / 2 - 250), (canvas.height / 2 - 100))
        splashScreenCounter+=2
    } else if (splashScreenCounter < 250) {
        context.fillStyle = 'black'
        context.fillRect(0, 0, canvas.width, canvas.height)
        let alpha = (50 - (splashScreenCounter - 200))  / 50
        
        if (alpha < 0) {
            alpha = 0
        }
        context.globalAlpha = alpha
        context.drawImage(loadImageTag('jamlogo.png'), (canvas.width / 2 - 250), (canvas.height / 2 - 100))
        context.globalAlpha = 1
        splashScreenCounter+=2
    } else if (splashScreenCounter < 400) {
        context.fillStyle = 'black'

        let alpha = ((400 - 250) - (splashScreenCounter - 250))  / (400 - 250)
        
        if (alpha < 0) {
            alpha = 0
        }
        context.globalAlpha = alpha
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.globalAlpha = 1
        splashScreenCounter+=2
    }
}

setInterval(function() {
    stepFunction(isStepping())
}, 150)

let previousAudioTrack

let onMapChange = function (value) {
    onFirstInteraction(function () {
        if (value.properties.audio !== undefined) {
            if (previousAudioTrack !== undefined && value.properties.audio !== previousAudioTrack._name) {
                previousAudioTrack.pause()
            }
            if (previousAudioTrack === undefined || value.properties.audio !== previousAudioTrack._name) {
                previousAudioTrack = loadAudio(value.properties.audio)
                previousAudioTrack._name = value.properties.audio
                previousAudioTrack.play()
            }
        }
    })
}
onMapChange(state.map())
state.map.subscribe(onMapChange)
// #endregion


let waterSound
let triggers = {
    'plant': function (obj) {
        if (state.hasInInventory("water")) {
            // play sound effect and tick the growth counter
            if (waterSound === undefined) {
                onFirstInteraction(function () {
                    waterSound = loadAudio('water_splash-01', false)
                    waterSound.onended = function () {
                        waterSound = undefined
                    }
                    waterSound.play()
                }, false)
            }
            state.removeFromInventory("water")
            state.growth(state.growth() + 1)
            state.clearNodeTree()
            state.clearObjectCache()
        } else {
            // display a message like
            // 'jordan still looks really thirsty'
            if (state.hasReadSign()) {
                let modifier = "looks\n"
                if (state.growth() > 0) {
                    modifier = "still\nlooks "
                }
                state.message().content(`Jordan ${modifier}really thirsty.`)
            } else {
                state.message().content('The plant is\nwaiting expectandly\nfor something.')
            }
            state.message().toggle()
        }
    },
    'giveWater': function (obj) {
        if (state.inventory().indexOf('water') === -1) {
            state.addImageToInventoryItem("water", obj.tile)
        }
        state.addToInventory("water")

    },
    'selfDestruct': function (obj) {
        obj.properties.visible = false
    },
    'readSign': function () {
        state.hasReadSign(true)
    }
}

// #region Player movement

let stepAnimationIntervalFunction = function () {
    animationStep(animationStep() == 1?2:1)
}

let stepFunction = function (pressed) {
    if (pressed) {
        stepAnimationIntervalFunction()
    } else {
        animationStep(0)
    }
}


state.onPlayerExitMap(function (direction) {
    let inverseDirection = invert(direction)
    let canaditeFromStack = false
    let getCandadite = function () {
        let result = []
        let currentNode = state.nodeBank.getNodeByUri(state.map().uri)
        if (currentNode[direction] !== null) {// the current node already has something
            canaditeFromStack = true
            if (typeof currentNode[direction].map === 'string') {
                return loadMapData(currentNode[direction].map)
            } else {
                return currentNode[direction].map
            }
        }
        
        for (var i = 0;i < maps().length; i++) {
            let map = maps()[i]
            let candidate = false
            if (typeof map.properties.exit === 'string') {
                let exits = map.properties.exit
                let exitArray = []
                if (exits.indexOf(',') !== -1) {
                    exitArray = exits.split(",")
                }
                if (exits !== "none") {
                    exitArray.push(exits)
                }
                if (map.properties.entrance === inverseDirection) {
                    if (state.growth() - state.treeOfMaps.height() >= 1 && exitArray.length >= 1) {
                        candidate = true
                    }
                    if (state.growth() - state.treeOfMaps.height() < 1 && exitArray.length === 0) {
                        candidate = true
                    }
                }

            }
            if (candidate) {
                map.exitedFrom = direction
                result.push(map)
            }
        }
        let randomIndex = Math.floor(Math.random() * result.length)
        if (randomIndex >= 0 && randomIndex < result.length) {
            return result[randomIndex]
        }
        
    }
    let canadite = getCandadite()
    if (!canaditeFromStack) {
        while ((canadite.properties.weight !== undefined && canadite.properties.weight < Math.random()) || canadite.uri === state.map().uri) {
            canadite = getCandadite()
        }
    }
    if (canadite !== undefined) {
        let map = state.map()
        if (!canaditeFromStack) {
            state.treeOfMaps.push(canadite.uri, direction)
        } 
        state.setMapUri(canadite.uri)
        if (canaditeFromStack) {
            let node = state.nodeBank.getNodeByUri(canadite.uri)
            if (node !== null) {
                state.currentNode(node)
            }
        }
        switch (inverseDirection) {
            case "north":
                state.player().position().y = 0
                break;
            case "south":
                state.player().position().y = (canvas.height / (map.tileHeight * scale()))
                break;
            case "west":
                state.player().position().x = 0
                break;
            case "east":
                state.player().position().x = (canvas.width / (map.tileWidth * scale()))
                break;

        }// there is no map with an west entrance that also has an exit
    }
})

// #endregion

// for debugging
window.vm = {
    state: state,
    scale: scale,
    direction: direction,
    animationStep: animationStep,
    shade: shade,
    color: color,
    maps: maps,
    button: getButtonObservable,
    axes: getAxisObservable
}

setInterval(game, 15)


