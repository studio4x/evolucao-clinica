# HomeCare Match Admin Panel Spec

## 1. Resumo da Direcao Visual

O painel administrativo do HomeCare Match segue uma direcao visual de `clinical tech clean`.
Ele combina:

- base quase branca e superfícies brancas
- bordas frias e discretas
- azul forte como cor de acao primaria
- verde como confirmacao e sucesso
- tipografia neutra e altamente legivel
- componentes compactos, com foco operacional
- tabelas como estrutura principal de leitura e manipulacao

O objetivo visual nao e parecer "dashboard decorativo". O objetivo e transmitir:

- confianca
- clareza
- controle
- leitura rapida
- baixa friccao operacional

### Principios visuais observados

- O fundo geral e leve e silencioso, para reduzir fadiga.
- As superficies operacionais ficam em branco puro, com borda clara.
- O azul e reservado para estados de acao, foco, menu ativo e links.
- O verde e usado para sucesso, confirmacao e estados positivos.
- O vermelho fica concentrado em erros, exclusoes e riscos.
- O layout evita excesso de gradientes, excesso de sombra e contrastes agressivos no admin.
- A interface privilegia densidade moderada: bastante informacao na tela, mas com separacao clara por blocos.

## 2. Design Tokens

### 2.1 Tokens de cor

```json
{
  "color": {
    "background": "#F9FAFB",
    "foreground": "#1D2530",
    "surface": "#FFFFFF",
    "surfaceAlt": "#F0F2F4",
    "surfaceMuted": "#EBEDF0",
    "border": "#E1E7EF",
    "input": "#E1E7EF",
    "ring": "#007BFF",
    "primary": "#007BFF",
    "primaryForeground": "#FFFFFF",
    "secondary": "#F0F2F4",
    "secondaryForeground": "#32414F",
    "muted": "#EBEDF0",
    "mutedForeground": "#65707E",
    "accent": "#28AF60",
    "accentForeground": "#FFFFFF",
    "success": "#28AF60",
    "successForeground": "#FFFFFF",
    "destructive": "#EF4343",
    "destructiveForeground": "#FFFFFF",
    "warning": "#F59E0B",
    "warningForeground": "#FFFFFF",
    "info": "#0EA5E9",
    "infoForeground": "#FFFFFF",
    "popover": "#FFFFFF",
    "popoverForeground": "#1D2530",
    "card": "#FFFFFF",
    "cardForeground": "#1D2530",
    "sidebar": {
      "background": "#FAFAFA",
      "foreground": "#3F3F46",
      "primary": "#007BFF",
      "primaryForeground": "#FFFFFF",
      "accent": "#F0F2F4",
      "accentForeground": "#32414F",
      "border": "#E1E7EF",
      "ring": "#007BFF"
    }
  }
}
```

### 2.2 Tokens tipograficos

```json
{
  "font": {
    "family": {
      "base": "Inter, system-ui, sans-serif"
    },
    "size": {
      "xs": "12px",
      "sm": "14px",
      "base": "16px",
      "lg": "18px",
      "xl": "20px",
      "2xl": "24px",
      "3xl": "30px"
    },
    "weight": {
      "medium": 500,
      "semibold": 600,
      "bold": 700,
      "extrabold": 800
    },
    "lineHeight": {
      "tight": 1.25,
      "normal": 1.5,
      "none": 1
    }
  }
}
```

### 2.3 Tokens de espacamento, raio e sombra

```json
{
  "spacing": {
    "1": "4px",
    "2": "8px",
    "3": "12px",
    "4": "16px",
    "5": "20px",
    "6": "24px",
    "8": "32px"
  },
  "radius": {
    "sm": "8px",
    "md": "10px",
    "lg": "12px"
  },
  "shadow": {
    "sm": "0 1px 2px 0 rgba(29, 37, 48, 0.05)",
    "md": "0 4px 6px -1px rgba(29, 37, 48, 0.08), 0 2px 4px -2px rgba(29, 37, 48, 0.05)",
    "lg": "0 10px 15px -3px rgba(29, 37, 48, 0.08), 0 4px 6px -4px rgba(29, 37, 48, 0.05)",
    "xl": "0 20px 25px -5px rgba(29, 37, 48, 0.08), 0 8px 10px -6px rgba(29, 37, 48, 0.05)",
    "card": "0 2px 8px -2px rgba(29, 37, 48, 0.10), 0 1px 2px -1px rgba(29, 37, 48, 0.05)",
    "cardHover": "0 12px 24px -6px rgba(0, 123, 255, 0.15), 0 4px 8px -2px rgba(29, 37, 48, 0.08)"
  }
}
```

### 2.4 Tokens de gradiente

O admin usa gradiente de forma residual. O sistema global expoe:

```json
{
  "gradient": {
    "primary": "linear-gradient(135deg, #007BFF 0%, #0066CC 100%)",
    "hero": "linear-gradient(180deg, #F9FAFB 0%, #F0F7FF 100%)",
    "card": "linear-gradient(145deg, #FFFFFF 0%, #F9FAFB 100%)"
  }
}
```

No painel administrativo, a aplicacao principal e quase sempre plana.

## 3. Especificacao de Layout

### 3.1 Shell principal

- Estrutura em `flex`
- sidebar fixa a esquerda
- area de conteudo principal rolavel
- fundo geral em `secondary/10`

### 3.2 Sidebar

- largura desktop: `256px`
- posicao: fixa ou sticky na lateral esquerda
- altura: tela inteira
- fundo: `card`
- borda: `1px solid color.border`
- scroll proprio no conteudo interno
- rodape fixo com botao de logout

#### Estrutura da sidebar

1. cabecalho com icone + rotulo "Admin"
2. lista de navegacao
3. bloco final com acao secundaria

#### Menu lateral

- tipografia do item: `12px`
- peso: `500`
- altura visual compacta
- padding interno aproximado: `6px 8px`
- radius: `12px`
- espacamento entre itens: muito pequeno

Estados:

- normal: texto muted
- hover: `bg-secondary`, texto foreground
- ativo: `bg-primary`, texto branco

### 3.3 Header

No desktop, o admin praticamente nao depende de header superior persistente.
No mobile existe um header simplificado:

- altura: `64px`
- fundo: `card`
- borda inferior
- menu hamburguer
- titulo curto "Menu"
- posicao sticky

### 3.4 Area de conteudo

- desktop: `padding 32px`
- mobile: `padding 16px`
- largura: fluida, sem limite maximo global
- overflow: auto

### 3.5 Hierarquia de espacamento

Padroes recorrentes:

- entre secoes de pagina: `24px`
- entre card e conteudo interno: `16px`
- entre label e campo: `4px` a `8px`
- entre acoes pequenas: `4px` a `8px`
- entre linhas internas de metadado: `2px` a `4px`

### 3.6 Grid de paginas

Padroes frequentes:

- `grid gap-3 md:grid-cols-3`
- `grid gap-4 md:grid-cols-2`
- `grid gap-4 md:grid-cols-3`
- `grid gap-4 md:grid-cols-4`
- `grid gap-6 xl:grid-cols-[1.15fr_0.85fr]`

Uso pratico:

- filtros: 2 a 5 colunas
- KPIs: 3 ou 4 colunas
- analytics: 2 colunas
- formularios extensos: 2 colunas no desktop

## 4. Especificacao de Componentes

### 4.1 Sidebar

```tsx
<aside className="w-64 bg-card border-r border-border" />
```

Regras:

- manter densidade compacta
- sempre exibir icone + label
- usar azul somente no item ativo
- evitar agrupamentos visuais pesados

### 4.2 Itens de menu

- icone pequeno: `14px`
- label curta
- radius `lg`
- sem outline visivel permanente
- destaque principal no item ativo, nao no hover

### 4.3 Blocos de filtro

Padrao:

- ficam acima da tabela ou do dataset
- reunidos em card com `rounded-xl`, `border`, `bg-card`
- podem combinar busca, select, toggle, contador e botao de limpar

Exemplo:

```tsx
<div className="rounded-xl border bg-card p-4 shadow-sm">
  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
    ...
  </div>
</div>
```

### 4.4 Inputs

Padrao base:

- altura `40px`
- fundo branco
- borda clara
- texto pequeno a medio
- placeholder muted
- focus com ring azul

Padrao compacto:

- altura `32px`
- usado em filtros densos dentro de tabela ou linha operacional

### 4.5 Selects

Padrao:

- mesma altura e borda do input
- icone de seta com baixa opacidade
- lista em popover branco, borda e sombra media
- item selecionado por destaque de fundo

### 4.6 Botoes

#### Primario

- fundo azul
- texto branco
- sombra media
- hover com leve escurecimento
- active com leve compressao

#### Outline

- fundo branco
- borda `input`
- hover com tinta leve de azul/verde contextual

#### Ghost

- usado em acoes de linha
- sem fundo permanente
- hover sem exagero

#### Destrutivo

- vermelho solido
- usado em confirmacoes irreversiveis

#### Success

- verde solido
- usado em confirmacoes ou acoes positivas

### 4.7 Badges

Padrao global:

- pill shape
- `text-xs`
- `font-semibold`
- padding reduzido

Uso real no admin:

- badges contextualizados por pagina
- combinacoes comuns:
  - sucesso: verde
  - pendente: amarelo/ambar claro
  - estornado/info: azul claro
  - cancelado: secondary
  - risco: vermelho

### 4.8 Toggles / Switches

- trilho: `44x24`
- thumb: `20x20`
- checked azul por padrao
- alguns modulos sobrescrevem:
  - verde para confirmado
  - amarelo para ocultacao ou controle especial

### 4.9 Tabelas

Padrao dominante do admin.

Estrutura:

- wrapper com borda, `rounded-xl`, fundo branco, scroll horizontal
- header com altura `48px`
- linhas com hover suave
- celulas com `16px` de padding
- metadados secundarios em texto pequeno e muted
- coluna de acoes alinhada a direita

Exemplo:

```tsx
<div className="rounded-xl border bg-card overflow-x-auto shadow-sm">
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Nome</TableHead>
        <TableHead>Status</TableHead>
        <TableHead className="text-right">Acoes</TableHead>
      </TableRow>
    </TableHeader>
  </Table>
</div>
```

### 4.10 Paginacao

Padrao:

- aparece abaixo da tabela
- bloco independente com borda e fundo branco
- navegacao simples anterior/proximo
- estado atual descrito em texto

### 4.11 Acoes por linha

Padrao recorrente:

- botoes `ghost`, `size=icon`
- `32x32`
- icones pequenos
- alinhados horizontalmente
- cor comunica semantica:
  - azul: ver, editar, abrir, responder
  - vermelho: excluir
  - amarelo: operacao especial ou risco

### 4.12 Cards de resumo

Padrao:

- fundo branco
- borda clara
- sombra baixa ou nenhuma
- padding entre `20px` e `24px`
- titulo pequeno
- numero principal em `24px` ou mais

Uso:

- KPIs
- contadores filtrados
- status agregados
- alertas contextuais

### 4.13 Modais / Dialogs

Padrao:

- overlay escuro `80%`
- conteudo central
- fundo branco
- borda clara
- sombra forte
- animacao curta de fade + zoom

Tamanhos observados:

- `sm:max-w-md`
- `sm:max-w-lg`
- `sm:max-w-xl`
- `max-w-4xl`

Regras:

- usar para detalhe profundo, confirmacao ou formulario auxiliar
- quando houver muito conteudo, usar `max-h-[90vh] overflow-y-auto`

### 4.14 Tooltips e dropdowns

Padrao:

- tooltip pequeno
- fundo branco
- borda
- sombra media
- canto arredondado
- animacao curta

Uso:

- explicar acao de icone
- contextualizar acao desabilitada

## 5. Estados Visuais

### 5.1 Hover

- tabelas: `bg-muted/50`
- ghost buttons: tinta contextual suave
- sidebar items: `bg-secondary`
- links e acoes primarias: ligeira reducao de opacidade ou sublinhado

### 5.2 Focus

- padrao global: `ring-2 ring-primary`
- offset leve
- consistente em input, select, tabs, dialog controls

### 5.3 Active

- botoes: `scale(0.98)`
- tabs: fundo branco + sombra leve
- menu: azul solido

### 5.4 Selected

- tabs selecionadas recebem superficie destacada
- itens de menu ativos recebem primary
- linhas podem usar `data-[state=selected]:bg-muted`

### 5.5 Disabled

- `opacity-50`
- ponteiro desabilitado
- sem hover real

### 5.6 Loading

Padrao principal:

- `Loader2 animate-spin`
- centralizado em areas vazias ou dentro do proprio controle

### 5.7 Empty State

Padrao:

- area centralizada
- bastante respiro vertical
- texto muted
- as vezes icone com opacidade baixa
- borda ou fundo sutil para nao parecer erro

### 5.8 Erro

- vermelho aplicado em:
  - texto
  - borda
  - fundo suave
  - botao destrutivo

### 5.9 Sucesso

- verde aplicado em:
  - badges
  - switches
  - acoes positivas
  - feedback visual de status

## 6. Tabelas e Operacao

### 6.1 Estrutura operacional

As tabelas do admin seguem uma logica de leitura em camadas:

1. identificacao principal
2. metadado secundario
3. status ou indicativo operacional
4. controle inline
5. acoes

### 6.2 Altura e densidade

- header: `48px`
- linhas: altura variavel, geralmente compacta
- padding horizontal e vertical por celula: `16px`
- controles inline: `32px` a `40px`

### 6.3 Alinhamentos

- identificacao e leitura primaria: esquerda
- switches: centralizados
- badges: alinhamento natural no fluxo
- acoes: direita
- datas e valores: ora esquerda, ora direita, conforme contexto

### 6.4 Estilo das acoes por linha

Padrao:

```tsx
<div className="flex justify-end gap-1">
  <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:bg-primary/10" />
  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" />
</div>
```

### 6.5 Filtros e busca

Comportamento esperado ao replicar:

- busca livre por texto sempre no topo
- filtros estruturais em `Select`
- contagem do resultado filtrado
- pagina atual e volume em exibicao
- botao de limpar filtros
- paginacao simples

### 6.6 Status e indicadores operacionais

Padroes importantes:

- nao depender apenas de cor
- combinar cor + texto + icone quando relevante
- mostrar microcontexto abaixo do dado principal
- usar cores de linha apenas quando a urgencia for operacionalmente critica

## 7. Regras de UX

### 7.1 Principios de navegacao

- navegacao primaria fica sempre na sidebar
- paginas internas seguem padrao consistente de titulo + subtitulo + bloco operacional
- filtros sempre antecedem resultados
- operacoes em lote ou validacoes devem ficar claramente separadas de visualizacao

### 7.2 Hierarquia visual

1. titulo da pagina
2. subtitulo explicativo curto
3. filtros ou cards de resumo
4. dataset principal
5. modais para detalhe ou confirmacao

### 7.3 Densidade da interface

O painel nao e minimalista nem visualmente pesado.
Ele trabalha em densidade intermediaria:

- muitos dados por tela
- componentes compactos
- margens suficientes para leitura
- pouco desperdicio de area util

### 7.4 Legibilidade

- fundo claro com alto contraste de texto
- metadados em muted, nunca com contraste insuficiente
- labels curtas e objetivas
- numeros e status recebem destaque pontual

### 7.5 Equilibrio entre simplicidade e operacao

O painel equilibra simplicidade e operacao das seguintes formas:

- shell visualmente simples
- componentes sem decoracao excessiva
- estados operacionais ricos apenas onde necessario
- detalhamento deslocado para tabela, card ou modal
- a cor comunica prioridade, nao serve como enfeite

## 8. Regras de Responsividade

### 8.1 Breakpoints

```json
{
  "breakpoint": {
    "xs": "480px",
    "sm": "640px",
    "md": "768px",
    "lg": "1024px",
    "xl": "1280px",
    "2xl": "1400px"
  }
}
```

### 8.2 Comportamento mobile

- sidebar vira drawer/overlay
- header mobile aparece no topo
- grids quebram para 1 coluna
- tabelas continuam tabelas e usam scroll horizontal
- dialogs com muito conteudo passam a rolar internamente

### 8.3 Regra importante ao replicar

Nao substituir tabela por cards mobile automaticamente.
O admin original preserva a logica operacional mesmo em viewport menor.

## 9. Classes e Pseudocodigo Visual

### 9.1 Shell base

```tsx
<div className="flex min-h-screen bg-secondary/10">
  <aside className="fixed inset-y-0 left-0 w-64 bg-card border-r border-border" />
  <main className="flex-1 min-w-0 overflow-auto p-4 md:p-8" />
</div>
```

### 9.2 Titulo de pagina

```tsx
<div>
  <h1 className="text-3xl font-bold tracking-tight">Usuarios</h1>
  <p className="text-muted-foreground">
    Gerencie todos os usuarios cadastrados na plataforma.
  </p>
</div>
```

### 9.3 Card de filtro

```tsx
<div className="rounded-xl border bg-card p-4 shadow-sm">
  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
    <div className="relative">
      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input className="pl-8" placeholder="Buscar..." />
    </div>
    <Select>
      <SelectTrigger />
    </Select>
  </div>
</div>
```

### 9.4 Tabela operacional

```tsx
<div className="rounded-xl border bg-card overflow-x-auto shadow-sm">
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Nome</TableHead>
        <TableHead>Status</TableHead>
        <TableHead className="text-right">Acoes</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow>
        <TableCell>
          <div className="font-medium">Maria Souza</div>
          <div className="text-xs text-muted-foreground">maria@email.com</div>
        </TableCell>
        <TableCell>
          <Badge className="bg-success/10 text-success border-success/20">Ativo</Badge>
        </TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:bg-primary/10" />
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" />
          </div>
        </TableCell>
      </TableRow>
    </TableBody>
  </Table>
</div>
```

### 9.5 Dialog de confirmacao

```tsx
<DialogContent className="sm:max-w-md">
  <DialogHeader>
    <DialogTitle className="text-destructive">Excluir registro</DialogTitle>
    <DialogDescription>
      Esta acao e irreversivel.
    </DialogDescription>
  </DialogHeader>
  <DialogFooter>
    <Button variant="ghost">Cancelar</Button>
    <Button variant="destructive">Confirmar exclusao</Button>
  </DialogFooter>
</DialogContent>
```

## 10. Boas Praticas para Replicar em Outro Projeto

- Preserve a relacao entre `background`, `surface` e `border`. O admin depende muito dessa separacao suave.
- Mantenha a largura de sidebar em `256px` para reproduzir o mesmo equilibrio visual.
- Nao escureca demais o layout. O painel original e claro, tecnico e leve.
- Use o azul forte apenas para foco, navegacao ativa e CTA principal.
- Use verde somente em confirmacoes e sucesso. Nao misture verde em navegacao primaria.
- Estruture toda pagina em `titulo + subtitulo + filtros/cards + dataset`.
- Trate tabela como centro da operacao, nao como componente secundario.
- Padronize a altura dos controles em `40px`, com versao compacta de `32px` quando o contexto exigir.
- Garanta que as acoes por linha sejam iconicas, compactas e semanticamente coloridas.
- Evite animacoes excessivas. O admin usa movimento curto, utilitario e discreto.
- Em responsividade, prefira `overflow-x-auto` para preservar a semantica operacional.

## 11. Checklist de Replicacao

- Implementar tokens globais de cor, radius, sombra e tipografia
- Configurar shell com sidebar fixa e conteudo rolavel
- Reproduzir padrao de pagina com `space-y-6`
- Criar card-base com borda clara e fundo branco
- Criar input/select/button com mesmas alturas e estados
- Criar tabela-base com hover suave e acoes alinhadas a direita
- Criar badges de status com sistema semantico
- Criar dialogs com overlay escuro e conteudo branco central
- Reproduzir drawer mobile da sidebar
- Garantir que filtros antecedam sempre o dataset

## 12. Fontes Tecnicas de Referencia no Repositorio

- `src/index.css`
- `tailwind.config.ts`
- `src/components/layout/AdminLayout.tsx`
- `src/components/ui/button.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/select.tsx`
- `src/components/ui/table.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/ui/alert-dialog.tsx`
- `src/components/ui/tabs.tsx`
- `src/pages/admin/UsersPage.tsx`
- `src/components/admin/UsersTab.tsx`
- `src/pages/admin/PaymentsAdminPage.tsx`
- `src/pages/admin/SupportAdminPage.tsx`
- `src/pages/admin/VerificationsPage.tsx`

