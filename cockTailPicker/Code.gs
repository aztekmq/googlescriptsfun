/**
 * @fileoverview Google Apps Script backend for the Mythic Mixology experience.
 * Provides deterministic drink generation logic, Google Sheet persistence, and
 * verbose operational logging suitable for international development teams.
 */

/** @type {string} */
const APPLICATION_TITLE = 'Mythic Mixology Lab';

/**
 * Spreadsheet configuration describing the storage layout for generated drinks
 * and voting audit information.
 * @type {{primaryName: string, votesName: string, primaryHeaders: string[], votesHeaders: string[]}}
 */
const SHEET_CONFIGURATION = Object.freeze({
  primaryName: 'GeneratedDrinks',
  votesName: 'VoteAudit',
  primaryHeaders: [
    'Drink ID',
    'Timestamp (ISO)',
    'Generator Key',
    'Generator Label',
    'First Name',
    'Last Name',
    'Birth Month',
    'Birth Day',
    'Birth Year',
    'Reason',
    'Drink Name',
    'Ingredients',
    'Instructions',
    'Compatibility or Twist',
    'Vote Count',
  ],
  votesHeaders: ['Timestamp (ISO)', 'Drink ID', 'Previous Votes', 'New Votes', 'Action'],
});

/**
 * Script property key used to remember the storage spreadsheet identifier.
 * @type {string}
 */
const STORAGE_SPREADSHEET_ID_PROPERTY = 'mythicMixology.storageSpreadsheetId';

/**
 * Internationalized lookup between generator identifiers and descriptive names.
 * @type {{[key: string]: string}}
 */
const GENERATOR_LABELS = Object.freeze({
  astro: 'Astrological Elixir Generator',
  numerology: 'Name Numerology Mixer',
  chrono: 'Birthday Chrono-Cocktail',
  oracle: 'Personalized Palate Oracle',
  dynasty: 'Dynastic Drink Dynasty',
});

/**
 * Handles HTTP GET requests by ensuring the backing spreadsheet structure is
 * present and returning the compiled front-end interface.
 * @return {GoogleAppsScript.HTML.HtmlOutput} Fully rendered HTML interface.
 */
function doGet() {
  logVerbose_('doGet invoked; ensuring spreadsheet structure and rendering UI.');
  ensureSpreadsheetStructure_();
  const template = HtmlService.createTemplateFromFile('Index');
  const page = template.evaluate().setTitle(APPLICATION_TITLE);
  logVerbose_('doGet completed successfully; delivering interface.');
  return page;
}

/**
 * Generates a bespoke drink concept based on the selected generator paradigm.
 * The resulting cocktail is persisted in the backing spreadsheet and returned
 * to the caller for display.
 * @param {{generatorKey: string, birthMonth: number, birthDay: number, birthYear: number, firstName: string, lastName: string}} payload
 * @return {{drinkId: string, drinkName: string, reason: string, ingredients: string[], instructions: string[], compatibility: string, generatorLabel: string, voteCount: number}}
 */
function generateDrink(payload) {
  logVerbose_('generateDrink invoked with raw payload.', payload);
  ensureSpreadsheetStructure_();

  const request = sanitizeGenerationRequest_(payload);
  logVerbose_('Generation payload sanitized.', request);

  const context = buildGenerationContext_(request);
  logVerbose_('Constructed deterministic context for generator.', context);

  const generator = getGeneratorByKey_(request.generatorKey);
  logVerbose_('Resolved generator function for key.', request.generatorKey);

  let blueprint = null;
  const openAiKey = getOpenAiApiKey_();
  if (openAiKey) {
    try {
      blueprint = generateDrinkWithOpenAI_(request, context, openAiKey);
      logVerbose_('OpenAI blueprint generation succeeded.', blueprint);
    } catch (error) {
      logVerbose_('OpenAI blueprint generation failed; reverting to deterministic generator.', {
        message: error && error.message ? error.message : 'Unknown error',
        stack: error && error.stack ? String(error.stack) : 'No stack available',
      });
    }
  } else {
    logVerbose_('OpenAI API key not detected; using deterministic generator.');
  }

  if (!blueprint) {
    blueprint = generator(context);
    logVerbose_('Deterministic generator produced blueprint.', blueprint);
  }

  const persisted = persistBlueprint_(request, blueprint);
  logVerbose_('Blueprint persisted to spreadsheet.', persisted);

  return persisted;
}

/**
 * Attempts to retrieve the OpenAI API key from script properties.
 * @return {?string} API key if configured; otherwise null.
 * @private
 */
function getOpenAiApiKey_() {
  try {
    const properties = PropertiesService.getScriptProperties();
    const value = properties ? String(properties.getProperty('OPENAI_API_KEY') || '').trim() : '';
    if (!value) {
      return null;
    }
    logVerbose_('OpenAI API key located in script properties (masked length logged).', { length: value.length });
    return value;
  } catch (error) {
    logVerbose_('Unable to access script properties for OpenAI API key.', {
      message: error && error.message ? error.message : 'Unknown error',
    });
    return null;
  }
}

/**
 * Utilizes the OpenAI API to build a cocktail blueprint tailored to the request.
 * Falls back to deterministic generation when an error is encountered.
 * @param {{generatorKey: string, birthMonth: number, birthDay: number, birthYear: number, firstName: string, lastName: string}} request
 * @param {Object} context Deterministic context built for the request.
 * @param {string} apiKey Resolved OpenAI API key.
 * @return {{drinkName: string, reason: string, ingredients: string[], instructions: string[], compatibility: string}}
 * @private
 */
function generateDrinkWithOpenAI_(request, context, apiKey) {
  const endpoint = 'https://api.openai.com/v1/chat/completions';
  const prompt = buildOpenAiPrompt_(request, context);
  const payload = {
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'You are an award-winning mixologist creating bespoke cocktails. Respond using strict JSON with keys drinkName, reason, ingredients (array), instructions (array), compatibility.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + apiKey,
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  logVerbose_('Dispatching OpenAI generation request.');
  const httpResponse = UrlFetchApp.fetch(endpoint, options);
  const status = httpResponse.getResponseCode();
  const bodyText = httpResponse.getContentText();
  logVerbose_('OpenAI HTTP response received.', { status: status });

  if (status < 200 || status >= 300) {
    throw new Error('OpenAI API returned status ' + status + ': ' + bodyText);
  }

  let responseObject;
  try {
    responseObject = JSON.parse(bodyText);
  } catch (parseError) {
    throw new Error('Failed to parse OpenAI response JSON: ' + parseError.message);
  }

  if (!responseObject.choices || !responseObject.choices.length) {
    throw new Error('OpenAI response missing choices array.');
  }

  const content = responseObject.choices[0].message && responseObject.choices[0].message.content;
  if (!content) {
    throw new Error('OpenAI response missing message content.');
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (parseContentError) {
    throw new Error('OpenAI message content is not valid JSON: ' + parseContentError.message);
  }

  return normalizeOpenAiBlueprint_(parsed, context);
}

/**
 * Builds a structured prompt for the OpenAI API describing the requested drink.
 * @param {{generatorKey: string, birthMonth: number, birthDay: number, birthYear: number, firstName: string, lastName: string}} request
 * @param {Object} context Deterministic context created for the request.
 * @return {string} Prompt string guiding the OpenAI response.
 * @private
 */
function buildOpenAiPrompt_(request, context) {
  const lines = [
    'Create a cocktail concept inspired by the following individual details.',
    'Generator label: ' + context.generatorLabel + '.',
    'Name: ' + context.firstName + ' ' + context.lastName + '.',
    'Birth date: ' + request.birthMonth + '/' + request.birthDay + '/' + request.birthYear + '.',
    'Zodiac sign: ' + context.zodiac.sign + ' (' + context.zodiac.element + ').',
    'Signature spirit: ' + context.zodiac.signatureSpirit + '.',
    'Accent notes: ' + context.zodiac.accentNotes.join(', ') + '.',
    'Garnish inspirations: ' + context.zodiac.garnishes.join(', ') + '.',
    'Numerology value: ' + context.numerology + '.',
    'Lineage inspiration: ' + context.lineage + '.',
    'Deterministic seed: ' + context.seed + '.',
    'Provide ingredients and instructions that can be executed at home.',
    'Compatibility should be a friendly string summarizing why the drink suits the recipient.',
  ];
  return lines.join('\n');
}

/**
 * Normalizes the OpenAI blueprint into the structure expected by the app.
 * @param {Object} blueprint Raw blueprint returned by OpenAI.
 * @param {Object} context Deterministic context used for fallback defaults.
 * @return {{drinkName: string, reason: string, ingredients: string[], instructions: string[], compatibility: string}}
 * @private
 */
function normalizeOpenAiBlueprint_(blueprint, context) {
  const drinkName = blueprint && blueprint.drinkName ? String(blueprint.drinkName).trim() : context.firstName + ' Signature Sip';
  const reason = blueprint && blueprint.reason ? String(blueprint.reason).trim() : 'A bespoke creation blending celestial and personal motifs.';
  const ingredients = Array.isArray(blueprint && blueprint.ingredients)
    ? blueprint.ingredients.map(function (entry) { return String(entry).trim(); })
    : [];
  const instructions = Array.isArray(blueprint && blueprint.instructions)
    ? blueprint.instructions.map(function (entry) { return String(entry).trim(); })
    : [];
  const compatibility = blueprint && blueprint.compatibility ? String(blueprint.compatibility).trim() : 'Tailored compatibility insight unavailable.';

  return {
    drinkName: drinkName,
    reason: reason,
    ingredients: ingredients,
    instructions: instructions,
    compatibility: compatibility,
  };
}

/**
 * Retrieves all stored drinks for presentation in the searchable and sortable
 * catalogue interface.
 * @return {Array<Object>} Collection of drink records.
 */
function getStoredDrinks() {
  logVerbose_('getStoredDrinks invoked.');
  ensureSpreadsheetStructure_();

  const sheet = getPrimarySheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    logVerbose_('No stored drinks available; returning empty array.');
    return [];
  }

  const data = sheet.getRange(2, 1, lastRow - 1, SHEET_CONFIGURATION.primaryHeaders.length).getValues();
  const drinks = data.map(function (row) {
    return {
      drinkId: row[0],
      timestamp: row[1],
      generatorKey: row[2],
      generatorLabel: row[3],
      firstName: row[4],
      lastName: row[5],
      birthMonth: row[6],
      birthDay: row[7],
      birthYear: row[8],
      reason: row[9],
      drinkName: row[10],
      ingredients: row[11] ? row[11].split('\u2022').map(function (entry) { return entry.trim(); }) : [],
      instructions: row[12] ? row[12].split('\u2022').map(function (entry) { return entry.trim(); }) : [],
      compatibility: row[13],
      voteCount: Number(row[14] || 0),
    };
  });

  logVerbose_('Retrieved stored drinks.', { count: drinks.length });
  return drinks;
}

/**
 * Records an affirmative vote for the supplied drink identifier and logs the
 * action in the vote audit worksheet.
 * @param {string} drinkId The unique drink identifier to increment.
 * @return {{drinkId: string, voteCount: number}}
 */
function registerVote(drinkId) {
  logVerbose_('registerVote invoked for drink.', drinkId);
  ensureSpreadsheetStructure_();

  if (!drinkId) {
    throw new Error('A valid drink identifier is required to register a vote.');
  }

  const sheet = getPrimarySheet_();
  const dataRange = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 0), SHEET_CONFIGURATION.primaryHeaders.length);
  const values = dataRange.getValues();
  let updatedRowIndex = -1;
  let currentVotes = 0;

  for (let i = 0; i < values.length; i++) {
    if (values[i][0] === drinkId) {
      updatedRowIndex = i + 2; // Convert to 1-based with header offset.
      currentVotes = Number(values[i][14] || 0);
      break;
    }
  }

  if (updatedRowIndex === -1) {
    throw new Error('The requested drink could not be located.');
  }

  const newVotes = currentVotes + 1;
  sheet.getRange(updatedRowIndex, 15).setValue(newVotes);
  logVerbose_('Vote count updated in primary sheet.', { drinkId: drinkId, newVotes: newVotes });

  const votesSheet = getVotesSheet_();
  votesSheet.appendRow([
    new Date().toISOString(),
    drinkId,
    currentVotes,
    newVotes,
    'increment',
  ]);
  logVerbose_('Vote audit entry recorded.');

  return { drinkId: drinkId, voteCount: newVotes };
}

// ---------------------------------------------------------------------------
// Sanitization and persistence helpers
// ---------------------------------------------------------------------------

/**
 * Validates and normalizes incoming generation payload data.
 * @param {Object} payload Raw payload from the client.
 * @return {{generatorKey: string, birthMonth: number, birthDay: number, birthYear: number, firstName: string, lastName: string}}
 * @private
 */
function sanitizeGenerationRequest_(payload) {
  if (!payload) {
    throw new Error('Generation payload is missing.');
  }

  const generatorKey = String(payload.generatorKey || '').trim();
  if (!GENERATOR_LABELS[generatorKey]) {
    throw new Error('An unsupported generator was selected.');
  }

  const birthMonth = Number(payload.birthMonth);
  const birthDay = Number(payload.birthDay);
  const birthYear = Number(payload.birthYear);
  if (!Number.isInteger(birthMonth) || birthMonth < 1 || birthMonth > 12) {
    throw new Error('Birth month must be an integer between 1 and 12.');
  }

  if (!Number.isInteger(birthDay) || birthDay < 1 || birthDay > 31) {
    throw new Error('Birth day must be an integer between 1 and 31.');
  }

  if (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > new Date().getFullYear()) {
    throw new Error('Birth year is invalid or not provided.');
  }

  const firstName = String(payload.firstName || '').trim();
  const lastName = String(payload.lastName || '').trim();
  if (!firstName || !lastName) {
    throw new Error('First name and last name are required for drink generation.');
  }

  return {
    generatorKey: generatorKey,
    birthMonth: birthMonth,
    birthDay: birthDay,
    birthYear: birthYear,
    firstName: firstName,
    lastName: lastName,
  };
}

/**
 * Builds a deterministic context object utilized by generator algorithms.
 * @param {{generatorKey: string, birthMonth: number, birthDay: number, birthYear: number, firstName: string, lastName: string}} request
 * @return {{generatorKey: string, generatorLabel: string, birthMonth: number, birthDay: number, birthYear: number, firstName: string, lastName: string, zodiac: Object, numerology: number, initials: string, lineage: string, random: function(): number, seed: string}}
 * @private
 */
function buildGenerationContext_(request) {
  const seed = [
    request.generatorKey,
    request.birthMonth,
    request.birthDay,
    request.birthYear,
    request.firstName,
    request.lastName,
  ].join('|');

  const random = createDeterministicRandom_(seed);
  const zodiac = getZodiacProfile_(request.birthMonth, request.birthDay);
  const numerology = computeNumerologyValue_(request.firstName + ' ' + request.lastName);
  const initials = (request.firstName[0] || '').toUpperCase() + (request.lastName[0] || '').toUpperCase();
  const lineage = inferLineage_(request.lastName);

  return {
    generatorKey: request.generatorKey,
    generatorLabel: GENERATOR_LABELS[request.generatorKey],
    birthMonth: request.birthMonth,
    birthDay: request.birthDay,
    birthYear: request.birthYear,
    firstName: request.firstName,
    lastName: request.lastName,
    zodiac: zodiac,
    numerology: numerology,
    initials: initials,
    lineage: lineage,
    random: random,
    seed: seed,
  };
}

/**
 * Persists the generated drink blueprint into the spreadsheet and returns the
 * enriched record to the caller.
 * @param {Object} request Sanitized generation request.
 * @param {{drinkName: string, reason: string, ingredients: string[], instructions: string[], compatibility: string}} blueprint
 * @return {{drinkId: string, drinkName: string, reason: string, ingredients: string[], instructions: string[], compatibility: string, generatorLabel: string, voteCount: number}}
 * @private
 */
function persistBlueprint_(request, blueprint) {
  const sheet = getPrimarySheet_();
  const drinkId = Utilities.getUuid();
  const timestamp = new Date().toISOString();
  const ingredientsCell = (blueprint.ingredients || []).join(' \u2022 ');
  const instructionsCell = (blueprint.instructions || []).join(' \u2022 ');

  sheet.appendRow([
    drinkId,
    timestamp,
    request.generatorKey,
    GENERATOR_LABELS[request.generatorKey],
    request.firstName,
    request.lastName,
    request.birthMonth,
    request.birthDay,
    request.birthYear,
    blueprint.reason,
    blueprint.drinkName,
    ingredientsCell,
    instructionsCell,
    blueprint.compatibility,
    0,
  ]);

  logVerbose_('Row appended to primary sheet.', { drinkId: drinkId });

  return {
    drinkId: drinkId,
    drinkName: blueprint.drinkName,
    reason: blueprint.reason,
    ingredients: blueprint.ingredients,
    instructions: blueprint.instructions,
    compatibility: blueprint.compatibility,
    generatorLabel: GENERATOR_LABELS[request.generatorKey],
    voteCount: 0,
  };
}

// ---------------------------------------------------------------------------
// Generator lookup and algorithms
// ---------------------------------------------------------------------------

/**
 * Resolves the generator function associated with the provided key.
 * @param {string} key Generator identifier supplied by the client.
 * @return {function(Object): {drinkName: string, reason: string, ingredients: string[], instructions: string[], compatibility: string}}
 * @private
 */
function getGeneratorByKey_(key) {
  switch (key) {
    case 'astro':
      return generateAstrologicalElixir_;
    case 'numerology':
      return generateNameNumerologyMixer_;
    case 'chrono':
      return generateBirthdayChronoCocktail_;
    case 'oracle':
      return generatePersonalizedPalateOracle_;
    case 'dynasty':
      return generateDynasticDrinkDynasty_;
    default:
      throw new Error('Unsupported generator key: ' + key);
  }
}

/**
 * Generator 1: Astrological Elixir inspired by zodiac and name traits.
 * @param {Object} context Generation context object.
 * @return {{drinkName: string, reason: string, ingredients: string[], instructions: string[], compatibility: string}}
 * @private
 */
function generateAstrologicalElixir_(context) {
  const flavorProfiles = {
    A: 'amber agave warmth',
    B: 'botanical brightness',
    C: 'citrus sparkle',
    D: 'dusky spice',
    E: 'effervescent elegance',
    F: 'forest herb whisper',
    G: 'ginger glow',
    H: 'honeyed harmony',
    I: 'icy intrigue',
    J: 'juicy jubilance',
    K: 'kaleidoscopic kick',
    L: 'lush luxe layers',
    M: 'midnight mystique',
    N: 'nectar nuance',
    O: 'opulent orange zest',
    P: 'plush petal softness',
    Q: 'quartz-clear crispness',
    R: 'radiant rouge',
    S: 'simmering sour starlight',
    T: 'twilight tonic',
    U: 'utopian umami',
    V: 'velvet verdant vibes',
    W: 'whispering woodland',
    X: 'xenial exotic energy',
    Y: 'yonder citrus yawn',
    Z: 'zenithal zest',
  };

  const complexity = Math.min(5, Math.max(3, Math.ceil(context.lastName.length / 3)));
  const baseSpirit = context.zodiac.signatureSpirit;
  const accent = randomPick_(context.random, context.zodiac.accentNotes);
  const garnish = randomPick_(context.random, context.zodiac.garnishes);
  const mixerOptions = ['sparkling tonic', 'hibiscus tea', 'charred pineapple juice', 'lunar lychee nectar', 'smoked maple water'];
  const mixers = buildUniqueSelection_(context.random, mixerOptions, complexity - 2);

  const ingredients = [
    baseSpirit + ' - 2 oz',
    accent + ' liqueur - 0.75 oz',
  ]
    .concat(mixers.map(function (item) { return item + ' - 1 oz'; }))
    .concat([garnish + ' for garnish']);

  const compatibilityScore = Math.round(78 + context.random() * 20);
  const reason = 'The ' + context.zodiac.sign + ' constellation crowns you with ' +
    context.zodiac.element + ' energy, so your elixir leans on ' + baseSpirit + '. ' +
    'Your first initial invites ' + (flavorProfiles[context.firstName[0].toUpperCase()] || 'stellar balance') +
    ', while the length of the ' + context.lastName + ' lineage calls for ' + complexity + ' cosmic layers.';

  const instructions = [
    'Stir the ' + baseSpirit + ' and ' + accent + ' with ice to honor your celestial patience.',
    'Cascade in ' + mixers.join(', ') + ' to echo the ' + context.zodiac.element.toLowerCase() + ' element.',
    'Strain into a chilled coupe and float ' + garnish + ' as your guiding star.',
  ];

  return {
    drinkName: context.zodiac.sign + ' Starfall ' + context.firstName.charAt(0).toUpperCase(),
    reason: reason,
    ingredients: ingredients,
    instructions: instructions,
    compatibility: 'Cosmic compatibility: ' + compatibilityScore + '%',
  };
}

/**
 * Generator 2: Name Numerology Mixer based on numerological reductions.
 * @param {Object} context Generation context object.
 * @return {{drinkName: string, reason: string, ingredients: string[], instructions: string[], compatibility: string}}
 * @private
 */
function generateNameNumerologyMixer_(context) {
  const spiritMap = {
    1: 'crystal vodka',
    2: 'botanical gin',
    3: 'aged rum',
    4: 'silky tequila',
    5: 'smoked whisky',
    6: 'velvet brandy',
    7: 'sapphire gin',
    8: 'amber bourbon',
    9: 'elegant sake',
  };

  const baseSpirit = spiritMap[context.numerology] || 'artisan vodka';
  const monthMeasure = (context.birthMonth % 3) + 1;
  const dayMeasure = (context.birthDay / 10).toFixed(1);
  const yearSeed = context.birthYear % 100;
  const randomGarnishes = ['lucky starfruit twist', 'destiny-dusted cocoa nibs', 'fortune basil crown', 'prophecy orchid petal'];
  const garnish = randomPick_(context.random, randomGarnishes);

  const reason = 'Numerology total ' + context.numerology + ' aligns you with ' + baseSpirit +
    ', while your birth timing sets the measures to ' + monthMeasure + ' oz of inspiration and ' +
    dayMeasure + ' oz of intuition. A birth-year seed of ' + yearSeed + ' sprinkles mystical garnish.';

  const ingredients = [
    baseSpirit + ' - ' + monthMeasure + ' oz',
    'illuminated citrus cordial - ' + dayMeasure + ' oz',
    'moonlit jasmine tea - ' + (1 + (yearSeed % 3)) + ' dashes',
    'starlit honey syrup - ' + (0.5 + (context.random() * 0.5)).toFixed(2) + ' oz',
    garnish,
  ];

  const instructions = [
    'Combine ' + baseSpirit + ', citrus cordial, and jasmine tea over sacred crushed ice.',
    'Whisper your life path number while stirring exactly ' + (context.numerology + 2) + ' times.',
    'Strain into a chilled highball and finish with ' + garnish + '.',
  ];

  return {
    drinkName: 'Life Path Libation ' + context.numerology,
    reason: reason,
    ingredients: ingredients,
    instructions: instructions,
    compatibility: 'Destined harmony: infuse for ' + ((context.birthDay % 5) + 2) + ' breaths.',
  };
}

/**
 * Generator 3: Birthday Chrono-Cocktail referencing lifetime chronology.
 * @param {Object} context Generation context object.
 * @return {{drinkName: string, reason: string, ingredients: string[], instructions: string[], compatibility: string}}
 * @private
 */
function generateBirthdayChronoCocktail_(context) {
  const birthDate = new Date(context.birthYear, context.birthMonth - 1, context.birthDay);
  const today = new Date();
  const ageInDays = Math.floor((today.getTime() - birthDate.getTime()) / (1000 * 60 * 60 * 24));
  const decadeSpiritMap = ['yuzu shochu', 'silver tequila', 'barrel-aged gin', 'rye whisky', 'caribbean rum', 'cognac', 'mezcal', 'plum brandy', 'aquavit', 'amarone vermouth'];
  const spiritIndex = Math.min(decadeSpiritMap.length - 1, Math.floor((ageInDays / 3650))); // 10-year spans
  const spirit = decadeSpiritMap[spiritIndex];

  const mixerMap = ['crimson campari', 'sakura syrup', 'smoked pear nectar', 'coconut water', 'charcoal tonic', 'cacao cold brew', 'vermouth mist', 'passionfruit cloud'];
  const mixer = randomPick_(context.random, mixerMap);
  const mutationIndex = (today.getMonth() + 1 + today.getDate()) % mixerMap.length;
  const mutation = mixerMap[mutationIndex];

  const initialsFlavor = buildInitialsFlavor_(context.initials);
  const reason = 'A lifetime of ' + ageInDays + ' days seeds this chrono-cocktail. Your decade spirit is ' + spirit +
    ', initials spark ' + initialsFlavor + ', and today\'s temporal mutation invites a swap to ' + mutation + '.';

  const ingredients = [
    spirit + ' - 1.75 oz',
    mixer + ' - 1 oz',
    mutation + ' - 0.5 oz (rebirth twist)',
    'temporal bitters - ' + ((context.birthDay % 4) + 1) + ' dashes',
    'evolving citrus zest mist',
  ];

  const instructions = [
    'Shake spirits and mixers with glacial cubes to honor the days gone by.',
    'Double strain into a chilled rocks glass over a single sphere of ice.',
    'Express the evolving zest and announce the rebirth variation aloud.',
  ];

  return {
    drinkName: 'Chrono Cascade ' + context.initials,
    reason: reason,
    ingredients: ingredients,
    instructions: instructions,
    compatibility: 'Evolves again in ' + ((context.birthMonth * context.birthDay) % 9 + 1) + ' days.',
  };
}

/**
 * Generator 4: Personalized Palate Oracle using hashed profiles.
 * @param {Object} context Generation context object.
 * @return {{drinkName: string, reason: string, ingredients: string[], instructions: string[], compatibility: string}}
 * @private
 */
function generatePersonalizedPalateOracle_(context) {
  const archetypes = ['bold', 'silken', 'herbaceous', 'radiant', 'smoky', 'effervescent'];
  const archetype = randomPick_(context.random, archetypes);
  const seasonalIngredients = {
    winter: ['frosted rosemary', 'candied cranberry', 'smoked vanilla'],
    spring: ['green strawberry', 'basil blossom', 'matcha honey'],
    summer: ['grilled mango', 'coconut foam', 'tamarind breeze'],
    autumn: ['caramelized fig', 'sage syrup', 'pecan spice dust'],
  };

  const season = inferBirthSeason_(context.birthMonth);
  const ingredientSet = seasonalIngredients[season];
  const baseSpirits = ['white rum', 'aged cachaça', 'botanical aquavit', 'citrus gin', 'rice vodka'];
  const baseSpirit = randomPick_(context.random, baseSpirits);
  const pairing = randomPick_(context.random, ['saffron brittle', 'sea-salt dark chocolate', 'citrus madeleine']);

  const reason = 'Oracle reading: the cadence of ' + context.firstName + ' ' + context.lastName +
    ' resonates as ' + archetype + '. Birth season ' + season + ' blesses you with ' + ingredientSet.join(', ') +
    ' and the name\'s rhythm chooses ' + baseSpirit + '.';

  const ingredients = [
    baseSpirit + ' - 2 oz',
    ingredientSet[0] + ' puree - 1 oz',
    ingredientSet[1] + ' cordial - 0.5 oz',
    ingredientSet[2] + ' tincture - 3 drops',
    'oracle foam - 1 scoop',
  ];

  const instructions = [
    'Dry shake all ingredients to awaken the oracle foam.',
    'Add ice, shake vigorously, and strain into a stemmed glass.',
    'Serve alongside ' + pairing + ' for harmonious alignment.',
  ];

  return {
    drinkName: 'Oracle Reverie ' + season.charAt(0).toUpperCase(),
    reason: reason,
    ingredients: ingredients,
    instructions: instructions,
    compatibility: 'Oracle pairing: ' + pairing,
  };
}

/**
 * Generator 5: Dynastic Drink Dynasty celebrating lineage-based inspirations.
 * @param {Object} context Generation context object.
 * @return {{drinkName: string, reason: string, ingredients: string[], instructions: string[], compatibility: string}}
 * @private
 */
function generateDynasticDrinkDynasty_(context) {
  const lineageBase = {
    italian: ['amaro', 'lambrusco reduction'],
    irish: ['triple-distilled whiskey', 'heather honey'],
    spanish: ['oloroso sherry', 'blood orange cordial'],
    japanese: ['ume plum sake', 'yuzu kosho syrup'],
    french: ['cognac', 'lavender syrup'],
    nordic: ['aquavit', 'cloudberry jam'],
    default: ['heritage rum', 'spiced panela'],
  };

  const baseSet = lineageBase[context.lineage] || lineageBase.default;
  const ratioSeed = (context.birthMonth * 100 + context.birthDay) % 10;
  const spiceLevel = ratioSeed % 5;
  const evolutionOptions = ['Ancestor Edition', 'Sibling Spin', 'Heirloom Remix', 'Legacy Lift'];
  const evolution = randomPick_(context.random, evolutionOptions);

  const reason = 'Family lineage detected as ' + context.lineage + ', guiding the base to ' + baseSet[0] +
    '. Birthday digits craft ratio seed ' + ratioSeed + ' and spice level ' + spiceLevel + ', birthing the ' + evolution + ' branch.';

  const ingredients = [
    baseSet[0] + ' - ' + (1.5 + spiceLevel * 0.1).toFixed(2) + ' oz',
    baseSet[1] + ' - ' + (1 + spiceLevel * 0.05).toFixed(2) + ' oz',
    'ancestral spice tincture - ' + spiceLevel + ' drops',
    'heritage citrus oil mist',
    'lineage bitters - ' + ((ratioSeed % 4) + 1) + ' shakes',
  ];

  const instructions = [
    'Build the dynasty layers over an engraved ice column.',
    'Stir clockwise for the elders, counter-clockwise for new heirs.',
    'Crown with heritage citrus oil and pronounce the ' + evolution + ' title.',
  ];

  return {
    drinkName: context.lastName + ' Dynasty Draught',
    reason: reason,
    ingredients: ingredients,
    instructions: instructions,
    compatibility: 'Spice lineage: level ' + spiceLevel,
  };
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Ensures the spreadsheet structure exists with appropriate headers and
 * formatting for the application.
 * @private
 */
function ensureSpreadsheetStructure_() {
  const spreadsheet = getOrCreateStorageSpreadsheet_();

  let primarySheet = spreadsheet.getSheetByName(SHEET_CONFIGURATION.primaryName);
  if (!primarySheet) {
    primarySheet = spreadsheet.insertSheet(SHEET_CONFIGURATION.primaryName);
    primarySheet.getRange(1, 1, 1, SHEET_CONFIGURATION.primaryHeaders.length).setValues([SHEET_CONFIGURATION.primaryHeaders]);
    primarySheet.setFrozenRows(1);
    primarySheet.autoResizeColumns(1, SHEET_CONFIGURATION.primaryHeaders.length);
    logVerbose_('Primary sheet created with headers.');
  }

  let votesSheet = spreadsheet.getSheetByName(SHEET_CONFIGURATION.votesName);
  if (!votesSheet) {
    votesSheet = spreadsheet.insertSheet(SHEET_CONFIGURATION.votesName);
    votesSheet.getRange(1, 1, 1, SHEET_CONFIGURATION.votesHeaders.length).setValues([SHEET_CONFIGURATION.votesHeaders]);
    votesSheet.setFrozenRows(1);
    votesSheet.autoResizeColumns(1, SHEET_CONFIGURATION.votesHeaders.length);
    logVerbose_('Vote audit sheet created with headers.');
  }
}

/**
 * Retrieves the primary sheet reference.
 * @return {GoogleAppsScript.Spreadsheet.Sheet}
 * @private
 */
function getPrimarySheet_() {
  const sheet = getOrCreateStorageSpreadsheet_().getSheetByName(SHEET_CONFIGURATION.primaryName);
  if (!sheet) {
    throw new Error('Primary sheet is missing.');
  }
  return sheet;
}

/**
 * Retrieves the vote audit sheet reference.
 * @return {GoogleAppsScript.Spreadsheet.Sheet}
 * @private
 */
function getVotesSheet_() {
  const sheet = getOrCreateStorageSpreadsheet_().getSheetByName(SHEET_CONFIGURATION.votesName);
  if (!sheet) {
    throw new Error('Vote audit sheet is missing.');
  }
  return sheet;
}

/**
 * Retrieves the storage spreadsheet, creating or rehydrating it as required.
 * This helper first attempts to use the active spreadsheet, then falls back to
 * a previously stored identifier, and finally creates a dedicated spreadsheet
 * when none is available.
 * @return {GoogleAppsScript.Spreadsheet.Spreadsheet}
 * @private
 */
function getOrCreateStorageSpreadsheet_() {
  const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (activeSpreadsheet) {
    logVerbose_('Active spreadsheet detected; using as storage backbone.', { id: activeSpreadsheet.getId() });
    persistStorageSpreadsheetId_(activeSpreadsheet.getId());
    return activeSpreadsheet;
  }

  const scriptProperties = PropertiesService.getScriptProperties();
  const storedId = scriptProperties.getProperty(STORAGE_SPREADSHEET_ID_PROPERTY);
  if (storedId) {
    try {
      const storedSpreadsheet = SpreadsheetApp.openById(storedId);
      logVerbose_('Rehydrated storage spreadsheet from script properties.', { id: storedId });
      return storedSpreadsheet;
    } catch (error) {
      logVerbose_('Failed to open stored spreadsheet identifier; creating new storage.', { id: storedId, error: String(error) });
    }
  }

  const createdSpreadsheet = SpreadsheetApp.create(APPLICATION_TITLE + ' Storage');
  logVerbose_('Created dedicated storage spreadsheet.', { id: createdSpreadsheet.getId(), url: createdSpreadsheet.getUrl() });
  persistStorageSpreadsheetId_(createdSpreadsheet.getId());
  return createdSpreadsheet;
}

/**
 * Persists the provided spreadsheet identifier to script properties for future
 * executions.
 * @param {string} spreadsheetId Identifier to persist.
 * @private
 */
function persistStorageSpreadsheetId_(spreadsheetId) {
  PropertiesService.getScriptProperties().setProperty(STORAGE_SPREADSHEET_ID_PROPERTY, spreadsheetId);
}

/**
 * Creates a deterministic pseudo-random number generator using the provided
 * string seed.
 * @param {string} seed Seed value derived from the request context.
 * @return {function(): number}
 * @private
 */
function createDeterministicRandom_(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/**
 * Selects a unique subset of options using the provided random function.
 * @param {function(): number} random Random function.
 * @param {string[]} options Source options.
 * @param {number} count Number of unique selections desired.
 * @return {string[]} Selection of unique options.
 * @private
 */
function buildUniqueSelection_(random, options, count) {
  const available = options.slice();
  const selection = [];
  while (selection.length < count && available.length > 0) {
    const index = Math.floor(random() * available.length);
    selection.push(available.splice(index, 1)[0]);
  }
  return selection;
}

/**
 * Picks a random element from an array using the provided random generator.
 * @param {function(): number} random Random function.
 * @param {Array<*>} collection Collection to choose from.
 * @return {*} Selected element.
 * @private
 */
function randomPick_(random, collection) {
  if (!collection || !collection.length) {
    return null;
  }
  const index = Math.floor(random() * collection.length);
  return collection[index];
}

/**
 * Computes numerology value by reducing alphabetical characters to a single
 * digit.
 * @param {string} text Input text.
 * @return {number} Numerology value between 1 and 9.
 * @private
 */
function computeNumerologyValue_(text) {
  const sanitized = text.toUpperCase().replace(/[^A-Z]/g, '');
  let total = 0;
  for (let i = 0; i < sanitized.length; i++) {
    total += sanitized.charCodeAt(i) - 64;
  }
  while (total > 9) {
    total = total
      .toString()
      .split('')
      .reduce(function (acc, digit) {
        return acc + Number(digit);
      }, 0);
  }
  return Math.max(1, total);
}

/**
 * Builds a description of flavors inspired by user initials.
 * @param {string} initials User initials.
 * @return {string} Flavor description.
 * @private
 */
function buildInitialsFlavor_(initials) {
  const mapping = {
    A: 'almond and apricot spark',
    B: 'bourbon bark balance',
    C: 'cacao and citrus pop',
    D: 'dragonfruit dynamism',
    E: 'elderflower echo',
    F: 'fig and fennel warmth',
    G: 'grapefruit glow',
    H: 'hibiscus hum',
    I: 'iris ice intrigue',
    J: 'juniper jazz',
    K: 'kumquat kick',
    L: 'lemongrass lift',
    M: 'minted meteor trail',
    N: 'nutmeg nuance',
    O: 'orchid opulence',
    P: 'peppercorn pulse',
    Q: 'quince quickstep',
    R: 'rosewater radiance',
    S: 'saffron spark',
    T: 'tamarind twist',
    U: 'ume uplift',
    V: 'vermouth velvet',
    W: 'walnut wonder',
    X: 'xocolatl excitement',
    Y: 'yuzu yearn',
    Z: 'zest zenith',
  };

  return initials
    .split('')
    .map(function (initial) {
      return mapping[initial] || 'starlit surprise';
    })
    .join(' & ');
}

/**
 * Determines the zodiac sign and supportive traits for the provided date.
 * @param {number} month Birth month.
 * @param {number} day Birth day.
 * @return {{sign: string, element: string, signatureSpirit: string, accentNotes: string[], garnishes: string[]}}
 * @private
 */
function getZodiacProfile_(month, day) {
  const profiles = [
    { sign: 'Capricorn', start: '12-22', end: '01-19', element: 'Earth', signatureSpirit: 'smoky scotch', accentNotes: ['black walnut', 'roasted barley', 'cocoa bitters'], garnishes: ['candied ginger', 'charred rosemary'] },
    { sign: 'Aquarius', start: '01-20', end: '02-18', element: 'Air', signatureSpirit: 'aquavit', accentNotes: ['violet liqueur', 'sparkling sake', 'blue citrus'], garnishes: ['edible flower constellation', 'citrus spiral'] },
    { sign: 'Pisces', start: '02-19', end: '03-20', element: 'Water', signatureSpirit: 'silver rum', accentNotes: ['elderflower', 'sea-salt caramel', 'cucumber essence'], garnishes: ['lotus petal', 'sea mist'] },
    { sign: 'Aries', start: '03-21', end: '04-19', element: 'Fire', signatureSpirit: 'pepper tequila', accentNotes: ['ancho chile', 'blood orange', 'ginger fire'], garnishes: ['flamed citrus peel', 'pimentón rim'] },
    { sign: 'Taurus', start: '04-20', end: '05-20', element: 'Earth', signatureSpirit: 'bourbon', accentNotes: ['vanilla bean', 'toasted pecan', 'fig syrup'], garnishes: ['cocoa-dusted leaf', 'torched thyme'] },
    { sign: 'Gemini', start: '05-21', end: '06-20', element: 'Air', signatureSpirit: 'gin', accentNotes: ['citrus mist', 'white tea', 'champagne cordial'], garnishes: ['lemon twist', 'sugar shard'] },
    { sign: 'Cancer', start: '06-21', end: '07-22', element: 'Water', signatureSpirit: 'dark rum', accentNotes: ['coconut cream', 'hibiscus', 'molasses'], garnishes: ['tropical flower', 'toasted coconut'] },
    { sign: 'Leo', start: '07-23', end: '08-22', element: 'Fire', signatureSpirit: 'spiced rum', accentNotes: ['passionfruit', 'saffron honey', 'cinnamon blaze'], garnishes: ['golden mango fan', 'sparkler sugar rim'] },
    { sign: 'Virgo', start: '08-23', end: '09-22', element: 'Earth', signatureSpirit: 'herbal vermouth', accentNotes: ['green apple', 'sage dew', 'white pepper'], garnishes: ['apple ribbon', 'sage leaf'] },
    { sign: 'Libra', start: '09-23', end: '10-22', element: 'Air', signatureSpirit: 'sparkling rosé', accentNotes: ['lavender', 'pink peppercorn', 'pear nectar'], garnishes: ['rose petal', 'sugar lace'] },
    { sign: 'Scorpio', start: '10-23', end: '11-21', element: 'Water', signatureSpirit: 'mezcal', accentNotes: ['blackberry smoke', 'cocoa nib', 'charred citrus'], garnishes: ['obsidian salt rim', 'cocoa mist'] },
    { sign: 'Sagittarius', start: '11-22', end: '12-21', element: 'Fire', signatureSpirit: 'rye whiskey', accentNotes: ['spiced maple', 'cranberry flame', 'ginger snap'], garnishes: ['sparked cinnamon stick', 'dried orange wheel'] },
  ];

  var target = new Date(2000, month - 1, day);
  for (var i = 0; i < profiles.length; i++) {
    var profile = profiles[i];
    var startParts = profile.start.split('-');
    var endParts = profile.end.split('-');
    var startDate = new Date(2000, Number(startParts[0]) - 1, Number(startParts[1]));
    var endDate = new Date(2000, Number(endParts[0]) - 1, Number(endParts[1]));

    if (startDate <= endDate) {
      if (target >= startDate && target <= endDate) {
        return profile;
      }
    } else {
      if (target >= startDate || target <= endDate) {
        return profile;
      }
    }
  }

  return profiles[0];
}

/**
 * Infers likely lineage from the last name.
 * @param {string} lastName Last name provided by the user.
 * @return {string} Inferred lineage keyword.
 * @private
 */
function inferLineage_(lastName) {
  const lower = lastName.toLowerCase();
  if (/ini$|one$|etti$/.test(lower)) {
    return 'italian';
  }
  if (/^o'|^mc|^mac|han$/.test(lower)) {
    return 'irish';
  }
  if (/ez$|es$|ado$|illo$/.test(lower)) {
    return 'spanish';
  }
  if (/^ito$|^shi$|moto$|sato$/.test(lower) || /-san$/.test(lower)) {
    return 'japanese';
  }
  if (/eau$|ette$|mont$|eux$/.test(lower)) {
    return 'french';
  }
  if (/sen$|son$|gaard$|strom$/.test(lower)) {
    return 'nordic';
  }
  return 'default';
}

/**
 * Infers a birth season string from the month number.
 * @param {number} month Birth month.
 * @return {string} Season label.
 * @private
 */
function inferBirthSeason_(month) {
  if ([12, 1, 2].indexOf(month) !== -1) {
    return 'winter';
  }
  if ([3, 4, 5].indexOf(month) !== -1) {
    return 'spring';
  }
  if ([6, 7, 8].indexOf(month) !== -1) {
    return 'summer';
  }
  return 'autumn';
}

/**
 * Provides standardized, verbose logging for debugging.
 * @param {string} message Descriptive message.
 * @param {*} [data] Optional additional data.
 * @private
 */
function logVerbose_(message, data) {
  if (data === undefined) {
    Logger.log('[MythicMixology] %s', message);
  } else {
    try {
      var serialized = typeof data === 'string' ? data : JSON.stringify(data);
      Logger.log('[MythicMixology] %s :: %s', message, serialized);
    } catch (error) {
      Logger.log('[MythicMixology] %s :: [unserializable data]', message);
    }
  }
}
