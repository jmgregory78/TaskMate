export async function suggestTaskIcon(taskName: string): Promise<string> {
  console.log('[iconService] Calling API for task:', taskName);
  console.log('[iconService] API key present:', !!process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [
          {
            role: 'user',
            content: `Reply with a single emoji that best represents this home maintenance task: "${taskName}". Reply with ONLY the emoji, nothing else.`
          }
        ]
      })
    });

    console.log('[iconService] Response status:', response.status);

    const rawText = await response.text();
    console.log('[iconService] Raw response:', rawText);

    if (!response.ok) {
      console.log('[iconService] API error - status:', response.status, 'body:', rawText);
      return '📋';
    }

    const data = JSON.parse(rawText);
    console.log('[iconService] Parsed response:', JSON.stringify(data));

    const emoji = data.content?.[0]?.text?.trim();
    console.log('[iconService] Extracted emoji:', emoji);

    if (emoji && emoji.length <= 4 && /\p{Emoji}/u.test(emoji)) {
      console.log('[iconService] Success! Returning emoji:', emoji);
      return emoji;
    }

    console.log('[iconService] Emoji validation failed, returning default');
    return '📋';
  } catch (error) {
    console.log('[iconService] Caught error:', error);
    console.log('[iconService] Error name:', error instanceof Error ? error.name : 'unknown');
    console.log('[iconService] Error message:', error instanceof Error ? error.message : String(error));
    console.log('[iconService] Error stack:', error instanceof Error ? error.stack : 'no stack');
    return '📋';
  }
}
