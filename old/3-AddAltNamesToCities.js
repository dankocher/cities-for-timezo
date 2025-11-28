const fs = require("fs");
const formatTwo = require("./src/formatTwo");

const readAltNames = async () => {
    return await new Promise(resolve => {

        let altNamesArray = [];
        let count = -1;
        let max = 31;
        let threads = 0;
        let maxThreads = 3;

        let nextWork = () => {
            count++;
            if (count <= max) {
                return count;
            } else if (threads > 0) {
                return null
            } else {
                resolve(altNamesArray);
                return null;
            }
        }

        let Work = async () => {
            let work = nextWork();
            if (work) {
                threads++;
                console.log("Work", work)
                let data = fs.readFileSync(`./src/altNames/altNames_${formatTwo(work)}.json`, "utf8");
                altNamesArray = [...altNamesArray, ...data];
                threads--;
                Work();
            }
        }
        for(let i = 0; i < maxThreads; i++) {
            Work()
        }

    })
}

const run = async () => {
    const citiesNames = JSON.parse(fs.readFileSync('./src/cities.json', 'utf8'));
    console.log(citiesNames.length);
    // let altNamesArray = await readAltNames();
    let altNamesArray = []
    for (let i = 0; i <= 31; i++) {
        let altNamesFile = JSON.parse(fs.readFileSync(`./src/altNames/altNames_${formatTwo(i)}.json`, 'utf8'))
        altNamesArray = [...altNamesArray, ...altNamesFile];
        console.log(`read altNames_${formatTwo(i)}.json`);
    }
    console.log(altNamesArray.length)

    const updateCity = (city, i, length) => {
        let tr = altNamesArray.filter(n => n.lang_id === city.id);
        let altNames = city.altNames || {};
        // console.log(city.name)
        for(let lang of tr) {
            const {data} = lang
            //console.log(lang)
            if (data[2] !== 'link' && data[2] !== '') {
                if (altNames[data[2]]) {
                    if (data[4] === '1') {
                        altNames[data[2]] = data[3];
                    }
                } else {
                    altNames[data[2]] = data[3];
                }
            }
        }
        if (i%100 === 0) {
            // console.log(`city ${city.name} DONE`, i, '/', length, check ? altNames : '')
            console.log(`city ${city.name} DONE`, i)
        }

        const _city = {
            id: city.id,
            name: city.name,
            country: city.country,
            alternativeNames: city.alternativeNames,
            asciiname: city.asciiname,
            population: city.population,
            lat: city.lat,
            lon: city.lon,
            tz: city.tz,
            altNames: city.altNames
        }
        return {..._city, altNames}
        // console.log(city.name, city.altNames)
        // return city
    };

    const cities = citiesNames.map((el, i, arr)  => updateCity(el, i, arr.length))
        .sort(sortByPopulation)
        .map(city => ({
            id: city.id,
            name: city.name,
            country: city.country,
            alternativeNames: city.alternativeNames,
            asciiname: city.asciiname,
            // population: city.population,
            lat: city.lat,
            lon: city.lon,
            tz: city.tz,
            altNames: city.altNames
        }));

    fs.writeFile('./src/newCities.json', JSON.stringify(cities),function(err) {
        if(err) return console.error(err);
        console.log('done');
    })
}

const sortByPopulation = (a, b) => {
    return parseInt(b.population) - parseInt(a.population)
}
module.exports = run;

