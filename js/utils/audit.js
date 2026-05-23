// ─── AuditLog ──────────────────────────────────────────────────
// Registra qualquer acao significativa na tabela audit_logs.
// Falha silenciosamente para nunca interromper o fluxo principal.

const AuditLog = (() => {

  const ACTION_LABELS = {
    // Alunos
    student_created:      'Aluno cadastrado',
    student_updated:      'Aluno editado',
    student_deleted:      'Aluno excluido',
    // Matrículas
    enrollment_created:   'Matricula criada',
    enrollment_cancelled: 'Matricula cancelada',
    enrollment_updated:   'Matricula editada',
    // Pagamentos
    payment_created:      'Lancamento criado',
    payment_paid:         'Pagamento confirmado',
    payment_reversed:     'Pagamento estornado',
    payment_updated:      'Lancamento editado',
    // Turmas
    class_created:        'Turma criada',
    class_updated:        'Turma editada',
    class_deleted:        'Turma excluida',
    // Professores
    teacher_updated:      'Professor editado',
    // Frequência
    attendance_registered:'Frequencia registrada',
    // Salas
    room_booked:          'Sala reservada',
    // Reuniões
    meeting_proposed:     'Reuniao proposta',
  };

  async function log(actionType, entityType, entityId, entityName, description) {
    try {
      const profile = Auth.getProfile();
      await db.from('audit_logs').insert({
        user_id:     profile?.id   || null,
        user_name:   profile?.name || 'Sistema',
        action_type: actionType,
        entity_type: entityType  || null,
        entity_id:   entityId    ? String(entityId) : null,
        entity_name: entityName  || null,
        description: description || null,
      });
    } catch (e) {
      console.warn('[AuditLog] falha ao registrar:', e?.message);
    }
  }

  return { log, ACTION_LABELS };
})();
