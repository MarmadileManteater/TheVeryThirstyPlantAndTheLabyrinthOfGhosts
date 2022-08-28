
let invert = function (direction) {
    switch (direction) {
        case "north":
            return "south"
        case "west":
            return "east"
        case "south":
            return "north"
        case "east":
            return "west"
        default:
            return direction
    }
}

export {
    invert
}