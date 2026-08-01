import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnotatedContent } from './AnnotatedContent.js';

const mocks = vi.hoisted(() => ({
  useAnnotationsMock: vi.fn(),
  createMutate: vi.fn(),
  updateMutate: vi.fn(),
  deleteMutate: vi.fn(),
}));

vi.mock('../../hooks/use-annotations.js', () => ({
  useAnnotations: (...args: unknown[]) => mocks.useAnnotationsMock(...args),
  useCreateAnnotation: () => ({ mutate: mocks.createMutate }),
  useUpdateAnnotation: () => ({ mutate: mocks.updateMutate }),
  useDeleteAnnotation: () => ({ mutate: mocks.deleteMutate }),
}));

function buildAnnotation(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'annotation-1',
    userId: 'user-1',
    articleId: 'article-1',
    type: 'highlight' as const,
    content: null,
    startOffset: 0,
    endOffset: 5,
    color: '#FBBF24',
    createdAt: '2026-06-06T10:00:00.000Z',
    updatedAt: '2026-06-06T10:00:00.000Z',
    ...overrides,
  };
}

function setSelection({
  root,
  startNode,
  startOffset,
  endNode,
  endOffset,
  text,
  collapsed = false,
}: {
  root: HTMLElement;
  startNode: Node;
  startOffset: number;
  endNode: Node;
  endOffset: number;
  text: string;
  collapsed?: boolean;
}) {
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  Object.defineProperty(range, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      left: 40,
      top: 60,
      width: 20,
      height: 12,
      right: 60,
      bottom: 72,
      x: 40,
      y: 60,
      toJSON: () => ({}),
    }),
  });

  const selection = {
    isCollapsed: collapsed,
    getRangeAt: vi.fn(() => range),
    toString: vi.fn(() => text),
    removeAllRanges: vi.fn(),
  };

  Object.defineProperty(window, 'getSelection', {
    configurable: true,
    value: () => selection,
  });
  Object.defineProperty(root.parentElement!, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      left: 0,
      top: 0,
      width: 300,
      height: 300,
      right: 300,
      bottom: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });

  return selection;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  mocks.useAnnotationsMock.mockReturnValue({ data: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AnnotatedContent', () => {
  it('renders existing highlight and note annotations, including fallback wrapping across nodes', async () => {
    mocks.useAnnotationsMock.mockReturnValue({
      data: [
        buildAnnotation({
          id: 'highlight-1',
          startOffset: 0,
          endOffset: 11,
          color: '#34D399',
        }),
        buildAnnotation({
          id: 'note-1',
          type: 'note',
          content: 'Remember this',
          startOffset: 12,
          endOffset: 22,
          color: '#60A5FA',
        }),
      ],
    });

    const { container } = render(
      <AnnotatedContent
        articleId="article-1"
        html="<p>Hello <strong>world</strong> note text here.</p>"
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('[data-annotation-id="highlight-1"]')).toBeTruthy();
      expect(container.querySelector('[data-annotation-id="note-1"]')).toBeTruthy();
    });

    const highlight = container.querySelector('[data-annotation-id="highlight-1"]') as HTMLElement;
    const note = container.querySelector('[data-annotation-id="note-1"]') as HTMLElement;
    expect(highlight.tagName).toBe('MARK');
    expect(highlight.style.backgroundColor).toBeTruthy();
    expect(note.querySelector('[data-note-indicator="true"]')).toBeTruthy();
  });

  it('cleans legacy wrappers and falls back when note annotations span element boundaries', async () => {
    mocks.useAnnotationsMock.mockReturnValue({
      data: [
        buildAnnotation({
          id: 'cross-node-note',
          type: 'note',
          content: 'Cross node note',
          startOffset: 0,
          endOffset: 11,
          color: '#60A5FA',
        }),
      ],
    });

    const { container } = render(
      <AnnotatedContent
        articleId="article-1"
        html="<p>Hello <strong>world</strong> again.</p><span data-annotation-id='legacy'><em>legacy</em></span>"
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('[data-annotation-id="legacy"]')).toBeNull();
      expect(container.querySelector('[data-annotation-id="cross-node-note"]')).toBeTruthy();
    });

    expect(container.querySelector('[data-annotation-id="cross-node-note"] [data-note-indicator="true"]')).toBeTruthy();
    expect(container).toHaveTextContent('legacy');
  });

  it('creates highlights and notes from text selections and ignores collapsed selections', async () => {
    const { container, unmount } = render(
      <AnnotatedContent articleId="article-1" html="<p>Hello world text.</p>" />,
    );

    const content = container.querySelector('.article-content') as HTMLElement;
    const textNode = content.querySelector('p')!.firstChild as Text;

    setSelection({
      root: content,
      startNode: textNode,
      startOffset: 0,
      endNode: textNode,
      endOffset: 5,
      text: 'Hello',
    });

    fireEvent.mouseUp(content);
    expect(await screen.findByRole('button', { name: 'Highlight' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Highlight' }));
    expect(mocks.createMutate).toHaveBeenCalledWith({
      articleId: 'article-1',
      type: 'highlight',
      content: 'Hello',
      startOffset: 0,
      endOffset: 5,
      color: '#FBBF24',
    });

    unmount();

    const secondRender = render(
      <AnnotatedContent articleId="article-1" html="<p>Hello world text.</p>" />,
    );
    const secondContent = secondRender.container.querySelector('.article-content') as HTMLElement;
    const secondTextNode = secondContent.querySelector('p')!.firstChild as Text;

    setSelection({
      root: secondContent,
      startNode: secondTextNode,
      startOffset: 6,
      endNode: secondTextNode,
      endOffset: 11,
      text: 'world',
    });

    fireEvent.mouseUp(secondContent);
    fireEvent.click(screen.getByRole('button', { name: 'Choose color' }));
    fireEvent.click(screen.getByTitle('Pink'));
    expect(mocks.createMutate).toHaveBeenCalledWith({
      articleId: 'article-1',
      type: 'highlight',
      content: 'world',
      startOffset: 6,
      endOffset: 11,
      color: '#F472B6',
    });

    secondRender.unmount();

    const thirdRender = render(
      <AnnotatedContent articleId="article-1" html="<p>Hello world text.</p>" />,
    );
    const thirdContent = thirdRender.container.querySelector('.article-content') as HTMLElement;
    const thirdTextNode = thirdContent.querySelector('p')!.firstChild as Text;

    setSelection({
      root: thirdContent,
      startNode: thirdTextNode,
      startOffset: 12,
      endNode: thirdTextNode,
      endOffset: 16,
      text: 'text',
    });

    fireEvent.mouseUp(thirdContent);
    fireEvent.click(screen.getByRole('button', { name: 'Note' }));
    fireEvent.click(screen.getByTitle('Purple'));
    fireEvent.change(screen.getByPlaceholderText('Write a note...'), { target: { value: '  Keep this  ' } });
    fireEvent.keyDown(screen.getByPlaceholderText('Write a note...'), { key: 'Enter' });

    expect(mocks.createMutate).toHaveBeenCalledWith({
      articleId: 'article-1',
      type: 'note',
      content: 'Keep this',
      startOffset: 12,
      endOffset: 16,
      color: '#A78BFA',
    });

    thirdRender.unmount();

    const fourthRender = render(
      <AnnotatedContent articleId="article-1" html="<p>Hello world text.</p>" />,
    );
    const fourthContent = fourthRender.container.querySelector('.article-content') as HTMLElement;
    const fourthTextNode = fourthContent.querySelector('p')!.firstChild as Text;

    setSelection({
      root: fourthContent,
      startNode: fourthTextNode,
      startOffset: 0,
      endNode: fourthTextNode,
      endOffset: 0,
      text: '',
      collapsed: true,
    });
    fireEvent.mouseUp(fourthContent);
    expect(screen.queryByPlaceholderText('Write a note...')).not.toBeInTheDocument();
  });

  it('opens the annotation popover, updates color and note content, removes annotations, and closes on outside clicks', async () => {
    mocks.useAnnotationsMock.mockReturnValue({
      data: [
        buildAnnotation({
          id: 'note-1',
          type: 'note',
          content: 'Original note',
          startOffset: 0,
          endOffset: 5,
          color: '#60A5FA',
        }),
      ],
    });

    const { container } = render(
      <AnnotatedContent articleId="article-1" html="<p>Hello world text.</p>" />,
    );

    await waitFor(() => {
      expect(container.querySelector('[data-annotation-id="note-1"]')).toBeTruthy();
    });

    const annotationEl = container.querySelector('[data-annotation-id="note-1"]') as HTMLElement;
    Object.defineProperty(annotationEl, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 10,
        top: 20,
        width: 30,
        height: 10,
        right: 40,
        bottom: 30,
        x: 10,
        y: 20,
        toJSON: () => ({}),
      }),
    });

    const removeAllRanges = vi.fn();
    vi.spyOn(window, 'getSelection').mockReturnValue({ removeAllRanges } as never);

    fireEvent.click(annotationEl);
    expect(removeAllRanges).toHaveBeenCalled();
    expect(await screen.findByText('Original note')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Green'));
    expect(mocks.updateMutate).toHaveBeenCalledWith({
      annotationId: 'note-1',
      articleId: 'article-1',
      data: { color: '#34D399' },
    });

    fireEvent.click(screen.getByText('Original note'));
    const editArea = await screen.findByDisplayValue('Original note');
    fireEvent.change(editArea, { target: { value: '  Updated note  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(mocks.updateMutate).toHaveBeenCalledWith({
      annotationId: 'note-1',
      articleId: 'article-1',
      data: { content: 'Updated note' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(mocks.deleteMutate).toHaveBeenCalledWith({
      annotationId: 'note-1',
      articleId: 'article-1',
    });

    fireEvent.mouseDown(document.body);
    expect(screen.queryByText('Original note')).not.toBeInTheDocument();
  });

  it('closes the annotation popover when clicking outside it', async () => {
    mocks.useAnnotationsMock.mockReturnValue({
      data: [
        buildAnnotation({
          id: 'note-close',
          type: 'note',
          content: 'Close me',
          startOffset: 0,
          endOffset: 5,
          color: '#60A5FA',
        }),
      ],
    });

    const { container } = render(
      <AnnotatedContent articleId="article-1" html="<p>Hello world text.</p>" />,
    );

    await waitFor(() => {
      expect(container.querySelector('[data-annotation-id="note-close"]')).toBeTruthy();
    });

    const annotationEl = container.querySelector('[data-annotation-id="note-close"]') as HTMLElement;
    Object.defineProperty(annotationEl, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 10,
        top: 20,
        width: 30,
        height: 10,
        right: 40,
        bottom: 30,
        x: 10,
        y: 20,
        toJSON: () => ({}),
      }),
    });

    fireEvent.click(annotationEl);
    expect(await screen.findByText('Close me')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    await waitFor(() => {
      expect(screen.queryByText('Close me')).not.toBeInTheDocument();
    });
  });

  it('clears the annotation popover when clicking plain content', async () => {
    mocks.useAnnotationsMock.mockReturnValue({
      data: [
        buildAnnotation({
          id: 'note-plain-click',
          type: 'note',
          content: 'Plain close',
          startOffset: 0,
          endOffset: 5,
          color: '#60A5FA',
        }),
      ],
    });

    const { container } = render(
      <AnnotatedContent articleId="article-1" html="<p>Hello world text.</p>" />,
    );

    await waitFor(() => {
      expect(container.querySelector('[data-annotation-id="note-plain-click"]')).toBeTruthy();
    });

    const annotationEl = container.querySelector('[data-annotation-id="note-plain-click"]') as HTMLElement;
    Object.defineProperty(annotationEl, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 10,
        top: 20,
        width: 30,
        height: 10,
        right: 40,
        bottom: 30,
        x: 10,
        y: 20,
        toJSON: () => ({}),
      }),
    });

    fireEvent.click(annotationEl);
    expect(await screen.findByText('Plain close')).toBeInTheDocument();
    fireEvent.click(container.querySelector('.article-content') as HTMLElement);
    await waitFor(() => {
      expect(screen.queryByText('Plain close')).not.toBeInTheDocument();
    });
  });

  it('dismisses the selection toolbar and ignores invalid selections', async () => {
    const { container } = render(
      <AnnotatedContent articleId="article-1" html="<p>Hello world text.</p>" />,
    );

    const content = container.querySelector('.article-content') as HTMLElement;
    const textNode = content.querySelector('p')!.firstChild as Text;
    const outsideNode = document.createTextNode('outside');
    document.body.appendChild(outsideNode);

    setSelection({
      root: content,
      startNode: outsideNode,
      startOffset: 0,
      endNode: outsideNode,
      endOffset: 4,
      text: 'outs',
    });
    fireEvent.mouseUp(content);
    expect(screen.queryByRole('button', { name: 'Highlight' })).not.toBeInTheDocument();

    setSelection({
      root: content,
      startNode: content.querySelector('p') as Node,
      startOffset: 0,
      endNode: content.querySelector('p') as Node,
      endOffset: 1,
      text: 'Hello',
    });
    fireEvent.mouseUp(content);
    expect(screen.queryByRole('button', { name: 'Highlight' })).not.toBeInTheDocument();

    setSelection({
      root: content,
      startNode: textNode,
      startOffset: 0,
      endNode: textNode,
      endOffset: 5,
      text: 'Hello',
    });
    fireEvent.mouseUp(content);
    expect(await screen.findByRole('button', { name: 'Highlight' })).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('button', { name: 'Highlight' })).not.toBeInTheDocument();

    outsideNode.remove();
  });

  it('supports note cancel flows from the selection toolbar', async () => {
    const firstRender = render(
      <AnnotatedContent articleId="article-1" html="<p>Hello world text.</p>" />,
    );
    const content = firstRender.container.querySelector('.article-content') as HTMLElement;
    const textNode = content.querySelector('p')!.firstChild as Text;

    setSelection({
      root: content,
      startNode: textNode,
      startOffset: 6,
      endNode: textNode,
      endOffset: 11,
      text: 'world',
    });
    fireEvent.mouseUp(content);
    fireEvent.click(await screen.findByRole('button', { name: 'Note' }));
    const noteArea = await screen.findByPlaceholderText('Write a note...');
    fireEvent.keyDown(noteArea, { key: 'Escape' });
    expect(screen.queryByPlaceholderText('Write a note...')).not.toBeInTheDocument();

    firstRender.unmount();

    const secondRender = render(
      <AnnotatedContent articleId="article-1" html="<p>Hello world text.</p>" />,
    );
    const secondContent = secondRender.container.querySelector('.article-content') as HTMLElement;
    const secondTextNode = secondContent.querySelector('p')!.firstChild as Text;

    setSelection({
      root: secondContent,
      startNode: secondTextNode,
      startOffset: 12,
      endNode: secondTextNode,
      endOffset: 16,
      text: 'text',
    });
    fireEvent.mouseUp(secondContent);
    fireEvent.click(await screen.findByRole('button', { name: 'Note' }));
    const secondArea = await screen.findByPlaceholderText('Write a note...');
    fireEvent.change(secondArea, { target: { value: 'draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByPlaceholderText('Write a note...')).not.toBeInTheDocument();
  });

  it('cleans up old wrappers and tolerates missing annotation targets', async () => {
    let annotationsData = [
      buildAnnotation({
        id: 'note-null-color',
        type: 'note',
        content: 'Editable',
        startOffset: 0,
        endOffset: 5,
        color: null,
      }),
      buildAnnotation({
        id: 'missing-range',
        type: 'highlight',
        startOffset: 999,
        endOffset: 1005,
        color: null,
      }),
    ];
    mocks.useAnnotationsMock.mockImplementation(() => ({
      data: annotationsData,
    }));

    const { container, rerender } = render(
      <AnnotatedContent articleId="article-1" html="<p>Hello world text.</p>" />,
    );
    const content = container.querySelector('.article-content') as HTMLElement;

    await waitFor(() => {
      expect(container.querySelector('[data-annotation-id="note-null-color"]')).toBeTruthy();
    });

    const noteEl = container.querySelector('[data-annotation-id="note-null-color"]') as HTMLElement;
    Object.defineProperty(noteEl, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 20,
        top: 20,
        width: 24,
        height: 10,
        right: 44,
        bottom: 30,
        x: 20,
        y: 20,
        toJSON: () => ({}),
      }),
    });

    annotationsData = [];
    rerender(
      <AnnotatedContent articleId="article-1" html="<p>Hello world text.</p>" />,
    );
    await waitFor(() => {
      expect(container.querySelector('[data-annotation-id="note-null-color"]')).toBeNull();
    });

    const orphan = document.createElement('span');
    orphan.setAttribute('data-annotation-id', 'missing-id');
    content.appendChild(orphan);
    fireEvent.click(orphan);
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('handles note edit cancel flows and highlight popovers with default colors', async () => {
    mocks.useAnnotationsMock.mockReturnValue({
      data: [
        buildAnnotation({
          id: 'note-empty',
          type: 'note',
          content: null,
          startOffset: 0,
          endOffset: 5,
          color: null,
        }),
      ],
    });

    const firstRender = render(
      <AnnotatedContent articleId="article-1" html="<p>Hello world text.</p>" />,
    );
    const { container } = firstRender;

    await waitFor(() => {
      expect(container.querySelector('[data-annotation-id="note-empty"]')).toBeTruthy();
    });

    const noteEl = container.querySelector('[data-annotation-id="note-empty"]') as HTMLElement;
    Object.defineProperty(noteEl, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 12,
        top: 18,
        width: 28,
        height: 10,
        right: 40,
        bottom: 28,
        x: 12,
        y: 18,
        toJSON: () => ({}),
      }),
    });

    fireEvent.click(noteEl);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const emptyEditor = await screen.findByRole('textbox');
    expect(emptyEditor).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.keyDown(emptyEditor, { key: 'Escape' });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    fireEvent.click(noteEl);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const secondEditor = await screen.findByRole('textbox');
    fireEvent.change(secondEditor, { target: { value: 'draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    firstRender.unmount();

    mocks.useAnnotationsMock.mockReturnValue({
      data: [
        buildAnnotation({
          id: 'highlight-default',
          type: 'highlight',
          startOffset: 0,
          endOffset: 5,
          color: null,
        }),
      ],
    });
    const secondRender = render(
      <AnnotatedContent articleId="article-1" html="<p>Hello world text.</p>" />,
    );

    await waitFor(() => {
      expect(secondRender.container.querySelector('[data-annotation-id="highlight-default"]')).toBeTruthy();
    });
    const highlightEl = secondRender.container.querySelector('[data-annotation-id="highlight-default"]') as HTMLElement;
    Object.defineProperty(highlightEl, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 24,
        top: 18,
        width: 30,
        height: 10,
        right: 54,
        bottom: 28,
        x: 24,
        y: 18,
        toJSON: () => ({}),
      }),
    });

    fireEvent.click(highlightEl);
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Yellow'));
    expect(mocks.updateMutate).toHaveBeenCalledWith({
      annotationId: 'highlight-default',
      articleId: 'article-1',
      data: { color: '#FBBF24' },
    });
  });

  it('ignores whitespace selections and blank note submissions from the toolbar', async () => {
    const { container } = render(
      <AnnotatedContent articleId="article-1" html="<p>Hello world text.</p>" />,
    );

    const content = container.querySelector('.article-content') as HTMLElement;
    const textNode = content.querySelector('p')!.firstChild as Text;

    setSelection({
      root: content,
      startNode: textNode,
      startOffset: 0,
      endNode: textNode,
      endOffset: 5,
      text: '   ',
    });
    fireEvent.mouseUp(content);
    expect(screen.queryByRole('button', { name: 'Highlight' })).not.toBeInTheDocument();

    setSelection({
      root: content,
      startNode: textNode,
      startOffset: 6,
      endNode: textNode,
      endOffset: 11,
      text: 'world',
    });
    fireEvent.mouseUp(content);
    fireEvent.click(await screen.findByRole('button', { name: 'Note' }));

    const noteInput = screen.getByPlaceholderText('Write a note...');
    fireEvent.change(noteInput, { target: { value: '   ' } });
    fireEvent.keyDown(noteInput, { key: 'Enter' });
    expect(mocks.createMutate).not.toHaveBeenCalled();
  });

  it('covers missing wrapper rect guards for selections and annotation popovers', async () => {
    const firstRender = render(
      <AnnotatedContent articleId="article-1" html="<p>Hello world text.</p>" />,
    );

    const firstContent = firstRender.container.querySelector('.article-content') as HTMLElement;
    const firstTextNode = firstContent.querySelector('p')!.firstChild as Text;

    setSelection({
      root: firstContent,
      startNode: firstTextNode,
      startOffset: 0,
      endNode: firstTextNode,
      endOffset: 5,
      text: 'Hello',
    });
    Object.defineProperty(firstRender.container.firstElementChild as HTMLElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => undefined,
    });
    fireEvent.mouseUp(firstContent);
    expect(screen.queryByRole('button', { name: 'Highlight' })).not.toBeInTheDocument();

    firstRender.unmount();

    mocks.useAnnotationsMock.mockReturnValue({
      data: [
        buildAnnotation({
          id: 'note-guard',
          type: 'note',
          content: 'Editable note',
          startOffset: 0,
          endOffset: 5,
          color: '#60A5FA',
        }),
      ],
    });

    const secondRender = render(
      <AnnotatedContent articleId="article-1" html="<p>Hello world text.</p>" />,
    );

    await waitFor(() => {
      expect(secondRender.container.querySelector('[data-annotation-id="note-guard"]')).toBeTruthy();
    });

    const noteEl = secondRender.container.querySelector('[data-annotation-id="note-guard"]') as HTMLElement;
    Object.defineProperty(noteEl, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 18,
        top: 18,
        width: 28,
        height: 10,
        right: 46,
        bottom: 28,
        x: 18,
        y: 18,
        toJSON: () => ({}),
      }),
    });
    Object.defineProperty(secondRender.container.firstElementChild as HTMLElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => undefined,
    });

    fireEvent.click(noteEl);
    expect(screen.queryByText('Editable note')).not.toBeInTheDocument();
  });

  it('prevents saving blank note edits from the annotation popover', async () => {
    mocks.useAnnotationsMock.mockReturnValue({
      data: [
        buildAnnotation({
          id: 'note-empty-save',
          type: 'note',
          content: 'Editable note',
          startOffset: 0,
          endOffset: 5,
          color: '#60A5FA',
        }),
      ],
    });

    const { container } = render(
      <AnnotatedContent articleId="article-1" html="<p>Hello world text.</p>" />,
    );

    await waitFor(() => {
      expect(container.querySelector('[data-annotation-id="note-empty-save"]')).toBeTruthy();
    });

    const noteEl = container.querySelector('[data-annotation-id="note-empty-save"]') as HTMLElement;
    Object.defineProperty(noteEl, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 16,
        top: 20,
        width: 24,
        height: 10,
        right: 40,
        bottom: 30,
        x: 16,
        y: 20,
        toJSON: () => ({}),
      }),
    });

    fireEvent.click(noteEl);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const editor = await screen.findByDisplayValue('Editable note');
    fireEvent.change(editor, { target: { value: '   ' } });
    fireEvent.keyDown(editor, { key: 'Enter' });
    expect(mocks.updateMutate).not.toHaveBeenCalled();
  });
});
