
import { pureComputed, isObservable, observable, observableArray, toJSON } from 'knockout'
import { loadAudio, loadMapData, MapNode } from './assets.js'
import { Entity } from './entity.js'
import { onFirstInteraction } from './input.js'
import { invert } from './direction'

let State = function (data = {}) {
    let self = this
    let restartData = JSON.parse(toJSON(data))
    Object.call(self)
    data = observable(data)
    let writeLines = function (canvas, context, lines, x, y, scale, centerText = false, dropShadow = true) {
        if (centerText) {
            context.textAlign = 'center'
        }
        for (let i = 0; i < lines.length; i++) {
            if (dropShadow) {
                let previousStyle = context.fillStyle
                context.fillStyle = 'black'
                context.fillText(lines[i], (canvas.width/2 + x * self.map().tileWidth * scale()) + 3, (canvas.height/2 + (y + i) * self.map().tileHeight * scale() - (((lines.length) * self.map().tileHeight * scale()) / 4)) + 3, canvas.width)
                context.fillStyle = previousStyle
            }
            context.fillText(lines[i], canvas.width/2 + x * self.map().tileWidth * scale(), canvas.height/2 + (y + i) * self.map().tileHeight * scale() - (((lines.length) * self.map().tileHeight * scale()) / 4), canvas.width)
        }
        if (centerText) {
            context.textAlign = 'left'
        }
    }
    self.bonusPoints = observable(0)
    self.finalScore = pureComputed(function () {
        return self.bonusPoints() + self.growth()
    })
    self.scores = observableArray([])

    let preExistingScores = localStorage.getItem('scores')
    if (preExistingScores !== null && preExistingScores !== "null") {
        self.scores(JSON.parse(preExistingScores))
    }
    self.scores.subscribe(function (newVal) {
        if (newVal.length > 5) {
            newVal.sort(function(a, b){return b - a})
            newVal = newVal.slice(0, 5)
            self.scores(newVal)
        }
        localStorage.setItem("scores", JSON.stringify(newVal))
    })
    self.highScore = pureComputed(function () {
        if (self.scores().length === 0) {
            return 0
        }
        return self.scores().sort(function(a, b){return b - a})[0]
    })
    self.nodeBank = observable({})
    self.getNodeByUri = function(uri) {
        let nodeKeys = Object.keys(self.nodeBank())
        for (let i = 0; i < nodeKeys.length; i++) {
            let key = nodeKeys[i]
            if (key === uri) {
                return self.nodeBank()[key]
            }
        }
        return null
    }
    self.nodeBank.getNodeByUri = self.getNodeByUri
    self.treeOfMaps = observable()
    self.clearNodeTree = function () {
        let startNode = self.nodeBank.getNodeByUri('start')
        let nodeKeys = Object.keys(self.nodeBank())
        for (let i = 0; i < nodeKeys.length; i++) {
            self.nodeBank()[nodeKeys[i]].north = null
            self.nodeBank()[nodeKeys[i]].south = null
            self.nodeBank()[nodeKeys[i]].west = null
            self.nodeBank()[nodeKeys[i]].east = null
            self.nodeBank()[nodeKeys[i]].parent = null
            if (nodeKeys[i].map !== startNode.map) {
                delete self.nodeBank()[nodeKeys[i]]
            }
        }
        self.nodeBank(self.nodeBank())
        self.currentNode(startNode)
    }
    self.currentNode = observable({})
    self.currentNode.subscribe(function (newVal) {
        
        let uri = typeof newVal.map === 'string'?newVal.map:newVal.map.uri
        if (self.nodeBank.getNodeByUri(uri) === null) {
            self.nodeBank()[uri] = newVal
        }
    })
    self.treeOfMaps.push = function (map, direction = 'south') {
        let node = new MapNode(map)
        let uri = typeof map === 'string'?map:map.uri
        self.nodeBank()[uri] = node
        if (self.treeOfMaps() === null) {
            self.currentNode(node)
            self.treeOfMaps(node)
        } else {
            self.currentNode()[direction] = node
            node.parent = invert(direction)
            node[invert(direction)] = self.currentNode()
            self.currentNode(node)
        }
    }
    self.treeOfMaps.height = function () {
        return Object.keys(self.nodeBank()).length - 1
    }
    self.currentGeneratedLevel = observableArray([])
    self.gameStarted = observable(false)
    self.paused = observable(false)
    self.paused.subscribe(function () {
        onFirstInteraction(function () {
            loadAudio('1', false).play()
        }, false)

    })

    self.gameOverUpdate = function (context, canvas, scale, playerDraw) {
        context.fillStyle = 'black'
        context.fillRect(0, 0, canvas.width, canvas.height)
        playerDraw(context, scale)
        context.fillStyle = 'black'
        context.font = `${scale()*15}px Kenney-Pixel`
        context.fillStyle = 'white'
        writeLines(canvas, context, ["Game Over", `Final Score: ${self.finalScore()}`, `High Score: ${self.highScore()}`, ``, `Press R or START`, `to restart`], 0, 0, scale, true, true)
    }

    self.hasReadSign = observable(false)

    let inventoryImages = {}

    // object cache to allow us to remember the state of objects between map loads
    let objectCache = {}

    self.reset = function () {
        let mapObservable = data()['map']
        self.health(6)
        self.setMapUri('start')
        self.currentNode(self.nodeBank.getNodeByUri('start'))
        self.paused(false)
        inventoryImages = []
        data()['map'] = mapObservable
        while (self.inventory().length > 0) {
            self.removeFromInventory("water")
        }
        data()['message-opacity'](0)
        data()['message']("")
        self.player().position().x = restartData.player.position.x
        self.player().position().y = restartData.player.position.y
        self.player().position().dx = 0
        self.player().position().dy = 0
        self.player().position(self.player().position())
        self.player().direction(restartData.player.direction)
        self.growth(0)
        self.bonusPoints(0)
        self.clearNodeTree()
        // Fix the issue where the first jar never reset
        for (let i = 0; i < objectCache['start'].length; i++) {
            let startScreenObj = objectCache['start'][i]
            startScreenObj.properties.visible = true;
        }
        objectCache = {}
        self.hasReadSign(false)
        self.currentGeneratedLevel([])
    }

    self.uiMap = pureComputed(function () {
      return loadMapData('ui')  
    })

    self.health = observable(6)

    self.health.subscribe(function (value) {
        let objects = self.uiMap().objects
        let heart1 = objects[0]
        let heart2 = objects[1]
        let heart3 = objects[2]
        // the dark lord knows there must be a better way to do this, but I am running short on time, so this is faster to debug
        switch (value) {
            case 6:
                heart3.tile.position.x = 10 * self.uiMap().tileWidth
                heart2.tile.position.x = 10 * self.uiMap().tileWidth
                heart1.tile.position.x = 10 * self.uiMap().tileWidth
                break;
            case 5:
                heart3.tile.position.x = 9 * self.uiMap().tileWidth
                heart2.tile.position.x = 10 * self.uiMap().tileWidth
                heart1.tile.position.x = 10 * self.uiMap().tileWidth
                break;
            case 4:
                heart3.tile.position.x = 8 * self.uiMap().tileWidth
                heart2.tile.position.x = 10 * self.uiMap().tileWidth
                heart1.tile.position.x = 10 * self.uiMap().tileWidth
                break;
            case 3:
                heart3.tile.position.x = 8 * self.uiMap().tileWidth
                heart2.tile.position.x = 9 * self.uiMap().tileWidth
                heart1.tile.position.x = 10 * self.uiMap().tileWidth
                break;
            case 2:
                heart3.tile.position.x = 8 * self.uiMap().tileWidth
                heart2.tile.position.x = 8 * self.uiMap().tileWidth
                heart1.tile.position.x = 10 * self.uiMap().tileWidth
                break;
            case 1:
                heart3.tile.position.x = 8 * self.uiMap().tileWidth
                heart2.tile.position.x = 8 * self.uiMap().tileWidth
                heart1.tile.position.x = 9 * self.uiMap().tileWidth
                break;
            case 0:
                heart3.tile.position.x = 8 * self.uiMap().tileWidth
                heart2.tile.position.x = 8 * self.uiMap().tileWidth
                heart1.tile.position.x = 8 * self.uiMap().tileWidth
                setTimeout(function () {
                    self.health(-1)
                }, 150)// really hack way to make the game over animation play the way I want it to
                self.scores.push(self.finalScore()) // push the final score in when health is zero
                break;
        }
    })

    self.clearObjectCache = function () {
        let keys = Object.keys(objectCache)
        for (let i =0 ;i < keys.length; i++) {
            let key = keys[i]
            if (key !== 'start'){
                delete objectCache[key]
            }
        }
    }

    self.growth = observable(0)

    self.hasFirstWater = observable(false)

    self.addImageToInventoryItem = function (item, tile) {
        inventoryImages[item] = tile
    }

    self.inventory = pureComputed(function () {
        let keys = Object.keys(data())
        var inventory = []
        if (keys.indexOf('inventory') !== -1) {
            if (isObservable(data()['inventory'])) {
                inventory = data()['inventory']()
            } else {
                inventory = data()['inventory']
                data()['inventory'] = observableArray(data()['inventory'])
            }
        } else {
            data()['inventory'] = observableArray(inventory)
        }
        return inventory
    })

    self.addToInventory = function (item) {
        self.inventory()
        onFirstInteraction(function () {
            loadAudio('collect2', false).play()
        }, false)
        data()['inventory'].push(item)
    }

    self.removeFromInventory = function (item) {
        self.inventory()
        data()['inventory'].splice(data()['inventory']().indexOf(item), 1)
    }

    self.hasInInventory = function (item) {
        return self.inventory().indexOf(item) !== -1
    }

    self.setMapUri = function (uri) {
        objectCache[self.map().uri] = self.map().objects
        data()['map'](uri)
    }

    let mapExitListeners = []
    let notifyPlayerExit = function (direction) {
        for (let i = 0; i < mapExitListeners.length; i++) {
            let listener = mapExitListeners[i]
            listener(direction)
        }
    }
    self.onPlayerExitMap = function (listener) {
        mapExitListeners.push(listener)
    }

    self.update = function (canvas, scale) {
        if (self.gameStarted()) {
            if (self.health() > 0) { // don't update the game when the player is dead
                self.player().update(self.map())
                let normalizedWidth = canvas.width / (self.map().tileWidth * scale())
                let normalizedHeight = canvas.height / (self.map().tileHeight * scale())
                if (self.player().position().x < 0) {
                    notifyPlayerExit("west")
                }
                if (self.player().position().x > normalizedWidth) {
                    notifyPlayerExit("east")
                }
                if (self.player().position().y > normalizedHeight) {
                    notifyPlayerExit("south")
                }
                if (self.player().position().y < 0) {
                    notifyPlayerExit("north")
                }
            } else if (self.health() > -1) {
                self.player().update(self.map())
            }
        }
        self.message().update()
        self.map().update(self.player())
    }

    self.draw = function (context, scale, canvas) {
        self.map().draw(context, scale)
        if (self.health() < 0) {// health is zero, trigger game over
            self.gameOverUpdate(context, canvas, scale, self.player().draw)
        } else {
            self.player().draw(context, scale)
        }
        
        if (self.health() > 0) {// health is zero, trigger game over
            self.map().drawTop(context, scale)
        }
        self.message().draw(context, scale)
        let inventory = self.inventory()
        if (inventory.length > 0) {
            context.fillStyle = "white"
            let height = self.map().tileHeight * scale()
            let width = (inventory.length) * self.map().tileWidth * scale() 
            let x = canvas.width - width - self.map().tileWidth / 2
            let y = canvas.height - height - self.map().tileHeight / 2
            context.fillRect(x, y, width, height)
            for (let i = 0; i < inventory.length; i++) {
                let item = inventory[i]
                if (typeof inventoryImages[item] === 'object') {
                    context.drawImage(inventoryImages[item].image.load(), 
                        inventoryImages[item].position.x,
                        inventoryImages[item].position.y,
                        self.map().tileWidth,
                        self.map().tileHeight,
                        x + i * self.map().tileWidth * scale(), 
                        y, 
                        self.map().tileWidth * scale(), 
                        self.map().tileHeight * scale())
                }
            }
        }
        self.uiMap().drawTop(context, scale)
        if (!self.gameStarted()) {
            context.fillStyle = "white"
            context.fillRect(self.map().tileWidth * scale() * 1.25, 7.5 * self.map().tileHeight * scale(), canvas.width - self.map().tileWidth * 2.5 * scale(), canvas.height - self.map().tileHeight * 8 * scale())
            context.fillStyle = "black"
            context.font = `bold ${scale() * 12}px Kenney-Pixel`
            context.fillText("The Very Thirsty Plant", scale() * 16 * 1.5, scale() * 16 * 8.25)
            context.fillText("and the Labyrinth of Ghosts", scale() * 16 * 1.5, scale() * 16 * 8.25 + 12 * scale())
            context.font = `${scale() * 10}px Kenney-Pixel`

            //context.fillText(`Press enter or A to play`, scale() * 16 * 2.5, scale() * 16 * 6 + 16 * scale() * 2)
        }
    }

    let innerPlayer = observable()

    self.player = pureComputed(function () {
        let keys = Object.keys(data())
        var playerObject = undefined
        if (keys.indexOf('player') !== -1) {
            if (isObservable(data()['player'])) {
                playerObject = data()['player']()
            } else {
                playerObject = data()['player']
                data()['player'] = observable(data()['player'])
            }
        }
        let inner = innerPlayer()
        if (inner === undefined) {
            playerObject['parentState'] = self
            innerPlayer(new Entity(playerObject))// only set the inner player once ever
        }
        return innerPlayer()
    }, self)

    self.map = pureComputed(function () {
        let keys = Object.keys(data())
        var mapUrl = "";
        if (keys.indexOf('map') !== -1) {
            if (isObservable(data()['map'])) {
                mapUrl = data()['map']()
            } else {
                mapUrl = data()['map']
                data()['map'] = observable(data()['map'])
            }
        }
        let mapData = loadMapData(mapUrl)
        if (Object.keys(objectCache).indexOf(mapUrl) !== -1) {
            mapData.objects = objectCache[mapUrl]
        } else {
            objectCache[mapUrl] = mapData.objects
        }
        return mapData
    }, self)
    
    self.message = pureComputed(function () {
        let keys = Object.keys(data())
        var messageString = "";
        if (keys.indexOf('message') !== -1) {
            if (isObservable(data()['message'])) {
                messageString = data()['message']()
            } else {
                messageString = data()['message']
                data()['message'] = observable(data()['message'])
            }
        }
        var messageOpacity = 0
        if (keys.indexOf('message-opacity') !== -1) {
            if (isObservable(data()['message-opacity'])) {
                messageOpacity = data()['message-opacity']()
            } else {
                messageOpacity = data()['message-opacity']
                data()['message-opacity'] = observable(data()['message-opacity'])
            }
        }
        if (messageString != data()['message']) {
            data()['message'](messageString)
        }
        if (messageOpacity != data()['message-opacity']) {
            data()['message-opacity'](messageOpacity)
        }

        let messageObject = {
            opacity: data()['message-opacity'],
            content: data()['message'],
            fadeDirection: observable('none'),
            listeners: observableArray([]),
            notify: function () {
                for (let i = 0; i < this.listeners().length; i++) {
                    this.listeners()[i]()
                }
                this.listeners([])
            },
            afterDismiss: function (listener) {
                this.listeners.push(listener)
            }
        }

        messageObject.toggle = function () {
            if (messageObject.opacity() <= 0 ) {
                messageObject.fadeDirection('in')
            } else if (messageObject.opacity() >= 1) {
                messageObject.opacity(0)
                messageObject.fadeDirection('none')
                messageObject.content("")
            }
        }

        messageObject.draw = function (context, scale) {
            let lines = messageObject.content().split("\n")
            context.fillStyle = 'white'
            if (messageObject.opacity() !== 0) {
                context.fillRect(1.5 * self.map().tileWidth * scale(), 5 * self.map().tileHeight * scale() - ((lines.length * self.map().tileHeight * scale())/2), 7 * self.map().tileWidth * scale(), (lines.length + 0.15) * self.map().tileHeight * scale() - self.map().tileHeight * (lines.length / 7))
            }
            if (messageObject.opacity() >= 1) {
                context.globalAlpha = 1
            } else if (messageObject.fadeDirection() === "out") {
                context.globalAlpha = 0
            }
            context.fillStyle = 'black'
            let fontSize = (scale() * 13)
            context.font = `${fontSize}px Kenney-Pixel`
            for (let i = 0; i < lines.length; i++) {
                context.fillText(lines[i], 2 * self.map().tileWidth * scale(), (i * fontSize) + 5.8 * self.map().tileHeight * scale() - ((lines.length * self.map().tileHeight * scale())/2))
            }
            context.globalAlpha = 1
        }

        messageObject.update = function () {
            if (messageObject.fadeDirection() === "in") {
                messageObject.opacity(messageObject.opacity() + 0.03)
                if (messageObject.opacity() > 1) {
                    messageObject.fadeDirection('none')
                }
            } else if (messageObject.fadeDirection() === "out") {
                messageObject.opacity(messageObject.opacity() - 0.03)
                if (messageObject.opacity() <= 0) {
                    messageObject.fadeDirection('none')
                    messageObject.opacity(0)
                }
            }
        }

        return messageObject
    }, self)
}

export {
    State
}