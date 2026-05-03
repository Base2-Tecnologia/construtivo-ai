/**
 * CONSTRUTIVO — Coloridão & Controle de Obra
 * Heatmap de cobertura de contratos sobre os grupos do cronograma.
 *
 * Cor por célula (grupo × obra):
 *   🟢 Verde   — todos os itens têm contrato associado
 *   🟡 Amarelo — há itens sem contrato, mas data_inicio > 20 dias
 *   🔴 Vermelho — há itens sem contrato com data_inicio ≤ 20 dias (ou passada)
 *   ⬜ Cinza   — grupo sem tarefas na obra
 */

const Coloridao = {
  _data: null,
  _nivel: 0,
  _somenteCriticos: false,
  _somenteSemContrato: false,

  // ── Inicializa a página ──────────────────────────────────────
  async init() {
    await this._populaEmpresas();
    await this.load();
  },

  async _populaEmpresas() {
    try {
      const emps = await API.empresas();
      const sel = H.el('col-f-empresa');
      if (!sel) return;
      sel.innerHTML = '<option value="">Todas as empresas</option>' +
        emps.map(e => `<option value="${e.id}">${e.nome_fantasia || e.razao_social}</option>`).join('');
    } catch (_) {}
  },

  // ── Carrega dados e renderiza ────────────────────────────────
  setNivel(n) {
    this._nivel = parseInt(n);
    // Atualiza visual dos botões
    [0,1,2,3].forEach(i => {
      const btn = H.el(`col-gran-${i}`);
      if (btn) btn.className = `col-gran-btn${i === this._nivel ? ' col-gran-active' : ''}`;
    });
    this.load();
  },

  async load() {
    const empId = H.el('col-f-empresa')?.value || '';
    this._somenteCriticos     = H.el('col-f-criticos')?.checked || false;
    this._somenteSemContrato  = H.el('col-f-sem-contrato')?.checked || false;

    H.el('col-loading')?.style && (H.el('col-loading').style.display = 'flex');
    H.el('col-content')  && (H.el('col-content').style.display = 'none');

    try {
      const params = { nivel: this._nivel };
      if (empId) params.empresa_id = empId;
      const data = await API.coloridao(params);
      this._data = data;
      this._render(data);
    } catch (e) {
      UI.toast('Erro ao carregar Coloridão: ' + e.message, 'error');
    } finally {
      H.el('col-loading')?.style && (H.el('col-loading').style.display = 'none');
      H.el('col-content')  && (H.el('col-content').style.display = '');
    }
  },

  _renderNiveisButtons(niveis, atual) {
    const wrap = H.el('col-niveis-wrap');
    if (!wrap || !niveis?.length) return;
    const labels = { 0: 'Macro', 1: 'Nível 2', 2: 'Nível 3', 3: 'Nível 4', 4: 'Nível 5' };
    wrap.innerHTML = niveis.map(n => `
      <button onclick="Coloridao.setNivel(${n})"
        style="padding:4px 12px;border-radius:6px;border:1px solid ${n===atual?'var(--accent)':'var(--border)'};
               background:${n===atual?'rgba(var(--accent-rgb),.12)':'var(--bg2)'};
               color:${n===atual?'var(--accent)':'var(--text2)'};cursor:pointer;font-size:11px;font-weight:600;
               transition:all .15s">
        ${labels[n] || `Nível ${n+1}`}
      </button>`).join('');
  },

  // ── Renderiza KPIs + heatmap ─────────────────────────────────
  _render(data) {
    this._renderKpis(data.kpis);
    this._renderHeatmap(data);
  },

  _renderKpis(kpis) {
    const pct = (n) => kpis.total ? Math.round(n / kpis.total * 100) : 0;
    H.el('col-kpis').innerHTML = `
      <div class="col-kpi" style="border-left:4px solid var(--green)">
        <div class="col-kpi-val" style="color:var(--green)">${kpis.verde}</div>
        <div class="col-kpi-lbl">🟢 Contratado</div>
        <div class="col-kpi-pct">${pct(kpis.verde)}% dos grupos</div>
      </div>
      <div class="col-kpi" style="border-left:4px solid #eab308">
        <div class="col-kpi-val" style="color:#ca8a04">${kpis.amarelo}</div>
        <div class="col-kpi-lbl">🟡 Pendente &gt;20 dias</div>
        <div class="col-kpi-pct">${pct(kpis.amarelo)}% dos grupos</div>
      </div>
      <div class="col-kpi" style="border-left:4px solid var(--red)">
        <div class="col-kpi-val" style="color:var(--red)">${kpis.vermelho}</div>
        <div class="col-kpi-lbl">🔴 Crítico ≤20 dias</div>
        <div class="col-kpi-pct">${pct(kpis.vermelho)}% dos grupos</div>
      </div>
      <div class="col-kpi" style="border-left:4px solid var(--border)">
        <div class="col-kpi-val" style="color:var(--text2)">${kpis.total}</div>
        <div class="col-kpi-lbl">📦 Total de células</div>
        <div class="col-kpi-pct">${this._data?.obras?.length || 0} obras · ${this._data?.grupos?.length || 0} grupos</div>
      </div>`;
  },

  _renderHeatmap(data) {
    const { obras, grupos, matriz } = data;
    const container = H.el('col-heatmap');
    if (!container) return;

    if (!obras.length || !grupos.length) {
      container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text3)">Nenhum cronograma encontrado com os filtros aplicados.</div>`;
      return;
    }

    // Filtra grupos conforme opções
    let gruposFiltrados = grupos;
    let obrasFiltradas  = obras;

    if (this._somenteCriticos) {
      // Mostra só grupos que têm pelo menos uma obra vermelha
      gruposFiltrados = grupos.filter(g =>
        obras.some(o => (matriz[o.id]?.[g]?.status === 'vermelho'))
      );
    }
    if (this._somenteSemContrato) {
      gruposFiltrados = gruposFiltrados.filter(g =>
        obras.some(o => ['vermelho','amarelo'].includes(matriz[o.id]?.[g]?.status))
      );
    }

    if (!gruposFiltrados.length) {
      container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text3)">Nenhum grupo crítico encontrado — todos contratados! 🎉</div>`;
      return;
    }

    // ── Monta a grade ─────────────────────────────────────────
    const statusCss = {
      verde:      { bg: 'rgba(34,197,94,.18)', border: 'rgba(34,197,94,.5)', icon: '🟢' },
      amarelo:    { bg: 'rgba(234,179,8,.18)',  border: 'rgba(234,179,8,.6)', icon: '🟡' },
      vermelho:   { bg: 'rgba(239,68,68,.18)',  border: 'rgba(239,68,68,.5)', icon: '🔴' },
      sem_tarefas:{ bg: 'var(--bg2)',           border: 'var(--border)',      icon: '—'  },
    };

    const CELL_W = 48; // px por célula de obra
    const ROW_H  = 36;

    // Agrupa obras por empresa para o header
    const empresas = [...new Map(obrasFiltradas.map(o => [o.empresa_id, { id: o.empresa_id, nome: o.empresa_nome }])).values()];

    let html = `<div class="col-heatmap-wrap">`;

    // ── Legenda ─────────────────────────────────────────────
    html += `<div class="col-legend">
      <span style="background:rgba(34,197,94,.2);border:1px solid rgba(34,197,94,.5)">🟢 Contratado</span>
      <span style="background:rgba(234,179,8,.18);border:1px solid rgba(234,179,8,.6)">🟡 Pendente &gt;20 dias</span>
      <span style="background:rgba(239,68,68,.18);border:1px solid rgba(239,68,68,.5)">🔴 Crítico ≤20 dias</span>
      <span style="background:var(--bg2);border:1px solid var(--border)">— Sem tarefas</span>
    </div>`;

    // ── Tabela ───────────────────────────────────────────────
    html += `<div class="col-table-scroll"><table class="col-table">`;

    // Linha de empresa (colspan)
    html += `<thead><tr><th class="col-th-grupo" rowspan="2">Agrupamento / Fase</th>`;
    for (const emp of empresas) {
      const obrasEmp = obrasFiltradas.filter(o => o.empresa_id === emp.id);
      html += `<th colspan="${obrasEmp.length}" style="background:var(--bg2);font-size:10px;text-align:center;letter-spacing:.5px;color:var(--text3);border-bottom:1px solid var(--border);padding:4px 2px">${emp.nome.toUpperCase()}</th>`;
    }
    html += `</tr><tr>`;

    // Linha de obras (nomes verticais)
    for (const obra of obrasFiltradas) {
      html += `<th class="col-th-obra" title="${obra.nome}">${obra.nome}</th>`;
    }
    html += `</tr></thead><tbody>`;

    // Linhas de grupos
    for (const grupo of gruposFiltrados) {
      // Barra lateral colorida pela pior situação na linha
      const statusLinha = obrasFiltradas.reduce((pior, o) => {
        const st = matriz[o.id]?.[grupo]?.status || 'sem_tarefas';
        const rank = { vermelho: 3, amarelo: 2, verde: 1, sem_tarefas: 0 };
        return (rank[st] || 0) > (rank[pior] || 0) ? st : pior;
      }, 'sem_tarefas');
      const corLinha = { vermelho: 'var(--red)', amarelo: '#eab308', verde: 'var(--green)', sem_tarefas: 'var(--border)' }[statusLinha];

      html += `<tr>`;
      html += `<td class="col-td-grupo"><span class="col-grupo-bar" style="background:${corLinha}"></span>${grupo}</td>`;

      for (const obra of obrasFiltradas) {
        const cel = matriz[obra.id]?.[grupo];
        if (!cel) {
          html += `<td class="col-cell" style="background:var(--bg);color:var(--border)">·</td>`;
          continue;
        }
        const s = statusCss[cel.status] || statusCss.sem_tarefas;
        const tip = cel.status === 'sem_tarefas'
          ? 'Sem tarefas neste grupo'
          : `${cel.com_contrato}/${cel.total} tarefas contratadas\n${cel.vermelho} críticas · ${cel.amarelo} pendentes`;
        html += `<td class="col-cell" style="background:${s.bg};border-color:${s.border}"
                    title="${obra.nome} — ${grupo}\n${tip}"
                    onclick="Coloridao._showDetail('${obra.id}','${grupo.replace(/'/g,"\\'")}')">
                  ${s.icon}
                  ${cel.status !== 'sem_tarefas' ? `<span class="col-cell-sub">${cel.com_contrato}/${cel.total}</span>` : ''}
                </td>`;
      }
      html += `</tr>`;
    }

    html += `</tbody></table></div></div>`;
    container.innerHTML = html;
  },

  // ── Detalhe: abre modal com atividades do grupo/obra ────────
  async _showDetail(obraId, grupoNome) {
    const obra = this._data?.obras?.find(o => String(o.id) === String(obraId));
    if (!obra) return;

    const cel = this._data?.matriz?.[obraId]?.[grupoNome];
    if (!cel) return;

    try {
      // Busca atividades do cronograma desta obra
      const crons = await API.cronogramas(parseInt(obraId));
      if (!crons?.length) { UI.toast('Nenhum cronograma para esta obra', 'error'); return; }

      const cronId = obra.cronograma_id || crons[0].id;
      const ativs  = await API.cronogramaAtividades(cronId);

      // Encontra o grupo e seus descendentes
      const grupoNode = ativs.find(a => a.nome === grupoNome && a.eh_resumo && !a.parent_id);
      if (!grupoNode) { UI.toast('Grupo não encontrado no cronograma', 'error'); return; }

      const descendentes = this._getDescendentes(ativs, grupoNode.id).filter(a => !a.eh_resumo);

      const statusCss = {
        verde:    { cor: 'var(--green)',  txt: 'Contratado'    },
        amarelo:  { cor: '#eab308',       txt: 'Pendente'      },
        vermelho: { cor: 'var(--red)',    txt: 'Crítico'       },
      };

      const rows = descendentes.map(a => {
        const temContrato = (a.contratos_vinculados?.length || 0) > 0;
        const diasInicio  = a.data_inicio ? Math.ceil((new Date(a.data_inicio) - new Date()) / 86400000) : null;
        let st = 'verde';
        if (!temContrato) st = (diasInicio !== null && diasInicio <= 20) ? 'vermelho' : 'amarelo';
        const s = statusCss[st];
        const fmtDate = d => d ? new Date(d + 'T00:00').toLocaleDateString('pt-BR') : '—';
        return `<tr>
          <td style="padding:6px 10px;font-size:12px;max-width:240px;word-break:break-word">${a.nome}</td>
          <td style="padding:6px 10px;font-size:11px;color:var(--text2)">${fmtDate(a.data_inicio)}</td>
          <td style="padding:6px 10px;font-size:11px;color:var(--text2)">${fmtDate(a.data_termino)}</td>
          <td style="padding:6px 10px;text-align:center">
            <span style="background:${s.cor}22;color:${s.cor};border:1px solid ${s.cor}55;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600">${s.txt}</span>
          </td>
          <td style="padding:6px 10px;font-size:11px;color:var(--text3)">
            ${temContrato ? (a.contratos_vinculados?.map(c=>`<div>${c.numero} — ${c.fornecedor}</div>`).join('')) : '<span style="color:var(--text3)">—</span>'}
          </td>
        </tr>`;
      }).join('');

      H.el('col-det-title').textContent = `${grupoNome} · ${obra.nome}`;
      H.el('col-det-body').innerHTML = `
        <div style="display:flex;gap:12px;margin-bottom:14px;flex-wrap:wrap">
          <div class="col-kpi" style="flex:1;min-width:120px;border-left:3px solid var(--green)"><div class="col-kpi-val" style="color:var(--green)">${cel.com_contrato}</div><div class="col-kpi-lbl">Contratados</div></div>
          <div class="col-kpi" style="flex:1;min-width:120px;border-left:3px solid #eab308"><div class="col-kpi-val" style="color:#ca8a04">${cel.amarelo}</div><div class="col-kpi-lbl">Pendentes</div></div>
          <div class="col-kpi" style="flex:1;min-width:120px;border-left:3px solid var(--red)"><div class="col-kpi-val" style="color:var(--red)">${cel.vermelho}</div><div class="col-kpi-lbl">Críticos</div></div>
        </div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
              <tr style="border-bottom:2px solid var(--border)">
                <th style="padding:6px 10px;text-align:left;font-size:10px;color:var(--text3);letter-spacing:.5px">ATIVIDADE</th>
                <th style="padding:6px 10px;text-align:left;font-size:10px;color:var(--text3);letter-spacing:.5px">INÍCIO</th>
                <th style="padding:6px 10px;text-align:left;font-size:10px;color:var(--text3);letter-spacing:.5px">TÉRMINO</th>
                <th style="padding:6px 10px;text-align:center;font-size:10px;color:var(--text3);letter-spacing:.5px">STATUS</th>
                <th style="padding:6px 10px;text-align:left;font-size:10px;color:var(--text3);letter-spacing:.5px">CONTRATO / FORNECEDOR</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
      UI.openModal('modal-coloridao-det');
    } catch (e) {
      UI.toast('Erro ao carregar detalhe: ' + e.message, 'error');
    }
  },

  _getDescendentes(ativs, parentId) {
    const filhos = ativs.filter(a => a.parent_id === parentId);
    return filhos.flatMap(f => [f, ...this._getDescendentes(ativs, f.id)]);
  },
};
