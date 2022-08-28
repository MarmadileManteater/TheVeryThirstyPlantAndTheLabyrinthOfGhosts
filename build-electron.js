const fs = require('fs')
const exec = require('child_process').execSync

const environment = process.argv.length > 2?process.argv[2]:"development"
const certFile = process.argv.length > 3?process.argv[3]:""
const password = process.argv.length > 4?process.argv[4]:""

const packageJsonContents = fs.readFileSync('dist/package.json')
const buildConfig = JSON.parse(packageJsonContents)

if (certFile !== "") {
    buildConfig['build']["win"] = {
        "certificateFile": certFile,
        "certificatePassword": password
    }
}

buildConfig['environment'] = environment
fs.writeFileSync('dist/package.json', JSON.stringify(buildConfig, null, 2))
let result = exec("npx electron-builder --projectDir dist/ --win portable")
console.log("" + result)