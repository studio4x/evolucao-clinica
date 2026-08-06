-- The previous HTML conversion preserved literal line breaks inside a single paragraph.
-- Convert both escaped and real line breaks in existing paragraphs to e-mail-safe HTML.
UPDATE public.email_templates
SET body_template = replace(
  replace(
    body_template,
    E'\\n\\n',
    '</p><p style="margin:0 0 16px 0; font-size:15px; line-height:1.7;">'
  ),
  E'\\n',
  '<br/>'
)
WHERE position(chr(92) || 'n' in body_template) > 0;
