# HomeCare Match Authenticated Dashboard Spec

## resumo da direção visual

### conceito visual do dashboard

O dashboard autenticado do HomeCare Match segue uma linguagem `clean operational product`.
Ele fica entre um painel utilitário e uma área de conta premium:

- mais acolhedor que o admin
- mais operacional que a homepage pública
- mais orientado a tarefas do que a branding
- com hierarquia clara, sem excesso de densidade visual

O dashboard transmite:

- segurança
- previsibilidade
- clareza de status
- sensação de acompanhamento contínuo
- proximidade com o usuário final

### sensação geral da interface

- limpa
- leve
- funcional
- amigável
- pragmática

O painel não tenta parecer um SaaS genérico com excesso de gráficos.
Ele prioriza:

- cards de ação
- blocos de status
- avisos operacionais
- listas e tabelas simples
- formulários extensos, porém legíveis

### diferença entre dashboard do usuário, admin e área pública

#### dashboard autenticado

- foco em acompanhamento pessoal
- tom de produto e suporte
- mais cards, banners e explicações curtas
- usa mais microcopy orientativa
- privilegia jornada, status e próximos passos

#### admin

- foco em operação de backoffice
- mais denso
- mais baseado em tabelas longas
- mais seco
- menos ênfase emocional

#### área pública

- foco comercial e descoberta
- mais storytelling
- mais gradiente e apelo visual
- mais CTA e menos estado operacional

### princípios visuais predominantes

- superfícies claras
- borda suave como principal separador
- azul como ação e orientação
- verde como confirmação
- amarelo/âmbar para risco ou aviso
- cards como unidade principal de composição
- pouca ornamentação
- forte consistência entre páginas

### densidade da interface

O dashboard trabalha com densidade intermediária:

- mais espaçado que o admin
- menos “heroizado” que a homepage
- suficiente para comportar muitos estados sem parecer apertado

### tom geral

- clean
- robusto
- orientado a uso real
- mais utilitário do que comercial
- mais humano do que técnico

## design tokens

### tokens em JSON

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
    "warning": "#F59E0B",
    "warningForeground": "#FFFFFF",
    "error": "#EF4343",
    "errorForeground": "#FFFFFF",
    "info": "#0EA5E9",
    "infoForeground": "#FFFFFF",
    "sidebar": {
      "background": "#FFFFFF",
      "foreground": "#65707E",
      "activeBackground": "#007BFF",
      "activeForeground": "#FFFFFF",
      "hoverBackground": "#F0F2F4",
      "border": "#E1E7EF"
    }
  },
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
      "relaxed": 1.625
    }
  },
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
    "lg": "12px",
    "xl": "16px",
    "2xl": "24px"
  },
  "shadow": {
    "sm": "0 1px 2px 0 rgba(29, 37, 48, 0.05)",
    "md": "0 4px 6px -1px rgba(29, 37, 48, 0.08), 0 2px 4px -2px rgba(29, 37, 48, 0.05)",
    "card": "0 2px 8px -2px rgba(29, 37, 48, 0.10), 0 1px 2px -1px rgba(29, 37, 48, 0.05)",
    "cardHover": "0 12px 24px -6px rgba(0, 123, 255, 0.15), 0 4px 8px -2px rgba(29, 37, 48, 0.08)"
  },
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

### papel das cores

- `color.background`: fundo macro do dashboard
- `color.surface`: cards, sidebar, header e overlays
- `color.surfaceAlt`: hovers leves, agrupamentos e estados neutros
- `color.primary`: CTA principal, item ativo, links e foco
- `color.success`: confirmação, perfil verificado, pagamentos concluídos
- `color.warning`: prazo, atenção, SLA, pendência
- `color.error`: bloqueios, exclusão, falhas
- `color.info`: estados informativos e destaque leve
- `color.border`: principal delimitador estrutural

### gradientes

O dashboard usa gradientes de forma pontual, nunca estrutural.
Eles aparecem mais em:

- cards especiais de indicação/afiliado
- pequenos realces premium

Regra:

- usar gradiente apenas para enfatizar blocos especiais
- evitar gradiente em listas, tabelas, shell e formulários

## especificação de layout

### shell principal

Referência principal: `src/components/layout/UserLayout.tsx`

Estrutura:

1. `Navbar` global do produto
2. `ImpersonationBar`, widgets e prompts globais
3. área principal do dashboard em `flex`
4. sidebar lateral do painel
5. conteúdo central
6. quick-nav fixa no mobile
7. widgets persistentes como notificações e chat

### layout base

```tsx
<div className="flex min-h-screen flex-col bg-background">
  <Navbar />
  <div className="flex flex-1 bg-secondary/10">
    <aside className="w-72 lg:w-64 bg-card border-r" />
    <main className="flex min-w-0 flex-1 flex-col">
      <header className="lg:hidden" />
      <div className="mx-auto w-full max-w-6xl flex-1 p-3 pt-4 md:p-8" />
    </main>
  </div>
</div>
```

### largura e container

- largura máxima do conteúdo: `max-w-6xl`
- o dashboard não ocupa toda a largura ilimitada
- isso cria leitura mais confortável e reduz fadiga

### paddings principais

- mobile: `p-3 pt-4`
- desktop: `p-8`
- mobile adiciona `pb-28` para compensar a navegação fixa inferior

### sidebar

- mobile aberta como drawer overlay
- desktop sticky
- `w-72` no drawer e `w-64` no desktop
- altura desktop: `calc(100vh - 4rem)` por causa do navbar

### ritmo vertical

Padrões recorrentes:

- página: `space-y-6`
- áreas grandes: `space-y-8`
- blocos internos: `space-y-4`
- microtexto e labels: `space-y-1` a `space-y-2`

### grids principais

Padrões recorrentes:

- overview: `grid gap-6 md:grid-cols-2`
- profile: `grid gap-6 lg:grid-cols-3`
- notices: `grid gap-6 md:grid-cols-2 lg:grid-cols-3`
- affiliate KPIs: `grid gap-4 md:grid-cols-5`
- formulários densos: `grid gap-4 md:grid-cols-2`

### desktop

- sidebar fixa visível
- header contextual interno desaparece
- conteúdo centralizado
- cards respiram mais

### tablet

- grids quebram parcialmente
- sidebar continua desktop em `lg`; abaixo disso vira overlay
- formulários começam a empilhar

### mobile

- header contextual sticky no topo
- bottom quick-nav fixa
- sidebar acessada por botão “Mais”
- tabelas mantidas com scroll horizontal
- cards empilhados em uma coluna

## especificação de navegação

### organização da navegação

A navegação do dashboard é por perfil:

- profissional
- empresa
- família
- afiliado

O menu lateral muda conforme o papel do usuário.

### áreas sempre visíveis

- navbar global do produto
- shell do dashboard
- sidebar ou quick-nav
- widgets de notificação e suporte

### como o contexto atual é indicado

- item ativo da sidebar com `bg-primary text-primary-foreground`
- quick-nav mobile com o mesmo princípio
- título da página no header mobile
- nome da seção como heading da página

### como o usuário entende onde está

- hierarquia visual consistente
- seção ativa destacada na navegação
- títulos explícitos como `Meus Dados`, `Meus Contatos`, `Mural de Avisos`, `Pagamentos`
- subtítulos descritivos logo abaixo

### como ações principais são destacadas

- botões primários azuis
- cards com `bg-primary/5` para ações guiadas
- badges e banners para urgência e status
- CTA principal quase sempre no topo da página ou dentro do card central

### como conteúdos secundários aparecem sem poluir

- texto auxiliar pequeno e muted
- accordions/collapsibles em casos densos
- dialogs para tarefas episódicas
- tooltips para explicações pequenas
- cards secundários à direita ou abaixo do bloco principal

### lógica de navegação por papel

#### profissional

- início
- meus dados
- contatos
- mural
- cursos
- indicações
- pagamentos
- suporte

#### empresa

- início
- meus dados
- contatos
- mural
- meus pacientes
- buscar profissionais
- suporte

#### família

- início
- meus dados
- contatos
- mural
- buscar profissionais
- suporte

#### afiliado

- início
- afiliados
- kit de mídia
- meus dados
- suporte

### bloqueio operacional na navegação

Quando a conta entra em revisão ou suspensão:

- o sistema mantém apenas o suporte acessível
- mostra banner âmbar
- substitui o conteúdo por `AccessRestricted`

Isso é um padrão comportamental central do dashboard.

## especificação de componentes

### nomes sugeridos de componentes

- `DashboardShell`
- `DashboardSidebar`
- `DashboardMobileHeader`
- `DashboardQuickNav`
- `DashboardSectionHeader`
- `DashboardStatCard`
- `DashboardActionCard`
- `DashboardAlertCard`
- `DashboardEmptyState`
- `DashboardTableCard`
- `DashboardFormSection`
- `DashboardSupportModal`

### shell do dashboard

Componente base:

- fundo macro `bg-background`
- subárea interna `bg-secondary/10`
- sidebar + main content
- widgets persistentes no final

### sidebar

Características:

- branca
- borda direita
- avatar do usuário no desktop
- labels curtas
- ícones pequenos
- active state azul

Classe representativa:

```tsx
<NavLink
  className={({ isActive }) =>
    cn(
      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
      isActive
        ? "bg-primary text-primary-foreground shadow-sm"
        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
    )
  }
/>
```

### header / topbar

No dashboard autenticado, o header contextual forte é mobile-only:

- sticky
- fundo translúcido claro com blur
- botão circular de menu
- título da página
- identificação resumida do usuário

```tsx
<header className="sticky top-0 z-[210] border-b border-border/70 bg-card/95 backdrop-blur-xl lg:hidden" />
```

### cards de resumo / KPIs

Padrões:

- `Card`
- título pequeno
- número grande `text-2xl font-bold`
- cor pontual por contexto
- ícone só quando ajuda

Usos:

- saldo de afiliado
- progresso de perfil
- indicação/embaixador
- status de assinatura

### cards operacionais

São o principal padrão do dashboard.

Tipos frequentes:

- card de ação rápida
- card de status
- card informativo
- card de tutorial/preferência
- card de retenção e billing

Características:

- `rounded-lg` ou `rounded-2xl`
- borda clara
- às vezes `bg-primary/5`, `bg-success/5`, `bg-amber-50`
- pouca sombra

### listas

O dashboard usa listas em cards para:

- histórico de cursos
- comissões
- payouts
- interações
- avisos

Estrutura:

- título no topo
- itens em coluna
- metadados pequenos
- ação lateral

### tabelas

Usadas quando o dado é mais operacional:

- pagamentos
- chamados
- pacientes

Padrão:

- cabeçalho simples
- linhas compactas
- coluna de ação à direita
- sem excesso de bordas internas visuais

### blocos de atalhos

O overview usa cards com links rápidos.
Eles costumam aparecer:

- como grid de ações
- em cards com ícone + texto + CTA

### formulários

O dashboard tem formulários extensos, principalmente em `ProfilePage`.

Padrões:

- cards por seção
- labels explícitas
- ajuda contextual pequena
- divisões por `Separator`
- CTA de salvar no final

### inputs

Base:

- `h-10`
- `rounded-md`
- borda `input`
- fundo branco
- placeholder muted

Variações:

- `h-8` para campos compactos
- leitura técnica usa `bg-muted`, `font-mono`, `text-xs`

### selects

Mesma família visual dos inputs:

- mesma altura
- mesmo border radius
- menu em popover branco
- item com foco em fundo accent

### switches / toggles

Usados em:

- visibilidade
- notificações
- onboarding automático
- preferências e controles operacionais

Visual:

- discretos
- valor semântico comunicado mais pelo contexto do card do que pela cor isolada

### botões

#### default

- azul sólido
- texto branco
- sombra média

#### outline

- branco
- borda clara
- usado para refresh, secundárias, abrir FAQs, ver detalhes

#### ghost

- ação leve
- usada em tabela/lista e navegação contextual

#### destructive

- vermelho sólido
- cancelamento e exclusão

### badges

Usados intensamente para:

- role
- plano
- status
- SLA
- visibilidade
- novo aviso

Padrão:

- `text-xs`
- forte contraste
- muitas customizações contextuais com classes utilitárias

### tabs

No dashboard do usuário, tabs aparecem menos que no admin, mas existem em modais e áreas segmentadas.
Quando usadas, seguem o componente global:

- trigger compacta
- ativo em superfície branca
- fundo base muted

### accordions / collapsibles

Usados quando o conteúdo é detalhado e precisa caber sem poluir:

- danger zone
- ajuda contextual
- features de plano

### drawers

O dashboard usa drawer principalmente para:

- sidebar mobile
- prompts auxiliares globais

### dialogs / modals

Muito usados para:

- novo ticket
- confirmação de exclusão
- confirmação final de conta
- contato
- revisão
- paciente

Padrões:

- `max-h-[90vh]`
- fundo branco
- borda às vezes removida em modais mais ricos
- sombra forte
- cabeçalho explícito

### alerts

Aparecem como cards ou banners embutidos:

- `bg-primary/5` para orientação
- `bg-amber-50` para aviso
- `bg-destructive/5` para erro
- `bg-success/5` para sucesso/validação

### toasts

Sistema principal: `sonner`

Padrão:

- largura até `420px`
- fundo branco
- borda clara
- sombra forte
- título forte e descrição muted

### paginação

Aparece em:

- contatos
- cursos

Formato:

- anterior / próximo
- indicação textual de página
- baixa complexidade

### filtros

No dashboard do usuário são mais leves que no admin.
Aparecem mais como:

- selects simples
- segmentações pequenas
- ordenação e estado de página

### busca

Não é onipresente no dashboard.
Quando existe, fica integrada ao card operacional, nunca como hero principal.

### uploads

Muito importantes em `ProfilePage` e `SupportTicketModal`.

Padrões:

- botão outline ou upload oculto
- spinner durante envio
- mensagem via toast
- preview ou nome do arquivo
- fluxo de crop para avatar

### empty state

Padrões:

- ícone central com opacidade baixa
- título curto
- texto explicativo
- às vezes CTA logo abaixo
- frequentemente em `rounded-2xl border border-dashed`

### padrão dos cards

#### tipos de card

- card de status
- card de ação
- card de explicação
- card de listagem
- card de formulário
- card de retenção
- card de notificação

#### padding

- padrão: `p-6`
- compacto: `p-4` ou `p-5`
- listagem densa: `p-0` no container, com espaçamento nas linhas

#### radius

- padrão visual recorrente: `rounded-2xl` nos blocos mais protagonistas
- `rounded-lg` ou `rounded-md` em estruturas internas

#### sombra

- baixa por padrão
- `shadow-sm` ou `shadow-card`
- hover mais forte em cards de aviso/mural

#### borda

- principal mecanismo de separação
- usada quase sempre
- dashed para vazio, upload ou estado intermediário

#### densidade

- média
- cards de overview são mais leves
- formulários são mais longos, mas bem seccionados

#### card principal vs secundário

- principal: usa cor de fundo leve, pode ter CTA e ícone
- secundário: branco puro, menos destaque, serve de apoio

### padrão de formulários

#### espaçamento

- seção: `space-y-6`
- campo: `grid gap-2`
- agrupamento em coluna: `grid gap-4 md:grid-cols-2`

#### agrupamento por blocos

- dados pessoais
- localização
- currículo
- atendimento
- paciente
- segurança
- zona de risco

#### labels

- diretas
- às vezes com ícone
- frequentemente com `text-xs uppercase` em grupos mais estruturais

#### placeholders

- objetivos
- orientados a exemplo real

#### mensagens de erro

- via `FormMessage` ou `toast.error`

#### mensagens de sucesso

- principalmente `toast.success`

#### loading em submit

- spinner dentro do botão
- botão desabilitado

#### prevenção de múltiplos envios

- `disabled={isSaving || isSubmitting}`
- locks durante upload e submit

#### 1 ou 2 colunas

- mobile: 1 coluna
- desktop: 2 colunas quando o conteúdo permite

#### mobile

- empilha tudo
- botões continuam claros
- dialogs rolam internamente

## estados visuais

### hover

- cards: leve sombra ou fundo secundário
- sidebar items: `bg-secondary`
- ghost buttons: tinta contextual
- mural: leve elevação e imagem com scale discreto

### focus

- `ring-2 ring-primary`
- consistente em inputs, selects, botões e tabs

### active

- botões com `scale(0.98)`
- navegação ativa em azul sólido

### selected

- menu e quick-nav ativos em `primary`
- tabs ativas em fundo branco

### disabled

- `opacity-50`
- sem hover real
- sem cursor funcional

### loading

Padrão principal:

- `Loader2 animate-spin`
- em área central para carregamento de página
- dentro de botão para ação assíncrona

### success

- verde
- perfil verificado
- pagamento concluído
- confirmação de atendimento

### error

- vermelho
- falha de carregamento
- exclusão
- conta bloqueada severamente

### warning

- âmbar
- revisão cautelar
- SLA
- renovação
- pendência

### empty state

- container claro
- ícone opaco
- cópia curta
- CTA opcional

### zero data state

Muito comum:

- “Nenhum curso encontrado”
- “Nenhum paciente cadastrado”
- “Seu mural está vazio”
- “Nenhum histórico de pagamento encontrado”

### bloqueio operacional

Muito importante no dashboard:

- revisão/suspensão de conta
- sem navegação ampla
- suporte permanece disponível
- uso de `AccessRestricted`

## responsividade

### breakpoints usados

- `sm 640`
- `md 768`
- `lg 1024`
- `xl 1280`
- `2xl 1400`

### sidebar no mobile

- vira drawer lateral
- overlay escuro
- abre por botão no header

### quick-nav mobile

O dashboard tem navegação inferior fixa própria:

- cartão flutuante
- fundo `bg-card/95`
- blur
- borda clara
- item ativo em azul

### grids

- 2 ou 3 colunas quebram para 1 no mobile
- 5 colunas de KPI quebram progressivamente

### cards

- empilham em 1 coluna
- mantêm padding confortável

### formulários

- reorganizam para 1 coluna
- seções permanecem separadas em cards

### tabelas e listas

- tabelas continuam tabelas
- usam scroll horizontal quando necessário
- listas e cards absorvem melhor o mobile

### componentes que mudam de estrutura no celular

- sidebar vira drawer
- aparece `DashboardMobileHeader`
- aparece `DashboardQuickNav`
- alguns CTAs passam de inline para full width

## regras de UX

### princípios de clareza

- cada página deve responder rapidamente:
  - onde estou
  - qual meu status
  - o que preciso fazer agora

### hierarquia visual

1. título da página
2. subtítulo
3. alertas/status
4. cards principais
5. dados secundários

### densidade ideal

- manter densidade média
- não comprimir como admin
- não abrir espaços excessivos como marketing

### equilíbrio entre simplicidade e operação

- shell simples
- estados ricos
- conteúdo progressivamente revelado
- formulários longos, mas claramente seccionados

### destacar ações importantes sem exagero

- usar azul para CTA principal
- usar fundo suave de apoio no card, não cores saturadas em tudo
- usar badges e alertas apenas quando necessário

### como evitar aparência genérica de dashboard SaaS

- não usar excesso de KPI sem motivo
- manter linguagem de produto real, não de template
- priorizar contexto de saúde/cuidado e suporte
- preservar quick-nav, banners de estado, cards explicativos e textos orientativos

## checklist de replicação

### o que é essencial preservar

- shell com sidebar + conteúdo centralizado + quick-nav mobile
- container `max-w-6xl`
- fundo claro com subárea `secondary/10`
- cards brancos com borda clara
- azul como ação e foco principal
- uso consistente de banners de status
- navegação por papel do usuário
- mobile com header contextual e quick-nav inferior
- formulários em cards seccionados
- empty states com ícone + texto + CTA opcional

### o que pode ser adaptado

- nomenclatura das seções
- número de itens da navegação
- copy textual
- conteúdo interno dos cards
- ícones específicos

### o que não deve ser alterado

- a hierarquia visual geral
- o equilíbrio entre acolhimento e utilidade
- a lógica de navegação contextual por perfil
- o padrão claro de status e restrição operacional
- o uso do sidebar no desktop e quick-nav no mobile

### decisões que mantêm o dashboard intuitivo

- manter títulos explícitos
- sempre mostrar contexto de status do usuário
- separar bem ações principais de conteúdos de apoio
- não esconder funcionalidades críticas atrás de interações obscuras
- usar cor como semântica, não decoração

## exemplos práticos de classes

### seção de página

```tsx
<div className="space-y-6">
  <div className="flex flex-col gap-1">
    <h1 className="text-2xl font-bold tracking-tight">Meus Dados</h1>
    <p className="text-muted-foreground">Gerencie seu perfil e documentos.</p>
  </div>
</div>
```

### card de status

```tsx
<Card className="border-primary/10 bg-primary/5">
  <CardContent className="p-5">
    <p className="font-semibold text-foreground">SLA público de primeira resposta</p>
    <p className="mt-1 text-sm text-muted-foreground">
      Pagamentos em até 2 horas úteis. Demais categorias em até 24 horas úteis.
    </p>
  </CardContent>
</Card>
```

### shell de navegação

```tsx
<div className="flex flex-1 bg-secondary/10">
  <aside className="w-72 lg:w-64 border-r border-border bg-card" />
  <main className="flex min-w-0 flex-1 flex-col">
    <div className="mx-auto w-full max-w-6xl flex-1 p-3 pt-4 md:p-8" />
  </main>
</div>
```

### card operacional com CTA

```tsx
<Card>
  <CardHeader>
    <CardTitle className="text-base">Gerenciar Assinatura</CardTitle>
  </CardHeader>
  <CardContent className="space-y-4">
    <Badge variant="outline">Plano Mensal</Badge>
    <Button className="w-full gap-2">Gerenciar Assinatura</Button>
  </CardContent>
</Card>
```

### tabela do dashboard

```tsx
<Card>
  <CardContent className="p-0">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Assunto</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Ações</TableHead>
        </TableRow>
      </TableHeader>
    </Table>
  </CardContent>
</Card>
```

### empty state

```tsx
<div className="text-center py-20 bg-card rounded-2xl border border-dashed flex flex-col items-center justify-center">
  <Inbox className="h-8 w-8 text-muted-foreground opacity-20" />
  <h3 className="text-lg font-semibold">Seu mural está vazio</h3>
  <p className="text-sm text-muted-foreground">Você não possui avisos no momento.</p>
</div>
```

## pseudocódigo visual em react / tailwind

```tsx
export function DashboardShell() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <div className="flex flex-1 bg-secondary/10">
        <DashboardSidebar />
        <main className="flex min-w-0 flex-1 flex-col">
          <DashboardMobileHeader />
          <div className="mx-auto w-full max-w-6xl flex-1 p-3 pt-4 md:p-8">
            <Outlet />
          </div>
        </main>
      </div>
      <DashboardQuickNavMobile />
      <UserNotificationWidget />
      <SupportChatWidget context="dashboard" />
    </div>
  );
}
```

```tsx
export function DashboardSectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}
```

## estrutura ideal de arquivos para replicação

```text
src/
  components/
    dashboard/
      DashboardShell.tsx
      DashboardSidebar.tsx
      DashboardMobileHeader.tsx
      DashboardQuickNav.tsx
      DashboardSectionHeader.tsx
      DashboardStatCard.tsx
      DashboardActionCard.tsx
      DashboardAlertCard.tsx
      DashboardEmptyState.tsx
      DashboardTableCard.tsx
      DashboardFormSection.tsx
    account/
      ProfileForm.tsx
      UploadField.tsx
      VerificationCard.tsx
      BillingSummaryCard.tsx
    support/
      SupportTicketModal.tsx
      TicketList.tsx
      TicketSlaBadge.tsx
    interactions/
      InteractionHistory.tsx
      InteractionProfileModal.tsx
    notices/
      NoticeCard.tsx
    ui/
      button.tsx
      input.tsx
      select.tsx
      switch.tsx
      badge.tsx
      card.tsx
      table.tsx
      dialog.tsx
      alert-dialog.tsx
      toast.tsx
      sonner.tsx
  pages/
    dashboard/
      OverviewPage.tsx
      ProfilePage.tsx
      PaymentsPage.tsx
      SupportTicketsPage.tsx
      InteractionsPage.tsx
      AcademyPage.tsx
      NoticesPage.tsx
      CompanyPatientsPage.tsx
      AffiliatesPage.tsx
  styles/
    tokens.css
    dashboard.css
```

## fontes reais de referência no repositório

- `src/components/layout/UserLayout.tsx`
- `src/pages/dashboard/OverviewPage.tsx`
- `src/pages/dashboard/ProfilePage.tsx`
- `src/pages/dashboard/PaymentsPage.tsx`
- `src/pages/dashboard/SupportTicketsPage.tsx`
- `src/pages/dashboard/InteractionsPage.tsx`
- `src/pages/dashboard/AcademyPage.tsx`
- `src/pages/dashboard/CompanyPatientsPage.tsx`
- `src/pages/dashboard/AffiliatesPage.tsx`
- `src/pages/dashboard/NoticesPage.tsx`
- `src/components/InteractionHistory.tsx`
- `src/components/SupportTicketModal.tsx`
- `src/components/CompanyPatientForm.tsx`
- `src/components/CourseSummaryList.tsx`
- `src/index.css`
- `tailwind.config.ts`

