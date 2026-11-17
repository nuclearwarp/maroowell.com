"""Update discontinued K-APT v3/v4 API endpoints in the audited Cloudflare Worker."""
from pathlib import Path
import re,hashlib,sys
MARKER='V757_KAPT_LIVE_V4_V5_ENDPOINTS'
BASE_MARKER='V756_EXCLUSIVE_BUCKET_PARTIAL_DEDUPE'
REPLACEMENTS={
 'KAPT_LEGAL_DONG_LIST_URL':'https://apis.data.go.kr/1613000/AptListService4/getLegaldongAptList4',
 'KAPT_BASIC_INFO_URL':'https://apis.data.go.kr/1613000/AptBasisInfoServiceV5/getAphusBassInfoV5',
 'KAPT_DETAIL_INFO_URL':'https://apis.data.go.kr/1613000/AptBasisInfoServiceV5/getAphusDtlInfoV5',
}
def patch(source):
    if MARKER in source: return source
    if BASE_MARKER not in source:raise ValueError('Expected V75.6 worker, manual review needed')
    for const_name,new_url in REPLACEMENTS.items():
        pat=r'(?m)(const '+re.escape(const_name)+r'\s*=\s*)"https://[^"]+"'
        source,n=re.subn(pat,lambda m:m.group(1)+'"'+new_url+'"',source,count=1)
        if n!=1:raise ValueError('Missing/ambiguous '+const_name)
    return source.rstrip()+'\n\n// '+MARKER+'\n'
if __name__=='__main__':
    src=Path(sys.argv[1]).read_text(encoding='utf-8')
    out=patch(src)
    Path(sys.argv[2]).write_text(out,encoding='utf-8')
    print('V75.7',hashlib.sha256(out.encode()).hexdigest())
