#!/usr/bin/env node
/**
 * Validate all chapter status.json files against the schema
 *
 * Usage: node scripts/validate-status.js [book]
 *
 * If book is specified, only validates that book's chapters.
 * Otherwise validates all books.
 */

const fs = require('fs');
const path = require('path');

const booksDir = path.join(__dirname, '..', 'books');
const schemaPath = path.join(__dirname, '..', 'schemas', 'chapter-status.schema.json');

// Simple JSON Schema validator (basic checks without external dependencies)

/**
 * Get the JSON Schema type of a value
 */
function getSchemaType(data) {
  if (data === null) return 'null';
  if (Array.isArray(data)) return 'array';
  if (typeof data === 'number') {
    return Number.isInteger(data) ? 'integer' : 'number';
  }
  return typeof data;
}

/**
 * Check if actual type matches expected schema types
 */
function checkType(data, schema, dataPath) {
  if (!schema.type) return [];

  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  let actualType = getSchemaType(data);

  // Allow integer where number is expected
  if (types.includes('number') && actualType === 'integer') {
    actualType = 'number';
  }

  if (!types.includes(actualType)) {
    return [`${dataPath}: expected ${types.join(' or ')}, got ${actualType}`];
  }
  return [];
}

/**
 * Check required properties on an object
 */
function checkRequired(data, schema, dataPath) {
  if (!schema.required || typeof data !== 'object' || data === null) return [];

  const errors = [];
  for (const prop of schema.required) {
    if (!(prop in data)) {
      errors.push(`${dataPath}: missing required property "${prop}"`);
    }
  }
  return errors;
}

/**
 * Check number constraints (minimum)
 */
function checkNumberConstraints(data, schema, dataPath) {
  if (schema.minimum === undefined || typeof data !== 'number') return [];

  if (data < schema.minimum) {
    return [`${dataPath}: value ${data} is less than minimum ${schema.minimum}`];
  }
  return [];
}

/**
 * Check string constraints (minLength, pattern)
 */
function checkStringConstraints(data, schema, dataPath) {
  if (typeof data !== 'string') return [];

  const errors = [];
  if (schema.minLength !== undefined && data.length < schema.minLength) {
    errors.push(
      `${dataPath}: string length ${data.length} is less than minLength ${schema.minLength}`
    );
  }
  if (schema.pattern && !new RegExp(schema.pattern).test(data)) {
    errors.push(`${dataPath}: string "${data}" does not match pattern ${schema.pattern}`);
  }
  return errors;
}

/**
 * Check enum constraint
 */
function checkEnum(data, schema, dataPath) {
  if (!schema.enum) return [];

  if (!schema.enum.includes(data)) {
    return [`${dataPath}: value must be one of: ${schema.enum.join(', ')}`];
  }
  return [];
}

/**
 * Validate data against a JSON Schema
 */
function validateAgainstSchema(data, schema, dataPath = '') {
  const errors = [];

  // Type check (returns early if type mismatch)
  const typeErrors = checkType(data, schema, dataPath);
  if (typeErrors.length > 0) return typeErrors;

  // Object validations
  errors.push(...checkRequired(data, schema, dataPath));

  if (schema.properties && typeof data === 'object' && data !== null) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (key in data) {
        errors.push(...validateAgainstSchema(data[key], propSchema, `${dataPath}.${key}`));
      }
    }
  }

  // Array validations
  if (schema.items && Array.isArray(data)) {
    if (schema.minItems && data.length < schema.minItems) {
      errors.push(`${dataPath}: array must have at least ${schema.minItems} items`);
    }
    data.forEach((item, i) => {
      errors.push(...validateAgainstSchema(item, schema.items, `${dataPath}[${i}]`));
    });
  }

  // Primitive validations
  errors.push(...checkNumberConstraints(data, schema, dataPath));
  errors.push(...checkStringConstraints(data, schema, dataPath));
  errors.push(...checkEnum(data, schema, dataPath));

  return errors;
}

function resolveRef(schema, ref) {
  if (!ref.startsWith('#/')) return null;
  const parts = ref.slice(2).split('/');
  let current = schema;
  for (const part of parts) {
    current = current[part];
    if (!current) return null;
  }
  return current;
}

function expandRefs(schema, rootSchema) {
  if (typeof schema !== 'object' || schema === null) return schema;

  if (schema.$ref) {
    const resolved = resolveRef(rootSchema, schema.$ref);
    if (resolved) {
      return expandRefs(resolved, rootSchema);
    }
  }

  const result = Array.isArray(schema) ? [] : {};
  for (const [key, value] of Object.entries(schema)) {
    result[key] = expandRefs(value, rootSchema);
  }
  return result;
}

// Main validation
const bookFilter = process.argv[2];

// Load schema
let schema;
try {
  schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
} catch (err) {
  console.error(`Error loading schema: ${err.message}`);
  process.exit(1);
}

// Expand $ref references
const expandedSchema = expandRefs(schema, schema);

// Find all books
let books;
try {
  books = fs.readdirSync(booksDir).filter((name) => {
    const bookPath = path.join(booksDir, name);
    return fs.statSync(bookPath).isDirectory() && fs.existsSync(path.join(bookPath, 'chapters'));
  });
} catch (err) {
  console.error(`Error reading books directory: ${err.message}`);
  process.exit(1);
}

if (bookFilter) {
  if (!books.includes(bookFilter)) {
    console.error(`Book "${bookFilter}" not found. Available: ${books.join(', ')}`);
    process.exit(1);
  }
  books = [bookFilter];
}

let totalFiles = 0;
let validFiles = 0;
const allErrors = [];

console.log('Validating chapter status files...\n');

for (const book of books) {
  const chaptersDir = path.join(booksDir, book, 'chapters');

  let chapters;
  try {
    chapters = fs.readdirSync(chaptersDir).filter((name) => name.startsWith('ch'));
  } catch {
    continue;
  }

  for (const chapter of chapters) {
    const statusPath = path.join(chaptersDir, chapter, 'status.json');

    if (!fs.existsSync(statusPath)) {
      continue;
    }

    totalFiles++;

    let data;
    try {
      data = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    } catch (err) {
      allErrors.push({
        file: `${book}/${chapter}/status.json`,
        errors: [`JSON parse error: ${err.message}`],
      });
      continue;
    }

    const errors = validateAgainstSchema(data, expandedSchema);

    if (errors.length === 0) {
      validFiles++;
      console.log(`  ✓ ${book}/${chapter}/status.json`);
    } else {
      allErrors.push({ file: `${book}/${chapter}/status.json`, errors });
      console.log(
        `  ✗ ${book}/${chapter}/status.json (${errors.length} error${errors.length > 1 ? 's' : ''})`
      );
    }
  }
}

console.log('\n' + '─'.repeat(50));
console.log(`\nResults: ${validFiles}/${totalFiles} files valid`);

if (allErrors.length > 0) {
  console.log('\nErrors:\n');
  for (const { file, errors } of allErrors) {
    console.log(`  ${file}:`);
    for (const error of errors) {
      console.log(`    - ${error}`);
    }
    console.log('');
  }
  process.exit(1);
} else {
  console.log('\nAll files valid!');
  process.exit(0);
}
