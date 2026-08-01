import { useState, useRef, useEffect } from 'react';

interface Props {
  value: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}

export function InlineEdit({ value, onSave, onCancel }: Props) {
  const [text, setText] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    } else {
      onCancel();
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={handleSubmit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') handleSubmit();
        if (e.key === 'Escape') onCancel();
      }}
      className="w-full px-1.5 py-0.5 text-sm bg-surface border border-primary-400 rounded text-text-primary focus:outline-none"
    />
  );
}
