"""Fill the Steinberg ASIO SDK Licensing Agreement (2.0.5) from a JSON file with the licensee's data.
Writes two files to ignored binaries/asio-sdk/ (they contain company/personal data):
  - "... - editable.pdf": form fields still editable (fix a detail in any PDF viewer);
  - "... - to sign.pdf": text baked into the pages, for the digital signature (e.g. gov.br) and email.
The signature itself is NOT added here: the licensee signs before sending.
Usage: python scripts/fill-asio-agreement.py binaries/asio-sdk/licensee.json"""
import json,pathlib,sys,unicodedata
from pypdf import PdfReader,PdfWriter
from pypdf.generic import ArrayObject,NameObject
ROOT=pathlib.Path(__file__).resolve().parents[1]
SOURCE=ROOT/'binaries/asio-sdk/src/ASIOSDK/Steinberg ASIO Licensing Agreement.pdf'
data=json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'))
# Field names come from the PDF form (page 1: licensee; page 8: signatory and technical contact).
# "Text Box 2" on page 8 is Steinberg's own "Date executed" and stays empty.
fields={
 'Text Box 1':data['company'],'Lizence':data['represented_by'],'Text Box 1_2':data['address'],
 'Lizence_2':data['city_zip'],'Lizence_3':data['country'],
 'Text Box 3':data['signatory_name'],'Text Box 4':data['signatory_title'],'Text Box 5':data.get('date_executed',''),
 'Text Box 6':data['tech_name'],'Text Box 7':data['tech_address'],'Text Box 8':data.get('tech_phone',''),
 'Text Box 9':data.get('tech_fax',''),'Text Box 10':data['tech_email']}
# ASCII file name: accented names break some shells, mail clients and signing portals.
name=unicodedata.normalize('NFKD',data['company'].split('\n')[0]).encode('ascii','ignore').decode()
def build(flatten):
    writer=PdfWriter();writer.append(PdfReader(SOURCE))
    for page in writer.pages:
        if '/Annots' in page:writer.update_page_form_field_values(page,fields,auto_regenerate=False,flatten=flatten)
    if flatten:
        # Text is baked into the pages so digital signers and any viewer show it; no form remains.
        for page in writer.pages:
            if '/Annots' in page:page[NameObject('/Annots')]=ArrayObject([a for a in page['/Annots'] if a.get_object().get('/Subtype')!='/Widget'])
        if '/AcroForm' in writer._root_object:del writer._root_object[NameObject('/AcroForm')]
    else:writer.set_need_appearances_writer(True)
    out=ROOT/'binaries/asio-sdk'/(f'Steinberg ASIO Licensing Agreement - {name} - '+('to sign.pdf' if flatten else 'editable.pdf'))
    with out.open('wb') as f:writer.write(f)
    return out
editable=build(False);final=build(True)
check=PdfReader(editable).get_fields()
missing=[k for k,v in fields.items() if v and (check.get(k,{}).get('/V') or '')!=v]
print(editable);print(final);print('missing fields:',missing or 'none')
