export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  isTyping?: boolean;
  sourcesCount?: number;
  isError?: boolean;
}
