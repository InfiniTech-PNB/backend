/**
 * @function runWithConcurrency
 * @description Executes an array of asynchronous tasks with a specified concurrency limit.
 * Useful for throttling heavy operations like LLM API calls.
 * @async
 * @param {Array<Function>} tasks - Array of functions that return a Promise.
 * @param {number} [limit=5] - Maximum number of tasks to run in parallel.
 * @returns {Promise<Array>} - Array of results from all tasks.
 */
async function runWithConcurrency(tasks, limit = 5) {

  const results = [];
  const executing = [];

  for (const task of tasks) {

    const p = task().then(res => {
      executing.splice(executing.indexOf(p), 1);
      return res;
    });

    results.push(p);
    executing.push(p);

    if (executing.length >= limit) {
      await Promise.race(executing);
    }

  }

  return Promise.all(results);
}

module.exports = runWithConcurrency;