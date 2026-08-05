const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

export type RichTextStyleRange = {
  start: number;
  end: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

const inlineMarkdownToHtml = (value: string) => escapeHtml(value)
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/<u>(.*?)<\/u>/g, '<u>$1</u>')
  .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');

export const markdownToRichHtml = (markdown: string) => {
  if (!markdown) return '<p><br></p>';

  return markdown.split('\n').map((line) => {
    if (/^###\s+/.test(line)) return `<h3>${inlineMarkdownToHtml(line.replace(/^###\s+/, ''))}</h3>`;
    if (/^##\s+/.test(line)) return `<h2>${inlineMarkdownToHtml(line.replace(/^##\s+/, ''))}</h2>`;
    if (/^#\s+/.test(line)) return `<h1>${inlineMarkdownToHtml(line.replace(/^#\s+/, ''))}</h1>`;
    if (/^-\s+/.test(line)) return `<div data-list="bullet">• ${inlineMarkdownToHtml(line.replace(/^-\s+/, ''))}</div>`;
    if (/^\d+\.\s+/.test(line)) return `<div data-list="ordered">${inlineMarkdownToHtml(line)}</div>`;
    return `<p>${inlineMarkdownToHtml(line) || '<br>'}</p>`;
  }).join('');
};

const nodeToMarkdown = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const element = node as HTMLElement;
  const content = Array.from(element.childNodes).map(nodeToMarkdown).join('');
  switch (element.tagName) {
    case 'STRONG': case 'B': return `**${content}**`;
    case 'EM': case 'I': return `*${content}*`;
    case 'U': return `<u>${content}</u>`;
    case 'BR': return '\n';
    case 'H1': return `# ${content}\n`;
    case 'H2': return `## ${content}\n`;
    case 'H3': return `### ${content}\n`;
    case 'LI': return `- ${content}\n`;
    case 'P': case 'DIV': return `${content}\n`;
    default: return content;
  }
};

export const richHtmlToMarkdown = (html: string) => {
  const container = document.createElement('div');
  container.innerHTML = html;
  return Array.from(container.childNodes).map(nodeToMarkdown).join('')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
};

export const markdownToGoogleDocsText = (markdown: string): { text: string; styles: RichTextStyleRange[] } => {
  let text = '';
  const styles: RichTextStyleRange[] = [];
  const stack: Array<{ marker: string; start: number; style: Omit<RichTextStyleRange, 'start' | 'end'> }> = [];
  const tokens = /\*\*|(?<!\*)\*(?!\*)|<u>|<\/u>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const append = (value: string) => { text += value; };
  while ((match = tokens.exec(markdown))) {
    append(markdown.slice(lastIndex, match.index));
    const marker = match[0];
    const existingIndex = stack.map((item) => item.marker).lastIndexOf(marker === '</u>' ? '<u>' : marker);
    if (existingIndex >= 0) {
      const opened = stack.splice(existingIndex, 1)[0];
      if (text.length > opened.start) styles.push({ start: opened.start, end: text.length, ...opened.style });
    } else if (marker === '**') {
      stack.push({ marker, start: text.length, style: { bold: true } });
    } else if (marker === '*') {
      stack.push({ marker, start: text.length, style: { italic: true } });
    } else if (marker === '<u>') {
      stack.push({ marker, start: text.length, style: { underline: true } });
    } else {
      append(marker);
    }
    lastIndex = tokens.lastIndex;
  }
  append(markdown.slice(lastIndex));
  for (const opened of stack) append(opened.marker);
  return { text, styles };
};

export const textRunToMarkdown = (content: string, style: any = {}) => {
  const value = content || '';
  let result = value;
  if (style.underline) result = `<u>${result}</u>`;
  if (style.italic) result = `*${result}*`;
  if (style.bold) result = `**${result}**`;
  return result;
};
