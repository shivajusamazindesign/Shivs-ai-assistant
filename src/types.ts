export interface Project {
  id: string;
  title: string;
  category: string;
  description: string;
  tags: string[];
  link?: string;
  imageUrl?: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}
