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
function validateAgainstSchema(data, schema, dataPath = '') {
  const errors = [];

  // Check type
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    let actualType;
    if (data === null) {
      actualType = 'null';
    } else if (Array.isArray(data)) {
      actualType = 'array';
    } else if (typeof data === 'number') {
      // In JSON Schema, integer is a subset of number
      actualType = Number.isInteger(data) ? 'integer' : 'number';
      // Allow integer where number is expected
      if (types.includes('number') && actualType === 'integer') {
        actualType = 'number';
      }
    } else {
      actualType = typeof data;
    }

    if (!types.includes(actualType)) {
      errors.push(`${dataPath}: expected ${types.join(' or ')}, got ${actualType}`);
      return errors;
    }
  }

  // Check required properties
  if (schema.required && typeof data === 'object' && data !== null) {
    for (const prop of schema.required) {
      if (!(prop in data)) {
        errors.push(`${dataPath}: missing required property "${prop}"`);
      }
    }
  }

  // Check properties
  if (schema.properties && typeof data === 'object' && data !== null) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (key in data) {
        errors.push(...validateAgainstSchema(data[key], propSchema, `${dataPath}.${key}`));
      }
    }
  }

  // Check array items
  if (schema.items && Array.isArray(data)) {
    if (schema.minItems && data.length < schema.minItems) {
      errors.push(`${dataPath}: array must have at least ${schema.minItems} items`);
    }
    data.forEach((item, i) => {
      errors.push(...validateAgainstSchema(item, schema.items, `${dataPath}[${i}]`));
    });
  }

  // Check minimum
  if (schema.minimum !== undefined && typeof data === 'number') {
    if (data < schema.minimum) {
      errors.push(`${dataPath}: value ${data} is less than minimum ${schema.minimum}`);
    }
  }

  // Check minLength
  if (schema.minLength !== undefined && typeof data === 'string') {
    if (data.length < schema.minLength) {
      errors.push(`${dataPath}: string length ${data.length} is less than minLength ${schema.minLength}`);
    }
  }

  // Check pattern
  if (schema.pattern && typeof data === 'string') {
    const regex = new RegExp(schema.pattern);
    if (!regex.test(data)) {
      errors.push(`${dataPath}: string "${data}" does not match pattern ${schema.pattern}`);
    }
  }

  // Check enum
  if (schema.enum && !schema.enum.includes(data)) {
    errors.push(`${dataPath}: value must be one of: ${schema.enum.join(', ')}`);
  }

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
  books = fs.readdirSync(booksDir).filter(name => {
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
let allErrors = [];

console.log('Validating chapter status files...\n');

for (const book of books) {
  const chaptersDir = path.join(booksDir, book, 'chapters');

  let chapters;
  try {
    chapters = fs.readdirSync(chaptersDir).filter(name => name.startsWith('ch'));
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
      allErrors.push({ file: `${book}/${chapter}/status.json`, errors: [`JSON parse error: ${err.message}`] });
      continue;
    }

    const errors = validateAgainstSchema(data, expandedSchema);

    if (errors.length === 0) {
      validFiles++;
      console.log(`  ✓ ${book}/${chapter}/status.json`);
    } else {
      allErrors.push({ file: `${book}/${chapter}/status.json`, errors });
      console.log(`  ✗ ${book}/${chapter}/status.json (${errors.length} error${errors.length > 1 ? 's' : ''})`);
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
