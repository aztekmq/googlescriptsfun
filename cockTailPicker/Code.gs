/**
 * @fileoverview Google Apps Script backend for the Cocktail Picker web application.
 * Converts the previous Gemini-based implementation to use the OpenAI Chat Completions API
 * while providing verbose logging for debugging and internationally recognizable documentation.
 */

/**
 * Immutable configuration used across the cocktail picker service.
 * @type {{endpoint: string, model: string, temperature: number}}
 */
const OPENAI_CONFIGURATION = Object.freeze({
  endpoint: 'https://api.openai.com/v1/chat/completions',
  model: 'gpt-4o-mini',
  temperature: 0.6,
});

/**
 * Handles HTTP GET requests by rendering the main Cocktail Picker user interface.
 * @return {GoogleAppsScript.HTML.HtmlOutput} Rendered HTML page.
 */
function doGet() {
  logVerbose_('doGet invoked; preparing the Cocktail Picker interface.');
  const template = HtmlService.createTemplateFromFile('Index');
  const page = template.evaluate().setTitle('Cocktail Picker');
  logVerbose_('doGet completed; UI ready for delivery.');
  return page;
}

/**
 * Generates a cocktail recommendation using the OpenAI Chat Completions API.
 * @param {Object} rawPreferences Raw preference data supplied by the client UI.
 * @return {{name: string, description: string, ingredients: string[], preparation: string, garnish: string}}
 *     A structured cocktail suggestion.
 */
function getCocktailSuggestion(rawPreferences) {
  logVerbose_('getCocktailSuggestion invoked with raw preferences.', rawPreferences);

  const apiKey = getOpenAIApiKey_();
  const preferences = sanitizePreferences_(rawPreferences);
  logVerbose_('Sanitized preferences ready for OpenAI request.', preferences);

  const prompt = buildPrompt_(preferences);
  logVerbose_('Constructed prompt for OpenAI.', prompt);

  const payload = {
    model: OPENAI_CONFIGURATION.model,
    temperature: OPENAI_CONFIGURATION.temperature,
    messages: [
      {
        role: 'system',
        content:
          'You are an award-winning mixologist. Provide precise, practical cocktail recipes with clear steps and measurements.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    response_format: { type: 'json_object' },
  };

  const requestOptions = {
    method: 'post',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  logVerbose_('Dispatching request to OpenAI.', requestOptions);

  try {
    const response = UrlFetchApp.fetch(OPENAI_CONFIGURATION.endpoint, requestOptions);
    const statusCode = response.getResponseCode();
    logVerbose_('OpenAI response status code received.', statusCode);

    const responseBody = response.getContentText();
    logVerbose_('Raw response body obtained from OpenAI.', responseBody);

    if (statusCode < 200 || statusCode >= 300) {
      throw new Error('OpenAI API returned an error with status code ' + statusCode + ': ' + responseBody);
    }

    const suggestion = extractCocktailFromResponse_(responseBody);
    logVerbose_('Extracted cocktail suggestion ready for client delivery.', suggestion);
    return suggestion;
  } catch (error) {
    logVerbose_('Error encountered while calling OpenAI.', error);
    throw new Error('Unable to generate cocktail suggestion at this time. Please verify configuration and try again.');
  }
}

/**
 * Retrieves the OpenAI API key from the script properties.
 * @return {string} The API key string.
 * @private
 */
function getOpenAIApiKey_() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const apiKey = scriptProperties.getProperty('OPENAI_API_KEY');
  logVerbose_('API key retrieval attempted. Key available: ' + Boolean(apiKey));
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured in Script Properties.');
  }
  return apiKey;
}

/**
 * Sanitizes and normalizes incoming preference data.
 * @param {Object} rawPreferences The raw preferences provided by the client.
 * @return {{baseSpirit: string, flavorProfile: string, additionalNotes: string}}
 * @private
 */
function sanitizePreferences_(rawPreferences) {
  const preferences = rawPreferences || {};
  const sanitized = {
    baseSpirit: (preferences.baseSpirit || '').trim(),
    flavorProfile: (preferences.flavorProfile || '').trim(),
    additionalNotes: (preferences.additionalNotes || '').trim(),
  };
  return sanitized;
}

/**
 * Builds the user prompt guiding the OpenAI model toward the desired output structure.
 * @param {{baseSpirit: string, flavorProfile: string, additionalNotes: string}} preferences The sanitized preferences.
 * @return {string} Formatted prompt string ready for OpenAI consumption.
 * @private
 */
function buildPrompt_(preferences) {
  const baseSpiritText = preferences.baseSpirit ? 'Base spirit: ' + preferences.baseSpirit + '\n' : '';
  const flavorProfileText = preferences.flavorProfile ? 'Flavor preferences: ' + preferences.flavorProfile + '\n' : '';
  const notesText = preferences.additionalNotes ? 'Additional notes: ' + preferences.additionalNotes + '\n' : '';

  return (
    'Create a single cocktail recommendation tailored to the following guest preferences. ' +
    'Respond strictly in JSON format with the keys "name", "description", "ingredients" (array of strings), ' +
    '"preparation" (concise step-by-step instructions), and "garnish".' +
    '\n\n' +
    baseSpiritText +
    flavorProfileText +
    notesText +
    '\nEnsure the recipe can be prepared by an enthusiastic home bartender. Use metric measurements where sensible.'
  );
}

/**
 * Extracts and validates the cocktail information from the OpenAI response payload.
 * @param {string} responseBody Raw JSON string returned by OpenAI.
 * @return {{name: string, description: string, ingredients: string[], preparation: string, garnish: string}}
 * @private
 */
function extractCocktailFromResponse_(responseBody) {
  const parsed = JSON.parse(responseBody);
  logVerbose_('Parsed OpenAI response JSON.', parsed);

  const choice = parsed.choices && parsed.choices[0];
  if (!choice || !choice.message || !choice.message.content) {
    throw new Error('OpenAI response did not include a valid message choice.');
  }

  const content = choice.message.content;
  logVerbose_('OpenAI message content extracted.', content);

  let suggestion;
  try {
    suggestion = JSON.parse(content);
  } catch (parseError) {
    logVerbose_('Initial JSON parsing failed; attempting structured fallback.', parseError);
    suggestion = parseStructuredTextFallback_(content);
  }

  validateSuggestion_(suggestion);
  return suggestion;
}

/**
 * Attempts to parse structured text when JSON.parse is not directly possible.
 * @param {string} content Textual content to interpret.
 * @return {{name: string, description: string, ingredients: string[], preparation: string, garnish: string}}
 * @private
 */
function parseStructuredTextFallback_(content) {
  const cleaned = content
    .replace(/^[^\{]*\{/s, '{')
    .replace(/\}[^\}]*$/s, '}');
  logVerbose_('Fallback content cleaned for JSON parsing.', cleaned);
  return JSON.parse(cleaned);
}

/**
 * Validates the structure of the cocktail suggestion to maintain contract integrity.
 * @param {{name: string, description: string, ingredients: *, preparation: string, garnish: string}} suggestion Suggestion object to validate.
 * @private
 */
function validateSuggestion_(suggestion) {
  if (!suggestion || typeof suggestion !== 'object') {
    throw new Error('Suggestion payload is invalid.');
  }

  const requiredKeys = ['name', 'description', 'ingredients', 'preparation', 'garnish'];
  requiredKeys.forEach(function (key) {
    if (!(key in suggestion)) {
      throw new Error('Missing required key in suggestion: ' + key);
    }
  });

  if (!Array.isArray(suggestion.ingredients)) {
    throw new Error('Ingredients must be provided as an array of strings.');
  }
}

/**
 * Provides standardized, verbose logging for debugging purposes.
 * @param {string} message Descriptive log message.
 * @param {*} [data] Optional supplementary data to include in the log entry.
 * @private
 */
function logVerbose_(message, data) {
  if (data === undefined) {
    Logger.log('[CocktailPicker] %s', message);
  } else {
    try {
      const serialized = typeof data === 'string' ? data : JSON.stringify(data);
      Logger.log('[CocktailPicker] %s :: %s', message, serialized);
    } catch (error) {
      Logger.log('[CocktailPicker] %s :: [unserializable data]', message);
    }
  }
}
