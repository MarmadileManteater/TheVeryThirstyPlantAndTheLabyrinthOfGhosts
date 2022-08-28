import { pureComputed } from 'knockout'

let loadMap = function (mapName) {
    return require(`./assets/tilemaps/${mapName}.tmx`)
}

let loadTileset = function (tilesetName) {
    return require(`./assets/tilesets/${tilesetName}.tsx`)
}

let loadImage = function (image) {
    return require(`./assets/images/${image}`)
}

let loadImageTag = function (imageSrc, width, height) {
    let imageTag = document.createElement('img')
    imageTag.src = loadImage(imageSrc)
    imageTag.style.visibility = 'hidden'
    imageTag.style.width = (width * 100) + "px"
    imageTag.style.height = (height * 100) + "px"
    document.body.appendChild(imageTag)
    imageTag.onload = function () {
        try {
            document.body.removeChild(imageTag)
        } catch {
            // there is a better way to do this, but I don't have time for that
        }
    }
    if (imageTag.complete) {
        imageTag.onload()
    }
    return imageTag
}

let loadAudioSource = function (audio) {
    return require(`./assets/audio/${audio}.mp3`)
}

let loadAudio = function (audioSource, loop = true) {
    let source = loadAudioSource(audioSource)
    let audio = document.createElement('audio')
    if (loop) {
        audio.setAttribute("loop", "")
    }
    let sourceElement = document.createElement('source')
    sourceElement.setAttribute("src", source)
    sourceElement.setAttribute("type", "audio/mpeg")
    audio.appendChild(sourceElement)
    return audio
}

let loadMapData = function (mapUrl) {
    if (mapUrl !== "") {
        let mapContents = loadMap(mapUrl)
        let domParser = new DOMParser()
        let mapDom = domParser.parseFromString(mapContents, "text/xml")
        let mapElement = mapDom.childNodes[0]
        let tilesets = mapElement.querySelectorAll('tileset')
        let customProperties = mapElement.querySelectorAll(':not(object) > properties > property')
        let mapObject = {
            uri: mapUrl,
            version: mapElement.getAttribute("version"),
            tiledVersion: mapElement.getAttribute("tiledVersion"),
            orientation: mapElement.getAttribute("orientation"),
            renderOrder: mapElement.getAttribute("renderorder"),
            width: parseInt(mapElement.getAttribute("width")),
            height: parseInt(mapElement.getAttribute("height")),
            tileWidth: parseInt(mapElement.getAttribute("tilewidth")),
            tileHeight: parseInt(mapElement.getAttribute("tileheight")),
            infinite: mapElement.getAttribute("infinite") == "1",
            nextLayerId: mapElement.getAttribute("nextLayerId"),
            nextObjectId: mapElement.getAttribute("nextObjectId"),
            tilesets: [],
            layers: [],
            objects: [],
            properties: {}
        }
        let k
        for (k = 0; k < customProperties.length; k++) {
            let property = customProperties[k]
            let value = property.getAttribute("value")
            if (value === null) {
                value = property.innerHTML
            }
            mapObject.properties[property.getAttribute("name")] = value
        }
        for (k = 0; k < tilesets.length; k++) {
            let tileset = tilesets[k]
            let sourceUri = tileset.getAttribute("source")
            let sourceParts = sourceUri.split("/")
            let endingParts = sourceParts[sourceParts.length - 1].replace(/\.\./g,".").split(".")
            endingParts.pop()// remove the filename
            let endingPart = endingParts.join(".")
            let tilesetContents = loadTileset(endingPart)
            let tilesetDom = domParser.parseFromString(tilesetContents, "text/xml")
            let tilesetElement = tilesetDom.childNodes[0]
            let firstGid = tileset.getAttribute("firstgid")
            if (firstGid == null || firstGid == undefined) {
                firstGid = "1"
            }
            firstGid = parseInt(firstGid)
            let tilesetObject = {
                version: tilesetElement.getAttribute("version"),
                columns: parseInt(tilesetElement.getAttribute("columns")),
                tileWidth: parseInt(tilesetElement.getAttribute("tilewidth")),
                tileHeight: parseInt(tilesetElement.getAttribute("tileheight")),
                firstGid: firstGid,
                images: []
            }
            let images = tilesetElement.querySelectorAll('image')
            for (let j = 0; j < images.length; j++) {
                let image = images[j]
                sourceParts = image.getAttribute('source').replaceAll("..", ".").split("/")
                endingPart = sourceParts[sourceParts.length - 1]
                let imageObject = {
                    source: endingPart,
                    width: parseInt(image.getAttribute("width")),
                    height: parseInt(image.getAttribute("height"))
                }
                imageObject.load = pureComputed(function () {
                    return loadImageTag(imageObject.source, imageObject.width, imageObject.height)
                }, imageObject)
                tilesetObject.images.push(imageObject)
            }
            mapObject.tilesets.push(tilesetObject)
        }
        mapObject.getTilesetByFirstGid = function (gid) {
            if (mapObject.tilesets.length === 1) {
                return mapObject.tilesets[0]
            }
            for (let i = mapObject.tilesets.length - 1; i >= 0; i--) {
                let tileset = mapObject.tilesets[i]
                if (parseInt(gid) >= tileset.firstGid) {
                    return mapObject.tilesets[i]
                }
            }
        }
        var layers = mapElement.querySelectorAll('layer') 
        for (k = 0; k < layers.length; k++) {
            let layer = layers[k]
            let layerObject = {
                id: layer.getAttribute("id"),
                name: layer.getAttribute("name"),
                width: parseInt(layer.getAttribute("width")),
                height: parseInt(layer.getAttribute("height")),
                tiles: []
            }
            let innerHTML = layer.children[0].innerHTML
            let rowArray = innerHTML.split("\n")
            rowArray.pop()
            rowArray.splice(0, 1)
            for (let j = 0; j < rowArray.length; j++) {
                let columns = rowArray[j].split(",");
                let tileColumn = []
                for (let l = 0; l < columns.length; l++) {
                    let value = columns[l]
                    if (value !== "" && value !== '0') {
                        let tileset = mapObject.getTilesetByFirstGid(value)
                        let offsetIndex = parseInt(value) - parseInt(tileset.firstGid)
                        var x = ((offsetIndex) % parseInt(tileset.columns)) * parseInt(tileset.tileWidth)
                        var y = Math.floor(offsetIndex / (parseInt(tileset.columns))) * parseInt(tileset.tileHeight)
                        var tileObject = {
                            image: tileset.images[0],
                            position: {
                                x: x,
                                y: y
                            }
                        }
                        tileColumn.push(tileObject)
                    } else {
                        tileColumn.push(null)
                    }
                }
                layerObject.tiles.push(tileColumn)
            }
            mapObject.layers.push(layerObject)
        }
        let objects = mapElement.querySelectorAll('object')
        for (k = 0; k < objects.length; k++) {
            let obj = objects[k]
            let objObject = {
                x: parseFloat(obj.getAttribute("x")),
                y: parseFloat(obj.getAttribute("y")),
                dx: 0,
                dy: 0,
                width: parseFloat(obj.getAttribute("width")),
                height: parseFloat(obj.getAttribute("height")),
                gid: parseInt(obj.getAttribute("gid")),
                properties: {}
            }
            let tileset = mapObject.getTilesetByFirstGid(objObject.gid)
            let offsetIndex = parseInt(objObject.gid) - parseInt(tileset.firstGid)
            var x = ((offsetIndex) % parseInt(tileset.columns)) * parseInt(tileset.tileWidth)
            var y = Math.floor(offsetIndex / (parseInt(tileset.columns))) * parseInt(tileset.tileHeight)
            objObject.tileset = tileset
            objObject.tile = {
                image: tileset.images[0],
                position: {
                    x: x,
                    y: y
                }
            }
            let properties = obj.querySelectorAll('property')
            for (let i = 0; i < properties.length; i++) {
                let property = properties[i]
                let name = property.getAttribute('name')
                let value = property.getAttribute('value')
                if (value === null) {
                    value = property.innerHTML
                }
                objObject.properties[name] = value
            }
            mapObject.objects.push(objObject)
        }
        mapObject.drawTop = function (context, scale) {
            let currentMap = mapObject
            let i
            for (i = 0; i < currentMap.layers.length; i++) {
                let layer = currentMap.layers[i]
                if (layer.name.indexOf('top') !== -1) {
                    for (let k = 0; k < layer.tiles.length; k++) {
                        let row = layer.tiles[k]
                        for (let j = 0; j < row.length; j++) {
                            let tile = row[j]
                            if (tile !== null) {
                                let image = tile.image.load()
                                if (image.complete) {
                                    context.drawImage(image, 
                                            tile.position.x,
                                            tile.position.y,
                                            currentMap.tileWidth,
                                            currentMap.tileHeight,
                                            j * currentMap.tileWidth * scale(), 
                                            k * currentMap.tileHeight * scale(), 
                                            currentMap.tileWidth * scale(), 
                                            currentMap.tileHeight * scale())
                                }
                            }
                        }
                    }
                }
            }
            for (i = 0; i < currentMap.objects.length; i++) {
                let object = currentMap.objects[i]
                if (object.properties.visible !== false) {
                    let image = object.tile.image.load()
                    if (image.complete) {
                        context.drawImage(image, 
                                object.tile.position.x,
                                object.tile.position.y,
                                object.width,
                                object.height,
                                object.x * scale(), 
                                object.y * scale() - object.height * scale(), 
                                object.width * scale(), 
                                object.height * scale())
                    }
                }
            }
        }
        mapObject.draw = function (context, scale) {
            let currentMap = mapObject
            let i
            for (i = 0; i < currentMap.layers.length; i++) {
                let layer = currentMap.layers[i]
                for (let k = 0; k < layer.tiles.length; k++) {
                    let row = layer.tiles[k]
                    for (let j = 0; j < row.length; j++) {
                        let tile = row[j]
                        if (tile !== null) {
                            let image = tile.image.load()
                            if (image.complete) {
                                context.drawImage(image, 
                                        tile.position.x,
                                        tile.position.y,
                                        currentMap.tileWidth,
                                        currentMap.tileHeight,
                                        j * currentMap.tileWidth * scale(), 
                                        k * currentMap.tileHeight * scale(), 
                                        currentMap.tileWidth * scale(), 
                                        currentMap.tileHeight * scale())
                            }
                        }
                    }
                }
            }
        }

        mapObject.update = function (player) {
            if (player.parentState.health() > -1) {
                for (let i = 0; i < mapObject.objects.length; i++) {
                    let object = mapObject.objects[i]
                    if (object.properties.visible !== false) {
                        // update the position of any hostiles
                        if (object.properties.hostile === "true") {
                            let speed = parseFloat(object.properties.speed / 2) + (parseFloat(object.properties.speed) / 2) * (player.parentState.growth() / 8)
                            let x = object.x / mapObject.tileWidth
                            let y = object.y / mapObject.tileHeight
                            if (player.position().x < x) {
                                object.dx = -speed
                            }
                            if (player.position().x > x) {
                                object.dx = speed
                            }
                            if (player.position().y + 1 < y) {
                                object.dy = -speed
                            }
                            if (player.position().y + 1 > y) {
                                object.dy = speed
                            }
                            object.x += object.dx
                            object.y += object.dy
                            var collidingWith
                            if ((collidingWith = player.wouldBeCollidingWith(mapObject, ["objects"], 0, 0, true)) !== false) {
                                if (collidingWith === object) {
                                    // need a special sound effect for death here
                                    player.parentState.health(player.parentState.health() - 1)
                                    player.position().dx = object.dx
                                    player.position().dy = object.dy
                                    player.position(player.position())
                                }
                            }
                        }
                    }
                }
            }
        }
        return mapObject
    } else {
        return {}
    }
}

let MapNode = function (map, parent = null) {
    const self = this
    Object.call(self)
    self.north = null
    self.west = null
    self.south = null
    self.east = null
    self.parent = parent
    self.map = map
}

export {
    loadMap,
    loadMapData,
    loadTileset,
    loadImage,
    loadImageTag,
    loadAudio,
    MapNode
}