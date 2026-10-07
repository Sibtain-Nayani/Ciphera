import spacy
nlp = spacy.load('en_core_web_lg')
doc = nlp('Please contact our support engineer Anjali\nDeshmukh at anjali.deshmukh\n@enterprise.com')
print([(ent.text, ent.label_) for ent in doc.ents])
