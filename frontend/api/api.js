/**
 * Fetch data from an API endpoint.
 *
 * @param {string} endpoint - API endpoint.
 * @param {object} params - Query parameters.
 * @returns {Promise<any>} API response data.
 */
export async function fetchAPI(endpoint, params = {}) {
  // Organize received parameters
  const queryParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      queryParams.append(key, value);
    }
  });

  // Construct the query string for assessing the API
  const queryString = queryParams.toString();
  const url = queryString
    ? `${endpoint}?${queryString}`
    : endpoint;

  // Retrieve response from server
  const response = await fetch(url);
  if (!response.ok) throw new Error(`API request failed: ${response.status}`);

  // Return the needed data
  const result = await response.json();
  return result.data;
}