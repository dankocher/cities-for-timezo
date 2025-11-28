import { REQUIRED_FIELDS } from '../config/index.js';

function isRecordValid(record) {
  return REQUIRED_FIELDS.every((field) => record[field] !== undefined && record[field] !== null);
}

export {
  isRecordValid,
};

