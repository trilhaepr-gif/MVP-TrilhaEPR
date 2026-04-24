from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
from huggingface_hub import InferenceClient
import os
import re
import math

def cos_sim(a, b):
    if not a or not b: return 0.0
    dot = sum(x*y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x*x for x in a))
    norm_b = math.sqrt(sum(y*y for y in b))
    if norm_a == 0 or norm_b == 0: return 0.0
    return dot / (norm_a * norm_b)

app = FastAPI(title="SAD Engenharia de Produção API - V7 Final")

# Configuração de CORS para permitir que qualquer site acesse a API
# Num ambiente real de produção empresarial, você limitaria isto ao domínio do seu GitHub Pages.
# Mas para o MVP, vamos deixar aberto para facilitar.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Permite todas as origens
    allow_credentials=False, # O FastAPI exige False quando allow_origins=["*"]
    allow_methods=["*"], # Permite todos os métodos (GET, POST, etc.)
    allow_headers=["*"], # Permite todos os cabeçalhos
)

# ==========================================
# 1. CARREGAMENTO E VETORIZAÇÃO (Cérebro)
# ==========================================
print("Carregando IA via Hugging Face e Banco de Dados...")
HF_TOKEN = os.getenv("HF_TOKEN")
# Removemos requests e instanciamos o cliente oficial (que trata as rotas sozinho)
try:
    hf_client = InferenceClient(token=HF_TOKEN.replace('"', '').strip() if HF_TOKEN else None)
except Exception as e:
    print(f"Erro ao instanciar HF Client: {e}")
    hf_client = None

def gerar_embeddings_hf(textos):
    if not hf_client:
        return [[0.0] * 384 for _ in range(len(textos))]
    
    try:
        # A própria biblioteca sabe que url chamar para o modelo selecionado
        resposta = hf_client.feature_extraction(
            text=textos, 
            model="sentence-transformers/all-MiniLM-L12-v2"
        )
        # Converte o array retornado para o formato lista de listas
        return resposta.tolist() if hasattr(resposta, 'tolist') else resposta
    except Exception as e:
        print(f"Erro na API Hugging Face (SDK): {e}")
        return [[0.0] * 384 for _ in range(len(textos))]

def carregar_base():
    try:
        df = pd.read_csv('disciplinas.csv')
    except FileNotFoundError:
        print("⚠️ ERRO: Arquivo disciplinas.csv não encontrado!")
        return pd.DataFrame()

    # Proteção: Se a coluna ementa tiver sido removida na limpeza do CSV, usamos o nome
    if 'ementa' not in df.columns:
        df['ementa'] = df['nome'] if 'nome' in df.columns else ''

    # Limpeza e Agrupamento
    df['codigo'] = df['codigo'].astype(str).str.strip().str.upper()
    df = df[df['codigo'].notna() & (df['codigo'] != '') & (df['codigo'] != 'NAN')]
    
    df = df.groupby('codigo', as_index=False).agg({
        'nome': 'first', 
        'area': 'first',
        'tipo': 'first', 
        'requisitos': 'first',
        'corequisitos': 'first', 
        'horario': lambda x: ', '.join(sorted(set(v for v in x.astype(str).str.strip() if v and v.lower() != 'nan'))),
        'horas': 'max', 
        'ementa': 'first',
        'semestre': 'first'
    })

    df['horas'] = pd.to_numeric(df['horas'], errors='coerce').fillna(0).astype(int)
    df['semestre'] = pd.to_numeric(df['semestre'], errors='coerce').fillna(98).astype(int)
    colunas_texto = ['nome', 'area', 'tipo', 'requisitos', 'corequisitos', 'horario', 'ementa']
    df[colunas_texto] = df[colunas_texto].fillna('')

    print("Vetorizando ementas (isto pode levar alguns segundos)...")

    def preparar_texto_para_nlp(row):
        nome = str(row.get('nome', '')).strip()
        area = str(row.get('area', '')).strip()
        ementa = str(row.get('ementa', '')).strip()
        
        # Tratamento para ementas vazias (NaN, None, espaços)
        if ementa.lower() in ['nan', 'none', '']:
            ementa_texto = "Sem descrição detalhada."
        else:
            ementa_texto = ementa
            
        # Concatenação rica para o MiniLM
        return f"Disciplina: {nome}. Área de Conhecimento: {area}. Conteúdo: {ementa_texto}"

    df['texto_nlp'] = df.apply(preparar_texto_para_nlp, axis=1)

    # Usando a API Hugging Face em lotes (batch) para eficiência
    vetores_finais = []
    textos_validos = []
    
    for txt in df['texto_nlp']:
        texto_str = str(txt)
        textos_validos.append(texto_str if len(texto_str) > 10 else None)
        
    para_processar = [t for t in textos_validos if t is not None]
    print(f"Enviando {len(para_processar)} ementas para a Hugging Face API...")
    
    resultados = []
    if para_processar:
        for i in range(0, len(para_processar), 50):
            lote = para_processar[i:i+50]
            res_lote = gerar_embeddings_hf(lote)
            resultados.extend(res_lote)
            print(f"Processado batch: {min(i+50, len(para_processar))}/{len(para_processar)}")
            
    idx_res = 0
    for txt in textos_validos:
        if txt is not None and idx_res < len(resultados):
            vetores_finais.append(resultados[idx_res])
            idx_res += 1
        else:
            vetores_finais.append(None)
            
    df['Vetor_Ementa'] = vetores_finais
    return df

df_base = carregar_base()

# ==========================================
# 2. MOTOR LÓGICO
# ==========================================
class MotorSAD:
    CADEIAS = [ ["ENM0131", "ENM0190"], ["MAT0127", "MAT0031"], ["ENE0334", "CIC0007"], ["ENC0035", "ENC0132"] ]

    def __init__(self, df):
        # O índice agora é 'codigo' (minúsculo, mas processado para maiúsculo)
        self.disciplinas = df.set_index('codigo').to_dict('index') if not df.empty else {}
        self.impacto_futuro = self._calcular_impacto_futuro()

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
        for h_turma in str(horario).split(','):
            match = re.search(r'([2-7]+)([MTN])([1-7]+)', h_turma.strip())
            if match:
                dias, turno, horas = match.groups()
                for d in dias:
                    for h in horas: slots.append(f"{d}{turno}{h}")
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
# 3. HEURÍSTICA DE SELEÇÃO DE TURMA (VERSÃO LIMPA)
# ==========================================
def custo_turma(turma_str: str) -> float:
    """
    Calcula o custo apenas por turno (N > T > M).
    Dias da semana (2-7) são tratados com peso igual.
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

def escolher_turma(horario_str: str, slots_ocupados: set) -> tuple:
    """
    Avalia todas as turmas (separadas por vírgula) de uma disciplina.
    Só aceita turmas sem nenhum choque de slot.
    Retorna (slots_escolhidos, turma_str) da turma de menor custo.
    Retorna ([], None) se não houver nenhuma turma disponível.
    """
    turmas = [t.strip() for t in str(horario_str).split(',') if t.strip()]
    candidatas = []
    for turma in turmas:
        slots = motor.extrair_slots(turma)
        if slots and not any(s in slots_ocupados for s in slots):
            candidatas.append((custo_turma(turma), slots, turma))

    if not candidatas:
        return [], None

    candidatas.sort(key=lambda x: x[0])
    _, slots_best, turma_best = candidatas[0]
    return slots_best, turma_best

# ==========================================
# 4. ENDPOINT DA API
# ==========================================
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
    
    # 1. Setup Base: Usa a turma EXACTA que o Frontend está a desenhar (Fonte Única de Verdade)
    slots_ocupados = set()
    total_h = 0
    for item in plan_items:
        cod = item['codigo']
        turma_fixa = item['turma']
        if cod in motor.disciplinas:
            if turma_fixa:
                # Usa exactamente a turma que o JS está a renderizar
                slots_fixos = motor.extrair_slots(turma_fixa)
                slots_ocupados.update(slots_fixos)
            else:
                # Fallback: heurística própria (caso venha de versão antiga do frontend)
                horario = motor.disciplinas[cod].get('horario', '')
                slots_escol, _ = escolher_turma(horario, slots_ocupados)
                slots_ocupados.update(slots_escol)
            total_h += int(motor.disciplinas[cod].get('horas', 0))

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
            cadeia = next((c for c in motor.CADEIAS if cod in c), None)
            if cadeia is None: 
                peso_tipo = 0
            else:
                if any(c_cod in hist_clean for c_cod in cadeia): continue
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
    sugestoes_completas = []
    for item in possiveis:
        c = int(item['Dados']['horas'])
        if total_h + c <= req.carga_maxima:
            slots_escol, turma_best = escolher_turma(item['Dados']['horario'], slots_ocupados)
            if slots_escol:
                # Inclui a turma escolhida no payload para ser aplicada pelo frontend
                sugestoes_completas.append({
                    "codigo": item['Codigo'],
                    "match": item['MatchIA'],
                    "turma_escolhida": turma_best
                })
                slots_ocupados.update(slots_escol)
                total_h += c
                
    return {"horas_totais": total_h, "grade": sugestoes_completas}
