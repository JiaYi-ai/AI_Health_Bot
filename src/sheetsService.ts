import { SymptomDetails } from './symptomsData';

// Helper to split text by newline into trim array of strings
const parseMultiline = (text: string | undefined): string[] => {
  if (!text) return [];
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
};

// Helper to format string array to newline separated
const formatMultiline = (lines: string[]): string => {
  return (lines || []).join('\n');
};

// Helper to parse synonyms separated by commas
const parseSynonyms = (text: string | undefined): string[] => {
  if (!text) return [];
  return text
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(item => item.length > 0);
};

// Helper to format synonyms
const formatSynonyms = (items: string[]): string => {
  return (items || []).join(', ');
};

/**
 * Create a new spreadsheet with Symptoms and Questions tabs
 * and populate it with the default template data.
 */
export async function createTemplateSpreadsheet(
  accessToken: string,
  defaultSymptoms: SymptomDetails[]
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  // 1. Create spreadsheet structure
  const createResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      properties: {
        title: 'AI Symptom Checker Database',
      },
      sheets: [
        {
          properties: {
            title: 'Symptoms',
            gridProperties: {
              columnCount: 6,
              frozenRowCount: 1,
            },
          },
        },
        {
          properties: {
            title: 'Questions',
            gridProperties: {
              columnCount: 5,
              frozenRowCount: 1,
            },
          },
        },
      ],
    }),
  });

  if (!createResponse.ok) {
    const errText = await createResponse.text();
    throw new Error(`Failed to create spreadsheet: ${createResponse.statusText} (${errText})`);
  }

  const spreadsheet = await createResponse.json();
  const spreadsheetId = spreadsheet.spreadsheetId;
  const spreadsheetUrl = spreadsheet.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  // 2. Format database into rows and write them
  await pushDatabaseToSpreadsheet(accessToken, spreadsheetId, defaultSymptoms);

  return { spreadsheetId, spreadsheetUrl };
}

/**
 * Overwrite the spreadsheet with the current list of symptoms and questions.
 */
export async function pushDatabaseToSpreadsheet(
  accessToken: string,
  spreadsheetId: string,
  symptoms: SymptomDetails[]
): Promise<void> {
  const headersSymptoms = ['id', 'name', 'causes', 'careAdvice', 'doctorTriggers', 'synonyms'];
  const rowsSymptoms = [headersSymptoms];

  const headersQuestions = ['symptomId', 'id', 'text', 'type', 'unit'];
  const rowsQuestions = [headersQuestions];

  for (const sym of symptoms) {
    rowsSymptoms.push([
      sym.id,
      sym.name,
      formatMultiline(sym.causes),
      formatMultiline(sym.careAdvice),
      formatMultiline(sym.doctorTriggers),
      formatSynonyms(sym.synonyms),
    ]);

    for (const q of sym.questions) {
      rowsQuestions.push([
        sym.id,
        q.id,
        q.text,
        q.type,
        q.unit || '',
      ]);
    }
  }

  // Clear existing content in tabs to avoid leftover rows
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Symptoms!A:Z:clear`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: '{}',
  });

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Questions!A:Z:clear`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: '{}',
  });

  // Write new values back to Symptoms
  const symptomsResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Symptoms!A:F?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        range: 'Symptoms!A:F',
        majorDimension: 'ROWS',
        values: rowsSymptoms,
      }),
    }
  );

  if (!symptomsResponse.ok) {
    const errText = await symptomsResponse.text();
    throw new Error(`Failed to write Symptoms to Google Sheets: ${errText}`);
  }

  // Write new values back to Questions
  const questionsResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Questions!A:E?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        range: 'Questions!A:E',
        majorDimension: 'ROWS',
        values: rowsQuestions,
      }),
    }
  );

  if (!questionsResponse.ok) {
    const errText = await questionsResponse.text();
    throw new Error(`Failed to write Questions to Google Sheets: ${errText}`);
  }
}

/**
 * Fetch and construct the active symptoms database from the given Google Spreadsheet.
 */
export async function fetchDatabaseFromSpreadsheet(
  accessToken: string,
  spreadsheetId: string
): Promise<SymptomDetails[]> {
  // Fetch Symptoms
  const sRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Symptoms!A2:F500`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!sRes.ok) {
    const text = await sRes.text();
    throw new Error(`Unable to fetch 'Symptoms' sheet tab rows: ${sRes.statusText}. Please verify the tab exists and contains columns: id, name, causes, careAdvice, doctorTriggers, synonyms.`);
  }

  const sData = await sRes.json();
  const rawSymptoms: string[][] = sData.values || [];

  // Fetch Questions
  const qRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Questions!A2:E500`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!qRes.ok) {
    const text = await qRes.text();
    throw new Error(`Unable to fetch 'Questions' sheet tab rows: ${qRes.statusText}. Please verify the tab exists and contains columns: symptomId, id, text, type, unit.`);
  }

  const qData = await qRes.json();
  const rawQuestions: string[][] = qData.values || [];

  // Re-build questions list map
  const questionMap: Record<string, SymptomDetails['questions']> = {};
  for (const row of rawQuestions) {
    const [symptomId, qId, qText, qType, qUnit] = row;
    if (!symptomId || !qId || !qText) continue;

    if (!questionMap[symptomId]) {
      questionMap[symptomId] = [];
    }

    // Push the parsed question object
    questionMap[symptomId].push({
      id: qId.trim(),
      text: qText.trim(),
      type: (qType?.trim().toLowerCase() === 'number' ? 'number' : 'boolean') as 'number' | 'boolean',
      unit: qUnit ? qUnit.trim() : undefined,
    });
  }

  // Reconstruct symptoms items
  const symptoms: SymptomDetails[] = [];
  for (const row of rawSymptoms) {
    const [id, name, causesRaw, careAdviceRaw, doctorTriggersRaw, synonymsRaw] = row;
    if (!id || !name) continue;

    const symId = id.trim();
    symptoms.push({
      id: symId,
      name: name.trim(),
      causes: parseMultiline(causesRaw),
      careAdvice: parseMultiline(careAdviceRaw),
      doctorTriggers: parseMultiline(doctorTriggersRaw),
      synonyms: parseSynonyms(synonymsRaw),
      questions: questionMap[symId] || [],
    });
  }

  if (symptoms.length === 0) {
    throw new Error("No valid symptoms found in the spreadsheet. Make sure rows exist under the headers.");
  }

  return symptoms;
}
