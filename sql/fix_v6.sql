-- ─── fix_v6.sql ─────────────────────────────────────────────────
-- Execute no Supabase SQL Editor

-- 1. Tabela de salas
CREATE TABLE IF NOT EXISTS rooms (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT    NOT NULL UNIQUE,
  size       TEXT    CHECK (size IN ('large','medium','small')),
  capacity   INTEGER,
  sort_order INTEGER DEFAULT 0
);

INSERT INTO rooms (name, size, capacity, sort_order) VALUES
  ('Marcos Caruso', 'large',  60, 1),
  ('Lucia Capuani', 'large',  40, 2),
  ('Martins Pena',  'medium', 25, 3),
  ('Stanislavski',  'medium', 25, 4),
  ('Sala de Video', 'small',  15, 5),
  ('Saguao',        'small',  20, 6)
ON CONFLICT (name) DO NOTHING;

-- 2. Campo de sala nas turmas
ALTER TABLE classes ADD COLUMN IF NOT EXISTS room_id   UUID REFERENCES rooms(id);
ALTER TABLE classes ADD COLUMN IF NOT EXISTS room_name TEXT;

-- 3. Reservas de sala (Marcos Caruso e outras)
CREATE TABLE IF NOT EXISTS room_bookings (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at           TIMESTAMPTZ DEFAULT now(),
  room_id              UUID        REFERENCES rooms(id),
  room_name            TEXT,
  teacher_id           UUID,
  teacher_name         TEXT,
  class_name           TEXT,
  piece                TEXT,
  reason               TEXT,
  booking_date         DATE        NOT NULL,
  start_time           TIME        NOT NULL,
  end_time             TIME        NOT NULL,
  technical_responsible TEXT,
  status               TEXT        DEFAULT 'approved',
  notes                TEXT
);

-- 4. Solicitações de troca de sala
CREATE TABLE IF NOT EXISTS room_change_requests (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     TIMESTAMPTZ DEFAULT now(),
  teacher_id     UUID,
  teacher_name   TEXT,
  class_id       UUID        REFERENCES classes(id),
  class_name     TEXT,
  current_room   TEXT,
  requested_room TEXT,
  reason         TEXT,
  status         TEXT        DEFAULT 'pending'
);

-- 5. Propostas de reunião
CREATE TABLE IF NOT EXISTS meeting_proposals (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ DEFAULT now(),
  created_by       UUID,
  created_by_name  TEXT,
  title            TEXT        NOT NULL,
  description      TEXT,
  proposed_date    DATE        NOT NULL,
  proposed_time    TIME,
  status           TEXT        DEFAULT 'voting'
);

-- 6. Respostas às propostas de reunião
CREATE TABLE IF NOT EXISTS meeting_responses (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ DEFAULT now(),
  proposal_id      UUID        REFERENCES meeting_proposals(id) ON DELETE CASCADE,
  user_id          UUID,
  user_name        TEXT,
  response         TEXT        CHECK (response IN ('confirmed','rejected')),
  alternative_date DATE,
  message          TEXT
);
ALTER TABLE meeting_responses DROP CONSTRAINT IF EXISTS meeting_resp_unique;
ALTER TABLE meeting_responses ADD CONSTRAINT meeting_resp_unique UNIQUE (proposal_id, user_id);

-- 7. Notificações in-app
CREATE TABLE IF NOT EXISTS notifications (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ DEFAULT now(),
  user_id      UUID,
  title        TEXT        NOT NULL,
  body         TEXT,
  type         TEXT,
  reference_id UUID,
  read         BOOLEAN     DEFAULT false
);

-- ─── RLS ─────────────────────────────────────────────────────
ALTER TABLE rooms                ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_bookings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_proposals    ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_responses    ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications        ENABLE ROW LEVEL SECURITY;

-- Salas: todos autenticados leem; só admin escreve (via app)
DROP POLICY IF EXISTS "rooms_select" ON rooms;
CREATE POLICY "rooms_select" ON rooms FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "rooms_all"    ON rooms FOR ALL   WITH CHECK (auth.role() = 'authenticated');

-- Reservas: todos leem; dono cancela; admin gerencia
DROP POLICY IF EXISTS "bookings_select" ON room_bookings;
CREATE POLICY "bookings_select" ON room_bookings FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "bookings_all"    ON room_bookings FOR ALL   WITH CHECK (auth.role() = 'authenticated');

-- Pedidos de troca
CREATE POLICY "chgreq_select" ON room_change_requests FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "chgreq_all"    ON room_change_requests FOR ALL   WITH CHECK (auth.role() = 'authenticated');

-- Reuniões
CREATE POLICY "propsal_select" ON meeting_proposals FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "propsal_all"    ON meeting_proposals FOR ALL   WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "mresp_select" ON meeting_responses FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "mresp_all"    ON meeting_responses FOR ALL   WITH CHECK (auth.role() = 'authenticated');

-- Notificações: cada usuário vê as próprias; admin vê tudo
CREATE POLICY "notif_select" ON notifications FOR SELECT
  USING (auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "notif_insert" ON notifications FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "notif_update" ON notifications FOR UPDATE USING (auth.uid() = user_id);

-- ─── Verificação ──────────────────────────────────────────────
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('rooms','room_bookings','room_change_requests',
                     'meeting_proposals','meeting_responses','notifications');
