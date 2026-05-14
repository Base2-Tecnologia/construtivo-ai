/**
 * CONSTRUTIVO — Módulo Canteiro de Obras
 *
 * Tela focada no encarregado de campo:
 *   Aba 1 — Pendências de Material: atividades com Gatilho Compra Material vencendo
 *   Aba 2 — Minhas Requisições: RMs abertas por este usuário / esta obra
 */

const Canteiro = {
  _aba:        'pendencias',  // 'pendencias' | 'requisicoes'
  _obras:      [],
  _pendencias: [],
  _requisicoes:[],
  _filtroStatus: '',          // '' | 'vencido' | 'proximo'
  _filtroObraId: '',
  _loading:    false,
  // Modal de requisição — estado dos itens
  _items:      [],            // [{idx, nome, detalhes, quantidade, unidade, wbs}]
  _itemIdx:    0,             // contador para IDs únicos de item
  _defaultWbs: '',            // WBS da atividade de origem

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
              : `<button onclick="Canteiro.abrirModalRM(${p.id}, '${H.esc(p.nome).replace(/'/g,"\\'")}', ${p.obra_id}, ${p.cronograma_id||'null'}, '${p.data_inicio||''}', '${(p.wbs||'').replace(/'/g,"\\'")}')"
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
      pendente:  { bg: 'rgba(234,179,8,.12)',  color: '#ca8a04',      border: 'rgba(234,179,8,.4)',  label: '⏳ Pendente'  },
      em_compra: { bg: 'rgba(37,99,235,.1)',   color: '#2563eb',      border: 'rgba(37,99,235,.4)', label: '🔄 Em Compra' },
      entregue:  { bg: 'rgba(34,197,94,.1)',   color: 'var(--green)', border: 'rgba(34,197,94,.3)', label: '✅ Entregue'  },
      cancelado: { bg: 'var(--bg2)',           color: 'var(--text3)', border: 'var(--border)',       label: '❌ Cancelado' },
    };

    const cards = rms.map(rm => {
      const ss = statusStyle[rm.status] || statusStyle.pendente;
      const itens = Array.isArray(rm.itens) ? rm.itens : (rm.itens ? JSON.parse(rm.itens) : []);
      const itensHtml = itens.length
        ? `<div style="margin-top:8px;border:1px solid var(--border);border-radius:6px;overflow:hidden">
            <table style="width:100%;border-collapse:collapse;font-size:11px">
              <thead>
                <tr style="background:var(--bg2);color:var(--text3)">
                  <th style="padding:5px 8px;text-align:left;font-weight:600">Item</th>
                  <th style="padding:5px 8px;text-align:right;font-weight:600;width:60px">Qtd</th>
                  <th style="padding:5px 8px;text-align:left;font-weight:600;width:55px">Unid.</th>
                  <th style="padding:5px 8px;text-align:left;font-weight:600;width:70px">WBS</th>
                </tr>
              </thead>
              <tbody>${itens.map((it, i) => `
                <tr style="border-top:1px solid var(--border);background:${i%2?'var(--bg2)':'var(--surface)'}">
                  <td style="padding:5px 8px">
                    <div style="font-weight:600;color:var(--text)">${H.esc(it.nome||'')}</div>
                    ${it.detalhes ? `<div style="font-size:10px;color:var(--text3);margin-top:1px">${H.esc(it.detalhes)}</div>` : ''}
                  </td>
                  <td style="padding:5px 8px;text-align:right;color:var(--text2)">${it.quantidade||'—'}</td>
                  <td style="padding:5px 8px;color:var(--text3)">${H.esc(it.unidade||'')}</td>
                  <td style="padding:5px 8px;color:var(--text3);font-size:10px">${H.esc(it.wbs||'')}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>`
        : '';

      return `
        <div style="border:1px solid var(--border);border-left:4px solid ${ss.color};border-radius:10px;padding:14px;margin-bottom:10px;background:var(--surface2)">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px">
            <div style="flex:1;min-width:0">
              <div style="font-size:10px;font-weight:700;letter-spacing:.5px;color:var(--text3)">${H.esc(rm.codigo||'')}</div>
              <div style="font-weight:700;font-size:13px;margin-top:2px">${H.esc(rm.descricao)}</div>
              ${rm.atividade_nome ? `<div style="font-size:11px;color:var(--text3);margin-top:2px">↳ ${H.esc(rm.atividade_nome)}</div>` : ''}
              <div style="font-size:11px;color:var(--text3);margin-top:2px">🏗 ${H.esc(rm.obra_nome||'—')}</div>
            </div>
            <span style="flex-shrink:0;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;background:${ss.bg};color:${ss.color};border:1px solid ${ss.border}">${ss.label}</span>
          </div>
          ${itensHtml}
          <div style="display:flex;gap:16px;font-size:11px;color:var(--text2);flex-wrap:wrap;margin-top:8px;align-items:center">
            ${rm.wbs ? `<span>WBS: <b>${H.esc(rm.wbs)}</b></span>` : ''}
            ${rm.data_necessidade ? `<span>Necessário em: <b>${fmtDate(rm.data_necessidade)}</b></span>` : ''}
            <span>Criado em: ${fmtDate(rm.criado_em)}</span>
            ${rm.total_anexos > 0 ? `<button onclick="Canteiro._verAnexosRM(${rm.id},'${H.esc(rm.codigo||'RM').replace(/'/g,"\\'")}')"
              style="padding:2px 8px;border-radius:10px;font-size:11px;background:var(--surface2);color:var(--accent);border:1px solid var(--border);cursor:pointer;font-weight:600">
              📎 ${rm.total_anexos} anexo${rm.total_anexos>1?'s':''}
            </button>` : ''}
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

  // ── Modal de Solicitar Material — helpers de itens ────────────
  _addItem() {
    const idx = this._itemIdx++;
    this._items.push({ idx, nome: '', detalhes: '', quantidade: '', unidade: '', wbs: this._defaultWbs });
    this._renderItemsList();
    setTimeout(() => H.el(`rm-item-nome-${idx}`)?.focus(), 40);
  },

  _removeItem(idx) {
    this._items = this._items.filter(i => i.idx !== idx);
    this._renderItemsList();
  },

  _updateItem(idx, field, value) {
    const item = this._items.find(i => i.idx === idx);
    if (item) item[field] = value;
  },

  _renderItemsList() {
    const cont = H.el('rm-itens-list');
    if (!cont) return;

    if (!this._items.length) {
      cont.innerHTML = `<div style="text-align:center;padding:20px;border:2px dashed var(--border);border-radius:8px;color:var(--text3);font-size:12px">
        Clique em "+ Adicionar Item" para incluir os materiais necessários
      </div>`;
      return;
    }

    const units = [
      ['','— Selecione —'],
      ['un','un — unidade'],['pç','pç — peça'],['cx','cx — caixa'],['sc','sc — saco'],
      ['fd','fd — fardo'],['rl','rl — rolo'],['par','par — par'],['conj','conj — conjunto'],
      ['m','m — metro linear'],['m²','m² — metro quadrado'],['m³','m³ — metro cúbico'],
      ['cm','cm — centímetro'],['mm','mm — milímetro'],
      ['kg','kg — quilograma'],['g','g — grama'],['t','t — tonelada'],
      ['l','l — litro'],['ml','ml — mililitro'],['gl','gl — galão'],['balde','balde'],
      ['vb','vb — verba'],['hr','hr — hora'],['dia','dia — dia'],['mês','mês — mês'],
    ];
    const optHtml = units.map(([v,lbl]) => `<option value="${v}">${lbl}</option>`).join('');

    cont.innerHTML = this._items.map((item, i) => `
      <div style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:8px;background:var(--bg2)" id="rm-item-block-${item.idx}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-size:10px;font-weight:700;letter-spacing:.5px;color:var(--text3)">ITEM ${i + 1}</span>
          ${this._items.length > 1 ? `<button type="button" onclick="Canteiro._removeItem(${item.idx})"
            style="background:none;border:none;color:var(--red);cursor:pointer;font-size:16px;padding:0 4px;line-height:1" title="Remover item">✕</button>` : ''}
        </div>

        <div class="fg" style="margin-bottom:8px">
          <label class="fl" style="font-size:11px">Material / Item <span style="color:var(--red)">*</span></label>
          <input class="fi" type="text" id="rm-item-nome-${item.idx}"
                 placeholder="Ex: Cimento CP-II, Vergalhão 10mm, Tubo PVC 100mm..."
                 oninput="Canteiro._updateItem(${item.idx},'nome',this.value)">
        </div>

        <div class="fg" style="margin-bottom:8px">
          <label class="fl" style="font-size:11px">Detalhes Técnicos (opcional)</label>
          <textarea class="fi" id="rm-item-det-${item.idx}" rows="2"
                    placeholder="Especificações, normas, marca preferencial, cor..."
                    oninput="Canteiro._updateItem(${item.idx},'detalhes',this.value)"
                    style="font-size:12px;resize:vertical"></textarea>
        </div>

        <div style="display:flex;gap:10px;margin-bottom:8px">
          <div class="fg" style="flex:1">
            <label class="fl" style="font-size:11px">Quantidade</label>
            <input class="fi" type="number" id="rm-item-qtd-${item.idx}" min="0" step="any"
                   placeholder="0"
                   oninput="Canteiro._updateItem(${item.idx},'quantidade',this.value)">
          </div>
          <div class="fg" style="flex:1.5">
            <label class="fl" style="font-size:11px">Unidade</label>
            <select class="sel fi" id="rm-item-un-${item.idx}"
                    onchange="Canteiro._updateItem(${item.idx},'unidade',this.value)">
              ${optHtml}
            </select>
          </div>
        </div>

        <div class="fg">
          <label class="fl" style="font-size:11px">WBS (código de serviço)</label>
          <input class="fi" type="text" id="rm-item-wbs-${item.idx}"
                 placeholder="Ex: 1.2.3 — Estrutura de Concreto"
                 oninput="Canteiro._updateItem(${item.idx},'wbs',this.value)"
                 style="font-size:12px">
        </div>
      </div>`).join('');

    // Restaura valores salvos nos campos gerados
    this._items.forEach(item => {
      const nome = H.el(`rm-item-nome-${item.idx}`);
      const det  = H.el(`rm-item-det-${item.idx}`);
      const qtd  = H.el(`rm-item-qtd-${item.idx}`);
      const un   = H.el(`rm-item-un-${item.idx}`);
      const wbs  = H.el(`rm-item-wbs-${item.idx}`);
      if (nome) nome.value = item.nome;
      if (det)  det.value  = item.detalhes;
      if (qtd)  qtd.value  = item.quantidade;
      if (un  && item.unidade)  un.value  = item.unidade;
      if (wbs)  wbs.value  = item.wbs;
    });
  },

  // ── Modal de Solicitar Material ───────────────────────────────
  abrirModalRM(ativId, ativNome, obraId, cronId, dataInicio, wbs) {
    H.el('rm-atv-id').value  = ativId    || '';
    H.el('rm-cron-id').value = cronId    || '';
    H.el('rm-obra-id').value = obraId    || '';
    H.el('rm-data-nec').value = dataInicio || '';
    H.el('rm-atv-nome').textContent = ativNome;
    const wbsCtx = H.el('rm-wbs-ctx');
    if (wbsCtx) wbsCtx.textContent = wbs ? `WBS: ${wbs}` : '';
    H.el('rm-obs').value = '';
    H.el('rm-error').textContent = '';
    const anexEl = H.el('rm-anexos');
    if (anexEl) anexEl.value = '';

    // Reset itens e pré-adiciona um item com WBS da atividade
    this._items     = [];
    this._itemIdx   = 0;
    this._defaultWbs = wbs || '';
    this._addItem();

    UI.openModal('modal-rm-criar');
  },

  async submitRM() {
    const ativId  = parseInt(H.el('rm-atv-id').value)  || null;
    const cronId  = parseInt(H.el('rm-cron-id').value) || null;
    const obraId  = parseInt(H.el('rm-obra-id').value) || null;
    const dataNec = H.el('rm-data-nec').value || null;
    const obs     = H.el('rm-obs').value.trim();
    const errEl   = H.el('rm-error');

    // Lê valores atuais do DOM antes de validar
    const itens = this._items.map(item => ({
      nome:       (H.el(`rm-item-nome-${item.idx}`)?.value || '').trim(),
      detalhes:   (H.el(`rm-item-det-${item.idx}`)?.value  || '').trim(),
      quantidade: parseFloat(H.el(`rm-item-qtd-${item.idx}`)?.value) || null,
      unidade:    (H.el(`rm-item-un-${item.idx}`)?.value   || '').trim(),
      wbs:        (H.el(`rm-item-wbs-${item.idx}`)?.value  || '').trim(),
    })).filter(i => i.nome);

    if (!itens.length) { errEl.textContent = 'Adicione pelo menos um item com nome.'; return; }
    if (!obraId)       { errEl.textContent = 'Obra não identificada.'; return; }

    const btn = H.el('rm-btn-salvar');
    btn.disabled = true;
    btn.textContent = '⏳ Salvando...';
    errEl.textContent = '';

    try {
      const rm = await API.createReqMaterial({
        atividade_id:    ativId,
        cronograma_id:   cronId,
        obra_id:         obraId,
        descricao:       itens[0].nome,   // resumo para exibição rápida
        itens,
        wbs:             itens[0].wbs || null,
        observacao:      obs || null,
        data_necessidade: dataNec || null,
      });

      // Upload de anexos (se houver)
      const fileInput = H.el('rm-anexos');
      if (fileInput?.files?.length) {
        const token = localStorage.getItem('construtivo_token');
        const hdrs  = token ? { Authorization: `Bearer ${token}` } : {};
        for (const file of Array.from(fileInput.files)) {
          btn.textContent = `⏳ Enviando ${file.name}…`;
          const fd = new FormData();
          fd.append('files', file); // campo esperado pelo multer: _upload.array('files')
          const res = await fetch(`/api/canteiro/req-materiais/${rm.id}/anexos`, { method: 'POST', headers: hdrs, body: fd });
          if (!res.ok) console.warn('Falha ao enviar anexo:', file.name);
        }
      }

      UI.closeModal('modal-rm-criar');
      UI.toast(`Requisição ${rm.codigo || ''} criada! ✅`, 'success');
      // Remove a atividade da lista de pendências (já tem RM aberta)
      this._pendencias = this._pendencias.filter(p => p.id !== ativId);
      this._renderPendencias();
      // Invalida cache de suprimentos
      if (typeof Coloridao !== 'undefined') Coloridao._reqMateriais = null;
    } catch (e) {
      errEl.textContent = 'Erro: ' + e.message;
    } finally {
      btn.disabled = false;
      btn.textContent = '✅ Solicitar Material';
    }
  },

  // ── Ver Anexos de uma RM ──────────────────────────────────────
  async _verAnexosRM(rmId, codigo) {
    // Abre modal de detalhe do coloridão (compartilhado) se disponível
    const titleEl = H.el('col-det-title');
    const bodyEl  = H.el('col-det-body');
    if (!titleEl || !bodyEl) { UI.toast('Modal não disponível', 'error'); return; }
    titleEl.textContent = `📎 Anexos — ${codigo}`;
    bodyEl.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text3)">⏳ Carregando...</div>';
    UI.openModal('modal-coloridao-det');
    try {
      const anexos = await API.reqMateriaisAnexos(rmId);
      if (!anexos.length) {
        bodyEl.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3)"><div style="font-size:32px;margin-bottom:10px">📭</div>Nenhum anexo nesta requisição.</div>';
        return;
      }
      const icon = nome => {
        const ext = (nome||'').split('.').pop().toLowerCase();
        if (['jpg','jpeg','png','gif','webp'].includes(ext)) return '🖼';
        if (ext === 'pdf') return '📄';
        if (['doc','docx'].includes(ext)) return '📝';
        if (['xls','xlsx'].includes(ext)) return '📊';
        return '📎';
      };
      const fmtDate = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
      bodyEl.innerHTML = `<div style="padding:16px">` + anexos.map(a => {
        const url = a.url_view || a.caminho || null;
        const nomeTrunc = (a.nome||'arquivo').length > 55 ? (a.nome||'arquivo').slice(0,52)+'…' : (a.nome||'arquivo');
        return `
          <div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;background:var(--surface2)">
            <span style="font-size:24px;flex-shrink:0">${icon(a.nome)}</span>
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:13px;color:var(--text);word-break:break-all">${H.esc(nomeTrunc)}</div>
              <div style="font-size:11px;color:var(--text3);margin-top:2px">Enviado em ${fmtDate(a.criado_em)}${a.enviado_por ? ' por ' + H.esc(a.enviado_por) : ''}</div>
            </div>
            ${url ? `<a href="${H.esc(url)}" target="_blank" rel="noopener"
              style="flex-shrink:0;padding:6px 14px;border-radius:6px;border:1px solid var(--accent);color:var(--accent);font-size:12px;font-weight:600;text-decoration:none">
              ⬇ Baixar
            </a>` : `<span style="flex-shrink:0;font-size:11px;color:var(--text3)">sem link</span>`}
          </div>`;
      }).join('') + '</div>';
    } catch (e) {
      bodyEl.innerHTML = `<div style="padding:30px;text-align:center;color:var(--red)">❌ Erro: ${H.esc(e.message)}</div>`;
    }
  },

  // ── Ver histórico de RMs de uma atividade ────────────────────
  async _verHistRM(ativId, ativNome) {
    try {
      const rms = await API.reqMateriais({ atividade_id: ativId });
      if (!rms.length) { UI.toast('Nenhuma RM aberta para esta atividade.', 'info'); return; }
      this._setAba('requisicoes');
      this._requisicoes = rms;
      this._renderRequisicoes();
    } catch (e) {
      UI.toast('Erro ao carregar RMs: ' + e.message, 'error');
    }
  },
};
