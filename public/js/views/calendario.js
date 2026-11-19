import { api } from '../api.js';
import { html, $, fmtHora, toast } from '../util.js';
import { pode } from '../app.js';

const CORES = { agendado: '#163f80', confirmado: '#1f7a4d', realizado: '#6b7280', cancelado: '#9aa5b8' };
const VIEWS = ['dayGridMonth', 'timeGridWeek', 'timeGridDay', 'listMonth', 'listWeek'];

export async function render({ main, query, navigate }) {
  main.innerHTML = html`
    <div class="cabecalho-tela"><div><h1>Calendário</h1><p class="sub">Toque em um evento para ver os detalhes${pode('editor') ? ' ou em um dia para cadastrar' : ''}.</p></div></div>
    <div class="cartao calendario-wrap"><div id="cal"></div>
      <div class="legenda"><span><i style="background:#163f80"></i>Agendado</span><span><i style="background:#1f7a4d"></i>Confirmado</span>
      <span><i style="background:#6b7280"></i>Realizado</span><span><i style="background:#9aa5b8"></i>Cancelado</span></div>
    </div>`.toString();

  // FullCalendar é carregado com "defer"; aguarda se ainda não estiver disponível
  for (let i = 0; !window.FullCalendar && i < 50; i++) await new Promise((r) => setTimeout(r, 100));
  if (!window.FullCalendar) throw new Error('Componente de calendário não carregou.');

  const pequeno = window.matchMedia('(max-width: 640px)').matches;
  let salvo = null;
  try { salvo = localStorage.getItem('cal-view'); } catch { /* */ }
  const viewInicial = VIEWS.includes(query.get('view')) ? query.get('view') : (VIEWS.includes(salvo) ? salvo : (pequeno ? 'listMonth' : 'dayGridMonth'));

  const cal = new window.FullCalendar.Calendar($('#cal'), {
    locale: 'pt-br',
    timeZone: 'local',
    initialView: viewInicial,
    initialDate: query.get('data') || undefined,
    height: 'auto',
    headerToolbar: pequeno
      ? { left: 'prev,next today', center: 'title', right: '' }
      : { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay,listMonth' },
    footerToolbar: pequeno ? { center: 'dayGridMonth,timeGridWeek,timeGridDay,listMonth' } : undefined,
    buttonText: { today: 'Hoje', month: 'Mês', week: 'Semana', day: 'Dia', list: 'Lista' },
    slotMinTime: '05:00:00',
    slotMaxTime: '24:00:00',
    nowIndicator: true,
    defaultTimedEventDuration: '02:00',
    dayMaxEvents: pequeno ? 2 : 3,
    moreLinkText: (n) => `+${n}`,
    // No celular, a visão mensal mostra apenas o horário (toque abre o evento)
    views: pequeno ? {
      dayGridMonth: {
        eventContent: (arg) => {
          const el = document.createElement('div');
          el.className = 'ev-compacto';
          el.textContent = arg.event.extendedProps.hora;
          return { domNodes: [el] };
        },
      },
    } : undefined,
    navLinks: true,
    eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
    noEventsContent: 'Nenhum evento no período',
    events: async (info, ok, fail) => {
      try {
        const itens = await api.get('/api/events/calendar', { start: info.startStr.slice(0, 10), end: info.endStr.slice(0, 10) });
        ok(itens.map((e) => ({
          id: String(e.id),
          title: `${e.evento}${e.formacao ? ` (${e.formacao})` : ''}`,
          start: `${e.data}T${e.hora_inicio}`,
          end: e.hora_fim ? `${e.data}T${e.hora_fim}` : undefined,
          classNames: [`ev-${e.status}`],
          display: 'block',
          backgroundColor: CORES[e.status], borderColor: CORES[e.status], textColor: '#fff',
          extendedProps: { local: e.local, entidade: e.entidade, hora: fmtHora(e.hora_inicio) },
        })));
      } catch (err) { toast(err.message, 'erro'); fail(err); }
    },
    eventDidMount: (info) => { info.el.title = `${info.event.extendedProps.hora} — ${info.event.title}\n${info.event.extendedProps.local}`; },
    eventClick: (info) => { info.jsEvent.preventDefault(); navigate(`#/eventos/${info.event.id}`); },
    dateClick: pode('editor') ? (info) => {
      const data = info.dateStr.slice(0, 10);
      const hora = info.dateStr.length > 10 ? info.dateStr.slice(11, 16) : '';
      navigate(`#/eventos/novo?data=${data}${hora ? `&hora=${hora}` : ''}`);
    } : undefined,
    datesSet: (info) => { try { localStorage.setItem('cal-view', info.view.type); } catch { /* */ } },
  });
  cal.render();
  return () => cal.destroy();
}
