# ==========================================
# 2. MOTOR LÓGICO
# ==========================================
from fastapi.middleware.cors import CORSMiddleware
import re
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
df_base = pd.read_csv(DATA_PATH, sep=';')

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
            return []
        slots = []
        # NOVO: Usa finditer para achar múltiplos blocos na mesma string de turma
        for bloco in re.finditer(r'([2-7]+)([MTN])([1-7]+)', str(horario).strip()):
            dias, turno, horas = bloco.groups()
            for d in dias:
                for h in horas: 
                    slots.append(f"{d}{turno}{h}")
        return slots

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

def escolher_turma(horario_str: str, slots_ocupados: set, horas_necessarias: int) -> tuple:
    """
    Avalia todas as turmas. Só aceita turmas sem choque E que possuam
    a quantidade EXATA (ou superior) de slots que a carga horária exige.
    """
    turmas = [t.strip() for t in str(horario_str).split(',') if t.strip()]
    candidatas = []
    
    # Validação de ferro: 30h = 2 slots | 60h = 4 slots
    slots_esperados = horas_necessarias // 15
    
    for turma in turmas:
        slots = motor.extrair_slots(turma)
        
        # Só aceita a turma se ela preencher a carga horária e não tiver choques
        if slots and len(slots) >= slots_esperados:
            if not any(s in slots_ocupados for s in slots):
                candidatas.append((custo_turma(turma), slots, turma))

    if not candidatas:
        return [], None

    candidatas.sort(key=lambda x: x[0])
    _, slots_best, turma_best = candidatas[0]
    return slots_best, turma_best

# ==========================================
# 4. ENDPOINT DA API
# ==========================================
from pydantic import BaseModel
import math


def gerar_embeddings_hf(textos: list[str]) -> list[list[float]]:
    """Placeholder: retorna embeddings neutros.
    Substituir por implementação real com Hugging Face ou outra API.
    """
    return [[0.0] * 768 for _ in textos]


def cos_sim(v1: list[float], v2: list[float]) -> float:
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0

    dot = sum(x * y for x, y in zip(v1, v2))
    norm1 = math.sqrt(sum(x * x for x in v1))
    norm2 = math.sqrt(sum(y * y for y in v2))
    return dot / (norm1 * norm2) if norm1 and norm2 else 0.0


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
    texto_foco = descricoes_areas.get(req.trilha, descricoes_areas["Explorar"])
    vetor_foco = gerar_embeddings_hf([texto_foco])[0]
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

        match_ia = 0
        if dados.get('Vetor_Ementa') is not None and vetor_foco is not None:
            sim = cos_sim(vetor_foco, dados['Vetor_Ementa'])
            if not math.isnan(sim): match_ia = min(100, max(0, int(sim * 100)))

        possiveis.append({
            'Codigo': cod, 'Semestre': semestre, 'PesoTipo': peso_tipo, 'MatchIA': match_ia, 'Dados': dados
        })
            
    # 3. Regra 2: Ordenação Simples (1º Semestre, 2º PesoTipo, 3º MatchIA DESC)
    possiveis.sort(key=lambda x: (x['Semestre'], x['PesoTipo'], -x['MatchIA']))
    
    # 4. Regra 3: Preenchimento com Heurística de Turma Ergônomica
    for item in possiveis:
        c = int(item['Dados']['horas'])
        if total_h + c <= req.carga_maxima:
            slots_escol, turma_best = escolher_turma(item['Dados']['horario'], slots_ocupados, c)
            
            # CORREÇÃO 2 APLICADA AQUI: O bloco de alocação voltou
            if slots_escol:
                # Inclui a turma escolhida no payload para ser aplicada pelo frontend
                sugestoes_completas.append({
                    'codigo': item['Codigo'],
                    'match': item['MatchIA'],
                    'turma_escolhida': turma_best or '',
                    'origem': 'sugestao_ia'
                })
                # Regista os slots para não haver choques futuros
                slots_ocupados.update(slots_escol)
                total_h += c
                
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