/**
 * @function toCamel
 * @description Recursively converts all keys in an object (or array of objects) from snake_case to camelCase.
 * @param {any} obj - The object or array to convert.
 * @returns {any}
 */
function toCamel(obj) {
  if (Array.isArray(obj)) {
    return obj.map(v => toCamel(v));
  } else if (obj !== null && obj !== undefined && obj.constructor === Object) {
    return Object.keys(obj).reduce(
      (result, key) => {
        const camelKey = key.replace(/([-_][a-z])/ig, ($1) => $1.toUpperCase().replace('-', '').replace('_', ''));
        return {
          ...result,
          [camelKey]: toCamel(obj[key]),
        };
      },
      {},
    );
  }
  return obj;
}

/**
 * @function toSnake
 * @description Recursively converts all keys in an object (or array of objects) from camelCase to snake_case.
 * @param {any} obj - The object or array to convert.
 * @returns {any}
 */
function toSnake(obj) {
  if (Array.isArray(obj)) {
    return obj.map(v => toSnake(v));
  } else if (obj !== null && obj !== undefined && obj.constructor === Object) {
    return Object.keys(obj).reduce(
      (result, key) => {
        const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        return {
          ...result,
          [snakeKey]: toSnake(obj[key]),
        };
      },
      {},
    );
  }
  return obj;
}

module.exports = { toCamel, toSnake };
