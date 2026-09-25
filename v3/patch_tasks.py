with open('backend/app/tasks/redaction_tasks.py', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('job.status = JobStatus.COMPLETED\n        # We store the result path', 'job.status = JobStatus.COMPLETED\n        job.error_message = redacted_storage_key\n        # We store the result path')

with open('backend/app/tasks/redaction_tasks.py', 'w', encoding='utf-8') as f:
    f.write(content)
