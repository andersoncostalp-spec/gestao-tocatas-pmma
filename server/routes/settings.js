'use strict';
const express = require('express');
const { requireAuth, requireRole } = require('../auth');

module.exports = ({ settings, audit }) => {
  const r = express.Router();

  r.get('/', requireAuth, (req, res) => res.json(settings.all()));

  r.put('/', requireRole('admin'), (req, res) => {
    const changes = settings.update(req.body || {});
    if (Object.keys(changes).length) {
      audit.log({ req, action: 'editar', entity: 'configuracao', summary: 'Configurações do mapa alteradas', changes });
    }
    res.json(settings.all());
  });

  return r;
};
