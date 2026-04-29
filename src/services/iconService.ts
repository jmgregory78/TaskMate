export async function suggestTaskIcon(taskName: string): Promise<string> {
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
            content: `Reply with a single emoji that best represents this home maintenance task: "${taskName}". Reply with ONLY the emoji, nothing else.`,
          },
        ],
      }),
    });
    const data = await response.json();
    const emoji = data.content?.[0]?.text?.trim();
    if (emoji && emoji.length <= 4 && /\p{Emoji}/u.test(emoji)) {
      return emoji;
    }
    return '📋';
  } catch {
    return '📋';
  }
}
