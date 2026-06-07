import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ArticlePlaceholder } from './ArticlePlaceholder.js';
import { FolderPicker } from './FolderPicker.js';
import { InlineEdit } from './InlineEdit.js';

describe('shared components', () => {
  it('renders placeholder variants with deterministic branding', () => {
    const { rerender, container } = render(
      <ArticlePlaceholder size="hero" className="extra" seed="alpha" />,
    );

    expect(screen.getByRole('img', { name: 'lede' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'lede' }).textContent).toContain('lede.');
    expect(screen.getByText('No image available')).toBeInTheDocument();
    expect(container.querySelector('.extra')).toBeInTheDocument();

    rerender(<ArticlePlaceholder size="thumb" seed="alpha" />);
    expect(screen.getByRole('img', { name: 'lede' }).textContent).not.toContain('lede.');

    rerender(<ArticlePlaceholder size="card" seed="beta" />);
    expect(screen.getByRole('img', { name: 'lede' }).textContent).toContain('lede.');

    rerender(<ArticlePlaceholder />);
    expect(screen.getByRole('img', { name: 'lede' }).className).toContain('overflow-hidden');
  });

  it('flattens nested folders and reports selection changes', () => {
    const onChange = vi.fn();

    render(
      <FolderPicker
        folders={[
          {
            id: 'folder-1',
            name: 'Tech',
            children: [
              {
                id: 'folder-2',
                name: 'AI',
                children: [],
              },
            ],
          },
        ] as any}
        value={null}
        onChange={onChange}
        className="picker"
      />,
    );

    const select = screen.getByRole('combobox');
    expect(select.className).toContain('picker');
    expect(screen.getByRole('option', { name: 'No folder' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Tech' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /AI/ })).toBeInTheDocument();

    fireEvent.change(select, { target: { value: 'folder-2' } });
    fireEvent.change(select, { target: { value: '' } });

    expect(onChange).toHaveBeenNthCalledWith(1, 'folder-2');
    expect(onChange).toHaveBeenNthCalledWith(2, null);
  });

  it('renders folder pickers without custom classes and without nested children', () => {
    const onChange = vi.fn();

    render(
      <FolderPicker
        folders={[{ id: 'folder-3', name: 'Solo', children: [] }] as any}
        value="folder-3"
        onChange={onChange}
      />,
    );

    const select = screen.getByRole('combobox');
    expect(select.className).toContain('text-text-primary');
    expect(select).toHaveValue('folder-3');
    expect(screen.getByRole('option', { name: 'Solo' })).toBeInTheDocument();
  });

  it('handles inline edit save, cancel, enter, escape, and blur behaviors', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();

    const { rerender } = render(
      <InlineEdit value="Original" onSave={onSave} onCancel={onCancel} />,
    );

    const input = screen.getByDisplayValue('Original');
    expect(document.activeElement).toBe(input);

    fireEvent.change(input, { target: { value: '  Updated  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSave).toHaveBeenCalledWith('Updated');

    rerender(<InlineEdit key="second" value="Original" onSave={onSave} onCancel={onCancel} />);
    const unchanged = screen.getByDisplayValue('Original');
    fireEvent.blur(unchanged);
    expect(onCancel).toHaveBeenCalled();

    fireEvent.keyDown(unchanged, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
