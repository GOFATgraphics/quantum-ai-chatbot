-- Full-text search across chat contents.
--
-- Sidebar search only ever matched conversation titles, which are themselves
-- model-generated summaries — so a chat was findable by what it was called and
-- not by anything actually said in it. This indexes message bodies.
--
-- Run once in the Supabase SQL editor. Adding the generated column rewrites the
-- messages table, so expect it to take a moment on a large history.

-- ---------------------------------------------------------------------------
-- 1. Indexed search vector.
--
--    Two guards in the expression, both load-bearing:
--
--    Attachments are stored inline in message content as data: URLs, and a
--    single photo or PDF runs to megabytes of base64. tsvector has a hard 1MB
--    ceiling, and a generated column is computed on every insert — so without
--    stripping them, attaching a file would not degrade search, it would make
--    the INSERT fail and lose the message. They are cut first, then the result
--    is capped as a backstop for anything else oversized.
--
--    to_tsvector must be given an explicit config. The single-argument form
--    reads default_text_search_config at runtime, which makes it STABLE rather
--    than IMMUTABLE, and Postgres refuses it in a generated column.
-- ---------------------------------------------------------------------------
alter table public.messages
  add column if not exists content_tsv tsvector
  generated always as (
    to_tsvector(
      'english',
      left(regexp_replace(coalesce(content, ''), '\(data:[^)]*\)', '', 'g'), 200000)
    )
  ) stored;

create index if not exists messages_content_tsv_idx
  on public.messages using gin (content_tsv);

-- ---------------------------------------------------------------------------
-- 2. Search entry point.
--
--    SECURITY INVOKER, deliberately: the function runs as the caller, so the
--    existing RLS policy on messages (ownership through the parent
--    conversation) applies unchanged and a user can only ever search their own
--    history. A SECURITY DEFINER function here would have to re-implement that
--    check by hand, and would leak everyone's chats if it got it wrong.
-- ---------------------------------------------------------------------------
create or replace function public.search_chat_messages(q text, max_results integer default 30)
returns table (
  conversation_id uuid,
  title text,
  snippet text,
  matched_at timestamptz,
  rank real
)
language sql
stable
security invoker
set search_path = public
as $$
  with query as (
    -- websearch_to_tsquery accepts what people actually type: bare words,
    -- "quoted phrases", or -excluded. Unlike to_tsquery it cannot raise a
    -- syntax error mid-keystroke.
    select websearch_to_tsquery('english', coalesce(q, '')) as tsq
  ),
  hits as (
    select
      m.conversation_id,
      m.content,
      m.created_at,
      ts_rank(m.content_tsv, query.tsq) as rank,
      -- One result per conversation: its best-matching message. Otherwise a
      -- long thread about one topic floods the whole result list.
      row_number() over (
        partition by m.conversation_id
        order by ts_rank(m.content_tsv, query.tsq) desc, m.created_at desc
      ) as rn
    from public.messages m, query
    where query.tsq is not null
      and m.content_tsv @@ query.tsq
  )
  select
    h.conversation_id,
    c.title,
    -- Matches are wrapped in guillemets rather than HTML: the client splits on
    -- them to bold the hit, so message text never has to be rendered as markup.
    ts_headline(
      'english',
      left(regexp_replace(h.content, '\(data:[^)]*\)', '', 'g'), 4000),
      (select tsq from query),
      'StartSel=«,StopSel=»,MaxWords=26,MinWords=10,ShortWord=3,MaxFragments=1,FragmentDelimiter= … '
    ) as snippet,
    h.created_at as matched_at,
    h.rank
  from hits h
  join public.conversations c on c.id = h.conversation_id
  where h.rn = 1
  order by h.rank desc, h.created_at desc
  limit least(greatest(coalesce(max_results, 30), 1), 100);
$$;

-- anon has no business searching anything; authenticated is filtered by RLS.
revoke all on function public.search_chat_messages(text, integer) from public, anon;
grant execute on function public.search_chat_messages(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Verify — should return your own matching chats and nothing else.
-- ---------------------------------------------------------------------------
-- select * from public.search_chat_messages('demurrage', 10);
