-- ─── fix_v11.sql ─────────────────────────────────────────────────
-- Seed realista: 6 alunos com dados completos, 3 turmas, matrículas
-- e pagamentos variados (alguns em dia, outros inadimplentes, outros
-- quitados). Frequência das últimas 3 semanas.
-- Parece que o sistema está rodando desde Janeiro/2026.
--
-- Execute no Supabase SQL Editor.

-- ─── 0. Limpar dados sandbox anteriores (ambos os ranges de UUID) ─
DELETE FROM payments WHERE student_id IN (
  SELECT id FROM students WHERE is_sandbox = true
);
DELETE FROM attendance WHERE enrollment_id IN (
  SELECT id FROM enrollments WHERE is_sandbox = true
);
DELETE FROM room_schedules WHERE class_id IN (
  SELECT id FROM classes WHERE is_sandbox = true
);
DELETE FROM room_change_requests WHERE class_id IN (
  SELECT id FROM classes WHERE is_sandbox = true
);
DELETE FROM enrollments  WHERE is_sandbox = true;
DELETE FROM classes      WHERE is_sandbox = true;
DELETE FROM students     WHERE is_sandbox = true;
DELETE FROM courses      WHERE is_sandbox = true;

-- ─── 1. Cursos ────────────────────────────────────────────────────
INSERT INTO courses (id, name, type, level, workload, is_sandbox) VALUES
  ('c2000001-0000-4000-8000-000000000001', '[TESTE] Teatro Basico',          'regular',    1,   120, true),
  ('c2000002-0000-4000-8000-000000000002', '[TESTE] Teatro Avancado',        'regular',    3,   150, true),
  ('c2000003-0000-4000-8000-000000000003', '[TESTE] A Peca Que Deu Errado',  'production', null, 80, true)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_sandbox = true;

-- ─── 2. Turmas (vinculadas aos professores existentes) ────────────
DO $$
DECLARE
  v_t1  UUID;
  v_t2  UUID;
  v_rm1 UUID;
  v_rm2 UUID;
BEGIN
  SELECT id INTO v_t1 FROM profiles WHERE role = 'teacher' ORDER BY created_at LIMIT 1;
  SELECT id INTO v_t2 FROM profiles WHERE role = 'teacher' ORDER BY created_at OFFSET 1 LIMIT 1;
  IF v_t1 IS NULL THEN SELECT id INTO v_t1 FROM profiles ORDER BY created_at LIMIT 1; END IF;
  IF v_t2 IS NULL THEN v_t2 := v_t1; END IF;

  SELECT id INTO v_rm1 FROM rooms WHERE name ILIKE '%Martins%'  LIMIT 1;
  SELECT id INTO v_rm2 FROM rooms WHERE name ILIKE '%Stanisla%' LIMIT 1;

  INSERT INTO classes (id, course_id, teacher_id, day_of_week, schedule,
                       start_date, end_date, status, room_id, room_name, is_sandbox)
  VALUES
    ('b2000001-0000-4000-8000-000000000001',
     'c2000001-0000-4000-8000-000000000001', v_t1,
     'monday', '19:00:00', '2026-01-01', '2026-12-01',
     'active', v_rm1, 'Martins Pena', true),

    ('b2000002-0000-4000-8000-000000000002',
     'c2000002-0000-4000-8000-000000000002', v_t2,
     'wednesday', '18:30:00', '2026-01-01', '2026-12-01',
     'active', v_rm2, 'Stanislavski', true),

    ('b2000003-0000-4000-8000-000000000003',
     'c2000003-0000-4000-8000-000000000003', v_t1,
     'friday', '20:00:00', '2026-03-01', '2026-07-01',
     'active', v_rm1, 'Martins Pena', true)
  ON CONFLICT (id) DO UPDATE
    SET teacher_id = EXCLUDED.teacher_id,
        room_id    = EXCLUDED.room_id,
        is_sandbox = true;
END;
$$;

-- ─── 3. Alunos com dados pessoais completos ───────────────────────
INSERT INTO students (
  id, ra, name, email, birth_date, cpf, rg, student_phone,
  contractor_name, address, address_number, neighborhood,
  city, state, status, is_sandbox
) VALUES
  -- S1: Boa pagadora
  ('a2000001-0000-4000-8000-000000000001',
   '2026RE001', '[TESTE] Ana Carolina Ferreira', 'ana.ferreira@exemplo.com',
   '2008-03-15', '111.222.333-44', 'MG-1234567', '(11) 98765-4321',
   'Roberto Ferreira', 'Rua das Flores', '123',
   'Jardim Paulista', 'Sao Paulo', 'SP', 'active', true),

  -- S2: Inadimplente
  ('a2000002-0000-4000-8000-000000000002',
   '2026RE002', '[TESTE] Bruno Henrique Oliveira', 'bruno.oliveira@exemplo.com',
   '2010-07-22', '222.333.444-55', 'SP-2345678', '(11) 97654-3210',
   'Claudia Oliveira', 'Av. Paulista', '456',
   'Bela Vista', 'Sao Paulo', 'SP', 'active', true),

  -- S3: Boa pagadora
  ('a2000003-0000-4000-8000-000000000003',
   '2026RE003', '[TESTE] Carla Beatriz Mendes', 'carla.mendes@exemplo.com',
   '2007-11-08', '333.444.555-66', 'SP-3456789', '(11) 96543-2109',
   'Carla Beatriz Mendes', 'Rua Augusta', '789',
   'Consolacao', 'Sao Paulo', 'SP', 'active', true),

  -- S4: Atrasou somente maio
  ('a2000004-0000-4000-8000-000000000004',
   '2026RE004', '[TESTE] Diego Augusto Lima', 'diego.lima@exemplo.com',
   '2009-04-30', '444.555.666-77', 'SP-4567890', '(11) 95432-1098',
   'Patricia Lima', 'Rua Oscar Freire', '321',
   'Cerqueira Cesar', 'Sao Paulo', 'SP', 'active', true),

  -- S5: Muito inadimplente (3 meses em atraso)
  ('a2000005-0000-4000-8000-000000000005',
   '2026RE005', '[TESTE] Emilia Santos Costa', 'emilia.costa@exemplo.com',
   '2011-09-14', '555.666.777-88', 'RJ-5678901', '(11) 94321-0987',
   'Fernanda Costa', 'Alameda Santos', '654',
   'Jardins', 'Sao Paulo', 'SP', 'active', true),

  -- S6: Producao — pagou pontual até agora, maio em atraso
  ('a2000006-0000-4000-8000-000000000006',
   '2026RE006', '[TESTE] Felipe Rodrigues Souza', 'felipe.souza@exemplo.com',
   '2006-01-28', '666.777.888-99', 'SP-6789012', '(11) 93210-9876',
   'Felipe Rodrigues Souza', 'Rua Consolacao', '987',
   'Higienopolis', 'Sao Paulo', 'SP', 'active', true)
ON CONFLICT (id) DO NOTHING;

-- ─── 4. Matrículas ────────────────────────────────────────────────
-- total_value = valor INTEGRAL (sem desconto) × parcelas
-- discount    = desconto POR PARCELA se pago até dia 12
-- R$250 com desconto = R$300 integral − R$50 desconto
DO $$
DECLARE
  v_nm1 TEXT; v_nm2 TEXT;
BEGIN
  SELECT name INTO v_nm1 FROM profiles WHERE role = 'teacher' ORDER BY created_at LIMIT 1;
  SELECT name INTO v_nm2 FROM profiles WHERE role = 'teacher' ORDER BY created_at OFFSET 1 LIMIT 1;
  IF v_nm1 IS NULL THEN SELECT name INTO v_nm1 FROM profiles ORDER BY created_at LIMIT 1; END IF;
  IF v_nm2 IS NULL THEN v_nm2 := v_nm1; END IF;

  INSERT INTO enrollments (
    id, student_id, class_id, piece_course, responsible_teacher,
    period_start, period_end, workload_label,
    total_value, discount, payment_installments, status, is_sandbox
  ) VALUES
    -- Turma 1: Teatro Basico (S1, S2, S3)
    ('e2000001-0000-4000-8000-000000000001',
     'a2000001-0000-4000-8000-000000000001', 'b2000001-0000-4000-8000-000000000001',
     '[TESTE] Teatro Basico', v_nm1, '2026-01', '2026-06', '120h',
     1800, 50, 6, 'active', true),

    ('e2000002-0000-4000-8000-000000000002',
     'a2000002-0000-4000-8000-000000000002', 'b2000001-0000-4000-8000-000000000001',
     '[TESTE] Teatro Basico', v_nm1, '2026-01', '2026-06', '120h',
     1800, 50, 6, 'active', true),

    ('e2000003-0000-4000-8000-000000000003',
     'a2000003-0000-4000-8000-000000000003', 'b2000001-0000-4000-8000-000000000001',
     '[TESTE] Teatro Basico', v_nm1, '2026-01', '2026-06', '120h',
     1800, 50, 6, 'active', true),

    -- Turma 2: Teatro Avancado (S4, S5)
    ('e2000004-0000-4000-8000-000000000004',
     'a2000004-0000-4000-8000-000000000004', 'b2000002-0000-4000-8000-000000000002',
     '[TESTE] Teatro Avancado', v_nm2, '2026-01', '2026-06', '150h',
     1800, 50, 6, 'active', true),

    ('e2000005-0000-4000-8000-000000000005',
     'a2000005-0000-4000-8000-000000000005', 'b2000002-0000-4000-8000-000000000002',
     '[TESTE] Teatro Avancado', v_nm2, '2026-01', '2026-06', '150h',
     1800, 50, 6, 'active', true),

    -- Turma 3: Producao (S6) — sem desconto, R$200/parcela, 4 parcelas
    ('e2000006-0000-4000-8000-000000000006',
     'a2000006-0000-4000-8000-000000000006', 'b2000003-0000-4000-8000-000000000003',
     '[TESTE] A Peca Que Deu Errado', v_nm1, '2026-03', '2026-07', '80h',
     800, 0, 4, 'active', true)
  ON CONFLICT (id) DO NOTHING;
END;
$$;

-- ─── 5. Pagamentos ────────────────────────────────────────────────
-- Hoje: 2026-05-24 (dia 12/Mai já passou → parcela de maio = em atraso)
--
-- amount = valor cobrado (com desconto se pago no prazo)
-- discount_amount = R$50 extra se pagar após dia 12
--
-- Perfis:
--   S1 Ana:    pagadora exemplar — Jan-Mai pagas no prazo, Jun pendente
--   S2 Bruno:  inadimplente      — Jan-Mar pagas, Abr-Mai em atraso, Jun pendente
--   S3 Carla:  pagadora exemplar — Jan-Mai pagas no prazo, Jun pendente
--   S4 Diego:  atrasou maio      — Jan-Abr pagas, Mai em atraso, Jun pendente
--   S5 Emilia: 3 meses em atraso — Jan-Fev pagas (Fev pago após dia 12), Mar-Mai em atraso
--   S6 Felipe: producao, pagou 1-2 no prazo, Mar em atraso, Jun pendente

-- ── S1: Ana (boa pagadora) ────────────────────────────────────────
INSERT INTO payments (student_id, enrollment_id, installment_number, amount, discount_amount, due_date, status, paid_date) VALUES
  ('a2000001-0000-4000-8000-000000000001','e2000001-0000-4000-8000-000000000001',1, 250,50,'2026-01-12','paid','2026-01-08'),
  ('a2000001-0000-4000-8000-000000000001','e2000001-0000-4000-8000-000000000001',2, 250,50,'2026-02-12','paid','2026-02-10'),
  ('a2000001-0000-4000-8000-000000000001','e2000001-0000-4000-8000-000000000001',3, 250,50,'2026-03-12','paid','2026-03-07'),
  ('a2000001-0000-4000-8000-000000000001','e2000001-0000-4000-8000-000000000001',4, 250,50,'2026-04-12','paid','2026-04-09'),
  ('a2000001-0000-4000-8000-000000000001','e2000001-0000-4000-8000-000000000001',5, 250,50,'2026-05-12','paid','2026-05-08'),
  ('a2000001-0000-4000-8000-000000000001','e2000001-0000-4000-8000-000000000001',6, 250,50,'2026-06-12','pending',null);

-- ── S2: Bruno (inadimplente — 2 meses em atraso) ──────────────────
INSERT INTO payments (student_id, enrollment_id, installment_number, amount, discount_amount, due_date, status, paid_date) VALUES
  ('a2000002-0000-4000-8000-000000000002','e2000002-0000-4000-8000-000000000002',1, 250,50,'2026-01-12','paid','2026-01-11'),
  ('a2000002-0000-4000-8000-000000000002','e2000002-0000-4000-8000-000000000002',2, 250,50,'2026-02-12','paid','2026-02-12'),
  ('a2000002-0000-4000-8000-000000000002','e2000002-0000-4000-8000-000000000002',3, 250,50,'2026-03-12','paid','2026-03-10'),
  ('a2000002-0000-4000-8000-000000000002','e2000002-0000-4000-8000-000000000002',4, 250,50,'2026-04-12','overdue',null),
  ('a2000002-0000-4000-8000-000000000002','e2000002-0000-4000-8000-000000000002',5, 250,50,'2026-05-12','overdue',null),
  ('a2000002-0000-4000-8000-000000000002','e2000002-0000-4000-8000-000000000002',6, 250,50,'2026-06-12','pending',null);

-- ── S3: Carla (boa pagadora) ──────────────────────────────────────
INSERT INTO payments (student_id, enrollment_id, installment_number, amount, discount_amount, due_date, status, paid_date) VALUES
  ('a2000003-0000-4000-8000-000000000003','e2000003-0000-4000-8000-000000000003',1, 250,50,'2026-01-12','paid','2026-01-05'),
  ('a2000003-0000-4000-8000-000000000003','e2000003-0000-4000-8000-000000000003',2, 250,50,'2026-02-12','paid','2026-02-05'),
  ('a2000003-0000-4000-8000-000000000003','e2000003-0000-4000-8000-000000000003',3, 250,50,'2026-03-12','paid','2026-03-05'),
  ('a2000003-0000-4000-8000-000000000003','e2000003-0000-4000-8000-000000000003',4, 250,50,'2026-04-12','paid','2026-04-05'),
  ('a2000003-0000-4000-8000-000000000003','e2000003-0000-4000-8000-000000000003',5, 250,50,'2026-05-12','paid','2026-05-09'),
  ('a2000003-0000-4000-8000-000000000003','e2000003-0000-4000-8000-000000000003',6, 250,50,'2026-06-12','pending',null);

-- ── S4: Diego (atrasou apenas maio) ───────────────────────────────
INSERT INTO payments (student_id, enrollment_id, installment_number, amount, discount_amount, due_date, status, paid_date) VALUES
  ('a2000004-0000-4000-8000-000000000004','e2000004-0000-4000-8000-000000000004',1, 250,50,'2026-01-12','paid','2026-01-09'),
  ('a2000004-0000-4000-8000-000000000004','e2000004-0000-4000-8000-000000000004',2, 250,50,'2026-02-12','paid','2026-02-08'),
  ('a2000004-0000-4000-8000-000000000004','e2000004-0000-4000-8000-000000000004',3, 250,50,'2026-03-12','paid','2026-03-11'),
  ('a2000004-0000-4000-8000-000000000004','e2000004-0000-4000-8000-000000000004',4, 250,50,'2026-04-12','paid','2026-04-10'),
  ('a2000004-0000-4000-8000-000000000004','e2000004-0000-4000-8000-000000000004',5, 250,50,'2026-05-12','overdue',null),
  ('a2000004-0000-4000-8000-000000000004','e2000004-0000-4000-8000-000000000004',6, 250,50,'2026-06-12','pending',null);

-- ── S5: Emilia (3 meses em atraso, pagou Fev após dia 12) ─────────
-- Fev pago em 2026-02-20 → após dia 12 → cobrado sem desconto (R$300)
INSERT INTO payments (student_id, enrollment_id, installment_number, amount, discount_amount, due_date, status, paid_date) VALUES
  ('a2000005-0000-4000-8000-000000000005','e2000005-0000-4000-8000-000000000005',1, 250,50,'2026-01-12','paid','2026-01-10'),
  ('a2000005-0000-4000-8000-000000000005','e2000005-0000-4000-8000-000000000005',2, 300,50,'2026-02-12','paid','2026-02-20'),
  ('a2000005-0000-4000-8000-000000000005','e2000005-0000-4000-8000-000000000005',3, 250,50,'2026-03-12','overdue',null),
  ('a2000005-0000-4000-8000-000000000005','e2000005-0000-4000-8000-000000000005',4, 250,50,'2026-04-12','overdue',null),
  ('a2000005-0000-4000-8000-000000000005','e2000005-0000-4000-8000-000000000005',5, 250,50,'2026-05-12','overdue',null),
  ('a2000005-0000-4000-8000-000000000005','e2000005-0000-4000-8000-000000000005',6, 250,50,'2026-06-12','pending',null);

-- ── S6: Felipe (producao, sem desconto, maio em atraso) ───────────
INSERT INTO payments (student_id, enrollment_id, installment_number, amount, discount_amount, due_date, status, paid_date) VALUES
  ('a2000006-0000-4000-8000-000000000006','e2000006-0000-4000-8000-000000000006',1, 200,0,'2026-03-12','paid','2026-03-08'),
  ('a2000006-0000-4000-8000-000000000006','e2000006-0000-4000-8000-000000000006',2, 200,0,'2026-04-12','paid','2026-04-07'),
  ('a2000006-0000-4000-8000-000000000006','e2000006-0000-4000-8000-000000000006',3, 200,0,'2026-05-12','overdue',null),
  ('a2000006-0000-4000-8000-000000000006','e2000006-0000-4000-8000-000000000006',4, 200,0,'2026-06-12','pending',null);

-- ─── 6. Frequência — últimas 3 semanas ───────────────────────────
-- Turma 1 (Segunda): 04/Mai, 11/Mai, 18/Mai
-- Turma 2 (Quarta):  06/Mai, 13/Mai, 20/Mai

-- Turma 1 — 2026-05-04
INSERT INTO attendance (enrollment_id, student_id, class_id, date, status) VALUES
  ('e2000001-0000-4000-8000-000000000001','a2000001-0000-4000-8000-000000000001','b2000001-0000-4000-8000-000000000001','2026-05-04','present'),
  ('e2000002-0000-4000-8000-000000000002','a2000002-0000-4000-8000-000000000002','b2000001-0000-4000-8000-000000000001','2026-05-04','absent'),
  ('e2000003-0000-4000-8000-000000000003','a2000003-0000-4000-8000-000000000003','b2000001-0000-4000-8000-000000000001','2026-05-04','present')
ON CONFLICT DO NOTHING;

-- Turma 1 — 2026-05-11
INSERT INTO attendance (enrollment_id, student_id, class_id, date, status) VALUES
  ('e2000001-0000-4000-8000-000000000001','a2000001-0000-4000-8000-000000000001','b2000001-0000-4000-8000-000000000001','2026-05-11','present'),
  ('e2000002-0000-4000-8000-000000000002','a2000002-0000-4000-8000-000000000002','b2000001-0000-4000-8000-000000000001','2026-05-11','justified'),
  ('e2000003-0000-4000-8000-000000000003','a2000003-0000-4000-8000-000000000003','b2000001-0000-4000-8000-000000000001','2026-05-11','present')
ON CONFLICT DO NOTHING;

-- Turma 1 — 2026-05-18
INSERT INTO attendance (enrollment_id, student_id, class_id, date, status) VALUES
  ('e2000001-0000-4000-8000-000000000001','a2000001-0000-4000-8000-000000000001','b2000001-0000-4000-8000-000000000001','2026-05-18','present'),
  ('e2000002-0000-4000-8000-000000000002','a2000002-0000-4000-8000-000000000002','b2000001-0000-4000-8000-000000000001','2026-05-18','absent'),
  ('e2000003-0000-4000-8000-000000000003','a2000003-0000-4000-8000-000000000003','b2000001-0000-4000-8000-000000000001','2026-05-18','present')
ON CONFLICT DO NOTHING;

-- Turma 2 — 2026-05-06
INSERT INTO attendance (enrollment_id, student_id, class_id, date, status) VALUES
  ('e2000004-0000-4000-8000-000000000004','a2000004-0000-4000-8000-000000000004','b2000002-0000-4000-8000-000000000002','2026-05-06','present'),
  ('e2000005-0000-4000-8000-000000000005','a2000005-0000-4000-8000-000000000005','b2000002-0000-4000-8000-000000000002','2026-05-06','absent')
ON CONFLICT DO NOTHING;

-- Turma 2 — 2026-05-13
INSERT INTO attendance (enrollment_id, student_id, class_id, date, status) VALUES
  ('e2000004-0000-4000-8000-000000000004','a2000004-0000-4000-8000-000000000004','b2000002-0000-4000-8000-000000000002','2026-05-13','present'),
  ('e2000005-0000-4000-8000-000000000005','a2000005-0000-4000-8000-000000000005','b2000002-0000-4000-8000-000000000002','2026-05-13','present')
ON CONFLICT DO NOTHING;

-- Turma 2 — 2026-05-20
INSERT INTO attendance (enrollment_id, student_id, class_id, date, status) VALUES
  ('e2000004-0000-4000-8000-000000000004','a2000004-0000-4000-8000-000000000004','b2000002-0000-4000-8000-000000000002','2026-05-20','present'),
  ('e2000005-0000-4000-8000-000000000005','a2000005-0000-4000-8000-000000000005','b2000002-0000-4000-8000-000000000002','2026-05-20','absent')
ON CONFLICT DO NOTHING;

-- ─── 7. Recarregar schema cache ───────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ─── 8. Verificação ───────────────────────────────────────────────
SELECT 'alunos sandbox'      AS item, COUNT(*) AS qtd FROM students     WHERE is_sandbox = true
UNION ALL
SELECT 'turmas sandbox',                COUNT(*)       FROM classes      WHERE is_sandbox = true
UNION ALL
SELECT 'matriculas sandbox',            COUNT(*)       FROM enrollments  WHERE is_sandbox = true
UNION ALL
SELECT 'pagamentos (via alunos)',        COUNT(*)       FROM payments p
  JOIN students s ON s.id = p.student_id WHERE s.is_sandbox = true;

-- Resumo de inadimplência por aluno
SELECT
  s.name                                                        AS aluno,
  COUNT(p.id) FILTER (WHERE p.status = 'paid')                 AS pagas,
  COUNT(p.id) FILTER (WHERE p.status = 'overdue')              AS em_atraso,
  COUNT(p.id) FILTER (WHERE p.status = 'pending')              AS pendentes,
  SUM(p.amount + p.discount_amount)
    FILTER (WHERE p.status = 'overdue')                        AS valor_em_aberto
FROM students s
JOIN payments p ON p.student_id = s.id
WHERE s.is_sandbox = true
GROUP BY s.name
ORDER BY em_atraso DESC, s.name;
