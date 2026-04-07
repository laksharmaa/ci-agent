const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Generic retry function with exponential backoff
 * @param {Function} fn - async function to retry
 * @param {Object} options
 * @param {number} options.retries - number of attempts
 * @param {number} options.delay - initial delay in ms
 * @param {number} options.factor - backoff multiplier
 */
async function retry(fn, { retries = 3, delay = 500, factor = 2 } = {}) {
  let attempt = 0;

  while (attempt < retries) {
    try {
      return await fn();
    } catch (error) {
      attempt++;

      if (attempt >= retries) {
        throw error;
      }

      const backoff = delay * Math.pow(factor, attempt - 1);

      console.warn(
        `Retry attempt ${attempt} failed. Retrying in ${backoff}ms...`
      );

      await sleep(backoff);
    }
  }
}

module.exports = retry;