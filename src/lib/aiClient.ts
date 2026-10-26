const BYNARA_API_KEY = 'sk-nry-3tcfxFdikFwpg2_-MjB_xUolLehSgSndqIIv9Cn5d_0';
const BYNARA_ENDPOINT = 'https://router.bynara.id/v1/chat/completions';
const GROQ_API_KEY = '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';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
/** Text-only chat — uses Groq (fast & reliable) with ByNara fallback */
export async function generateChatResponse(prompt: string): Promise<string> {
  // Try Groq first
  try {
    const res = await fetchWithTimeout(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }),
      timeout: 30000,
    });

    if (res.ok) {
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text;
      if (content) return content;
    }
  } catch (err) {
    console.warn('Groq gpt-oss-120b failed, trying qwen3.8-27b...', err);
  }

  // Fallback 1: Groq Qwen
  try {
    const res = await fetchWithTimeout(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'qwen/qwen3.8-27b',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }),
      timeout: 30000,
    });

    if (res.ok) {
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text;
      if (content) return content;
    }
  } catch (err) {
    console.warn('Groq qwen3.8-27b failed...', err);
  }

  // Fallback 2: ByNara
  const bynaraModels = ['agnes-2.5-flash', 'mimo-v2.6-flash', 'gpt-5.6-luna'];
  for (const model of bynaraModels) {
    try {
      const res = await fetchWithTimeout(BYNARA_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${BYNARA_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
        }),
        timeout: 25000,
      });

      if (res.ok) {
        const data = await res.json();
        const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text;
        if (content) return content;
      }
    } catch {
      // try next
    }
  }

  throw new Error('All AI chat providers failed. Please check your network connection and API keys.');
}

async function fetchWithTimeout(url: string, options: RequestInit & { timeout?: number }): Promise<Response> {
  const ms = options.timeout ?? 30000;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

/**
 * Extract the first complete JSON array from a string using bracket-depth matching.
 * Strips <think> tags first. Returns null if no valid array found.
 */
export function extractFirstJsonArray(text: string): string | null {
  const cleaned = text.replace(/<\/?think>/g, '').trim();
  const start = cleaned.indexOf('[');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === '[') depth++;
    else if (cleaned[i] === ']') {
      depth--;
      if (depth === 0) return cleaned.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Vision request — tries ByNara multimodal models first, falls back to Groq/Qwen.
 * @param prompt   Instruction text
 * @param imageSource  data:image/jpeg;base64,… or https://… URL
 */
export async function generateImageResponse(
  prompt: string,
  imageSource: string
): Promise<string> {
  const imageUrl = imageSource.startsWith('data:') || imageSource.startsWith('http')
    ? imageSource
    : `data:image/jpeg;base64,${imageSource}`;

  const imageContent = { type: 'image_url' as const, image_url: { url: imageUrl } };
  const textContent = { type: 'text' as const, text: prompt };
  const baseBody = { messages: [{ role: 'user' as const, content: [textContent, imageContent] }], temperature: 0.2, max_tokens: 4096, stream: false };

  // Try Groq Vision first (fast & reliable)
  try {
    const res = await fetchWithTimeout(GROQ_ENDPOINT, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...baseBody, model: 'qwen/qwen3.8-27b', max_completion_tokens: 4096 }),
      timeout: 30000,
    });

    if (res.ok) {
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? '';
      if (content) return content;
    }
  } catch (e) {
    console.warn('Groq Vision failed, falling back to ByNara...', e);
  }

  // Fallback to ByNara multimodal models
  const bynaraModels = ['mimo-v2.6-flash', 'agnes-2.5-flash', 'qwen3.8-max'];
  for (const model of bynaraModels) {
    try {
      const res = await fetchWithTimeout(BYNARA_ENDPOINT, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${BYNARA_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...baseBody, model }),
        timeout: 25000,
      });
      if (res.ok) {
        const data = await res.json();
        const content = data?.choices?.[0]?.message?.content ?? '';
        if (content) return content;
      }
    } catch { /* try next model */ }
  }

  throw new Error('All vision AI providers failed. Please check your image format and network.');
}


