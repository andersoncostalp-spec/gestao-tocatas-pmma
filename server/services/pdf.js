'use strict';
const PDFDocument = require('pdfkit');

const MESES = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO',
  'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];

// "08:00" -> "8h" ; "17:30" -> "17h30" (formato usado no mapa)
function formatHora(h) {
  if (!h) return '';
  const [hh, mm] = h.split(':');
  return `${Number(hh)}h${mm === '00' ? '' : mm}`;
}

function formatHorario(e) {
  return e.hora_fim ? `${formatHora(e.hora_inicio)} às ${formatHora(e.hora_fim)}` : formatHora(e.hora_inicio);
}

function formatDocumento(e) {
  const num = (e.numero_documento || '').trim();
  if (!num || e.tipo_documento === 'Nenhum') {
    return e.tipo_documento === 'Ofício' ? 'SEM OFÍCIO INFORMADO' : 'SEM PROCESSO SEI INFORMADO';
  }
  const prefix = { SEI: 'SEI nº', 'Ofício': 'Ofício nº', Memorando: 'Memorando nº', Outro: '' }[e.tipo_documento] ?? '';
  return prefix ? `${prefix}\n${num}` : num;
}

function dataUrlToBuffer(v) {
  const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(v || '');
  return m ? Buffer.from(m[2], 'base64') : null;
}

// Colunas proporcionais às do documento original (largura útil de 555pt em A4 retrato)
const COLUMNS = [
  { key: 'ordem', title: 'Nº', width: 20 },
  { key: 'data', title: 'DATA', width: 31 },
  { key: 'horario', title: 'HORÁRIO', width: 44 },
  { key: 'evento', title: 'EVENTO', width: 115 },
  { key: 'entidade', title: 'ENTIDADE SOLICITANTE', width: 115 },
  { key: 'local', title: 'ENDEREÇO/LOCAL', width: 141 },
  { key: 'documento', title: 'OFÍCIO/SEI', width: 89 },
];
const HEADER_BG = '#8DB3E2';
const FONT = 7.5;
const PAD = 2.5;

/**
 * Gera o PDF do mapa mensal e escreve no stream de destino.
 * @param {object} opts { ano, mes, eventos, settings, out }
 */
function renderMapa({ ano, mes, eventos, settings, out }) {
  const doc = new PDFDocument({
    size: 'A4', margins: { top: 25, bottom: 30, left: 20, right: 20 }, bufferPages: true,
    info: {
      Title: `Mapa de Eventos - ${MESES[mes - 1]} ${ano}`,
      Author: 'Banda de Música - PMMA',
      Subject: settings.titulo,
    },
  });
  doc.pipe(out);

  const left = doc.page.margins.left;
  const pageW = doc.page.width;
  const usableW = pageW - left - doc.page.margins.right;
  const bottomLimit = () => doc.page.height - doc.page.margins.bottom - 10;
  const scale = usableW / COLUMNS.reduce((s, c) => s + c.width, 0);
  const cols = COLUMNS.map((c) => ({ ...c, width: c.width * scale }));

  // ---------- Cabeçalho institucional ----------
  let y = doc.page.margins.top;
  const logoH = 48;
  const logoL = dataUrlToBuffer(settings.logo_esquerda);
  const logoC = dataUrlToBuffer(settings.logo_centro);
  const logoR = dataUrlToBuffer(settings.logo_direita);
  const drawImg = (buf, x, yy, w, h) => {
    try { doc.image(buf, x, yy, { fit: [w, h], align: 'center', valign: 'center' }); } catch { /* imagem inválida: ignora */ }
  };
  if (logoL) drawImg(logoL, left + 25, y + 4, 60, logoH);
  if (logoR) drawImg(logoR, pageW - doc.page.margins.right - 85, y + 4, 60, logoH);
  if (logoC) { drawImg(logoC, pageW / 2 - 22, y, 44, 40); y += 44; } else { y += 14; }

  doc.fillColor('black').font('Helvetica').fontSize(9);
  for (const line of String(settings.cabecalho || '').split('\n')) {
    doc.text(line.trim(), left, y, { width: usableW, align: 'center' });
    y = doc.y;
  }
  if (settings.endereco) {
    doc.fontSize(5.5).text(settings.endereco, left, y + 1, { width: usableW, align: 'center' });
    y = doc.y;
  }
  y += 10;
  doc.font('Helvetica-Bold').fontSize(8.5)
    .text(settings.titulo || '', left, y, { width: usableW, align: 'center', underline: true });
  y = doc.y + 10;
  doc.text(`${MESES[mes - 1]} ${ano}`, left, y, { width: usableW, align: 'center', underline: true });
  y = doc.y + 12;

  // ---------- Tabela ----------
  const headerRow = () => {
    doc.font('Helvetica-Bold').fontSize(FONT);
    const h = Math.max(...cols.map((c) => doc.heightOfString(c.title, { width: c.width - PAD * 2 }))) + PAD * 2 + 6;
    let x = left;
    for (const c of cols) {
      doc.save().lineWidth(0.6).rect(x, y, c.width, h).fillAndStroke(HEADER_BG, 'black').restore();
      const th = doc.heightOfString(c.title, { width: c.width - PAD * 2 });
      // Como no original, títulos alinhados embaixo da célula
      doc.fillColor('black').text(c.title, x + PAD, y + h - th - PAD - 1, { width: c.width - PAD * 2, align: 'center' });
      x += c.width;
    }
    y += h;
  };

  const cellBlocks = (e, c) => {
    switch (c.key) {
      case 'ordem': return [{ text: String(e.ordem) }];
      case 'data': return [{ text: `${e.data.slice(8, 10)}/${e.data.slice(5, 7)}` }];
      case 'horario': return [{ text: formatHorario(e) }];
      case 'evento': {
        const b = [{ text: e.evento }];
        if (e.formacao) {
          const destaque = e.formacao.trim().toLowerCase() !== String(settings.formacao_padrao || '').trim().toLowerCase();
          b.push({ text: `(${destaque ? e.formacao.toUpperCase() : e.formacao})`, bold: destaque });
        }
        return b;
      }
      case 'entidade': return [{ text: e.entidade }];
      case 'local': return [{ text: e.local }];
      case 'documento': return [{ text: formatDocumento(e) }];
      default: return [{ text: '' }];
    }
  };
  const blockHeight = (blocks, w) => blocks.reduce((s, b) => {
    doc.font(b.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(FONT);
    return s + doc.heightOfString(b.text, { width: w, lineGap: 0 });
  }, 0);

  doc.lineWidth(0.6).strokeColor('black');
  headerRow();

  if (!eventos.length) {
    const h = 24;
    doc.rect(left, y, usableW, h).stroke();
    doc.font('Helvetica-Oblique').fontSize(FONT + 0.5)
      .text('Nenhum evento cadastrado para o período.', left, y + 8, { width: usableW, align: 'center' });
    y += h;
  }

  for (const e of eventos) {
    const contents = cols.map((c) => cellBlocks(e, c));
    const heights = cols.map((c, i) => blockHeight(contents[i], c.width - PAD * 2));
    const rowH = Math.max(18, Math.max(...heights) + PAD * 2 + 2);
    if (y + rowH > bottomLimit()) {
      doc.addPage();
      y = doc.page.margins.top + 10;
      headerRow();
    }
    let x = left;
    cols.forEach((c, i) => {
      doc.rect(x, y, c.width, rowH).stroke();
      let ty = y + (rowH - heights[i]) / 2;
      for (const b of contents[i]) {
        doc.font(b.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(FONT).fillColor('black');
        const bh = doc.heightOfString(b.text, { width: c.width - PAD * 2 });
        doc.text(b.text, x + PAD, ty, { width: c.width - PAD * 2, align: 'center', lineGap: 0 });
        ty += bh;
      }
      x += c.width;
    });
    y += rowH;
  }

  // ---------- Assinatura ----------
  if (y + 90 > bottomLimit()) { doc.addPage(); y = doc.page.margins.top + 20; }
  y += 55;
  const nome = String(settings.assinatura_nome || '');
  const parts = nome.split('*');
  doc.fontSize(9);
  const widths = parts.map((p, i) => doc.font(i % 2 ? 'Helvetica-Bold' : 'Helvetica').widthOfString(p));
  let x = left + (usableW - widths.reduce((a, b) => a + b, 0)) / 2;
  parts.forEach((p, i) => {
    doc.font(i % 2 ? 'Helvetica-Bold' : 'Helvetica').text(p, x, y, { lineBreak: false });
    x += widths[i];
  });
  y += 12;
  doc.font('Helvetica').fontSize(7).text(settings.assinatura_cargo || '', left, y, { width: usableW, align: 'center' });

  // ---------- Numeração de páginas ----------
  const range = doc.bufferedPageRange();
  if (range.count > 1) {
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const bm = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.font('Helvetica').fontSize(6.5).fillColor('#444')
        .text(`Página ${i + 1} de ${range.count}`, left, doc.page.height - 20, { width: usableW, align: 'right', lineBreak: false });
      doc.page.margins.bottom = bm;
    }
  }
  doc.end();
}

module.exports = { renderMapa, formatHora, formatHorario, formatDocumento, MESES };
