import urllib.request, json

req = urllib.request.Request('http://127.0.0.1:8000/api/v1/auth/token/', data=json.dumps({'username':'project.manager.demo@erp.local','password':'DummyPass123!'}).encode('utf-8'), headers={'Content-Type':'application/json'})
with urllib.request.urlopen(req) as resp:
    token = json.loads(resp.read().decode('utf-8'))['access']

endpoints = [
    '/api/v1/crm/customer-inquiries/?page_size=5',
    '/api/v1/crm/inquiry-requirements/?page_size=5',
    '/api/v1/crm/cost-estimates/?page_size=5',
    '/api/v1/crm/cost-estimate-lines/?page_size=5',
    '/api/v1/sales/quotations/?page_size=5',
    '/api/v1/sales/quotation-lines/?page_size=5',
    '/api/v1/crm/quotation-deliveries/?page_size=5',
    '/api/v1/crm/opportunities/?page_size=5',
    '/api/v1/crm/credit-status-snapshots/?page_size=5',
    '/api/v1/sales/orders/?page_size=5',
    '/api/v1/sales/order-lines/?page_size=5',
    '/api/v1/crm/feedbacks/?page_size=5',
    '/api/v1/projects/projects/?page_size=5',
    '/api/v1/projects/stage-gates/?page_size=5',
    '/api/v1/projects/tasks/?page_size=5',
    '/api/v1/projects/milestones/?page_size=5',
    '/api/v1/projects/material-requests/?page_size=5',
    '/api/v1/projects/timesheets/?page_size=5',
    '/api/v1/projects/equipment-logs/?page_size=5',
    '/api/v1/projects/cost-summaries/?page_size=5',
    '/api/v1/projects/technical-briefs/?page_size=5',
    '/api/v1/projects/members/?page_size=5',
    '/api/v1/finance/billing-documents/?page_size=5',
    '/api/v1/finance/billing-document-lines/?page_size=5',
    '/api/v1/finance/payments/?page_size=5',
    '/api/v1/finance/bank-accounts/?page_size=5',
    '/api/v1/finance/accounts/?page_size=5',
    '/api/v1/finance/journal-entries/?page_size=5',
    '/api/v1/finance/fiscal-periods/?page_size=5',
    '/api/v1/finance/tax-transactions/?page_size=5',
    '/api/v1/procurement/purchase-orders/?page_size=5',
    '/api/v1/finance/bank-statements/?page_size=5',
    '/api/v1/finance/project-fundings/?page_size=5',
    '/api/v1/finance/project-cost-entries/?page_size=5',
    '/api/v1/finance/billing-proposals/?page_size=5',
    '/api/v1/master-data/parties/?page_size=5',
    '/api/v1/master-data/products/?page_size=5',
    '/api/v1/master-data/warehouses/?page_size=5',
    '/api/v1/master-data/customer-profiles/?page_size=5',
    '/api/v1/core/companies/?page_size=5'
]

lines = []
for ep in endpoints:
    try:
        req_ep = urllib.request.Request('http://127.0.0.1:8000' + ep, headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/json'})
        with urllib.request.urlopen(req_ep) as r:
            lines.append(f'OK 200 -> {ep}')
    except urllib.error.HTTPError as e:
        lines.append(f'FAIL {e.code} -> {ep}')
    except Exception as e:
        lines.append(f'ERR -> {ep} {e}')

with open('audit_results.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))
