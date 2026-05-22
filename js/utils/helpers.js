// ─── Formatação de moeda ──────────────────────────────────────
function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

// ─── Formatação de data ───────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pt-BR');
}

function toInputDate(dateStr) {
  if (!dateStr) return '';
  return dateStr.substring(0, 10);
}

// ─── Cálculo de idade ─────────────────────────────────────────
function calcAge(birthDate) {
  if (!birthDate) return null;
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

// ─── Número por extenso (PT-BR) ───────────────────────────────
function numberToWordsPT(num) {
  if (isNaN(num) || num < 0) return '';
  if (num === 0) return 'zero reais';

  const ones = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
    'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const tens = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const huns = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos',
    'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

  function convert(n) {
    if (n === 0) return '';
    if (n === 100) return 'cem';
    if (n < 20) return ones[n];
    if (n < 100) {
      const r = ones[n % 10];
      return tens[Math.floor(n / 10)] + (r ? ' e ' + r : '');
    }
    if (n < 1000) {
      const r = convert(n % 100);
      return huns[Math.floor(n / 100)] + (r ? ' e ' + r : '');
    }
    if (n === 1000) return 'mil';
    if (n < 2000) {
      const r = convert(n % 1000);
      return 'mil' + (r ? ' e ' + r : '');
    }
    if (n < 1000000) {
      const r = convert(n % 1000);
      const t = convert(Math.floor(n / 1000));
      return t + ' mil' + (r ? ' e ' + r : '');
    }
    return n.toString();
  }

  const intPart = Math.floor(num);
  const decPart = Math.round((num - intPart) * 100);

  let result = convert(intPart);
  result += intPart === 1 ? ' real' : ' reais';

  if (decPart > 0) {
    result += ' e ' + convert(decPart);
    result += decPart === 1 ? ' centavo' : ' centavos';
  }

  return result;
}

// ─── Máscara CPF ─────────────────────────────────────────────
function maskCPF(v) {
  return v.replace(/\D/g, '').replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

// ─── Máscara CEP ─────────────────────────────────────────────
function maskCEP(v) {
  return v.replace(/\D/g, '').replace(/(\d{5})(\d)/, '$1-$2');
}

// ─── Máscara Telefone ─────────────────────────────────────────
function maskPhone(v) {
  v = v.replace(/\D/g, '');
  if (v.length <= 10) return v.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
}

// ─── Debounce ─────────────────────────────────────────────────
function debounce(fn, delay = 350) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

// ─── Sanitização básica ───────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Toast de notificação ─────────────────────────────────────
function toast(msg, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

// ─── Confirm dialog ──────────────────────────────────────────
function confirmDialog(msg) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-box">
        <p>${escapeHtml(msg)}</p>
        <div class="confirm-actions">
          <button class="btn btn-secondary" id="confirm-no">Cancelar</button>
          <button class="btn btn-danger" id="confirm-yes">Confirmar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#confirm-yes').onclick = () => { overlay.remove(); resolve(true); };
    overlay.querySelector('#confirm-no').onclick  = () => { overlay.remove(); resolve(false); };
  });
}

// ─── Geração de RA local (fallback) ──────────────────────────
function generateRA(existingCount) {
  const year = new Date().getFullYear();
  const seq = String(existingCount + 1).padStart(4, '0');
  return `${year}${seq}`;
}

// ─── Status labels ────────────────────────────────────────────
const STATUS_LABELS = {
  active: 'Ativo', inactive: 'Inativo', graduated: 'Formado',
  paid: 'Pago', pending: 'Pendente', overdue: 'Em Atraso',
  finished: 'Concluída', cancelled: 'Cancelada'
};

const LEVEL_LABELS = { 1: 'Nível I', 2: 'Nível II', 3: 'Nível III' };
const DAYS_PT = {
  'monday': 'Segunda-feira', 'tuesday': 'Terça-feira', 'wednesday': 'Quarta-feira',
  'thursday': 'Quinta-feira', 'friday': 'Sexta-feira', 'saturday': 'Sábado', 'sunday': 'Domingo'
};
