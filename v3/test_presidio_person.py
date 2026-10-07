from presidio_analyzer import AnalyzerEngine, RecognizerRegistry
from presidio_analyzer.nlp_engine import NlpEngineProvider
provider = NlpEngineProvider(nlp_configuration={'nlp_engine_name': 'spacy', 'models': [{'lang_code': 'en', 'model_name': 'en_core_web_lg'}]})
analyzer = AnalyzerEngine(nlp_engine=provider.create_engine(), supported_languages=['en'])
res = analyzer.analyze(text='Please contact our support engineer Anjali\nDeshmukh at anjali.deshmukh\n@enterprise.com', language='en', entities=['PERSON'])
print(res)
