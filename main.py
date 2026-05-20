# ==========================================
# 2. MOTOR LÓGICO
# ==========================================
from fastapi.middleware.cors import CORSMiddleware
import re
import unicodedata
from pathlib import Path

from fastapi import FastAPI
import pandas as pd

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Permite que qualquer porta (incluindo a 5500) se conecte
    allow_credentials=True,
    allow_methods=["*"],  # Permite pedidos POST, GET, etc.
    allow_headers=["*"],
)

DATA_PATH = Path(__file__).resolve().parent / "disciplinas.csv"
df_base = pd.read_csv(DATA_PATH, sep=';', dtype=str, keep_default_na=False, na_filter=False)

def _sanitize_dataframe_strings(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    for col in df.columns:
        df[col] = df[col].astype(str).fillna('').str.strip()
    return df

df_base = _sanitize_dataframe_strings(df_base)

class MotorSAD:
    def __init__(self, df):
        # O índice agora é 'codigo' (minúsculo, mas processado para maiúsculo)
        self.disciplinas = df.set_index('codigo').to_dict('index') if not df.empty else {}
        self.totais_por_tipo = self._calcular_totais_por_tipo(df)
        self.totais_por_area = self._calcular_totais_por_area(df)
        self.seletivas_por_grupo = self._carregar_cadeias_seletivas(df)
        self.total_horas_obg = self.totais_por_tipo.get('OBG', 0)
        self.total_horas_opt = self.totais_por_tipo.get('OPT', 0)
        self.total_horas_ml = self.totais_por_tipo.get('ML', 0)
        self.impacto_futuro = self._calcular_impacto_futuro()

    def _carregar_cadeias_seletivas(self, df):
        df2 = df.copy()
        df2['area_norm'] = df2['area'].astype(str).str.lower().str.strip()
        group_col = next((col for col in ['cadeia', 'grupo'] if col in df2.columns), None)
        if group_col is None:
            return {}

        df2['grupo_norm'] = df2[group_col].astype(str).str.lower().str.strip()
        seletivas = df2[df2['area_norm'] == 'seletiva-chave']
        grupos = {}
        for grupo, group_df in seletivas.groupby('grupo_norm'):
            codigos = set(group_df['codigo'].astype(str).str.upper().str.strip())
            if codigos:
                grupos[grupo] = codigos
        return grupos

    def obter_grupo_seletiva_por_codigo(self, codigo):
        codigo = str(codigo).strip().upper()
        for grupo, codigos in self.seletivas_por_grupo.items():
            if codigo in codigos:
                return grupo, codigos
        return None, None

    def _calcular_totais_por_tipo(self, df):
        df2 = df.copy()
        df2['tipo_norm'] = df2['tipo'].astype(str).str.upper().str.strip()
        df2['horas_num'] = pd.to_numeric(df2['horas'], errors='coerce').fillna(0).astype(int)
        return {
            'OBG': int(df2[df2['tipo_norm'].isin(['OBG', 'OBRIG'])]['horas_num'].sum()),
            'OPT': int(df2[df2['tipo_norm'] == 'OPT']['horas_num'].sum()),
            'ML': int(df2[df2['tipo_norm'] == 'ML']['horas_num'].sum())
        }

    def _calcular_totais_por_area(self, df):
        df2 = df.copy()
        df2['area_norm'] = df2['area'].astype(str).str.lower().str.strip()
        df2['horas_num'] = pd.to_numeric(df2['horas'], errors='coerce').fillna(0).astype(int)
        return df2.groupby('area_norm')['horas_num'].sum().to_dict()

    def _calcular_impacto_futuro(self):
        grafo = {c: set() for c in self.disciplinas}
        for cod, dados in self.disciplinas.items():
            req_str = str(dados.get('requisitos', '')).upper()
            reqs = set(re.findall(r'[A-Z0-9_]+', req_str))
            for req in reqs:
                if req in grafo:
                    grafo[req].add(cod)
                    
        descendentes = {}
        def get_descendentes(node, stack):
            if node in descendentes: return descendentes[node]
            if node in stack: return set()
            stack.add(node)
            res = set()
            for v in grafo.get(node, set()):
                res.add(v)
                res.update(get_descendentes(v, stack))
            stack.remove(node)
            descendentes[node] = res
            return res
            
        return {node: len(get_descendentes(node, set())) for node in self.disciplinas}

    def extrair_slots(self, horario):
        if not horario or str(horario).strip() in ['', 'nan', 'None'] or 'NÃO OFERTADA' in str(horario).upper():
            return set()
        slots = set()
        horario_str = str(horario).upper().replace(' ', '')
        # Captura blocos do tipo 35T45, 246N12, 2M12 etc.
        for bloco in re.finditer(r'([2-7]+)([MTN])([1-6]+)', horario_str):
            dias, turno, horas = bloco.groups()
            for d in dias:
                for h in horas:
                    slots.add(f"{d}{turno}{h}")
        return slots

    def tem_choque_horario(self, slots: set, slots_ocupados: set) -> bool:
        return bool(slots & slots_ocupados)

    def checar_requisitos(self, expressao, historico):
        if not expressao or str(expressao).strip() in ['', 'nan', 'None']: return True
        exp = str(expressao).upper().replace(',', ' and ').replace('OU', ' or ').replace('E', ' and ').replace(';', ' and ')
        
        # Captura QUALQUER código/ID (ex: MAT0025 ou calc1) e ignora operadores
        codigos = set(re.findall(r'[A-Z0-9_]+', exp))
        codigos = {c for c in codigos if c not in ['AND', 'OR', 'TRUE', 'FALSE']}
        
        # Limpa o histórico que vem do HTML para garantir o Match perfeito
        hist_clean = [str(h).strip().upper() for h in historico]
        
        for cod in codigos:
            # Substitui a palavra exata pelo booleano correspondente
            exp = re.sub(rf'\b{cod}\b', str(cod in hist_clean), exp)
        try: 
            return eval(exp)
        except: 
            return False

motor = MotorSAD(df_base)

# ==========================================
# 3. HEURÍSTICA DE SELEÇÃO DE TURMA
# ==========================================
def custo_turma(turma_str: str) -> float:
    """
    Calcula o custo apenas por turno (N > T > M).
    Dias da semana (2-7) são tratados com peso igual.Pesos:
    Noite (0.0) > Tarde (3.0) > Manhã (5.0).
    Uma pequena penalidade por dispersão para preferir blocos de aula.
    """
    match = re.search(r'([2-7]+)([MTN])([1-7]+)', turma_str.strip())
    if not match:
        return 999.0

    dias_str, turno, _ = match.groups()

    # Prioridade de turno — sem discriminação por dia da semana
    custo = 0.0 if turno == 'N' else (3.0 if turno == 'T' else 5.0)

    # Pequena penalidade por dispersão: prefere aulas em menos dias distintos
    custo += len(set(dias_str)) * 0.1

    return custo

def parse_codigos(campo: str) -> list[str]:
    if not campo:
        return []
    return [c for c in re.findall(r'[A-Z0-9_]+', str(campo).upper())]


def normalizar_texto(texto: str) -> str:
    if not texto:
        return ''
    texto_norm = unicodedata.normalize('NFKD', str(texto).strip().lower())
    return ''.join(ch for ch in texto_norm if unicodedata.category(ch) != 'Mn')


def calcular_match_afinidade(texto_foco: str, dados: dict) -> int:
    if not texto_foco:
        return 0

    documento = ' '.join([
        str(dados.get('nome', '')),
        str(dados.get('area', '')),
        str(dados.get('requisitos', '')),
        str(dados.get('corequisitos', ''))
    ])

    foco_tokens = set(re.findall(r'\b[a-z0-9]+\b', normalizar_texto(texto_foco)))
    doc_tokens = set(re.findall(r'\b[a-z0-9]+\b', normalizar_texto(documento)))
    if not foco_tokens or not doc_tokens:
        return 0

    intersection = foco_tokens & doc_tokens
    union = foco_tokens | doc_tokens
    if not union:
        return 0

    return int(len(intersection) / len(union) * 100)


def obter_turmas_validas(horario_str: str, slots_ocupados: set, horas_necessarias: int) -> list[tuple[float, set, str]]:
    turmas = [t.strip() for t in str(horario_str).split(',') if t.strip()]
    candidatas = []
    slots_esperados = horas_necessarias // 15

    for turma in turmas:
        slots = motor.extrair_slots(turma)
        if not slots or len(slots) < slots_esperados:
            continue
        if motor.tem_choque_horario(slots, slots_ocupados):
            continue
        candidatas.append((custo_turma(turma), slots, turma))

    candidatas.sort(key=lambda x: x[0])
    return candidatas


def escolher_turma(horario_str: str, slots_ocupados: set, horas_necessarias: int) -> tuple[set, str]:
    candidatas = obter_turmas_validas(horario_str, slots_ocupados, horas_necessarias)
    if not candidatas:
        return set(), None

    _, slots_best, turma_best = candidatas[0]
    return slots_best, turma_best


def alocar_disciplina_com_corequisitos(codigo: str, dados: dict, slots_ocupados: set, total_h: int, carga_maxima: int, hist_clean: list[str], plan_clean: list[str], accepted_codes: set[str]):
    horas_disciplina = int(dados.get('horas', 0))
    horario_disciplina = dados.get('horario', '')
    coreq_codes = [coreq for coreq in parse_codigos(dados.get('corequisitos', '')) if coreq]
    missing_coreqs = [coreq for coreq in coreq_codes if coreq not in hist_clean and coreq not in plan_clean and coreq not in accepted_codes]

    for _, slots_principal, turma_principal in obter_turmas_validas(horario_disciplina, slots_ocupados, horas_disciplina):
        if total_h + horas_disciplina > carga_maxima:
            continue

        temp_slots = set(slots_ocupados)
        temp_slots.update(slots_principal)
        temp_total_h = total_h + horas_disciplina
        coreq_additions = []
        failed = False

        for coreq in missing_coreqs:
            coreq_data = motor.disciplinas.get(coreq)

            if not coreq_data or not motor.checar_requisitos(coreq_data.get('requisitos', ''), hist_clean):
                failed = True
                break

            coreq_horas = int(coreq_data.get('horas', 0))
            if temp_total_h + coreq_horas > carga_maxima:
                failed = True
                break

            coreq_slots, coreq_turma = escolher_turma(coreq_data.get('horario', ''), temp_slots, coreq_horas)
            if not coreq_slots:
                failed = True
                break

            temp_slots.update(coreq_slots)
            temp_total_h += coreq_horas
            coreq_additions.append((coreq, coreq_turma, coreq_slots, coreq_data))

        if failed:
            continue

        return {
            'principal': (codigo, turma_principal, slots_principal, dados),
            'coreqs': coreq_additions
        }

    return None

# ==========================================
# 4. ENDPOINT DA API
# ==========================================
from pydantic import BaseModel


def normalizar_texto(texto: str) -> str:
    if not texto:
        return ''
    texto_norm = unicodedata.normalize('NFKD', str(texto).strip().lower())
    return ''.join(ch for ch in texto_norm if unicodedata.category(ch) != 'Mn')


def calcular_match_afinidade(texto_foco: str, dados: dict) -> int:
    if not texto_foco:
        return 0

    documento = ' '.join([
        str(dados.get('nome', '')),
        str(dados.get('area', '')),
        str(dados.get('requisitos', '')),
        str(dados.get('corequisitos', ''))
    ])

    foco_tokens = set(re.findall(r'\b[a-z0-9]+\b', normalizar_texto(texto_foco)))
    doc_tokens = set(re.findall(r'\b[a-z0-9]+\b', normalizar_texto(documento)))
    if not foco_tokens or not doc_tokens:
        return 0

    intersection = foco_tokens & doc_tokens
    union = foco_tokens | doc_tokens
    if not union:
        return 0

    return int(len(intersection) / len(union) * 100)


class RequisicaoGrade(BaseModel):
    historico: list[str]
    planejadas: list = []  # Aceita [{"codigo": "X", "turma": "2N34"}, ...] OU ["X", ...]
    carga_maxima: int
    trilha: str

descricoes_areas = {
    "Eng. de Operações": "Produção, manufatura, controle de processos, fábrica, PCP, planejamento.",
    "Logística": "Cadeia de suprimentos, transporte, estoques, modais, supply chain, distribuição.",
    "Pesquisa Operacional/Dados": "Modelagem, otimização, análise de dados, Python, estatística, IA.",
    "Gestão e Economia": "Finanças, economia, projetos, empreendedorismo, estratégia, pessoas.",
    "Explorar": "Tecnologia, inovação, sustentabilidade, gestão, dados, amplo, generalista."
}

@app.post("/otimizar")
def otimizar(req: RequisicaoGrade):
    trilha_chaves = {normalizar_texto(k): k for k in descricoes_areas}
    texto_foco = descricoes_areas.get(trilha_chaves.get(normalizar_texto(req.trilha), ''), descricoes_areas["Explorar"])
    hist_clean = [str(h).strip().upper() for h in req.historico]
    
    # Normaliza planejadas: aceita dicts {codigo, turma} ou strings puras
    plan_items = []
    for item in req.planejadas:
        if isinstance(item, dict):
            plan_items.append({
                'codigo': str(item.get('codigo', '')).strip().upper(),
                'turma': str(item.get('turma', '')).strip()
            })
        else:
            plan_items.append({'codigo': str(item).strip().upper(), 'turma': ''})
    plan_clean = [p['codigo'] for p in plan_items]
    
    # 1. Setup Base: Trata planejadas como prioridade máxima e ignora a turma fixa enviada pelo cliente
    slots_ocupados = set()
    total_h = 0
    sugestoes_completas = []

    for item in plan_items:
        cod = item['codigo']
        if cod in motor.disciplinas:
            horario = motor.disciplinas[cod].get('horario', '')
            horas_materia = int(motor.disciplinas[cod].get('horas', 0))
            turma_desejada = str(item.get('turma', '')).strip()
            slots_escol = []
            turma_best = None

            # Se o utilizador fixou uma turma, tenta primeiro essa turma específica.
            if turma_desejada:
                slots = motor.extrair_slots(turma_desejada)
                if slots and len(slots) >= horas_materia // 15 and not motor.tem_choque_horario(slots, slots_ocupados):
                    slots_escol = slots
                    turma_best = turma_desejada
                else:
                    # Ainda assim tenta outras turmas da mesma disciplina antes de descartá-la.
                    slots_escol, turma_best = escolher_turma(horario, slots_ocupados, horas_materia)
            else:
                slots_escol, turma_best = escolher_turma(horario, slots_ocupados, horas_materia)

            if slots_escol:
                slots_ocupados.update(slots_escol)

            sugestoes_completas.append({
                'codigo': cod,
                'match': 0,
                'turma_escolhida': turma_best or '',
                'origem': 'planejada'
            })
            total_h += horas_materia

    possiveis = []
    
    # 2. Regra 1: Filtro Rígido e Coleta
    for cod, dados in motor.disciplinas.items():
        if cod in hist_clean or cod in plan_clean: 
            continue
            
        if not motor.checar_requisitos(dados.get('requisitos', ''), hist_clean):
            continue
            
        horario = str(dados.get('horario', ''))
        if not horario or horario.strip() in ['nan', 'None'] or 'NÃO OFERTADA' in horario.upper():
            continue
            
        tipo = str(dados.get('tipo', 'OPT')).upper()
        semestre = int(dados.get('semestre', 98))
        
        peso_tipo = 2 # 0: Core OBG, 1: Seletiva, 2: Optativa
        if tipo in ['OBG', 'OBRIG']:
            grupo, grupo_codigos = motor.obter_grupo_seletiva_por_codigo(cod)
            if grupo is None:
                peso_tipo = 0
            else:
                if any(c_cod in hist_clean for c_cod in grupo_codigos):
                    continue
                peso_tipo = 1

        # Prioridade noturna: penaliza horários sem turno N
        horario_str = str(dados.get('horario', '')).upper()
        if 'N' not in horario_str:
            peso_tipo += 5

        match_ia = calcular_match_afinidade(texto_foco, dados)

        possiveis.append({
            'Codigo': cod, 'Semestre': semestre, 'PesoTipo': peso_tipo, 'MatchIA': match_ia, 'Dados': dados
        })
            
    # 3. Regra 2: Ordenação Simples (1º Semestre, 2º PesoTipo, 3º MatchIA DESC)
    possiveis.sort(key=lambda x: (x['Semestre'], x['PesoTipo'], -x['MatchIA']))
    accepted_codes = set(plan_clean)

    # 4. Regra 3: Preenchimento com Heurística de Turma Ergônomica
    for item in possiveis:
        codigo = item['Codigo']
        dados = item['Dados']
        c = int(dados.get('horas', 0))

        if total_h + c > req.carga_maxima:
            continue

        resultado = alocar_disciplina_com_corequisitos(
            codigo,
            dados,
            slots_ocupados,
            total_h,
            req.carga_maxima,
            hist_clean,
            plan_clean,
            accepted_codes
        )

        if not resultado:
            continue

        codigo_principal, turma_principal, slots_principal, dados_principal = resultado['principal']

        sugestoes_completas.append({
            'codigo': codigo_principal,
            'match': item['MatchIA'],
            'turma_escolhida': turma_principal or '',
            'origem': 'sugestao_ia'
        })
        slots_ocupados.update(slots_principal)
        total_h += int(dados_principal.get('horas', 0))
        accepted_codes.add(codigo_principal)

        for coreq_codigo, coreq_turma, coreq_slots, coreq_data in resultado['coreqs']:
            sugestoes_completas.append({
                'codigo': coreq_codigo,
                'match': 0,
                'turma_escolhida': coreq_turma or '',
                'origem': 'corequisito'
            })
            slots_ocupados.update(coreq_slots)
            total_h += int(coreq_data.get('horas', 0))
            accepted_codes.add(coreq_codigo)

    return {"horas_totais": total_h, "grade": sugestoes_completas}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        log_level="info",
        reload=False
    )