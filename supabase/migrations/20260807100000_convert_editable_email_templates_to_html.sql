UPDATE public.email_templates
SET body_template = '<p style="margin:0 0 16px 0; font-size:15px; line-height:1.7;">'
  || replace(
    replace(
      replace(
        replace(
          replace(body_template, '&', '&amp;'),
          '<', '&lt;'
        ),
        '>', '&gt;'
      ),
      E'\n\n', '</p><p style="margin:0 0 16px 0; font-size:15px; line-height:1.7;">'
    ),
    E'\n', '<br/>'
  )
  || '</p>'
WHERE body_template !~ '<[[:alpha:]][^>]*>';

COMMENT ON COLUMN public.email_templates.body_template IS 'HTML sanitizado inserido diretamente no corpo do e-mail transacional.';
