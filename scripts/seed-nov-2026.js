#!/usr/bin/env node
'use strict';
// Importa os eventos do "MAPA NOV 2026 ATUALIZADO-4" (documento de referência do P1).
// Uso: node scripts/seed-nov-2026.js <usuario-que-registra>
const config = require('../server/config');
const { openDatabase } = require('../server/db');
const { createAudit } = require('../server/audit');
const { createEventService } = require('../server/services/events');
const { validateEvent } = require('../server/validation');

const EVENTOS = [
  { data: '2026-11-05', hora_inicio: '08:00', evento: 'Solenidade de Abertura do Mundo SENAI', formacao: 'Banda de Música', entidade: 'SENAI + SSP/MA', local: 'Instalações do SENAI', numero_documento: '2026.19101.15291' },
  { data: '2026-11-05', hora_inicio: '18:00', evento: 'MEETING SUN 26', entidade: 'GAB MEETING SUN 26', local: 'Fórum Desembargador Sarney Costa Av. Prof. Carlos Cunha, s/n - Calhau', numero_documento: '2026.190110.43656' },
  { data: '2026-11-13', hora_inicio: '17:30', evento: 'Festejo de Nossa Senhora da Vitória, Padroeira da Sé', entidade: 'Catedral Metropolitana de São Luís – Igreja da Sé', local: 'Av. Pedro II, S/N, Centro', numero_documento: '2026.190110.41647' },
  { data: '2026-11-13', hora_inicio: '08:30', evento: '"Dia do Doador de Córneas 2026"', formacao: 'Saxofonista', entidade: 'Secretaria de Estado da Saúde (SES/MA)', local: 'Central Estadual de Transplantes do Maranhão/CET-MA Anexo - Hospital Dr. Carlos Macieira Av. Jerônimo de Albuquerque, s/n Calhau', numero_documento: '2026.110222.47465' },
  { data: '2026-11-16', hora_inicio: '10:00', evento: 'Entrega da medalha de mérito legislativo Manoel Beckman, ao Dr. Raul Cancian Mochel', entidade: 'ASSEMBLEIA LEGISLATIVA DO MARANHÃO', local: 'ALEMA', numero_documento: '2026.190110.42616' },
  { data: '2026-11-19', hora_inicio: '15:00', evento: 'Guarda e recepção de General de Brigada do Exército Brasileiro Roberval', entidade: 'Liga Acadêmica de Defesa e Estudos Estratégicos (LADEE)/ Associação dos Oficiais da Reserva do Exército (AORE-MA)', local: 'AUDITÓRIO CORONEL BAZOLA, NO QUARTEL DO COMANDO-GERAL DA PMMA', numero_documento: '2026.190110.46108' },
  { data: '2026-11-19', hora_inicio: '12:00', evento: 'FORMATURA ALUSIVA AO DIA DA BANDEIRA', entidade: 'PMMA', local: 'PATIO EXTERNO QUARTEL DO COMANDO-GERAL DA PMMA', numero_documento: '2026.190110.47167' },
  { data: '2026-11-21', hora_inicio: '07:30', evento: 'LEX & ORDEM – Congresso de Ciências Criminais e Segurança Pública', entidade: 'INSTITUTO ALTUS JUS', local: 'Multicenter Sebrae – São Luís/MA', numero_documento: '2026.190110.47409' },
  { data: '2026-11-22', hora_inicio: '20:30', evento: 'Festejo NOSSA SENHORA DA VITÓRIA', entidade: 'PARÓQUIA NOSSA SENHORA DA GLÓRIA E SÃO JUDAS TADEU', local: 'Rua Nossa Senhora da Vitória (atrás do Detran), Praça Frei José Schlütter.', numero_documento: '2026.190110.42970' },
  { data: '2026-11-23', hora_inicio: '11:00', evento: 'SESSÃO SOLENE DE ENTREGA DE TITULO DE CIDADÃO MARANHENSE – CEL. QOEM XAVIER', entidade: 'ASSEMBLEIA LEGISLATIVA DO MARANHÃO', local: 'ALEMA', tipo_documento: 'Nenhum' },
  { data: '2026-11-24', hora_inicio: '18:00', evento: 'curso de capacitação dos Conselhos Comunitários Pela Paz', entidade: 'Programa Pacto pela Paz/SSPMA', local: 'Auditório da UEMANet, no Campus da Cidade Universitária Paulo IV - UEMA', numero_documento: '2026.19101.17080' },
  { data: '2026-11-30', hora_inicio: '10:00', evento: 'Entrega da medalha de mérito legislativo Manoel Beckman, ao Dr. Dyego José de Araújo Brito', entidade: 'ASSEMBLEIA LEGISLATIVA DO MARANHÃO', local: 'ALEMA', numero_documento: '2026.190110.42616' },
];

module.exports = { EVENTOS };

if (require.main === module) main();

function main() {
  const username = process.argv[2];
  if (!username) { console.error('Uso: node scripts/seed-nov-2026.js <usuario>'); return process.exit(1); }
  const db = openDatabase(config.databasePath);
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) { console.error(`Usuário "${username}" não encontrado.`); return process.exit(1); }
  const events = createEventService(db, createAudit(db));
  const existing = db.prepare(`SELECT COUNT(*) AS n FROM events WHERE data LIKE '2026-11-%' AND deleted_at IS NULL`).get().n;
  if (existing && !process.argv.includes('--force')) {
    console.error(`Já existem ${existing} eventos em novembro/2026. Use --force para importar mesmo assim.`);
    process.exit(1);
  }
  const req = { user, ip: 'script' };
  for (const e of EVENTOS) events.create(validateEvent({ tipo_documento: 'SEI', status: 'confirmado', ...e }), req);
  console.log(`${EVENTOS.length} eventos de novembro/2026 importados.`);
  db.close();
}

