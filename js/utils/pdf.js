const PDFGen = (() => {

  // Lê configurações salvas (Configuracoes → nome da escola, cidade, etc.)
  function cfg() {
    try {
      if (typeof SettingsModule !== 'undefined') return SettingsModule.getSettings();
    } catch {}
    return {
      school_name: 'TPC - Teatro Popular de Comedia',
      school_city: 'Sao Paulo',
      contract_court: 'Sao Paulo',
      cert_extra_text: '',
    };
  }

  // ─── Certificado de Conclusão ──────────────────────────────
  function certificate(student, enrollment) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const W = 297, H = 210;

    // Fundo
    doc.setFillColor(15, 15, 15);
    doc.rect(0, 0, W, H, 'F');

    // Borda dourada
    doc.setDrawColor(200, 169, 95);
    doc.setLineWidth(1.5);
    doc.rect(10, 10, W - 20, H - 20);
    doc.setLineWidth(0.5);
    doc.rect(13, 13, W - 26, H - 26);

    // Título
    doc.setTextColor(200, 169, 95);
    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    doc.text('CERTIFICADO DE CONCLUSÃO', W / 2, 45, { align: 'center' });

    // Subtítulo
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 150, 150);
    doc.text((cfg().school_name || 'TPC - TEATRO POPULAR DE COMEDIA').toUpperCase(), W / 2, 55, { align: 'center' });

    // Corpo
    doc.setTextColor(232, 232, 232);
    doc.setFontSize(13);
    doc.text('Certificamos que', W / 2, 80, { align: 'center' });

    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(200, 169, 95);
    doc.text((student.name || '').toUpperCase(), W / 2, 95, { align: 'center' });

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(232, 232, 232);
    const courseName = enrollment?.piece_course || 'Curso de Teatro';
    doc.text(`concluiu com êxito o ${courseName}`, W / 2, 110, { align: 'center' });
    doc.text(`com carga horária de ${enrollment?.workload || 120} horas.`, W / 2, 120, { align: 'center' });

    // Data
    const hoje = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
    doc.setFontSize(10);
    doc.setTextColor(150, 150, 150);
    doc.text(`São Paulo, ${hoje}`, W / 2, 145, { align: 'center' });

    // Linha de assinatura
    doc.setDrawColor(200, 169, 95);
    doc.setLineWidth(0.5);
    doc.line(90, 168, 207, 168);
    doc.setFontSize(10);
    doc.setTextColor(200, 169, 95);
    doc.text('Direção Artística', W / 2, 174, { align: 'center' });
    doc.setTextColor(150, 150, 150);
    doc.text(cfg().school_name || 'TPC - Teatro Popular de Comedia', W / 2, 180, { align: 'center' });

    // RA
    doc.setFontSize(8);
    doc.text(`RA: ${student.ra || '—'}`, 20, H - 18);

    return doc;
  }

  // ─── Carteirinha de Estudante ──────────────────────────────
  function studentCard(student) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [85.6, 53.98] });
    const W = 85.6, H = 53.98;

    doc.setFillColor(22, 22, 22);
    doc.rect(0, 0, W, H, 'F');

    doc.setFillColor(200, 169, 95);
    doc.rect(0, 0, W, 12, 'F');

    doc.setTextColor(15, 15, 15);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text((cfg().school_name || 'TPC - TEATRO POPULAR DE COMEDIA').toUpperCase(), W / 2, 5, { align: 'center' });
    doc.setFontSize(6);
    doc.text('CARTEIRA DE ESTUDANTE', W / 2, 9.5, { align: 'center' });

    doc.setTextColor(232, 232, 232);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    const name = student.name || '';
    doc.text(name.toUpperCase(), W / 2, 22, { align: 'center', maxWidth: 70 });

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(154, 154, 154);

    const birthFormatted = student.birth_date ? formatDate(student.birth_date) : '—';
    doc.text('Data de Nascimento:', 8, 32);
    doc.setTextColor(232, 232, 232);
    doc.text(birthFormatted, 8, 37);

    doc.setTextColor(154, 154, 154);
    doc.text('RA / Matrícula:', 8, 43);
    doc.setTextColor(200, 169, 95);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(student.ra || '—', 8, 48.5);

    doc.setDrawColor(200, 169, 95);
    doc.setLineWidth(0.3);
    doc.rect(1, 1, W - 2, H - 2);

    return doc;
  }

  // ─── Carnê de Pagamento ───────────────────────────────────
  // Cada canhoto ocupa 1/4 da página A4 sem margens (sem pontas brancas).
  // O valor exibido é sempre R$ 250,00 conforme padrão TPC.
  function paymentBook(student, payments, fields = null) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const defaultFields = { name: true, ra: true, amount: true, dueDate: true, installment: true, observations: false };
    const slipFields = fields || defaultFields;

    const PAGE_W         = 210;           // A4 largura
    const PAGE_H         = 297;           // A4 altura
    const SLIPS_PER_PAGE = 4;
    const SLIP_H         = PAGE_H / SLIPS_PER_PAGE; // 74.25 mm — cobre toda a página
    const FIXED_AMOUNT   = 250;           // Valor padrão TPC

    const COL1 = 10;                      // Coluna esquerda
    const COL2 = PAGE_W / 2 + 8;         // Coluna direita
    const HDR_H = 15;                     // Altura da barra de cabeçalho

    payments.forEach((payment, i) => {
      if (i > 0 && i % SLIPS_PER_PAGE === 0) doc.addPage();

      const slot  = i % SLIPS_PER_PAGE;
      const slipY = slot * SLIP_H;        // começa exatamente em 0, 74.25, 148.5, 222.75

      // ── Fundo escuro (cobre fatia inteira) ──────────────────
      doc.setFillColor(22, 22, 22);
      doc.rect(0, slipY, PAGE_W, SLIP_H, 'F');

      // ── Barra dourada de cabeçalho ───────────────────────────
      doc.setFillColor(200, 169, 95);
      doc.rect(0, slipY, PAGE_W, HDR_H, 'F');

      doc.setTextColor(15, 15, 15);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(
        (cfg().school_name || 'TPC - Teatro Popular de Comedia').toUpperCase(),
        PAGE_W / 2, slipY + 10,
        { align: 'center' }
      );

      // ── Linha 1: Aluno / RA ──────────────────────────────────
      let ly = slipY + HDR_H + 11;

      if (slipFields.name) {
        doc.setFontSize(7); doc.setFont('helvetica', 'normal');
        doc.setTextColor(154, 154, 154);
        doc.text('Aluno:', COL1, ly);
        doc.setFontSize(9); doc.setFont('helvetica', 'bold');
        doc.setTextColor(232, 232, 232);
        doc.text(student.name || '—', COL1, ly + 6, { maxWidth: 90 });
      }

      if (slipFields.ra) {
        doc.setFontSize(7); doc.setFont('helvetica', 'normal');
        doc.setTextColor(154, 154, 154);
        doc.text('RA:', COL2, ly);
        doc.setFontSize(9); doc.setFont('helvetica', 'bold');
        doc.setTextColor(200, 169, 95);
        doc.text(student.ra || '—', COL2, ly + 6);
      }

      // ── Linha 2: Parcela / Vencimento ────────────────────────
      ly += 17;

      if (slipFields.installment) {
        doc.setFontSize(7); doc.setFont('helvetica', 'normal');
        doc.setTextColor(154, 154, 154);
        doc.text('Parcela:', COL1, ly);
        doc.setFontSize(9); doc.setFont('helvetica', 'bold');
        doc.setTextColor(232, 232, 232);
        doc.text(`${payment.installment_number || i + 1} / ${payments.length}`, COL1, ly + 6);
      }

      if (slipFields.dueDate) {
        doc.setFontSize(7); doc.setFont('helvetica', 'normal');
        doc.setTextColor(154, 154, 154);
        doc.text('Vencimento:', COL2, ly);
        doc.setFontSize(9); doc.setFont('helvetica', 'bold');
        doc.setTextColor(232, 232, 232);
        doc.text(formatDate(payment.due_date), COL2, ly + 6);
      }

      // ── Linha 3: Valor fixo / Obs ────────────────────────────
      ly += 17;

      if (slipFields.amount) {
        doc.setFontSize(7); doc.setFont('helvetica', 'normal');
        doc.setTextColor(154, 154, 154);
        doc.text('Valor:', COL1, ly);
        doc.setFontSize(18); doc.setFont('helvetica', 'bold');
        doc.setTextColor(200, 169, 95);
        doc.text(formatCurrency(FIXED_AMOUNT), COL1, ly + 10);
      }

      if (slipFields.observations && payment.observations) {
        doc.setFontSize(7); doc.setFont('helvetica', 'normal');
        doc.setTextColor(154, 154, 154);
        doc.text('Obs:', COL2, ly);
        doc.setTextColor(232, 232, 232);
        doc.text(payment.observations || '', COL2, ly + 6, { maxWidth: 95 });
      }

      // ── Linha tracejada de corte entre canhoto e próximo ─────
      const isLastSlot    = slot === SLIPS_PER_PAGE - 1;
      const isLastPayment = i === payments.length - 1;
      if (!isLastSlot && !isLastPayment) {
        doc.setDrawColor(70, 70, 70);
        doc.setLineWidth(0.3);
        doc.setLineDashPattern([3, 3], 0);
        doc.line(0, slipY + SLIP_H, PAGE_W, slipY + SLIP_H);
        doc.setLineDashPattern([], 0);
      }
    });

    return doc;
  }

  // ─── Geração em lote ──────────────────────────────────────
  async function batchCertificates(students, enrollments) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    let first = true;

    for (const student of students) {
      const enrollment = enrollments?.find(e => e.student_id === student.id);
      if (!first) doc.addPage();
      const singleDoc = certificate(student, enrollment);
      const pages = singleDoc.internal.pages;
      for (let p = 1; p < pages.length; p++) {
        if (!first) doc.addPage();
        doc.internal.pages[doc.internal.getCurrentPageInfo().pageNumber] = pages[p];
        first = false;
      }
      first = false;
    }

    return doc;
  }

  async function batchCards(students) {
    const { jsPDF } = window.jspdf;
    const cardsPerRow = 2, cardW = 85.6, cardH = 53.98;
    const marginX = 15, marginY = 20, gapX = 10, gapY = 8;
    const pageW = 210, pageH = 297;
    const cardsPerPage = Math.floor((pageH - marginY * 2) / (cardH + gapY)) * cardsPerRow;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    students.forEach((student, idx) => {
      if (idx > 0 && idx % cardsPerPage === 0) doc.addPage();
      const pos = idx % cardsPerPage;
      const col = pos % cardsPerRow;
      const row = Math.floor(pos / cardsPerRow);
      const x = marginX + col * (cardW + gapX);
      const yPos = marginY + row * (cardH + gapY);

      const cardDoc = studentCard(student);
      const { W: cW, H: cH } = { W: cardW, H: cardH };

      doc.setFillColor(22, 22, 22);
      doc.roundedRect(x, yPos, cardW, cardH, 2, 2, 'F');
      doc.setFillColor(200, 169, 95);
      doc.rect(x, yPos, cardW, 10, 'F');
      doc.setTextColor(15, 15, 15);
      doc.setFontSize(6);
      doc.setFont('helvetica', 'bold');
      doc.text((cfg().school_name || 'TPC - Teatro Popular de Comedia').toUpperCase(), x + cardW / 2, yPos + 4, { align: 'center' });
      doc.setFontSize(5.5);
      doc.text('CARTEIRA DE ESTUDANTE', x + cardW / 2, yPos + 8, { align: 'center' });

      doc.setTextColor(232, 232, 232);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.text((student.name || '').toUpperCase(), x + cardW / 2, yPos + 18, { align: 'center', maxWidth: 70 });

      doc.setFontSize(5.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(154, 154, 154);
      doc.text('Nascimento:', x + 5, yPos + 27);
      doc.setTextColor(232, 232, 232);
      doc.text(student.birth_date ? formatDate(student.birth_date) : '—', x + 5, yPos + 31.5);

      doc.setTextColor(154, 154, 154);
      doc.text('RA / Matrícula:', x + 5, yPos + 38);
      doc.setTextColor(200, 169, 95);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.text(student.ra || '—', x + 5, yPos + 43.5);

      doc.setDrawColor(200, 169, 95);
      doc.setLineWidth(0.2);
      doc.rect(x + 0.5, yPos + 0.5, cardW - 1, cardH - 1);
    });

    return doc;
  }

  // ─── Helpers de formatação para contratos ─────────────────
  function fmtMonth(value) {
    if (!value) return '—';
    const months = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho',
                    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const [year, month] = value.split('-');
    return `${months[parseInt(month, 10) - 1]}/${year}`;
  }

  function datePorExtenso() {
    const d = new Date();
    const months = ['janeiro','fevereiro','marco','abril','maio','junho',
                    'julho','agosto','setembro','outubro','novembro','dezembro'];
    const city = cfg().school_city || 'Sao Paulo';
    return `${city}, ${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
  }

  // ─── Contrato (fundo branco, letras pretas — imprimível) ──
  function contract(student, enrollment, courseType) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = 210, mL = 22, mR = 188, tw = mR - mL;
    let y = 20;

    const black  = [0, 0, 0];
    const gray   = [90, 90, 90];
    const lgray  = [160, 160, 160];

    function setBlack(size = 10, style = 'normal') {
      doc.setFontSize(size); doc.setFont('helvetica', style); doc.setTextColor(...black);
    }
    function setGray(size = 9) {
      doc.setFontSize(size); doc.setFont('helvetica', 'normal'); doc.setTextColor(...gray);
    }
    function line(x1, y1, x2, y2) {
      doc.setDrawColor(...lgray); doc.setLineWidth(0.3); doc.line(x1, y1, x2, y2);
    }
    function addBlock(label, value, indent = 0) {
      setGray(8);
      doc.text(label.toUpperCase(), mL + indent, y);
      y += 4.5;
      setBlack(10);
      const lines = doc.splitTextToSize(value || '—', tw - indent);
      doc.text(lines, mL + indent, y);
      y += lines.length * 5 + 2;
    }
    function sectionTitle(text) {
      y += 3;
      line(mL, y, mR, y);
      y += 5;
      setBlack(9, 'bold');
      doc.text(text.toUpperCase(), mL, y);
      y += 6;
      setBlack(10);
    }
    function clause(num, text) {
      const full = `Clausula ${num}a - ${text}`;
      const lines = doc.splitTextToSize(full, tw);
      setBlack(9);
      doc.text(lines, mL, y);
      y += lines.length * 4.8 + 3;
    }

    const isProduction = courseType === 'production';
    const fullInstallment = enrollment?.total_value
      ? (Number(enrollment.total_value) / (enrollment.payment_installments || 1))
      : 0;
    const discountAmt = Number(enrollment?.discount || 0);
    const discountedInstallment = Math.max(0, fullInstallment - discountAmt);
    const periodStr = [fmtMonth(enrollment?.period_start), fmtMonth(enrollment?.period_end)]
      .filter(Boolean).join(' a ') || enrollment?.period || '—';

    // ─── Cabeçalho ───────────────────────────────────────────
    const schoolName = cfg().school_name || 'TPC - Teatro Popular de Comedia';
    const courtCity  = cfg().contract_court || 'Sao Paulo';
    setBlack(14, 'bold');
    doc.text(schoolName.toUpperCase(), W / 2, y, { align: 'center' });
    y += 7;
    setBlack(11, 'bold');
    doc.text(isProduction
      ? 'CONTRATO DE PARTICIPACAO EM PRODUCAO ARTISTICA'
      : 'CONTRATO DE PRESTACAO DE SERVICOS EDUCACIONAIS',
      W / 2, y, { align: 'center' });
    y += 5;
    line(mL, y, mR, y);
    y += 8;

    // ─── Partes ───────────────────────────────────────────────
    sectionTitle('Partes Contratantes');

    setBlack(9, 'bold'); doc.text('CONTRATADA:', mL, y); y += 5;
    setBlack(9); doc.text(schoolName, mL + 4, y); y += 8;

    setBlack(9, 'bold'); doc.text(isProduction ? 'PARTICIPANTE:' : 'CONTRATANTE:', mL, y); y += 5;
    addBlock('Nome',            student?.contractor_name || student?.name || '—', 4);
    addBlock('CPF',             student?.cpf || '—', 4);
    addBlock('Endereco',        [student?.address, student?.address_number, student?.neighborhood, student?.city, student?.state].filter(Boolean).join(', ') || '—', 4);
    addBlock('Telefone',        student?.student_phone || '—', 4);

    setBlack(9, 'bold'); doc.text('ALUNO(A):', mL, y); y += 5;
    addBlock('Nome',            student?.name || '—', 4);
    addBlock('Data de Nascimento / RA', `${formatDate(student?.birth_date)} | RA: ${student?.ra || '—'}`, 4);
    addBlock('RG',              student?.rg || '—', 4);

    // ─── Objeto ───────────────────────────────────────────────
    sectionTitle(isProduction ? 'Da Producao' : 'Do Servico Contratado');

    if (isProduction) {
      clause('1', `O presente contrato tem por objeto a participacao do(a) PARTICIPANTE na producao artistica intitulada "${enrollment?.piece_course || '—'}", sob a direcao de ${enrollment?.responsible_teacher || 'a definir'}.`);
      clause('2', `Os ensaios e apresentacoes ocorrerao conforme calendario estabelecido pela direcao, com vigencia de ${periodStr}. Carga horaria: ${enrollment?.workload_label || enrollment?.workload || '—'}.`);
    } else {
      clause('1', `O presente contrato tem por objeto a prestacao de servicos de ensino de arte dramatica, referente ao ${enrollment?.piece_course || 'curso de teatro'}, ministrado pelo professor(a) ${enrollment?.responsible_teacher || 'a definir'}.`);
      clause('2', `As aulas serao realizadas com vigencia de ${periodStr}, perfazendo carga horaria de ${enrollment?.workload_label || enrollment?.workload || '—'}.`);
    }

    // ─── Pagamento ────────────────────────────────────────────
    sectionTitle('Do Pagamento');

    clause('3', `O ${isProduction ? 'investimento' : 'valor'} total contratado e de ${formatCurrency(enrollment?.total_value || 0)}, parcelado em ${enrollment?.payment_installments || 1}x de ${formatCurrency(fullInstallment)}, com vencimento no dia 12 de cada mes.`);

    if (discountAmt > 0) {
      clause('4', `O pagamento efetuado ate o dia 12 de cada mes tera o desconto de ${formatCurrency(discountAmt)} por parcela, resultando no valor de ${formatCurrency(discountedInstallment)} (${numberToWordsPT(discountedInstallment)}). Apos esta data, o valor integral sera cobrado.`);
      clause('5', 'O atraso no pagamento implicara na cobranca de multa de 2% e juros de mora de 1% ao mes sobre o valor em aberto.');
    } else {
      clause('4', 'O atraso no pagamento implicara na cobranca de multa de 2% e juros de mora de 1% ao mes sobre o valor em aberto.');
    }

    // ─── Disposições gerais ───────────────────────────────────
    sectionTitle('Das Disposicoes Gerais');

    const nextClause = discountAmt > 0 ? 6 : 5;
    clause(nextClause,     'A frequencia minima obrigatoria e de 75% da carga horaria total para aproveitamento do curso.');
    clause(nextClause + 1, `A rescisao antecipada por iniciativa do ${isProduction ? 'PARTICIPANTE' : 'CONTRATANTE'} nao isenta o pagamento das parcelas ja vencidas.`);
    if (isProduction) {
      clause(nextClause + 2, `Os direitos autorais e de imagem das apresentacoes sao de propriedade exclusiva do ${schoolName}.`);
    }
    clause(isProduction ? nextClause + 3 : nextClause + 2, `As partes elegem o foro da comarca de ${courtCity} para dirimir quaisquer controversias oriundas do presente contrato.`);

    // ─── Assinaturas ──────────────────────────────────────────
    y = Math.max(y + 6, 240);
    if (y > 265) { doc.addPage(); y = 25; }

    setGray(9);
    doc.text(datePorExtenso() + '.', mL, y);
    y += 14;

    line(mL, y, mL + 75, y);
    line(mR - 75, y, mR, y);
    y += 5;
    setBlack(8, 'bold');
    doc.text('Aluno(a) / Responsavel', mL, y);
    doc.text('Secretaria', mR - 75, y);
    y += 4;
    setBlack(8);
    doc.text(student?.contractor_name || student?.name || '', mL, y);
    doc.text(schoolName, mR - 75, y);

    return doc;
  }

  function downloadPDF(doc, filename) {
    doc.save(filename);
  }

  return { certificate, studentCard, paymentBook, contract, batchCertificates, batchCards, downloadPDF };
})();
