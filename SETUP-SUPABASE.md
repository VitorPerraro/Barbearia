# Configurar Supabase — NOIR BARBER

Siga estes passos para conectar o site ao banco de dados e login seguro.

## 1. Criar projeto no Supabase

1. Acesse [https://supabase.com](https://supabase.com) e crie uma conta (grátis).
2. **New Project** → escolha nome, senha do banco e região.
3. Aguarde o projeto ficar pronto (~2 min).

## 2. Criar tabelas no banco

1. No painel: **SQL Editor** → **New query**.
2. Abra o arquivo `supabase/schema.sql` deste projeto, copie todo o conteúdo e cole no editor.
3. Clique em **Run**. Deve aparecer “Success”.

## 3. Criar usuário do barbeiro (senha segura no servidor)

1. No painel: **Authentication** → **Users** → **Add user** → **Create new user**.
2. Preencha:
   - **Email:** ex. `barbeiro@noirbarber.com.br`
   - **Password:** uma senha forte (mín. 8 caracteres)
   - Marque **Auto Confirm User** (para não precisar confirmar e-mail).
3. Salve. **Guarde e-mail e senha** — use no painel `barbeiro.html`.

A senha fica criptografada no Supabase (não no navegador).

## 4. Conectar o site ao Supabase

1. No painel: **Project Settings** → **API**.
2. Copie:
   - **Project URL**
   - **anon public** (chave pública)
3. Edite o arquivo `js/supabase-config.js`:

```javascript
window.NOIR_SUPABASE = {
  url: 'https://xxxx.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
};
```

4. Salve e abra o site no navegador.

## 5. Testar

1. **Site público** (`index.html`): faça um agendamento de teste.
2. **Painel** (`barbeiro.html`): entre com o e-mail e senha criados no passo 3.
3. No Supabase: **Table Editor** → `bookings` — o agendamento deve aparecer lá.

## Segurança (o que já está configurado)

| Recurso | Como funciona |
|--------|----------------|
| Senha do barbeiro | Supabase Auth (hash no servidor) |
| Agendamentos | Tabela `bookings` com RLS |
| Site público | Só pode **criar** agendamento e consultar horários ocupados (função `get_busy_times`) |
| Painel | Só usuário **autenticado** vê/edita/cancela agendamentos e bloqueios |

## Publicar na internet

Hospede os arquivos (Netlify, Vercel, GitHub Pages, etc.) com HTTPS.

**Importante:** a chave `anon` pode ficar no front-end; a segurança vem das políticas RLS no Supabase. Nunca exponha a chave `service_role`.

## Alterar senha

No painel → **Segurança**, com a sessão ativa. A senha atual é validada antes da troca.

## Validação de horários bloqueados no site

Execute no SQL Editor:

`supabase/migration-slot-check.sql`

Isso cria a função `is_slot_available` e corrige `get_busy_times` para respeitar bloqueios por intervalo.

## Erro: coluna `end_time` não encontrada

Se ao bloquear horário aparecer *Could not find the 'end_time' column*:

1. Abra o **SQL Editor** no Supabase
2. Execute o arquivo **`supabase/fix-end-time-column.sql`** (Run)
3. Aguarde alguns segundos e tente bloquear de novo

O site também funciona em **modo compatível** (vários registros por intervalo) até você rodar esse SQL.

## Bloqueio por período (intervalo)

Se o projeto já existia antes desta função, execute também:

`supabase/migration-block-ranges.sql` ou o `fix-end-time-column.sql` acima (recomendado).

## Problemas comuns

- **“Configure o Supabase”** → `supabase-config.js` ainda tem valores de exemplo.
- **Erro ao agendar** → executou o `schema.sql`? RLS ativo?
- **Login não funciona** → usuário criado em Authentication com “Auto Confirm”?
- **E-mail não confirmado** → marque Auto Confirm ou confirme manualmente no painel Users.
