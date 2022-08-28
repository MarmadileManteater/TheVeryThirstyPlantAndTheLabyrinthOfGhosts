
const fs = require('fs')
const packageJson = require('./package.json')
packageJson["environment"] = process.argv[2]
fs.writeFileSync("./package.json", JSON.stringify(packageJson, null, 2))