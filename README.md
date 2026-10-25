# Pauta

Aplicativo pessoal para organizar tarefas, listas e notas, com sincronização pelo Supabase.

## Configuração

1. Crie um projeto no Supabase.
2. No **SQL Editor**, execute [`supabase.sql`](./supabase.sql). O script cria as tabelas usadas pelo app, ativa políticas de acesso por usuário, configura o bucket privado de anexos e habilita Realtime quando disponível. Ele também adiciona os campos mais recentes às tabelas existentes (incluindo checklist de tarefas e posição das notas) e converte prazos para o formato de data usado pelo app.
3. Em **Authentication > URL Configuration**, configure a URL local (`http://localhost:5173`) e, quando publicar, adicione também a URL de produção às URLs permitidas para redirecionamento.
4. Copie `.env.example` para `.env` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` com os valores de **Project Settings > API**. A chave `VITE_VAPID_PUBLIC_KEY` é opcional e só é necessária para habilitar notificações push.
5. Execute `npm install` e `npm run dev`.

Use somente a chave pública/anon no frontend. Nunca coloque uma `service_role` key no `.env` do app nem no código do navegador.

Filtros personalizados são salvos no armazenamento local do navegador e não são sincronizados entre aparelhos. A visualização **Semana** apresenta um calendário de segunda a domingo; os botões de navegação permitem consultar semanas anteriores e seguintes.

## Organização do código

- `src/app`: inicialização do React, composição principal da aplicação e estilos globais.
- `src/features`: funcionalidades agrupadas por domínio — autenticação, tarefas, notas, navegação e ajustes.
- `src/components`: componentes reutilizáveis entre funcionalidades.
- `src/lib`: acesso ao Supabase, dados compartilhados, tipos e utilitários.
- `sw`: service worker da PWA e notificações.
- `public`: ícones e recursos estáticos.

## Contas e e-mail

O cadastro pode exigir confirmação por e-mail, conforme a configuração do provedor Email no Supabase. Em desenvolvimento, a confirmação pode ser desativada em **Authentication > Providers > Email**. Em produção, mantenha a confirmação habilitada e configure os modelos de e-mail e URLs de redirecionamento.

## Migração de um projeto existente

Faça uma cópia dos dados antes de alterar o banco. O script é idempotente para as tabelas e campos mantidos pelo app e preserva registros existentes. Se `tasks.due_at` ainda for timestamp, o valor original fica guardado em `tasks.due_at_legacy` antes de a coluna ser convertida para data; o app guarda novos horários de lembrete separadamente em `due_time`. Execute o SQL no projeto Supabase que já contém os dados do Pauta.

Depois da migração, abra o app e confirme que tarefas, listas, notas e anexos carregam. Se a tabela de anexos ainda não existia, o bucket privado também será criado pelo script.
