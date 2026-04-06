import streamlit as st
import pandas as pd
from sentence_transformers import SentenceTransformer, util
import re

# ==========================================
# 1. CONFIGURAÇÃO DA PÁGINA
# ==========================================
st.set_page_config(page_title="SAD V4 - Eng. Produção UnB", page_icon="🚀", layout="wide")
st.title("🎒 Sistema de Apoio à Decisão (SAD) - V4")
st.markdown("Planejamento de matrícula otimizado para o perfil noturno e trilhas de carreira.")

# ==========================================
# 2. CARREGAMENTO DA IA E DADOS (Cache)
# ==========================================
@st.cache_resource
def carregar_ia():
    # Modelo leve e multilingue para entender as ementas
    return SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')

modelo_ia = carregar_ia()

@st.cache_data
def carregar_base():
    # Carrega o seu novo "Super CSV" unificado
    df = pd.read_csv('disciplinas.csv')
    df.fillna('', inplace=True)
    
    # Padroniza créditos como número
    df['Credito'] = pd.to_numeric(df['Credito'], errors='coerce').fillna(0).astype(int)
    
    # Vetoriza apenas as OPTATIVAS para economizar memória e tempo
    def gerar_vetor(row):
        if row['Tipo'] == 'OPT' and len(str(row['Ementa'])) > 10:
            return modelo_ia.encode(str(row['Ementa']))
        return None
        
    df['Vetor_Ementa'] = df.apply(gerar_vetor, axis=1)
    return df

# ==========================================
# 3. CLASSE DO MOTOR DE CÁLCULO
# ==========================================
class MotorSAD:
    def __init__(self, df):
        self.df = df
        self.disciplinas = self.df.set_index('Codigo').to_dict('index')

    def extrair_slots(self, horario):
        """Converte códigos SIGAA em slots de tempo (dia, turno, hora)."""
        if not horario or horario == 'Não Ofertada':
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
        """Avalia se o aluno pode cursar a matéria (Lógica Booleana)."""
        if not expressao or expressao == '':
            return True
        exp = str(expressao).replace(',', ' E ').replace('OU', ' or ').replace('E', ' and ')
        codigos = set(re.findall(r'[A-Z]{3}\d{4}', exp))
        for cod in codigos:
            # Checa presença no histórico (ou equivalentes no futuro)
            status = cod in historico
            exp = re.sub(rf'\b{cod}\b', str(status), exp)
        try:
            return eval(exp)
        except:
            return False

    def calcular_prioridade(self, codigo, objetivo_vetor):
        """Calcula o Score Final: IA (40%) + Noite (30%) + Caminho Crítico (30%)"""
        dados = self.disciplinas[codigo]
        score = 0
        
        # 1. Match de Carreira (IA)
        if dados['Vetor_Ementa'] is not None:
            sim = util.cos_sim(objetivo_vetor, dados['Vetor_Ementa']).item()
            score += max(0, sim * 40)
            
        # 2. Preferência Noturna
        if 'N' in str(dados['Horario']):
            score += 30
            
        # 3. Caminho Crítico (Obrigatórias têm peso base maior)
        if dados['Tipo'] == 'OBRIG':
            score += 30
            
        return round(score, 1)

# ==========================================
# 4. INTERFACE E LÓGICA PRINCIPAL
# ==========================================
df_base = carregar_base()
motor = MotorSAD(df_base)

# Definições de áreas para a IA
descricoes_areas = {
    "Eng. de Operações": "Sistemas de produção, manufatura e PCP.",
    "Logística": "Cadeia de suprimentos, transporte e estoque.",
    "Dados e Pesquisa Operacional": "Otimização, modelos matemáticos e estatística.",
    "Gestão e Projetos": "Estratégia, sistemas de informação e projetos."
}

# SIDEBAR
st.sidebar.header("👤 Seu Perfil")
historico_input = st.sidebar.text_area("Insira os códigos das matérias concluídas (separados por vírgula):", 
                                      help="Ex: MAT0025, EPR0056, IFD0171")
historico = [c.strip().upper() for c in historico_input.split(',') if c.strip()]

st.sidebar.divider()
st.sidebar.header("🎯 Preferências")
trilha = st.sidebar.selectbox("Trilha de Carreira:", list(descricoes_areas.keys()))
carga_max = st.sidebar.slider("Carga Horária Máxima (h):", 60, 420, 240, 30)

if st.sidebar.button("🚀 Otimizar Minha Grade", type="primary"):
    vetor_objetivo = modelo_ia.encode(descricoes_areas[trilha])
    
    # FILTRAGEM: O que é possível cursar?
    possiveis = []
    for cod, dados in motor.disciplinas.items():
        if cod not in historico:
            if motor.checar_requisitos(dados['Pre_Requisitos'], historico):
                if dados['Horario'] != 'Não Ofertada':
                    score = motor.calcular_prioridade(cod, vetor_objetivo)
                    possiveis.append({'Codigo': cod, 'Score': score, 'Dados': dados})
    
    # ORDENAÇÃO POR SCORE
    possiveis = sorted(possiveis, key=lambda x: x['Score'], reverse=True)
    
    # MONTAGEM DA GRADE (Mochila + Conflitos)
    grade_final = []
    slots_ocupados = []
    horas_totais = 0
    
    for item in possiveis:
        h = item['Dados']['Horario']
        c = item['Dados']['Credito']
        
        if horas_totais + c <= carga_max:
            if not any(slot in slots_ocupados for slot in motor.extrair_slots(h)):
                grade_final.append(item)
                slots_ocupados.extend(motor.extrair_slots(h))
                horas_totais += c
                
    # EXIBIÇÃO DOS RESULTADOS
    if not grade_final:
        st.warning("Não foi possível encontrar matérias que atendam aos requisitos e restrições de horário.")
    else:
        st.subheader(f"✅ Sugestão de Grade Otimizada ({horas_totais}h / {carga_max}h)")
        
        for item in grade_final:
            with st.expander(f"**{item['Codigo']} - {item['Dados']['Nome']}** (Score: {item['Score']})"):
                col_a, col_b = st.columns(2)
                col_a.write(f"🕒 **Horário:** {item['Dados']['Horario']}")
                col_a.write(f"📚 **Tipo:** {item['Dados']['Tipo']}")
                col_b.write(f"⚖️ **Créditos:** {item['Dados']['Credito']}h")
                st.write(f"📖 **Ementa:** {item['Dados']['Ementa']}")
