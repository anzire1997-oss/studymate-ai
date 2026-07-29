const BYNARA_API_KEY = 'sk-nry-YXSWVeM9fCwknumWgdeCwbXSAPpRR2dWP2f_2PrfT9E';
const BYNARA_ENDPOINT = 'https://router.bynara.id/v1/chat/completions';
const GROQ_API_KEY = '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';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
/** Text-only chat via ByNara (Mistral) */
export async function generateChatResponse(prompt: string): Promise<string> {
  const response = await fetch(BYNARA_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${BYNARA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'mistral-large',
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('ByNara API error', response.status, errorText);
    throw new Error(`ByNara API request failed with status ${response.status}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? '';
}

/**
 * Vision request via ByNara — uses OpenAI-compatible image_url format.
 * @param prompt   Instruction text
 * @param imageSource  data:image/jpeg;base64,… or https://… URL
 */
export async function generateImageResponse(
  prompt: string,
  imageSource: string
): Promise<string> {
  // Ensure the image is a proper data URI
  const imageUrl = imageSource.startsWith('data:') || imageSource.startsWith('http')
    ? imageSource
    : `data:image/jpeg;base64,${imageSource}`;

  const response = await fetch(GROQ_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
      temperature: 0.2,
      max_completion_tokens: 4096,
      top_p: 1,
      stream: false,
      stop: null,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Groq Vision API error', response.status, errorText);
    throw new Error(`Groq Vision request failed: ${response.status} — ${errorText}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? '';
}


