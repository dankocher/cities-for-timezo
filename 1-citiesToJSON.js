const fs = require("fs");
const {fields} = require( "./src/getCities");

const citiesNames = fs.readFileSync('./src/cities.txt', 'utf8');

const cities = citiesNames.split('\n').map((el, i)  => makeCity(el.split(/\t/), i));

function makeCity (data, i) {
    const city = fields.map((f, i) => [f, data[i]])
    return {...Object.fromEntries(city), altNames: {}}
}

function run() {
    fs.writeFile('./src/cities.json', JSON.stringify(cities),function(err) {
        if(err) return console.error(err);
        console.log('DONE');
    })
}

module.exports = run;
