// Read-only SQL catalog comparison. This parser never executes a migration.
export type MigrationObject = { kind: string; key: string; relation?: string; name?: string; attributes: Record<string, any>; action?: 'drop' };
export function splitSql(source: string, separator = ';') {
  const values: string[] = []; let buffer = '', depth = 0;
  for (let i = 0; i < source.length; i++) {
    if (source.startsWith('--', i)) { const end = source.indexOf('\n', i); i = end < 0 ? source.length : end; buffer += ' '; continue; }
    if (source.startsWith('/*', i)) { const end = source.indexOf('*/', i + 2); if (end < 0) throw Error('unterminated_sql_comment'); i = end + 1; buffer += ' '; continue; }
    const char = source[i];
    if (char === "'" || char === '"') { const quote = char; buffer += char; while (++i < source.length) { buffer += source[i]; if (source[i] === quote) { if (source[i + 1] === quote) buffer += source[++i]; else break; } } continue; }
    if (char === '$') { const tag = source.slice(i).match(/^\$[a-z_0-9]*\$/i)?.[0]; if (tag) { const end = source.indexOf(tag, i + tag.length); if (end < 0) throw Error('unterminated_sql_body'); buffer += source.slice(i, end + tag.length); i = end + tag.length - 1; continue; } }
    if (char === '(') depth++; if (char === ')') depth--;
    if (char === separator && depth === 0) { if (buffer.trim()) values.push(buffer.trim()); buffer = ''; } else buffer += char;
  }
  if (buffer.trim()) values.push(buffer.trim()); return values;
}
export function sqlBodyHashInput(body: string) { return (splitSql(body).join(' ; ').match(/'(?:''|[^'])*'|"(?:""|[^"])*"|[^\s]+/g) || []).join(' '); }
export function canonicalType(type: string) { return type.trim().toLowerCase().replace(/\btimestamptz\b/g, 'timestamp with time zone').replace(/\bint4\b|\bint\b/g, 'integer').replace(/\bbool\b/g, 'boolean').replace(/\s+/g, ' '); }
function signature(name: string, args: string, named: boolean) {
  return `${name.toLowerCase()}(${splitSql(args, ',').map(arg => canonicalType((named ? arg.replace(/^(?:IN\s+)?[a-z_][a-z_0-9]*\s+/i, '') : arg).replace(/\s+DEFAULT\s+[\s\S]*$/i, ''))).join(',')})`;
}
function typeAndAttributes(declaration: string) {
  const type = canonicalType(declaration.split(/\s+(?:NOT\s+NULL|NULL|DEFAULT|PRIMARY|UNIQUE|CHECK|REFERENCES|CONSTRAINT)\b/i)[0]);
  const value = declaration.match(/\bDEFAULT\s+([\s\S]*?)(?=\s+(?:NOT\s+NULL|CHECK|REFERENCES|UNIQUE|PRIMARY|CONSTRAINT)\b|$)/i)?.[1]?.trim();
  return { type, nullable: !/\bNOT\s+NULL|\bPRIMARY\s+KEY/i.test(declaration), default: value ?? null };
}
export function migrationObjects(source: string) {
  const objects: MigrationObject[] = [], limitations: string[] = [];
  const add = (kind: string, key: string, attributes: Record<string, any>, relation?: string, name?: string, action?: 'drop') => objects.push({ kind, key, attributes, relation, name, ...(action ? { action } : {}) });
  const constraint = (relation: string, name: string, declaration: string) => {
    const type = /\bFOREIGN\s+KEY|\bREFERENCES/i.test(declaration) ? 'f' : /\bPRIMARY\s+KEY/i.test(declaration) ? 'p' : /\bUNIQUE/i.test(declaration) ? 'u' : 'c';
    add('constraint', `${relation}.${name}`, { type, referencedRelation: declaration.match(/\bREFERENCES\s+([a-z_]+\.[a-z_]+)/i)?.[1], deferrable: /\bDEFERRABLE/i.test(declaration) && !/NOT\s+DEFERRABLE/i.test(declaration), initiallyDeferred: /INITIALLY\s+DEFERRED/i.test(declaration), sourceDefinition: declaration }, relation, name);
  };
  for (const statement of splitSql(source)) {
    let match: RegExpMatchArray | null;
    if ((match = statement.match(/^CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([a-z_]+\.[a-z_]+)\s*\(([\s\S]*?)\)\s*RETURNS\b/i))) {
      const body = statement.match(/\bAS\s+(\$[a-z_0-9]*\$)([\s\S]*?)\1\s*$/i)?.[2];
      if (body === undefined) limitations.push('function_body_unparsed');
      add('function', signature(match[1], match[2], true), { body: body === undefined ? undefined : sqlBodyHashInput(body), definer: /SECURITY\s+DEFINER/i.test(statement), searchPath: statement.match(/SET\s+search_path\s*=\s*([^\r\n]+?)(?=\s+AS\b|\r?\n|$)/i)?.[1]?.trim() }, undefined, match[1]);
    } else if ((match = statement.match(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_]+\.[a-z_]+)\s*\(([\s\S]*)\)$/i))) {
      const relation = match[1].toLowerCase(), table = relation.split('.')[1]; add('table', relation, {}, relation);
      for (const field of splitSql(match[2], ',')) {
        const named = field.match(/^CONSTRAINT\s+([a-z_]+)\s+([\s\S]+)$/i);
        if (named) constraint(relation, named[1], named[2]);
        else if (/^(PRIMARY|UNIQUE|CHECK|FOREIGN)\b/i.test(field)) limitations.push(`unnamed_table_constraint:${relation}`);
        else { const column = field.match(/^([a-z_]+)\s+([\s\S]+)$/i); if (!column) { limitations.push(`column_unparsed:${relation}`); continue; }
          add('column', `${relation}.${column[1]}`, typeAndAttributes(column[2]), relation, column[1]);
          if (/\bPRIMARY\s+KEY/i.test(column[2])) constraint(relation, `${table}_pkey`, `PRIMARY KEY (${column[1]})`);
          if (/\bUNIQUE/i.test(column[2])) constraint(relation, `${table}_${column[1]}_key`, `UNIQUE (${column[1]})`);
          if (/\bREFERENCES/i.test(column[2])) constraint(relation, `${table}_${column[1]}_fkey`, column[2]);
          if (/\bCHECK\s*\(/i.test(column[2])) { constraint(relation, `${table}_${column[1]}_check`, column[2].slice(column[2].search(/\bCHECK\s*\(/i))); limitations.push(`inline_check_expression_review:${relation}.${column[1]}`); }
        }
      }
    } else if ((match = statement.match(/^ALTER\s+TABLE\s+([a-z_]+\.[a-z_]+)\s+([\s\S]+)$/i))) {
      const relation = match[1].toLowerCase();
      for (const operation of splitSql(match[2], ',')) {
        let item: RegExpMatchArray | null;
        if ((item = operation.match(/^ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_]+)\s+([\s\S]+)$/i))) add('column', `${relation}.${item[1]}`, typeAndAttributes(item[2]), relation, item[1]);
        else if ((item = operation.match(/^ADD\s+CONSTRAINT\s+([a-z_]+)\s+([\s\S]+)$/i))) constraint(relation, item[1], item[2]);
        else if ((item = operation.match(/^DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?([a-z_]+)/i))) add('constraint', `${relation}.${item[1]}`, {}, relation, item[1], 'drop');
        else if ((item = operation.match(/^ALTER\s+COLUMN\s+([a-z_]+)\s+(SET|DROP)\s+NOT\s+NULL/i))) add('column', `${relation}.${item[1]}`, { nullable: item[2].toUpperCase() === 'DROP' }, relation, item[1]);
        else if ((item = operation.match(/^ALTER\s+COLUMN\s+([a-z_]+)\s+SET\s+DEFAULT\s+([\s\S]+)/i))) add('column', `${relation}.${item[1]}`, { default: item[2].trim() }, relation, item[1]);
        else if (/^(ENABLE|FORCE)\s+ROW\s+LEVEL\s+SECURITY/i.test(operation)) add('rls', relation, { rls: true }, relation);
        else limitations.push(`alter_table_review:${relation}:${operation.split(/\s+/).slice(0, 3).join(' ')}`);
      }
    } else if ((match = statement.match(/^CREATE\s+(UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_]+)\s+ON\s+([a-z_]+\.[a-z_]+)\s*(?:USING\s+\w+\s*)?\(([\s\S]*?)\)(?:\s+WHERE\s+([\s\S]+))?$/i))) {
      add('index', `${match[3].split('.')[0]}.${match[2]}`, { unique: !!match[1], sourceKeys: match[4], sourcePredicate: match[5] ?? null }, match[3], match[2]);
    } else if ((match = statement.match(/^CREATE\s+POLICY\s+([a-z_]+)\s+ON\s+([a-z_]+\.[a-z_]+)\s+([\s\S]+)/i))) {
      const cmd = match[3].match(/\bFOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)/i)?.[1]?.toUpperCase() || 'ALL';
      const roles = (match[3].match(/\bTO\s+([\s\S]*?)(?=\bUSING\b|\bWITH\s+CHECK\b|$)/i)?.[1] || 'public').split(',').map(role => role.trim().toLowerCase()).sort();
      add('policy', `${match[2]}.${match[1]}`, { cmd, roles, sourceDefinition: match[3] }, match[2], match[1]);
    } else if ((match = statement.match(/^CREATE\s+(?:CONSTRAINT\s+)?TRIGGER\s+([a-z_]+)\s+([\s\S]*?)\bON\s+([a-z_]+\.[a-z_]+)([\s\S]*)/i))) {
      add('trigger', `${match[3]}.${match[1]}`, { functionName: match[4].match(/EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+([a-z_]+\.[a-z_]+)/i)?.[1], sourceDefinition: statement, deferrable: /\bDEFERRABLE/i.test(statement), initiallyDeferred: /INITIALLY\s+DEFERRED/i.test(statement) }, match[3], match[1]);
    } else if ((match = statement.match(/^DROP\s+(POLICY|TRIGGER)\s+(?:IF\s+EXISTS\s+)?([a-z_]+)\s+ON\s+([a-z_]+\.[a-z_]+)/i))) add(match[1].toLowerCase(), `${match[3]}.${match[2]}`, {}, match[3], match[2], 'drop');
    else if ((match = statement.match(/^DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?([a-z_]+\.[a-z_]+)\s*\(([\s\S]*?)\)/i))) add('function', signature(match[1], match[2], false), {}, undefined, match[1], 'drop');
    else if ((match = statement.match(/^(GRANT|REVOKE)\s+([\s\S]*?)\s+ON\s+(?:(TABLE|FUNCTION|SCHEMA)\s+)?([\s\S]*?)\s+(?:TO|FROM)\s+([\s\S]+)$/i))) {
      const type = (match[3] || 'TABLE').toLowerCase(), all = /^ALL(?:\s+PRIVILEGES)?$/i.test(match[2].trim());
      const columnGrant = match[2].match(/^(SELECT|INSERT|UPDATE|REFERENCES)\s*\(([\s\S]+)\)$/i);
      if (columnGrant) {
        for (const target of splitSql(match[4], ',')) for (const role of match[5].split(',').map(value=>value.trim().toLowerCase())) for (const column of splitSql(columnGrant[2], ',')) {
          const key = `${target.trim()}.${column.trim()}`;
          add('grant', `column:${key}:${role}:${columnGrant[1].toUpperCase()}`, {objectType:'column',objectKey:key,role,privilege:columnGrant[1].toUpperCase(),allowed:match[1].toUpperCase()==='GRANT'});
        }
        continue;
      }
      const privileges = all ? type === 'function' ? ['EXECUTE'] : type === 'schema' ? ['USAGE', 'CREATE'] : ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] : match[2].split(',').map(value => value.trim().toUpperCase());
      for (const target of splitSql(match[4], ',')) for (const role of match[5].split(',').map(value => value.trim().toLowerCase())) for (const privilege of privileges) {
        const fn = target.match(/^([a-z_]+\.[a-z_]+)\s*\(([\s\S]*?)\)$/i);
        const key = type === 'function' && fn ? signature(fn[1], fn[2], false) : target.trim().toLowerCase();
        add('grant', `${type}:${key}:${role}:${privilege}`, { objectType: type, objectKey: key, role, privilege, allowed: match[1].toUpperCase() === 'GRANT' });
      }
    } else if (/^(CREATE|ALTER|DROP|GRANT|REVOKE)\b/i.test(statement) && !/^CREATE\s+SCHEMA\b/i.test(statement)) limitations.push(`statement_review:${statement.split(/\s+/).slice(0, 4).join(' ')}`);
  }
  return { objects, limitations: [...new Set(limitations)] };
}

export function compareObject(object: MigrationObject, runtime: any): { status: string; checks: string[]; limitations: string[] } {
  const rows: any[] = runtime[object.kind === 'rls' ? 'table' : object.kind] || [];
  const found = rows.find(row => row.key === object.key);
  if (object.action === 'drop') return { status: found ? 'DRIFT' : 'MATCHES_RUNTIME', checks: ['absence'], limitations: [] };
  if (!found) return { status: 'DRIFT', checks: ['object_missing'], limitations: [] };
  const checks = ['present'], limitations: string[] = [];
  const same = (key: string) => { if (object.attributes[key] !== undefined && JSON.stringify(object.attributes[key]) !== JSON.stringify(found[key])) return false; checks.push(key); return true; };
  for (const key of object.kind === 'function' ? ['body', 'definer'] : object.kind === 'column' ? ['type', 'nullable'] : object.kind === 'constraint' ? ['type', 'referencedRelation', 'deferrable', 'initiallyDeferred'] : object.kind === 'policy' ? ['cmd', 'roles'] : object.kind === 'index' ? ['unique'] : object.kind === 'trigger' ? ['functionName', 'deferrable', 'initiallyDeferred'] : object.kind === 'grant' ? ['allowed'] : object.kind === 'rls' ? ['rls'] : []) if (!same(key)) return { status: 'DRIFT', checks: [...checks, `${key}_mismatch`], limitations };
  if (object.kind === 'function') { if (!found.searchPath || /pg_temp/.test(found.searchPath)) return { status: 'DRIFT', checks: [...checks, 'search_path_missing_or_untrusted'], limitations }; checks.push('fixed_search_path'); }
  if (object.kind === 'function' && object.attributes.searchPath && object.attributes.searchPath.replace(/[\s"']/g,'') !== found.searchPath.replace(/[\s"']/g,'')) return {status:'DRIFT',checks:[...checks,'search_path_mismatch'],limitations};
  if (object.kind === 'column' && object.attributes.default !== undefined && String(object.attributes.default ?? '') !== String(found.default ?? '')) limitations.push('default_expression_catalog_rendering_review');
  if (['policy', 'constraint', 'index', 'trigger'].includes(object.kind)) limitations.push('expression_or_definition_semantics_require_canonical_review');
  return { status: limitations.length ? 'PARTIAL_MATCH' : 'MATCHES_RUNTIME', checks, limitations };
}
