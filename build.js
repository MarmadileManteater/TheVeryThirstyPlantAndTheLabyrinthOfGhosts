
const fs = require('fs')
const fse = require('fs-extra')
const { join } = require('path')
const exec = require('child_process').execSync

const src = join('src', 'index.html')
const dst = join('dist', 'index.html')

if (fs.existsSync('dist')) {
    fse.rmSync('dist', { recursive: true})
}
let result = exec("npx webpack")
console.log('' + result)

fs.copyFileSync(src, dst)
fs.copyFileSync('package.json', 'dist/package.json')
let newContent = fs.readFileSync('src/electron/index.js').toString().replace('../../dist/index.html', 'index.html')
fs.writeFileSync('dist/index.js', newContent)
fse.copySync('node_modules', 'dist/node_modules')
fs.mkdirSync('dist/build')
fs.copyFileSync('the-very-thirsty-plant-icon.ico', 'dist/build/icon.ico')