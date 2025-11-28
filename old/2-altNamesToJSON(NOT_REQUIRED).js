const fs = require("fs");
const formatTwo = require("./src/formatTwo");
const {langs} = require( "./src/getCities");

const makeLangs = (data, i) => {
    const city = langs.map((f, i) => f === 'data' ? [f, data] : [f, data[i]])

    return {...Object.fromEntries(city)}
}
const getJSON = (index) => {
    let cities = [];
    let file = fs.readFileSync(`./src/altNames/altNames_${formatTwo(index)}.txt`, 'utf8');
    cities = file.split('\n').map((el, i) => makeLangs(el.split(/\t/), i));
    return cities;
}
function run() {
    for (let i = 0; i <= 31; i++) {
        // console.log(getJSON(i)[0]);
        fs.writeFile(`./src/altNames/altNames_${formatTwo(i)}.json`, JSON.stringify(getJSON(i)), function (err) {
            if (err) return console.error(err);
            console.log('file' + i);
        })
    }
}

module.exports = run;
