
import { computed, observable, pureComputed } from 'knockout'
import { loadAudio, loadImageTag, loadMapData } from './assets'
import { onFirstInteraction } from './input'

let Entity = function (data = {}) {
    let self = this
    Object.call(self)

    self.parentState = data['parentState']

    let defineComputedFromData = function (key, defaultValue) {
        return computed({
            read: function () {
                let keys = Object.keys(data)
                let value = defaultValue
                if (keys.indexOf(key) !== -1) {
                    if (typeof data[key] !== 'function') {
                        data[key] = observable(data[key])
                    }
                    value = data[key]
                } else {
                    data[key] = observable(value)
                    value = data[key]
                }
                return value()
            },
            write: function (value) {
                let keys = Object.keys(data)
                if (keys.indexOf(key) !== -1) {
                    if (typeof data[key] !== 'function') {
                        data[key] = observable(data[key])
                    } else {
                        data[key](value)
                    }
                } else {
                    data[key] = observable(value)
                }
            }
        }, self)
    }
    let imageSource = defineComputedFromData('image', "")
    self.image = pureComputed(function () {
        let source = imageSource()
        if (source !== "") {
            return loadImageTag(source)
        }
    })
    self.position = defineComputedFromData('position', { x: 0, y: 0, dx: 0, dy: 0 })
    self.spriteData = defineComputedFromData('spriteData', { x: 0, y: 0, width: 16, height: 16, })
    self.animationStep = defineComputedFromData('animationStep', 0)
    self.direction = defineComputedFromData('direction', 'south')

    self.draw = function (context, scale) {
        let xOffset = 0
        let direction = self.direction()
        let animationStep = self.animationStep()
        let position = self.position()
        switch (direction) {
            case 'north':
                xOffset = 16;
                break;
            case 'east':
                xOffset = 32;
                break;
            case 'west':
                xOffset = -16;
                break;
        }
        context.drawImage(self.image(), 
            (self.spriteData().x * self.spriteData().width) + xOffset,
            (self.spriteData().y * self.spriteData().height) + animationStep * self.spriteData().height,
            self.spriteData().width,
            self.spriteData().height,
            position.x * self.spriteData().width * scale(), 
            position.y * self.spriteData().height * scale(), 
            self.spriteData().width * scale(), 
            self.spriteData().height * scale())
    }
    
    self.update = function (map) {
        let position = self.position()
        var collidingObject = self.wouldBeCollidingWith(map, ["trees", "hills", "objects"], position.dx, position.dy)
        if (collidingObject === false || (collidingObject.properties !== undefined && collidingObject.properties.trigger !== undefined && collidingObject.properties.trigger.indexOf('selfdestruct') !== -1 && collidingObject.properties.text === undefined)) { // don't stop forward motion for things that will just be self-destructed
            position.x += position.dx
            position.y += position.dy
        }
        if (self.wouldBeCollidingWith(map, ["bonus area"], position.dx, position.dy, true) !== false) {
            // send player to the BONUS AREA
            let mapObject = self.parentState.map()
            mapObject.position = Object.assign({}, self.position())
            let bonusNode = self.parentState.nodeBank.getNodeByUri('bonus') 
            if (bonusNode === null) {
                self.parentState.treeOfMaps.push('bonus', 'hidden')
            } else {
                self.parentState.currentNode(bonusNode)
            }
            self.parentState.setMapUri('bonus')
            self.storedPosition = {
                x: self.position().x,
                y: self.position().y
            }
            self.position().x = 7
            self.position().y = 6
            self.position(self.position())
            self.direction("north")
            onFirstInteraction(function (){
                loadAudio('stair_down', false).play()
            }, false)
        }
        if (self.wouldBeCollidingWith(map, ["exit"], position.dx, position.dy, true) !== false) {
            // send player to the last map
            let oldMapNode = self.parentState.currentNode()['hidden']
            let oldMap = loadMapData(oldMapNode.map)
            let oldMapUri = oldMap.uri
            self.position().dx = 0
            self.position().x = self.storedPosition.x
            self.position().y = self.storedPosition.y + 0.5
            self.direction("south")
            onFirstInteraction(function (){
                loadAudio('stair_up', false).play()
            }, false)
            self.parentState.setMapUri(oldMapUri)
            self.parentState.currentNode(self.parentState.getNodeByUri(oldMapUri))
        }
        let heart = self.wouldBeCollidingWith(map, ["objects"], position.dx, position.dy, true)
        if (heart !== false) {
            // heal player
            if (typeof heart.properties.healing === "string") {
                heart.properties.visible = false
                self.parentState.health(self.parentState.health() + parseInt(heart.properties.healing))
                onFirstInteraction(function (){
                    loadAudio('12', false).play()
                }, false)
                if (self.parentState.health() > 6) {
                    self.parentState.health(6)
                    self.parentState.bonusPoints(self.parentState.bonusPoints()+1)
                }
            }

        }
        data['position'](position)
    }
        

    let currentSoundEffect = undefined

    self.wouldBeCollidingWith = function (map, collisionTypes, dx, dy, mute = false, plusMinus = 0) {
        let assumeX = self.position().x + dx + 1/2
        let assumeY = self.position().y + dy + 3/4
        for (let i = 0; i < map.layers.length; i++) {
            let layer = map.layers[i]
            if (collisionTypes.indexOf(layer.name.toLowerCase()) !== -1) {// check for this collision type
                for (let k = 0; k < layer.tiles.length; k++) {
                    let column = layer.tiles[k]
                    for (let j = 0; j < column.length; j++) {
                        if (column[j] !== null) {
                            if (assumeX >= j - plusMinus && assumeX <= j + 1 + plusMinus) {
                                if (assumeY >= k - plusMinus && assumeY <= k + 1 + plusMinus) {
                                    if (dx !== 0 || dy !== 0) {// if the player was trying to move
                                        if (!mute) {
                                            onFirstInteraction(function (){
                                                if (!currentSoundEffect) {
                                                    currentSoundEffect = loadAudio('Punch2__002', false)// don't loop, just play a sound effect
                                                    currentSoundEffect.onended = function () {
                                                        setTimeout(function () {
                                                            currentSoundEffect = undefined
                                                        }, 250)
                                                    }
                                                    currentSoundEffect.play()
                                                }
                                            }, false)
                                        }
                                    }
                                    return column[j]
                                }
                            }
                        }
                    }
                }
            }
        }
        if (collisionTypes.indexOf('objects') !== -1) {// check for collisions with objects
            for (let i = 0; i < map.objects.length; i++) {
                let obj = map.objects[i]
                let x = (obj.x / obj.width)
                let y = (obj.y / obj.height) - 1
                if (obj.properties.visible !== false) {
                    if (assumeX >= x - plusMinus && assumeX <= x + 1 + plusMinus) {
                        if (assumeY >= y - plusMinus && assumeY <= y + 1.5 + plusMinus) {
                            if (dx !== 0 || dy !== 0) {// if the player was trying to move
                                if (!mute) {
                                    onFirstInteraction(function (){
                                        if (!currentSoundEffect) {
                                            let soundEffect = 'Punch2__002'
                                            if (typeof obj.properties.collideSoundEffect === 'string') {
                                                soundEffect = obj.properties.collideSoundEffect
                                            }
                                            if (obj.properties.hostile) {
                                                soundEffect = 'Ouch__006'
                                                self.parentState.health(self.parentState.health() - 1)
                                            }
                                            currentSoundEffect = loadAudio(soundEffect, false)// don't loop, just play a sound effect
                                            currentSoundEffect.onended = function () {
                                                setTimeout(function () {
                                                    currentSoundEffect = undefined
                                                }, 250)
                                            }
                                            currentSoundEffect.play()
                                        }
                                    }, false)
                                }
                            }
                            return obj;
                        }
                    }
                }
            }
        }
        return false
    }
}

export {
    Entity
}