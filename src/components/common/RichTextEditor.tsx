import { useLayoutEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import { Bold, Italic, Underline, List, ListOrdered, Heading2 } from 'lucide-react';
import { markdownToRichHtml, richHtmlToMarkdown } from '../../utils/richText';

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
  minHeight?: string;
  resizable?: boolean;
};

const allowedTags = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'h1', 'h2', 'h3', 'div', 'ul', 'ol', 'li'];

export const RichTextEditor = ({ value, onChange, disabled, label, minHeight, resizable }: Props) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastValueRef = useRef(value);
  const hasInitializedRef = useRef(false);

  // O conteúdo não pode ser passado por dangerouslySetInnerHTML em cada render.
  // No Safari/iOS isso recria o contentEditable após cada tecla e reposiciona o
  // cursor no início, fazendo o texto ser inserido de trás para frente.
  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor || (hasInitializedRef.current && lastValueRef.current === value)) return;

    editor.innerHTML = markdownToRichHtml(value);
    lastValueRef.current = value;
    hasInitializedRef.current = true;
  }, [value]);

  const emitChange = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const safeHtml = DOMPurify.sanitize(editor.innerHTML, { ALLOWED_TAGS: allowedTags, ALLOWED_ATTR: ['data-list'] });
    const next = richHtmlToMarkdown(safeHtml);
    lastValueRef.current = next;
    onChange(next);
  };

  const format = (command: string, argument?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, argument);
    emitChange();
  };

  return <div className="overflow-hidden rounded-xl border border-brand-border bg-white focus-within:ring-1 focus-within:ring-brand-primary">
    {label && <div className="border-b border-brand-border bg-brand-bg px-3 py-2 text-xs font-semibold text-brand-text">{label}</div>}
    <div className="flex flex-wrap gap-1 border-b border-brand-border bg-stone-50 p-2" aria-label="Ferramentas de formatação">
      <button type="button" onClick={() => format('bold')} disabled={disabled} className="rounded-lg p-2 hover:bg-white disabled:opacity-50" title="Negrito"><Bold size={16} /></button>
      <button type="button" onClick={() => format('italic')} disabled={disabled} className="rounded-lg p-2 hover:bg-white disabled:opacity-50" title="Itálico"><Italic size={16} /></button>
      <button type="button" onClick={() => format('underline')} disabled={disabled} className="rounded-lg p-2 hover:bg-white disabled:opacity-50" title="Sublinhado"><Underline size={16} /></button>
      <button type="button" onClick={() => format('formatBlock', 'h2')} disabled={disabled} className="rounded-lg p-2 hover:bg-white disabled:opacity-50" title="Título"><Heading2 size={16} /></button>
      <button type="button" onClick={() => format('insertUnorderedList')} disabled={disabled} className="rounded-lg p-2 hover:bg-white disabled:opacity-50" title="Lista"><List size={16} /></button>
      <button type="button" onClick={() => format('insertOrderedList')} disabled={disabled} className="rounded-lg p-2 hover:bg-white disabled:opacity-50" title="Lista numerada"><ListOrdered size={16} /></button>
    </div>
    <div ref={editorRef} contentEditable={!disabled} suppressContentEditableWarning onInput={emitChange} onBlur={emitChange}
      style={minHeight ? { minHeight } : undefined}
      className={`min-h-[38vh] w-full overflow-y-auto p-4 text-sm leading-relaxed text-brand-text outline-none [&_h1]:my-3 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:my-3 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:my-2 [&_h3]:font-semibold [&_p]:my-0 [&_p+_p]:mt-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 ${resizable ? 'resize-y' : ''}`} />
  </div>;
};

export const RichTextPreview = ({ value, className = '' }: { value: string; className?: string }) => (
  <div className={`rich-text-preview whitespace-normal [&_p]:my-0 [&_p+_p]:mt-3 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 ${className}`}
    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(markdownToRichHtml(value), { ALLOWED_TAGS: allowedTags, ALLOWED_ATTR: ['data-list'] }) }} />
);
