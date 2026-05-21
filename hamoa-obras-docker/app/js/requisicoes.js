/**
 * CONSTRUTIVO — Módulo Acomp. Requisições de Material
 *
 * Tela de acompanhamento (somente leitura) para o time de suprimentos.
 * Fluxo: Prestador solicita → Gestor aprova & integra UAU (ou reprova)
 *        → Suprimentos monitora rastreando o número UAU no ERP.
 */

const Requisicoes = {
  _dados:   null,
  _obras:   [],
  _loading: false,
  _expanded: {}, // { obraKey: true } — undefined = expandido por padrão

  // ── Init ─────────────────────────────────────────────────────
  async init() {
    await this._popularEmpresas();
    await this._popularObras('');
    await this.load();
  },

  async _popularEmpresas() {
    const sel = H.el('req-f-empresa');
    if (!sel) return;
    try {
      const emps = await API.empresas();
      sel.innerHTML = '<option value="">Todas as empresas</option>' +
        emps.map(e => `<option value="${e.id}">${H.esc(e.nome_fantasia || e.razao_social)}</option>`).join('');
    } catch (_) {}
  },

  async _popularObras(empresaId) {
    const sel = H.el('req-f-obra');
    if (!sel) return;
    try {
      this._obras = (await API.obras(empresaId || undefined)) || [];
      sel.innerHTML = '<option value="">Todas as obras</option>' +
        this._obras.map(o => `<option value="${o.id}">${H.esc(o.nome)}</option>`).join('');
    } catch (_) {}
  },

  async onEmpresaChange() {
    const empId = H.el('req-f-empresa')?.value || '';
    const selObra = H.el('req-f-obra');
    if (selObra) selObra.value = '';
    await this._popularObras(empId);
    await this.load();
  },

  // ── Load ─────────────────────────────────────────────────────
  async load() {
    if (this._loading) return;
    this._loading = true;
    const cont = H.el('req-body');
    if (!cont) return;
    cont.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3)">⏳ Carregando requisições...</div>';
    try {
      const obraId = H.el('req-f-obra')?.value   || '';
      const status = H.el('req-f-status')?.value || '';
      const params = {};
      if (obraId) params.obra_id = obraId;
      if (status) params.status  = status;
      this._dados = await API.reqMateriais(params);
      this._render();
    } catch (e) {
      if (cont) cont.innerHTML = `<div style="padding:40px;text-align:center;color:var(--red)">❌ Erro: ${H.esc(e.message)}</div>`;
    } finally {
      this._loading = false;
    }
  },

  // ── Status config ─────────────────────────────────────────────
  // Fluxo real: pendente → (aprovado transitório) → em_compra (UAU) | reprovado
  _st: {
    pendente:  { color: '#ca8a04', bg: '#fef9c3', dot: '#ca8a04', label: 'Aguardando gestor'      },
    aprovado:  { color: '#ca8a04', bg: '#fef9c3', dot: '#ca8a04', label: 'Aguardando gestor'      }, // estado transitório
    em_compra: { color: '#0369a1', bg: '#e0f2fe', dot: '#0369a1', label: 'Integrado UAU'          },
    entregue:  { color: '#0369a1', bg: '#e0f2fe', dot: '#0369a1', label: 'Integrado UAU'          },
    reprovado: { color: '#dc2626', bg: '#fee2e2', dot: '#dc2626', label: 'Reprovado pelo gestor'  },
    cancelado: { color: '#dc2626', bg: '#fee2e2', dot: '#dc2626', label: 'Reprovado'              },
  },
  _status(s) { return this._st[s] || { color: 'var(--text3)', bg: 'var(--bg2)', dot: 'var(--text3)', label: s }; },

  _isPendente(s)   { return ['pendente', 'aprovado'].includes(s); },
  _isUau(s)        { return ['em_compra', 'entregue'].includes(s); },
  _isReprovado(s)  { return ['reprovado', 'cancelado'].includes(s); },

  // ── Toggle expand por obra ────────────────────────────────────
  toggleObra(key) {
    // undefined → expandido por padrão, então primeiro clique colapsa
    this._expanded[key] = this._expanded[key] === false ? undefined : false;
    this._render();
  },

  // ── Render ────────────────────────────────────────────────────
  _render() {
    const cont = H.el('req-body');
    if (!cont) return;
    const rms = this._dados || [];

    if (!rms.length) {
      cont.innerHTML = `
        <div style="text-align:center;padding:60px 20px;color:var(--text3)">
          <div style="font-size:36px;margin-bottom:12px">📭</div>
          <div style="font-size:15px;font-weight:600">Nenhuma requisição encontrada</div>
          <div style="font-size:13px;margin-top:6px">Ajuste os filtros ou aguarde novas solicitações</div>
        </div>`;
      return;
    }

    const fmtDate = d => d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

    // KPIs globais
    const total      = rms.length;
    const pendentes  = rms.filter(r => this._isPendente(r.status)).length;
    const integUAU   = rms.filter(r => this._isUau(r.status)).length;
    const reprovados = rms.filter(r => this._isReprovado(r.status)).length;

    let html = `
      <div style="display:flex;align-items:center;gap:8px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:8px 12px;margin-bottom:16px;font-size:11px;color:var(--text3)">
        👁 <span>Tela de acompanhamento — aprovação e integração UAU são realizadas pelo gestor em <strong style="color:var(--text2)">Aprov. Req. Material</strong>. Use o número UAU para rastrear o pedido no ERP.</span>
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:18px">
        <div style="background:var(--surface2);border-radius:8px;padding:10px 12px">
          <div style="font-size:22px;font-weight:700;color:var(--text)">${total}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">Total de requisições</div>
        </div>
        <div style="background:var(--surface2);border-radius:8px;padding:10px 12px">
          <div style="font-size:22px;font-weight:700;color:#ca8a04">${pendentes}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">Aguardando gestor</div>
        </div>
        <div style="background:var(--surface2);border-radius:8px;padding:10px 12px">
          <div style="font-size:22px;font-weight:700;color:#0369a1">${integUAU}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">Integradas ao UAU</div>
        </div>
        <div style="background:var(--surface2);border-radius:8px;padding:10px 12px">
          <div style="font-size:22px;font-weight:700;color:#dc2626">${reprovados}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">Reprovadas pelo gestor</div>
        </div>
      </div>`;

    // Agrupa por obra
    const porObra = {};
    for (const rm of rms) {
      const k = rm.obra_nome || `Obra ${rm.obra_id}`;
      if (!porObra[k]) porObra[k] = { items: [], empresa: rm.empresa_nome || '' };
      porObra[k].items.push(rm);
    }

    // Ordena: obras com pendentes primeiro, depois por quantidade desc
    const obrasSorted = Object.entries(porObra).sort(([, a], [, b]) => {
      const aPend = a.items.filter(r => this._isPendente(r.status)).length;
      const bPend = b.items.filter(r => this._isPendente(r.status)).length;
      if (bPend !== aPend) return bPend - aPend;
      return b.items.length - a.items.length;
    });

    const MAX_VISIBLE = 3;

    for (const [obraKey, { items, empresa }] of obrasSorted) {
      const pend     = items.filter(r => this._isPendente(r.status)).length;
      const uauCount = items.filter(r => this._isUau(r.status)).length;
      const reprov   = items.filter(r => this._isReprovado(r.status)).length;

      const isExpanded = this._expanded[obraKey] !== false;
      const visibleItems = isExpanded ? items : items.slice(0, MAX_VISIBLE);
      const hasMore = items.length > MAX_VISIBLE;

      const pipeNum = (n, color) => `<div style="font-size:18px;font-weight:700;color:${n > 0 ? color : 'var(--border)'}">${n}</div>`;

      html += `
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;margin-bottom:12px;overflow:hidden">

          <!-- Cabeçalho da obra -->
          <div style="display:flex;align-items:center;gap:14px;padding:12px 16px;background:var(--surface2);border-bottom:1px solid var(--border)">
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:700;color:var(--text)">🏗 ${H.esc(obraKey)}</div>
              ${empresa ? `<div style="font-size:11px;color:var(--text3);margin-top:1px">${H.esc(empresa)}</div>` : ''}
            </div>
            <!-- Pipeline visual -->
            <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
              <div style="text-align:center;min-width:58px">
                ${pipeNum(pend, '#ca8a04')}
                <div style="font-size:10px;color:var(--text3);line-height:1.2">Aguard.<br>gestor</div>
              </div>
              <div style="color:var(--border);font-size:13px;margin-bottom:14px">→</div>
              <div style="text-align:center;min-width:68px">
                ${pipeNum(uauCount, '#0369a1')}
                <div style="font-size:10px;color:var(--text3);line-height:1.2">Integrado<br>UAU</div>
              </div>
              <div style="color:var(--border);font-size:10px;margin-bottom:14px;padding:0 2px">|</div>
              <div style="text-align:center;min-width:58px">
                ${pipeNum(reprov, '#dc2626')}
                <div style="font-size:10px;color:var(--text3);line-height:1.2">Reprovado<br>gestor</div>
              </div>
            </div>
          </div>

          <!-- Lista de RMs -->
          <div style="padding:4px 12px 4px">`;

      for (const rm of visibleItems) {
        const st = this._status(rm.status);
        const origemBadge = rm.origem === 'portal_fornecedor'
          ? `<span style="background:#f3e8ff;color:#7c3aed;font-size:10px;border-radius:8px;padding:2px 7px;font-weight:600;white-space:nowrap;flex-shrink:0">Portal</span>`
          : '';
        const uauBadge = rm.uau_pedido_numero
          ? `<span style="background:#e0f2fe;color:#0369a1;font-size:10px;border-radius:8px;padding:3px 8px;font-weight:600;white-space:nowrap;flex-shrink:0">🔗 UAU ${H.esc(rm.uau_pedido_numero)}</span>`
          : '';
        const itens = this._parseItens(rm.itens);
        const nItens = itens.length;

        html += `
          <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)">
            <div style="width:8px;height:8px;border-radius:50%;background:${st.dot};flex-shrink:0"></div>
            <div style="font-size:11px;color:var(--text3);min-width:60px;font-weight:600;flex-shrink:0">${H.esc(rm.codigo || '#'+rm.id)}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${H.esc(rm.descricao || '—')}</div>
              <div style="font-size:10px;color:var(--text3);margin-top:2px">
                👤 ${H.esc(rm.criado_por_nome || rm.criado_por || '—')} · 📅 ${fmtDate(rm.criado_em)}${rm.data_necessidade ? ` · ⏰ Até ${fmtDate(rm.data_necessidade)}` : ''}${nItens > 0 ? ` · ${nItens} item(ns)` : ''}
              </div>
            </div>
            ${origemBadge}
            ${uauBadge}
            <span style="background:${st.bg};color:${st.color};font-size:10px;border-radius:8px;padding:3px 8px;font-weight:600;white-space:nowrap;flex-shrink:0">${st.label}</span>
            <button onclick="Requisicoes.abrirDetalhe(${rm.id})"
              style="padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text2);font-size:11px;cursor:pointer;white-space:nowrap;flex-shrink:0">
              Ver
            </button>
          </div>`;
      }

      html += `</div>`;

      // Ver mais / recolher
      if (hasMore) {
        if (!isExpanded) {
          const restante = items.length - MAX_VISIBLE;
          html += `<div onclick="Requisicoes.toggleObra(${JSON.stringify(obraKey)})"
            style="padding:8px 16px;font-size:11px;color:var(--text3);text-align:center;cursor:pointer;border-top:1px solid var(--border)">
            ▼ Ver mais ${restante} requisição(ões) desta obra
          </div>`;
        } else {
          html += `<div onclick="Requisicoes.toggleObra(${JSON.stringify(obraKey)})"
            style="padding:8px 16px;font-size:11px;color:var(--text3);text-align:center;cursor:pointer;border-top:1px solid var(--border)">
            ▲ Recolher
          </div>`;
        }
      }

      html += `</div>`; // fecha obra-card
    }

    cont.innerHTML = html;
  },

  // ── Modal de detalhe (somente leitura) ───────────────────────
  async abrirDetalhe(rmId) {
    const titleEl = H.el('req-det-title');
    const bodyEl  = H.el('req-det-body');
    if (!titleEl || !bodyEl) return;

    titleEl.textContent = '⏳ Carregando...';
    bodyEl.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3)">⏳ Carregando...</div>';
    UI.openModal('modal-req-det');

    try {
      const r  = await fetch(`/api/canteiro/req-materiais/${rmId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('construtivo_token')}` },
      });
      const rm = await r.json();

      const itens  = this._parseItens(rm.itens);
      const hist   = rm.historico || [];
      const anexos = rm.anexos    || [];
      const st     = this._status(rm.status);

      const fmtDt   = d => d ? new Date(d).toLocaleString('pt-BR') : '—';
      const fmtDate = d => d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

      titleEl.textContent = `📋 ${rm.codigo || '#' + rm.id}`;

      const fileIcon = nome => {
        const ext = (nome || '').split('.').pop().toLowerCase();
        if (['jpg','jpeg','png','gif','webp'].includes(ext)) return '🖼';
        if (ext === 'pdf') return '📄';
        if (['doc','docx'].includes(ext)) return '📝';
        if (['xls','xlsx'].includes(ext)) return '📊';
        return '📎';
      };

      // Histórico timeline
      const histHtml = hist.length ? hist.map(h => {
        const hSt = this._st[h.status_para] || { dot: 'var(--text3)', color: 'var(--text3)', label: h.status_para };
        return `
          <div style="display:flex;gap:10px;margin-bottom:10px">
            <div style="display:flex;flex-direction:column;align-items:center">
              <div style="width:10px;height:10px;border-radius:50%;background:${hSt.dot || hSt.color};flex-shrink:0;margin-top:3px"></div>
              <div style="width:1px;flex:1;background:var(--border);margin-top:3px"></div>
            </div>
            <div style="flex:1;padding-bottom:6px">
              <div style="font-size:12px;font-weight:700;color:${hSt.color}">${hSt.label || h.status_para}</div>
              <div style="font-size:11px;color:var(--text2);margin-top:1px">👤 ${H.esc(h.usuario || '—')} · 🕐 ${fmtDt(h.criado_em)}</div>
              ${h.observacao ? `<div style="font-size:11px;color:var(--text3);margin-top:2px;font-style:italic">"${H.esc(h.observacao)}"</div>` : ''}
            </div>
          </div>`;
      }).join('') : '<div style="color:var(--text3);font-size:12px;font-style:italic">Sem histórico registrado.</div>';

      // Itens (somente leitura)
      const itensHtml = itens.length ? `
        <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
              <tr style="background:var(--surface2)">
                <th style="padding:7px 10px;text-align:left;font-weight:600;color:var(--text3);width:28px">#</th>
                <th style="padding:7px 10px;text-align:left;font-weight:600;color:var(--text3)">Material</th>
                <th style="padding:7px 10px;text-align:left;font-weight:600;color:var(--text3)">Cód. Insumo</th>
                <th style="padding:7px 10px;text-align:right;font-weight:600;color:var(--text3);width:50px">Qtd</th>
                <th style="padding:7px 10px;text-align:left;font-weight:600;color:var(--text3);width:50px">Unid.</th>
              </tr>
            </thead>
            <tbody>
              ${itens.map((it, i) => `
              <tr style="border-top:1px solid var(--border);background:${i % 2 === 0 ? 'var(--surface)' : 'var(--bg2)'}">
                <td style="padding:7px 10px;color:var(--text3)">${i + 1}</td>
                <td style="padding:7px 10px;color:var(--text)">
                  <div style="font-weight:600">${H.esc(it.descricao || it.nome || '—')}</div>
                  ${it.detalhes ? `<div style="font-size:10px;color:var(--text3);margin-top:2px">${H.esc(it.detalhes)}</div>` : ''}
                </td>
                <td style="padding:7px 10px;color:var(--accent);font-weight:600">${H.esc(it.codigo_insumo || it.nome_insumo || '—')}</td>
                <td style="padding:7px 10px;text-align:right;color:var(--text2)">${it.quantidade != null ? it.quantidade : '—'}</td>
                <td style="padding:7px 10px;color:var(--text3)">${H.esc(it.unidade || '')}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>` :
        '<div style="color:var(--text3);font-size:12px;font-style:italic">Nenhum item nesta requisição.</div>';

      // Anexos
      const anexosHtml = anexos.length ? anexos.map(a => {
        const url = a.url_view || a.caminho || null;
        return `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--border);border-radius:7px;margin-bottom:7px;background:var(--surface2)">
            <span style="font-size:20px;flex-shrink:0">${fileIcon(a.nome)}</span>
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:12px;color:var(--text);word-break:break-all">${H.esc(a.nome || 'arquivo')}</div>
              <div style="font-size:10px;color:var(--text3);margin-top:1px">${fmtDate(a.criado_em)}${a.enviado_por ? ' · ' + H.esc(a.enviado_por) : ''}</div>
            </div>
            ${url ? `<a href="${H.esc(url)}" target="_blank" rel="noopener"
              style="flex-shrink:0;padding:5px 12px;border-radius:6px;border:1px solid var(--accent);color:var(--accent);font-size:11px;font-weight:700;text-decoration:none;white-space:nowrap">
              ⬇ Abrir
            </a>` : `<span style="font-size:11px;color:var(--text3)">sem link</span>`}
          </div>`;
      }).join('') : '<div style="color:var(--text3);font-size:12px;font-style:italic">Nenhum anexo enviado.</div>';

      bodyEl.innerHTML = `
        <div style="padding:0 16px 16px">

          <!-- Grid de informações gerais -->
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px;margin-bottom:18px;padding:14px;border-radius:8px;background:var(--surface2);border:1px solid var(--border)">
            <div>
              <div style="font-size:10px;font-weight:700;color:var(--text3);margin-bottom:3px">STATUS</div>
              <span style="padding:3px 10px;border-radius:10px;font-size:11px;font-weight:700;background:${st.bg};color:${st.color}">${st.label}</span>
            </div>
            <div>
              <div style="font-size:10px;font-weight:700;color:var(--text3);margin-bottom:3px">OBRA</div>
              <div style="font-size:12px;color:var(--text)">${H.esc(rm.obra_nome || '—')}</div>
            </div>
            ${rm.empresa_nome ? `<div>
              <div style="font-size:10px;font-weight:700;color:var(--text3);margin-bottom:3px">EMPRESA</div>
              <div style="font-size:12px;color:var(--text)">${H.esc(rm.empresa_nome)}</div>
            </div>` : ''}
            ${rm.fornecedor_nome ? `<div>
              <div style="font-size:10px;font-weight:700;color:var(--text3);margin-bottom:3px">FORNECEDOR</div>
              <div style="font-size:12px;color:var(--text)">${H.esc(rm.fornecedor_nome)}</div>
            </div>` : ''}
            ${rm.contrato_numero ? `<div>
              <div style="font-size:10px;font-weight:700;color:var(--text3);margin-bottom:3px">CONTRATO</div>
              <div style="font-size:12px;color:var(--text)">${H.esc(rm.contrato_numero)}${rm.contrato_descricao ? ' — ' + H.esc(rm.contrato_descricao) : ''}</div>
            </div>` : ''}
            <div>
              <div style="font-size:10px;font-weight:700;color:var(--text3);margin-bottom:3px">SOLICITADO POR</div>
              <div style="font-size:12px;color:var(--text)">${H.esc(rm.criado_por_nome || rm.criado_por || '—')}</div>
              <div style="font-size:10px;color:var(--text3)">${fmtDt(rm.criado_em)}</div>
            </div>
            ${rm.atividade_wbs || rm.wbs ? `<div>
              <div style="font-size:10px;font-weight:700;color:var(--text3);margin-bottom:3px">WBS</div>
              <div style="font-size:12px;color:var(--accent);font-weight:600">${H.esc(rm.atividade_wbs || rm.wbs)}</div>
              ${rm.atividade_nome ? `<div style="font-size:10px;color:var(--text3)">${H.esc(rm.atividade_nome)}</div>` : ''}
            </div>` : ''}
            ${rm.data_necessidade ? `<div>
              <div style="font-size:10px;font-weight:700;color:var(--text3);margin-bottom:3px">DATA NECESSÁRIA</div>
              <div style="font-size:12px;font-weight:600;color:var(--text)">${fmtDate(rm.data_necessidade)}</div>
            </div>` : ''}
            ${rm.uau_pedido_numero ? `<div>
              <div style="font-size:10px;font-weight:700;color:#0369a1;margin-bottom:3px">PEDIDO UAU (ERP)</div>
              <div style="font-size:16px;color:#0c4a6e;font-weight:800">🔗 Nº ${H.esc(rm.uau_pedido_numero)}</div>
              <div style="font-size:10px;color:#0369a1;margin-top:2px">Rastreie no ERP UAU</div>
            </div>` : ''}
            ${rm.observacao ? `<div style="grid-column:1/-1">
              <div style="font-size:10px;font-weight:700;color:var(--text3);margin-bottom:3px">OBSERVAÇÃO</div>
              <div style="font-size:12px;color:var(--text2)">${H.esc(rm.observacao)}</div>
            </div>` : ''}
          </div>

          <!-- Materiais -->
          <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:8px;padding-bottom:5px;border-bottom:1px solid var(--border)">
            📦 Materiais Solicitados
          </div>
          ${itensHtml}

          <!-- Anexos -->
          <div style="font-size:12px;font-weight:700;color:var(--text);margin:18px 0 8px;padding-bottom:5px;border-bottom:1px solid var(--border)">
            📎 Anexos (${anexos.length})
          </div>
          ${anexosHtml}

          <!-- Histórico -->
          <div style="font-size:12px;font-weight:700;color:var(--text);margin:18px 0 8px;padding-bottom:5px;border-bottom:1px solid var(--border)">
            🕐 Histórico de Status
          </div>
          ${histHtml}

        </div>`;

    } catch (e) {
      bodyEl.innerHTML = `<div style="padding:30px;text-align:center;color:var(--red)">❌ Erro: ${H.esc(e.message)}</div>`;
    }
  },

  // ── Helpers ───────────────────────────────────────────────────
  _parseItens(itens) {
    if (!itens) return [];
    if (Array.isArray(itens)) return itens;
    try { return JSON.parse(itens); } catch { return []; }
  },
};
