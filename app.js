// --- CONFIGURAÇÃO DE AMBIENTE ---
const AMBIENTE = 'prod'; // Mudar para 'prod' ao publicar

const API_URL = AMBIENTE === 'dev'
    ? 'http://192.168.0.162:8000/otimizar'
    : 'https://trilhaepr-api.onrender.com/otimizar';
// --------------------------------

const META_TOTAL = 3600;
const LIMITE_HORAS_UNB = 420;
let semestreAtual = 1;
let concluidas = new Set();
let planejadas = new Set();
let sugeridasPelaIA = new Map();
let turmasSelecionadas = new Map();
let modoSimulacao = false;
const mapaCoReqBidi = new Map();
const mapaIdsParaCodigos = {};
const mapaCodigosParaIds = {};
const mapaCodigosParaNomes = {}; // Dicionário para traduzir códigos em nomes

// Mapeamento Forçado para as Cadeias Seletivas (Ponte Manual)
const mapeamentoSeletivas = {
    "desenhomec1": "ENM0131",
    "desenhomec2": "ENM0190",
    "algebralin1": "MAT0127",
    "algebralin2": "MAT0031",
    "comp1": "ENE0334",
    "comp2": "CIC0007",
    "mecsol1": "ENC0035",
    "mecsol2": "ENC0132"
};
Object.assign(mapaIdsParaCodigos, mapeamentoSeletivas);

const iconesAreas = {
    "exatas": `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="9" x2="9" y1="4" y2="20"/><path d="M4 7c0-1.7 1.3-3 3-3h13"/><path d="M18 20c-1.7 0-3-1.3-3-3V4"/></svg>`,
    "prodbas": `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/></svg>`,
    "prodesp": `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M7 16c.5-2 1.5-7 4-7 2 0 2 3 4 3 2.5 0 4.5-5 5-7"/></svg>`,
    "humanas": `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`,
    "projetos": `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20h20"/><path d="m9 10 2 2 4-4"/><rect x="3" y="4" width="18" height="12" rx="2"/></svg>`,
    "seletiva-chave": `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`
};

const CADEIA_1 = ["desenhomec1", "desenhomec2"];
const CADEIA_2 = ["algebralin1", "algebralin2"];
const CADEIA_3 = ["comp1", "comp2"];
const CADEIA_4 = ["mecsol1", "mecsol2"];

// Adiciona os nomes das seletivas ao mapa
mapaCodigosParaNomes["ENM0131"] = "DESENHO MEC I";
mapaCodigosParaNomes["ENM0190"] = "DESENHO MEC II";
mapaCodigosParaNomes["MAT0127"] = "ÁLGEBRA LINEAR";
mapaCodigosParaNomes["MAT0031"] = "INTROD. ÁLGEBRA LINEAR";
mapaCodigosParaNomes["ENE0334"] = "COMP. E PROGR. I";
mapaCodigosParaNomes["CIC0007"] = "PROGRAMAÇÃO SISTEMÁTICA";
mapaCodigosParaNomes["ENC0035"] = "MEC. DOS SÓLIDOS I";
mapaCodigosParaNomes["ENC0132"] = "MEC. DOS SÓLIDOS II";

let disciplinas = [];

// ==========================================
// FUNÇÃO DE CORREÇÃO DE ÁREAS PARA OPTATIVAS
// ==========================================
// A correção manual (hardcoded) de áreas via código/prefixo foi removida
// As áreas passarão a vir exclusivamente do arquivo CSV

// ==========================================
// CARREGAMENTO DE DADOS (CSV) E PAPAPARSE
// ==========================================
async function carregarDadosExternos() {
    return new Promise((resolve, reject) => {
        fetch('disciplinas.csv')
            .then(response => response.text())
            .then(csvText => {
                Papa.parse(csvText, {
                    header: true,
                    skipEmptyLines: true,
                    complete: function (results) {
                        disciplinas = results.data.map(row => {
                            let reqRaw = row.requisitos ? row.requisitos.split(',').filter(Boolean) : [];
                            let coreqRaw = row.corequisitos ? row.corequisitos.split(',').filter(Boolean) : [];

                            reqRaw = reqRaw.map(r => {
                                let clean = r.trim();
                                if (clean === 'CADEIA_1') return CADEIA_1;
                                if (clean === 'CADEIA_2') return CADEIA_2;
                                if (clean === 'CADEIA_3') return CADEIA_3;
                                if (clean === 'CADEIA_4') return CADEIA_4;
                                return clean;
                            });

                            coreqRaw = coreqRaw.map(r => {
                                let clean = r.trim();
                                if (clean === 'CADEIA_1') return CADEIA_1;
                                if (clean === 'CADEIA_2') return CADEIA_2;
                                if (clean === 'CADEIA_3') return CADEIA_3;
                                if (clean === 'CADEIA_4') return CADEIA_4;
                                return clean;
                            });

                            let areaCorrigida = row.area.trim();

                            return {
                                id: row.id.trim(),
                                codigo: row.codigo.trim(),
                                nome: row.nome.trim(),
                                sem: parseInt(row.semestre) || 98,
                                horas: parseInt(row.horas) || 60,
                                reqOficial: reqRaw,
                                coreqOficial: coreqRaw,
                                req: [],
                                coreq: [],
                                area: areaCorrigida,
                                Tipo: row.tipo ? row.tipo.trim() : 'OPT',
                                horario: row.horario ? row.horario.trim() : 'Não Ofertada'
                            };
                        });

                        disciplinas.forEach(disc => {
                            mapaIdsParaCodigos[disc.id] = disc.codigo;
                            if (disc.codigo) {
                                mapaCodigosParaIds[disc.codigo] = disc.id;
                                mapaCodigosParaNomes[disc.codigo] = disc.nome; // Alimenta o mapa de tradução
                            }
                        });

                        function traduzParaId(entry) {
                            if (Array.isArray(entry)) {
                                return entry.map(item => mapaCodigosParaIds[item] || item);
                            }
                            return mapaCodigosParaIds[entry] || entry;
                        }

                        disciplinas.forEach(disc => {
                            disc.req = disc.reqOficial.map(traduzParaId);
                            disc.coreq = disc.coreqOficial.map(traduzParaId);
                        });

                        resolve();
                    },
                    error: function (err) {
                        console.error('Erro ao processar o CSV:', err);
                        reject(err);
                    }
                });
            })
            .catch(err => {
                console.error("Erro no fetch do CSV:", err);
                reject(err);
            });
    });
}

// ==========================================
// ZONA: STEPPERS DO MÓDULO LIVRE (V17)
// ==========================================

// Contadores de instâncias de cada tipo de Módulo Livre
const mlContadores = { 30: 0, 45: 0, 60: 0, 90: 0 };

// Persiste os contadores no localStorage
function salvarML() {
    localStorage.setItem('modulolivre_EPR_V1', JSON.stringify(mlContadores));
}

// Restaura os contadores do localStorage
function carregarML() {
    const salvo = localStorage.getItem('modulolivre_EPR_V1');
    if (!salvo) return;
    try {
        const obj = JSON.parse(salvo);
        // Migração de chaves antigas (ml30 -> 30) se necessário
        Object.keys(obj).forEach(k => {
            const h = k.replace('ml', '');
            if (mlContadores.hasOwnProperty(h) && typeof obj[k] === 'number') {
                mlContadores[h] = obj[k];
            } else if (mlContadores.hasOwnProperty(k) && typeof obj[k] === 'number') {
                mlContadores[k] = obj[k];
            }
        });
    } catch (e) { /* silencioso */ }
}

// Calcula o total de horas de Módulo Livre (teto: 360h — limite do SIGAA/UnB)
const ML_TETO = 360;
function calcularTotalML() {
    const bruto = Object.keys(mlContadores).reduce((sum, h) => sum + mlContadores[h] * parseInt(h), 0);
    return Math.min(bruto, ML_TETO);
}

// Handler chamado pelos botões + e -
function alterarML(horas, incremento) {
    const novo = (mlContadores[horas] || 0) + incremento;
    if (novo < 0) return;              // Nunca abaixo de zero
    mlContadores[horas] = novo;
    salvarML();
    atualizarSteppers();               // Redesenha os visores
    atualizarInterface();              // Recalcula % do curso
}

// Atualiza apenas os elementos DOM dos steppers (leve — sem recriar nada)
function atualizarSteppers() {
    let brutoH = 0;
    Object.keys(mlContadores).forEach(h => {
        const count = mlContadores[h];
        const hNum = parseInt(h);
        const sub = count * hNum;
        brutoH += sub;

        const elVal = document.getElementById('count-ml-' + h);
        const elSub = document.getElementById('sub-ml' + h);
        if (elVal) {
            elVal.textContent = count;
            elVal.className = 'stepper-valor' + (count > 0 ? ' ativo' : '');
        }
        if (elSub) {
            elSub.textContent = count > 0 ? sub + 'h' : '';
            elSub.className = 'stepper-subtotal' + (count > 0 ? ' ativo' : '');
        }
    });

    const efetivo = Math.min(brutoH, ML_TETO);
    const tetoBatido = brutoH > ML_TETO;

    const badge = document.getElementById('ml-total-display');
    if (badge) {
        if (efetivo > 0) {
            badge.textContent = tetoBatido ? `${efetivo}h ✓ (teto atingido)` : `${efetivo}h`;
            badge.style.display = 'inline-flex';
            badge.style.color = tetoBatido ? '#ffb74d' : '#9c8fef';
            badge.style.borderColor = tetoBatido ? 'rgba(255,183,77,0.4)' : 'rgba(156,143,239,0.3)';
            badge.style.background = tetoBatido ? 'rgba(255,183,77,0.1)' : 'rgba(156,143,239,0.12)';
        } else {
            badge.style.display = 'none';
        }
    }
}

// ==========================================
// ZONA 3.6: ESPELHO BIDIRECIONAL DE CO-REQUISITOS
// ==========================================
function construirMapaCoReq() {
    disciplinas.forEach(m => {
        if (m.coreq.length === 0) return;
        if (!mapaCoReqBidi.has(m.id)) mapaCoReqBidi.set(m.id, new Set());
        m.coreq.forEach(coreqId => {
            mapaCoReqBidi.get(m.id).add(coreqId);
            if (!mapaCoReqBidi.has(coreqId)) mapaCoReqBidi.set(coreqId, new Set());
            mapaCoReqBidi.get(coreqId).add(m.id);
        });
    });
}

function salvarDados() {
    localStorage.setItem('progresso_EPR_V9', JSON.stringify([...concluidas]));
    localStorage.setItem('semestre_EPR_V9', semestreAtual.toString());
}

// ==========================================
// ZONA 5: JAVASCRIPT - UI E RENDERIZAÇÃO
// ==========================================
let tooltipTimer;

function construirInterface() {
    const fluxo = document.getElementById('fluxograma-container');
    const carrossel = document.getElementById('carrossel-optativas');
    const seletivasContainer = document.getElementById('seletivas-grid');

    // 1. DESENHA OS SEMESTRES DINAMICAMENTE
    if (fluxo) {
        fluxo.innerHTML = '';
        const semestresObrigatorios = disciplinas.map(d => d.sem).filter(s => s < 90);
        const maxSemestre = semestresObrigatorios.length > 0 ? Math.max(...semestresObrigatorios) : 10;

        for (let i = 1; i <= maxSemestre; i++) {
            const col = document.createElement('div');
            col.className = 'semestre'; // Mantido 'semestre' conforme CSS original
            col.id = `semestre-${i}`;
            col.innerHTML = `<div class="semestre-titulo">${i}º Período</div>`;

            const grid = document.createElement('div');
            grid.className = 'grid-cards';
            grid.id = `grid-semestre-${i}`;

            disciplinas.filter(d => d.sem === i).forEach(m => grid.appendChild(criarCard(m)));

            // 2. A CORREÇÃO: Ancoragem no DOM
            col.appendChild(grid);

            if (i === maxSemestre) {
                const divisor = document.createElement('div');
                divisor.style.marginTop = '25px'; divisor.style.paddingTop = '10px'; divisor.style.borderTop = '2px dashed var(--cor-borda-semestre)';
                divisor.innerHTML = `<div style="font-weight: bold; font-size: 0.85rem; color: #5c88c2; text-align: center; margin-bottom: 10px; text-transform: uppercase;">Marcos Finais</div>`;

                const gridMarcos = document.createElement('div');
                gridMarcos.className = 'grid-cards';
                gridMarcos.id = 'grid-marcos-finais';
                disciplinas.filter(d => d.sem === 99).forEach(m => gridMarcos.appendChild(criarCard(m)));

                divisor.appendChild(gridMarcos);
                col.appendChild(divisor);
            }
            fluxo.appendChild(col);
        }
    }

    // 2. DESENHA AS CADEIAS SELETIVAS
    if (seletivasContainer) {
        seletivasContainer.innerHTML = '';
        const matrizCadeias = [
            { titulo: "CADEIA 1 (Desenho)", ids: CADEIA_1 },
            { titulo: "CADEIA 2 (Álgebra)", ids: CADEIA_2 },
            { titulo: "CADEIA 3 (Computação)", ids: CADEIA_3 },
            { titulo: "CADEIA 4 (Mec. sólidos)", ids: CADEIA_4 }
        ];

        matrizCadeias.forEach(cadeia => {
            const bloco = document.createElement('div');
            bloco.className = 'bloco-cadeia';
            bloco.innerHTML = `<div class="titulo-cadeia">${cadeia.titulo}</div>`;

            const mat1 = disciplinas.find(d => d.id === cadeia.ids[0]);
            const mat2 = disciplinas.find(d => d.id === cadeia.ids[1]);

            if (mat1 && mat2) {
                const card1 = criarCard(mat1); card1.classList.add('card-seletiva');
                const separador = document.createElement('div');
                separador.className = 'separador-ou'; separador.innerText = 'OU';
                const card2 = criarCard(mat2); card2.classList.add('card-seletiva');

                bloco.appendChild(card1);
                bloco.appendChild(separador);
                bloco.appendChild(card2);
                seletivasContainer.appendChild(bloco);
            }
        });
    }

    // 3. DESENHA AS OPTATIVAS NO CARROSSEL
    if (carrossel) {
        disciplinas.filter(d => d.sem === 98).forEach(m => {
            const card = document.createElement('div');
            card.id = m.id;
            card.className = `optativa-card card-vitrine ${m.area}`;
            card.setAttribute('data-area', m.area);
            card.setAttribute('data-trilha', m.area);
            const bloqueado = !cumpreRequisitos(m);
            if (bloqueado) {
                card.classList.add('disciplina-bloqueada');
                card.setAttribute('title', 'Pré-requisitos não cumpridos');
                card.style.cursor = 'not-allowed';
            }
            card.innerHTML = `<div class="card-icone-watermark">${iconesAreas[m.area] || ''}</div><div style="display:flex; flex-direction:column;"><span class="card-codigo">${m.codigo}</span><span class="card-nome">${m.nome}</span></div><span style="font-size:0.75rem; background:rgba(255,255,255,0.1); padding:4px; border-radius:4px; width:fit-content; margin-top:8px;">${m.horas}h</span>`;
            card.onclick = () => { toggleCard(m.id); };
            card.addEventListener('mouseenter', () => {
                iluminarDominó(m.id);
                clearTimeout(tooltipTimer);
                tooltipTimer = setTimeout(() => {
                    let msg = card.getAttribute('data-tooltip') || m.nome;
                    mostrarTooltipHTML(`<div>${msg.replace(/\\n/g, '<br>')}</div>`);
                }, 1100);
            });
            card.addEventListener('mouseleave', () => {
                clearTimeout(tooltipTimer);
                apagarDominó();
                esconderTooltipHTML();
            });
            carrossel.appendChild(card);
        });
    }
}

function criarCard(m) {
    const c = document.createElement('div');
    c.id = m.id; c.className = `card ${m.area}`;
    c.setAttribute('data-trilha', m.area);
    c.innerHTML = `
                <span class="card-codigo">${m.codigo}</span>
                <span class="card-nome">${m.nome}</span>
                <span class="ch-badge">${m.horas}h</span>
                <div class="card-icone-watermark">${iconesAreas[m.area] || ''}</div>
            `;
    c.onclick = () => toggleCard(m.id);
    c.addEventListener('mouseenter', () => {
        iluminarDominó(m.id);
        clearTimeout(tooltipTimer);
        tooltipTimer = setTimeout(() => {
            let msg = c.getAttribute('data-tooltip') || m.nome;
            let html = `<div>${msg.replace(/\\n/g, '<br>')}</div>`;
            if (m.coreq && m.coreq.length > 0) {
                const nomes = m.coreq.map(req => {
                    const resolveName = (id) => {
                        const d = disciplinas.find(d => d.id === id);
                        return d ? `${d.nome} (${d.codigo})` : id;
                    };
                    if (Array.isArray(req)) return req.map(resolveName).join(' ou ');
                    return resolveName(req);
                }).join(', ');
                html += `<span class="coreq-alert">⚠️ Co-requisito: ${nomes}</span>`;
            }
            mostrarTooltipHTML(html);
        }, 1100);
    });
    c.addEventListener('mouseleave', () => {
        clearTimeout(tooltipTimer);
        apagarDominó();
        esconderTooltipHTML();
    });
    return c;
}

function obterHistoricoOficial(incluirPlanejadas = true) {
    const historico = new Set();
    const fontes = incluirPlanejadas ? [...concluidas, ...planejadas] : [...concluidas];
    fontes.forEach(id => {
        let codigo = mapaIdsParaCodigos[id];
        if (!codigo) {
            const disc = disciplinas.find(d => d.id === id);
            if (disc?.codigo) {
                codigo = disc.codigo;
                mapaIdsParaCodigos[id] = codigo;
            } else {
                codigo = id.toUpperCase();
            }
        }
        historico.add(codigo);
    });
    return historico;
}

function _resolverCodigoReq(token) {
    const upper = token.toUpperCase();
    return mapaIdsParaCodigos[upper] || mapaIdsParaCodigos[token] || upper;
}

function isPreRequisitoCumprido(requisitoString, historicoSet) {
    if (!requisitoString || String(requisitoString).trim() === '') return true;

    let texto = String(requisitoString).trim().toUpperCase();
    texto = texto.replace(/\s+/g, ' ');

    const opcoes = texto.split(/\s+OU\s+|\s+OR\s+|\||,|;/).map(item => item.trim()).filter(Boolean);
    if (opcoes.length === 0) return true;

    return opcoes.some(item => {
        const conjuncoes = item.split(/\s+E\s+|\s+AND\s+|\+/).map(sub => sub.trim()).filter(Boolean);
        return conjuncoes.every(sub => {
            const cod = _resolverCodigoReq(sub);
            return historicoSet.has(cod);
        });
    });
}

function requisitoAtendidoOficial(r, historico) {
    if (Array.isArray(r)) {
        return r.some(item => requisitoAtendidoOficial(item, historico));
    }
    return isPreRequisitoCumprido(r, historico);
}

function cumpreRequisitos(m) {
    if (!m || !m.reqOficial || m.reqOficial.length === 0) return true;
    const historico = obterHistoricoOficial();
    return m.reqOficial.every(r => requisitoAtendidoOficial(r, historico));
}

function cumpreRequisitosConcluidas(m) {
    if (!m || !m.reqOficial || m.reqOficial.length === 0) return true;
    const historico = obterHistoricoOficial(false);
    return m.reqOficial.every(r => requisitoAtendidoOficial(r, historico));
}

function obterIdsDosCorequisitos(entry) {
    if (Array.isArray(entry)) return entry;
    let reqLimpo = String(entry).replace(/[()]/g, '').trim().toUpperCase();
    reqLimpo = reqLimpo.replace(/\s+/g, ' ');
    reqLimpo = reqLimpo.replace(/\bOU\b/g, '|');
    reqLimpo = reqLimpo.replace(/\bOR\b/g, '|');
    reqLimpo = reqLimpo.replace(/\bE\b/g, '+');
    reqLimpo = reqLimpo.replace(/\bAND\b/g, '+');
    reqLimpo = reqLimpo.replace(/,/g, '|');
    reqLimpo = reqLimpo.replace(/;/g, '|');

    const obterIds = texto => {
        if (!texto) return [];
        return texto
            .split('+')
            .map(sub => mapaCodigosParaIds[sub.trim()])
            .filter(Boolean);
    };

    if (reqLimpo.includes('|')) {
        return reqLimpo
            .split('|')
            .flatMap(opcao => obterIds(opcao.trim()));
    }

    return obterIds(reqLimpo);
}

function cumpreCorequisitos(m) {
    if (!m || !m.coreqOficial || m.coreqOficial.length === 0) return true;
    const historico = obterHistoricoOficial();
    return m.coreqOficial.every(c => requisitoAtendidoOficial(c, historico));
}

// Função auxiliar: Traduz códigos de requisitos em nomes legíveis
function traduzirRequisitos(requisitosBrutos) {
    if (!requisitosBrutos) return "";
    return String(requisitosBrutos).replace(/[A-Z]{3}\d{4}/g, (codigo) => {
        return mapaCodigosParaNomes[codigo] || codigo;
    });
}

function toggleCard(id) {
    const m = disciplinas.find(d => d.id === id);
    if (!m) return;

    // V24: Cadeado Lógico Absoluto (Trava de Segurança Universal)
    if (!cumpreRequisitos(m)) {
        // Aplica tremor em todos os cards desta matéria
        document.querySelectorAll(`[id="${id}"]`).forEach(el => {
            el.classList.add('bloqueado-shake');
            setTimeout(() => el.classList.remove('bloqueado-shake'), 500);
        });

        // Destaca pré-requisitos faltantes
        m.req.forEach(r => {
            const reqId = Array.isArray(r) ? r[0] : r;
            document.querySelectorAll(`[id="${reqId}"]`).forEach(el => {
                el.classList.remove('falta-prereq');
                void el.offsetWidth;
                el.classList.add('falta-prereq');
                setTimeout(() => el.classList.remove('falta-prereq'), 1200);
            });
        });
        return; // ⛔ TRAVA: Impede a seleção/conclusão
    }

    if (!cumpreCorequisitos(m)) {
        document.querySelectorAll(`[id="${id}"]`).forEach(el => {
            el.classList.add('bloqueado-shake');
            el.setAttribute('title', 'Falta co-requisito');
            setTimeout(() => {
                el.classList.remove('bloqueado-shake');
                if (el.getAttribute('title') === 'Falta co-requisito') {
                    el.removeAttribute('title');
                }
            }, 500);
        });
        // Não bloqueia a seleção por co-requisito; apenas avisa.
    }

    if (modoSimulacao) {
        if (concluidas.has(id)) return;
        planejadas.has(id) ? planejadas.delete(id) : planejadas.add(id);
        atualizarInterface(); // já detecta choques internamente
        return;
    }

    concluidas.has(id) ? concluidas.delete(id) : concluidas.add(id);
    salvarDados();
    atualizarInterface();
}

function getDependentesFuturos(idBase) {
    const dependentes = new Set();

    function buscarFuturos(idAtual) {
        disciplinas.forEach(d => {
            if (dependentes.has(d.id)) return;

            let isDependent = false;

            if (d.req) {
                d.req.forEach(r => {
                    if (Array.isArray(r)) {
                        if (r.includes(idAtual)) isDependent = true;
                    } else {
                        if (r === idAtual) isDependent = true;
                    }
                });
            }

            if (!isDependent && d.coreq) {
                d.coreq.forEach(c => {
                    if (Array.isArray(c)) {
                        if (c.includes(idAtual)) isDependent = true;
                    } else {
                        if (c === idAtual) isDependent = true;
                    }
                });
            }

            if (isDependent) {
                dependentes.add(d.id);
                buscarFuturos(d.id);
            }
        });
    }

    buscarFuturos(idBase);
    return dependentes;
}

function iluminarDominó(idBase) {
    const cardRaiz = document.getElementById(idBase);
    const disc = disciplinas.find(d => d.id === idBase);
    if (!disc) return;

    // ── CONDIÇÃO B: card bloqueado ou sem requisitos satisfeitos ──
    // Mostra o que ainda falta cursar para desbloquear esta disciplina
    const eBloqueado = cardRaiz && cardRaiz.classList.contains('bloqueado');
    const eMarcoFinal = disc.sem === 99; // Marcos Finais (TCC, Estágio, etc.)

    if (eBloqueado || eMarcoFinal) {
        // Marca o próprio card como alvo do retro-hóver
        if (cardRaiz) cardRaiz.classList.add('destaque-requisito-alvo');

        // Recolhe todos os requisitos do objeto da disciplina
        const requisitosIds = new Set();
        disc.req.forEach(r => {
            if (Array.isArray(r)) {
                // Cadeia OR: inclui todos os da cadeia que ainda não foram concluídos
                r.forEach(id => requisitosIds.add(id));
            } else {
                requisitosIds.add(r);
            }
        });

        // Ilumina apenas os requisitos que o aluno ainda NÃO concluiu
        requisitosIds.forEach(reqId => {
            if (!concluidas.has(reqId)) {
                // querySelectorAll cobre IDs duplicados (fluxo + seletivas)
                document.querySelectorAll(`[id="${reqId}"]`).forEach(el => {
                    el.classList.add('destaque-requisito');
                });
            }
        });
        return; // Para aqui — não executa o domìnó normal
    }

    // ── CONDIÇÃO A: card disponível ──
    // Comportamento original: ilumina quem esta disciplina desbloqueia
    const dependentes = getDependentesFuturos(idBase);
    if (cardRaiz) cardRaiz.classList.add('efeito-domino-raiz');

    if (dependentes && dependentes.size > 0) {
        dependentes.forEach(depId => {
            const el = document.getElementById(depId);
            if (el) el.classList.add('efeito-domino');
        });
    }
}

function apagarDominó() {
    document.querySelectorAll(
        '.efeito-domino, .efeito-domino-raiz, .destaque-requisito, .destaque-requisito-alvo'
    ).forEach(el => {
        el.classList.remove(
            'efeito-domino',
            'efeito-domino-raiz',
            'destaque-requisito',
            'destaque-requisito-alvo'
        );
    });
}

// ==========================================
// LÓGICA DE SAÚDE E PENDÊNCIA (CORRIGIDAS)
// ==========================================
function calcularSaudeCurso(horasFeitas, semestreA) {
    if (horasFeitas === 0 && semestreA === 1) return { status: "INICIANDO", classe: "status-verde", msg: "Bem-vindo ao curso!", corHEx: "var(--cor-saudavel)" };
    const ritmo = horasFeitas / semestreA;
    if (ritmo >= 280) return { status: "SAUDÁVEL", classe: "status-verde", msg: "Ritmo ideal! Formatura em até 12 semestres.", corHEx: "var(--cor-saudavel)" };
    else if (ritmo >= 200) return { status: "ATENÇÃO", classe: "status-amarelo", msg: "Ritmo moderado. Formatura entre 13 e 17 semestres.", corHEx: "#ff9800" };
    else return { status: "RISCO CRÍTICO", classe: "status-vermelho", msg: "Risco de Jubilamento! Extrapola o limite de 18 semestres.", corHEx: "#f44336" };
}

function atualizarNivelDoAluno() {
    let menorPendente = 11;
    for (let i = 1; i <= 10; i++) {
        const matSemestre = disciplinas.filter(d => d.sem === i && d.Tipo === 'OBG');
        const todasConcluidas = matSemestre.every(mat => concluidas.has(mat.id));
        if (!todasConcluidas) { menorPendente = i; break; }
    }
    const badgeNivel = document.getElementById('txt-nivel');
    if (menorPendente <= 10) {
        badgeNivel.innerText = `Menor Pendência: ${menorPendente}º Período`;
        badgeNivel.style.color = "var(--cor-nivel)";
        badgeNivel.style.borderColor = "var(--cor-nivel)";
    } else {
        badgeNivel.innerText = `Situação: Formando`;
        badgeNivel.style.color = "var(--cor-saudavel)";
        badgeNivel.style.borderColor = "var(--cor-saudavel)";
    }
}

/**
 * FUNÇÃO CENTRALIZADA: Computa o Estado Acadêmico Unificado
 * Retorna o estado real calculado exclusivamente a partir do DOM
 * Sincroniza cálculos entre página principal e dashboard
 */
function somaHorasPorTipo(tipo) {
    const tipoNorm = String(tipo || '').toUpperCase().trim();
    if (tipoNorm === 'ML') {
        return calcularTotalML();
    }

    return disciplinas.reduce((sum, m) => {
        if (!concluidas.has(m.id) && !planejadas.has(m.id)) return sum;
        const horas = m.horas || 0;
        const mTipo = (m.Tipo || 'OPT').toUpperCase().trim();

        if (tipoNorm === 'OBG' && mTipo === 'OBG') return sum + horas;
        if (tipoNorm === 'OPT' && mTipo === 'OPT') return sum + horas;
        return sum;
    }, 0);
}

// A função de inferência estática foi substituída pela confiança total no CSV
function inferirTrilha(nomeDisciplina, areaCSV) {
    return areaCSV === 'prodesp' ? 'outros_producao' : areaCSV;
}

function getEstadoAcademico() {
    const cliquesOBG = somaHorasPorTipo('OBG');
    const cliquesOPT = somaHorasPorTipo('OPT');
    const cliquesML = somaHorasPorTipo('ML');
    const contagemArea = {};

    disciplinas.forEach(m => {
        if (!concluidas.has(m.id) && !planejadas.has(m.id)) return;
        const tipo = (m.Tipo || 'OPT').toUpperCase().trim();
        const horas = m.horas || 0;
        const area = m.area || 'outros';

        if (tipo === 'OPT') {
            // Aplica a camada de inferência para refinar a área baseada no nome
            const areaRefinada = inferirTrilha(m.nome, area);
            contagemArea[areaRefinada] = (contagemArea[areaRefinada] || 0) + horas;
        }
    });

    let pisoOBG = 0; // Removido Calibrador SIGAA
    let pisoOPT = 0; // Removido Calibrador SIGAA

    let obgCalculado = cliquesOBG;
    let cliquesOptComML = cliquesOPT + Math.min(cliquesML, 360);
    let optCalculado = cliquesOptComML;

    let obgFinal = Math.min(obgCalculado, 2265);
    let optFinal = Math.min(optCalculado, 1335);

    let horasTotal = obgFinal + optFinal;
    let percentual = Number(((horasTotal / META_TOTAL) * 100).toFixed(1));
    let mlValido = Math.min(cliquesML, 360);

    return {
        cliquesOBG,
        cliquesOPT,
        cliquesML,
        pisoOBG,
        pisoOPT,
        obgCalculado,
        cliquesOptComML,
        optCalculado,
        obgFinal,
        optFinal,
        horasTotal,
        percentual,
        mlValido,
        contagemArea
    };
}

function recalcularProgressoGlobal() {
    const estado = getEstadoAcademico();
    atualizarCabecalho(estado);
    atualizarDashboardOverlay();
    return estado;
}

/**
 * Calcula o ranking de trilhas (Top 3) filtrando áreas de tronco comum.
 * Retorna um array de objetos { id, nome, horas } ordenado decrescentemente.
 */
function calcularRankingTrilhas(horasPorArea) {
    // Filtra as áreas ignoradas e com horas > 0
    const areasValidas = Object.keys(horasPorArea)
        .filter(area => !areasIgnoradasParaPerfil.includes(area) && horasPorArea[area] > 0);

    // Mapeia para array de objetos e ordena decrescente
    const rankingTrilhas = areasValidas
        .map(area => ({
            id: area,
            nome: mapNomesAreas[area] || area.toUpperCase(),
            horas: horasPorArea[area]
        }))
        .sort((a, b) => b.horas - a.horas)
        .slice(0, 3);

    // Debug: confirma geração correta
    console.log('🎓 Ranking de Trilhas (Top 3):', rankingTrilhas);
    return rankingTrilhas;
}

function getTrilhaDominante(estado) {
    const ranking = calcularRankingTrilhas(estado.contagemArea);
    return ranking.length > 0 ? ranking[0].nome : '—';
}

function atualizarCabecalho(estado, trilhaDominante = null) {
    const perc = Number(estado.percentual).toFixed(1);
    const horas = estado.horasTotal;
    const trilha = trilhaDominante || getTrilhaDominante(estado);

    const elPerc = document.getElementById('txt-perc');
    if (elPerc) elPerc.innerText = perc;

    const elHeaderText = document.getElementById('header-progresso-text');
    if (elHeaderText) elHeaderText.innerText = `${perc}% (${horas}h) | Trilha: ${trilha}`;
}

function atualizarInterface() {
    // === CENTRALIZAÇÃO DE ESTADO ===
    const estado = getEstadoAcademico();
    let totalRealH = 0; // Independente do estado (que agora inclui simuladas)
    let simH = 0;
    let recemLiberadas = [];
    let glowTargets = new Set();
    const misto = new Set([...concluidas, ...planejadas]);

    disciplinas.forEach(m => {
        const elementos = document.querySelectorAll(`[id="${m.id}"]`);
        if (elementos.length === 0) return;

        const reqOk = cumpreRequisitos(m);
        const reqOkReal = cumpreRequisitosConcluidas(m);

        elementos.forEach(el => {
            el.classList.remove('concluido', 'planejado', 'bloqueado', 'alerta-coreq', 'destrancado-simulacao', 'coreq-glow', 'falta-corequisito');
            el.removeAttribute('data-tooltip');
            el.style.cursor = '';
            el.onclick = () => toggleCard(m.id);

            if (concluidas.has(m.id)) {
                el.classList.add('concluido');
            } else if (planejadas.has(m.id)) {
                el.classList.add('planejado');
            } else if (modoSimulacao && reqOk && !reqOkReal) {
                el.classList.add('destrancado-simulacao');
                el.setAttribute('data-tooltip', "Liberado pela simulação atual ✨");
            } else if (!reqOk) {
                el.classList.add('bloqueado');
                el.style.cursor = 'not-allowed';
                const requisitosBrutos = Array.isArray(m.reqOficial)
                    ? m.reqOficial.map(req => Array.isArray(req) ? req.join(' + ') : req).join(' | ')
                    : String(m.reqOficial || '');
                el.setAttribute('data-tooltip', `Faltam pré-requisitos:\n${traduzirRequisitos(requisitosBrutos)}`);
            }
        });

        // Incremento de horas (apenas uma vez por disciplina)
        if (concluidas.has(m.id)) {
            totalRealH += m.horas;
        } else if (planejadas.has(m.id)) {
            simH += m.horas;
            if (modoSimulacao) {
                const coreqs = mapaCoReqBidi.get(m.id);
                if (coreqs) {
                    coreqs.forEach(cId => {
                        if (!misto.has(cId)) glowTargets.add(cId);
                    });
                }
            }
        } else if (modoSimulacao && reqOk && !reqOkReal) {
            recemLiberadas.push(m.nome);
        }

        // Badge permanente de origem da IA (com Match dinâmico)
        document.querySelectorAll(`[id="${m.id}"]`).forEach(elInst => {
            if (sugeridasPelaIA.has(m.id) && planejadas.has(m.id)) {
                let badge = elInst.querySelector('.badge-ia-origem');
                const matchVal = sugeridasPelaIA.get(m.id);
                const txt = matchVal > 0 ? `✨ ${matchVal}% Afinidade` : '✨ Sugestão IA';

                if (!badge) {
                    badge = document.createElement('div');
                    badge.className = 'badge-ia-origem';
                    elInst.appendChild(badge);
                }
                badge.innerText = txt;
                badge.title = matchVal > 0 ? `${matchVal}% de afinidade com a trilha` : 'Sugerido pela IA';
                badge.style.width = 'auto';
                badge.style.padding = '2px 8px';
                badge.style.borderRadius = '12px';
            } else {
                const badge = elInst.querySelector('.badge-ia-origem');
                if (badge) badge.remove();
            }
        });
    });

    const historicoOficial = obterHistoricoOficial();
    disciplinas.forEach(m => {
        if (!concluidas.has(m.id) && !planejadas.has(m.id)) return;
        if (!m.coreqOficial || m.coreqOficial.length === 0) return;

        m.coreqOficial.forEach(coreq => {
            if (requisitoAtendidoOficial(coreq, historicoOficial)) return;

            obterIdsDosCorequisitos(coreq).forEach(coreqId => {
                document.querySelectorAll(`[id="${coreqId}"]`).forEach(el => {
                    if (!concluidas.has(coreqId) && !planejadas.has(coreqId)) {
                        el.classList.add('falta-corequisito');
                        el.setAttribute('data-tooltip', 'Co-requisito pendente');
                    }
                });
            });
        });
    });

    // APLICAR GLOW DE CO-REQUISITOS (após o loop para não ser sobrescrito)
    if (modoSimulacao) {
        glowTargets.forEach(id => {
            const el = document.getElementById(id);
            if (el && !el.classList.contains('concluido') && !el.classList.contains('planejado')) {
                el.classList.add('coreq-glow');
                const nomes = [...(mapaCoReqBidi.get(id) || [])]
                    .filter(cId => planejadas.has(cId))
                    .map(cId => disciplinas.find(d => d.id === cId)?.nome)
                    .join(', ');
                el.setAttribute('data-tooltip', `⚡ Co-requisito recomendado com: ${nomes}`);
            }
        });
    }

    // A atualização do cabeçalho e do dashboard é feita por uma fonte única de verdade
    const containerPerc = document.getElementById('perc-container');

    if (containerPerc) {
        // Se houver qualquer hora simulada, ativa o modo "Holograma" (Dourado)
        if (simH > 0) {
            containerPerc.classList.add('progresso-simulado');
        } else {
            containerPerc.classList.remove('progresso-simulado');
            // Restaura a cor real baseada na saúde do aluno (SIGAA)
            const statusReal = calcularSaudeCurso(totalRealH, semestreAtual);
            containerPerc.style.color = statusReal.corHEx;
        }
    }

    // APLICANDO AS FUNÇÕES RECUPERADAS NA INTERFACE
    const saude = calcularSaudeCurso(totalRealH, semestreAtual);
    document.getElementById('termometro').innerText = saude.status;
    document.getElementById('termometro').className = `termometro ${saude.classe}`;
    document.getElementById('msg-termometro').innerText = saude.msg;

    atualizarNivelDoAluno();

    if (modoSimulacao) {
        document.getElementById('sim-horas').innerText = simH;
        const elLiberadas = document.getElementById('lista-liberadas');

        if (simH > LIMITE_HORAS_UNB) {
            document.getElementById('sim-horas').style.color = '#f44336';
            elLiberadas.innerText = '⚠️ Atenção: Limite de 420h excedido!';
            elLiberadas.style.color = '#f44336';
        } else {
            document.getElementById('sim-horas').style.color = '';
            elLiberadas.style.color = '#00e676';
            if (recemLiberadas.length > 0) {
                elLiberadas.innerText = '✨ Liberadas: ' + recemLiberadas.join(', ');
                elLiberadas.title = recemLiberadas.join('\n');
            } else {
                elLiberadas.innerText = 'Liberadas: Nenhuma';
                elLiberadas.title = '';
            }
        }
    }

    // Feedback imediato de choque na grade
    if (modoSimulacao) {
        const { temChoqueGlobal } = calcularAlocacoes();
        if (temChoqueGlobal) {
            const btnGrade = document.getElementById('btn-grade-visual');
            if (btnGrade) {
                btnGrade.classList.remove('alerta-grade-ativo');
                void btnGrade.offsetWidth; // força reflow para reiniciar animação
                btnGrade.classList.add('alerta-grade-ativo');
                setTimeout(() => btnGrade.classList.remove('alerta-grade-ativo'), 1600);
            }
        }
    }

    // Plug modular: mantém o dashboard overlay sincronizado (só executa se estiver aberto)
    recalcularProgressoGlobal();
}

function filtrarOptativas(area, ev) {
    ev.preventDefault();
    ev.stopPropagation();
    const botaoAtual = ev.currentTarget || ev.target;
    document.querySelectorAll('.pilula-filtro').forEach(b => b.classList.remove('ativa'));
    botaoAtual.classList.add('ativa');
    document.querySelectorAll('.optativa-card').forEach(c => {
        c.style.display = (area === 'todas' || c.getAttribute('data-area') === area) ? 'flex' : 'none';
    });
}

let _timerBarra = null; // previne conflito de múltiplos cliques rápidos

function toggleModoSimulacao() {
    modoSimulacao = !modoSimulacao;
    const barra = document.getElementById('barra-simulacao');
    const mainContainer = document.querySelector('.main-container');

    if (modoSimulacao) {
        // ── ACTIVAR SIMULAÇÃO ──
        // 1. Mede a altura REAL da barra (está sempre no DOM, só deslocada por transform)
        //    Se offsetHeight for 0 (improvável), usa 300px como fallback generoso
        const alturaRealBarra = barra ? (barra.offsetHeight || 300) : 300;
        const paddingNecessario = alturaRealBarra + 40; // +40px de folga visual

        // 2. Injeta directamente no contentor (inline style — máxima precedência)
        if (mainContainer) {
            mainContainer.style.paddingBottom = paddingNecessario + 'px';
        }

        // 3. Mostra a barra (DEPOIS do padding já estar aplicado)
        document.getElementById('btn-modo-sim').classList.add('ativo');
        if (barra) barra.classList.add('visivel');

        // 4. Safety-net: remede após 500ms (após a transição CSS de 0.4s terminar)
        //    para acomodar possível mudança de altura por conteúdo dinâmico
        clearTimeout(_timerBarra);
        _timerBarra = setTimeout(() => {
            if (!modoSimulacao || !mainContainer || !barra) return;
            const alturaFinal = barra.offsetHeight + 40;
            mainContainer.style.paddingBottom = alturaFinal + 'px';
        }, 500);

    } else {
        // ── DESACTIVAR SIMULAÇÃO ──
        clearTimeout(_timerBarra);

        // 1. Esconde a barra
        document.getElementById('btn-modo-sim').classList.remove('ativo');
        if (barra) barra.classList.remove('visivel');

        // 2. Limpa o inline style (volta ao CSS normal)
        if (mainContainer) mainContainer.style.paddingBottom = '';

        // 3. Limpa estado
        planejadas.clear(); sugeridasPelaIA.clear(); turmasSelecionadas.clear(); reabrirSelecaoTrilha();
    }

    atualizarInterface();
}
function limparSimulacao() {
    if (modoSimulacao) toggleModoSimulacao();
}
function resetarSimulacaoAtual() {
    if (confirm("Quer limpar as matérias selecionadas nesta simulação?")) {
        planejadas.clear();
        sugeridasPelaIA.clear();
        turmasSelecionadas.clear();
        reabrirSelecaoTrilha();
        atualizarInterface();
    }
}

function reabrirSelecaoTrilha() {
    document.getElementById('ia-bloco-selecao').style.display = 'flex';
    document.getElementById('ia-bloco-compacto').style.display = 'none';
}
function limparProgresso() {
    if (!confirm("Apagar tudo?")) return;
    concluidas.clear();
    Object.keys(mlContadores).forEach(h => mlContadores[h] = 0);
    salvarDados();
    salvarML();
    atualizarSteppers();
    atualizarInterface();
}
function mudarSemestre(v) { semestreAtual = Math.max(1, semestreAtual + v); document.getElementById('txt-semestres').innerText = `${semestreAtual} semestres`; salvarDados(); atualizarInterface(); }

// MÁGICA DA IA (PYTHON) - CO-PILOT AUTOFILL
async function executarIA() {
    if (!trilhaSelecionadaGlobal) return;
    const carga = parseInt(document.getElementById('ia-carga').value);

    const cargaPlanejadaAtual = Array.from(planejadas).reduce((sum, id) => {
        const disc = disciplinas.find(d => d.id === id);
        return sum + (disc ? Number(disc.horas) || 0 : 0);
    }, 0);

    if (cargaPlanejadaAtual >= carga) {
        alert("Sua carga horária já está preenchida com as matérias que selecionou, ou o motor Python não encontrou nada de novo para te oferecer!");
        document.querySelectorAll('.card-trilha').forEach(btn => btn.style.pointerEvents = '');
        const btnExecutar = document.getElementById('btn-executar-ia');
        if (btnExecutar) {
            btnExecutar.disabled = false;
            btnExecutar.classList.remove('btn-loading');
            btnExecutar.innerText = '✨ Auto-Completar';
        }
        return;
    }

    // Garantir que o modo simulação está ativo antes de adicionar planejadas
    if (!modoSimulacao) toggleModoSimulacao();

    // Garantir que enviamos o 'código' em maiúsculo (ex: MAT0025) que é o esperado pelo Backend
    const hist = Array.from(concluidas).map(id => disciplinas.find(d => d.id === id)?.codigo.toUpperCase() || id.toUpperCase());

    // Envia a turma EXACTA que o JS está a desenhar para cada planejada (Fonte Única de Verdade)
    const plan = Array.from(planejadas).map(id => {
        const disc = disciplinas.find(d => d.id === id);
        if (!disc) return { codigo: id.toUpperCase(), turma: '' };

        const codigo = disc.codigo.toUpperCase();
        const turmas = separarTurmas(disc.horario);
        let turmaAtiva = turmas.length > 0 ? turmas[0] : '';

        if (turmasSelecionadas.has(disc.codigo)) {
            const idx = turmasSelecionadas.get(disc.codigo);
            if (idx >= 0 && idx < turmas.length) {
                turmaAtiva = turmas[idx];
            }
        } else if (turmas.length > 0) {
            // Replica a lógica ordenarTurmasNFirst para consistência
            const ordenadas = [...turmas].sort((a, b) => {
                const aN = a.includes('N') ? 0 : 1;
                const bN = b.includes('N') ? 0 : 1;
                return aN - bN;
            });
            turmaAtiva = ordenadas[0];
        }

        return { codigo, turma: turmaAtiva };
    });

    // V21: Motor do Botão Mutante (UX Redução de Ansiedade)
    const btnExecutar = document.getElementById('btn-executar-ia');
    const loadingMsgs = [
        "⚙️ Conectando à IA...",
        "🧠 Analisando histórico...",
        "🧮 Calculando rotas...",
        "⚖️ Resolvendo choques...",
        "✨ Quase lá...",
        "🚀 Finalizando grade..."
    ];
    let msgIdx = 0;
    let loadingInterval = null;

    if (btnExecutar) {
        btnExecutar.disabled = true;
        btnExecutar.classList.add('btn-loading');
        btnExecutar.innerHTML = loadingMsgs[0];

        loadingInterval = setInterval(() => {
            msgIdx = (msgIdx + 1) % loadingMsgs.length;
            btnExecutar.innerHTML = loadingMsgs[msgIdx];
        }, 2500);
    }

    document.querySelectorAll('.card-trilha').forEach(btn => btn.style.pointerEvents = 'none');

    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ historico: hist, planejadas: plan, carga_maxima: carga, trilha: trilhaSelecionadaGlobal })
        });

        if (!res.ok) throw new Error("Erro na resposta da API");
        const data = await res.json();
        const sugestoes = data.grade;

        let nomesAdicionados = [];
        let atualizacoesPlanejadas = [];
        const mapaTurmasIA = new Map();

        sugestoes.forEach(sug => {
            const disc = disciplinas.find(d => d.codigo.toUpperCase() === sug.codigo.toUpperCase());
            if (!disc || concluidas.has(disc.id)) return;

            if (sug.turma_escolhida) {
                mapaTurmasIA.set(disc.codigo, sug.turma_escolhida);
            }

            if (sug.origem === 'planejada') {
                if (!planejadas.has(disc.id)) return;
                if (!sug.turma_escolhida) return;

                const turmasDaDisc = separarTurmas(disc.horario);
                const turmaPyLimpa = sug.turma_escolhida.replace(/\s+/g, '').toUpperCase();
                const idxTurma = turmasDaDisc.findIndex(t => t.replace(/\s+/g, '').toUpperCase() === turmaPyLimpa);

                if (idxTurma !== -1) {
                    const idxAtual = turmasSelecionadas.get(disc.codigo);
                    if (idxTurma !== idxAtual) {
                        turmasSelecionadas.set(disc.codigo, idxTurma);
                        atualizacoesPlanejadas.push(disc.codigo);
                    }
                }
                return;
            }

            if (!planejadas.has(disc.id) && !concluidas.has(disc.id)) {
                planejadas.add(disc.id);
                sugeridasPelaIA.set(disc.id, sug.match);
                nomesAdicionados.push(disc.codigo);

                if (sug.turma_escolhida) {
                    const turmasDaDisc = separarTurmas(disc.horario);
                    const turmaPyLimpa = sug.turma_escolhida.replace(/\s+/g, '').toUpperCase();
                    const idxTurma = turmasDaDisc.findIndex(t => t.replace(/\s+/g, '').toUpperCase() === turmaPyLimpa);

                    if (idxTurma !== -1) {
                        turmasSelecionadas.set(disc.codigo, idxTurma);
                    }
                }
            }
        });

        const houveAtualizacao = nomesAdicionados.length > 0 || atualizacoesPlanejadas.length > 0;
        if (houveAtualizacao) {
            // Fake loading de 800ms para valorizar a operação da IA
            setTimeout(() => {
                atualizarInterface();

                // ── Aura de entrada dos cards (cobre IDs duplicados no DOM) ──
                [...new Set([...nomesAdicionados, ...atualizacoesPlanejadas])].forEach(codigo => {
                    const disc = disciplinas.find(d => d.codigo.toUpperCase() === codigo.toUpperCase());
                    if (disc) {
                        document.querySelectorAll(`[id="${disc.id}"]`).forEach(el => {
                            const tIA = mapaTurmasIA.get(disc.codigo);
                            if (tIA) {
                                const tooltip = `Turma escolhida pela IA: ${tIA}`;
                                el.title = `${disc.nome} — ${tooltip}`;
                                el.dataset.turma = tIA;
                            }

                            el.classList.remove('card-ia-added');
                            void el.offsetWidth; // força reflow por instância
                            el.classList.add('card-ia-added');
                            setTimeout(() => el.classList.remove('card-ia-added'), 2500);
                        });
                    }
                });

                // ── Piscar Grade a Verde (sucesso) ──
                const btnGrade = document.getElementById('btn-grade-visual');
                if (btnGrade) {
                    btnGrade.classList.remove('alerta-grade-sucesso', 'alerta-grade-ativo');
                    void btnGrade.offsetWidth;
                    btnGrade.classList.add('alerta-grade-sucesso');
                }

                // ── Se houver choques, sobrepõe com alerta vermelho ──
                const { temChoqueGlobal } = calcularAlocacoes();
                if (temChoqueGlobal && btnGrade) {
                    setTimeout(() => {
                        btnGrade.classList.remove('alerta-grade-sucesso');
                        void btnGrade.offsetWidth;
                        btnGrade.classList.add('alerta-grade-ativo');
                    }, 1400);
                }

                // ── Ocultação Progressiva da Barra ──
                document.getElementById('txt-trilha-ativa').innerText = trilhaSelecionadaGlobal;
                document.getElementById('ia-bloco-selecao').style.display = 'none';
                document.getElementById('ia-bloco-compacto').style.display = 'flex';

            }, 800);
        } else {
            alert("Sua carga horária já está preenchida com as matérias que selecionou, ou o motor Python não encontrou nada de novo para te oferecer!");
        }
    } catch (e) {
        console.error(e);
        alert("Servidor Python offline ou com erro!");
    } finally {
        // V21: Limpeza do Botão Mutante
        if (typeof loadingInterval !== 'undefined' && loadingInterval) {
            clearInterval(loadingInterval);
        }

        document.querySelectorAll('.card-trilha').forEach(btn => btn.style.pointerEvents = '');
        const btnExecutar = document.getElementById('btn-executar-ia');
        if (btnExecutar) {
            btnExecutar.disabled = false;
            btnExecutar.classList.remove('btn-loading');
            btnExecutar.innerText = '✨ Auto-Completar';
        }
    }
}

// ==========================================
// ZONA 5.5: GRADE HORÁRIA VISUAL
// ==========================================
function extrairSlots(horarioStr) {
    if (!horarioStr || horarioStr.toUpperCase().includes('NÃO OFERTADA') || horarioStr.includes('Não Ofertada')) return [];
    const slots = [];
    // Suporta múltiplas turmas separadas por vírgula, ex: "2M12, 4M12"
    for (const turma of horarioStr.split(',')) {
        const match = turma.trim().match(/([2-7]+)([MTN])([1-7]+)/);
        if (match) {
            const [, dias, turno, horas] = match;
            for (const d of dias) { for (const h of horas) slots.push(`${d}${turno}${h}`); }
        }
    }
    return slots;
}

function separarTurmas(horarioCompleto) {
    if (!horarioCompleto || horarioCompleto.includes('Não Ofertada')) return [];
    return horarioCompleto.split(',').map(t => t.trim()).filter(t => t.length > 0);
}

// ==========================================
// ZONA 5.5a: CÁLCULO DE ALOCAÇÕES — MOTOR DE MESH COLLISION
// ==========================================
// NOVO MOTOR DE CHOQUES - ESTRITO E IMPIEDOSO
function calcularAlocacoes() {
    const mapaSlots = {}; // slot -> array de { id, codigo, nome, choque }
    let temChoqueGlobal = false;

    function ordenarTurmasNFirst(turmas) {
        return [...turmas].sort((a, b) => {
            const aN = a.includes('N') ? 0 : 1;
            const bN = b.includes('N') ? 0 : 1;
            return aN - bN;
        });
    }

    // 1. Extrai a Turma activa para cada matéria planeada
    const listaPlanejadas = [...planejadas].map(id => {
        const m = disciplinas.find(d => d.id === id);
        if (!m || !m.horario) return null;

        let turmas = separarTurmas(m.horario);
        if (turmas.length === 0) return null;

        // Se o utilizador forçou uma turma via setas, obedece cegamente
        if (turmasSelecionadas.has(m.codigo)) {
            const idx = turmasSelecionadas.get(m.codigo);
            if (idx >= 0 && idx < turmas.length) {
                turmas = [turmas[idx]];
            }
        } else {
            turmas = ordenarTurmasNFirst(turmas);
        }

        const slotsAocupar = extrairSlots(turmas[0]);
        return { id, codigo: m.codigo, nome: m.nome, slots: slotsAocupar };
    }).filter(Boolean);

    // 2. Preenche a malha — todos jogam os seus slots no mapa
    listaPlanejadas.forEach(item => {
        item.slots.forEach(s => {
            if (!mapaSlots[s]) mapaSlots[s] = [];
            mapaSlots[s].push({ id: item.id, codigo: item.codigo, nome: item.nome, choque: false });
        });
    });

    // 3. MESH COLLISION: qualquer slot com 2+ ocupantes → todos ficam vermelhos
    Object.keys(mapaSlots).forEach(slotKey => {
        const ocupantes = mapaSlots[slotKey];
        if (ocupantes.length > 1) {
            ocupantes.forEach(o => o.choque = true);
            temChoqueGlobal = true;
        }
    });

    return { mapa: mapaSlots, temChoqueGlobal };
}


function renderizarGradeVisual() {
    const corpo = document.getElementById('modal-grade-body');
    const DIAS = ['2', '3', '4', '5', '6', '7'];
    const DIAS_NOME = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const LINHAS = [
        { turno: 'M', label: 'Manhã', slots: ['1', '2', '3', '4', '5'] },
        { turno: 'T', label: 'Tarde', slots: ['1', '2', '3', '4', '5', '6'] },
        { turno: 'N', label: 'Noite', slots: ['1', '2', '3', '4'] }
    ];

    const { mapa, temChoqueGlobal } = calcularAlocacoes();

    // Banner de alerta para choques resolúveis
    let html = '';
    if (temChoqueGlobal) {
        html += `<div class="alerta-header-modal" style="display:block;">
                            ⚠️ <b>Conflito de Horário!</b><br>
                            Use as setas interativas <span style="background:rgba(255,255,255,0.2); padding:0 3px; border-radius:3px;">❮ ❯</span> nas disciplinas em vermelho para testar outras turmas disponíveis.
                         </div>`;
    }

    html += '<table class="tabela-grade"><thead><tr><th class="col-turno-esconder">Turno</th><th>Slot</th>';
    DIAS_NOME.forEach(d => html += `<th>${d}</th>`);
    html += '</tr></thead><tbody>';

    LINHAS.forEach(linha => {
        linha.slots.forEach((slotNum, idx) => {
            html += '<tr>';
            if (idx === 0) {
                html += `<td class="slot-turno-label col-turno-esconder" rowspan="${linha.slots.length}">${linha.label}</td>`;
            }
            html += `<td class="slot-turno-label slot-hora-compacto">${linha.turno}${slotNum}</td>`;
            DIAS.forEach(dia => {
                const chave = `${dia}${linha.turno}${slotNum}`;
                const arr = mapa[chave];
                if (arr && arr.length > 0) {
                    html += '<td class="td-grade-dia"><div class="slot-celula">';
                    arr.forEach(p => {
                        const disc = disciplinas.find(d => d.codigo === p.codigo);
                        let matchText = ''; let iconeIA = ''; let setas = '';

                        if (disc) {
                            // V22: Formatação Audital (Nome + CH + IA + Turma)
                            let infoAudit = ` (${disc.horas}h)`;

                            if (sugeridasPelaIA.has(disc.id)) {
                                const val = sugeridasPelaIA.get(disc.id);
                                infoAudit += val > 0 ? ` - (${val}% afinidade)` : ' - (Sugestão IA)';
                                iconeIA = ' ✨';
                            }

                            const numTurmas = separarTurmas(disc.horario).length;
                            if (numTurmas > 1) {
                                const idxAtual = (turmasSelecionadas.get(p.codigo) || 0);
                                infoAudit += ` Turma ${idxAtual + 1}/${numTurmas}`;
                                setas = `<span class="seta-dinamica" onclick="mudarTurma('${p.codigo}', -1)">❮</span><span class="seta-dinamica" onclick="mudarTurma('${p.codigo}', 1)">❯</span>`;
                            }
                            matchText = infoAudit;
                        }

                        const cls = p.choque ? 'pilula-choque' : 'pilula-ok';
                        const [setaEsq, setaDir] = setas ? setas.split('</span>').filter(s => s.trim()) : ['', ''];
                        html += `<div class="pilula-materia ${cls}" title="${p.nome}${matchText}">${setaEsq ? setaEsq + '</span>' : ''}<span class="txt-cod">${p.codigo}</span>${iconeIA}${setaDir ? setaDir + '</span>' : ''}</div>`;
                    });
                    html += '</div></td>';
                } else {
                    html += '<td class="td-grade-dia"></td>';
                }
            });
            html += '</tr>';
        });
    });
    html += '</tbody></table></div>';
    if (planejadas.size === 0) {
        html = '<div style="text-align:center; color:#777; padding:30px; font-style:italic;">Nenhuma matéria simulada. Clique nas matérias para planejar.</div>';
    }
    corpo.innerHTML = html;
}

// ==========================================
// MOTOR DE TROCA DE TURMAS
// ==========================================
function mudarTurma(codigo, direcao) {
    const disc = disciplinas.find(d => d.codigo === codigo);
    if (!disc) return;
    const turmas = separarTurmas(disc.horario);
    if (turmas.length <= 1) return;

    let idxAtual = turmasSelecionadas.has(codigo) ? turmasSelecionadas.get(codigo) : 0;
    let novoIdx = idxAtual + direcao;

    if (novoIdx < 0) novoIdx = turmas.length - 1;
    if (novoIdx >= turmas.length) novoIdx = 0;

    turmasSelecionadas.set(codigo, novoIdx);

    // Limpa alerta eventual para forçar reavaliação visual
    const btnGrade = document.getElementById('btn-grade-visual');
    if (btnGrade) {
        btnGrade.classList.remove('alerta-grade-ativo');
        void btnGrade.offsetWidth;
    }

    abrirModalGrade(); // Redesenha a grade mantendo o modal aberto
}

// ── MODAL GRADE VISUAL ──

function abrirModalGrade() {
    renderizarGradeVisual();
    document.getElementById('modal-grade').style.display = 'flex';
}
function fecharModalGrade() { document.getElementById('modal-grade').style.display = 'none'; }

// Inicialização Segura
// ==========================================
// ==========================================
// SELEÇÃO DE CARD DE TRILHA
// ==========================================
let trilhaSelecionadaGlobal = '';

function selecionarCardTrilha(nomeTrilha, elementoCard) {
    // Remove classe ativo de todos os cards
    document.querySelectorAll('.card-trilha').forEach(c => c.classList.remove('selecionado'));
    // Adiciona classe ativo ao card clicado
    elementoCard.classList.add('selecionado');

    // Atualiza a variável global
    trilhaSelecionadaGlobal = nomeTrilha;

    // Ativa o botão de execução
    const btnExecutar = document.getElementById('btn-executar-ia');
    if (btnExecutar) {
        btnExecutar.disabled = false;
        btnExecutar.style.opacity = '1';
        btnExecutar.innerText = '✨ Auto-Completar com a Trilha Selecionada';
    }
}

async function iniciarAplicacao() {
    await carregarDadosExternos();
    const salvo = localStorage.getItem('progresso_EPR_V9');
    if (salvo) JSON.parse(salvo).forEach(id => concluidas.add(id));
    const sem = localStorage.getItem('semestre_EPR_V9');
    if (sem) semestreAtual = parseInt(sem);

    construirMapaCoReq();
    construirInterface();
    carregarML();          // Restaura contadores de Módulo Livre
    atualizarSteppers();   // Desenha os visores dos steppers
    document.getElementById('txt-semestres').innerText = `${semestreAtual} semestres`;
    atualizarInterface();

    // ── MOTOR DE BUSCA REATIVO (ROBUSTO) ────────────────────────────
    const campoBusca = document.getElementById('campo-busca');
    if (campoBusca) {
        campoBusca.addEventListener('input', () => {
            const termo = campoBusca.value.trim().toLowerCase();

            // Captura TODOS os tipos de card de uma vez só
            document.querySelectorAll('.card, .optativa-card, .card-seletiva').forEach(cardEl => {
                const textoCard = cardEl.textContent.toLowerCase();
                const temMatch = !termo || textoCard.includes(termo);

                if (cardEl.classList.contains('optativa-card')) {
                    // Optativas: esconder ou mostrar (display)
                    cardEl.classList.toggle('escondido-busca', !temMatch);
                    if (temMatch) cardEl.classList.remove('ofuscado-busca');
                } else {
                    // Fluxo principal e Seletivas: ofuscar ou mostrar
                    cardEl.classList.toggle('ofuscado-busca', !temMatch);
                    if (temMatch) cardEl.classList.remove('escondido-busca');
                }
            });
        });
    }
    // ─────────────────────────────────────────────────────────────────
}

// ── AJUSTE DINÂMICO DE ESPAÇOS FIXOS (Header + Barra de Simulação) ──
// Função unificada: mede as alturas reais e actualiza as variáveis CSS
function ajustarEspacosFixos() {
    const header = document.querySelector('header');
    const barra = document.getElementById('barra-simulacao');
    const root = document.documentElement;

    // Topo: altura real do header + 20px de respiro visual
    if (header) {
        root.style.setProperty('--header-h', (header.offsetHeight + 20) + 'px');
    }

    // Rodapé: a barra sempre tem offsetHeight mensurável (transform não afecta o tamanho)
    // Quando activa: altura real + 30px de folga
    // Quando inactiva: 30px de respiro mínimo
    if (barra) {
        const alturaRodape = modoSimulacao && barra.offsetHeight > 0
            ? barra.offsetHeight + 30
            : 30;
        root.style.setProperty('--barra-h', alturaRodape + 'px');
    }
}

// Observa qualquer mudança de tamanho no header (compacto ↔ expandido, resize)
const observerHeader = new ResizeObserver(() => ajustarEspacosFixos());
// Observa qualquer mudança de tamanho na barra (cards aparecem/somem)
const observerBarra = new ResizeObserver(() => ajustarEspacosFixos());

window.addEventListener('DOMContentLoaded', () => {
    const header = document.querySelector('header');
    const barra = document.getElementById('barra-simulacao');
    if (header) observerHeader.observe(header);
    if (barra) observerBarra.observe(barra);
    ajustarEspacosFixos(); // Aplica imediatamente ao carregar
});

// Também reajusta no resize da janela (orientação portrait ↔ landscape)
window.addEventListener('resize', ajustarEspacosFixos);

// ── SMART STICKY HEADER (Encolhe ao fazer scroll) ──
window.addEventListener('scroll', () => {
    const header = document.querySelector('header');
    if (window.scrollY > 50) {
        header.classList.add('header-compacto');
    } else {
        header.classList.remove('header-compacto');
    }
});

// ── EXPORTAÇÃO DA GRADE PARA PNG ──
function baixarGradePNG() {
    const elementoAlvo = document.getElementById('modal-grade-body');
    const btn = document.getElementById('btn-baixar-grade');

    if (!elementoAlvo || elementoAlvo.innerText.includes("Nenhuma matéria simulada")) {
        alert("A grade está vazia. Adicione matérias antes de exportar.");
        return;
    }

    const textoOriginal = btn.innerText;
    btn.innerText = "⏳ Processando...";
    btn.style.opacity = "0.7";

    // Oculta eventuais alertas de "Conflito de horário" do print final
    const alertaHeader = elementoAlvo.querySelector('.alerta-header-modal');
    if (alertaHeader) alertaHeader.style.display = 'none';

    html2canvas(elementoAlvo, {
        backgroundColor: "#1e1e1e", // Fundo sólido igual ao do modal
        scale: 2, // Maior resolução para leitura fácil no telemóvel
        logging: false
    }).then(canvas => {
        // Restaura o alerta (se existir)
        if (alertaHeader) alertaHeader.style.display = 'block';

        const link = document.createElement('a');
        link.download = `Grade_TrilhaEPR_Semestre${semestreAtual}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();

        btn.innerText = "✅ Salvo!";
        btn.style.color = "#111";
        btn.style.background = "#00e676";

        setTimeout(() => {
            btn.innerText = textoOriginal;
            btn.style.color = "#00e676";
            btn.style.background = "transparent";
            btn.style.opacity = "1";
        }, 3000);
    }).catch(err => {
        console.error("Erro ao gerar imagem:", err);
        alert("Ocorreu um erro ao gerar a imagem da grade.");
        btn.innerText = textoOriginal;
        btn.style.opacity = "1";
    });
}


// ══════════════════════════════════════════════════════════════════
// ZONA: DASHBOARD ANALÍTICO FULL-SCREEN — MOTOR JS
// ══════════════════════════════════════════════════════════════════

// Constantes acadêmicas
const DASH_META = 3600;
const DASH_LIM_OBG = 2265;
const DASH_LIM_OPT = 1335;
const DASH_LIM_ML = 360;
const DASH_NOMES_AREA = { prodesp: 'Engenharias', prodbas: 'Produção Básica', humanas: 'Gestão & Humanas', exatas: 'Exatas & TI', projetos: 'Projetos' };
const DASH_CORES_AREA = { prodesp: '#5c88c2', prodbas: '#6ca85d', humanas: '#d68a8a', exatas: '#d4d47a', projetos: '#7e57c2' };

// Mapeamento de Áreas para exibição no Dashboard (tag CSV → nome formatado)
const mapNomesAreas = {
    'dados': 'Ciência de Dados & BI',
    'po': 'Pesquisa Operacional',
    'gestao': 'Gestão da Produção',
    'economica': 'Gestão Económica',
    'trabalho': 'Engenharia do Trabalho',
    'qualidade': 'Qualidade',
    'produto': 'Eng. de Produto',
    'sustentabilidade': 'Sustentabilidade',
    'logistica': 'Logística & Suprimentos',
    'outros_producao': 'Outros (Produção)',
    // Adiciona outras áreas do CSV conforme necessário
};

// Áreas de Tronco Comum a ignorar no cálculo de especialização
const areasIgnoradasParaPerfil = ['exatas', 'prodbas', 'humanas', 'seletiva-chave', 'projetos'];

// Chart.js — instâncias reutilizáveis
let _chartRadar = null;
let _chartDoughnut = null;

// Estado de paginação e filtro da tabela
let _dashFiltroTipo = 'todas';
let _dashDados = [];  // cache das disciplinas concluídas

// Carrega Chart.js dinamicamente na primeira abertura
function _carregarChartJS(cb) {
    if (window.Chart) { cb(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js';
    s.onload = cb;
    document.head.appendChild(s);
}

/** Abre o overlay com animação */
function abrirDashboardOverlay() {
    const overlay = document.getElementById('dashboard-overlay');
    if (!overlay) return;
    overlay.classList.add('dash-visivel');
    document.body.style.overflow = 'hidden';
    _carregarChartJS(() => atualizarDashboardOverlay());
}

/** Fecha o overlay */
function fecharDashboardOverlay() {
    const overlay = document.getElementById('dashboard-overlay');
    if (!overlay) return;
    overlay.classList.remove('dash-visivel');
    document.body.style.overflow = '';
}

/** Fecha com ESC */
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') fecharDashboardOverlay();
});

/** Fecha ao clicar no fundo */
document.getElementById('dashboard-overlay')?.addEventListener('click', function (e) {
    if (e.target === this) fecharDashboardOverlay();
});

/** Ativa item de navegação da sidebar */
function dashNavAtivar(el) {
    document.querySelectorAll('.dash-nav-item').forEach(a => a.classList.remove('ativo'));
    el.classList.add('ativo');
}

/** Filtra a tabela por tipo */
function dashFiltrarTabela(tipo) {
    _dashFiltroTipo = tipo;
    _dashRenderizarTabela();
}



/** Motor principal: coleta dados e atualiza todos os componentes */
function atualizarDashboardOverlay() {
    if (!document.getElementById('dashboard-overlay')?.classList.contains('dash-visivel')) return;

    // === CENTRALIZAÇÃO DE ESTADO ===
    const estado = getEstadoAcademico();

    const lista = [];
    disciplinas.forEach(m => {
        if (!concluidas.has(m.id)) return;
        const tipo = (m.Tipo || 'OPT').toUpperCase().trim();
        const horas = m.horas || 0;
        const area = m.area || 'outros';
        lista.push({ codigo: m.codigo, nome: m.nome, area, tipo, horas });
    });

    // Trilha dominante — vencedor único com filtro de tronco comum
    let trilhaVencedora = 'Perfil em Formação';
    let maxHoras = 0;
    for (const [area, horas] of Object.entries(estado.contagemArea)) {
        if (!areasIgnoradasParaPerfil.includes(area) && horas > maxHoras) {
            maxHoras = horas;
            trilhaVencedora = mapNomesAreas[area] || area;
        }
    }
    if (maxHoras === 0) trilhaVencedora = 'Foco no Ciclo Básico';

    const areaDom = maxHoras > 0 ? Object.keys(estado.contagemArea).find(a => estado.contagemArea[a] === maxHoras && !areasIgnoradasParaPerfil.includes(a)) : null;
    const hDom = maxHoras;
    const percDom = hDom > 0 ? Math.min((hDom / DASH_LIM_OPT) * 100, 100).toFixed(1) : 0;
    const subText = hDom > 0 ? `${hDom}h acumuladas nesta especialização` : 'Nenhuma optativa especializada concluída';

    // === PAINEL DE TELEMETRIA (DEBUG) ===
    // Comentado para a versão final, descomente caso precise auditar o fluxo de horas
    /*
    const debugEl = document.getElementById('debug-telemetria');
    if (debugEl) {
        debugEl.innerText = `=== MODO DEBUG / TELEMETRIA ===
[Lido dos Inputs] Piso OBG: ${estado.pisoOBG} | Piso OPT: ${estado.pisoOPT}
[Lido dos Cards] Cliques OBG: ${estado.cliquesOBG} | Cliques OPT: ${estado.cliquesOPT} | Cliques ML: ${estado.cliquesML}
[Cálculo Math.max] Total OBG: ${estado.totalOBGReal} | Total OPT+ML: ${estado.totalOPTReal}
[Cálculo Final (Tetos)] OBG Final: ${estado.obgFinal} | OPT Final: ${estado.optFinal}
[Total] Horas Validadas: ${estado.horasTotal} | Percentagem: ${estado.percentual}%`;
    }
    */

    // ── 2. KPI CARDS ──
    const _set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const _barra = (id, w) => { const el = document.getElementById(id); if (el) el.style.width = w + '%'; };

    _set('dk-perc', estado.percentual);
    _set('dk-horas-opt', estado.optFinal);
    _set('dk-ml', estado.mlValido);
    _set('dash-obg-text', estado.obgFinal);

    _barra('dk-barra-perc', Math.min(estado.percentual, 100));
    _barra('dk-barra-opt', Math.min((estado.optValido / DASH_LIM_OPT) * 100, 100).toFixed(1));
    _barra('dk-barra-ml', Math.min((estado.mlValido / DASH_LIM_ML) * 100, 100).toFixed(1));
    _barra('dk-barra-trilha', percDom);
    _barra('dk-barra-obg', Math.min((estado.obgFinal / 2265) * 100, 100));

    // ── Injeção da Trilha Predominante (texto simples) ──
    const elTrilha = document.getElementById('dk-trilha');
    if (elTrilha) elTrilha.textContent = trilhaVencedora;

    const elTSub = document.getElementById('dk-trilha-sub');
    if (elTSub) elTSub.textContent = subText;

    const elHSub = document.getElementById('dk-horas-sub');
    if (elHSub) elHSub.textContent = `${estado.horasTotal} / 3600h (${lista.length} disciplinas concluídas)`;
    _set('dk-horas-total', `${estado.horasTotal}`);
    _barra('dk-barra-total', Math.min((estado.horasTotal / DASH_META) * 100, 100).toFixed(1));

    // Mantém o cabeçalho sincronizado com o dashboard
    atualizarCabecalho(estado);

    // ── 3. GRÁFICOS ──
    _dashRenderizarRadar();
    _dashRenderizarDoughnut(estado.obgFinal, estado.optFinal, estado.mlValido);

    // ── 4. TABELA ──
    _dashDados = lista;
    _dashRenderizarTabela();
}

/** Renderiza o gráfico Radar de competências */
function _dashRenderizarRadar() {
    const acumulador = new Map();

    disciplinas.forEach(m => {
        if (!concluidas.has(m.id)) return;

        const card = document.getElementById(m.id);
        const rawLabel = card?.dataset?.trilha?.trim() || m.area?.trim() || 'Outros';
        const label = DASH_NOMES_AREA[rawLabel] || rawLabel;
        const horas = Number(m.horas) || 0;

        acumulador.set(label, (acumulador.get(label) || 0) + horas);
    });

    const horasML = calcularTotalML();
    if (horasML > 0) {
        acumulador.set('Módulo Livre', (acumulador.get('Módulo Livre') || 0) + horasML);
    }

    const labels = [...acumulador.keys()];
    const dados = labels.map(label => acumulador.get(label));

    const ctx = document.getElementById('dash-chart-radar')?.getContext('2d');
    if (!ctx || !window.Chart) return;

    const cfg = {
        type: 'radar',
        data: {
            labels,
            datasets: [{
                label: 'Horas por Árvore de Trilha',
                data: dados,
                backgroundColor: 'rgba(79,172,254,0.18)',
                borderColor: '#4facfe',
                borderWidth: 2,
                pointBackgroundColor: '#4facfe',
                pointBorderColor: '#fff',
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                r: {
                    beginAtZero: true,
                    suggestedMax: Math.max(...dados, 60),
                    grid: { color: 'rgba(255,255,255,0.08)' },
                    angleLines: { color: 'rgba(255,255,255,0.08)' },
                    ticks: { color: '#94a3b8', font: { size: 10 }, backdropColor: 'transparent' },
                    pointLabels: { color: '#cbd5e1', font: { size: 11 } }
                }
            }
        }
    };

    if (_chartRadar) {
        _chartRadar.data.labels = labels;
        _chartRadar.data.datasets[0].data = dados;
        _chartRadar.update();
    } else {
        _chartRadar = new Chart(ctx, cfg);
    }
}

/** Renderiza o gráfico Doughnut: OBG / OPT / ML */
function _dashRenderizarDoughnut(horasOBG, horasOPT, horasML) {
    const ctx = document.getElementById('dash-chart-doughnut')?.getContext('2d');
    if (!ctx || !window.Chart) return;

    const cfg = {
        type: 'doughnut',
        data: {
            labels: ['Obrigatórias', 'Optativas', 'Módulo Livre'],
            datasets: [{
                data: [horasOBG, horasOPT, horasML],
                backgroundColor: ['rgba(79,172,254,0.8)', 'rgba(67,233,123,0.8)', 'rgba(161,140,209,0.8)'],
                borderColor: ['#4facfe', '#43e97b', '#a18cd1'],
                borderWidth: 2,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#94a3b8', font: { size: 11 }, padding: 16, usePointStyle: true }
                }
            }
        }
    };

    if (_chartDoughnut) {
        _chartDoughnut.data.datasets[0].data = [horasOBG, horasOPT, horasML];
        _chartDoughnut.update();
    } else {
        _chartDoughnut = new Chart(ctx, cfg);
    }
}

/** Renderiza a tabela paginada */
function _dashRenderizarTabela() {
    const CORES_AREA = { prodesp: 'rgba(92,136,194,0.25)', prodbas: 'rgba(108,168,93,0.25)', humanas: 'rgba(214,138,138,0.25)', exatas: 'rgba(212,212,122,0.25)', projetos: 'rgba(126,87,194,0.25)' };
    const TEXTO_AREA = { prodesp: '#5c88c2', prodbas: '#6ca85d', humanas: '#d68a8a', exatas: '#bfbf55', projetos: '#7e57c2' };

    const filtradas = _dashFiltroTipo === 'todas'
        ? _dashDados
        : _dashDados.filter(d => d.tipo === _dashFiltroTipo);

    const tbody = document.getElementById('dash-tabela-body');
    if (!tbody) return;

    if (filtradas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#475569; padding:30px; font-style:italic;">Nenhuma disciplina encontrada.</td></tr>';
    } else {
        tbody.innerHTML = filtradas.map(d => {
            const nomArea = DASH_NOMES_AREA[d.area] || d.area;
            const corBg = CORES_AREA[d.area] || 'rgba(255,255,255,0.05)';
            const corTxt = TEXTO_AREA[d.area] || '#94a3b8';
            const tipoBadgeStyle = d.tipo === 'OBG'
                ? 'background:rgba(79,172,254,0.15);color:#4facfe;border:1px solid rgba(79,172,254,0.3);'
                : 'background:rgba(67,233,123,0.1);color:#43e97b;border:1px solid rgba(67,233,123,0.25);';
            return `<tr>
                        <td><span class="dash-tabela-codigo">${d.codigo}</span></td>
                        <td>${d.nome}</td>
                        <td><span class="dash-area-badge" style="background:${corBg};color:${corTxt};">${nomArea}</span></td>
                        <td><span class="dash-area-badge" style="${tipoBadgeStyle}">${d.tipo}</span></td>
                        <td style="text-align:right; font-weight:600; color:#e2e8f0;">${d.horas}h</td>
                    </tr>`;
        }).join('');
    }
}

window.onload = iniciarAplicacao;

// Event listeners do SIGAA removidos devido à limpeza de UI



const customTooltip = document.getElementById('custom-tooltip');
document.addEventListener('mousemove', (e) => {
    if (customTooltip.classList.contains('visivel')) {
        let x = e.clientX + 15;
        let y = e.clientY + 15;
        const rect = customTooltip.getBoundingClientRect();
        if (x + rect.width > window.innerWidth) x = e.clientX - rect.width - 10;
        if (y + rect.height > window.innerHeight) y = e.clientY - rect.height - 10;
        customTooltip.style.left = x + 'px';
        customTooltip.style.top = y + 'px';
    }
});
function mostrarTooltipHTML(html) {
    if (!html) return;
    customTooltip.innerHTML = html;
    customTooltip.classList.add('visivel');
}
function esconderTooltipHTML() {
    customTooltip.classList.remove('visivel');
}

// Fechar tooltip ao tocar fora em dispositivos touch (não altera comportamento desktop)
if ('ontouchstart' in window) {
    document.addEventListener('touchstart', (e) => {
        try {
            if (!customTooltip || !customTooltip.classList.contains('visivel')) return;
            const touchTarget = e.target;
            // Se o toque ocorreu dentro do tooltip, não fecha
            if (customTooltip.contains(touchTarget)) return;
            // Se o toque ocorreu dentro de um cartão ou carrossel relacionado, não fecha (permite interação)
            if (touchTarget.closest && touchTarget.closest('.card, .optativa-card, .carrossel-optativas, .ia-cards-container')) return;
            // Caso contrário, esconde o tooltip
            esconderTooltipHTML();
        } catch (err) {
            // Proteção simples para evitar crashes em navegadores antigos
            console.warn('touch tooltip handler error', err);
        }
    }, { passive: true });
}

// ══════════════════════════════════════════════════════════════════════════════
// MODAL DE IMPORTAÇÃO DE HISTÓRICO SIGAA (Client-Side / LGPD-Compliant)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Abre o modal de importação e reseta o estado visual.
 */
function abrirModalImportar() {
    const overlay = document.getElementById('modal-importar');
    if (!overlay) return;

    // Reseta estado anterior
    const textarea = document.getElementById('importar-textarea');
    const resultado = document.getElementById('importar-resultado');
    const footerDica = document.getElementById('importar-footer-dica');
    const btnImportar = document.getElementById('btn-executar-importacao');

    if (textarea) textarea.value = '';
    if (resultado) { resultado.style.display = 'none'; resultado.className = 'importar-resultado'; resultado.innerHTML = ''; }
    if (footerDica) footerDica.style.display = '';
    if (btnImportar) btnImportar.disabled = false;

    overlay.classList.add('ativo');

    // Foca na textarea após a animação de abertura
    setTimeout(() => { if (textarea) textarea.focus(); }, 320);

    // Fecha ao clicar fora do painel
    overlay.addEventListener('click', _importarFecharSeClicarFora, { once: true });
}

function _importarFecharSeClicarFora(e) {
    const panel = document.querySelector('.importar-panel');
    if (panel && !panel.contains(e.target)) {
        fecharModalImportar();
    } else {
        // Rebinda o listener se não fechou
        const overlay = document.getElementById('modal-importar');
        if (overlay) overlay.addEventListener('click', _importarFecharSeClicarFora, { once: true });
    }
}

/**
 * Fecha o modal de importação.
 */
function fecharModalImportar() {
    const overlay = document.getElementById('modal-importar');
    if (!overlay) return;
    overlay.classList.remove('ativo');
    overlay.removeEventListener('click', _importarFecharSeClicarFora);
}

// Fecha também com Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const overlay = document.getElementById('modal-importar');
        if (overlay && overlay.classList.contains('ativo')) fecharModalImportar();
    }
});

/**
 * NÚCLEO DA IMPORTAÇÃO: Extrai e integra o histórico colado do SIGAA.
 *
 * Estratégia Regex (linha-a-linha):
 * 1. Detecta o padrão de código UnB: [A-Z]{3}\d{4}  (ex: EPR0001, MAT0025)
 * 2. Na mesma linha, verifica a presença de "APR" ou "Aprovado"
 *    para filtrar reprovações, trancamentos e cancelamentos.
 * 3. Converte cada código aprovado para o ID interno do app e marca como concluído.
 */
function executarImportacaoSIGAA() {
    const textarea = document.getElementById('importar-textarea');
    const footerDica = document.getElementById('importar-footer-dica');
    const btnImportar = document.getElementById('btn-executar-importacao');

    if (!textarea) return;

    const textoColado = textarea.value.trim();

    if (!textoColado) {
        _importarMostrarResultado('erro',
            '⚠️ A caixa de texto está vazia. Cole o texto do seu Histórico Escolar do SIGAA e tente novamente.'
        );
        return;
    }

    const resultado = _processarTextoHistorico(textoColado);

    if (resultado.codigosAprovados.size === 0) {
        _importarMostrarResultado('aviso',
            '🔍 Nenhuma disciplina aprovada foi encontrada no texto colado.<br>' +
            '<small style="color:#aaa; margin-top:6px; display:block;">Verifique se copiou a página correta: ' +
            '<em>Portal do Discente → Ensino → Emitir Histórico</em>.</small>'
        );
        return;
    }

    const html = _montarHtmlResultado(resultado);
    const tipo = resultado.novos.length > 0 ? 'sucesso' : (resultado.codigosAprovados.size > 0 ? 'aviso' : 'erro');
    _importarMostrarResultado(tipo, html);

    if (resultado.novos.length > 0) {
        if (footerDica) footerDica.style.display = 'none';
        if (btnImportar) { btnImportar.disabled = true; btnImportar.textContent = '✅ Importado!'; }
        if (resultado.codigosDesconhecidos.length === 0 && resultado.jaExistentes.length === 0) {
            setTimeout(() => fecharModalImportar(), 2800);
        }
    }
}

/**
 * Exibe a área de resultado do modal com a classe de estilo correta.
 * @param {'sucesso'|'erro'|'aviso'} tipo
 * @param {string} htmlConteudo
 */
function _importarMostrarResultado(tipo, htmlConteudo) {
    const el = document.getElementById('importar-resultado');
    const texto = document.getElementById('importar-resultado-texto');
    if (!el || !texto) return;
    el.style.display = 'block';
    el.className = `importar-resultado ${tipo}`;
    texto.innerHTML = htmlConteudo;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ══════════════════════════════════════════════════════════════════════════════
// NÚCLEO COMPARTILHADO: Regex de Extração de Disciplinas (usado por ambos modais)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Processa um bloco de texto extraído do SIGAA (seja de PDF ou de Ctrl+A/Ctrl+C)
 * e identifica disciplinas aprovadas, integrando-as ao estado do app.
 *
 * @param {string} textoCompleto - Texto bruto do histórico
 * @returns {{ codigosAprovados: Set, novos: Array, jaExistentes: Array, codigosDesconhecidos: Array }}
 */
function _processarTextoHistorico(textoCompleto) {
    // Padrão UnB: 3 letras maiúsculas + 4 dígitos
    const REGEX_CODIGO_UNB = /\b([A-Z]{3}\d{4})\b/g;
    // Status de aprovação (APR, APROVADO, Aprovado) — ignora REP, TRANC, CANC, etc.
    const REGEX_APROVADO   = /\b(APR|APROVADO|Aprovado)\b/i;

    const linhas = textoCompleto.split('\n');
    const codigosAprovados  = new Set();

    linhas.forEach(linha => {
        const matches = [...linha.matchAll(REGEX_CODIGO_UNB)].map(m => m[1]);
        if (matches.length === 0) return;
        if (REGEX_APROVADO.test(linha)) {
            matches.forEach(cod => codigosAprovados.add(cod));
        }
    });

    // Classifica em conhecidos (no catálogo EPR) e desconhecidos (outros cursos / ML)
    const codigosConhecidos    = [];
    const codigosDesconhecidos = [];

    codigosAprovados.forEach(cod => {
        const id = mapaCodigosParaIds[cod];
        if (id) codigosConhecidos.push({ codigo: cod, id });
        else     codigosDesconhecidos.push(cod);
    });

    const jaExistentes = codigosConhecidos.filter(({ id }) =>  concluidas.has(id));
    const novos        = codigosConhecidos.filter(({ id }) => !concluidas.has(id));

    // Integra ao estado global do app
    novos.forEach(({ id }) => concluidas.add(id));
    if (novos.length > 0) {
        salvarDados();
        atualizarInterface();
    }

    // ── AUTOMAÇÃO DE MÓDULO LIVRE ──
    // Disciplinas fora do catálogo EPR são aproveitadas como carga do Módulo Livre.
    // Cada disciplina vale 60h (média de 4 créditos). Limite removido para respeitar todos os créditos.
    const HORAS_POR_DISCIPLINA_ML = 60;
    let horasMLAdicionadas = 0;

    if (codigosDesconhecidos.length > 0) {
        const horasBrutas  = codigosDesconhecidos.length * HORAS_POR_DISCIPLINA_ML;
        const unidades60 = codigosDesconhecidos.length; // 1 disciplina = 60h

        if (unidades60 > 0) {
            mlContadores[30] = mlContadores[30] || 0; // garante a chave
            // Adiciona como grupos de 60h (2x30h cada)
            const grupos60 = unidades60;
            // Usa o contador de 60h se existir, senao distribui em 30h
            if (mlContadores.hasOwnProperty('60')) {
                mlContadores['60'] += grupos60;
            } else {
                mlContadores['30'] += grupos60 * 2;
            }
            horasMLAdicionadas = grupos60 * HORAS_POR_DISCIPLINA_ML;
            salvarML();
            atualizarSteppers();
            atualizarInterface(); // recalcula % com o novo ML
        }
    }

    return { codigosAprovados, novos, jaExistentes, codigosDesconhecidos, horasMLAdicionadas };
}

/**
 * Monta o HTML de resultado formatado (compartilhado por ambos os modais).
 * @param {{ novos, jaExistentes, codigosDesconhecidos }} resultado
 * @returns {string} HTML formatado
 */
function _montarHtmlResultado({ novos, jaExistentes, codigosDesconhecidos }) {
    let html = '';

    if (novos.length > 0) {
        const s = novos.length > 1;
        html += `<strong style="color:#34d399;">✅ ${novos.length} disciplina${s?'s':''} importada${s?'s':''} com sucesso!</strong>`;
        html += '<ul class="importar-resultado-lista">';
        novos.forEach(({ codigo }) => {
            const nome = mapaCodigosParaNomes[codigo] || '';
            html += `<li title="${nome}">${codigo}${nome ? ' · ' + nome.substring(0, 22) + (nome.length > 22 ? '…' : '') : ''}</li>`;
        });
        html += '</ul>';
    }

    if (jaExistentes.length > 0) {
        const s = jaExistentes.length > 1;
        html += `<div style="margin-top:${novos.length > 0 ? '10px':'0'}; color:#6b7280; font-size:0.78rem;">
            ℹ️ ${jaExistentes.length} disciplina${s?'s':''} já estava${s?'m':''} no histórico e foi${s?'ram':''} mantida${s?'s':''}.
        </div>`;
    }

    if (codigosDesconhecidos.length > 0) {
        const s = codigosDesconhecidos.length > 1;
        html += `<div style="margin-top:8px; color:#9ca3af; font-size:0.76rem;">
            ⚠️ ${codigosDesconhecidos.length} código${s?'s':''} aprovado${s?'s':''} fora do catálogo EPR/UnB
            (outros cursos ou módulo livre):
            <ul class="importar-resultado-lista" style="margin-top:5px;">
                ${codigosDesconhecidos.map(c => `<li class="ignorado">${c}</li>`).join('')}
            </ul>
        </div>`;
    }

    return html;
}

// ══════════════════════════════════════════════════════════════════════════════
// MODAL DE IMPORTAÇÃO VIA PDF (PDF.js / Client-Side / LGPD-Compliant)
// ══════════════════════════════════════════════════════════════════════════════

// Worker do PDF.js via CDN — configurado assim que o script carregar
(function _configurarPDFjsWorker() {
    // Aguarda o pdfjsLib estar disponível (carregado de forma síncrona no <head>)
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
})();

// Estado interno do modal PDF
const _pdfState = {
    arquivoSelecionado: null, // File object
    processando: false,
};

/**
 * Abre o modal de importação PDF e reseta o estado.
 */
function abrirModalPDF() {
    const overlay = document.getElementById('modal-pdf');
    if (!overlay) return;

    // Reseta estado interno
    _pdfState.arquivoSelecionado = null;
    _pdfState.processando = false;

    // Reseta UI da dropzone e resultado
    _pdfResetarDropzone();
    const resultado = document.getElementById('pdf-resultado');
    if (resultado) { resultado.style.display = 'none'; resultado.className = 'pdf-resultado'; }
    const btnProcessar = document.getElementById('btn-processar-pdf');
    if (btnProcessar) { btnProcessar.disabled = true; btnProcessar.innerHTML = '&#128196; Processar PDF'; }
    const fileInput = document.getElementById('pdf-input-file');
    if (fileInput) fileInput.value = '';

    // Restaura elementos que podem ter sido ocultados pelo estado de sucesso
    const dz       = document.getElementById('pdf-dropzone');
    const tutorial = document.getElementById('pdf-tutorial-bloco');
    const lgpd     = document.getElementById('pdf-desc');
    const footer   = document.querySelector('.pdf-footer');
    const zonaOk   = document.getElementById('pdf-zona-sucesso');
    const elML     = document.getElementById('pdf-sucesso-ml');

    if (dz)       dz.style.display       = '';
    if (tutorial) tutorial.style.display = '';
    if (lgpd)     lgpd.style.display     = '';
    if (footer)   footer.style.display   = '';
    if (zonaOk)   { zonaOk.style.display = 'none'; zonaOk.style.opacity = ''; }
    if (elML)     elML.style.display     = 'none';

    overlay.classList.add('ativo');

    // Fecha ao clicar fora do painel
    overlay.addEventListener('click', _pdfFecharSeClicarFora, { once: true });
}

function _pdfFecharSeClicarFora(e) {
    const panel = document.querySelector('.pdf-panel');
    if (panel && !panel.contains(e.target)) {
        fecharModalPDF();
    } else {
        const overlay = document.getElementById('modal-pdf');
        if (overlay) overlay.addEventListener('click', _pdfFecharSeClicarFora, { once: true });
    }
}

/**
 * Fecha o modal PDF.
 */
function fecharModalPDF() {
    if (_pdfState.processando) return; // Bloqueia fechamento durante o processamento
    const overlay = document.getElementById('modal-pdf');
    if (!overlay) return;
    overlay.classList.remove('ativo');
    overlay.removeEventListener('click', _pdfFecharSeClicarFora);
}

// Fecha com Escape (apenas se não estiver processando)
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const overlay = document.getElementById('modal-pdf');
        if (overlay && overlay.classList.contains('ativo')) fecharModalPDF();
    }
});

// ── Drag & Drop Handlers ──

function _pdfDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    if (_pdfState.processando) return;
    const dz = document.getElementById('pdf-dropzone');
    if (dz) dz.classList.add('drag-over');
    _pdfMostrarEstadoDZ('dragover');
}

function _pdfDragLeave(e) {
    e.preventDefault();
    const dz = document.getElementById('pdf-dropzone');
    if (dz) dz.classList.remove('drag-over');
    _pdfMostrarEstadoDZ(_pdfState.arquivoSelecionado ? 'selecionado' : 'idle');
}

function _pdfOnDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const dz = document.getElementById('pdf-dropzone');
    if (dz) dz.classList.remove('drag-over');

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        _pdfMostrarResultado('erro', '❌ Arquivo inválido. Por favor, selecione um arquivo <strong>.PDF</strong> emitido pelo SIGAA.');
        _pdfMostrarEstadoDZ('idle');
        return;
    }

    _pdfDefinirArquivo(file);
}

function _pdfOnFileInputChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    _pdfDefinirArquivo(file);
}

/**
 * Registra o arquivo selecionado e atualiza a UI para o estado "selecionado".
 */
function _pdfDefinirArquivo(file) {
    _pdfState.arquivoSelecionado = file;

    const nomEl = document.getElementById('pdf-nome-arquivo');
    if (nomEl) nomEl.textContent = file.name;

    const dz = document.getElementById('pdf-dropzone');
    if (dz) { dz.classList.remove('drag-over'); dz.classList.add('com-arquivo'); }

    _pdfMostrarEstadoDZ('selecionado');

    // Habilita o botão de processar
    const btn = document.getElementById('btn-processar-pdf');
    if (btn) btn.disabled = false;

    // Limpa resultado anterior
    const resultado = document.getElementById('pdf-resultado');
    if (resultado) resultado.style.display = 'none';
}

/**
 * Handler do botão "Processar PDF" — ponto de entrada do processamento.
 */
function _pdfProcessarArquivoSelecionado() {
    if (!_pdfState.arquivoSelecionado || _pdfState.processando) return;

    if (typeof pdfjsLib === 'undefined') {
        _pdfMostrarResultado('erro',
            '❌ A biblioteca PDF.js não foi carregada. Verifique a sua conexão e recarregue a página.'
        );
        return;
    }

    _pdfState.processando = true;
    const btn = document.getElementById('btn-processar-pdf');
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Processando...'; }

    const dz = document.getElementById('pdf-dropzone');
    if (dz) { dz.classList.remove('com-arquivo'); dz.classList.add('carregando'); }

    _pdfMostrarEstadoDZ('loading');
    _pdfAtualizarProgresso('Lendo arquivo PDF...', 0, 'Iniciando...');

    const reader = new FileReader();

    reader.onload = async function(e) {
        try {
            const arrayBuffer = e.target.result;
            const textoExtraido = await _pdfExtrairTexto(arrayBuffer);

            _pdfAtualizarProgresso('Analisando disciplinas...', 100, 'Aplicando filtros...');

            // Pequena pausa para o usuário ver 100%
            await new Promise(r => setTimeout(r, 400));

            // Processa o texto extraído com o core compartilhado
            const resultado = _processarTextoHistorico(textoExtraido);

            _pdfState.processando = false;
            if (dz) dz.classList.remove('carregando');

            if (resultado.codigosAprovados.size === 0) {
                _pdfMostrarEstadoDZ('idle');
                _pdfMostrarResultado('aviso',
                    '🔍 Nenhuma disciplina com status <strong>APR / Aprovado</strong> foi encontrada neste PDF.<br>' +
                    '<small style="color:#aaa; margin-top:6px; display:block;">Verifique se o PDF é o <em>Histórico Escolar</em> emitido pelo SIGAA (não o espelho de matrícula ou outro documento).</small>'
                );
                if (btn) { btn.disabled = false; btn.innerHTML = '&#128196; Tentar Novamente'; }
                return;
            }

            // ══ ESTADO DE SUCESSO CELEBRATÓRIO ══
            // Oculta dropzone, tutorial e LGPD — exibe a zona de celebração
            if (resultado.novos.length > 0 || resultado.horasMLAdicionadas > 0) {
                // Oculta elementos de upload
                if (dz) dz.style.display = 'none';
                const tutorial = document.getElementById('pdf-tutorial-bloco');
                const lgpd     = document.getElementById('pdf-desc');
                if (tutorial) tutorial.style.display = 'none';
                if (lgpd)     lgpd.style.display     = 'none';

                // Oculta footer de ações e rodapé padrão
                const footer = document.querySelector('.pdf-footer');
                if (footer) footer.style.display = 'none';

                // Popula zona de sucesso
                const totalCurriculo = resultado.novos.length + resultado.jaExistentes.length;
                const elTitulo = document.getElementById('pdf-sucesso-titulo');
                const elSub    = document.getElementById('pdf-sucesso-subtitulo');
                const elML     = document.getElementById('pdf-sucesso-ml');
                const elMLTxt  = document.getElementById('pdf-sucesso-ml-texto');
                const zonaOk   = document.getElementById('pdf-zona-sucesso');

                if (elTitulo) {
                    elTitulo.textContent = 'Processamento Concluído!';
                }

                if (elSub) {
                    elSub.innerHTML = `<strong>${totalCurriculo}</strong> disciplina${totalCurriculo !== 1 ? 's' : ''} do catálogo da Engenharia de Produção fora${totalCurriculo !== 1 ? 'm' : ''} ativada${totalCurriculo !== 1 ? 's' : ''}.`;
                }

                // Mensagem de ML transparente
                if (resultado.horasMLAdicionadas > 0 && elML && elMLTxt) {
                    const nDisc = resultado.codigosDesconhecidos.length;
                    
                    let htmlTags = '<div class="pdf-tags-ml">';
                    resultado.codigosDesconhecidos.forEach(cod => {
                        htmlTags += `<span class="pdf-tag-ml">${cod}</span>`;
                    });
                    htmlTags += '</div>';

                    elMLTxt.innerHTML =
                        `⚠️ Encontrámos <strong>${nDisc} disciplina${nDisc > 1 ? 's' : ''}</strong> ` +
                        `fora do catálogo padrão. Ela${nDisc > 1 ? 's' : ''} fora${nDisc > 1 ? 'm' : ''} convertida${nDisc > 1 ? 's' : ''} ` +
                        `em <strong>${resultado.horasMLAdicionadas} horas de Módulo Livre</strong>:<br>${htmlTags}`;
                    elML.style.display = 'flex';
                }

                if (zonaOk) {
                    zonaOk.style.display = 'flex';
                    // Animação de entrada
                    zonaOk.style.opacity = '0';
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => { zonaOk.style.opacity = '1'; });
                    });
                }

            } else {
                // Nenhuma novidade — mostra resultado compacto sem ocultar a dropzone
                const html = _montarHtmlResultado(resultado);
                _pdfMostrarEstadoDZ('selecionado');
                _pdfMostrarResultado('aviso', html);
                if (btn) { btn.disabled = false; btn.innerHTML = '&#128196; Processar PDF'; }
            }

        } catch (err) {
            _pdfState.processando = false;
            if (dz) dz.classList.remove('carregando');
            _pdfMostrarEstadoDZ('idle');
            console.error('[PDF Import] Erro ao processar PDF:', err);
            _pdfMostrarResultado('erro',
                `❌ Erro ao ler o PDF: <em>${err.message || 'Falha desconhecida'}</em>.<br>` +
                '<small style="color:#aaa; margin-top:6px; display:block;">Tente gerar o PDF novamente pelo SIGAA ou use o método alternativo de colar o texto.</small>'
            );
            if (btn) { btn.disabled = false; btn.innerHTML = '&#128196; Tentar Novamente'; }
        }
    };

    reader.onerror = function() {
        _pdfState.processando = false;
        _pdfMostrarEstadoDZ('idle');
        _pdfMostrarResultado('erro', '❌ Não foi possível ler o arquivo. Tente novamente.');
        if (btn) { btn.disabled = false; btn.innerHTML = '&#128196; Tentar Novamente'; }
    };

    reader.readAsArrayBuffer(_pdfState.arquivoSelecionado);
}

/**
 * Extrai todo o texto do PDF usando PDF.js, agrupando itens por coordenada Y
 * para reconstruir linhas reais (fundamental para PDFs com layout tabular do SIGAA).
 *
 * @param {ArrayBuffer} arrayBuffer - Conteúdo binário do PDF
 * @returns {Promise<string>} - Texto completo com linhas separadas por \n
 */
async function _pdfExtrairTexto(arrayBuffer) {
    const TOLERANCIA_Y = 2; // pixels de tolerância para agrupar na mesma linha

    const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPaginas = pdfDoc.numPages;
    const linhasGlobais = [];

    for (let pageNum = 1; pageNum <= totalPaginas; pageNum++) {
        const progresso = ((pageNum - 1) / totalPaginas) * 90; // 0–90% para extração
        _pdfAtualizarProgresso(
            `Extraindo texto... (pág. ${pageNum}/${totalPaginas})`,
            progresso,
            `Página ${pageNum} de ${totalPaginas}`
        );

        const page = await pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();

        // Agrupa itens de texto pela coordenada Y (mesma linha no documento)
        const grupos = new Map(); // key: Y arredondado → value: array de {x, str}

        textContent.items.forEach(item => {
            if (!item.str || !item.str.trim()) return;
            const y = Math.round(item.transform[5] / TOLERANCIA_Y) * TOLERANCIA_Y;
            const x = item.transform[4];
            if (!grupos.has(y)) grupos.set(y, []);
            grupos.get(y).push({ x, str: item.str });
        });

        // Ordena por Y decrescente (topo → base do PDF) e por X crescente (esq → dir)
        const ysOrdenados = [...grupos.keys()].sort((a, b) => b - a);
        ysOrdenados.forEach(y => {
            const itens = grupos.get(y).sort((a, b) => a.x - b.x);
            linhasGlobais.push(itens.map(i => i.str).join(' '));
        });

        linhasGlobais.push(''); // Separador entre páginas
    }

    return linhasGlobais.join('\n');
}

// ── Helpers de UI do Modal PDF ──

/**
 * Alterna qual estado da drop zone está visível.
 * @param {'idle'|'dragover'|'loading'|'selecionado'} estado
 */
function _pdfMostrarEstadoDZ(estado) {
    const estados = { idle: 'pdf-dz-idle', dragover: 'pdf-dz-dragover', loading: 'pdf-dz-loading', selecionado: 'pdf-dz-selecionado' };
    Object.entries(estados).forEach(([key, id]) => {
        const el = document.getElementById(id);
        if (el) el.style.display = key === estado ? 'flex' : 'none';
    });
}

/**
 * Atualiza a mensagem e barra de progresso na drop zone de loading.
 */
function _pdfAtualizarProgresso(msg, percentual, sub) {
    const msgEl  = document.getElementById('pdf-loading-msg');
    const barEl  = document.getElementById('pdf-progress-bar');
    const subEl  = document.getElementById('pdf-loading-sub');
    if (msgEl) msgEl.textContent = msg;
    if (barEl) barEl.style.width = Math.min(100, Math.round(percentual)) + '%';
    if (subEl && sub !== undefined) subEl.textContent = sub;
}

/**
 * Reseta a drop zone para o estado inicial (idle).
 */
function _pdfResetarDropzone() {
    const dz = document.getElementById('pdf-dropzone');
    if (dz) { dz.className = 'pdf-dropzone'; }
    _pdfMostrarEstadoDZ('idle');
}

/**
 * Exibe a área de resultado do modal PDF.
 * @param {'sucesso'|'erro'|'aviso'} tipo
 * @param {string} htmlConteudo
 */
function _pdfMostrarResultado(tipo, htmlConteudo) {
    const el    = document.getElementById('pdf-resultado');
    const texto = document.getElementById('pdf-resultado-texto');
    if (!el || !texto) return;
    el.style.display = 'block';
    el.className = `pdf-resultado ${tipo}`;
    texto.innerHTML = htmlConteudo;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
