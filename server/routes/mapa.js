'use strict';
const express = require('express');
const { requireAuth } = require('../auth');
const { renderMapa, MESES } = require('../services/pdf');

module.exports = ({ events, settings, audit }) => {
  const r = express.Router();

  const parse = (req, res) => {
    const ano = Number(req.params.ano);
    const mes = Number(req.params.mes);
    if (!Number.isInteger(ano) || ano < 2000 || ano > 2100 || !Number.isInteger(mes) || mes < 1 || mes > 12) {
      res.status(400).json({ error: 'Mês/ano inválido.' });
      return null;
    }
    return { ano, mes };
  };

  // Pré-visualização em JSON
  r.get('/:ano/:mes', requireAuth, (req, res) => {
    const p = parse(req, res); if (!p) return;
    res.json({ ...p, mesNome: MESES[p.mes - 1], eventos: events.monthMap(p.ano, p.mes) });
  });

  // PDF no padrão do mapa oficial
  r.get('/:ano/:mes/pdf', requireAuth, (req, res) => {
    const p = parse(req, res); if (!p) return;
    const eventos = events.monthMap(p.ano, p.mes);
    const nome = `MAPA_${MESES[p.mes - 1].normalize('NFD').replace(/[̀-ͯ]/g, '')}_${p.ano}.pdf`;
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${nome}"`);
    audit.log({ req, action: 'gerar_mapa', entity: 'mapa', summary: `Mapa de ${MESES[p.mes - 1]} ${p.ano} gerado (${eventos.length} eventos)` });
    renderMapa({ ...p, eventos, settings: settings.all(), out: res });
  });

  return r;
};
