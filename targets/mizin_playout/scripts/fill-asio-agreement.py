"""Fill the Steinberg ASIO SDK Licensing Agreement (2.0.5) from a JSON file with the licensee's data.
Output goes to ignored binaries/asio-sdk/ (it contains company/personal data). The signature itself is
NOT added here: the licensee prints/signs or applies their own digital signature before sending.
Usage: python scripts/fill-asio-agreement.py binaries/asio-sdk/licensee.json"""
import json,pathlib,sys
from pypdf import PdfReader,PdfWriter
ROOT=pathlib.Path(__file__).resolve().parents[1]
SOURCE=ROOT/'binaries/asio-sdk/src/ASIOSDK/Steinberg ASIO Licensing Agreement.pdf'
data=json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'))
# Field names come from the PDF form (page 1: licensee; page 8: signatory and technical contact).
# "Text Box 2" on page 8 is Steinberg's own "Date executed" and stays empty.
fields={
 'Text Box 1':data['company'],'Lizence':data['represented_by'],'Text Box 1_2':data['address'],
 'Lizence_2':data['city_zip'],'Lizence_3':data['country'],
 'Text Box 3':data['signatory_name'],'Text Box 4':data['signatory_title'],'Text Box 5':data.get('date_executed',''),
 'Text Box 6':data['tech_name'],'Text Box 7':data['tech_address'],'Text Box 8':data['tech_phone'],
 'Text Box 9':data.get('tech_fax',''),'Text Box 10':data['tech_email']}
reader=PdfReader(SOURCE);writer=PdfWriter();writer.append(reader)
for page in writer.pages:writer.update_page_form_field_values(page,fields,auto_regenerate=False)
writer.set_need_appearances_writer(True)
out=ROOT/'binaries/asio-sdk'/('Steinberg ASIO Licensing Agreement - '+data['company'].split('\n')[0]+' - filled.pdf')
with out.open('wb') as f:writer.write(f)
check=PdfReader(out).get_fields()
missing=[k for k,v in fields.items() if v and (check.get(k,{}).get('/V') or '')!=v]
print(out);print('missing fields:',missing or 'none')
