#!/usr/bin/env node
import path from 'path';
import fs from 'fs';
import inquirer from 'inquirer';

import {
  DATASET_OPTIONS,
  DEFAULT_DATASET_ID,
  DEFAULT_COLLECTION,
  OUTPUT_DIR,
} from '../config/index.js';
import { downloadAndProcessDataset } from '../services/geonamesDownloader.js';
import { uploadJsonToFirestore } from '../services/firestoreUploader.js';
import {
  INDEXABLE_FIELDS,
  COMMON_INDEX_PRESETS,
  deployIndexesInstructions,
} from '../services/firestoreIndexGenerator.js';

async function main() {
  const command = process.argv[2] || 'download';

  try {
    if (command === 'download') {
      await handleDownload();
    } else if (command === 'upload') {
      await handleUpload();
    } else if (command === 'full') {
      const filters = await askFilters();
      const { outputPath, count } = await processDownload(filters);
      await handleUpload(filters, outputPath);
      console.log(`Complete process finished. ${count} cities loaded.`);
    } else {
      console.warn(`Unknown command "${command}". Use download | upload | full`);
    }
  } catch (error) {
    console.error('Error running CLI:', error.message);
    process.exitCode = 1;
  }
}

async function handleDownload() {
  const filters = await askFilters();
  await processDownload(filters);
}

async function processDownload(filters) {
  const datasetId = filters.datasetId || DEFAULT_DATASET_ID;
  const datasetName = `cities${datasetId}`;
  const outputPath = path.join(OUTPUT_DIR, `processed-${datasetName}.json`);
  
  // Check if file exists and ask user
  let useExisting = false;
  if (fs.existsSync(outputPath)) {
    const stats = fs.statSync(outputPath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    const { useExistingFile } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'useExistingFile',
        message: `Found existing processed file (${fileSizeMB} MB). Use it instead of downloading again?`,
        default: true,
      },
    ]);
    useExisting = useExistingFile;
  }

  console.log(useExisting ? 'Using existing file...' : 'Downloading data from GeoNames...');
  const result = await downloadAndProcessDataset({ ...filters, useExisting });
  
  if (result.fromCache) {
    console.log(`Using existing file at ${result.outputPath} with ${result.count} records.`);
  } else {
    console.log(`File generated at ${result.outputPath} with ${result.count} records.`);
  }
  
  return { outputPath: result.outputPath, count: result.count };
}

async function handleUpload(existingFilters, precomputedPath) {
  const uploadOptions = await askUploadOptions(existingFilters, precomputedPath);
  console.log(`Uploading data from ${uploadOptions.filePath} to Firestore...`);
  
  if (uploadOptions.startFromIndex) {
    console.log(`Will resume from record index: ${uploadOptions.startFromIndex}`);
  } else if (uploadOptions.startFromId) {
    console.log(`Will resume from city ID: ${uploadOptions.startFromId}`);
  }

  let lastSuccessfulId = null;
  let lastSuccessfulIndex = null;
  try {
    const result = await uploadJsonToFirestore({
      ...uploadOptions,
      onProgress: (progress) => {
        lastSuccessfulId = progress.lastSuccessfulId;
        lastSuccessfulIndex = progress.lastSuccessfulIndex;
      },
    });
    const uploaded = typeof result === 'object' ? result.uploaded : result;
    lastSuccessfulId = typeof result === 'object' ? result.lastSuccessfulId : lastSuccessfulId;
    lastSuccessfulIndex = typeof result === 'object' ? result.lastSuccessfulIndex : lastSuccessfulIndex;
    console.log(`Upload completed. Documents uploaded: ${uploaded}.`);

    // Ask about indexing
    const { createIndexes } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'createIndexes',
        message: 'Do you want to create Firestore indexes for faster queries?',
        default: true,
      },
    ]);

    if (createIndexes) {
      await handleIndexCreation(uploadOptions.collection);
    }
  } catch (error) {
    console.error(`\n❌ Error during upload: ${error.message}`);
    
    // Extract lastSuccessfulIndex and lastSuccessfulId from error message if available
    const indexMatch = error.message.match(/Last successfully uploaded record index: (\d+)/);
    const idMatch = error.message.match(/ID: (\d+)/);
    const extractedIndex = indexMatch ? indexMatch[1] : lastSuccessfulIndex;
    const extractedId = idMatch ? idMatch[1] : lastSuccessfulId;
    
    if (extractedIndex) {
      console.log(`\n⚠️  To resume from where it stopped:`);
      console.log(`   1. Run the upload command again`);
      console.log(`   2. When asked "Resume from record number/index", enter: ${extractedIndex}`);
      console.log(`   3. This will skip the first ${extractedIndex} records and continue from record ${extractedIndex + 1}`);
      if (extractedId) {
        console.log(`   (Last successfully uploaded city ID: ${extractedId})`);
      }
    } else if (extractedId) {
      console.log(`\n⚠️  To resume from where it stopped:`);
      console.log(`   1. Run the upload command again`);
      console.log(`   2. When asked "Resume from record number/index", enter the city ID: ${extractedId}`);
      console.log(`   3. This will skip all cities up to ID ${extractedId} and continue from there`);
    } else {
      console.log(`\n⚠️  Check the last "Record index" shown in the progress output above.`);
      console.log(`   Use that number to resume the upload.`);
    }
    throw error;
  }
}

async function handleIndexCreation(collection) {
  console.log('\nAvailable fields for indexing:');
  INDEXABLE_FIELDS.forEach((field, index) => {
    console.log(`  ${index + 1}. ${field.field} (${field.type}) - ${field.description}`);
  });

  console.log('\nCommon index presets:');
  COMMON_INDEX_PRESETS.forEach((preset, index) => {
    console.log(`  ${index + 1}. ${preset.name}: ${preset.fields.join(', ')} - ${preset.description}`);
  });

  const { indexFields } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'indexFields',
      message: 'Select fields to index (use space to select, enter to confirm):',
      choices: INDEXABLE_FIELDS.map((field) => ({
        name: `${field.field} (${field.type}) - ${field.description}`,
        value: field.field,
      })),
      validate: (answer) => {
        if (answer.length === 0) {
          return 'You must select at least one field to index';
        }
        return true;
      },
    },
  ]);

  console.log('\nGenerating index configuration file...');
  const { filePath, instructions } = await deployIndexesInstructions(collection, indexFields);
  
  console.log(`\n✓ Index configuration file generated at: ${filePath}`);
  console.log('\n' + instructions.join('\n'));
}

async function askFilters() {
  const { datasetId, minPopulation, maxPopulation, countries } = await inquirer.prompt([
    {
      type: 'list',
      name: 'datasetId',
      message: 'Select the GeoNames base dataset:',
      choices: DATASET_OPTIONS.map((option) => ({
        name: option.label,
        value: option.id,
      })),
      default: DEFAULT_DATASET_ID,
    },
    {
      type: 'input',
      name: 'minPopulation',
      message: 'Additional minimum population (Enter to use dataset default):',
      validate: validateNumberOrEmpty,
    },
    {
      type: 'input',
      name: 'maxPopulation',
      message: 'Maximum population (optional):',
      validate: validateNumberOrEmpty,
    },
    {
      type: 'input',
      name: 'countries',
      message: 'Filter by country codes (comma-separated, Enter for all):',
    },
  ]);

  return {
    datasetId,
    minPopulation: parseOptionalNumber(minPopulation),
    maxPopulation: parseOptionalNumber(maxPopulation),
    countryFilter: countries
      .split(',')
      .map((code) => code.trim().toUpperCase())
      .filter(Boolean),
  };
}

async function askUploadOptions(existingFilters, precomputedPath) {
  const datasetId = existingFilters?.datasetId || DEFAULT_DATASET_ID;
  const defaultPath = precomputedPath || path.join(OUTPUT_DIR, `processed-cities${datasetId}.json`);

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'filePath',
      message: 'Path to processed JSON file:',
      default: defaultPath,
      validate: (value) => {
        if (!value) return 'You must provide a path';
        if (!fs.existsSync(path.resolve(value))) return 'File does not exist';
        return true;
      },
    },
    {
      type: 'input',
      name: 'collection',
      message: 'Firestore collection name:',
      default: DEFAULT_COLLECTION,
    },
    {
      type: 'confirm',
      name: 'useCustomCredentials',
      message: 'Do you want to specify a credentials file different from .env?',
      default: false,
    },
    {
      type: 'input',
      name: 'credentialsPath',
      message: 'Path to credentials JSON file:',
      when: (answers) => answers.useCustomCredentials,
      validate: (value) => {
        if (!value) return 'You must enter a path';
        if (!fs.existsSync(path.resolve(value))) return 'File does not exist';
        return true;
      },
    },
    {
      type: 'number',
      name: 'batchSize',
      message: 'Firestore batch size (1-450):',
      default: 400,
      validate: (value) => {
        if (!value) return true;
        if (Number.isNaN(value)) return 'Must be a number';
        if (value < 1 || value > 450) return 'Batch size must be between 1 and 450';
        return true;
      },
    },
    {
      type: 'input',
      name: 'startFromIndex',
      message: 'Resume from record number/index (e.g., 17600) or city ID (Enter to start from beginning):',
      validate: (value) => {
        if (!value) return true;
        // Check if it's a number (record index) or could be an ID
        return true;
      },
    },
  ]);

  // Parse startFromIndex - could be a record index number or a city ID
  let startFromId = undefined;
  let startFromIndex = undefined;
  if (answers.startFromIndex) {
    const trimmed = answers.startFromIndex.trim();
    const asNumber = Number(trimmed);
    // If it's a valid number and looks like an index (reasonable range), treat as index
    // Otherwise treat as ID
    if (!Number.isNaN(asNumber) && asNumber > 0 && asNumber < 1000000) {
      startFromIndex = asNumber;
    } else {
      startFromId = trimmed;
    }
  }

  return {
    filePath: path.resolve(answers.filePath),
    collection: answers.collection,
    credentialsPath: answers.credentialsPath ? path.resolve(answers.credentialsPath) : undefined,
    batchSize: answers.batchSize || 400,
    startFromId,
    startFromIndex,
  };
}

function validateNumberOrEmpty(value) {
  if (!value) return true;
  return Number.isNaN(Number(value)) ? 'Must be a valid number' : true;
}

function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

main();

