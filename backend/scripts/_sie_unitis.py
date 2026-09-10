import requests
import pandas as pd
import json
from requests.auth import HTTPBasicAuth
import time
from datetime import datetime
import logging
import asyncpg
import asyncio
import math

# Configuração de logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class SiengeUnitsPostgresExtractor:
    def __init__(self, username, password, db_config):
        self.username = username
        self.password = password
        self.db_config = db_config
        self.base_url = "https://api.sienge.com.br/tostesediniz/public/api/v1/units"
        self.auth = HTTPBasicAuth(username, password)
        self.session = requests.Session()
        self.session.auth = self.auth
        
    async def create_tables(self):
        """Cria as tabelas no PostgreSQL"""
        conn = await asyncpg.connect(**self.db_config)
        
        try:
            # Drop e recria tabelas para garantir estrutura correta
            await conn.execute('DROP TABLE IF EXISTS sie_units_links CASCADE')
            await conn.execute('DROP TABLE IF EXISTS sie_units_special_values CASCADE')
            await conn.execute('DROP TABLE IF EXISTS sie_units_groupings CASCADE')
            await conn.execute('DROP TABLE IF EXISTS sie_units_child_units CASCADE')
            await conn.execute('DROP TABLE IF EXISTS sie_units CASCADE')
            
            # Tabela principal - sie_units (com campos de evaluation)
            await conn.execute('''
                CREATE TABLE sie_units (
                    id BIGINT PRIMARY KEY,
                    enterprise_id BIGINT,
                    contract_id BIGINT,
                    indexer_id BIGINT,
                    name VARCHAR(200),
                    property_type VARCHAR(100),
                    note TEXT,
                    commercial_stock VARCHAR(20),
                    latitude VARCHAR(100),
                    longitude VARCHAR(100),
                    legal_registration_number VARCHAR(200),
                    floor VARCHAR(50),
                    contract_number VARCHAR(200),
                    delivery_date TIMESTAMP,
                    scheduled_delivery_date TIMESTAMP,
                    private_area DECIMAL(12,4),
                    common_area DECIMAL(12,4),
                    terrain_area DECIMAL(12,4),
                    non_proportional_common_area DECIMAL(12,4),
                    ideal_fraction DECIMAL(15,8),
                    ideal_fraction_square_meter DECIMAL(12,4),
                    general_sale_value_fraction DECIMAL(12,4),
                    terrain_value DECIMAL(18,2),
                    indexed_quantity DECIMAL(12,4),
                    prized_compliance VARCHAR(200),
                    usable_area DECIMAL(12,4),
                    iptu_value DECIMAL(18,2),
                    real_estate_registration VARCHAR(200),
                    evaluation_date TIMESTAMP,
                    evaluation_price DECIMAL(18,2),
                    sale_value_date TIMESTAMP,
                    sale_value_price DECIMAL(18,2),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Tabela sie_units_child_units
            await conn.execute('''
                CREATE TABLE sie_units_child_units (
                    id SERIAL PRIMARY KEY,
                    parent_unit_id BIGINT REFERENCES sie_units(id),
                    child_unit_data JSONB,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Tabela sie_units_groupings
            await conn.execute('''
                CREATE TABLE sie_units_groupings (
                    id SERIAL PRIMARY KEY,
                    unit_id BIGINT REFERENCES sie_units(id),
                    grouping_data JSONB,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Tabela sie_units_special_values
            await conn.execute('''
                CREATE TABLE sie_units_special_values (
                    id SERIAL PRIMARY KEY,
                    unit_id BIGINT REFERENCES sie_units(id),
                    special_value_data JSONB,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Tabela sie_units_links
            await conn.execute('''
                CREATE TABLE sie_units_links (
                    id SERIAL PRIMARY KEY,
                    unit_id BIGINT REFERENCES sie_units(id),
                    rel VARCHAR(200),
                    href VARCHAR(1000),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Índices para performance
            await conn.execute('CREATE INDEX idx_sie_units_enterprise_id ON sie_units(enterprise_id)')
            await conn.execute('CREATE INDEX idx_sie_units_contract_id ON sie_units(contract_id)')
            await conn.execute('CREATE INDEX idx_sie_units_commercial_stock ON sie_units(commercial_stock)')
            await conn.execute('CREATE INDEX idx_sie_units_property_type ON sie_units(property_type)')
            await conn.execute('CREATE INDEX idx_sie_units_floor ON sie_units(floor)')
            
            logger.info("✅ Tabelas para Units criadas com sucesso!")
            
        finally:
            await conn.close()
    
    def fetch_page(self, offset=0, limit=200):
        """Busca uma página específica da API"""
        params = {
            'offset': offset,
            'limit': limit
        }
        
        try:
            logger.info(f"Buscando dados: offset={offset}, limit={limit}")
            response = self.session.get(self.base_url, params=params, timeout=30)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"Erro na requisição: {e}")
            return None
    
    def extract_all_data(self, limit=200):
        """Extrai todos os dados de forma paginada baseado no count total"""
        all_results = []
        offset = 0
        total_count = None
        
        # Primeira requisição para descobrir o total
        logger.info("Fazendo primeira requisição para descobrir total de registros...")
        first_data = self.fetch_page(offset, limit)
        
        if not first_data or 'results' not in first_data:
            logger.error("Erro na primeira requisição ou estrutura inválida")
            return []
        
        # Pega o count total da primeira requisição
        metadata = first_data.get('resultSetMetadata', {})
        total_count = metadata.get('count', 0)
        
        if total_count == 0:
            logger.warning("Nenhum registro encontrado")
            return []
        
        logger.info(f"Total de registros a serem extraídos: {total_count}")
        
        # Calcula quantas páginas serão necessárias
        total_pages = math.ceil(total_count / limit)
        logger.info(f"Serão necessárias {total_pages} páginas com limit={limit}")
        
        # Adiciona os resultados da primeira página
        first_results = first_data['results']
        all_results.extend(first_results)
        logger.info(f"Página 1/{total_pages}: Extraídos {len(first_results)} registros. Total: {len(all_results)}/{total_count}")
        
        # Continua com as demais páginas
        current_page = 2
        offset = limit
        
        while len(all_results) < total_count:
            data = self.fetch_page(offset, limit)
            
            if not data or 'results' not in data:
                logger.warning(f"Erro na página {current_page}, parando extração")
                break
            
            results = data['results']
            if not results:
                logger.info(f"Página {current_page} retornou vazia, finalizando")
                break
            
            all_results.extend(results)
            progress_percent = (len(all_results) / total_count) * 100
            logger.info(f"Página {current_page}/{total_pages}: Extraídos {len(results)} registros. Total: {len(all_results)}/{total_count} ({progress_percent:.1f}%)")
            
            # Verifica se já pegou todos os registros
            if len(all_results) >= total_count:
                logger.info("Todos os registros foram extraídos!")
                break
            
            offset += limit
            current_page += 1
            time.sleep(0.3)
        
        # Verifica se extraiu todos os registros esperados
        if len(all_results) != total_count:
            logger.warning(f"Atenção: Extraídos {len(all_results)} registros, mas esperava {total_count}")
        else:
            logger.info(f"✅ Extração concluída com sucesso! Total: {len(all_results)} registros")
        
        return all_results
    
    def parse_date(self, date_str):
        """Converte string de data para datetime ou None"""
        if not date_str or date_str == 'null' or str(date_str).strip() == '':
            return None
        try:
            # Remove timezone se presente
            date_clean = str(date_str).replace('Z', '+00:00')
            return datetime.fromisoformat(date_clean)
        except:
            try:
                # Tenta outros formatos
                return datetime.strptime(str(date_str), '%Y-%m-%d')
            except:
                logger.warning(f"Não foi possível converter data: {date_str}")
                return None
    
    def safe_truncate(self, value, max_length):
        """Trunca string para não exceder o limite"""
        if value is None:
            return None
        str_value = str(value)
        if len(str_value) > max_length:
            logger.warning(f"Valor truncado de {len(str_value)} para {max_length} caracteres: {str_value[:50]}...")
            return str_value[:max_length]
        return str_value
    
    def safe_numeric(self, value):
        """Converte valor para numérico ou None"""
        if value is None or value == '' or str(value).strip() == '':
            return None
        try:
            return float(value)
        except:
            logger.warning(f"Não foi possível converter para numérico: {value}")
            return None
    
    async def save_to_postgres(self, data):
        """Salva os dados no PostgreSQL"""
        conn = await asyncpg.connect(**self.db_config)
        
        try:
            # Limpa tabelas existentes
            await conn.execute('TRUNCATE TABLE sie_units_links, sie_units_special_values, sie_units_groupings, sie_units_child_units, sie_units RESTART IDENTITY CASCADE')
            logger.info("Tabelas limpas")
            
            # Prepara dados para inserção
            units_data = []
            child_units_data = []
            groupings_data = []
            special_values_data = []
            links_data = []
            
            for record in data:
                # Extrai o objeto evaluation (pode vir None)
                evaluation = record.get('evaluation') or {}
                
                # Validação e preparação dos dados principais
                unit_data = (
                    record.get('id'),
                    record.get('enterpriseId'),
                    record.get('contractId'),
                    record.get('indexerId'),
                    self.safe_truncate(record.get('name'), 200),
                    self.safe_truncate(record.get('propertyType'), 100),
                    record.get('note'),  # TEXT não tem limite
                    self.safe_truncate(record.get('commercialStock'), 20),
                    self.safe_truncate(record.get('latitude'), 100),
                    self.safe_truncate(record.get('longitude'), 100),
                    self.safe_truncate(record.get('legalRegistrationNumber'), 200),
                    self.safe_truncate(record.get('floor'), 50),
                    self.safe_truncate(record.get('contractNumber'), 200),
                    self.parse_date(record.get('deliveryDate')),
                    self.parse_date(record.get('scheduledDeliveryDate')),
                    self.safe_numeric(record.get('privateArea')),
                    self.safe_numeric(record.get('commonArea')),
                    self.safe_numeric(record.get('terrainArea')),
                    self.safe_numeric(record.get('nonProportionalCommonArea')),
                    self.safe_numeric(record.get('idealFraction')),
                    self.safe_numeric(record.get('idealFractionSquareMeter')),
                    self.safe_numeric(record.get('generalSaleValueFraction')),
                    self.safe_numeric(record.get('terrainValue')),
                    self.safe_numeric(record.get('indexedQuantity')),
                    self.safe_truncate(record.get('prizedCompliance'), 200),
                    self.safe_numeric(record.get('usableArea')),
                    self.safe_numeric(record.get('iptuValue')),
                    self.safe_truncate(record.get('realEstateRegistration'), 200),
                    # Campos de evaluation
                    self.parse_date(evaluation.get('evaluationDate')),
                    self.safe_numeric(evaluation.get('evaluationPrice')),
                    self.parse_date(evaluation.get('saleValueDate')),
                    self.safe_numeric(evaluation.get('saleValuePrice'))
                )
                units_data.append(unit_data)
                
                unit_id = record.get('id')
                
                # Child Units
                for child in record.get('childUnits', []):
                    if child:  # Verifica se não é None ou vazio
                        child_units_data.append((unit_id, json.dumps(child)))
                
                # Groupings
                for grouping in record.get('groupings', []):
                    if grouping:  # Verifica se não é None ou vazio
                        groupings_data.append((unit_id, json.dumps(grouping)))
                
                # Special Values
                for special_value in record.get('specialValues', []):
                    if special_value:  # Verifica se não é None ou vazio
                        special_values_data.append((unit_id, json.dumps(special_value)))
                
                # Links
                for link in record.get('links', []):
                    if link and isinstance(link, dict):  # Verifica se é um dict válido
                        links_data.append((
                            unit_id, 
                            self.safe_truncate(link.get('rel'), 200), 
                            self.safe_truncate(link.get('href'), 1000)
                        ))
            
            # Inserção em lote
            if units_data:
                await conn.executemany('''
                    INSERT INTO sie_units (
                        id, enterprise_id, contract_id, indexer_id, name, property_type, 
                        note, commercial_stock, latitude, longitude, legal_registration_number,
                        floor, contract_number, delivery_date, scheduled_delivery_date,
                        private_area, common_area, terrain_area, non_proportional_common_area,
                        ideal_fraction, ideal_fraction_square_meter, general_sale_value_fraction,
                        terrain_value, indexed_quantity, prized_compliance, usable_area,
                        iptu_value, real_estate_registration,
                        evaluation_date, evaluation_price, sale_value_date, sale_value_price
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                             $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28,
                             $29, $30, $31, $32)
                ''', units_data)
                logger.info(f"✅ Inseridas {len(units_data)} unidades")
            
            if child_units_data:
                await conn.executemany('''
                    INSERT INTO sie_units_child_units (parent_unit_id, child_unit_data)
                    VALUES ($1, $2)
                ''', child_units_data)
                logger.info(f"✅ Inseridas {len(child_units_data)} child units")
            
            if groupings_data:
                await conn.executemany('''
                    INSERT INTO sie_units_groupings (unit_id, grouping_data)
                    VALUES ($1, $2)
                ''', groupings_data)
                logger.info(f"✅ Inseridas {len(groupings_data)} groupings")
            
            if special_values_data:
                await conn.executemany('''
                    INSERT INTO sie_units_special_values (unit_id, special_value_data)
                    VALUES ($1, $2)
                ''', special_values_data)
                logger.info(f"✅ Inseridas {len(special_values_data)} special values")
            
            if links_data:
                await conn.executemany('''
                    INSERT INTO sie_units_links (unit_id, rel, href)
                    VALUES ($1, $2, $3)
                ''', links_data)
                logger.info(f"✅ Inseridas {len(links_data)} links")
            
        except Exception as e:
            logger.error(f"Erro ao salvar no PostgreSQL: {e}")
            raise
        finally:
            await conn.close()

async def main():
    # Configurações
    USERNAME = "tostesediniz-gdoisk"
    PASSWORD = "TZa3mfGsASGcANnCvlAVgKN0qvy3gsdt"
    
    DB_CONFIG = {
        "host": "localhost",
        "port": "5432",
        "database": "TED_STG",
        "user": "postgres",
        "password": "#Ed1035ta!"
    }
    
    # Inicializa o extrator
    extractor = SiengeUnitsPostgresExtractor(USERNAME, PASSWORD, DB_CONFIG)
    
    try:
        # Cria as tabelas
        logger.info("🔧 Criando tabelas no PostgreSQL...")
        await extractor.create_tables()
        
        # Extrai todos os dados
        logger.info("🚀 Iniciando extração de TODAS as unidades...")
        all_data = extractor.extract_all_data(limit=200)
        
        if not all_data:
            logger.error("❌ Nenhum dado foi extraído")
            return
        
        # Salva no PostgreSQL
        logger.info("💾 Salvando dados no PostgreSQL...")
        await extractor.save_to_postgres(all_data)
        
        # Estatísticas finais
        enterprise_summary = {}
        for record in all_data:
            enterprise_id = record.get('enterpriseId')
            if enterprise_id:
                if enterprise_id not in enterprise_summary:
                    enterprise_summary[enterprise_id] = {'total': 0, 'vendidas': 0, 'disponiveis': 0}
                enterprise_summary[enterprise_id]['total'] += 1
                status = record.get('commercialStock', '').upper()
                if status == 'V':
                    enterprise_summary[enterprise_id]['vendidas'] += 1
                elif status == 'D':
                    enterprise_summary[enterprise_id]['disponiveis'] += 1
        
        # Relatório final
        print("\n" + "="*70)
        print("🎉 EXTRAÇÃO DE UNITS CONCLUÍDA COM SUCESSO!")
        print("="*70)
        print(f"🏢 Total de empreendimentos: {len(enterprise_summary)}")
        print(f"📊 Total de unidades: {len(all_data)}")
        print(f"💾 Dados salvos no PostgreSQL")
        
        if enterprise_summary:
            print(f"\n📈 RESUMO POR EMPREENDIMENTO:")
            print("-" * 50)
            for enterprise_id, stats in sorted(enterprise_summary.items()):
                print(f"Empreendimento {enterprise_id}: {stats['total']} unidades")
                print(f"  ✅ Vendidas: {stats['vendidas']} | 🟡 Disponíveis: {stats['disponiveis']}")
        
        print("="*70)
        
    except Exception as e:
        logger.error(f"❌ Erro durante a execução: {e}")
        raise

if __name__ == "__main__":
    asyncio.run(main())