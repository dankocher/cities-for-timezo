import axios from 'axios';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { pipeline } from 'stream/promises';
import StreamZip from 'node-stream-zip';

import {
  GEO_NAMES_BASE_URL,
  OUTPUT_DIR,
  DATASET_OPTIONS,
} from '../config/index.js';
import { ensureDirSync, createWriteStream } from '../utils/file.js';
import { isRecordValid } from '../utils/validator.js';

// Helper function to count records in JSON file
async function countRecords(filePath) {
  let count = 0;
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  let buffer = '';
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  let collecting = false;

  for await (const chunk of stream) {
    for (const char of chunk) {
      if (!collecting) {
        if (char === '{') {
          collecting = true;
          buffer = '{';
          depth = 1;
          inString = false;
          escapeNext = false;
        }
        continue;
      }

      buffer += char;

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          count++;
          buffer = '';
          collecting = false;
        }
      }
    }
  }
  return count;
}

async function downloadAndProcessDataset(options) {
  const { datasetId, minPopulation, maxPopulation, countryFilter = [], useExisting = false } = options;
  const dataset = DATASET_OPTIONS.find((item) => item.id === datasetId);

  if (!dataset) {
    throw new Error(`Unknown dataset: ${datasetId}`);
  }

  const datasetName = `cities${dataset.id}`;
  const zipFilename = `${datasetName}.zip`;
  const txtFilename = `${datasetName}.txt`;
  const zipPath = path.join(OUTPUT_DIR, zipFilename);
  const outputPath = path.join(OUTPUT_DIR, `processed-${datasetName}.json`);

  ensureDirSync(OUTPUT_DIR);

  // Check if processed file already exists
  const outputExists = fs.existsSync(outputPath);
  if (outputExists && useExisting) {
    console.log(`Found existing processed file: ${outputPath}`);
    const stats = fs.statSync(outputPath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`File size: ${fileSizeMB} MB`);
    const recordCount = await countRecords(outputPath);
    console.log(`Records in file: ${recordCount}`);
    return { outputPath, count: recordCount, fromCache: true };
  }

  // Download cities dataset
  const downloadUrl = `${GEO_NAMES_BASE_URL}/${zipFilename}`;
  console.log('Downloading cities dataset...');
  await downloadZip(downloadUrl, zipPath);

  // Download and process alternateNamesV2
  console.log('Downloading alternate names...');
  const altNamesMap = await downloadAndProcessAlternateNames();

  const normalizedCountries = countryFilter
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);

  const effectiveMinPopulation =
    typeof minPopulation === 'number' ? minPopulation : dataset.minPopulation;

  const { count } = await extractAndFilter({
    zipPath,
    txtFilename,
    outputPath,
    minPopulation: effectiveMinPopulation,
    maxPopulation,
    countryFilter: normalizedCountries,
    altNamesMap,
  });

  await fs.promises.unlink(zipPath).catch(() => {});

  return { outputPath, count };
}

async function downloadZip(url, destinationPath) {
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
  });

  await pipeline(response.data, fs.createWriteStream(destinationPath));
}

async function downloadAndProcessAlternateNames() {
  const altNamesZipFilename = 'alternateNamesV2.zip';
  const altNamesZipPath = path.join(OUTPUT_DIR, altNamesZipFilename);
  const altNamesTxtFilename = 'alternateNamesV2.txt';

  try {
    const downloadUrl = `${GEO_NAMES_BASE_URL}/${altNamesZipFilename}`;
    await downloadZip(downloadUrl, altNamesZipPath);

    const zip = new StreamZip.async({ file: altNamesZipPath });
    const targetEntry = await locateEntry(zip, altNamesTxtFilename);
    
    if (!targetEntry) {
      await zip.close();
      console.warn('alternateNamesV2.txt not found, continuing without alternate names');
      return new Map();
    }

    const stream = await zip.stream(targetEntry.name);
    const reader = readline.createInterface({ input: stream });
    
    // Map: geonameId -> { languageCode: alternateName }
    const altNamesMap = new Map();

    try {
      for await (const line of reader) {
        if (!line || line.startsWith('#')) continue;
        
        const parts = line.split('\t');
        if (parts.length < 4) continue;

        const alternateNameId = parts[0];
        const geonameId = parts[1];
        const isolanguage = parts[2] || '';
        const alternateName = parts[3] || '';

        // Skip empty language codes or special codes (link, post, etc.)
        if (!isolanguage || isolanguage.length < 2 || isolanguage.length > 5) continue;
        if (['link', 'post', 'iata', 'icao', 'faac', 'abbr', 'wkdt'].includes(isolanguage)) continue;

        if (!altNamesMap.has(geonameId)) {
          altNamesMap.set(geonameId, {});
        }

        const cityAltNames = altNamesMap.get(geonameId);
        // Only keep the first occurrence for each language, or prefer preferred names
        if (!cityAltNames[isolanguage]) {
          cityAltNames[isolanguage] = alternateName;
        } else if (parts.length > 4 && parts[4] === '1') {
          // isPreferredName = '1', use this one
          cityAltNames[isolanguage] = alternateName;
        }
      }
    } finally {
      await zip.close();
    }

    await fs.promises.unlink(altNamesZipPath).catch(() => {});
    console.log(`Loaded ${altNamesMap.size} cities with alternate names`);
    return altNamesMap;
  } catch (error) {
    console.warn(`Error processing alternate names: ${error.message}. Continuing without them.`);
    return new Map();
  }
}

async function extractAndFilter({
  zipPath,
  txtFilename,
  outputPath,
  minPopulation,
  maxPopulation,
  countryFilter,
  altNamesMap,
}) {
  const zip = new StreamZip.async({ file: zipPath });

  const targetEntry = await locateEntry(zip, txtFilename);
  if (!targetEntry) {
    await zip.close();
    throw new Error(`${txtFilename} not found inside the zip file.`);
  }

  const stream = await zip.stream(targetEntry.name);

  const reader = readline.createInterface({ input: stream });
  const writer = createWriteStream(outputPath);
  writer.write('[\n');

  let first = true;
  let count = 0;

  try {
    for await (const line of reader) {
      if (!line || line.startsWith('#')) continue;

      const record = parseLine(line, altNamesMap);
      if (!record) continue;

      if (shouldKeepRecord(record, { minPopulation, maxPopulation, countryFilter }) && isRecordValid(record)) {
        // Remove internal fields before writing
        const { _countryCode, ...cleanRecord } = record;
        const payload = JSON.stringify(cleanRecord);
        writer.write(first ? `  ${payload}` : `,\n  ${payload}`);
        first = false;
        count += 1;
      }
    }

    writer.write('\n]\n');
    writer.end();
    
    // Wait for the writer stream to finish
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  } finally {
    await zip.close();
  }

  return { count };
}

async function locateEntry(zip, preferredName) {
  const entries = await zip.entries();
  if (entries[preferredName]) return entries[preferredName];

  return Object.values(entries).find((entry) => entry.name.endsWith('.txt'));
}

function parseLine(line, altNamesMap = new Map()) {
  const parts = line.split('\t');
  if (parts.length < 19) return null;

  const geonameId = parts[0];
  const name = parts[1];
  const alternateNamesStr = parts[3] || '';
  const aliases = alternateNamesStr.split(',').filter(Boolean).join(',');
  const population = Number(parts[14]) || 0;
  const countryCode = parts[8] || '';
  
  // Get alternate names by language from the map
  const altNames = altNamesMap.has(geonameId) 
    ? { ...altNamesMap.get(geonameId) }
    : {};

  return {
    id: geonameId,
    name: name,
    country: countryCode,
    lat: Number(parts[4]) || 0,
    lon: Number(parts[5]) || 0,
    tz: parts[17] || '',
    aliases: aliases,
    altNames: altNames,
    population: population,
    // Internal field for filtering
    _countryCode: countryCode,
  };
}

function shouldKeepRecord(record, { minPopulation, maxPopulation, countryFilter }) {
  // Filter by population if specified
  if (minPopulation && record.population < minPopulation) return false;
  if (maxPopulation && record.population > maxPopulation) return false;
  
  // Filter by country if specified
  if (countryFilter.length > 0 && !countryFilter.includes(record.country)) return false;
  
  return true;
}

export {
  downloadAndProcessDataset,
};

