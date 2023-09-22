

const start = async () => {

    let start = new Date();

    console.log("======================================")
    console.log("START")
    console.log(start)
    console.log("======================================")

    const CitiesToJSON = require("./1-citiesToJSON");
    const AltNamesToJSON = require("./2-altNamesToJSON(NOT_REQUIRED)");
    const AddAltNames = require("./3-AddAltNamesToCities");

// CitiesToJSON();
// AltNamesToJSON();
    await AddAltNames();

    console.log("======================================")
    console.log("START")
    console.log(start)
    console.log("END")
    console.log(new Date())
    console.log("======================================")
}

start();
