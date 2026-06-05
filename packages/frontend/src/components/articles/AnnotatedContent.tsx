import { useCallback, useEffect, useRef, useState } from 'react';
import type { Annotation } from '../../api/annotations.api.js';
import {
  useAnnotations,
  useCreateAnnotation,
  useUpdateAnnotation,
  useDeleteAnnotation,
} from '../../hooks/use-annotations.js';

const HIGHLIGHT_COLORS: { name: string; hex: string }[] = [
  { name: 'Yellow', hex: '#FBBF24' },
  { name: 'Green', hex: '#34D399' },
  { name: 'Blue', hex: '#60A5FA' },
  { name: 'Pink', hex: '#F472B6' },
  { name: 'Purple', hex: '#A78BFA' },
];

const DEFAULT_COLOR = HIGHLIGHT_COLORS[0].hex;

/** Return background color with opacity for a given highlight hex color. */
function bgForColor(hex: string): string {
  // Use 30% opacity so text remains readable
  return `${hex}4D`;
}

/**
 * Walk the DOM tree under `root` and compute the character offset of a
 * (node, offset) pair relative to the concatenated textContent of `root`.
 * Returns -1 if the node is outside root.
 */
function computeTextOffset(root: HTMLElement, targetNode: Node, targetOffset: number): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let charCount = 0;
  let node = walker.nextNode();
  while (node) {
    if (node === targetNode) {
      return charCount + targetOffset;
    }
    charCount += (node.textContent?.length ?? 0);
    node = walker.nextNode();
  }
  return -1;
}

/**
 * Given a root element and a character offset range (start, end) within
 * root's textContent, return the DOM Range that covers that span.
 */
function rangeFromOffsets(root: HTMLElement, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let charCount = 0;
  let startNode: Text | null = null;
  let startOff = 0;
  let endNode: Text | null = null;
  let endOff = 0;
  let node = walker.nextNode() as Text | null;
  while (node) {
    const len = node.textContent?.length ?? 0;
    if (!startNode && charCount + len > start) {
      startNode = node;
      startOff = start - charCount;
    }
    if (charCount + len >= end) {
      endNode = node;
      endOff = end - charCount;
      break;
    }
    charCount += len;
    node = walker.nextNode() as Text | null;
  }
  if (!startNode || !endNode) return null;
  const range = document.createRange();
  range.setStart(startNode, startOff);
  range.setEnd(endNode, endOff);
  return range;
}

interface Props {
  articleId: string;
  html: string;
}

export function AnnotatedContent({ articleId, html }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const { data: annotations = [] } = useAnnotations(articleId);
  const createAnnotation = useCreateAnnotation();
  const updateAnnotation = useUpdateAnnotation();
  const deleteAnnotation = useDeleteAnnotation();

  // Selection toolbar state
  const [selectionToolbar, setSelectionToolbar] = useState<{
    x: number;
    y: number;
    text: string;
    startOffset: number;
    endOffset: number;
  } | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [selectedColor, setSelectedColor] = useState(DEFAULT_COLOR);

  // Clicked-annotation popover state
  const [activeAnnotation, setActiveAnnotation] = useState<{
    annotation: Annotation;
    x: number;
    y: number;
  } | null>(null);
  const [editingNote, setEditingNote] = useState(false);
  const [editNoteText, setEditNoteText] = useState('');
  const [editColor, setEditColor] = useState<string | null>(null);

  const toolbarRef = useRef<HTMLDivElement>(null);
  const annotationPopoverRef = useRef<HTMLDivElement>(null);

  // Close popovers when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setSelectionToolbar(null);
        setShowColorPicker(false);
        setShowNoteInput(false);
        setNoteText('');
      }
      if (annotationPopoverRef.current && !annotationPopoverRef.current.contains(e.target as Node)) {
        setActiveAnnotation(null);
        setEditingNote(false);
        setEditNoteText('');
        setEditColor(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Handle text selection within article content
  const handleMouseUp = useCallback(() => {
    // Small delay to let the browser finalize the selection
    requestAnimationFrame(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !contentRef.current) return;

      const range = sel.getRangeAt(0);
      if (!contentRef.current.contains(range.startContainer) || !contentRef.current.contains(range.endContainer)) {
        return;
      }

      const text = sel.toString().trim();
      if (!text) return;

      const startOffset = computeTextOffset(contentRef.current, range.startContainer, range.startOffset);
      const endOffset = computeTextOffset(contentRef.current, range.endContainer, range.endOffset);
      if (startOffset < 0 || endOffset < 0 || startOffset >= endOffset) return;

      const rect = range.getBoundingClientRect();
      const wrapperRect = wrapperRef.current?.getBoundingClientRect();
      if (!wrapperRect) return;

      setSelectionToolbar({
        x: rect.left + rect.width / 2 - wrapperRect.left,
        y: rect.top - wrapperRect.top - 8,
        text,
        startOffset,
        endOffset,
      });
      setShowColorPicker(false);
      setShowNoteInput(false);
      setNoteText('');
      setSelectedColor(DEFAULT_COLOR);
    });
  }, []);

  // Apply highlight marks to the rendered HTML by overlaying via CSS highlights
  // We re-apply them after every render using Range + Highlight API, but since
  // that API is not universally supported, we fall back to wrapping with <mark> via
  // a post-render DOM manipulation.
  useEffect(() => {
    if (!contentRef.current) return;

    // Clear any previous annotation marks
    contentRef.current.querySelectorAll('[data-annotation-id]').forEach((el: Element) => {
      const parent = el.parentNode;
      if (!parent) return;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    });

    // Sort annotations by startOffset to apply them in order
    const sorted = [...annotations]
      .filter((a) => a.startOffset != null && a.endOffset != null)
      .sort((a, b) => (a.startOffset ?? 0) - (b.startOffset ?? 0));

    // Apply each annotation as a wrapping element
    // We need to be careful: wrapping one range may shift subsequent text nodes.
    // Process in reverse order to avoid offset shifts.
    for (const ann of [...sorted].reverse()) {
      const range = rangeFromOffsets(contentRef.current, ann.startOffset!, ann.endOffset!);
      if (!range) continue;

      if (ann.type === 'highlight') {
        const mark = document.createElement('mark');
        mark.setAttribute('data-annotation-id', ann.id);
        mark.setAttribute('data-annotation-type', 'highlight');
        mark.style.backgroundColor = bgForColor(ann.color ?? DEFAULT_COLOR);
        mark.style.borderBottom = `2px solid ${ann.color ?? DEFAULT_COLOR}`;
        mark.style.borderRadius = '2px';
        mark.style.padding = '0 1px';
        mark.style.cursor = 'pointer';
        try {
          range.surroundContents(mark);
        } catch {
          // surroundContents fails when the range crosses element boundaries.
          // Fall back to extracting + wrapping.
          const fragment = range.extractContents();
          mark.appendChild(fragment);
          range.insertNode(mark);
        }
      } else if (ann.type === 'note') {
        // For notes, wrap the text similarly but also add a note indicator
        const wrapper = document.createElement('span');
        wrapper.setAttribute('data-annotation-id', ann.id);
        wrapper.setAttribute('data-annotation-type', 'note');
        wrapper.style.backgroundColor = bgForColor(ann.color ?? '#60A5FA');
        wrapper.style.borderBottom = `2px dashed ${ann.color ?? '#60A5FA'}`;
        wrapper.style.borderRadius = '2px';
        wrapper.style.padding = '0 1px';
        wrapper.style.cursor = 'pointer';
        wrapper.style.position = 'relative';

        const indicator = document.createElement('span');
        indicator.setAttribute('data-note-indicator', 'true');
        indicator.style.display = 'inline-flex';
        indicator.style.alignItems = 'center';
        indicator.style.justifyContent = 'center';
        indicator.style.width = '14px';
        indicator.style.height = '14px';
        indicator.style.borderRadius = '50%';
        indicator.style.backgroundColor = ann.color ?? '#60A5FA';
        indicator.style.color = '#fff';
        indicator.style.fontSize = '9px';
        indicator.style.fontWeight = '700';
        indicator.style.marginLeft = '2px';
        indicator.style.verticalAlign = 'super';
        indicator.style.lineHeight = '1';
        indicator.style.cursor = 'pointer';
        indicator.style.flexShrink = '0';
        indicator.textContent = '✎'; // pencil icon character

        try {
          range.surroundContents(wrapper);
        } catch {
          const fragment = range.extractContents();
          wrapper.appendChild(fragment);
          range.insertNode(wrapper);
        }
        wrapper.appendChild(indicator);
      }
    }
  }, [annotations, html]);

  // Handle clicks on annotation marks
  const handleContentClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const annotationEl = target.closest('[data-annotation-id]') as HTMLElement | null;
    if (!annotationEl) {
      setActiveAnnotation(null);
      return;
    }

    const annotationId = annotationEl.getAttribute('data-annotation-id');
    const annotation = annotations.find((a: Annotation) => a.id === annotationId);
    if (!annotation) return;

    // Clear text selection to avoid showing both popovers
    window.getSelection()?.removeAllRanges();
    setSelectionToolbar(null);

    const wrapperRect = wrapperRef.current?.getBoundingClientRect();
    const elRect = annotationEl.getBoundingClientRect();
    if (!wrapperRect) return;

    setActiveAnnotation({
      annotation,
      x: elRect.left + elRect.width / 2 - wrapperRect.left,
      y: elRect.top - wrapperRect.top - 8,
    });
    setEditingNote(false);
    setEditNoteText(annotation.content ?? '');
    setEditColor(null);

    e.stopPropagation();
  }, [annotations]);

  const handleCreateHighlight = (color?: string) => {
    if (!selectionToolbar) return;
    createAnnotation.mutate({
      articleId,
      type: 'highlight',
      content: selectionToolbar.text,
      startOffset: selectionToolbar.startOffset,
      endOffset: selectionToolbar.endOffset,
      color: color ?? selectedColor,
    });
    window.getSelection()?.removeAllRanges();
    setSelectionToolbar(null);
    setShowColorPicker(false);
  };

  const handleCreateNote = () => {
    if (!selectionToolbar || !noteText.trim()) return;
    createAnnotation.mutate({
      articleId,
      type: 'note',
      content: noteText.trim(),
      startOffset: selectionToolbar.startOffset,
      endOffset: selectionToolbar.endOffset,
      color: selectedColor,
    });
    window.getSelection()?.removeAllRanges();
    setSelectionToolbar(null);
    setShowNoteInput(false);
    setNoteText('');
  };

  const handleDeleteAnnotation = (ann: Annotation) => {
    deleteAnnotation.mutate({ annotationId: ann.id, articleId });
    setActiveAnnotation(null);
  };

  const handleUpdateColor = (ann: Annotation, color: string) => {
    updateAnnotation.mutate({
      annotationId: ann.id,
      articleId,
      data: { color },
    });
    setEditColor(color);
  };

  const handleUpdateNote = (ann: Annotation) => {
    if (!editNoteText.trim()) return;
    updateAnnotation.mutate({
      annotationId: ann.id,
      articleId,
      data: { content: editNoteText.trim() },
    });
    setEditingNote(false);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <div
        ref={contentRef}
        className="article-content"
        dangerouslySetInnerHTML={{ __html: html }}
        onMouseUp={handleMouseUp}
        onClick={handleContentClick}
      />

      {/* Selection Toolbar — appears when user selects text */}
      {selectionToolbar && (
        <div
          ref={toolbarRef}
          className="absolute z-50"
          style={{
            left: `${selectionToolbar.x}px`,
            top: `${selectionToolbar.y}px`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="bg-surface dark:bg-surface-tertiary border border-border rounded-lg shadow-lg p-1.5 flex flex-col gap-1.5">
            {!showNoteInput && (
              <div className="flex items-center gap-1">
                {/* Quick highlight with default color */}
                <button
                  onClick={() => handleCreateHighlight()}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded hover:bg-surface-tertiary dark:hover:bg-surface-secondary text-text-primary transition-colors"
                  title="Highlight selection"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                  Highlight
                </button>

                {/* Color picker toggle */}
                <button
                  onClick={() => setShowColorPicker((v: boolean) => !v)}
                  className="p-1.5 rounded hover:bg-surface-tertiary dark:hover:bg-surface-secondary transition-colors"
                  title="Choose color"
                >
                  <div
                    className="w-3.5 h-3.5 rounded-full border border-border"
                    style={{ backgroundColor: selectedColor }}
                  />
                </button>

                <div className="w-px h-5 bg-border mx-0.5" />

                {/* Add note button */}
                <button
                  onClick={() => setShowNoteInput(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded hover:bg-surface-tertiary dark:hover:bg-surface-secondary text-text-primary transition-colors"
                  title="Add a note"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  Note
                </button>
              </div>
            )}

            {/* Color picker row */}
            {showColorPicker && !showNoteInput && (
              <div className="flex items-center gap-1 px-1">
                {HIGHLIGHT_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    onClick={() => {
                      setSelectedColor(c.hex);
                      handleCreateHighlight(c.hex);
                    }}
                    className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${
                      selectedColor === c.hex ? 'border-text-primary scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c.hex }}
                    title={c.name}
                  />
                ))}
              </div>
            )}

            {/* Note input */}
            {showNoteInput && (
              <div className="flex flex-col gap-1.5 min-w-[240px]">
                <div className="flex items-center gap-1 px-1">
                  {HIGHLIGHT_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      onClick={() => setSelectedColor(c.hex)}
                      className={`w-4 h-4 rounded-full border-2 transition-transform hover:scale-110 ${
                        selectedColor === c.hex ? 'border-text-primary scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c.hex }}
                      title={c.name}
                    />
                  ))}
                </div>
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleCreateNote();
                    }
                    if (e.key === 'Escape') {
                      setShowNoteInput(false);
                      setNoteText('');
                    }
                  }}
                  placeholder="Write a note..."
                  autoFocus
                  rows={2}
                  className="w-full text-xs bg-surface-secondary dark:bg-surface rounded border border-border px-2 py-1.5 text-text-primary placeholder:text-text-tertiary resize-none focus:outline-none focus:border-primary-500"
                />
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => {
                      setShowNoteInput(false);
                      setNoteText('');
                    }}
                    className="text-[11px] text-text-tertiary hover:text-text-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateNote}
                    disabled={!noteText.trim()}
                    className="px-2 py-1 text-[11px] rounded bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Save Note
                  </button>
                </div>
              </div>
            )}
          </div>
          {/* Tooltip arrow */}
          <div className="flex justify-center">
            <div className="w-2.5 h-2.5 bg-surface dark:bg-surface-tertiary border-r border-b border-border transform rotate-45 -mt-[6px]" />
          </div>
        </div>
      )}

      {/* Annotation popover — appears when clicking an existing annotation */}
      {activeAnnotation && (
        <div
          ref={annotationPopoverRef}
          className="absolute z-50"
          style={{
            left: `${activeAnnotation.x}px`,
            top: `${activeAnnotation.y}px`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="bg-surface dark:bg-surface-tertiary border border-border rounded-lg shadow-lg p-2 min-w-[200px] max-w-[280px]">
            {/* Note content for note annotations */}
            {activeAnnotation.annotation.type === 'note' && (
              <div className="mb-2">
                {editingNote ? (
                  <div className="flex flex-col gap-1.5">
                    <textarea
                      value={editNoteText}
                      onChange={(e) => setEditNoteText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleUpdateNote(activeAnnotation.annotation);
                        }
                        if (e.key === 'Escape') setEditingNote(false);
                      }}
                      autoFocus
                      rows={2}
                      className="w-full text-xs bg-surface-secondary dark:bg-surface rounded border border-border px-2 py-1.5 text-text-primary resize-none focus:outline-none focus:border-primary-500"
                    />
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => setEditingNote(false)}
                        className="text-[11px] text-text-tertiary hover:text-text-secondary"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleUpdateNote(activeAnnotation.annotation)}
                        disabled={!editNoteText.trim()}
                        className="px-2 py-0.5 text-[11px] rounded bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-40"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <p
                    className="text-xs text-text-primary cursor-pointer hover:bg-surface-secondary dark:hover:bg-surface rounded p-1 -m-1"
                    onClick={() => setEditingNote(true)}
                    title="Click to edit"
                  >
                    {activeAnnotation.annotation.content}
                  </p>
                )}
              </div>
            )}

            {/* Color picker */}
            <div className="flex items-center gap-1 mb-2 px-0.5">
              {HIGHLIGHT_COLORS.map((c) => {
                const currentColor = editColor ?? activeAnnotation.annotation.color ?? DEFAULT_COLOR;
                return (
                  <button
                    key={c.hex}
                    onClick={() => handleUpdateColor(activeAnnotation.annotation, c.hex)}
                    className={`w-4.5 h-4.5 rounded-full border-2 transition-transform hover:scale-110 ${
                      currentColor === c.hex ? 'border-text-primary scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c.hex, width: '18px', height: '18px' }}
                    title={c.name}
                  />
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between border-t border-border pt-1.5">
              {activeAnnotation.annotation.type === 'note' && !editingNote && (
                <button
                  onClick={() => setEditingNote(true)}
                  className="text-[11px] text-text-secondary hover:text-text-primary flex items-center gap-1"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                  Edit
                </button>
              )}
              {activeAnnotation.annotation.type === 'highlight' && <span />}
              <button
                onClick={() => handleDeleteAnnotation(activeAnnotation.annotation)}
                className="text-[11px] text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 flex items-center gap-1 ml-auto"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                Remove
              </button>
            </div>
          </div>
          {/* Tooltip arrow */}
          <div className="flex justify-center">
            <div className="w-2.5 h-2.5 bg-surface dark:bg-surface-tertiary border-r border-b border-border transform rotate-45 -mt-[6px]" />
          </div>
        </div>
      )}
    </div>
  );
}
