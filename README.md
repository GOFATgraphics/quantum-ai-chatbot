# Quantum AI Chatbot

Premium mobile-first AI chatbot with **Supabase Auth + conversation history**.

## Phase 1 Features (current)

- Beautiful, smooth UI matching modern design systems
- Supabase authentication (email + password)
- Persistent conversation history per user
- Sidebar with past chats
- Secure xAI / Grok proxy (API key never exposed to browser)
- Voice input
- Model selector

## Setup

### 1. Supabase Database

Go to your Supabase project → **SQL Editor** → New query and run this:

```sql
-- Conversations table
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Messages table
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  role text check (role in ('user', 'assistant')) not null,
  content text not null,
  created_at timestamptz default now() not null
);

-- Indexes
create index conversations_user_id_idx on public.conversations(user_id);
create index messages_conversation_id_idx on public.messages(conversation_id);

-- Enable RLS
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- Policies: users can only see/edit their own data
create policy "Users can view own conversations"
  on public.conversations for select
  using (auth.uid() = user_id);

create policy "Users can insert own conversations"
  on public.conversations for insert
  with check (auth.uid() = user_id);

create policy "Users can update own conversations"
  on public.conversations for update
  using (auth.uid() = user_id);

create policy "Users can delete own conversations"
  on public.conversations for delete
  using (auth.uid() = user_id);

create policy "Users can view messages of own conversations"
  on public.messages for select
  using (
    exists (
      select 1 from public.conversations
      where conversations.id = messages.conversation_id
      and conversations.user_id = auth.uid()
    )
  );

create policy "Users can insert messages into own conversations"
  on public.messages for insert
  with check (
    exists (
      select 1 from public.conversations
      where conversations.id = messages.conversation_id
      and conversations.user_id = auth.uid()
    )
  );
```

### 2. Environment Variables

**Local (`.env` file):**

```env
VITE_SUPABASE_URL=https://ypzrczwyfvqlydeocbmm.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_public_key_here
```

**Vercel:**

Add the same two variables + the existing `XAI_API_KEY` in Project Settings → Environment Variables.

> Get the anon key from Supabase → Project Settings → API → `anon` `public`

### 3. Run locally

```bash
npm install
npm run dev
```

### 4. Deploy

Push to GitHub. Vercel will redeploy automatically. Make sure the three env vars are set.

## Next Phases

- **Phase 2**: Google OAuth + Gmail / Drive / Sheets search tools
- **Phase 3**: Multi-source orchestration + more providers

## Security notes

- API key stays on the server only (`XAI_API_KEY`)
- All chat data is protected by Row Level Security
- Users can only see their own conversations
