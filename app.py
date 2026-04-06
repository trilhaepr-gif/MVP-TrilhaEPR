import streamlit as st
import pandas as pd
from sentence_transformers import SentenceTransformer, util
import re

# ==========================================
# 1. CONFIGURAÇÃO E IA (Cache)
# ==========================================
st.set_page_config(page_title="SAD V4 - Eng. Produção UnB", page_icon="🚀", layout="wide")

@st.cache_resource
def carregar_ia():
    return SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')

modelo_ia = carregar_ia()

@st.cache_data
def carregar_base():
    # Carrega a base consolidada
    df = pd.read_csv('disciplinas.csv')

    # 1. Limpeza de espaços e padronização para maiúsculas
    df['Codigo'] = df['Codigo'].astype(str).str.strip().str.upper()

    # Remove linhas onde Codigo ficou vazio ou virou 'NAN' após limpeza
    df = df[df['Codigo'].notna()]
    df = df[df['Codigo'].str.strip() != '']
    df = df[df['Codigo'].str.upper() != 'NAN']

    # 2. TRATAMENTO DE DUPLICATAS: Garante que cada Código seja único
    # Agrupa e resolve conflitos: une horários e pega o maior crédito
    df = df.groupby('Codigo', as_index=False).agg({
        'Nome':          'first',
        'Tipo':          'first',
        'Pre_Requisitos':'first',
        'Correquisitos': 'first',
        'Equivalencias': 'first',
        'Horario':       lambda x: ', '.join(
                             sorted(set(
                                 v for v in x.astype(str).str.strip()
                                 if v and v.lower() != 'nan'
                             ))
                         ),
        'Credito':       'max',
        'Ementa':        'first'
    })

    # Garantia extra de unicidade (segunda linha de defesa)
    df = df.drop_duplicates(subset='Codigo', keep='first').reset_index(drop=True)

    # 3. Tratamento de tipos e preenchimento de vazios
    df['Credito'] = pd.to_numeric(df['Credito'], errors='coerce').fillna(0).astype(int)
    colunas_texto = ['Nome', 'Tipo', 'Pre_Requisitos', 'Correquisitos',
                     'Equivalencias', 'Horario', 'Ementa']
    df[colunas_texto] = df[colunas_texto].fillna('')

    # 4. Vetorização para IA de Carreira (Apenas Optativas)
    def gerar_vetor(row):
        if row['Tipo'] == 'OPT' and len(str(row['Ementa'])) > 10:
            return modelo_ia.encode(str(row['Ementa']))
        return None

    df['Vetor_Ementa'] = df.apply(gerar_vetor, axis=1)
    return df

# ==========================================
# 2. MOTOR DE LOGICA CURRICULAR
# ==========================================
class MotorSAD:
    def __init__(self, df):
        self.df = df

        # Garante unicidade antes de indexar (terceira linha de defesa)
        df_unique = self.df.drop_duplicates(subset='Codigo', keep='first').copy()

        # Verifica duplicatas residuais e avisa no console (não quebra o app)
        duplicados = self.df[self.df.duplicated(subset='Codigo', keep=False)]
        if not duplicados.empty:
            print(f"[AVISO] Códigos duplicados detectados e removidos: "
                  f"{duplicados['Codigo'].unique().tolist()}")

        self.disciplinas = df_unique.set_index('Codigo').to_dict('index')

    def extrair_slots(self, horario):
        if not horario or 'Não Ofertada' in horario:
            return []
        slots = []
        for h_turma in str(horario).split(','):
            match = re.search(r'([2-7]+)([MTN])([1-7]+)', h_turma.strip())
            if match:
                dias, turno, horas = match.groups()
                for d in dias:
                    for h in horas:
                        slots.append((d, turno, h))
        return slots

    def checar_requisitos(self, expressao, historico):
        if not expressao or str(expressao).strip() == '':
            return True
        exp = str(expressao).replace(',', ' E ').replace('OU', ' or ').replace('E', ' and ')
        codigos = set(re.findall(r'[A-Z]{3}\d{4}', exp))
        for cod in codigos:
            exp = re.sub(rf'\b{cod}\b', str(cod in historico), exp)
        try:
            return eval(exp)
        except Exception:
            return False

    def calcular_score(self, codigo, objetivo_vetor):
        dados = self.disciplinas[codigo]
        score = 0
        # Peso Carreira (IA)
        if dados['Vetor_Ementa'] is not None:
            sim = util.cos_sim(objetivo_vetor, dados['Vetor_Ementa']).item()
            score += sim * 40
        # Peso Noturno
        if 'N' in str(dados['Horario']):
            score += 30
        # Peso Obrigatória (Caminho Crítico)
        if dados['Tipo'] == 'OBRIG':
            score += 30
        return round(max(0, score), 1)

# ==========================================
# 3. INTERFACE STREAMLIT
# ==========================================
st.title("🎒 SAD Engenharia de Produção - V4")
st.markdown("Otimização de grade horária baseada em histórico real e preferência noturna.")

# Carregamento com tratamento de erro amigável
try:
    df_base = carregar_base()
except FileNotFoundError:
    st.error("❌ Arquivo `disciplinas.csv` não encontrado. "
             "Certifique-se de que ele está na raiz do repositório.")
    st.stop()
except Exception as e:
    st.error(f"❌ Erro ao carregar a base de dados: {e}")
    st.stop()

# DEBUG — exibe duplicatas residuais em modo dev (remova em produção)
duplicados_debug = df_base[df_base.duplicated(subset='Codigo', keep=False)]
if not duplicados_debug.empty:
    with st.expander("⚠️ Aviso: códigos duplicados encontrados no CSV (clique para ver)"):
        st.dataframe(duplicados_debug[['Codigo', 'Nome', 'Horario']])

motor = MotorSAD(df_base)

descricoes_areas = {
    "Eng. de Operações":           "Sistemas de produção, manufatura, controle de processos e PCP.",
    "Logística":                   "Cadeia de suprimentos, transporte, estoques e modais.",
    "Pesquisa Operacional/Dados":  "Modelagem matemática, otimização e análise de dados.",
    "Gestão e Economia":           "Finanças, viabilidade econômica e gestão de projetos."
}

# ── SIDEBAR ──────────────────────────────────────────────────────────────────
st.sidebar.header("👤 Histórico e Preferências")

historico_raw = st.sidebar.text_area(
    "Códigos das matérias feitas (separados por vírgula):",
    placeholder="Ex: MAT0025, EPR0056"
)
historico = [c.strip().upper() for c in historico_raw.split(',') if c.strip()]

trilha    = st.sidebar.selectbox("Trilha de Carreira:", list(descricoes_areas.keys()))
carga_max = st.sidebar.slider("Limite de Horas Semestral:", 60, 420, 240, 30)

# ── BOTÃO PRINCIPAL ───────────────────────────────────────────────────────────
if st.sidebar.button("🚀 Otimizar Matrícula", type="primary"):
    vetor_foco = modelo_ia.encode(descricoes_areas[trilha])

    # 1. Filtro de Possibilidades
    possiveis = []
    for cod, dados in motor.disciplinas.items():
        if cod not in historico:
            if motor.checar_requisitos(dados['Pre_Requisitos'], historico):
                if dados['Horario'] and 'Não Ofertada' not in dados['Horario']:
                    score = motor.calcular_score(cod, vetor_foco)
                    possiveis.append({'Codigo': cod, 'Score': score, 'Dados': dados})

    # 2. Ordenação por Score (IA + Noite + Obrigatória)
    possiveis = sorted(possiveis, key=lambda x: x['Score'], reverse=True)

    # 3. Mochila com Conflito de Horário
    grade, slots, total_h = [], [], 0
    for item in possiveis:
        c = item['Dados']['Credito']
        if total_h + c <= carga_max:
            slots_materia = motor.extrair_slots(item['Dados']['Horario'])
            if not any(s in slots for s in slots_materia):
                grade.append(item)
                slots.extend(slots_materia)
                total_h += c

    # 4. Resultados
    if not grade:
        st.warning("Nenhuma disciplina encontrada para os critérios selecionados.")
    else:
        st.subheader(f"📊 Sugestão de Matrícula — {total_h}h sugeridas")
        for m in grade:
            tipo_badge = "🔵" if m['Dados']['Tipo'] == 'OBRIG' else "🟢"
            with st.expander(
                f"{tipo_badge} **{m['Codigo']} — {m['Dados']['Nome']}** "
                f"(Score: {m['Score']})"
            ):
                col1, col2 = st.columns(2)
                col1.write(f"🕒 **Horário:** {m['Dados']['Horario']}")
                col2.write(f"⚖️ **Carga:** {m['Dados']['Credito']}h")
                if m['Dados']['Pre_Requisitos']:
                    st.write(f"📋 **Pré-requisitos:** {m['Dados']['Pre_Requisitos']}")
                if m['Dados']['Ementa']:
                    st.write(f"📖 **Ementa:** {m['Dados']['Ementa']}")
