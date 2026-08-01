export interface KeyboardShortcut {
  keys: string[];
  description: string;
}

export interface KeyboardShortcutGroup {
  title: string;
  shortcuts: KeyboardShortcut[];
}

export const keyboardShortcutGroups: KeyboardShortcutGroup[] = [
  {
    title: 'Navigate',
    shortcuts: [
      { keys: ['J'], description: 'Move to the next article' },
      { keys: ['K'], description: 'Move to the previous article' },
      { keys: ['O', 'Enter'], description: 'Open the focused article' },
    ],
  },
  {
    title: 'Article actions',
    shortcuts: [
      { keys: ['S'], description: 'Star or unstar the focused article' },
      { keys: ['M'], description: 'Mark the focused article as read' },
    ],
  },
  {
    title: 'Anywhere',
    shortcuts: [
      { keys: ['/'], description: 'Focus search' },
      { keys: ['?'], description: 'Show keyboard shortcuts' },
      { keys: ['Esc'], description: 'Close the article or active dialog' },
    ],
  },
];
