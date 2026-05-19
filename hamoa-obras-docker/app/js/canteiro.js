/**
 * CONSTRUTIVO — Módulo Canteiro de Obras (redesenhado)
 *
 * Exibe os pedidos de compra enviados pelos fornecedores via Portal do Fornecedor.
 * Perfil alvo: Suprimentos, Gestor, Admin.
 *
 * Funcionalidades:
 *   - Lista de pedidos (origem=portal_fornecedor) com filtros por status, obra, empresa
 *   - Cards ricos: Empresa, Obra, Contrato, Fornecedor, WBS, itens e anexos
 *   - Controle de status: pendente → em_compra → entregue | cancelado
 *   - Modal de detalhe com itens e anexos para análise
 */

const Canteiro = {
  _pedidos:    [],
  _obras:      [],
  _empresas:   [],
  _loading:    false,
  _filtroStatus:    '',
  _filtroObraId:    '',
  _filtroEmpresaId: '',

  // ── Init ─────────────────────────────────────────────────────
  async init() {
    await Promise.all([this._carregarObras(), this._carregarEmpresas()]);
    this._renderFiltros();
    await this.load();
  },

  async _carregarObras() {
    try { this._obras = (await API.obras()) || []; } catch { this._obras = []; }
  },

  async _carregarEmpresas() {
    try {
      const r = await fetch('/api/empresas', { headers: { Authorization: `Bearer ${localStorage.getItem('construtivo_token')}` } });
      this._empresas = r.ok ? await r.json() : [];
    } catch { this._empresas = []; }
  },

  _renderFiltros() {
    const selObra = H.el('cant-f-obra');
    if (selObra) {
      selObra.innerHTML = '<option value="">Todas as obras</option>' +
        this._obras.map(o => `<option value="${o.id}">${H.esc(o.nome)}</option>`).join('');
    }
    const selEmpresa = H.el('cant-f-empresa');
    if (selEmpresa) {
      selEmpresa.innerHTML = '<option value="">Todas as empresas</option>' +
        this._empresas.map(e => `<option value="${e.id}">${H.esc(e.nome_fantasia || e.razao_social)}</option>`).join('');
    }
  },

  // ── Load ─────────────────────────────────────────────────────
  async load() {
    if (this._loading) return;
    this._loading = true;
    const el = H.el('cant-lista');
    if (el) el.innerHTML = '<div class="loading-inline"><div class="spinner"></div> Carregando pedidos...</div>';

    try {
      const params = new URLSearchParams({ origem: 'portal_fornecedor', limit: 200 });
      if (this._filtroStatus)    params.set('status',     this._filtroStatus);
      if (this._filtroObraId)    params.set('obra_id',    this._filtroObraId);
      if (this._filtroEmpresaId) params.set('empresa_id', this._filtroEmpresaId);

      const r = await fetch(`/api/canteiro/req-materiais?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('construtivo_token')}` },
      });
      this._pedidos = r.ok ? await r.json() : [];
      this._renderLista();
      this._renderStats();
    } catch (e) {
      if (el) el.innerHTML = `<div class="empty-state"><p>Erro ao carregar: ${H.esc(e.message)}</p></div>`;
    } finally {
      this._loading = false;
    }
  },

  // ── Stats chips ───────────────────────────────────────────────
  _renderStats() {
    const total     = this._pedidos.length;
    const pendente  = this._pedidos.filter(p => p.status === 'pendente').length;
    const aprovado  = this._pedidos.filter(p => p.status === 'aprovado').length;
    const reprovado = this._pedidos.filter(p => p.status === 'reprovado').length;
    const em_compra = this._pedidos.filter(p => p.status === 'em_compra').length;
    const entregue  = this._pedidos.filter(p => p.status === 'entregue').length;

    const el = H.el('cant-stats');
    if (!el) return;
    el.innerHTML = `
      <div class="stat-chip ${!this._filtroStatus ? 'active' : ''}" onclick="Canteiro._setFiltroStatus('')">
        Todos <span>${total}</span>
      </div>
      <div class="stat-chip warn ${this._filtroStatus === 'pendente' ? 'active' : ''}" onclick="Canteiro._setFiltroStatus('pendente')">
        ⏳ Aguardando Gestor <span>${pendente}</span>
      </div>
      <div class="stat-chip info ${this._filtroStatus === 'aprovado' ? 'active' : ''}" onclick="Canteiro._setFiltroStatus('aprovado')">
        ✅ Aprovado Gestor <span>${aprovado}</span>
      </div>
      <div class="stat-chip danger ${this._filtroStatus === 'reprovado' ? 'active' : ''}" onclick="Canteiro._setFiltroStatus('reprovado')">
        ✗ Reprovado <span>${reprovado}</span>
      </div>
      <div class="stat-chip info ${this._filtroStatus === 'em_compra' ? 'active' : ''}" onclick="Canteiro._setFiltroStatus('em_compra')">
        🛒 Pedido em Compra <span>${em_compra}</span>
      </div>
      <div class="stat-chip success ${this._filtroStatus === 'entregue' ? 'active' : ''}" onclick="Canteiro._setFiltroStatus('entregue')">
        📦 Entregue <span>${entregue}</span>
      </div>
    `;
  },

  _setFiltroStatus(s) {
    this._filtroStatus = s;
    const sel = H.el('cant-f-status');
    if (sel) sel.value = s;
    this.load();
  },

  // ── Render Lista ─────────────────────────────────────────────
  _renderLista() {
    const el = H.el('cant-lista');
    if (!el) return;

    if (!this._pedidos.length) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🛒</div>
          <p>Nenhum pedido de compra encontrado.</p>
          <p class="empty-sub">Os pedidos enviados pelos fornecedores via portal aparecerão aqui.</p>
        </div>`;
      return;
    }

    el.innerHTML = this._pedidos.map(p => this._cardHTML(p)).join('');
  },

  _statusInfo(status) {
    return {
      pendente:  { label: 'Aguardando Aprovação Gestor',           cls: 'badge-warn',    icon: '⏳' },
      aprovado:  { label: 'Aprovado pelo Gestor',                  cls: 'badge-info',    icon: '✅' },
      reprovado: { label: 'Reprovado pelo Gestor',                 cls: 'badge-danger',  icon: '✗'  },
      em_compra: { label: 'Pedido em Compra',                      cls: 'badge-info',    icon: '🛒' },
      entregue:  { label: 'Entregue',                              cls: 'badge-success', icon: '📦' },
      cancelado: { label: 'Reprovado pelo Suprimentos',            cls: 'badge-danger',  icon: '✕'  },
    }[status] || { label: status, cls: 'badge-default', icon: '•' };
  },

  _cardHTML(p) {
    const st    = this._statusInfo(p.status);
    const itens = this._parseItens(p.itens);
    const total = parseInt(p.total_anexos || 0);
    const dt    = p.criado_em
      ? new Date(p.criado_em).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' })
      : '—';

    return `
    <div class="cant-card" data-id="${p.id}">
      <div class="cant-card-head">
        <div class="cant-card-codigo">${H.esc(p.codigo || '#' + p.id)}</div>
        <div class="cant-card-meta">
          <div class="cant-card-empresa">${H.esc(p.empresa_nome || '—')}</div>
          <div class="cant-card-obra">🏗️ ${H.esc(p.obra_nome || '—')}</div>
        </div>
        <span class="badge ${st.cls}">${st.icon} ${st.label}</span>
        <div class="cant-card-data">${dt}</div>
      </div>

      <div class="cant-card-body">
        <div class="cant-card-col">
          ${p.fornecedor_nome ? `
            <div class="cant-info-row">
              <span class="cant-info-label">Fornecedor</span>
              <span class="cant-info-val">${H.esc(p.fornecedor_nome)}</span>
            </div>` : ''}
          ${p.contrato_numero ? `
            <div class="cant-info-row">
              <span class="cant-info-label">Contrato</span>
              <span class="cant-info-val">${H.esc(p.contrato_numero)}${p.contrato_descricao ? ' — ' + H.esc(p.contrato_descricao) : ''}</span>
            </div>` : ''}
          ${p.atividade_wbs ? `
            <div class="cant-info-row">
              <span class="cant-info-label">WBS</span>
              <span class="cant-info-val"><span class="tag-wbs">${H.esc(p.atividade_wbs)}</span>${p.atividade_nome ? ' — ' + H.esc(p.atividade_nome) : ''}</span>
            </div>` : ''}
          ${p.grupo_pai ? `
            <div class="cant-info-row">
              <span class="cant-info-label">Grupo</span>
              <span class="cant-info-val muted">↳ ${H.esc(p.grupo_pai)}</span>
            </div>` : ''}
        </div>

        <div class="cant-card-col">
          <div class="cant-itens-titulo">Materiais solicitados (${itens.length})</div>
          <div class="cant-itens-lista">
            ${itens.slice(0, 4).map(it => `
              <div class="cant-item-row">
                <span class="cant-item-desc">${it.codigo_insumo ? `<span style="font-weight:600;color:var(--azul);margin-right:4px">${H.esc(it.codigo_insumo)}</span>` : ''}${H.esc(it.descricao || it.nome || '—')}</span>
                <span class="cant-item-qtd">${it.quantidade != null ? it.quantidade : '—'} ${H.esc(it.unidade || '')}</span>
              </div>
            `).join('')}
            ${itens.length > 4 ? `<div class="cant-item-mais">+ ${itens.length - 4} item(s) adicionais</div>` : ''}
          </div>
        </div>
      </div>

      <div class="cant-card-footer">
        <div class="cant-anexo-info">
          ${total > 0 ? `<span class="anx-chip">📎 ${total} anexo${total > 1 ? 's' : ''}</span>` : '<span class="muted">Sem anexos</span>'}
          ${p.observacao ? `<span class="anx-chip" title="${H.esc(p.observacao)}">💬 Obs</span>` : ''}
        </div>
        <div class="cant-actions">
          <button class="btn-sm btn-ghost" onclick="Canteiro.verDetalhe(${p.id})">Ver detalhes</button>
          ${p.status === 'pendente' ? `
            <button class="btn-sm btn-success-sm" onclick="Canteiro.atualizarStatus(${p.id}, 'aprovado')">✓ Aprovar</button>
            <button class="btn-sm btn-danger-sm"  onclick="Canteiro.atualizarStatus(${p.id}, 'reprovado')">✗ Reprovar</button>
          ` : ''}
        </div>
      </div>
    </div>`;
  },

  _parseItens(itens) {
    if (!itens) return [];
    if (Array.isArray(itens)) return itens;
    try { return JSON.parse(itens); } catch { return []; }
  },

  // ── Detalhe modal ─────────────────────────────────────────────
  async verDetalhe(id) {
    const body = H.el('cant-modal-body');
    if (!body) return;

    UI.openModal('cant-modal');
    body.innerHTML = '<div class="loading-inline"><div class="spinner"></div></div>';

    try {
      const r = await fetch(`/api/canteiro/req-materiais/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('construtivo_token')}` },
      });
      const p       = await r.json();
      const itens     = this._parseItens(p.itens);
      const historico = p.historico || [];
      const anexos    = p.anexos    || [];
      const st        = this._statusInfo(p.status);

      body.innerHTML = `
        <div class="det-context">
          <div class="det-ctx-grid">
            <div class="det-ctx-item"><strong>Código</strong><span>${H.esc(p.codigo || '#' + p.id)}</span></div>
            <div class="det-ctx-item"><strong>Status</strong><span class="badge ${st.cls}">${st.icon} ${st.label}</span></div>
            <div class="det-ctx-item"><strong>Empresa</strong><span>${H.esc(p.empresa_nome || '—')}</span></div>
            <div class="det-ctx-item"><strong>Obra</strong><span>${H.esc(p.obra_nome || '—')}</span></div>
            <div class="det-ctx-item"><strong>Fornecedor</strong><span>${H.esc(p.fornecedor_nome || '—')}</span></div>
            <div class="det-ctx-item"><strong>Contrato</strong><span>${H.esc(p.contrato_numero ? p.contrato_numero + (p.contrato_descricao ? ' — ' + p.contrato_descricao : '') : '—')}</span></div>
            ${p.atividade_wbs ? `<div class="det-ctx-item det-wide"><strong>WBS</strong><span><span class="tag-wbs">${H.esc(p.atividade_wbs)}</span> ${H.esc(p.atividade_nome || '')}</span></div>` : ''}
            ${p.observacao    ? `<div class="det-ctx-item det-wide"><strong>Observação</strong><span>${H.esc(p.observacao)}</span></div>` : ''}
          </div>
        </div>

        <div class="det-secao">
          <div class="det-secao-titulo">Materiais Solicitados</div>
          <table class="det-table">
            <thead><tr><th>#</th><th>Código</th><th>Descrição</th><th>Quantidade</th><th>Unidade</th></tr></thead>
            <tbody>
              ${itens.map((it, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td style="font-weight:600;white-space:nowrap">${H.esc(it.codigo_insumo || '—')}</td>
                  <td>${H.esc(it.descricao || it.nome || '—')}</td>
                  <td>${it.quantidade != null ? it.quantidade : '—'}</td>
                  <td>${H.esc(it.unidade || '—')}</td>
                </tr>
              `).join('')}
              ${!itens.length ? '<tr><td colspan="5" class="txt-center muted">Nenhum item</td></tr>' : ''}
            </tbody>
          </table>
        </div>

        ${anexos.length ? `
        <div class="det-secao">
          <div class="det-secao-titulo">Anexos para Análise (${anexos.length})</div>
          <div class="det-anexos">
            ${anexos.map(a => {
              const icon = a.tipo === 'img' ? '🖼️' : a.tipo === 'pdf' ? '📄' : '📎';
              return `<a class="det-anx-chip" href="${H.esc(a.url_view || '#')}" target="_blank" rel="noopener">
                ${icon} ${H.esc(a.nome)} ${a.tamanho ? `<em>${H.esc(a.tamanho)}</em>` : ''}
              </a>`;
            }).join('')}
          </div>
        </div>` : ''}

        ${historico.length ? `
        <div class="det-secao">
          <div class="det-secao-titulo">Histórico</div>
          <div class="det-historico">
            ${historico.map(h => `
              <div class="det-hist-row">
                <div class="det-hist-dot"></div>
                <div class="det-hist-info">
                  <strong>${H.esc(h.status_para || '—')}</strong>
                  ${h.observacao ? ` — ${H.esc(h.observacao)}` : ''}
                  <span>${H.esc(h.usuario || '—')} · ${new Date(h.criado_em).toLocaleString('pt-BR')}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>` : ''}

        <div class="det-acoes">
          ${p.status === 'pendente' ? `
            <button class="btn-success" onclick="Canteiro.atualizarStatus(${p.id},'aprovado');Canteiro.fecharModal()">✓ Aprovar Pedido</button>
            <button class="btn-danger"  onclick="Canteiro.atualizarStatus(${p.id},'reprovado');Canteiro.fecharModal()">✗ Reprovar Pedido</button>
          ` : ''}
        </div>
      `;
    } catch (e) {
      body.innerHTML = `<p style="color:var(--danger)">Erro: ${H.esc(e.message)}</p>`;
    }
  },

  fecharModal() {
    UI.closeModal('cant-modal');
  },

  // ── Atualizar status ─────────────────────────────────────────
  async atualizarStatus(id, novoStatus) {
    const labels = {
      aprovado:  'Aprovado pelo Gestor',
      reprovado: 'Reprovado pelo Gestor',
      em_compra: 'Pedido em Compra',
      entregue:  'Entregue',
      cancelado: 'Reprovado pelo Suprimentos',
    };
    if (!confirm(`Confirma: alterar status para "${labels[novoStatus] || novoStatus}"?`)) return;

    try {
      const r = await fetch(`/api/canteiro/req-materiais/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${localStorage.getItem('construtivo_token')}`,
        },
        body: JSON.stringify({ status: novoStatus }),
      });
      if (!r.ok) throw new Error((await r.json()).error || 'Erro');
      UI.toast(`Status atualizado: ${labels[novoStatus]}`, 'success');
      await this.load();
    } catch (e) {
      UI.toast('Erro: ' + e.message, 'error');
    }
  },

  // ── Filtros ───────────────────────────────────────────────────
  onFiltroChange() {
    this._filtroStatus    = H.el('cant-f-status')?.value   || '';
    this._filtroObraId    = H.el('cant-f-obra')?.value     || '';
    this._filtroEmpresaId = H.el('cant-f-empresa')?.value  || '';
    this.load();
  },
};
