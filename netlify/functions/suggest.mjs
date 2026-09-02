const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent';

export const handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'API key not configured on server' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { category, existingParticipants, count } = body;

    if (!category || typeof count !== 'number' || count <= 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid request: category and count are required' }),
      };
    }

    const existing = Array.isArray(existingParticipants) ? existingParticipants : [];

    let prompt = 'Generate exactly ' + count + ' unique participants for a "' + category + '" tournament bracket.';
    if (existing.length > 0) {
      prompt += '\nThe following are already in the bracket — do NOT repeat these: ' + existing.join(', ');
    }
    prompt += '\nReturn ONLY a JSON array of strings, e.g. ["item1", "item2", ...].';
    prompt += '\nNo explanation, no markdown, just the JSON array.';

    const response = await fetch(GEMINI_URL + '?key=' + apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: 'You are a helpful assistant that generates suggestions for tournament brackets. Respond only with a JSON array of strings.\n\n' + prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 2048,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: 'Gemini error: ' + errorText }),
      };
    }

    const data = await response.json();
    const content = data.candidates && data.candidates[0] && data.candidates[0].content
      && data.candidates[0].content.parts && data.candidates[0].content.parts[0]
      && data.candidates[0].content.parts[0].text
      ? data.candidates[0].content.parts[0].text.trim()
      : null;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: content }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Unknown error' }),
    };
  }
};
