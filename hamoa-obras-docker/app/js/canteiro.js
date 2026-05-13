/**
 * CONSTRUTIVO — Módulo Canteiro de Obras
 *
 * Tela focada no encarregado de campo:
 *   Aba 1 — Pendências de Material: atividades com Gatilho Compra Material vencendo
 *   Aba 2 — Minhas Requisições: RMs abertas por este usuário / esta obra
 */

const Canteiro = {
  _aba:       'pendencias',  // 'pendencias' | 'requisicoes'
  _obras:     [],
  _pendencias: [],
  _requisicoes: [],
  _filtroStatus: '',         // '' | 'vencido' | 'proximo'
  _filtroObraId: '',
  _loading:   false,

  // ── Init ─────────────────────────────────────────────────────
  async init() {
    await this._populaObras();
    this._setAba('pendencias');
    await this.load();
  },

  async _populaObras() {
    try {
      this._obras = (await API.obras()) || [];
    } catch (_) { this._obras = []; }
    this._renderObraSelect();
  },

  _renderObraSelect() {
    const sel = H.el('cant-f-obra');
    if (!sel) return;
    sel.innerHTML = '<option value="">Todas as obras</option>' +
      this._obras.map(o => `<option value="${o.id}">${H.esc(o.nome)}</option>`).join('');
  },

  _setAba(aba) {
    this._aba = aba;
    ['pendencias','requisicoes'].forEach(a => {
      const btn = H.el(`cant-tab-${a}`);
      const sec = H.el(`cant-sec-${a}`);
      if (btn) btn.classList.toggle('active', a === aba);
      if (sec) sec.style.display = a === aba ? '' : 'none';
    });
  },

  // ── Load ─────────────────────────────────────────────────────
  async load() {
    if (this._loading) return;
    this._loading = true;
    try {
      const obraId = H.el('cant-f-obra')?.value || '';
      const status = this._filtroStatus;

      if (this._aba === 'pendencias') {
        await this._loadPendencias(obraId, status);
      } else {
        await this._loadRequisicoes(obraId);
      }
    } finally {
      this._loading = false;
    }
  },

  async _loadPendencias(obraId, status) {
    const cont = H.el('cant-pendencias-body');
    if (cont) cont.innerHTML = '<div class="loading-spinner" style="padding:40px;text-align:center;color:var(--text3)">⏳ Carregando...</div>';
    try {
      const params = { sem_rm: 'true' };
      if (obraId) params.obra_id = obraId;
      if (status) params.status  = status;
      this._pendencias = await API.canteiroPendencias(params);
      this._renderPendencias();
    } catch (e) {
      if (cont) cont.innerHTML = `<div style="padding:40px;text-align:center;color:var(--red)">❌ Erro: ${H.esc(e.message)}</div>`;
    }
  },

  async _loadRequisicoes(obraId) {
    const cont = H.el('cant-requisicoes-body');
    if (cont) cont.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3)">⏳ Carregando...</div>';
    try {
      const params = {};
      if (obraId) params.obra_id = obraId;
      this._requisicoes = await API.reqMateriais(params);
      this._renderRequisicoes();
    } catch (e) {
      if (cont) cont.innerHTML = `<div style="padding:40px;text-align:center;color:var(--red)">❌ Erro: ${H.esc(e.message)}</div>`;
    }
  },

  // ── Render Pendências ─────────────────────────────────────────
  _renderPendencias() {
    const cont = H.el('cant-pendencias-body');
    if (!cont) return;

    const pends = this._pendencias;

    // KPI chips
    const total    = pends.length;
    const vencidos = pends.filter(p => p.status_gatilho === 'vencido').length;
    const proximos = pends.filter(p => p.status_gatilho === 'proximo').length;

    const chip = (label, val, cor, filter) => `
      <button onclick="Canteiro._setFiltroStatus('${filter}')"
              style="display:flex;flex-direction:column;align-items:center;padding:10px 14px;border-radius:10px;border:2px solid ${this._filtroStatus===filter?cor:'var(--border)'};background:${this._filtroStatus===filter?`rgba(${cor},.1)`:'var(--surface2)'};cursor:pointer;min-width:72px;transition:all .15s">
        <span style="font-size:20px;font-weight:700;color:${cor}">${val}</span>
        <span style="font-size:10px;color:var(--text3);margin-top:2px">${label}</span>
      </button>`;

    const kpis = `
      <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
        ${chip('Total', total, 'var(--text2)', '')}
        ${chip('🔴 Vencidos', vencidos, 'var(--red)', 'vencido')}
        ${chip('🟡 Próximos', proximos, '#ca8a04', 'proximo')}
      </div>`;

    if (!pends.length) {
      cont.innerHTML = kpis + `
        <div style="text-align:center;padding:60px 20px;color:var(--text3)">
          <div style="font-size:40px;margin-bottom:12px">✅</div>
          <div style="font-size:15px;font-weight:600">Nenhuma pendência de material</div>
          <div style="font-size:12px;margin-top:6px">Todos os materiais estão dentro do prazo.</div>
        </div>`;
      return;
    }

    const today = new Date(); today.setHours(0,0,0,0);
    const fmtDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

    const cards = pends.map(p => {
      const sg = p.status_gatilho;
      const cor = sg === 'vencido' ? 'var(--red)' : sg === 'proximo' ? '#ca8a04' : 'var(--green)';
      const bg  = sg === 'vencido' ? 'rgba(239,68,68,.06)' : sg === 'proximo' ? 'rgba(234,179,8,.06)' : 'rgba(34,197,94,.06)';
      const brd = sg === 'vencido' ? 'rgba(239,68,68,.3)' : sg === 'proximo' ? 'rgba(234,179,8,.4)' : 'rgba(34,197,94,.3)';

      let urgBadge;
      if (sg === 'vencido') {
        const dias = p.dias_restantes != null ? Math.abs(p.dias_restantes) : null;
        urgBadge = `<span style="background:rgba(239,68,68,.15);color:var(--red);border:1px solid rgba(239,68,68,.4);padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700">⚠ Vencido${dias != null ? ' há ' + dias + ' dias' : ''}</span>`;
      } else if (sg === 'proximo') {
        urgBadge = `<span style="background:rgba(234,179,8,.12);color:#ca8a04;border:1px solid rgba(234,179,8,.4);padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700">⏱ Solicitar até ${fmtDate(p.data_limite_compra)}</span>`;
      } else {
        urgBadge = `<span style="background:rgba(34,197,94,.1);color:var(--green);border:1px solid rgba(34,197,94,.3);padding:3px 10px;border-radius:12px;font-size:11px">🟢 ${p.dias_restantes}d restantes</span>`;
      }

      const rmAberta = (p.rms_ativas || []).find(rm => rm.status === 'pendente' || rm.status === 'em_compra');

      return `
        <div style="border:1px solid ${brd};border-left:4px solid ${cor};border-radius:10px;padding:14px;margin-bottom:10px;background:${bg}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px">
            <div style="flex:1">
              <div style="font-weight:700;font-size:13px;color:var(--text);line-height:1.3">${H.esc(p.nome)}</div>
              ${p.grupo_pai ? `<div style="font-size:11px;color:var(--text3);margin-top:2px">↳ ${H.esc(p.grupo_pai)}</div>` : ''}
              <div style="font-size:11px;color:var(--text3);margin-top:2px">🏗 ${H.esc(p.obra_nome)}</div>
            </div>
            <div style="flex-shrink:0">${urgBadge}</div>
          </div>
          <div style="display:flex;gap:16px;font-size:11px;color:var(--text2);margin-bottom:10px;flex-wrap:wrap">
            <span>📅 Início: <b>${fmtDate(p.data_inicio)}</b></span>
            <span>🛒 Solicitar até: <b style="color:${cor}">${fmtDate(p.data_limite_compra)}</b></span>
            <span>⏳ Gatilho: <b>${p.gatilho_material}d</b></span>
            ${p.wbs ? `<span style="color:var(--text3)">WBS: ${H.esc(p.wbs)}</span>` : ''}
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${rmAberta
              ? `<span style="padding:6px 12px;border-radius:8px;font-size:11px;font-weight:600;background:rgba(234,179,8,.15);color:#ca8a04;border:1px solid rgba(234,179,8,.4)">📋 RM ${H.esc(rmAberta.codigo||'Aberta')} — ${H.esc(rmAberta.status)}</span>`
              : `<button onclick="Canteiro.abrirModalRM(${p.id}, '${H.esc(p.nome).replace(/'/g,"\\'")}', ${p.obra_id}, ${p.cronograma_id||'null'}, '${p.data_inicio||''}')"
                        style="padding:7px 16px;border-radius:8px;border:none;background:var(--accent);color:#fff;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px">
                  🛒 Solicitar Material
                </button>`
            }
            <button onclick="Canteiro._verHistRM(${p.id}, '${H.esc(p.nome).replace(/'/g,"\\'")}')"
                    style="padding:7px 12px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text2);font-size:11px;cursor:pointer">
              Ver todas RMs
            </button>
          </div>
        </div>`;
    }).join('');

    cont.innerHTML = kpis + `<div id="cant-cards">${cards}</div>`;
  },

  // ── Render Requisições ────────────────────────────────────────
  _renderRequisicoes() {
    const cont = H.el('cant-requisicoes-body');
    if (!cont) return;

    const rms = this._requisicoes;
    if (!rms.length) {
      cont.innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--text3)">
        <div style="font-size:40px;margin-bottom:12px">📭</div>
        <div style="font-size:15px;font-weight:600">Nenhuma requisição aberta</div>
        <div style="font-size:12px;margin-top:6px">Use a aba Pendências para solicitar materiais.</div>
      </div>`;
      return;
    }

    const fmtDate = d => d ? new Date(String(d).slice(0,10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
    const statusStyle = {
      pendente:   { bg: 'rgba(234,179,8,.12)',  color: '#ca8a04',      border: 'rgba(234,179,8,.4)',  label: '⏳ Pendente'  },
      em_compra:  { bg: 'rgba(37,99,235,.1)',   color: '#2563eb',      border: 'rgba(37,99,235,.4)', label: '🔄 Em Compra' },
      entregue:   { bg: 'rgba(34,197,94,.1)',   color: 'var(--green)', border: 'rgba(34,197,94,.3)', label: '✅ Entregue'  },
      cancelado:  { bg: 'var(--bg2)',           color: 'var(--text3)', border: 'var(--border)',       label: '❌ Cancelado' },
    };

    const cards = rms.map(rm => {
      const ss = statusStyle[rm.status] || statusStyle.pendente;
      return `
        <div style="border:1px solid var(--border);border-left:4px solid ${ss.color};border-radius:10px;padding:14px;margin-bottom:10px;background:var(--surface2)">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px">
            <div>
              <div style="font-size:10px;font-weight:700;letter-spacing:.5px;color:var(--text3)">${H.esc(rm.codigo||'')}</div>
              <div style="font-weight:700;font-size:13px;margin-top:2px">${H.esc(rm.descricao)}</div>
              ${rm.atividade_nome ? `<div style="font-size:11px;color:var(--text3);margin-top:2px">↳ ${H.esc(rm.atividade_nome)}</div>` : ''}
              <div style="font-size:11px;color:var(--text3);margin-top:2px">🏗 ${H.esc(rm.obra_nome||'—')}</div>
            </div>
            <span style="flex-shrink:0;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;background:${ss.bg};color:${ss.color};border:1px solid ${ss.border}">${ss.label}</span>
          </div>
          <div style="display:flex;gap:16px;font-size:11px;color:var(--text2);flex-wrap:wrap;margin-top:8px">
            ${rm.quantidade ? `<span>Qtd: <b>${rm.quantidade} ${H.esc(rm.unidade||'')}</b></span>` : ''}
            ${rm.data_necessidade ? `<span>Necessário em: <b>${fmtDate(rm.data_necessidade)}</b></span>` : ''}
            <span>Solicitado em: ${fmtDate(rm.criado_em)}</span>
          </div>
          ${rm.observacao ? `<div style="margin-top:8px;font-size:11px;color:var(--text2);padding:8px;background:var(--bg2);border-radius:6px">💬 ${H.esc(rm.observacao)}</div>` : ''}
        </div>`;
    }).join('');

    cont.innerHTML = `<div>${cards}</div>`;
  },

  // ── Filtros ───────────────────────────────────────────────────
  _setFiltroStatus(status) {
    this._filtroStatus = status;
    this.load();
  },

  // ── Modal de Solicitar Material ───────────────────────────────
  abrirModalRM(ativId, ativNome, obraId, cronId, dataInicio) {
    H.el('rm-atv-id').value       = ativId    || '';
    H.el('rm-cron-id').value      = cronId    || '';
    H.el('rm-obra-id').value      = obraId    || '';
    H.el('rm-data-nec').value     = dataInicio || '';
    H.el('rm-atv-nome').textContent = ativNome;
    H.el('rm-descricao').value    = '';
    H.el('rm-qtd').value          = '';
    H.el('rm-unidade').value      = '';
    H.el('rm-obs').value          = '';
    H.el('rm-error').textContent  = '';
    UI.openModal('modal-rm-criar');
    setTimeout(() => H.el('rm-descricao')?.focus(), 100);
  },

  async submitRM() {
    const ativId    = parseInt(H.el('rm-atv-id').value)  || null;
    const cronId    = parseInt(H.el('rm-cron-id').value) || null;
    const obraId    = parseInt(H.el('rm-obra-id').value) || null;
    const dataNec   = H.el('rm-data-nec').value || null;
    const descricao = H.el('rm-descricao').value.trim();
    const qtd       = H.el('rm-qtd').value;
    const unidade   = H.el('rm-unidade').value.trim();
    const obs       = H.el('rm-obs').value.trim();
    const errEl     = H.el('rm-error');

    if (!descricao) { errEl.textContent = 'Informe o material/item.'; return; }
    if (!obraId)    { errEl.textContent = 'Obra não identificada.'; return; }

    const btn = H.el('rm-btn-salvar');
    btn.disabled = true;
    btn.textContent = '⏳ Salvando...';
    errEl.textContent = '';

    try {
      await API.createReqMaterial({
        atividade_id:    ativId,
        cronograma_id:   cronId,
        obra_id:         obraId,
        descricao,
        quantidade:      qtd ? parseFloat(qtd) : null,
        unidade:         unidade || null,
        observacao:      obs || null,
        data_necessidade: dataNec || null,
      });
      UI.closeModal('modal-rm-criar');
      UI.toast('Requisição de material criada! ✅', 'success');
      // Recarrega sem filtro sem_rm para mostrar a nova RM
      this._pendencias = this._pendencias.filter(p => p.id !== ativId);
      this._renderPendencias();
      // Invalida cache se suprimentos estiver visível
      if (typeof Coloridao !== 'undefined') Coloridao._reqMateriais = null;
    } catch (e) {
      errEl.textContent = 'Erro: ' + e.message;
    } finally {
      btn.disabled = false;
      btn.textContent = '✅ Solicitar Material';
    }
  },

  // ── Ver histórico de RMs de uma atividade ────────────────────
  async _verHistRM(ativId, ativNome) {
    try {
      const rms = await API.reqMateriais({ atividade_id: ativId });
      if (!rms.length) { UI.toast('Nenhuma RM aberta para esta atividade.', 'info'); return; }
      // Muda para aba de requisições com filtro implícito
      this._setAba('requisicoes');
      this._requisicoes = rms;
      this._renderRequisicoes();
    } catch (e) {
      UI.toast('Erro ao carregar RMs: ' + e.message, 'error');
    }
  },
};
