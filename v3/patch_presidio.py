def patch_presidio():
    with open('backend/feature1_pipeline_upgrade.py', 'r', encoding='utf-8') as f:
        content = f.read()

    old_logic = """        self.analyzer = AnalyzerEngine(
            nlp_engine=provider.create_engine(),
            supported_languages=["en"],
        )
        self._add_custom()
        logger.info("Presidio: %d recognizers", len(self.analyzer.registry.recognizers))"""

    new_logic = """        self.analyzer = AnalyzerEngine(
            nlp_engine=provider.create_engine(),
            supported_languages=["en"],
        )
        self._add_custom()
        
        # Disable Presidio's internal context mechanism to prevent double-boosting 
        # and un-bounded context bleeds, since Ciphera uses its own apply_context_scoring
        for rec in self.analyzer.registry.recognizers:
            rec.context = []
            
        logger.info("Presidio: %d recognizers", len(self.analyzer.registry.recognizers))"""

    new_content = content.replace(old_logic, new_logic)
    
    if new_content == content:
        print("PATCH FAILED")
    else:
        with open('backend/feature1_pipeline_upgrade.py', 'w', encoding='utf-8') as f:
            f.write(new_content)
        print("PATCH SUCCESSFUL")

patch_presidio()
